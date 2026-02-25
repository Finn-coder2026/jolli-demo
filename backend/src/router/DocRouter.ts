import { auditLog, computeAuditChanges } from "../audit";
import { getConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import type { PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { Doc, NewDoc } from "../model/Doc";
import { computeServerPathFromParent } from "../services/FolderResolutionService";
import { createSectionPathService } from "../services/SectionPathService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { getOptionalUserId, getUserId, handleLookupError, isLookupError } from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Router } from "express";
import { DEFAULT_WORKSPACE, jrnParser, ROOT_WORKSPACE, type SyncInfo, type UserInfo } from "jolli-common";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

/**
 * Generates a unique fileId for sync articles.
 * Format: {slug}-{timestamp}{random}
 */
/* v8 ignore start - only called when creating web docs without JRN, covered by integration tests */
function generateSyncFileId(title: string): string {
	const slug = generateSlug(title);
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).slice(2, 6);
	return `${slug}-${timestamp}${random}`;
}
/* v8 ignore stop */

/**
 * Extracts the filename from a serverPath.
 * "docs/guide/intro.md" -> "intro.md"
 * "intro.md" -> "intro.md"
 */
function extractFilename(serverPath: string): string {
	const lastSlash = serverPath.lastIndexOf("/");
	/* v8 ignore next - serverPath without slash is rare edge case */
	return lastSlash === -1 ? serverPath : serverPath.substring(lastSlash + 1);
}

/** Business error keywords for move operations */
const MOVE_BUSINESS_ERROR_KEYWORDS = ["circular", "itself", "descendant", "not found", "deleted", "must be"];

/**
 * Validates that a value is null, undefined, or a positive integer.
 * Returns an error message if validation fails, or null if valid.
 */
function validateNullablePositiveInt(value: unknown, fieldName: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value !== "number") {
		return `Invalid ${fieldName}: must be a number or null`;
	}
	if (!Number.isInteger(value) || value <= 0) {
		return `Invalid ${fieldName}: must be a positive integer`;
	}
	return null;
}

/**
 * Checks if an error message indicates a business error for move operations.
 */
function isMoveBusinessError(errorMsg: string): boolean {
	return MOVE_BUSINESS_ERROR_KEYWORDS.some(keyword => errorMsg.includes(keyword));
}

