import type { DaoPostSyncHook, Database } from "../core/Database";
import { type Doc, defineDocs, type NewDoc } from "../model/Doc";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import {
	type ArticleLinkSearchResult,
	jrnParser,
	SPACE_SEARCH_MAX_RESULTS,
	type SpaceSearchResponse,
	type SpaceSearchResult,
} from "jolli-common";
import { buildPath, generateUniqueSlug } from "jolli-common/server";
import { col, fn, literal, Op, QueryTypes, type Sequelize, type Transaction } from "sequelize";

const log = getLog(import.meta);

/**
 * Documents DAO
 */
export interface DocDao {
	/**
	 * Creates a new Document if one does not already exist.
	 * @param doc the document to create.
	 */
	createDoc(doc: NewDoc): Promise<Doc>;
	/**
	 * Looks up a Document for the given JRN.
	 * @param jrn the JRN to look up the document by.
	 */
	readDoc(jrn: string): Promise<Doc | undefined>;
	/**
	 * Looks up multiple Documents by their JRNs in a single query.
	 * @param jrns the JRNs to look up.
	 */
	readDocsByJrns(jrns: Array<string>): Promise<Map<string, Doc>>;
	/**
	 * Looks up a Document by its ID.
	 * @param id the document ID.
	 */
	readDocById(id: number): Promise<Doc | undefined>;
	/**
	 * Lists all Documents currently in the repository.
	 * By default, excludes documents with JRNs starting with "/root" (internal/system docs).
	 * @param options.startsWithJrn optional JRN prefix to filter by.
	 * @param options.includeRoot if true, includes /root documents; if false (default), excludes them.
	 * @param options.spaceId optional space ID to filter by.
	 */
	listDocs(options?: { startsWithJrn?: string; includeRoot?: boolean; spaceId?: number }): Promise<Array<Doc>>;
	/**
	 * Updates a Document if one exists.
	 * @param doc the doc version update.
	 * @param transaction optional transaction to use for the update.
	 */
	updateDoc(doc: Doc, transaction?: Transaction): Promise<Doc | undefined>;
	/**
	 * Updates a document only if its current version matches expectedVersion.
	 * Uses transaction with row lock to prevent race conditions.
	 * @param doc the document to update (with new version already incremented).
	 * @param expectedVersion the version the document should currently have.
	 * @returns the updated doc on success, "conflict" if version mismatch.
	 */
	updateDocIfVersion(doc: Doc, expectedVersion: number): Promise<Doc | "conflict">;
	/**
	 * Deletes a Document.
	 * @param jrn the JRN of the Document to delete.
	 */
	deleteDoc(jrn: string): Promise<void>;
	/**
	 * Deletes all Documents.
	 */
	deleteAllDocs(): Promise<void>;
	/**
	 * Searches for documents by title (case-insensitive).
	 * When userId is provided, excludes docs from personal spaces not owned by that user.
	 * @param title the title to search for.
	 * @param userId optional user ID for personal space filtering.
	 */
	searchDocsByTitle(title: string, userId?: number): Promise<Array<Doc>>;
	/**
	 * Searches for articles matching a title, with optional space filtering.
	 * Returns results with parent folder name for display in article link menu.
	 * When userId is provided, excludes docs from personal spaces not owned by that user.
	 * @param title the title to search for (empty string returns recent articles).
	 * @param spaceId optional space ID to filter by.
	 * @param userId optional user ID for personal space filtering.
	 */
	searchArticlesForLink(title: string, spaceId?: number, userId?: number): Promise<Array<ArticleLinkSearchResult>>;

	// ========== Space Tree Methods ==========

	/**
	 * Gets non-deleted documents in a space, optionally filtered by parent.
	 * @param spaceId the space ID.
	 * @param parentId optional - undefined: get ALL docs, null: get root-level only, number: get children of that parent.
	 */
	getTreeContent(spaceId: number, parentId?: number | null): Promise<Array<Doc>>;

	/**
	 * Gets all deleted documents in a space (trash).
	 * @param spaceId the space ID.
	 */
	getTrashContent(spaceId: number): Promise<Array<Doc>>;

	/**
	 * Soft deletes a document and all its descendants.
	 * @param id the document ID.
	 */
	softDelete(id: number): Promise<void>;

	/**
	 * Restores a soft-deleted document and all its descendants.
	 * If the parent is still deleted, moves to space root.
	 * @param id the document ID.
	 */
	restore(id: number): Promise<void>;

	/**
	 * Gets the maximum sortOrder for documents at a given level.
	 * @param spaceId the space ID.
	 * @param parentId optional parent ID (null/undefined for root level).
	 */
	getMaxSortOrder(spaceId: number, parentId?: number | null): Promise<number>;

	/**
	 * Checks if a space has any deleted documents.
	 * @param spaceId the space ID.
	 */
	hasDeletedDocs(spaceId: number): Promise<boolean>;

	/**
	 * Renames a document by updating its title in contentMetadata.
	 * Does not change the slug or path (SEO-friendly behavior).
	 * @param id the document ID.
	 * @param newTitle the new title for the document.
	 * @returns the updated document, or undefined if not found.
	 */
	renameDoc(id: number, newTitle: string): Promise<Doc | undefined>;

	/**
	 * Gets all article content strings.
	 * Returns only the content field to minimize memory usage.
	 * Excludes /root internal docs and soft-deleted (trashed) docs.
	 * @returns Array of content strings from all non-deleted articles.
	 */
	getAllContent(): Promise<Array<{ content: string }>>;

	/**
	 * Searches for documents in a space by title and content using PostgreSQL full-text search.
	 * Returns up to SPACE_SEARCH_MAX_RESULTS results (hard limit). English only.
	 * @param spaceId the space ID to search in.
	 * @param query the search query string.
	 * @returns search results with content snippets and relevance scores.
	 */
	searchInSpace(spaceId: number, query: string): Promise<SpaceSearchResponse>;

	/**
	 * Reorders a document by moving it up or down among its siblings.
	 * Swaps sortOrder values with the adjacent sibling.
	 * @param id the document ID.
	 * @param direction "up" to move before previous sibling, "down" to move after next sibling.
	 * @returns the updated document, or undefined if not found or at boundary.
	 */
	reorderDoc(id: number, direction: "up" | "down"): Promise<Doc | undefined>;

	/**
	 * Moves a document to a new parent folder.
	 * Updates the path for the document and all its descendants recursively.
	 * Validates against circular references (cannot move folder to itself or its descendants).
	 * Uses transaction to ensure atomicity.
	 * @param id the document ID to move.
	 * @param newParentId the new parent folder ID (undefined for root level).
	 * @param referenceDocId optional - specify position: undefined/null = end, number = relative to that doc.
	 * @param position optional - "before" to place before referenceDocId, "after" to place after.
	 *                 When referenceDocId is undefined/null, position is ignored.
	 * @returns the updated document, or undefined if not found.
	 * @throws Error if move would create circular reference or if target parent is invalid.
	 */
	moveDoc(
		id: number,
		newParentId: number | undefined,
		referenceDocId?: number | null,
		position?: "before" | "after",
	): Promise<Doc | undefined>;

