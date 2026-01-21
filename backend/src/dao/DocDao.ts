import type { DaoPostSyncHook, Database } from "../core/Database";
import { type Doc, defineDocs, type NewDoc } from "../model/Doc";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import { jrnParser } from "jolli-common";
import { buildPath, generateSlug } from "jolli-common/server";
import type { Sequelize, Transaction } from "sequelize";

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
	 * Looks up a Document by its ID.
	 * @param id the document ID.
	 */
	readDocById(id: number): Promise<Doc | undefined>;
	/**
	 * Lists all Documents currently in the repository.
	 * By default, excludes documents with JRNs starting with "/root" (internal/system docs).
	 * @param options.startsWithJrn optional JRN prefix to filter by.
	 * @param options.includeRoot if true, includes /root documents; if false (default), excludes them.
	 */
	listDocs(options?: { startsWithJrn?: string; includeRoot?: boolean }): Promise<Array<Doc>>;
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
	 * @param title the title to search for.
	 */
	searchDocsByTitle(title: string): Promise<Array<Doc>>;

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
}

export function createDocDao(sequelize: Sequelize): DocDao & DaoPostSyncHook {
	const Docs = defineDocs(sequelize);

	return {
		postSync,
		createDoc,
		readDoc,
		readDocById,
		listDocs,
		updateDoc,
		updateDocIfVersion,
		deleteDoc,
		deleteAllDocs,
		searchDocsByTitle,
		// Space tree methods
		getTreeContent,
		getTrashContent,
		softDelete,
		restore,
		getMaxSortOrder,
		hasDeletedDocs,
		renameDoc,
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
	}

	/**
	 * Migrates docs that have NULL slugs by generating slugs from their titles.
	 * This handles existing data when the slug column is first added.
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
			const timestamp = Date.now();
			// Use title from contentMetadata, or extract from jrn, or use "untitled"
			const title = doc.content_metadata?.title ?? doc.jrn.split(":").pop() ?? "untitled";
			const baseSlug = generateSlug(title);
			// Add timestamp to ensure uniqueness
			const slug = `${baseSlug}-${timestamp}`;

			await seq.query(`UPDATE docs SET slug = :slug WHERE id = :id`, { replacements: { slug, id: doc.id } });
			log.info({ id: doc.id, jrn: doc.jrn, slug }, "Generated slug for doc");
		}

		log.info("Completed doc slug migration");

		// 3. Try to add NOT NULL constraint (will fail if already set, which is OK)
		try {
			await seq.query(`ALTER TABLE docs ALTER COLUMN slug SET NOT NULL`);
			log.info("Added NOT NULL constraint to docs.slug column");
		} catch {
			// Constraint may already exist, ignore error
			log.debug("NOT NULL constraint already exists on docs.slug (or cannot be added)");
		}
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

	async function createDoc(doc: NewDoc): Promise<Doc> {
		// Extract title from contentMetadata for slug generation
		const title = (doc.contentMetadata as { title?: string })?.title ?? "untitled";
		const timestamp = Date.now();

		// Auto-generate slug if not provided
		const slug = doc.slug ?? `${generateSlug(title)}-${timestamp}`;

		// Auto-generate jrn if not provided
		const jrn = doc.jrn ?? (doc.docType === "folder" ? jrnParser.folder(slug) : jrnParser.document(slug));

		// Calculate path based on parent hierarchy
		let path = doc.path;
		if (!path) {
			if (doc.parentId) {
				const parentDoc = await Docs.findByPk(doc.parentId);
				path = parentDoc ? buildPath(parentDoc.path, slug) : buildPath(null, slug);
			} else {
				path = buildPath(null, slug);
			}
		}

		// biome-ignore lint/suspicious/noExplicitAny: Sequelize type limitation for create with partial fields
		return await Docs.create({ ...doc, slug, jrn, path, version: 1 } as any);
	}

	async function readDoc(jrn: string): Promise<Doc | undefined> {
		const doc = await Docs.findOne({ where: { jrn } });
		return doc ? doc.get({ plain: true }) : undefined;
	}

	async function readDocById(id: number): Promise<Doc | undefined> {
		const doc = await Docs.findByPk(id);
		return doc ? doc.get({ plain: true }) : undefined;
	}

	async function listDocs(options?: { startsWithJrn?: string; includeRoot?: boolean }): Promise<Array<Doc>> {
		const { startsWithJrn, includeRoot = false } = options ?? {};
		const docs = await Docs.findAll({ order: [["updatedAt", "DESC"]] });
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

	async function searchDocsByTitle(title: string): Promise<Array<Doc>> {
		const { Op } = await import("sequelize");
		const { jrnParser } = await import("jolli-common");
		// Normalize title the same way it's done when creating an article from a draft
		const normalizedTitle = title.toLowerCase().replace(/\s+/g, "-");
		// Build the article JRN prefix using jrnParser for consistent format
		const jrnPrefix = jrnParser.article(normalizedTitle);
		const docs = await Docs.findAll({
			where: {
				jrn: {
					[Op.like]: `${jrnPrefix}%`,
				},
			},
			order: [["updatedAt", "DESC"]],
		});
		return docs.map(doc => doc.get({ plain: true }));
	}

	// ========== Space Tree Methods ==========

	async function getTreeContent(spaceId: number, parentId?: number | null): Promise<Array<Doc>> {
		const { Op } = await import("sequelize");
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
		const { Op } = await import("sequelize");
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
		const { Op } = await import("sequelize");

		// Find deleted children that were cascade-deleted with this parent
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
		const { Op, fn, col } = await import("sequelize");
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
			attributes: [[fn("MAX", col("sortOrder")), "maxSortOrder"]],
			raw: true,
		});

		// biome-ignore lint/suspicious/noExplicitAny: Dynamic result from aggregate query
		const maxSortOrder = (result as any)?.maxSortOrder;
		return maxSortOrder ?? 0;
	}

	async function hasDeletedDocs(spaceId: number): Promise<boolean> {
		const { Op } = await import("sequelize");
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
}

export function createDocDaoProvider(defaultDao: DocDao): DaoProvider<DocDao> {
	return {
		getDao(context: TenantOrgContext | undefined): DocDao {
			return context?.database.docDao ?? defaultDao;
		},
	};
}