export function createDocRouter(
	docDaoProvider: DaoProvider<DocDao>,
	docDraftDaoProvider: DaoProvider<DocDraftDao>,
	tokenUtil: TokenUtil<UserInfo>,
	permissionMiddleware: PermissionMiddlewareFactory,
	syncArticleDaoProvider?: DaoProvider<SyncArticleDao>,
): Router {
	const router = express.Router();

	async function markSyncDocDeleted(doc: Doc, docDao: DocDao, syncJrnPrefix: string): Promise<void> {
		if (!doc.jrn.startsWith(syncJrnPrefix)) {
			return;
		}

		const deletedAt = new Date();
		/* v8 ignore next 3 - optional chaining and nullish coalescing fallbacks */
		const existingSync = (doc.contentMetadata as { sync?: SyncInfo } | undefined)?.sync;
		const fileId = existingSync?.fileId ?? doc.jrn.slice(syncJrnPrefix.length);
		let serverPath = existingSync?.serverPath;
		/* v8 ignore start - fallback path when sync metadata lacks serverPath, rare edge case */
		if (!serverPath) {
			const title = (doc.contentMetadata as { title?: string } | undefined)?.title ?? doc.slug ?? "untitled";
			const filename = `${generateSlug(title)}.md`;
			serverPath = await computeServerPathFromParent(doc.parentId ?? undefined, filename, docDao);
		}
		/* v8 ignore stop */
		const syncMeta: SyncInfo = {
			...existingSync,
			fileId,
			serverPath,
			deleted: true,
			deletedAt: deletedAt.getTime(),
		};

		const updated = await docDao.updateDoc({
			...doc,
			contentMetadata: {
				...doc.contentMetadata,
				sync: syncMeta,
			},
			version: doc.version + 1,
			deletedAt,
			explicitlyDeleted: true,
		});

		/* v8 ignore start - defensive check, updateDoc rarely fails */
		if (!updated) {
			log.warn("Failed to mark sync delete metadata for %s", doc.jrn);
		}
		/* v8 ignore stop */

		if (syncArticleDaoProvider) {
			const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
			await syncArticleDao.advanceCursor(doc.jrn);
		}
	}

	router.get("/", permissionMiddleware.requirePermission("articles.view"), async (req, res) => {
		const docDao = docDaoProvider.getDao(getTenantContext());
		const startsWithJrn = typeof req.query.startsWithJrn === "string" ? req.query.startsWithJrn : undefined;
		const includeRoot = req.query.includeRoot === "true";
		const options: { startsWithJrn?: string; includeRoot?: boolean } = { includeRoot };
		if (startsWithJrn) {
			options.startsWithJrn = startsWithJrn;
		}
		const docs = await docDao.listDocs(options);
		res.json(docs);
	});

	router.post("/", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const config = getConfig();
			const syncJrnPrefix = config.SYNC_JRN_PREFIX;
			const docDao = docDaoProvider.getDao(getTenantContext());
			const userId = getOptionalUserId(tokenUtil, req);
			const newDoc = req.body as NewDoc;

			// For non-folder docs without a JRN, generate a sync-compatible JRN
			// This allows all web-created docs to be synced via CLI
			// Set createdBy and updatedBy from authenticated user ID (if available)
			// Use "anonymous" as fallback when user is not authenticated
			/* v8 ignore next - anonymous fallback when user is not authenticated */
			const userIdStr = userId !== undefined ? userId.toString() : "anonymous";
			let docToCreate: NewDoc;
			/* v8 ignore start - web doc creation without JRN, covered by integration tests */
			if (!newDoc.jrn && newDoc.docType !== "folder") {
				const title = (newDoc.contentMetadata as { title?: string })?.title ?? "untitled";
				const fileId = generateSyncFileId(title);
				const jrn = `${syncJrnPrefix}${fileId}`;

				// Compute serverPath from parentId (if any) for sync tracking
				const filename = `${generateSlug(title)}.md`;
				const serverPath = await computeServerPathFromParent(newDoc.parentId, filename, docDao);

				// Add sync metadata
				const syncInfo: SyncInfo = {
					fileId,
					serverPath,
				};

				docToCreate = {
					...newDoc,
					jrn,
					createdBy: userIdStr,
					updatedBy: userIdStr,
					contentMetadata: {
						...newDoc.contentMetadata,
						sync: syncInfo,
					},
				};
			} else {
				/* v8 ignore stop */
				// For folders or docs with existing JRN, just set createdBy and updatedBy
				docToCreate = {
					...newDoc,
					createdBy: userIdStr,
					updatedBy: userIdStr,
				};
			}

			const doc = await docDao.createDoc(docToCreate);

			// Register in sync_articles for cursor tracking (if sync article)
			/* v8 ignore start - sync article registration, requires syncArticleDaoProvider */
			if (syncArticleDaoProvider && doc.jrn.startsWith(syncJrnPrefix)) {
				const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
				await syncArticleDao.advanceCursor(doc.jrn);
				log.info("Registered new sync article: %s", doc.jrn);
			}
			/* v8 ignore stop */

			// Audit log document creation
			auditLog({
				action: "create",
				resourceType: "doc",
				resourceId: doc.jrn,
				/* v8 ignore next */
				resourceName: doc.contentMetadata?.title || doc.jrn,
				/* v8 ignore next */
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(null, doc as unknown as Record<string, unknown>, "doc"),
			});

			res.status(201).json(doc);
		} catch (error) {
			log.error(error, "Failed to create document: %O", req.body);
			res.status(400).json({ error: "Failed to create document" });
		}
	});

	router.get("/id/:id", permissionMiddleware.requirePermission("articles.view"), async (req, res) => {
		const id = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(id)) {
			return res.status(400).json({ error: "Invalid document ID" });
		}
		const docDao = docDaoProvider.getDao(getTenantContext());
		const doc = await docDao.readDocById(id);
		if (doc) {
			res.json(doc);
		} else {
			res.status(404).json({ error: "Document not found" });
		}
	});

	router.get("/:jrn", permissionMiddleware.requirePermission("articles.view"), async (req, res) => {
		const docDao = docDaoProvider.getDao(getTenantContext());
		const doc = await docDao.readDoc(req.params.jrn);
		if (doc) {
			res.json(doc);
		} else {
			res.status(404).json({ error: "Document not found" });
		}
	});

	router.put("/:jrn", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const config = getConfig();
			const syncJrnPrefix = config.SYNC_JRN_PREFIX;
			const docDao = docDaoProvider.getDao(getTenantContext());
			const userId = getOptionalUserId(tokenUtil, req);

			// Read existing doc for change tracking
			const existingDoc = await docDao.readDoc(req.params.jrn);

			// For sync articles: update serverPath if parentId changed
			let updateBody = req.body as Doc;
			if (existingDoc?.jrn.startsWith(syncJrnPrefix) && updateBody.parentId !== existingDoc.parentId) {
				const syncMeta = existingDoc.contentMetadata?.sync as SyncInfo | undefined;
				if (syncMeta?.serverPath && syncMeta?.fileId) {
					// Extract filename from existing serverPath
					const filename = extractFilename(syncMeta.serverPath);
					// Compute new serverPath from new parentId
					const newServerPath = await computeServerPathFromParent(updateBody.parentId, filename, docDao);

					/* v8 ignore start - sync serverPath update logging, covered by integration tests */
					log.info(
						"Updating serverPath for %s: '%s' -> '%s' (parentId: %s -> %s)",
						existingDoc.jrn,
						syncMeta.serverPath,
						newServerPath,
						existingDoc.parentId ?? "root",
						updateBody.parentId ?? "root",
					);
					/* v8 ignore stop */

					// Merge new serverPath into contentMetadata.sync
					updateBody = {
						...updateBody,
						contentMetadata: {
							...existingDoc.contentMetadata,
							...updateBody.contentMetadata,
							sync: {
								...syncMeta,
								serverPath: newServerPath,
							},
						},
					};
				}
			}

			const doc = await docDao.updateDoc(updateBody);

			if (doc) {
				// If this is a sync article, advance cursor so CLI sees the change
				if (syncArticleDaoProvider && doc.jrn.startsWith(syncJrnPrefix)) {
					const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
					await syncArticleDao.advanceCursor(doc.jrn);
					log.info("Advanced sync cursor for %s", doc.jrn);
				}

				// Audit log document update
				auditLog({
					action: "update",
					resourceType: "doc",
					resourceId: doc.jrn,
					/* v8 ignore next */
					resourceName: doc.contentMetadata?.title || doc.jrn,
					/* v8 ignore next */
					actorId: typeof userId === "number" ? userId : null,
					changes: computeAuditChanges(
						existingDoc as unknown as Record<string, unknown> | null,
						doc as unknown as Record<string, unknown>,
						"doc",
					),
				});

				res.json(doc);
			} else {
				res.status(404).json({ error: "Document not found or version conflict" });
			}
		} catch (error) {
			log.error(error, "Failed to update document: %s", req.params.jrn);
			res.status(400).json({ error: "Failed to update document" });
		}
	});

	router.post(
		"/:jrn/create-draft",
		permissionMiddleware.requirePermission("articles.edit"),
		async (req: Request, res) => {
			try {
				const docDao = docDaoProvider.getDao(getTenantContext());
				const docDraftDao = docDraftDaoProvider.getDao(getTenantContext());
				const userId = getUserId(tokenUtil, req);
				if (isLookupError(userId)) {
					return handleLookupError(res, userId);
				}

				const doc = await docDao.readDoc(req.params.jrn);
				if (!doc) {
					res.status(404).json({ error: "Document not found" });
					return;
				}

				// Check if a draft already exists for this article (for this user)
				const existingDrafts = await docDraftDao.findByDocId(doc.id);
				const userDraft = existingDrafts.find(draft => draft.createdBy === userId);

				// We need section path service for both update and create paths
				const sectionPathService = createSectionPathService();

				if (userDraft) {
					// Check if article content has been updated since draft was created
					// If so, update the draft content to match the article
					const draftCreatedAt = new Date(userDraft.createdAt).getTime();
					const draftContentLastEditedAt = userDraft.contentLastEditedAt
						? new Date(userDraft.contentLastEditedAt).getTime()
						: 0;
					const articleUpdatedAt = new Date(doc.updatedAt).getTime();

					// Draft content was never modified (user hasn't edited it yet)
					// and article was updated after draft was created
					const userNeverEdited = draftContentLastEditedAt === 0;
					const articleUpdatedAfterDraftCreated = articleUpdatedAt > draftCreatedAt;

					if (userNeverEdited && articleUpdatedAfterDraftCreated) {
						// Sync draft content from the updated article
						log.info(
							"Syncing draft %d content from updated article %s (user %d)",
							userDraft.id,
							doc.jrn,
							userId,
						);
						const { mapping: sectionIdMapping } = sectionPathService.parseSectionsWithIds(doc.content);
						const updatedDraft = await docDraftDao.updateDocDraft(userDraft.id, {
							content: doc.content,
							/* v8 ignore next */
							title: doc.contentMetadata?.title || doc.jrn,
							contentMetadata: {
								...(userDraft.contentMetadata as Record<string, unknown>),
								sectionIds: sectionIdMapping,
							},
						});
						res.json(updatedDraft);
						return;
					}

					// Return existing draft (user has made edits, don't overwrite)
					log.info("Found existing draft %d for article %s (user %d)", userDraft.id, doc.jrn, userId);
					res.json(userDraft);
					return;
				}

				// Create new draft from article (with section ID mapping for suggestions)
				const { mapping: sectionIdMapping } = sectionPathService.parseSectionsWithIds(doc.content);

				// Determine the space from the article's JRN workspace
				// For new JRN format: parse workspace (e.g., "root" from jrn:prod:root:docs:article/...)
				// For legacy format: check /root prefix (e.g., /root/scripts/doc)
				const parsed = jrnParser.parse(doc.jrn);
				const workspace = parsed.success ? parsed.value.workspace : undefined;
				const rootPath = `/${ROOT_WORKSPACE}`;
				const space =
					workspace && workspace !== DEFAULT_WORKSPACE
						? `/${workspace}`
						: doc.jrn.startsWith(rootPath)
							? rootPath
							: undefined;

				const draft = await docDraftDao.createDocDraft({
					docId: doc.id,
					title: doc.contentMetadata?.title || doc.jrn,
					content: doc.content,
					contentType: doc.contentType,
					createdBy: userId,
					contentMetadata: { sectionIds: sectionIdMapping, space },
				});

				log.info("Created draft %d from article %s (user %d)", draft.id, doc.jrn, userId);
				res.status(201).json(draft);
			} catch (error: unknown) {
				log.error(error, "Error creating draft from article.");
				res.status(500).json({ error: "Failed to create draft from article" });
			}
		},
	);

	router.delete("/clearAll", permissionMiddleware.requirePermission("articles.edit"), async (_req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			await docDao.deleteAllDocs();
			res.status(204).send();
		} catch (error) {
			log.error(error, "Failed to clear all documents");
			res.status(400).json({ error: "Failed to clear all documents" });
		}
	});

	router.delete("/:jrn", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const config = getConfig();
			const syncJrnPrefix = config.SYNC_JRN_PREFIX;
			const docDao = docDaoProvider.getDao(getTenantContext());
			const userId = getOptionalUserId(tokenUtil, req);

			// Read doc before deletion for audit trail
			const existingDoc = await docDao.readDoc(req.params.jrn);
			if (existingDoc?.jrn.startsWith(syncJrnPrefix)) {
				await docDao.softDelete(existingDoc.id);
				await markSyncDocDeleted(existingDoc, docDao, syncJrnPrefix);
			} else {
				await docDao.deleteDoc(req.params.jrn);
			}

			// Audit log document deletion
			if (existingDoc) {
				auditLog({
					action: "delete",
					resourceType: "doc",
					resourceId: req.params.jrn,
					/* v8 ignore next */
					resourceName: existingDoc.contentMetadata?.title || existingDoc.jrn,
					/* v8 ignore next */
					actorId: typeof userId === "number" ? userId : null,
					changes: computeAuditChanges(existingDoc as unknown as Record<string, unknown>, null, "doc"),
				});
			}

			res.status(204).send();
		} catch (error) {
			log.error(error, "Failed to delete document: %s", req.params.jrn);
			res.status(400).json({ error: "Failed to delete document" });
		}
	});

	router.post("/search-by-title", permissionMiddleware.requirePermission("articles.view"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const { title } = req.body;

			if (!title || typeof title !== "string") {
				log.warn("Invalid title in search-by-title request: %O", title);
				res.status(400).json({ error: "Title is required and must be a string" });
				return;
			}

			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			log.info("Searching docs by title: '%s'", title);
			const docs = await docDao.searchDocsByTitle(title, userId);
			log.info("Found %d docs matching title: '%s'", docs.length, title);
			res.json(docs);
		} catch (error) {
			log.error(error, "Error searching docs by title.");
			res.status(500).json({ error: "Failed to search by title" });
		}
	});

	router.post(
		"/search-articles-for-link",
		permissionMiddleware.requirePermission("articles.view"),
		async (req, res) => {
			try {
				const docDao = docDaoProvider.getDao(getTenantContext());
				const { title, spaceId } = req.body;

				if (title !== undefined && typeof title !== "string") {
					res.status(400).json({ error: "Title must be a string" });
					return;
				}

				if (typeof title === "string" && title.length > 200) {
					res.status(400).json({ error: "Title must be 200 characters or fewer" });
					return;
				}

				if (spaceId !== undefined && typeof spaceId !== "number") {
					res.status(400).json({ error: "SpaceId must be a number" });
					return;
				}

				const userId = getUserId(tokenUtil, req);
				if (isLookupError(userId)) {
					return handleLookupError(res, userId);
				}

				const results = await docDao.searchArticlesForLink(title ?? "", spaceId, userId);
				res.json(results);
			} catch (error: unknown) {
				log.error(error, "Error searching articles for link.");
				res.status(500).json({ error: "Failed to search articles for link" });
			}
		},
	);

	// ========== Space Tree Operations ==========

	router.post("/by-id/:id/soft-delete", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const config = getConfig();
			const syncJrnPrefix = config.SYNC_JRN_PREFIX;
			const docDao = docDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid document ID" });
				return;
			}

			const doc = await docDao.readDocById(id);
			if (!doc) {
				res.status(404).json({ error: "Document not found" });
				return;
			}

			await docDao.softDelete(id);
			await markSyncDocDeleted(doc, docDao, syncJrnPrefix);
			log.info("Soft deleted document %d", id);
			res.status(204).send();
		} catch (error) {
			log.error(error, "Error soft deleting document.");
			res.status(500).json({ error: "Failed to soft delete document" });
		}
	});

	router.post("/by-id/:id/restore", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid document ID" });
				return;
			}

			const doc = await docDao.readDocById(id);
			if (!doc) {
				res.status(404).json({ error: "Document not found" });
				return;
			}

			if (!doc.deletedAt) {
				res.status(400).json({ error: "Document is not deleted" });
				return;
			}

			await docDao.restore(id);
			log.info("Restored document %d", id);
			res.status(204).send();
		} catch (error) {
			log.error(error, "Error restoring document.");
			res.status(500).json({ error: "Failed to restore document" });
		}
	});

	router.post("/by-id/:id/rename", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const userId = getOptionalUserId(tokenUtil, req);
			const id = Number.parseInt(req.params.id, 10);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid document ID" });
				return;
			}

			const { title } = req.body as { title?: string };
			if (!title || typeof title !== "string" || title.trim().length === 0) {
				res.status(400).json({ error: "Title is required and cannot be empty" });
				return;
			}

			const existingDoc = await docDao.readDocById(id);
			if (!existingDoc) {
				res.status(404).json({ error: "Document not found" });
				return;
			}

			const updatedDoc = await docDao.renameDoc(id, title.trim());
			if (!updatedDoc) {
				res.status(500).json({ error: "Failed to rename document" });
				return;
			}

			// Audit log document rename
			auditLog({
				action: "update",
				resourceType: "doc",
				resourceId: updatedDoc.jrn,
				/* v8 ignore next 2 - fallback values for audit logging */
				resourceName: updatedDoc.contentMetadata?.title || updatedDoc.jrn,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					existingDoc as unknown as Record<string, unknown>,
					updatedDoc as unknown as Record<string, unknown>,
					"doc",
				),
			});

			log.info("Renamed document %d to '%s'", id, title.trim());
			res.json(updatedDoc);
		} catch (error) {
			log.error(error, "Error renaming document.");
			res.status(500).json({ error: "Failed to rename document" });
		}
	});

	router.post("/by-id/:id/reorder", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid document ID" });
				return;
			}

			const { direction } = req.body as { direction?: "up" | "down" };
			if (direction !== "up" && direction !== "down") {
				res.status(400).json({ error: "Direction must be 'up' or 'down'" });
				return;
			}

			const updatedDoc = await docDao.reorderDoc(id, direction);
			if (!updatedDoc) {
				res.status(400).json({ error: "Cannot reorder: document not found or at boundary" });
				return;
			}

			log.info("Reordered document %d %s", id, direction);
			res.json(updatedDoc);
		} catch (error) {
			log.error(error, "Error reordering document.");
			res.status(500).json({ error: "Failed to reorder document" });
		}
	});

	router.post("/by-id/:id/reorder-at", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid document ID" });
				return;
			}

			const { referenceDocId, position } = req.body as {
				referenceDocId?: number | null;
				position?: "before" | "after";
			};

			// Validate referenceDocId type (null = end of folder, number = relative to that doc)
			if (referenceDocId !== null && referenceDocId !== undefined && typeof referenceDocId !== "number") {
				res.status(400).json({ error: "Invalid referenceDocId: must be a number or null" });
				return;
			}

			// Validate referenceDocId is a positive integer if provided as number
			if (typeof referenceDocId === "number" && (!Number.isInteger(referenceDocId) || referenceDocId <= 0)) {
				res.status(400).json({ error: "Invalid referenceDocId: must be a positive integer" });
				return;
			}

			// Validate position (optional, but if provided must be "before" or "after")
			if (position !== undefined && position !== "before" && position !== "after") {
				res.status(400).json({ error: "Invalid position: must be 'before' or 'after'" });
				return;
			}

			const updatedDoc = await docDao.reorderAt(id, referenceDocId, position);
			if (!updatedDoc) {
				res.status(400).json({ error: "Cannot reorder: document not found" });
				return;
			}

			log.info("Reordered document %d %s %s", id, position ?? "end", referenceDocId ?? "null (end of folder)");
			res.json(updatedDoc);
		} catch (error) {
			/* v8 ignore next - error type coercion fallback */
			const errorMsg = error instanceof Error ? error.message : String(error);

			// Distinguish business errors from system errors
			if (errorMsg.includes("target folder") || errorMsg.includes("sibling")) {
				log.warn("Reorder validation failed: %s", errorMsg);
				res.status(400).json({ error: errorMsg });
			} else {
				log.error(error, "Error reordering document.");
				res.status(500).json({ error: "Failed to reorder document" });
			}
		}
	});

	router.post("/by-id/:id/move", permissionMiddleware.requirePermission("articles.edit"), async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const userId = getOptionalUserId(tokenUtil, req);
			const id = Number.parseInt(req.params.id, 10);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid document ID" });
				return;
			}

			const { parentId, referenceDocId, position } = req.body as {
				parentId?: number | null;
				referenceDocId?: number | null;
				position?: "before" | "after";
			};

			// Validate parentId
			const parentIdError = validateNullablePositiveInt(parentId, "parentId");
			/* v8 ignore start - input validation edge case, parentId rarely malformed */
			if (parentIdError) {
				res.status(400).json({ error: parentIdError });
				return;
			}
			/* v8 ignore stop */

			// Validate referenceDocId
			const referenceDocIdError = validateNullablePositiveInt(referenceDocId, "referenceDocId");
			if (referenceDocIdError) {
				res.status(400).json({ error: referenceDocIdError });
				return;
			}

			// Validate position (optional, but if provided must be "before" or "after")
			if (position !== undefined && position !== "before" && position !== "after") {
				res.status(400).json({ error: "Invalid position: must be 'before' or 'after'" });
				return;
			}

			// Convert null to undefined for root level
			const newParentId = parentId === null ? undefined : parentId;

			// Read existing doc for audit trail
			const existingDoc = await docDao.readDocById(id);
			if (!existingDoc) {
				res.status(404).json({ error: "Document not found" });
				return;
			}

			const updatedDoc = await docDao.moveDoc(id, newParentId, referenceDocId, position);
			if (!updatedDoc) {
				res.status(500).json({ error: "Failed to move document" });
				return;
			}

			// Audit log document move
			auditLog({
				action: "update",
				resourceType: "doc",
				resourceId: updatedDoc.jrn,
				/* v8 ignore next 2 - fallback values for audit logging */
				resourceName: updatedDoc.contentMetadata?.title || updatedDoc.jrn,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					existingDoc as unknown as Record<string, unknown>,
					updatedDoc as unknown as Record<string, unknown>,
					"doc",
				),
			});

			log.info("Moved document %d to parent %s", id, newParentId ?? "root");
			res.json(updatedDoc);
		} catch (error) {
			/* v8 ignore next - error type coercion fallback */
			const errorMsg = error instanceof Error ? error.message : String(error);

			if (isMoveBusinessError(errorMsg)) {
				log.warn("Move validation failed: %s", errorMsg);
				res.status(400).json({ error: errorMsg });
			} else {
				log.error(error, "Error moving document.");
				res.status(500).json({ error: "Failed to move document" });
			}
		}
	});

	return router;
}