	/**
	 * Reorders a document to a specific position among its siblings.
	 * Uses fractional indexing to calculate the new sortOrder.
	 * @param id the document ID to reorder.
	 * @param referenceDocId optional - the ID of the reference document, or null/undefined to place at the end.
	 * @param position optional - "before" to place before referenceDocId, "after" to place after.
	 *                 When referenceDocId is null/undefined, position is ignored and document is placed at the end.
	 * @returns the updated document, or undefined if not found.
	 * @throws Error if referenceDocId is not a sibling of the document.
	 */
	reorderAt(id: number, referenceDocId?: number | null, position?: "before" | "after"): Promise<Doc | undefined>;

	/**
	 * Finds a folder by name within a specific space and parent.
	 * @param spaceId the space ID.
	 * @param parentId the parent folder ID (null for root level).
	 * @param name the folder name (matched against contentMetadata.title).
	 * @returns the folder Doc if found, undefined otherwise.
	 */
	findFolderByName(spaceId: number, parentId: number | null, name: string): Promise<Doc | undefined>;

	/**
	 * Finds a document by its source metadata path within a specific space.
	 * @param spaceId the space ID to search in.
	 * @param sourcePath the source file path (e.g., 'docs/getting-started.md').
	 * @returns the Doc if found, undefined otherwise.
	 */
	findDocBySourcePath(spaceId: number, sourcePath: string): Promise<Doc | undefined>;

	/**
	 * Finds a document by its source metadata path across all spaces.
	 * @param sourcePath the source file path (e.g., 'docs/getting-started.md').
	 * @param integrationId optional integration ID to scope the lookup and avoid cross-repo collisions.
	 * @returns the Doc if found, undefined otherwise.
	 */
	findDocBySourcePathAnySpace(sourcePath: string, integrationId?: number): Promise<Doc | undefined>;
}

