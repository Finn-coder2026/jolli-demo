import { auditLog, computeAuditChanges } from "../audit";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import type { NewDoc } from "../model/Doc";
import { createSectionPathService } from "../services/SectionPathService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { getOptionalUserId, getUserId, handleLookupError, isLookupError } from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Router } from "express";
import { DEFAULT_WORKSPACE, jrnParser, ROOT_WORKSPACE, type UserInfo } from "jolli-common";

const log = getLog(import.meta);

/** JRN prefix for sync articles */
const SYNC_ARTICLE_PREFIX = "jrn:/global:docs:article/sync-";

export function createDocRouter(
	docDaoProvider: DaoProvider<DocDao>,
	docDraftDaoProvider: DaoProvider<DocDraftDao>,
	tokenUtil: TokenUtil<UserInfo>,
	syncArticleDaoProvider?: DaoProvider<SyncArticleDao>,
): Router {
	const router = express.Router();

	router.get("/", async (req, res) => {
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

	router.post("/", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const userId = getOptionalUserId(tokenUtil, req);
			const doc = await docDao.createDoc(req.body as NewDoc);

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
		} catch {
			res.status(400).json({ error: "Failed to create document" });
		}
	});

	router.get("/id/:id", async (req, res) => {
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

	router.get("/:jrn", async (req, res) => {
		const docDao = docDaoProvider.getDao(getTenantContext());
		const doc = await docDao.readDoc(req.params.jrn);
		if (doc) {
			res.json(doc);
		} else {
			res.status(404).json({ error: "Document not found" });
		}
	});

	router.put("/:jrn", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const userId = getOptionalUserId(tokenUtil, req);

			// Read existing doc for change tracking
			const existingDoc = await docDao.readDoc(req.params.jrn);
			const doc = await docDao.updateDoc(req.body);

			if (doc) {
				// If this is a sync article, advance cursor so CLI sees the change
				if (syncArticleDaoProvider && doc.jrn.startsWith(SYNC_ARTICLE_PREFIX)) {
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
		} catch {
			res.status(400).json({ error: "Failed to update document" });
		}
	});

	router.post("/:jrn/create-draft", async (req: Request, res) => {
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
		} catch (error) {
			log.error(error, "Error creating draft from article.");
			res.status(500).json({ error: "Failed to create draft from article" });
		}
	});

	router.delete("/clearAll", async (_req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			await docDao.deleteAllDocs();
			res.status(204).send();
		} catch {
			res.status(400).json({ error: "Failed to clear all documents" });
		}
	});

	router.delete("/:jrn", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const userId = getOptionalUserId(tokenUtil, req);

			// Read doc before deletion for audit trail
			const existingDoc = await docDao.readDoc(req.params.jrn);
			await docDao.deleteDoc(req.params.jrn);

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
		} catch {
			res.status(400).json({ error: "Failed to delete document" });
		}
	});

	router.post("/search-by-title", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const { title } = req.body;

			if (!title || typeof title !== "string") {
				log.warn("Invalid title in search-by-title request: %O", title);
				res.status(400).json({ error: "Title is required and must be a string" });
				return;
			}

			log.info("Searching docs by title: '%s'", title);
			const docs = await docDao.searchDocsByTitle(title);
			log.info("Found %d docs matching title: '%s'", docs.length, title);
			res.json(docs);
		} catch (error) {
			log.error(error, "Error searching docs by title.");
			res.status(500).json({ error: "Failed to search by title" });
		}
	});

	// ========== Space Tree Operations ==========

	router.post("/by-id/:id/soft-delete", async (req, res) => {
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

			await docDao.softDelete(id);
			log.info("Soft deleted document %d", id);
			res.status(204).send();
		} catch (error) {
			log.error(error, "Error soft deleting document.");
			res.status(500).json({ error: "Failed to soft delete document" });
		}
	});

	router.post("/by-id/:id/restore", async (req, res) => {
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

	router.post("/by-id/:id/rename", async (req, res) => {
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

	return router;
}
