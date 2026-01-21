import { auditLog } from "../audit";
import type { Database } from "../core/Database";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraftEditHistoryDao } from "../dao/DocDraftEditHistoryDao";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { DocHistoryDao } from "../dao/DocHistoryDao";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import type { UserDao } from "../dao/UserDao";
import type { Doc } from "../model/Doc";
import type { DocDraft } from "../model/DocDraft";
import { ChatService } from "../services/ChatService";
import { DiffService } from "../services/DiffService";
import { DocHistoryService } from "../services/DocHistoryService";
import { createMercureService } from "../services/MercureService";
import { RevisionManager } from "../services/RevisionManager";
import { createSectionMarkupService, type SectionMarkupService } from "../services/SectionMarkupService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { validateMdxContent } from "../util/MdxValidation";
import { getUserId, handleLookupError, isLookupError, lookupDraft } from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Response, type Router } from "express";
import { type DraftListFilter, jrnParser, type UserInfo, validateOpenApiSpec } from "jolli-common";
import { generateSlug } from "jolli-common/server";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

// Singleton RevisionManager for in-memory revision tracking
// Exported for testing purposes
export const revisionManager = new RevisionManager(50);

/**
 * Connection tracking for SSE streams
 */
interface DraftConnection {
	userId: number;
	res: Response;
	keepAliveInterval: NodeJS.Timeout;
}

const draftConnections = new Map<number, Array<DraftConnection>>();

// Singleton MercureService for publishing draft events
const mercureService = createMercureService();

/**
 * Broadcasts an event to all users connected to a draft.
 * Events are sent via both in-memory SSE connections AND Mercure Hub (if enabled).
 *
 * @param chatService the chat service.
 * @param draftId the draft id if the draft the broadcast is for.
 * @param event the event to broadcast.
 * @param excludeUserId Optional user ID to exclude from the broadcast (typically the sender)
 */
function broadcastToDraft(chatService: ChatService, draftId: number, event: unknown, excludeUserId?: number): void {
	// Broadcast to in-memory SSE connections (existing behavior)
	const connections = draftConnections.get(draftId) || [];
	for (const conn of connections) {
		// Skip broadcasting to the excluded user
		/* v8 ignore next 3 - SSE exclusion is tested via integration tests */
		if (excludeUserId !== undefined && conn.userId === excludeUserId) {
			continue;
		}
		try {
			chatService.sendSSE(conn.res, event);
			/* v8 ignore next 3 - error handling for SSE connection failures is difficult to test */
		} catch (error) {
			log.error(error, "Failed to broadcast to draft connection");
		}
	}

	// Also publish to Mercure Hub for distributed SSE (fire and forget)
	const eventData = event as { type?: string };
	const eventType = eventData.type ?? "unknown";
	mercureService.publishDraftEvent(draftId, eventType, event).catch(err => {
		/* v8 ignore next - Mercure publish failures are non-blocking */
		log.warn(err, "Failed to publish draft event to Mercure: %s", eventType);
	});
}

/**
 * Adds a connection to the tracking map
 */
function addConnection(chatService: ChatService, draftId: number, userId: number, res: Response): void {
	const connections = draftConnections.get(draftId) || [];

	// Start keep-alive to prevent proxy timeouts
	const keepAliveInterval = chatService.startKeepAlive(res);

	connections.push({ userId, res, keepAliveInterval });
	draftConnections.set(draftId, connections);

	log.debug("SSE connection opened for draft %d, user %d", draftId, userId);

	// Broadcast user joined event to other users
	broadcastToDraft(chatService, draftId, {
		type: "user_joined",
		userId,
		timestamp: new Date().toISOString(),
	});
}

/**
 * Removes a connection from the tracking map
 */
function removeConnection(chatService: ChatService, draftId: number, userId: number, res: Response): void {
	/* v8 ignore next - defensive: connections should exist when removeConnection is called */
	const connections = draftConnections.get(draftId) || [];

	// Find and stop keep-alive for this connection
	const connection = connections.find(conn => conn.res === res);
	if (connection) {
		chatService.stopKeepAlive(connection.keepAliveInterval);
		log.debug("SSE connection closed for draft %d, user %d", draftId, userId);
	}

	const filtered = connections.filter(conn => conn.res !== res);
	draftConnections.set(draftId, filtered);

	// Broadcast user left event to other users
	broadcastToDraft(chatService, draftId, {
		type: "user_left",
		userId,
		timestamp: new Date().toISOString(),
	});
}

/**
 * Records edit history entries for content and title changes.
 * @param dao the edit history DAO (optional)
 * @param draftId the draft ID
 * @param userId the user ID
 * @param contentChanged whether content changed
 * @param titleChanged whether title changed
 * @param newTitle the new title (if title changed)
 */
async function recordEditHistory(
	dao: DocDraftEditHistoryDao | undefined,
	draftId: number,
	userId: number,
	contentChanged: boolean,
	titleChanged: boolean,
	newTitle?: string,
): Promise<void> {
	if (!dao) {
		return;
	}
	if (contentChanged) {
		await dao.createEditHistory({
			draftId,
			userId,
			editType: "content",
			description: "",
			editedAt: new Date(),
		});
	}
	if (titleChanged) {
		await dao.createEditHistory({
			draftId,
			userId,
			editType: "title",
			description: `Changed to "${newTitle}"`,
			editedAt: new Date(),
		});
	}
}

/** JRN prefix for sync articles */
const SYNC_ARTICLE_PREFIX = "jrn:/global:docs:article/sync-";