export function createDocDao(sequelize: Sequelize): DocDao & DaoPostSyncHook {
	const Docs = defineDocs(sequelize);

	return {
		postSync,
		createDoc,
		readDoc,
		readDocsByJrns,
		readDocById,
		listDocs,
		updateDoc,
		updateDocIfVersion,
		deleteDoc,
		deleteAllDocs,
		searchDocsByTitle,
		searchArticlesForLink,
		// Space tree methods
		getTreeContent,
		getTrashContent,
		softDelete,
		restore,
		getMaxSortOrder,
		hasDeletedDocs,
		renameDoc,
		getAllContent,
		searchInSpace,
		reorderDoc,
		moveDoc,
		reorderAt,
		findFolderByName,
		findDocBySourcePath,
		findDocBySourcePathAnySpace,
	};

	/**
	 * Post-sync hook that runs after database initialization.
	 * Migrates docs with NULL slugs by generating slugs from their titles,
	 * then migrates docs with empty paths.
	 */
	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		// Run migrations sequentially to avoid connection pool exhaustion
		try {
			await migrateDocSlugs(sequelize);
		} catch (error) {
			log.error(error, "Error during doc slug migration");
		}
		try {
			await migrateDocPaths(sequelize);
		} catch (error) {
			log.error(error, "Error during doc path migration");
		}
		try {
			await migrateDocJrns(sequelize);
		} catch (error) {
			log.error(error, "Error during doc JRN migration");
		}
		try {
			await migrateSortOrder(sequelize);
		} catch (error) {
			log.error(error, "Error during doc sortOrder migration");
		}
	}

	/**
	 * Migrates docs that have NULL slugs by generating slugs from their titles.
	 * Safety net for any docs that may still have NULL slugs from legacy data.
	 */
	async function migrateDocSlugs(seq: Sequelize): Promise<void> {
		// 1. Check if there are docs with NULL slugs
		const [nullSlugResult] = await seq.query(`
			SELECT id, jrn, content_metadata, doc_type FROM docs WHERE slug IS NULL
		`);
		const docsWithNullSlug = nullSlugResult as Array<{
			id: number;
			jrn: string;
			content_metadata: { title?: string } | null;
			doc_type: string;
		}>;

		if (docsWithNullSlug.length === 0) {
			log.info("No docs with NULL slugs to migrate");
			return;
		}

		log.info({ count: docsWithNullSlug.length }, "Found docs with NULL slugs to migrate");

		// 2. Generate and update slugs for each doc
		for (const doc of docsWithNullSlug) {
			// Use title from contentMetadata, or extract from jrn, or use "untitled"
			const title = doc.content_metadata?.title ?? doc.jrn.split(":").pop() ?? "untitled";
			// Generate unique slug with nanoid suffix
			const slug = generateUniqueSlug(title);

			await seq.query(`UPDATE docs SET slug = :slug WHERE id = :id`, { replacements: { slug, id: doc.id } });
			log.info({ id: doc.id, jrn: doc.jrn, slug }, "Generated slug for doc");
		}

		log.info("Completed doc slug migration");
	}

	/**
	 * Migrates docs that have empty paths by calculating paths from their hierarchy.
	 * This handles existing data when path calculation is first implemented.
	 */
	async function migrateDocPaths(seq: Sequelize): Promise<void> {
		// 1. Check if there are docs with empty paths (excluding deleted docs)
		const [emptyPathResult] = await seq.query(`
			SELECT id, slug, parent_id FROM docs
			WHERE path = '' AND deleted_at IS NULL
			ORDER BY parent_id NULLS FIRST
		`);
		const docsWithEmptyPath = emptyPathResult as Array<{
			id: number;
			slug: string;
			parent_id: number | null;
		}>;

		if (docsWithEmptyPath.length === 0) {
			log.info("No docs with empty paths to migrate");
			return;
		}

		log.info({ count: docsWithEmptyPath.length }, "Found docs with empty paths to migrate");

		// 2. Build a map of doc IDs to paths for efficiency
		const pathMap = new Map<number, string>();

		for (const doc of docsWithEmptyPath) {
			let path: string;
			if (!doc.parent_id) {
				// Root level document
				path = buildPath(null, doc.slug);
			} else {
				// Check if parent path is already in our map
				let parentPath = pathMap.get(doc.parent_id);
				if (parentPath === undefined) {
					// Parent might already have a path in DB, fetch it
					const [parentResult] = await seq.query(`SELECT path FROM docs WHERE id = :parentId`, {
						replacements: { parentId: doc.parent_id },
					});
					const parentRows = parentResult as Array<{ path: string }>;
					parentPath = parentRows[0]?.path ?? "";
				}
				path = buildPath(parentPath, doc.slug);
			}

			pathMap.set(doc.id, path);
			await seq.query(`UPDATE docs SET path = :path WHERE id = :id`, { replacements: { path, id: doc.id } });
			log.debug({ id: doc.id, path }, "Generated path for doc");
		}

		log.info("Completed doc path migration");
	}

	/**
	 * Migrates docs that have old JRN format (folder:xxx or doc:xxx) to new format.
	 * New format: jrn:/global:docs:folder/xxx or jrn:/global:docs:document/xxx
	 */
	async function migrateDocJrns(seq: Sequelize): Promise<void> {
		// 1. Check if there are docs with old JRN format
		const [oldJrnResult] = await seq.query(`
			SELECT id, jrn, slug, doc_type FROM docs
			WHERE jrn NOT LIKE 'jrn:%'
		`);
		const docsWithOldJrn = oldJrnResult as Array<{
			id: number;
			jrn: string;
			slug: string;
			doc_type: string;
		}>;

		if (docsWithOldJrn.length === 0) {
			log.info("No docs with old JRN format to migrate");
			return;
		}

		log.info({ count: docsWithOldJrn.length }, "Found docs with old JRN format to migrate");

		// 2. Update JRNs to new format
		for (const doc of docsWithOldJrn) {
			const newJrn = doc.doc_type === "folder" ? jrnParser.folder(doc.slug) : jrnParser.document(doc.slug);
			await seq.query(`UPDATE docs SET jrn = :newJrn WHERE id = :id`, {
				replacements: { newJrn, id: doc.id },
			});
			log.info({ id: doc.id, oldJrn: doc.jrn, newJrn }, "Migrated doc JRN");
		}

		log.info("Completed doc JRN migration");
	}

	/**
	 * Migrates docs that have duplicate sortOrder values within the same parent.
	 * Reassigns sortOrder values sequentially based on document ID order.
	 */
	async function migrateSortOrder(seq: Sequelize): Promise<void> {
		// Find all unique (space_id, parent_id) combinations with non-deleted docs
		const [groupsResult] = await seq.query(`
			SELECT DISTINCT space_id, parent_id
			FROM docs
			WHERE deleted_at IS NULL
			ORDER BY space_id, parent_id NULLS FIRST
		`);
		const groups = groupsResult as Array<{
			space_id: number;
			parent_id: number | null;
		}>;

		if (groups.length === 0) {
			log.info("No docs to check for sortOrder migration");
			return;
		}

		log.info({ groupCount: groups.length }, "Checking docs for sortOrder duplicates");

		let totalFixed = 0;

		// Process each group
		for (const group of groups) {
			// Get all docs in this group, ordered by id (chronological proxy)
			// Use parameterized query to prevent SQL injection
			// Note: QueryTypes.SELECT returns array directly, not [results, metadata] tuple
			const docs = (await seq.query(
				`
				SELECT id, sort_order
				FROM docs
				WHERE space_id = :spaceId
					AND (parent_id = :parentId OR (parent_id IS NULL AND :parentId IS NULL))
					AND deleted_at IS NULL
				ORDER BY id ASC
				`,
				{
					replacements: { spaceId: group.space_id, parentId: group.parent_id },
					type: QueryTypes.SELECT,
				},
			)) as Array<{
				id: number;
				sort_order: number;
			}>;

			if (docs.length === 0) {
				continue;
			}

			// Check if there are duplicates
			const sortOrders = docs.map(d => d.sort_order);
			const hasDuplicates = sortOrders.length !== new Set(sortOrders).size;

			if (hasDuplicates) {
				// Reassign sortOrder values sequentially using parameterized queries
				for (let i = 0; i < docs.length; i++) {
					if (docs[i].sort_order !== i) {
						await seq.query(`UPDATE docs SET sort_order = :newSortOrder WHERE id = :docId`, {
							replacements: { newSortOrder: i, docId: docs[i].id },
							type: QueryTypes.UPDATE,
						});
						log.debug(
							{ id: docs[i].id, oldSortOrder: docs[i].sort_order, newSortOrder: i },
							"Fixed sortOrder",
						);
						totalFixed++;
					}
				}
			}
		}

		if (totalFixed > 0) {
			log.info({ totalFixed }, "Completed sortOrder migration");
		} else {
			log.info("No sortOrder duplicates found");
		}
	}

	async function createDoc(doc: NewDoc): Promise<Doc> {
		// Extract title from contentMetadata for slug generation
		const title = (doc.contentMetadata as { title?: string })?.title ?? "untitled";

		// Auto-generate slug if not provided (using nanoid for uniqueness)
		const slug = doc.slug ?? generateUniqueSlug(title);

		// Auto-generate jrn if not provided
		const jrn = doc.jrn ?? (doc.docType === "folder" ? jrnParser.folder(slug) : jrnParser.document(slug));

		// Calculate path based on parent hierarchy
		let path = doc.path;
		if (!path) {
			/* v8 ignore next 5 - Path calculation with parentId is covered by integration tests */
			if (doc.parentId) {
				const parentDoc = await Docs.findByPk(doc.parentId);
				path = parentDoc ? buildPath(parentDoc.path, slug) : buildPath(null, slug);
			} else {
				path = buildPath(null, slug);
			}
		}

		// Auto-calculate sortOrder if not provided
		let sortOrder = doc.sortOrder;
		/* v8 ignore next 4 - sortOrder auto-calculation is covered by integration tests */
		if (sortOrder === undefined && doc.spaceId !== undefined) {
			const maxSortOrder = await getMaxSortOrder(doc.spaceId, doc.parentId);
			sortOrder = maxSortOrder + 1;
		}

		// biome-ignore lint/suspicious/noExplicitAny: Sequelize type limitation for create with partial fields
		return await Docs.create({ ...doc, slug, jrn, path, sortOrder, version: 1 } as any);
	}

	async function readDoc(jrn: string): Promise<Doc | undefined> {
		const doc = await Docs.findOne({ where: { jrn } });
		return doc ? doc.get({ plain: true }) : undefined;
	}

	async function readDocsByJrns(jrns: Array<string>): Promise<Map<string, Doc>> {
		if (jrns.length === 0) {
			return new Map();
		}
		const docs = await Docs.findAll({ where: { jrn: { [Op.in]: jrns } } });
		const result = new Map<string, Doc>();
		for (const doc of docs) {
			const plain = doc.get({ plain: true });
			result.set(plain.jrn, plain);
		}
		return result;
	}

	async function readDocById(id: number): Promise<Doc | undefined> {
		const doc = await Docs.findByPk(id);
		return doc ? doc.get({ plain: true }) : undefined;
	}

	async function listDocs(options?: {
		startsWithJrn?: string;
		includeRoot?: boolean;
		spaceId?: number;
	}): Promise<Array<Doc>> {
		const { startsWithJrn, includeRoot = false, spaceId } = options ?? {};

		const whereClause: Record<string, unknown> = {
			deletedAt: { [Op.is]: null },
		};
		if (spaceId !== undefined) {
			whereClause.spaceId = spaceId;
		}

		const docs = await Docs.findAll({ where: whereClause, order: [["updatedAt", "DESC"]] });
		const plain = docs.map(doc => doc.get({ plain: true }));

		// Filter out docs with JRNs starting with /root (internal/system docs) unless includeRoot is true
		const filtered = includeRoot ? plain : plain.filter(doc => !doc.jrn.startsWith("/root"));

		if (!startsWithJrn) {
			return filtered;
		}
		// Filter by JRN prefix
		return filtered.filter(doc => doc.jrn.startsWith(startsWithJrn));
	}

	async function updateDoc(doc: Doc, transaction?: Transaction): Promise<Doc | undefined> {
		const oldDoc = await Docs.findOne({ where: { jrn: doc.jrn }, transaction: transaction ?? null });
		if (oldDoc && doc.version > oldDoc.version) {
			await Docs.update(doc, { where: { jrn: doc.jrn }, transaction: transaction ?? null });
			// Read the doc within the same transaction if provided
			const updatedDoc = await Docs.findOne({ where: { jrn: doc.jrn }, transaction: transaction ?? null });
			return updatedDoc ? updatedDoc.get({ plain: true }) : undefined;
		}
	}

	async function updateDocIfVersion(doc: Doc, expectedVersion: number): Promise<Doc | "conflict"> {
		const transaction = await sequelize.transaction();
		try {
			const oldDoc = await Docs.findOne({
				where: { jrn: doc.jrn },
				transaction,
				lock: transaction.LOCK.UPDATE,
			});

			if (!oldDoc || oldDoc.version !== expectedVersion) {
				await transaction.rollback();
				return "conflict";
			}

			await Docs.update(doc, { where: { jrn: doc.jrn }, transaction });

			await transaction.commit();
			const updated = await readDoc(doc.jrn);
			return updated ?? "conflict";
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	}

	async function deleteDoc(jrn: string): Promise<void> {
		await Docs.destroy({ where: { jrn } });
	}

	async function deleteAllDocs(): Promise<void> {
		await Docs.destroy({ where: {} });
	}

	/**
	 * Adds a SQL condition to exclude docs from personal spaces not owned by the given user.
	 * Uses a subquery against the spaces table for filtering.
	 */
	function addPersonalSpaceFilter(where: Record<string, unknown>, userId: number): void {
		// biome-ignore lint/suspicious/noExplicitAny: Sequelize Op.and is a symbol key, not a string
		const existing = (where as any)[Op.and];
		const condition = literal(
			`("space_id" IS NULL OR "space_id" NOT IN (SELECT id FROM spaces WHERE is_personal = true AND owner_id != ${Number(userId)} AND deleted_at IS NULL))`,
		);
		if (Array.isArray(existing)) {
			existing.push(condition);
		} else {
			// biome-ignore lint/suspicious/noExplicitAny: Sequelize Op.and is a symbol key, not a string
			(where as any)[Op.and] = [condition];
		}
	}

	async function searchDocsByTitle(title: string, userId?: number): Promise<Array<Doc>> {
		const { jrnParser } = await import("jolli-common");
		// Normalize title the same way it's done when creating an article from a draft
		const normalizedTitle = title.toLowerCase().replace(/\s+/g, "-");
		// Build the article JRN prefix using jrnParser for consistent format
		const jrnPrefix = jrnParser.article(normalizedTitle);
		const where: Record<string, unknown> = {
			jrn: { [Op.like]: `${jrnPrefix}%` },
		};
		if (userId !== undefined) {
			addPersonalSpaceFilter(where, userId);
		}
		const docs = await Docs.findAll({
			where,
			order: [["updatedAt", "DESC"]],
		});
		return docs.map(doc => doc.get({ plain: true }));
	}

	async function searchArticlesForLink(
		title: string,
		spaceId?: number,
		userId?: number,
	): Promise<Array<ArticleLinkSearchResult>> {
		const where: Record<string, unknown> = {
			docType: "document",
			deletedAt: { [Op.is]: null },
		};

		if (spaceId !== undefined) {
			where.spaceId = spaceId;
		}

		if (title) {
			const escapedTitle = title.replace(/[%_]/g, "\\$&");
			where["contentMetadata.title"] = { [Op.iLike]: `%${escapedTitle}%` };
		}

		if (userId !== undefined) {
			addPersonalSpaceFilter(where, userId);
		}

		const docs = await Docs.findAll({
			where,
			order: [["updatedAt", "DESC"]],
			limit: 10,
		});

		const plainDocs = docs.map(doc => doc.get({ plain: true }));

		// Batch-fetch parent folder names
		const parentIds = [...new Set(plainDocs.map(d => d.parentId).filter((id): id is number => id != null))];
		let parentMap = new Map<number, string>();

		if (parentIds.length > 0) {
			const parents = await Docs.findAll({
				where: { id: parentIds },
				attributes: ["id", "slug", "contentMetadata"],
			});
			parentMap = new Map(
				parents.map(p => {
					const plain = p.get({ plain: true });
					return [plain.id, plain.contentMetadata?.title || plain.slug];
				}),
			);
		}

		return plainDocs.map(doc => ({
			id: doc.id,
			jrn: doc.jrn,
			slug: doc.slug,
			path: doc.path,
			updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
			contentMetadata: doc.contentMetadata,
			parentFolderName: doc.parentId ? (parentMap.get(doc.parentId) ?? null) : null,
		}));
	}

	// ========== Space Tree Methods ==========

	async function getTreeContent(spaceId: number, parentId?: number | null): Promise<Array<Doc>> {
		const whereClause: Record<string, unknown> = {
			spaceId,
			deletedAt: { [Op.is]: null },
		};

		// Only filter by parentId if explicitly provided (not undefined)
		// undefined = get ALL docs, null = get root-level docs, number = get children of that parent
		if (parentId !== undefined) {
			if (parentId === null) {
				whereClause.parentId = { [Op.is]: null };
			} else {
				whereClause.parentId = parentId;
			}
		}

		const docs = await Docs.findAll({
			where: whereClause,
			order: [["sortOrder", "ASC"]],
		});
		return docs.map(doc => doc.get({ plain: true }));
	}

	async function getTrashContent(spaceId: number): Promise<Array<Doc>> {
		const docs = await Docs.findAll({
			where: {
				spaceId,
				// biome-ignore lint/suspicious/noExplicitAny: Sequelize type limitation for null checks
				deletedAt: { [Op.not]: null } as any,
				// Only show items that were explicitly deleted (not cascade-deleted descendants)
				explicitlyDeleted: true,
			},
			order: [["deletedAt", "DESC"]],
		});
		return docs.map(doc => doc.get({ plain: true }));
	}

	async function softDelete(id: number): Promise<void> {
		const now = new Date();

		// Get all descendant IDs recursively
		const descendantIds = await getDescendantIds(id);

		// Update the target document with explicitlyDeleted=true
		await Docs.update({ deletedAt: now, explicitlyDeleted: true }, { where: { id } });

		// Update descendants with explicitlyDeleted=false (cascade deleted)
		// IMPORTANT: Only update descendants that are NOT already explicitly deleted
		// This preserves the explicitlyDeleted=true flag for items deleted independently before their parent
		if (descendantIds.length > 0) {
			await Docs.update(
				{ deletedAt: now, explicitlyDeleted: false },
				{
					where: {
						id: descendantIds,
						explicitlyDeleted: false,
					},
				},
			);
		}
	}

	async function restore(id: number): Promise<void> {
		const doc = await readDocById(id);
		if (!doc || !doc.deletedAt) {
			return; // Not deleted, nothing to restore
		}

		// Check if parent exists and is not deleted
		let newParentId = doc.parentId;
		let newPath: string;

		if (doc.parentId) {
			const parent = await readDocById(doc.parentId);
			if (parent && !parent.deletedAt) {
				// Parent exists and is not deleted - use parent's current path
				/* v8 ignore next - Restore with valid parent path covered by integration tests */
				newPath = buildPath(parent.path, doc.slug);
			} else {
				// Parent is deleted or doesn't exist, move to root
				newParentId = undefined;
				newPath = buildPath(null, doc.slug);
			}
		} else {
			// Was at root level
			newPath = buildPath(null, doc.slug);
		}

		// Update the restored document with new path and parentId
		await Docs.update(
			// biome-ignore lint/suspicious/noExplicitAny: Sequelize type limitation for null updates
			{ deletedAt: null, explicitlyDeleted: false, path: newPath, parentId: newParentId ?? null } as any,
			{ where: { id } },
		);

		// If this is a folder, recursively restore and update descendants
		if (doc.docType === "folder") {
			await restoreDescendants(id, newPath);
		}
	}

	/**
	 * Recursively restore cascade-deleted descendants and update their paths.
	 */
	async function restoreDescendants(parentId: number, parentPath: string): Promise<void> {
		// Find deleted children that were cascade-deleted with this parent
		/* v8 ignore next */
		const children = await Docs.findAll({
			where: {
				parentId,
				deletedAt: { [Op.ne]: null },
				explicitlyDeleted: false, // Only restore cascade-deleted items
				// biome-ignore lint/suspicious/noExplicitAny: Sequelize WhereOptions type limitation with Op.ne
			} as any,
		});

		for (const child of children) {
			const childDoc = child.get({ plain: true });
			const childPath = buildPath(parentPath, childDoc.slug);

			// biome-ignore lint/suspicious/noExplicitAny: Sequelize type limitation for null updates
			await Docs.update({ deletedAt: null, path: childPath } as any, { where: { id: childDoc.id } });

			if (childDoc.docType === "folder") {
				await restoreDescendants(childDoc.id, childPath);
			}
		}
	}

	async function getDescendantIds(parentId: number): Promise<Array<number>> {
		const children = await Docs.findAll({
			where: { parentId },
			attributes: ["id"],
		});

		const ids: Array<number> = [];
		for (const child of children) {
			const childId = child.get("id") as number;
			ids.push(childId);
			const grandchildIds = await getDescendantIds(childId);
			ids.push(...grandchildIds);
		}
		return ids;
	}

	async function getMaxSortOrder(spaceId: number, parentId?: number | null): Promise<number> {
		const whereClause: Record<string, unknown> = {
			spaceId,
			deletedAt: { [Op.is]: null },
		};

		if (parentId === null || parentId === undefined) {
			whereClause.parentId = { [Op.is]: null };
		} else {
			whereClause.parentId = parentId;
		}

		const result = await Docs.findOne({
			where: whereClause,
			// Use snake_case column name because Sequelize's col() doesn't auto-convert
			attributes: [[fn("MAX", col("sort_order")), "maxSortOrder"]],
			raw: true,
		});

		// biome-ignore lint/suspicious/noExplicitAny: Dynamic result from aggregate query
		const maxSortOrder = (result as any)?.maxSortOrder;
		return maxSortOrder ?? 0;
	}

	async function hasDeletedDocs(spaceId: number): Promise<boolean> {
		const count = await Docs.count({
			where: {
				spaceId,
				// biome-ignore lint/suspicious/noExplicitAny: Sequelize type limitation for null checks
				deletedAt: { [Op.not]: null } as any,
				// Only count items that were explicitly deleted
				explicitlyDeleted: true,
			},
		});
		return count > 0;
	}

	async function renameDoc(id: number, newTitle: string): Promise<Doc | undefined> {
		const doc = await readDocById(id);
		if (!doc) {
			return;
		}

		// Update only the title in contentMetadata, preserving other metadata
		const updatedContentMetadata = {
			...doc.contentMetadata,
			title: newTitle,
		};

		await Docs.update(
			{
				contentMetadata: updatedContentMetadata,
				version: doc.version + 1,
			},
			{ where: { id } },
		);

		return readDocById(id);
	}

	async function getAllContent(): Promise<Array<{ content: string }>> {
		const whereClause: Record<string, unknown> = {
			jrn: { [Op.notLike]: "/root%" },
			deletedAt: { [Op.is]: null },
		};
		const docs = await Docs.findAll({
			where: whereClause,
			attributes: ["content"],
		});
		return docs.map(doc => ({ content: doc.get("content") as string }));
	}

	/**
	 * Raw search result row from PostgreSQL full-text search query.
	 */
	interface RawSearchResultRow {
		id: number;
		jrn: string;
		slug: string;
		path: string;
		docType: "folder" | "document";
		contentMetadata: Record<string, unknown>;
		createdAt: string;
		updatedAt: string;
		updatedBy: string;
		spaceId: number;
		parentId: number | null;
		sortOrder: number;
		version: number;
		deletedAt: string | null;
		explicitlyDeleted: boolean;
		content_snippet: string;
		relevance: string;
		match_type: "title" | "content" | "both";
		total_count: string;
	}

	/**
	 * Extracts result array from sequelize.query response.
	 * Sequelize may return [results, metadata] tuple or just results array depending on configuration.
	 */
	/* v8 ignore start - Helper for searchInSpace, requires real PostgreSQL for testing */
	function extractQueryResults<T>(queryResult: unknown): Array<T> {
		if (Array.isArray(queryResult)) {
			// Check if it's a tuple [results, metadata] where first element is also an array
			if (queryResult.length === 2 && Array.isArray(queryResult[0])) {
				return queryResult[0] as Array<T>;
			}
			// It's directly the results array
			return queryResult as Array<T>;
		}
		return [];
	}
	/* v8 ignore stop */

	/**
	 * Searches for documents in a space by title and content using PostgreSQL full-text search.
	 * Returns up to SPACE_SEARCH_MAX_RESULTS results (hard limit). English only.
	 */
	/* v8 ignore start - Requires real PostgreSQL with full-text search for testing */
	async function searchInSpace(spaceId: number, query: string): Promise<SpaceSearchResponse> {
		const trimmedQuery = query.trim();

		if (!trimmedQuery) {
			return { results: [], total: 0, limited: false };
		}

		// Escape SQL ILIKE wildcard characters (% and _) for literal matching in title search
		const escapedQueryForIlike = trimmedQuery.replace(/[%_]/g, "\\$&");

		// Query results using raw SQL for full-text search support
		// Uses window function COUNT(*) OVER() to get total count in a single query for consistency
		const queryResult = await sequelize.query(
			`
			SELECT
				id, jrn, slug, path, doc_type as "docType",
				content_metadata as "contentMetadata",
				created_at as "createdAt",
				updated_at as "updatedAt",
				updated_by as "updatedBy",
				space_id as "spaceId",
				parent_id as "parentId",
				sort_order as "sortOrder",
				version,
				deleted_at as "deletedAt",
				explicitly_deleted as "explicitlyDeleted",
				-- Content snippet using ts_headline (handle NULL content)
				CASE WHEN content IS NOT NULL AND content != ''
					THEN ts_headline('english', content, plainto_tsquery('english', :query),
								'MaxFragments=2, MaxWords=30, MinWords=15')
					ELSE ''
				END as content_snippet,
				-- Relevance score (handle NULL content)
				CASE WHEN content IS NOT NULL AND content != ''
					THEN ts_rank(to_tsvector('english', content), plainto_tsquery('english', :query))
					ELSE 0
				END as relevance,
				-- Match type
				CASE
					WHEN (content_metadata->>'title') ILIKE '%' || :titleQuery || '%'
						 AND content IS NOT NULL AND content != ''
						 AND to_tsvector('english', content) @@ plainto_tsquery('english', :query)
					THEN 'both'
					WHEN (content_metadata->>'title') ILIKE '%' || :titleQuery || '%'
					THEN 'title'
					ELSE 'content'
				END as match_type,
				-- Total count before LIMIT (window function for consistency)
				COUNT(*) OVER() as total_count
			FROM docs
			WHERE space_id = :spaceId
				AND deleted_at IS NULL
				AND (
					(content_metadata->>'title') ILIKE '%' || :titleQuery || '%'
					OR (content IS NOT NULL AND content != '' AND to_tsvector('english', content) @@ plainto_tsquery('english', :query))
				)
			ORDER BY
				-- Title matches first
				CASE WHEN (content_metadata->>'title') ILIKE '%' || :titleQuery || '%' THEN 1 ELSE 2 END,
				relevance DESC,
				updated_at DESC
			LIMIT :limit
			`,
			{
				replacements: {
					spaceId,
					query: trimmedQuery,
					titleQuery: escapedQueryForIlike,
					limit: SPACE_SEARCH_MAX_RESULTS,
				},
				type: QueryTypes.SELECT,
			},
		);

		// Extract results array (handles both tuple and direct array formats)
		const resultRows = extractQueryResults<RawSearchResultRow>(queryResult);

		// Get total count from first row's window function result (0 if no results)
		const total = resultRows.length > 0 ? Number.parseInt(resultRows[0].total_count ?? "0", 10) : 0;

		// Transform results to SpaceSearchResult format
		const searchResults: Array<SpaceSearchResult> = resultRows.map(row => ({
			doc: {
				id: row.id,
				jrn: row.jrn,
				slug: row.slug,
				path: row.path,
				docType: row.docType,
				contentMetadata: row.contentMetadata,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
				updatedBy: row.updatedBy,
				spaceId: row.spaceId,
				parentId: row.parentId ?? undefined,
				sortOrder: row.sortOrder,
				version: row.version,
				deletedAt: row.deletedAt ?? undefined,
				explicitlyDeleted: row.explicitlyDeleted ?? false,
				// Don't return full content to reduce transfer size
				content: "",
				contentType: "",
				source: undefined,
				sourceMetadata: undefined,
				createdBy: undefined,
			},
			contentSnippet: row.content_snippet ?? "",
			matchType: row.match_type,
			relevance: Number.parseFloat(row.relevance) || 0,
		}));

		return {
			results: searchResults,
			total,
			limited: total > SPACE_SEARCH_MAX_RESULTS,
		};
	}
	/* v8 ignore stop */

	async function reorderDoc(id: number, direction: "up" | "down"): Promise<Doc | undefined> {
		// Get the current document
		const doc = await readDocById(id);
		if (!doc || doc.deletedAt) {
			return;
		}

		// Build where clause for siblings (same space, same parent, not deleted)
		const whereClause: Record<string, unknown> = {
			spaceId: doc.spaceId,
			deletedAt: { [Op.is]: null },
		};

		if (doc.parentId === null || doc.parentId === undefined) {
			whereClause.parentId = { [Op.is]: null };
			/* v8 ignore next 3 - Else branch covered by other tests */
		} else {
			whereClause.parentId = doc.parentId;
		}

		// Get all siblings sorted by sortOrder
		const siblings = await Docs.findAll({
			where: whereClause,
			order: [["sortOrder", "ASC"]],
		});

		const siblingDocs = siblings.map(s => s.get({ plain: true }));

		// Log sibling sortOrders for debugging
		log.debug(
			"reorderDoc: Found %d siblings: %s",
			siblingDocs.length,
			siblingDocs.map(s => `id=${s.id},sortOrder=${s.sortOrder}`).join(", "),
		);

		// Find current doc's index in siblings
		const currentIndex = siblingDocs.findIndex(s => s.id === id);
		/* v8 ignore next 3 - Defensive check: doc should always exist in siblings */
		if (currentIndex === -1) {
			return;
		}

		// Determine target index based on direction
		const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

		// Check if at boundary
		if (targetIndex < 0 || targetIndex >= siblingDocs.length) {
			log.debug(
				"reorderDoc: Cannot move doc %d %s - at boundary (currentIndex=%d, targetIndex=%d, siblings=%d)",
				id,
				direction,
				currentIndex,
				targetIndex,
				siblingDocs.length,
			);
			return;
		}

		// Get the adjacent sibling
		const adjacentDoc = siblingDocs[targetIndex];

		log.debug(
			"reorderDoc: Swapping doc %d (sortOrder=%d) with doc %d (sortOrder=%d)",
			doc.id,
			doc.sortOrder,
			adjacentDoc.id,
			adjacentDoc.sortOrder,
		);

		// Swap sortOrder values using a transaction
		const transaction = await sequelize.transaction();
		try {
			const currentSortOrder = doc.sortOrder;
			const adjacentSortOrder = adjacentDoc.sortOrder;

			await Docs.update({ sortOrder: adjacentSortOrder }, { where: { id: doc.id }, transaction });
			await Docs.update({ sortOrder: currentSortOrder }, { where: { id: adjacentDoc.id }, transaction });

			await transaction.commit();
			return readDocById(id);
			/* v8 ignore next 4 - Standard transaction rollback pattern */
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	}

	/**
	 * Checks if targetId is a descendant of ancestorId by comparing paths.
	 * This is more efficient than traversing the parent chain (avoids N+1 queries).
	 * @param targetId the ID to check.
	 * @param ancestorId the potential ancestor ID.
	 * @returns true if targetId is a descendant of ancestorId.
	 */
	async function isDescendantOf(targetId: number, ancestorId: number): Promise<boolean> {
		/* v8 ignore next 3 - Simple equality check, covered by validation logic */
		if (targetId === ancestorId) {
			return true;
		}

		// Single parallel query to get both paths
		const [target, ancestor] = await Promise.all([readDocById(targetId), readDocById(ancestorId)]);

		/* v8 ignore next 3 - Defensive check for non-existent documents */
		if (!target || !ancestor) {
			return false;
		}

		// Target is a descendant if its path starts with ancestor's path followed by /
		// e.g., "/parent/child" starts with "/parent/"
		return target.path.startsWith(`${ancestor.path}/`);
	}

	/**
	 * Recursively updates the path for all descendants of a parent.
	 * @param parentId the parent document ID.
	 * @param parentPath the new path of the parent.
	 * @param transaction the transaction to use for updates.
	 */
	async function updateDescendantPaths(
		parentId: number,
		parentPath: string,
		transaction: Transaction,
	): Promise<void> {
		const children = await Docs.findAll({
			where: { parentId },
			transaction,
		});

		for (const child of children) {
			const childDoc = child.get({ plain: true });
			const childPath = buildPath(parentPath, childDoc.slug);

			await Docs.update(
				{ path: childPath, version: childDoc.version + 1 },
				{ where: { id: childDoc.id }, transaction },
			);

			if (childDoc.docType === "folder") {
				await updateDescendantPaths(childDoc.id, childPath, transaction);
			}
		}
	}

	/**
	 * Builds a where clause for finding siblings in a parent folder.
	 * @param parentId the parent folder ID (undefined for root level).
	 * @param spaceId optional space ID to include in the filter.
	 */
	function buildParentWhereClause(parentId: number | undefined, spaceId?: number): Record<string, unknown> {
		const whereClause: Record<string, unknown> = {
			deletedAt: { [Op.is]: null },
		};
		if (spaceId !== undefined) {
			whereClause.spaceId = spaceId;
		}
		if (parentId === undefined) {
			whereClause.parentId = { [Op.is]: null };
		} else {
			whereClause.parentId = parentId;
		}
		return whereClause;
	}

	/**
	 * Validates the move operation and returns the new path.
	 * @throws Error if validation fails.
	 */
	async function validateMoveAndGetPath(doc: Doc, newParentId: number | undefined): Promise<string> {
		// Validate: cannot move to itself
		if (newParentId === doc.id) {
			throw new Error("Cannot move item to itself");
		}

		// Validate: if moving to a parent folder, check for circular reference
		if (doc.docType === "folder" && newParentId !== undefined) {
			const isCircular = await isDescendantOf(newParentId, doc.id);
			if (isCircular) {
				throw new Error("Cannot move folder to its descendant");
			}
		}

		// Calculate and return new path
		if (newParentId !== undefined) {
			const parent = await readDocById(newParentId);
			if (!parent || parent.deletedAt) {
				throw new Error("Target folder not found or has been deleted");
			}
			if (parent.docType !== "folder") {
				throw new Error("Target must be a folder");
			}
			return buildPath(parent.path, doc.slug);
		}
		return buildPath(null, doc.slug);
	}

	/**
	 * Calculates sortOrder for placing at the end of a folder.
	 */
	async function calculateSortOrderAtEnd(
		whereClause: Record<string, unknown>,
		transaction: Transaction | null = null,
	): Promise<number> {
		const siblings = await Docs.findAll({
			where: whereClause,
			order: [["sortOrder", "DESC"]],
			limit: 1,
			transaction,
		});
		if (siblings.length > 0) {
			return siblings[0].get({ plain: true }).sortOrder + 1.0;
		}
		return 1.0;
	}

	/**
	 * Calculates sortOrder for placing after a specific document.
	 * @param errorMessage custom error message for when referenceDocId is not found.
	 * @throws Error if referenceDocId is not found in the target folder.
	 */
	async function calculateSortOrderAfterDoc(
		whereClause: Record<string, unknown>,
		referenceDocId: number,
		excludeId: number,
		transaction: Transaction | null = null,
		errorMessage = "referenceDocId must be in the target folder",
	): Promise<number> {
		const siblings = await Docs.findAll({
			where: whereClause,
			order: [["sortOrder", "ASC"]],
			transaction,
		});
		const siblingDocs = siblings.map(s => s.get({ plain: true }));
		const referenceDocIndex = siblingDocs.findIndex(s => s.id === referenceDocId);

		if (referenceDocIndex === -1) {
			throw new Error(errorMessage);
		}

		const referenceDoc = siblingDocs[referenceDocIndex];
		const nextSiblings = siblingDocs.slice(referenceDocIndex + 1).filter(s => s.id !== excludeId);

		if (nextSiblings.length > 0) {
			return (referenceDoc.sortOrder + nextSiblings[0].sortOrder) / 2;
		}
		return referenceDoc.sortOrder + 1.0;
	}

	/**
	 * Calculates sortOrder for placing before a specific document.
	 * @param errorMessage custom error message for when referenceDocId is not found.
	 * @throws Error if referenceDocId is not found in the target folder.
	 */
	async function calculateSortOrderBeforeDoc(
		whereClause: Record<string, unknown>,
		referenceDocId: number,
		excludeId: number,
		transaction: Transaction | null = null,
		errorMessage = "referenceDocId must be in the target folder",
	): Promise<number> {
		const siblings = await Docs.findAll({
			where: whereClause,
			order: [["sortOrder", "ASC"]],
			transaction,
		});
		const siblingDocs = siblings.map(s => s.get({ plain: true })).filter(s => s.id !== excludeId);

		const referenceDocIndex = siblingDocs.findIndex(s => s.id === referenceDocId);

		if (referenceDocIndex === -1) {
			throw new Error(errorMessage);
		}

		const referenceDoc = siblingDocs[referenceDocIndex];

		if (referenceDocIndex === 0) {
			// Place before the first document
			// If referenceDoc.sortOrder is 0 or negative, use referenceDoc.sortOrder - 1 to avoid duplicates
			// Otherwise use referenceDoc.sortOrder / 2 for fractional indexing
			return referenceDoc.sortOrder <= 0 ? referenceDoc.sortOrder - 1 : referenceDoc.sortOrder / 2;
		}
		// Place between the previous sibling and the reference doc
		const prevDoc = siblingDocs[referenceDocIndex - 1];
		return (prevDoc.sortOrder + referenceDoc.sortOrder) / 2;
	}

	/**
	 * Gets sorted siblings for position checking.
	 */
	async function getSortedSiblings(
		whereClause: Record<string, unknown>,
		transaction: Transaction | null = null,
	): Promise<Array<Doc>> {
		const siblings = await Docs.findAll({
			where: whereClause,
			order: [["sortOrder", "ASC"]],
			transaction,
		});
		return siblings.map(s => s.get({ plain: true }));
	}

	/**
	 * Moves a document to a new parent folder.
	 * Updates the path for the document and all its descendants.
	 * Validates against circular references.
	 * @param id the document ID to move.
	 * @param newParentId the new parent folder ID (undefined for root level).
	 * @param referenceDocId optional - specify position: undefined/null = end, number = relative to that doc.
	 * @param position optional - "before" to place before referenceDocId, "after" to place after.
	 *                 When referenceDocId is undefined/null, position is ignored.
	 * @returns the updated document, or undefined if not found.
	 * @throws Error if move would create circular reference or if target parent is invalid.
	 */
	async function moveDoc(
		id: number,
		newParentId: number | undefined,
		referenceDocId?: number | null,
		position?: "before" | "after",
	): Promise<Doc | undefined> {
		const doc = await readDocById(id);
		if (!doc) {
			return;
		}

		// Check if already in target location (no-op) - only if referenceDocId is not specified
		const currentParentId = doc.parentId ?? undefined;
		if (currentParentId === newParentId && referenceDocId === undefined) {
			return doc;
		}

		// Validate move and get new path
		const newPath = await validateMoveAndGetPath(doc, newParentId);

		// Use transaction to ensure atomicity
		const transaction = await sequelize.transaction();
		try {
			const whereClause = buildParentWhereClause(newParentId, doc.spaceId);

			// Calculate new sortOrder based on referenceDocId and position
			let newSortOrder: number;
			if (referenceDocId === undefined || referenceDocId === null) {
				// No reference doc - place at the end
				newSortOrder = await calculateSortOrderAtEnd(whereClause, transaction);
			} else if (position === "before") {
				// Place before the reference doc
				newSortOrder = await calculateSortOrderBeforeDoc(whereClause, referenceDocId, id, transaction);
			} else {
				// Place after the reference doc (default if position is not specified)
				newSortOrder = await calculateSortOrderAfterDoc(whereClause, referenceDocId, id, transaction);
			}

			// Update current document's parentId, path, and sortOrder
			await Docs.update(
				{
					parentId: newParentId ?? null,
					path: newPath,
					sortOrder: newSortOrder,
					version: doc.version + 1,
					// biome-ignore lint/suspicious/noExplicitAny: Sequelize type limitation for null updates
				} as any,
				{
					where: { id },
					transaction,
				},
			);

			// If it's a folder, recursively update all descendant paths
			if (doc.docType === "folder") {
				await updateDescendantPaths(id, newPath, transaction);
			}

			await transaction.commit();
			log.info(
				"Moved document %d to parent %s, new path: %s, sortOrder: %d, referenceDocId: %s, position: %s",
				id,
				newParentId ?? "root",
				newPath,
				newSortOrder,
				referenceDocId ?? "null",
				position ?? "end",
			);
			return readDocById(id);
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	}

	/**
	 * Reorders a document to a specific position among its siblings.
	 * Uses fractional indexing to calculate the new sortOrder.
	 */
	async function reorderAt(
		id: number,
		referenceDocId?: number | null,
		position?: "before" | "after",
	): Promise<Doc | undefined> {
		const doc = await readDocById(id);
		if (!doc || doc.deletedAt) {
			return;
		}

		// If trying to place relative to itself, no-op
		if (referenceDocId === id) {
			return doc;
		}

		// Build where clause for siblings (same space, same parent, not deleted)
		const parentId = doc.parentId ?? undefined;
		const whereClause = buildParentWhereClause(parentId, doc.spaceId);

		// Get siblings to check current position
		const siblingDocs = await getSortedSiblings(whereClause);

		// Normalize referenceDocId: undefined is treated the same as null (move to end)
		const normalizedRefDocId = referenceDocId ?? null;

		// Check if already at the target position
		if (isAlreadyAtPositionNew(siblingDocs, id, normalizedRefDocId, position ?? "after")) {
			return doc;
		}

		// Calculate new sortOrder based on referenceDocId and position
		let newSortOrder: number;
		if (normalizedRefDocId === null) {
			// No reference doc means place at the end (e.g., dropping onto folder header)
			newSortOrder = await calculateSortOrderAtEnd(whereClause);
		} else if (position === "before") {
			newSortOrder = await calculateSortOrderBeforeDoc(
				whereClause,
				normalizedRefDocId,
				id,
				null,
				"referenceDocId must be a sibling of the document",
			);
		} else {
			// Default to "after" if position is not specified
			newSortOrder = await calculateSortOrderAfterDoc(
				whereClause,
				normalizedRefDocId,
				id,
				null,
				"referenceDocId must be a sibling of the document",
			);
		}

		// Update the document's sortOrder
		const transaction = await sequelize.transaction();
		try {
			await Docs.update({ sortOrder: newSortOrder, version: doc.version + 1 }, { where: { id }, transaction });

			await transaction.commit();
			log.info(
				"Reordered document %d to sortOrder %d (%s doc %s)",
				id,
				newSortOrder,
				position ?? "end",
				normalizedRefDocId ?? "null",
			);
			return readDocById(id);
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	}

	/**
	 * Checks if document is already at the target position (new version with position parameter).
	 */
	function isAlreadyAtPositionNew(
		siblings: Array<Doc>,
		docId: number,
		referenceDocId: number | null,
		position: "before" | "after",
	): boolean {
		const currentIndex = siblings.findIndex(s => s.id === docId);
		/* v8 ignore next 3 - Defensive check: docId should always exist in siblings */
		if (currentIndex === -1) {
			return false;
		}

		if (referenceDocId === null) {
			// Placing at end - check if already last
			return currentIndex === siblings.length - 1;
		}

		const referenceIndex = siblings.findIndex(s => s.id === referenceDocId);
		/* v8 ignore next 3 - Defensive check: handled by calculateSortOrder functions */
		if (referenceIndex === -1) {
			return false;
		}

		if (position === "before") {
			// Check if doc is immediately before reference
			return currentIndex === referenceIndex - 1;
		}
		// position === "after"
		// Check if doc is immediately after reference
		return currentIndex === referenceIndex + 1;
	}

	async function findFolderByName(spaceId: number, parentId: number | null, name: string): Promise<Doc | undefined> {
		const whereClause: Record<string, unknown> = {
			spaceId,
			docType: "folder",
			deletedAt: { [Op.is]: null },
		};

		if (parentId === null) {
			whereClause.parentId = { [Op.is]: null };
		} else {
			whereClause.parentId = parentId;
		}

		// Find all folders at this level and filter by title in contentMetadata
		const folders = await Docs.findAll({ where: whereClause });
		for (const folder of folders) {
			const plain = folder.get({ plain: true });
			const title = (plain.contentMetadata as { title?: string })?.title;
			if (title === name) {
				return plain;
			}
		}
		return;
	}

	async function findDocBySourcePath(spaceId: number, sourcePath: string): Promise<Doc | undefined> {
		// Normalize the path: remove leading "./" and trim whitespace
		const normalizedPath = sourcePath.replace(/^\.\//, "").trim();

		const whereClause: Record<string, unknown> = {
			spaceId,
			deletedAt: { [Op.is]: null },
			"sourceMetadata.path": normalizedPath,
		};
		let doc = await Docs.findOne({ where: whereClause });

		// If not found by full path, try matching just the filename
		if (!doc && normalizedPath.includes("/")) {
			const filename = normalizedPath.split("/").pop() || normalizedPath;
			const filenameWhereClause: Record<string, unknown> = {
				spaceId,
				deletedAt: { [Op.is]: null },
				"sourceMetadata.path": filename,
			};
			doc = await Docs.findOne({ where: filenameWhereClause });
		}

		return doc ? doc.get({ plain: true }) : undefined;
	}

	async function findDocBySourcePathAnySpace(sourcePath: string, integrationId?: number): Promise<Doc | undefined> {
		// Normalize the path: remove leading "./" and trim whitespace
		const normalizedPath = sourcePath.replace(/^\.\//, "").trim();

		// Build base where clause with parameterized JSONB path query
		const baseWhere: Record<string, unknown> = {
			deletedAt: { [Op.is]: null },
			"sourceMetadata.path": normalizedPath,
		};
		if (integrationId !== undefined) {
			baseWhere["source.integrationId"] = integrationId;
		}

		log.debug(
			"findDocBySourcePathAnySpace: searching for path '%s' (normalized from '%s'), integrationId=%s",
			normalizedPath,
			sourcePath,
			integrationId ?? "none",
		);
		let doc = await Docs.findOne({ where: baseWhere });

		// If not found by full path, try matching just the filename
		// This handles cases where old imports only stored filename, not full path
		if (!doc && normalizedPath.includes("/")) {
			const filename = normalizedPath.split("/").pop() || normalizedPath;
			const filenameWhere: Record<string, unknown> = {
				deletedAt: { [Op.is]: null },
				"sourceMetadata.path": filename,
			};
			if (integrationId !== undefined) {
				filenameWhere["source.integrationId"] = integrationId;
			}
			log.debug("findDocBySourcePathAnySpace: trying filename match '%s'", filename);
			doc = await Docs.findOne({ where: filenameWhere });
		}

		if (doc) {
			log.debug("findDocBySourcePathAnySpace: found doc id=%d jrn=%s", doc.get("id"), doc.get("jrn"));
		} else {
			log.debug("findDocBySourcePathAnySpace: no doc found for path '%s'", sourcePath);
		}
		return doc ? doc.get({ plain: true }) : undefined;
	}
}

export function createDocDaoProvider(defaultDao: DocDao): DaoProvider<DocDao> {
	return {
		getDao(context: TenantOrgContext | undefined): DocDao {
			return context?.database.docDao ?? defaultDao;
		},
	};
}
