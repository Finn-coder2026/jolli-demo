import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { DocHistoryDao, DocHistoryPaginatedResult } from "../dao/DocHistoryDao";
import type { Doc } from "../model/Doc";
import { DocHistoryService } from "../services/DocHistoryService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import express, { type Router } from "express";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Response type for GET /api/doc-histories/:id
 * Includes the decompressed doc snapshot.
 */
export interface DocHistoryDetailResponse {
	id: number;
	docId: number;
	userId: number;
	version: number;
	createdAt: Date;
	docSnapshot: Doc;
}

export function createDocHistoryRouter(
	docHistoryDaoProvider: DaoProvider<DocHistoryDao>,
	docDaoProvider?: DaoProvider<DocDao>,
	sequelize?: Sequelize,
): Router {
	const router = express.Router();
	const docHistoryService = new DocHistoryService();

	// Helper to get DAOs with tenant context
	function getDocHistoryDao(): DocHistoryDao {
		return docHistoryDaoProvider.getDao(getTenantContext());
	}
	function getDocDao(): DocDao | undefined {
		return docDaoProvider?.getDao(getTenantContext());
	}

	/**
	 * GET /api/doc-histories
	 *
	 * Query doc histories with pagination.
	 *
	 * Query parameters:
	 * - docId (required): Document ID to query histories for
	 * - userId (optional): Filter by user ID
	 * - page (optional): Page number (1-based, default: 1)
	 * - pageSize (optional): Items per page (default: 20, max: 100)
	 *
	 * Response:
	 * {
	 *   items: Array<DocHistorySummary>,
	 *   total: number,
	 *   page: number,
	 *   pageSize: number,
	 *   totalPages: number
	 * }
	 */
	router.get("/", async (req, res) => {
		try {
			const docHistoryDao = getDocHistoryDao();

			// Parse and validate docId (required)
			const docIdParam = req.query.docId;
			if (!docIdParam || typeof docIdParam !== "string") {
				res.status(400).json({ error: "docId is required" });
				return;
			}

			const docId = Number.parseInt(docIdParam, 10);
			if (Number.isNaN(docId)) {
				res.status(400).json({ error: "docId must be a valid number" });
				return;
			}

			// Parse userId (optional)
			let userId: number | undefined;
			const userIdParam = req.query.userId;
			if (userIdParam && typeof userIdParam === "string") {
				userId = Number.parseInt(userIdParam, 10);
				if (Number.isNaN(userId)) {
					res.status(400).json({ error: "userId must be a valid number" });
					return;
				}
			}

			// Parse pagination params
			let page = 1;
			const pageParam = req.query.page;
			if (pageParam && typeof pageParam === "string") {
				page = Number.parseInt(pageParam, 10);
				if (Number.isNaN(page) || page < 1) {
					res.status(400).json({ error: "page must be a positive number" });
					return;
				}
			}

			let pageSize = 20;
			const pageSizeParam = req.query.pageSize;
			if (pageSizeParam && typeof pageSizeParam === "string") {
				pageSize = Number.parseInt(pageSizeParam, 10);
				if (Number.isNaN(pageSize) || pageSize < 1) {
					res.status(400).json({ error: "pageSize must be a positive number" });
					return;
				}
				// Cap pageSize to prevent abuse
				if (pageSize > 100) {
					pageSize = 100;
				}
			}

			log.info(
				"Querying doc histories for docId=%d, userId=%s, page=%d, pageSize=%d",
				docId,
				userId,
				page,
				pageSize,
			);

			const result: DocHistoryPaginatedResult = await docHistoryDao.listDocHistoryPaginated({
				docId,
				...(userId !== undefined && { userId }),
				page,
				pageSize,
			});

			res.json(result);
		} catch (error) {
			log.error(error, "Error querying doc histories");
			res.status(500).json({ error: "Failed to query doc histories" });
		}
	});

	/**
	 * GET /api/doc-histories/:id
	 *
	 * Get a specific doc history entry by ID with decompressed snapshot.
	 *
	 * Path parameters:
	 * - id (required): DocHistory record ID
	 *
	 * Response:
	 * {
	 *   id: number,
	 *   docId: number,
	 *   userId: number,
	 *   version: number,
	 *   createdAt: Date,
	 *   docSnapshot: Doc  // Decompressed document snapshot
	 * }
	 */
	router.get("/:id", async (req, res) => {
		try {
			const docHistoryDao = getDocHistoryDao();

			// Parse and validate id (required)
			const idParam = req.params.id;
			const id = Number.parseInt(idParam, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "id must be a valid number" });
				return;
			}

			log.info("Getting doc history detail for id=%d", id);

			const history = await docHistoryDao.getDocHistory(id);
			if (!history) {
				res.status(404).json({ error: "Doc history not found" });
				return;
			}

			// Decompress the doc snapshot
			const docSnapshot = docHistoryService.decompressDocSnapshot(history.docSnapshot);

			const response: DocHistoryDetailResponse = {
				id: history.id,
				docId: history.docId,
				userId: history.userId,
				version: history.version,
				createdAt: history.createdAt,
				docSnapshot,
			};

			res.json(response);
		} catch (error) {
			log.error(error, "Error getting doc history detail");
			res.status(500).json({ error: "Failed to get doc history detail" });
		}
	});

	/**
	 * POST /api/doc-histories/:id/restore
	 *
	 * Restore a document to a historical version. This operation:
	 * 1. Checks if the current doc has referVersion in contentMetadata
	 * 2. If no referVersion: saves current doc state to doc_histories
	 * 3. Decompresses the historical doc_snapshot and applies its content
	 *    (content, contentType, source, sourceMetadata) to the current doc
	 * 4. Sets contentMetadata.referVersion to point to the historical version
	 * 5. Increments doc's version
	 * All operations are performed in a single transaction.
	 *
	 * Path parameters:
	 * - id (required): DocHistory record ID to restore from
	 *
	 * Response:
	 * {
	 *   success: boolean,
	 *   doc: Doc,  // The updated document with restored content
	 *   savedHistory: boolean  // Whether current version was saved to history
	 * }
	 */
	router.post("/:id/restore", async (req, res) => {
		try {
			const docHistoryDao = getDocHistoryDao();
			const docDao = getDocDao();

			// Use tenant-specific sequelize if available, otherwise fall back to default
			// This is critical for multi-tenant mode where the transaction must run on the
			// tenant's database, not the single-tenant default database
			const tenantContext = getTenantContext();
			const effectiveSequelize = tenantContext?.database.sequelize ?? sequelize;

			// Check if required dependencies are available
			if (!docDao || !effectiveSequelize) {
				log.error("restore: docDao or sequelize not available");
				res.status(500).json({ error: "Restore feature is not configured" });
				return;
			}

			// Parse and validate id (required)
			const idParam = req.params.id;
			const id = Number.parseInt(idParam, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "id must be a valid number" });
				return;
			}

			log.info("Starting restore process for history id=%d", id);

			// Get the history record to restore from
			const history = await docHistoryDao.getDocHistory(id);
			if (!history) {
				log.warn("restore: history record not found for id=%d", id);
				res.status(404).json({ error: "Doc history not found" });
				return;
			}

			// Get the current document by ID
			const currentDoc = await docDao.readDocById(history.docId);
			if (!currentDoc) {
				log.warn("restore: document not found for docId=%d", history.docId);
				res.status(404).json({ error: "Document not found" });
				return;
			}

			log.info(
				"restore: found current doc id=%d version=%d, history version=%d",
				currentDoc.id,
				currentDoc.version,
				history.version,
			);

			// Execute all operations in a transaction
			const result = await effectiveSequelize.transaction(async transaction => {
				let savedHistory = false;

				// Step 1: Check if current doc has referVersion
				const hasReferVersion = docHistoryService.getReferVersion(currentDoc) !== undefined;
				log.debug("restore: current doc has referVersion=%s", hasReferVersion);

				// Step 2: If no referVersion, save current doc state to history
				if (!hasReferVersion) {
					const docSnapshot = docHistoryService.compressDocSnapshot(currentDoc);
					await docHistoryDao.createDocHistory(
						{
							docId: currentDoc.id,
							userId: history.userId, // Use the same userId as the history record
							docSnapshot,
							version: currentDoc.version,
						},
						transaction,
					);
					savedHistory = true;
					log.info(
						"restore: saved current doc state to history, docId=%d, version=%d",
						currentDoc.id,
						currentDoc.version,
					);
				} else {
					log.debug("restore: skipping history save, current doc already has referVersion");
				}

				// Step 3: Decompress historical snapshot and apply content to current doc
				const historicalDoc = docHistoryService.decompressDocSnapshot(history.docSnapshot);
				log.debug("restore: decompressed historical doc snapshot, version=%d", historicalDoc.version);

				// Step 4: Update doc with historical content and set referVersion
				const newContentMetadata = docHistoryService.setReferVersion(
					historicalDoc.contentMetadata,
					history.version,
				);

				const updatedDoc = await docDao.updateDoc(
					{
						...currentDoc,
						// Restore content from historical snapshot
						content: historicalDoc.content,
						contentType: historicalDoc.contentType,
						source: historicalDoc.source,
						sourceMetadata: historicalDoc.sourceMetadata,
						// Set contentMetadata with referVersion pointing to historical version
						contentMetadata: newContentMetadata,
						version: currentDoc.version + 1,
					},
					transaction,
				);

				if (!updatedDoc) {
					throw new Error("Failed to update document");
				}

				log.info(
					"restore: updated doc id=%d to version=%d with content from historical version=%d",
					updatedDoc.id,
					updatedDoc.version,
					history.version,
				);

				return { doc: updatedDoc, savedHistory };
			});

			res.json({
				success: true,
				doc: result.doc,
				savedHistory: result.savedHistory,
			});
		} catch (error) {
			log.error(error, "Error restoring doc history");
			res.status(500).json({ error: "Failed to restore doc history" });
		}
	});

	return router;
}