export function createDocDraftRouter(
	docDraftDaoProvider: DaoProvider<DocDraftDao>,
	docDaoProvider: DaoProvider<DocDao>,
	docDraftSectionChangesDaoProvider: DaoProvider<DocDraftSectionChangesDao>,
	tokenUtil: TokenUtil<UserInfo>,
	collabConvoDaoProvider?: DaoProvider<CollabConvoDao>,
	userDaoProvider?: DaoProvider<UserDao>,
	docDraftEditHistoryDaoProvider?: DaoProvider<DocDraftEditHistoryDao>,
	docHistoryDaoProvider?: DaoProvider<DocHistoryDao>,
	sequelize?: Sequelize,
	syncArticleDaoProvider?: DaoProvider<SyncArticleDao>,
): Router {
	const router = express.Router();
	const diffService = new DiffService();
	const chatService = new ChatService();
	const docHistoryService = new DocHistoryService();

	// Helper to get DAOs with tenant context
	function getDocDraftDao(): DocDraftDao {
		return docDraftDaoProvider.getDao(getTenantContext());
	}
	function getDocDao(): DocDao {
		return docDaoProvider.getDao(getTenantContext());
	}
	function getDocDraftSectionChangesDao(): DocDraftSectionChangesDao {
		return docDraftSectionChangesDaoProvider.getDao(getTenantContext());
	}
	function getCollabConvoDao(): CollabConvoDao | undefined {
		return collabConvoDaoProvider?.getDao(getTenantContext());
	}
	function getUserDao(): UserDao | undefined {
		return userDaoProvider?.getDao(getTenantContext());
	}
	function getDocDraftEditHistoryDao(): DocDraftEditHistoryDao | undefined {
		return docDraftEditHistoryDaoProvider?.getDao(getTenantContext());
	}
	/* v8 ignore start - optional DAO getters for features requiring specific configuration */
	function getSyncArticleDao(): SyncArticleDao | undefined {
		return syncArticleDaoProvider?.getDao(getTenantContext());
	}
	function getDocHistoryDao(): DocHistoryDao | undefined {
		return docHistoryDaoProvider?.getDao(getTenantContext());
	}
	/* v8 ignore stop */

	/**
	 * Saves version history for a document before updating it, and then updates the document.
	 * All operations are performed within a transaction.
	 *
	 * @param existingDoc the existing document to update
	 * @param updateData the data to update the document with
	 * @param userId the ID of the user making the update
	 * @returns the updated document, or undefined if update failed
	 */
	/* v8 ignore start - optional feature requiring docHistoryDaoProvider and sequelize configuration */
	async function saveVersionHistoryAndUpdateDoc(
		existingDoc: Doc,
		updateData: Partial<Doc>,
		userId: number,
	): Promise<Doc | undefined> {
		const docHistoryDao = getDocHistoryDao();
		const docDao = getDocDao();

		// Use tenant-specific sequelize if available, otherwise fall back to default
		// This is critical for multi-tenant mode where the transaction must run on the
		// tenant's database, not the single-tenant default database
		const tenantContext = getTenantContext();
		const effectiveSequelize = tenantContext?.database.sequelize ?? sequelize;

		// If no sequelize instance or docHistoryDao, fall back to simple update
		if (!effectiveSequelize || !docHistoryDao) {
			log.debug("saveVersionHistoryAndUpdateDoc: no sequelize or docHistoryDao, falling back to simple update");
			return await docDao.updateDoc({
				...existingDoc,
				...updateData,
				version: existingDoc.version + 1,
			});
		}

		return await effectiveSequelize.transaction(async transaction => {
			// Check if we should save version history
			const shouldSave = docHistoryService.shouldSaveVersionHistory(existingDoc);

			if (shouldSave) {
				// Compress the current doc state and save to history
				const docSnapshot = docHistoryService.compressDocSnapshot(existingDoc);
				log.info(
					"saveVersionHistoryAndUpdateDoc: saving version history for doc %d, version %d",
					existingDoc.id,
					existingDoc.version,
				);

				await docHistoryDao.createDocHistory(
					{
						docId: existingDoc.id,
						userId,
						docSnapshot,
						version: existingDoc.version,
					},
					transaction,
				);
			} else {
				log.debug(
					"saveVersionHistoryAndUpdateDoc: skipping version history for doc %d (has referVersion)",
					existingDoc.id,
				);
			}

			// Remove referVersion from contentMetadata if present
			const cleanedMetadata = docHistoryService.removeReferVersion(
				updateData.contentMetadata ?? existingDoc.contentMetadata,
			);

			// Update the document with incremented version
			const updatedDoc = await docDao.updateDoc(
				{
					...existingDoc,
					...updateData,
					contentMetadata: cleanedMetadata,
					version: existingDoc.version + 1,
				},
				transaction,
			);

			if (updatedDoc) {
				log.info(
					"saveVersionHistoryAndUpdateDoc: updated doc %d to version %d",
					updatedDoc.id,
					updatedDoc.version,
				);
			}

			return updatedDoc;
		});
	}
	/* v8 ignore stop */

	// Helper to create SectionMarkupService with tenant-aware DAOs per-request
	function getSectionMarkupService(): SectionMarkupService {
		return createSectionMarkupService({
			docDraftSectionChangesDao: getDocDraftSectionChangesDao(),
			docDraftDao: getDocDraftDao(),
		} as Database);
	}

	// POST /api/doc-drafts - Create new draft
	router.post("/", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const { docId, title, content, contentType, space } = req.body;

			// Require non-empty title
			if (!title || typeof title !== "string" || title.trim() === "") {
				return res.status(400).json({ error: "Title is required" });
			}

			// For new articles (no docId), check for name conflicts
			if (!docId) {
				const existingDrafts = await getDocDraftDao().findDraftsByExactTitle(title.trim());
				if (existingDrafts.length > 0) {
					// Return 409 Conflict with existing draft info
					return res.status(409).json({
						error: "Draft with this title already exists",
						conflictingDraft: existingDrafts[0],
					});
				}
			}

			// For existing articles, check if a draft already exists
			if (docId) {
				const existingDraft = await getDocDraftDao().findDraftByDocId(Number.parseInt(docId));
				if (existingDraft) {
					// Return 409 with existing draft ID
					return res.status(409).json({
						error: "Draft already exists for this article",
						existingDraftId: existingDraft.id,
					});
				}
			}

			// Check if creator is an agent
			let isAgent = false;
			/* v8 ignore next 4 - userDao is optional and only used to check agent status */
			if (userDaoProvider) {
				const user = await getUserDao()?.findUserById(userId);
				isAgent = user?.isAgent ?? false;
			}

			// Content must be provided but can be empty string
			if (content === undefined || content === null) {
				return res.status(400).json({ error: "Content must be provided" });
			}

			// Validate contentType if provided
			const validContentTypes = ["text/markdown", "application/json", "application/yaml"];
			const finalContentType =
				contentType && validContentTypes.includes(contentType) ? contentType : "text/markdown";

			// Store space in contentMetadata if provided
			const contentMetadata = space ? { space } : undefined;

			const draft = await getDocDraftDao().createDocDraft({
				docId: docId ? Number.parseInt(docId) : undefined,
				title,
				content,
				contentType: finalContentType,
				createdBy: userId,
				contentLastEditedAt: null,
				contentLastEditedBy: userId,
				contentMetadata,
				createdByAgent: isAgent,
				isShared: isAgent, // Agent drafts are shared by default
			});

			res.status(201).json(draft);
		} catch (error) {
			log.error(error, "Error creating doc draft.");
			res.status(500).json({ error: "Failed to create draft" });
		}
	});

	// GET /api/doc-drafts - List drafts with optional filter
	router.get("/", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const limit = req.query.limit ? Number.parseInt(req.query.limit as string) : undefined;
			const offset = req.query.offset ? Number.parseInt(req.query.offset as string) : undefined;
			const filter = req.query.filter as DraftListFilter | undefined;

			// If filter is provided, return filtered results with total count
			if (filter) {
				let drafts: Array<DocDraft>;
				let total: number;

				switch (filter) {
					case "my-new-drafts":
						drafts = await getDocDraftDao().listDocDraftsByUser(userId, limit, offset);
						// Filter to only new drafts (no docId) that aren't shared
						drafts = drafts.filter(d => !d.docId && !d.isShared);
						total = await getDocDraftDao().countMyNewDrafts(userId);
						break;
					case "shared-with-me":
						drafts = await getDocDraftDao().listSharedDrafts(userId, limit, offset);
						total = await getDocDraftDao().countSharedWithMeDrafts(userId);
						break;
					case "suggested-updates": {
						const draftsWithChanges = await getDocDraftDao().getDraftsWithPendingChanges();
						drafts = draftsWithChanges.map(d => d.draft);
						total = drafts.length;
						break;
					}
					default: // 'all'
						drafts = await getDocDraftDao().listAccessibleDrafts(userId, limit, offset);
						total = drafts.length;
						break;
				}

				return res.json({ drafts, total });
			}

			// Default: return user's own drafts (backwards compatibility)
			const drafts = await getDocDraftDao().listDocDraftsByUser(userId, limit, offset);
			res.json(drafts);
		} catch (error) {
			log.error(error, "Error listing doc drafts.");
			res.status(500).json({ error: "Failed to list drafts" });
		}
	});

	// IMPORTANT: MAKE SURE THIS NEVER GOES BELOW ANY /:id route (or other variable route)

	// POST /api/doc-drafts/validate - Validate content without saving
	router.post("/validate", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const { content, contentType } = req.body;

			if (content === undefined || content === null) {
				return res.status(400).json({ error: "Content is required" });
			}

			// Validate MDX for markdown content
			if (contentType === "text/markdown" || !contentType) {
				const validationResult = await validateMdxContent(content);
				return res.json(validationResult);
			}

			// Validate OpenAPI for JSON/YAML content
			if (contentType === "application/json" || contentType === "application/yaml") {
				const validationResult = validateOpenApiSpec(content, contentType);
				return res.json(validationResult);
			}

			// Unknown content type - return valid
			return res.json({ isValid: true, errors: [] });
			/* v8 ignore next 4 - error handling is difficult to test */
		} catch (error) {
			log.error(error, "Error validating content");
			res.status(500).json({ error: "Failed to validate content" });
		}
	});

	// POST /api/doc-drafts/search-by-title - Search drafts by title
	router.post("/search-by-title", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				log.warn("Unauthorized search-by-title request");
				return handleLookupError(res, userId);
			}

			const { title } = req.body;
			if (!title || typeof title !== "string") {
				log.warn("Invalid title in search-by-title request: %O", title);
				return res.status(400).json({ error: "Title is required and must be a string" });
			}

			log.debug("Searching drafts by title: '%s' for user: %d", title, userId);
			const drafts = await getDocDraftDao().searchDocDraftsByTitle(title, userId);
			log.debug("Found %d drafts matching title: '%s'", drafts.length, title);
			res.json(drafts);
		} catch (error) {
			log.error(error, "Error searching drafts by title.");
			res.status(500).json({ error: "Failed to search by title" });
		}
	});

	// GET /api/doc-drafts/with-pending-changes - Get drafts with pending section changes
	router.get("/with-pending-changes", async (_req: Request, res: Response) => {
		try {
			const draftsWithChanges = await getDocDraftDao().getDraftsWithPendingChanges();
			res.json(draftsWithChanges);
		} catch (error) {
			log.error(error, "Error getting drafts with pending changes.");
			res.status(500).json({ error: "Failed to get drafts with pending changes" });
		}
	});

	// GET /api/doc-drafts/counts - Get draft counts for filter cards
	router.get("/counts", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const docDraftDao = getDocDraftDao();
			const [myNewDrafts, mySharedNewDrafts, sharedWithMe, suggestedUpdates] = await Promise.all([
				docDraftDao.countMyNewDrafts(userId),
				docDraftDao.countMySharedNewDrafts(userId),
				docDraftDao.countSharedWithMeDrafts(userId),
				docDraftDao.countArticlesWithAgentSuggestions(),
			]);

			// For 'all', count accessible drafts
			const allDrafts = await getDocDraftDao().listAccessibleDrafts(userId);
			const all = allDrafts.length;

			res.json({
				all,
				myNewDrafts,
				mySharedNewDrafts,
				sharedWithMe,
				suggestedUpdates,
			});
		} catch (error) {
			log.error(error, "Error getting draft counts.");
			res.status(500).json({ error: "Failed to get draft counts" });
		}
	});

	// GET /api/doc-drafts/:id - Get specific draft
	router.get("/:id", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			res.json(draftInfo.draft);
		} catch (error) {
			log.error(error, "Error getting doc draft.");
			res.status(500).json({ error: "Failed to get draft" });
		}
	});

	// PATCH /api/doc-drafts/:id - Update draft
	router.patch("/:id", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;
			const { id } = draft;

			const { title, content, contentType, contentMetadata } = req.body;

			// Require at least one field to be provided
			if (
				title === undefined &&
				content === undefined &&
				contentType === undefined &&
				contentMetadata === undefined
			) {
				return res.status(400).json({ error: "Must provide title, content, contentType, or contentMetadata" });
			}

			// Validate contentType if provided
			const validContentTypes = ["text/markdown", "application/json", "application/yaml"];
			if (contentType !== undefined && !validContentTypes.includes(contentType)) {
				return res.status(400).json({ error: "Invalid content type" });
			}

			// If title is provided, it must be non-empty
			if (title !== undefined && (!title || typeof title !== "string" || title.trim() === "")) {
				return res.status(400).json({ error: "Title cannot be empty" });
			}

			const updates: {
				title?: string;
				content?: string;
				contentType?: string;
				contentMetadata?: unknown;
				contentLastEditedAt?: Date;
				contentLastEditedBy?: number;
			} = {};
			if (title !== undefined) {
				updates.title = title;
			}
			if (content !== undefined) {
				updates.content = content;

				// Initialize revision history with current content if this is the first edit
				if (revisionManager.getRevisionCount(id) === 0) {
					revisionManager.addRevision(id, draft.content, userId, "Initial content");
				}

				// Add revision for undo/redo
				revisionManager.addRevision(id, content, userId, "Manual edit");

				// Generate diff and broadcast to connected users (excluding sender to prevent echo)
				const diffResult = diffService.generateDiff(draft.content, content);
				broadcastToDraft(
					chatService,
					id,
					{
						type: "content_update",
						diffs: diffResult.diffs,
						userId,
						timestamp: new Date().toISOString(),
					},
					userId,
				);
			}
			if (contentType !== undefined) {
				updates.contentType = contentType;
			}
			if (contentMetadata !== undefined) {
				updates.contentMetadata = contentMetadata;
			}

			// Update tracking fields only if content, title, contentType, or contentMetadata actually changed
			const titleChanged = title !== undefined && title !== draft.title;
			const contentChanged = content !== undefined && content !== draft.content;
			const contentTypeChanged = contentType !== undefined && contentType !== draft.contentType;
			const metadataChanged =
				contentMetadata !== undefined &&
				JSON.stringify(contentMetadata) !== JSON.stringify(draft.contentMetadata);

			if (titleChanged || contentChanged || contentTypeChanged || metadataChanged) {
				updates.contentLastEditedAt = new Date();
				updates.contentLastEditedBy = userId;
			}

			const updatedDraft = await getDocDraftDao().updateDocDraft(id, updates);

			// Record edit history for content and title changes
			await recordEditHistory(
				getDocDraftEditHistoryDao(),
				id,
				userId,
				contentChanged,
				titleChanged,
				updatedDraft?.title,
			);

			res.json(updatedDraft);
		} catch (error) {
			log.error(error, "Error updating doc draft.");
			res.status(500).json({ error: "Failed to update draft" });
		}
	});

	// POST /api/doc-drafts/:id/validate - Validate draft content (for OpenAPI specs)
	router.post("/:id/validate", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft } = draftInfo;

			// Only validate JSON and YAML content types - Markdown is always valid
			if (draft.contentType !== "application/json" && draft.contentType !== "application/yaml") {
				return res.json({ isValid: true, isOpenApiSpec: false, errors: [] });
			}

			// Validate that JSON/YAML content is a valid OpenAPI spec
			const validationResult = validateOpenApiSpec(draft.content, draft.contentType);
			return res.json(validationResult);
		} catch (error) {
			log.error(error, "Error validating doc draft.");
			res.status(500).json({ error: "Failed to validate draft" });
		}
	});

	// POST /api/doc-drafts/:id/save - Save draft as article
	router.post("/:id/save", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;
			const { id } = draft;

			// Validate MDX content for markdown articles before saving
			if (draft.contentType === "text/markdown" || !draft.contentType) {
				const validationResult = await validateMdxContent(draft.content);
				if (!validationResult.isValid) {
					return res.status(400).json({
						error: "Invalid MDX content",
						validationErrors: validationResult.errors,
					});
				}
			}

			// Validate that JSON/YAML content is a valid OpenAPI spec before saving
			if (draft.contentType === "application/json" || draft.contentType === "application/yaml") {
				const validationResult = validateOpenApiSpec(draft.content, draft.contentType);
				if (!validationResult.isValid) {
					return res.status(400).json({
						error: "Invalid OpenAPI specification",
						validationErrors: validationResult.errors,
					});
				}
			}

			let doc: Doc | undefined;
			if (draft.docId != null) {
				// Update existing article - find by ID (include /root docs in case the article is in /root space)
				const allDocs = await getDocDao().listDocs({ includeRoot: true });
				const existingDoc = allDocs.find(d => d.id === draft.docId);

				if (!existingDoc) {
					return res.status(404).json({ error: "Article not found" });
				}

				// Save version history and update the doc in a transaction
				const updatedDoc = await saveVersionHistoryAndUpdateDoc(
					existingDoc,
					{
						content: draft.content,
						contentType: draft.contentType,
						contentMetadata: {
							...existingDoc.contentMetadata,
							title: draft.title,
						},
						updatedBy: userId.toString(),
					},
					userId,
				);

				if (!updatedDoc) {
					return res.status(404).json({ error: "Failed to update article" });
				}
				doc = updatedDoc;

				// If this is a sync article, advance cursor so CLI sees the change
				/* v8 ignore start - optional feature requiring syncArticleDaoProvider configuration */
				if (updatedDoc.jrn.startsWith(SYNC_ARTICLE_PREFIX)) {
					const syncArticleDao = getSyncArticleDao();
					if (syncArticleDao) {
						await syncArticleDao.advanceCursor(updatedDoc.jrn);
						log.info("Advanced sync cursor for %s", updatedDoc.jrn);
					}
				}
				/* v8 ignore stop */
			} else {
				// Create a new document from the draft
				// Generate JRN using the new structured format (article() normalizes: lowercase, spaces to hyphens)
				const jrn = jrnParser.article(`${draft.title}-${Date.now()}`);

				// Generate a slug from the title using SlugUtils
				const slug = generateSlug(draft.title);

				doc = await getDocDao().createDoc({
					jrn,
					slug,
					path: "",
					updatedBy: userId.toString(),
					source: undefined,
					sourceMetadata: undefined,
					content: draft.content,
					contentType: draft.contentType,
					contentMetadata: {
						title: draft.title,
						draftId: draft.id,
					},
					spaceId: undefined,
					parentId: undefined,
					docType: "document",
					sortOrder: 0,
					createdBy: userId.toString(),
				});
			}

			// Delete the draft
			await getDocDraftDao().deleteDocDraft(id);

			// Clear revision history
			revisionManager.clear(id);

			// Broadcast save notification
			if (doc) {
				broadcastToDraft(chatService, id, {
					type: "draft_saved",
					draftId: id,
					docId: doc.id,
					docJrn: doc.jrn,
					userId,
					timestamp: new Date().toISOString(),
				});

				// Audit log: doc published
				auditLog({
					action: "publish",
					resourceType: "doc",
					resourceId: String(doc.id),
					resourceName: draft.title,
					actorId: userId,
					metadata: {
						draftId: id,
						docJrn: doc.jrn,
						isNewArticle: draft.docId === undefined,
					},
				});
			}

			res.json({
				success: true,
				message: draft.docId !== undefined ? "Article updated" : "Draft saved as article",
				doc,
			});
		} catch (error) {
			log.error(error, "Error saving doc draft.");
			res.status(500).json({ error: "Failed to save draft" });
		}
	});

	// DELETE /api/doc-drafts/:id - Delete draft
	router.delete("/:id", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;
			const { id } = draft;

			const deleted = await getDocDraftDao().deleteDocDraft(id);

			if (!deleted) {
				return res.status(404).json({ error: "Draft not found" });
			}

			// Clear revision history
			revisionManager.clear(id);

			// Broadcast delete notification
			broadcastToDraft(chatService, id, {
				type: "draft_deleted",
				draftId: id,
				userId,
				timestamp: new Date().toISOString(),
			});

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Error deleting doc draft.");
			res.status(500).json({ error: "Failed to delete draft" });
		}
	});

	// POST /api/doc-drafts/:id/undo - Undo last change
	router.post("/:id/undo", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;
			const { id } = draft;

			// Check if undo is available
			if (!revisionManager.canUndo(id)) {
				return res.status(400).json({ error: "Nothing to undo" });
			}

			// Undo to previous revision
			const undoResult = revisionManager.undo(id);

			if (!undoResult) {
				return res.status(500).json({ error: "Failed to undo" });
			}

			const { content: previousContent, undoneChangeIds, undismissedChangeIds } = undoResult;

			// Get the revision we just moved to
			const currentIndex = revisionManager.getCurrentIndex(id);
			const revision = revisionManager.getRevisionAt(id, currentIndex);

			// Update draft in database with content and tracking fields from revision
			await getDocDraftDao().updateDocDraft(id, {
				content: previousContent,
				/* v8 ignore next - defensive: revision should always exist after successful undo */
				contentLastEditedAt: revision?.timestamp ?? new Date(),
				/* v8 ignore next - defensive: revision should always exist after successful undo */
				contentLastEditedBy: revision?.userId ?? userId,
			});

			// Reset the applied flag on changes that were undone
			/* v8 ignore start - undone changes path tested implicitly through undo with applied changes */
			if (undoneChangeIds && undoneChangeIds.length > 0) {
				for (const changeId of undoneChangeIds) {
					await getDocDraftSectionChangesDao().updateDocDraftSectionChanges(changeId, { applied: false });
				}
			}
			/* v8 ignore stop */

			// Reset the dismissed flag on changes that were undone (un-dismiss them)
			/* v8 ignore start - undismissed changes path tested implicitly through undo with dismissed changes */
			if (undismissedChangeIds && undismissedChangeIds.length > 0) {
				for (const changeId of undismissedChangeIds) {
					await getDocDraftSectionChangesDao().updateDocDraftSectionChanges(changeId, {
						dismissed: false,
						dismissedAt: null,
						dismissedBy: null,
					} as never);
				}
			}
			/* v8 ignore stop */

			// Re-annotate with updated content to reflect the reset applied flags
			const sections = await getSectionMarkupService().annotateDocDraft(id, previousContent);
			const allChanges = await getDocDraftSectionChangesDao().findByDraftId(id);

			/* v8 ignore start - debug logging is disabled in tests */
			if (log.isLevelEnabled("debug")) {
				log.debug("=== UNDO RESPONSE DEBUG ===");
				log.debug("Draft ID: %d", id);
				log.debug("Undone change IDs: %o", undoneChangeIds || []);
				log.debug("Sections count: %d", sections.length);
				log.debug("Sections: %o", sections);
				log.debug("All changes count: %d", allChanges.length);
				log.debug(
					"Pending changes: %o",
					allChanges.filter(c => !c.applied).map(c => ({ id: c.id, applied: c.applied })),
				);
			}
			/* v8 ignore stop */

			// Note: We don't broadcast here because the user who clicked undo
			// already receives the full response with sections and changes.
			// Broadcasting would cause a race condition where the SSE content_update
			// overwrites the section annotations we just set.

			res.json({
				success: true,
				content: previousContent,
				sections,
				changes: allChanges,
				canUndo: revisionManager.canUndo(id),
				canRedo: revisionManager.canRedo(id),
			});
		} catch (error) {
			log.error(error, "Error undoing draft change.");
			res.status(500).json({ error: "Failed to undo" });
		}
	});

	// POST /api/doc-drafts/:id/redo - Redo last undone change
	router.post("/:id/redo", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;
			const { id } = draft;

			// Check if redo is available
			if (!revisionManager.canRedo(id)) {
				return res.status(400).json({ error: "Nothing to redo" });
			}

			// Redo to next revision
			const redoResult = revisionManager.redo(id);

			if (!redoResult) {
				return res.status(500).json({ error: "Failed to redo" });
			}

			const { content: nextContent, reappliedChangeIds, redismissedChangeIds } = redoResult;

			// Get the revision we just moved to
			const currentIndex = revisionManager.getCurrentIndex(id);
			const revision = revisionManager.getRevisionAt(id, currentIndex);

			// Update draft in database with content and tracking fields from revision
			await getDocDraftDao().updateDocDraft(id, {
				content: nextContent,
				contentLastEditedAt: revision?.timestamp ?? new Date(),
				contentLastEditedBy: revision?.userId ?? userId,
			});

			// Re-apply the changes that were in this revision
			/* v8 ignore start - reapplied changes path tested implicitly through redo with applied changes */
			if (reappliedChangeIds && reappliedChangeIds.length > 0) {
				for (const changeId of reappliedChangeIds) {
					await getDocDraftSectionChangesDao().updateDocDraftSectionChanges(changeId, { applied: true });
				}
			}
			/* v8 ignore stop */

			// Re-dismiss the changes that were in this revision
			/* v8 ignore start - redismissed changes path tested implicitly through redo with dismissed changes */
			if (redismissedChangeIds && redismissedChangeIds.length > 0) {
				for (const changeId of redismissedChangeIds) {
					await getDocDraftSectionChangesDao().dismissDocDraftSectionChange(changeId, userId);
				}
			}
			/* v8 ignore stop */

			// Re-annotate with updated content to reflect the reapplied flags
			const sections = await getSectionMarkupService().annotateDocDraft(id, nextContent);
			const allChanges = await getDocDraftSectionChangesDao().findByDraftId(id);

			// Note: We don't broadcast here because the user who clicked redo
			// already receives the full response with sections and changes.
			// Broadcasting would cause a race condition where the SSE content_update
			// overwrites the section annotations we just set.

			res.json({
				success: true,
				content: nextContent,
				sections,
				changes: allChanges,
				canUndo: revisionManager.canUndo(id),
				canRedo: revisionManager.canRedo(id),
			});
		} catch (error) {
			log.error(error, "Error redoing draft change.");
			res.status(500).json({ error: "Failed to redo" });
		}
	});

	// GET /api/doc-drafts/:id/revisions - Get revision metadata
	router.get("/:id/revisions", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft } = draftInfo;
			const { id } = draft;

			const revisions = revisionManager.getRevisionInfo(id) || [];
			const currentIndex = revisionManager.getCurrentIndex(id);

			res.json({
				revisions,
				currentIndex,
				canUndo: revisionManager.canUndo(id),
				canRedo: revisionManager.canRedo(id),
			});
		} catch (error) {
			log.error(error, "Error getting draft revisions.");
			res.status(500).json({ error: "Failed to get revisions" });
		}
	});

	// GET /api/doc-drafts/:id/stream - SSE for real-time draft updates
	router.get("/:id/stream", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;
			const { id } = draft;

			// Set up SSE
			chatService.setupSSEHeaders(res);

			// Add connection
			addConnection(chatService, id, userId, res);

			// Send initial connection confirmation
			chatService.sendSSE(res, {
				type: "connected",
				draftId: id,
				timestamp: new Date().toISOString(),
			});

			// Handle client disconnect
			req.on("close", () => {
				removeConnection(chatService, id, userId, res);
			});
			/* v8 ignore next 4 - SSE error handling is difficult to test with supertest */
		} catch (error) {
			log.error(error, "Error setting up draft stream.");
			chatService.handleStreamError(res, error, "Failed to set up draft stream");
		}
	});

	// POST /api/doc-drafts/:id/share - Share a draft with other users
	router.post("/:id/share", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;

			// Only owner can share
			if (draft.createdBy !== userId) {
				return res.status(403).json({ error: "Only the owner can share this draft" });
			}

			// Can only share new drafts (no docId) - existing article drafts are always shared
			if (draft.docId != null) {
				return res.status(400).json({ error: "Existing article drafts are always shared" });
			}

			// Already shared
			if (draft.isShared) {
				return res.json(draft);
			}

			const updatedDraft = await getDocDraftDao().shareDraft(draft.id, userId);
			if (!updatedDraft) {
				return res.status(404).json({ error: "Draft not found" });
			}

			res.json(updatedDraft);
		} catch (error) {
			log.error(error, "Error sharing draft.");
			res.status(500).json({ error: "Failed to share draft" });
		}
	});

	// GET /api/doc-drafts/:id/history - Get edit history for a draft
	router.get("/:id/history", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft } = draftInfo;

			const docDraftEditHistoryDao = getDocDraftEditHistoryDao();
			if (!docDraftEditHistoryDao) {
				return res.json([]);
			}

			const history = await docDraftEditHistoryDao.listByDraftId(draft.id, 50);
			res.json(history);
		} catch (error) {
			log.error(error, "Error getting draft history.");
			res.status(500).json({ error: "Failed to get draft history" });
		}
	});

	// GET /api/doc-drafts/:id/section-changes - Get section changes with annotations
	router.get("/:id/section-changes", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft } = draftInfo;
			const { id, content } = draft;

			// Get all section changes for this draft
			const changes = await getDocDraftSectionChangesDao().findByDraftId(id);

			// Annotate the draft content with section boundaries
			const sections = await getSectionMarkupService().annotateDocDraft(id, content);

			return res.json({
				sections,
				changes,
			});
		} catch (error) {
			log.error(error, "Error getting section changes");
			return res.status(500).json({ error: "Failed to get section changes" });
		}
	});

	// POST /api/doc-drafts/:id/section-changes/:changeId/apply - Apply a section change
	router.post("/:id/section-changes/:changeId/apply", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;
			const { id } = draft;

			const changeId = Number.parseInt(req.params.changeId);
			if (Number.isNaN(changeId)) {
				return res.status(400).json({ error: "Invalid change ID" });
			}

			// Get the section change
			const change = await getDocDraftSectionChangesDao().getDocDraftSectionChanges(changeId);
			if (!change) {
				return res.status(404).json({ error: "Section change not found" });
			}

			if (change.draftId !== id) {
				return res.status(403).json({ error: "Section change does not belong to this draft" });
			}

			if (change.applied) {
				return res.status(400).json({ error: "Change already applied" });
			}

			// Add the current content as a revision BEFORE applying the change
			// This ensures there's always something to undo to
			if (revisionManager.getRevisionCount(id) === 0) {
				// This is the first change - add the initial content as the baseline
				revisionManager.addRevision(id, draft.content, userId, "Initial content");
			}

			// Apply the change to the draft content
			const updatedContent = getSectionMarkupService().applySectionChangeToDraft(draft.content, change);

			// Update the draft in the database with the modified content
			await getDocDraftDao().updateDocDraft(id, {
				content: updatedContent,
				contentLastEditedAt: new Date(),
				contentLastEditedBy: userId,
			});

			// Mark the change as applied
			await getDocDraftSectionChangesDao().updateDocDraftSectionChanges(changeId, { applied: true });

			// Add to revision history with the MODIFIED content, tracking which change was applied
			revisionManager.addRevision(id, updatedContent, userId, "Applied section change", [changeId]);

			// Record edit history for section apply
			if (docDraftEditHistoryDaoProvider) {
				await getDocDraftEditHistoryDao()?.createEditHistory({
					draftId: id,
					userId,
					editType: "section_apply",
					description: `Applied ${change.changeType} change`,
					editedAt: new Date(),
				});
			}

			// Re-annotate with updated content
			const sections = await getSectionMarkupService().annotateDocDraft(id, updatedContent);
			const allChanges = await getDocDraftSectionChangesDao().findByDraftId(id);

			// Broadcast the change to other connected users
			broadcastToDraft(chatService, id, {
				type: "section_change_applied",
				changeId,
				timestamp: new Date().toISOString(),
			});

			// Add a message to the conversation so the LLM knows the change was applied
			// This helps the LLM understand it can continue making modifications
			if (collabConvoDaoProvider) {
				const convo = await getCollabConvoDao()?.findByArtifact("doc_draft", id);
				if (convo) {
					// Get description from the first proposed change
					const changeDescription =
						change.proposed.length > 0 && change.proposed[0].description
							? change.proposed[0].description
							: `${change.changeType} change`;

					await getCollabConvoDao()?.addMessage(convo.id, {
						role: "system",
						content: `[The user applied the suggested change: "${changeDescription}". The article draft has been updated. You can continue making additional modifications if requested.]`,
						timestamp: new Date().toISOString(),
					});
					log.info("Added system message to convo %d about applied change", convo.id);
				}
			}

			return res.json({
				content: updatedContent,
				sections,
				changes: allChanges,
				canUndo: revisionManager.canUndo(id),
				canRedo: revisionManager.canRedo(id),
			});
		} catch (error) {
			log.error(error, "Error applying section change");
			return res.status(500).json({ error: "Failed to apply section change" });
		}
	});

	// POST /api/doc-drafts/:id/section-changes/:changeId/dismiss - Dismiss a section change
	router.post("/:id/section-changes/:changeId/dismiss", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft, userId } = draftInfo;
			const { id } = draft;

			const changeId = Number.parseInt(req.params.changeId);
			if (Number.isNaN(changeId)) {
				return res.status(400).json({ error: "Invalid change ID" });
			}

			// Get the section change
			const change = await getDocDraftSectionChangesDao().getDocDraftSectionChanges(changeId);
			if (!change) {
				return res.status(404).json({ error: "Section change not found" });
			}

			if (change.draftId !== id) {
				return res.status(403).json({ error: "Section change does not belong to this draft" });
			}

			if (change.dismissed) {
				return res.status(400).json({ error: "Change already dismissed" });
			}

			// Initialize revision history if this is the first action
			if (revisionManager.getRevisionCount(id) === 0) {
				revisionManager.addRevision(id, draft.content, userId, "Initial content");
			}

			// Mark the change as dismissed
			await getDocDraftSectionChangesDao().dismissDocDraftSectionChange(changeId, userId);

			// Add to revision history, tracking which change was dismissed
			revisionManager.addRevision(id, draft.content, userId, "Dismissed section change", undefined, [changeId]);

			// Record edit history for section dismiss
			if (docDraftEditHistoryDaoProvider) {
				await getDocDraftEditHistoryDao()?.createEditHistory({
					draftId: id,
					userId,
					editType: "section_dismiss",
					description: `Dismissed ${change.changeType} change`,
					editedAt: new Date(),
				});
			}

			// Re-annotate with current content (dismissed change will be filtered out)
			const sections = await getSectionMarkupService().annotateDocDraft(id, draft.content);
			const allChanges = await getDocDraftSectionChangesDao().findByDraftId(id);

			// Broadcast the change to other connected users
			broadcastToDraft(chatService, id, {
				type: "section_change_dismissed",
				changeId,
				timestamp: new Date().toISOString(),
			});

			// Add a message to the conversation so the LLM knows the change was dismissed
			if (collabConvoDaoProvider) {
				const convo = await getCollabConvoDao()?.findByArtifact("doc_draft", id);
				if (convo) {
					// Get description from the first proposed change
					const changeDescription =
						change.proposed.length > 0 && change.proposed[0].description
							? change.proposed[0].description
							: `${change.changeType} change`;

					await getCollabConvoDao()?.addMessage(convo.id, {
						role: "system",
						content: `[The user dismissed the suggested change: "${changeDescription}". The article draft was not modified. You can suggest a different approach if requested.]`,
						timestamp: new Date().toISOString(),
					});
					log.info("Added system message to convo %d about dismissed change", convo.id);
				}
			}

			return res.json({
				content: draft.content,
				sections,
				changes: allChanges,
				canUndo: revisionManager.canUndo(id),
				canRedo: revisionManager.canRedo(id),
			});
		} catch (error) {
			log.error(error, "Error dismissing section change");
			return res.status(500).json({ error: "Failed to dismiss section change" });
		}
	});

	// DELETE /api/doc-drafts/:id/section-changes/:changeId - Dismiss a section change
	router.delete("/:id/section-changes/:changeId", async (req: Request, res: Response) => {
		try {
			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}
			const { draft } = draftInfo;
			const { id, content } = draft;

			const changeId = Number.parseInt(req.params.changeId);
			if (Number.isNaN(changeId)) {
				return res.status(400).json({ error: "Invalid change ID" });
			}

			// Get the section change
			const change = await getDocDraftSectionChangesDao().getDocDraftSectionChanges(changeId);
			if (!change) {
				return res.status(404).json({ error: "Section change not found" });
			}

			if (change.draftId !== id) {
				return res.status(403).json({ error: "Section change does not belong to this draft" });
			}

			// Delete the change
			await getDocDraftSectionChangesDao().deleteDocDraftSectionChanges(changeId);

			// Re-annotate with updated change list
			const sections = await getSectionMarkupService().annotateDocDraft(id, content);
			const allChanges = await getDocDraftSectionChangesDao().findByDraftId(id);

			// Broadcast the dismissal to other connected users
			broadcastToDraft(chatService, id, {
				type: "section_change_dismissed",
				changeId,
				timestamp: new Date().toISOString(),
			});

			return res.json({
				sections,
				changes: allChanges,
			});
		} catch (error) {
			log.error(error, "Error dismissing section change");
			return res.status(500).json({ error: "Failed to dismiss section change" });
		}
	});

	return router;
}
