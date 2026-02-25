import type { DaoPostSyncHook, Database } from "../core/Database";
import { defineSpaces, type NewSpace, type Space } from "../model/Space";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import { DEFAULT_SPACE_FILTERS, jrnParser } from "jolli-common";
import { generateUniqueSlug } from "jolli-common/server";
import { Op, type Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Spaces DAO
 */
export interface SpaceDao {
	/**
	 * Creates a new Space.
	 * @param space the space to create.
	 */
	createSpace(space: NewSpace): Promise<Space>;

	/**
	 * Gets a Space by ID.
	 * When userId is provided, returns undefined for personal spaces not owned by that user.
	 * @param id the space ID.
	 * @param userId optional user ID for personal space access filtering.
	 */
	getSpace(id: number, userId?: number): Promise<Space | undefined>;

	/**
	 * Gets a Space by JRN.
	 * @param jrn the space JRN.
	 */
	getSpaceByJrn(jrn: string): Promise<Space | undefined>;

	/**
	 * Gets a Space by slug.
	 * When userId is provided, returns undefined for personal spaces not owned by that user.
	 * @param slug the space slug.
	 * @param userId optional user ID for personal space access filtering.
	 */
	getSpaceBySlug(slug: string, userId?: number): Promise<Space | undefined>;

	/**
	 * Lists all Spaces in the current org.
	 * When userId is provided, excludes personal spaces not owned by that user.
	 * When omitted, returns all spaces (for internal callers).
	 * @param userId optional user ID for personal space access filtering.
	 */
	listSpaces(userId?: number): Promise<Array<Space>>;

	/**
	 * Updates a Space.
	 * @param id the space ID.
	 * @param update the fields to update.
	 */
	updateSpace(id: number, update: Partial<NewSpace>): Promise<Space | undefined>;

	/**
	 * Soft deletes a Space (sets deletedAt timestamp).
	 * @param id the space ID.
	 * @param deleteContent if true, also soft deletes all content in the space.
	 */
	deleteSpace(id: number, deleteContent?: boolean): Promise<void>;

	/**
	 * Migrates all content (docs) from one space to another.
	 * Content is moved to the target space's root level as per spec.
	 * @param sourceSpaceId the source space ID
	 * @param targetSpaceId the target space ID
	 */
	migrateContent(sourceSpaceId: number, targetSpaceId: number): Promise<void>;

	/**
	 * Gets statistics for a space (document and folder counts).
	 * @param spaceId the space ID
	 */
	getSpaceStats(spaceId: number): Promise<{ docCount: number; folderCount: number }>;

	/**
	 * Gets the default space without creating it.
	 * Returns the first space by creation time, or undefined if none exists.
	 * @returns the default space, or undefined if none exists
	 */
	getDefaultSpace(): Promise<Space | undefined>;

	/**
	 * Creates the default space for a user/org if it doesn't already exist.
	 * This is idempotent - safe to call multiple times.
	 * @param ownerId the user ID who will own the space
	 * @returns the created or existing default space
	 */
	createDefaultSpaceIfNeeded(ownerId: number): Promise<Space>;

	/**
	 * Migrates orphaned docs (spaceId = NULL) to the specified default space.
	 * Should be called after creating the default space in bootstrap.
	 * @param defaultSpaceId the ID of the default space to migrate docs to
	 */
	migrateOrphanedDocs(defaultSpaceId: number): Promise<void>;

	/**
	 * Gets the personal space for a user.
	 * @param userId the user ID (ownerId).
	 * @returns the personal space, or undefined if none exists.
	 */
	getPersonalSpace(userId: number): Promise<Space | undefined>;

	/**
	 * Creates a personal space for a user if one doesn't already exist.
	 * This is idempotent - safe to call multiple times for the same user.
	 * @param userId the user ID who will own the personal space.
	 * @returns the created or existing personal space.
	 */
	createPersonalSpaceIfNeeded(userId: number): Promise<Space>;

	/**
	 * Marks a user's personal space as orphaned when the user is deleted.
	 * The space is soft-deleted (deletedAt set) so its content is preserved but hidden.
	 * @param userId the owner ID of the personal space to orphan.
	 */
	orphanPersonalSpace(userId: number): Promise<void>;

	/**
	 * Hard deletes all spaces. Used by dev tools data clearer.
	 */
	deleteAllSpaces(): Promise<void>;
}

const DEFAULT_SPACE_NAME = "Default Space";
const PERSONAL_SPACE_NAME = "Personal Space";
const PERSONAL_SPACE_DESCRIPTION = "Your personal space for private notes, drafts, and ideas. Only you can see this.";

export function createSpaceDao(sequelize: Sequelize): SpaceDao & DaoPostSyncHook {
	const Spaces = defineSpaces(sequelize);

	return {
		postSync,
		createSpace,
		getSpace,
		getSpaceByJrn,
		getSpaceBySlug,
		listSpaces,
		updateSpace,
		deleteSpace,
		migrateContent,
		getSpaceStats,
		getDefaultSpace,
		createDefaultSpaceIfNeeded,
		migrateOrphanedDocs,
		getPersonalSpace,
		createPersonalSpaceIfNeeded,
		orphanPersonalSpace,
		deleteAllSpaces,
	};

	/** Returns true if the space is a personal space not owned by the given user. */
	function isInaccessiblePersonalSpace(space: Space, userId: number): boolean {
		return space.isPersonal && space.ownerId !== userId;
	}

	/**
	 * Post-sync hook that runs after database initialization.
	 * - Migrates spaces with NULL slugs by generating slugs from name.
	 * - Migrates spaces with old JRN format to standard JRN format.
	 * - Creates partial unique index to prevent duplicate personal spaces per user.
	 *
	 * Note: migrateOrphanedDocs is NOT called here because active_users may be empty
	 * at this point. It should be called from AdminRouter.bootstrap after creating
	 * the owner user and default space.
	 */
	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		// Run migrations sequentially to avoid connection pool exhaustion
		// Order matters: slugs -> JRNs -> indexes
		try {
			await migrateSpaceSlugs(sequelize);
		} catch (error) {
			log.error(error, "Error during space slug migration");
		}
		try {
			await migrateSpaceJrns(sequelize);
		} catch (error) {
			log.error(error, "Error during space JRN migration");
		}
		// Ensure only one active personal space per user (prevents race condition duplicates)
		try {
			await sequelize.query(`
				CREATE UNIQUE INDEX IF NOT EXISTS idx_spaces_personal_owner
				ON spaces (owner_id) WHERE is_personal = true AND deleted_at IS NULL;
			`);
		} catch (error) {
			log.error(error, "Error creating personal space unique index");
		}
	}

	/**
	 * Migrates docs that don't have a spaceId to the specified default space.
	 * This should be called from bootstrap after creating the default space.
	 * @param defaultSpaceId the ID of the default space to migrate docs to
	 */
	async function migrateOrphanedDocs(defaultSpaceId: number): Promise<void> {
		// 1. Check if there are orphaned docs (spaceId = NULL)
		const [orphanedResult] = await sequelize.query(`
			SELECT COUNT(*)::text as count FROM docs WHERE space_id IS NULL
		`);
		const orphanedCount = Number((orphanedResult as Array<{ count: string }>)[0]?.count ?? 0);

		if (orphanedCount === 0) {
			log.info("No orphaned docs to migrate");
			return;
		}

		log.info({ orphanedCount, defaultSpaceId }, "Migrating orphaned docs to default space");

		// 2. Update all orphaned docs to use the provided space ID
		await sequelize.query(`UPDATE docs SET space_id = :spaceId WHERE space_id IS NULL`, {
			replacements: { spaceId: defaultSpaceId },
		});

		log.info({ orphanedCount, defaultSpaceId }, "Migrated orphaned docs to default space");
	}

	/**
	 * Migrates spaces slugs:
	 * 1. Generate timestamp-based slugs for spaces with NULL slugs
	 * 2. Handle duplicate slugs by keeping the first (oldest by id) and renaming others with timestamps
	 */
	async function migrateSpaceSlugs(seq: Sequelize): Promise<void> {
		// Step 1: Check total space count
		const [countResult] = await seq.query(`SELECT COUNT(*)::text as count FROM spaces`);
		const totalSpaces = Number((countResult as Array<{ count: string }>)[0]?.count ?? 0);

		if (totalSpaces === 0) {
			log.info("No spaces to migrate");
			return;
		}

		// Step 2: Handle NULL slugs - generate unique slugs for all spaces with NULL slug
		const [nullSlugResult] = await seq.query(`SELECT id, name FROM spaces WHERE slug IS NULL`);
		const spacesWithNullSlug = nullSlugResult as Array<{ id: number; name: string }>;

		if (spacesWithNullSlug.length === 0) {
			log.info("No spaces with NULL slugs to migrate");
		} else {
			log.info({ count: spacesWithNullSlug.length }, "Found spaces with NULL slugs to migrate");
			for (const space of spacesWithNullSlug) {
				const slug = generateUniqueSlug(space.name);
				await seq.query(`UPDATE spaces SET slug = :slug WHERE id = :id`, {
					replacements: { slug, id: space.id },
				});
				log.info({ id: space.id, name: space.name, slug }, "Generated slug for space");
			}
		}

		// Step 3: Handle duplicate slugs (keep first by id, rename others)
		// Find all slugs that appear more than once
		const [duplicateResult] = await seq.query(`
			SELECT slug, COUNT(*)::text as count
			FROM spaces
			WHERE slug IS NOT NULL
			GROUP BY slug
			HAVING COUNT(*) > 1
		`);
		const duplicateSlugs = (duplicateResult as Array<{ slug: string; count: string }>).map(row => row.slug);

		if (duplicateSlugs.length > 0) {
			log.info({ duplicateSlugs }, "Found duplicate slugs to resolve");

			for (const duplicateSlug of duplicateSlugs) {
				// Get all spaces with this slug, ordered by id (oldest first)
				const [spacesResult] = await seq.query(
					`SELECT id, name FROM spaces WHERE slug = :slug ORDER BY id ASC`,
					{ replacements: { slug: duplicateSlug } },
				);
				const spaces = spacesResult as Array<{ id: number; name: string }>;

				// Keep first space (oldest by id), rename the rest
				const [firstSpace, ...duplicateSpaces] = spaces;
				log.info(
					{ slug: duplicateSlug, keepId: firstSpace.id, renameIds: duplicateSpaces.map(s => s.id) },
					"Resolving duplicate slug",
				);

				for (const space of duplicateSpaces) {
					const newSlug = generateUniqueSlug(space.name);
					await seq.query(`UPDATE spaces SET slug = :newSlug WHERE id = :id`, {
						replacements: { newSlug, id: space.id },
					});
					log.info({ id: space.id, oldSlug: duplicateSlug, newSlug }, "Renamed duplicate slug");
				}
			}
		} else {
			log.info("No duplicate slugs found");
		}

		log.info("Completed space slug migration");
	}

	/**
	 * Migrates spaces with old JRN format (e.g., "default", "space:xxx") to standard JRN format.
	 * Old formats: "default", "space:myspace"
	 * New format: "jrn:/global:spaces:space/default", "jrn:/global:spaces:space/myspace"
	 */
	async function migrateSpaceJrns(seq: Sequelize): Promise<void> {
		// Find spaces with old JRN format (those not starting with "jrn:")
		const [results] = await seq.query(`
			SELECT id, jrn, slug FROM spaces
			WHERE jrn NOT LIKE 'jrn:%'
		`);
		const spacesToMigrate = results as Array<{ id: number; jrn: string; slug: string }>;

		if (spacesToMigrate.length === 0) {
			log.info("No spaces with old JRN format to migrate");
			return;
		}

		log.info({ count: spacesToMigrate.length }, "Found spaces with old JRN format to migrate");

		for (const space of spacesToMigrate) {
			// Generate new JRN from slug
			const newJrn = jrnParser.space(space.slug);
			await seq.query(`UPDATE spaces SET jrn = :newJrn WHERE id = :id`, {
				replacements: { newJrn, id: space.id },
			});
			log.info({ id: space.id, oldJrn: space.jrn, newJrn }, "Migrated space JRN");
		}

		log.info("Completed space JRN migration");
	}

	async function createSpace(space: NewSpace): Promise<Space> {
		// Generate JRN from slug using standard format
		const jrn = jrnParser.space(space.slug);
		// biome-ignore lint/suspicious/noExplicitAny: Sequelize auto-generates id, createdAt, updatedAt
		const created = await Spaces.create({ ...space, jrn } as any);
		return created.get({ plain: true });
	}

	async function getSpace(id: number, userId?: number): Promise<Space | undefined> {
		const space = await Spaces.findOne({
			// biome-ignore lint/suspicious/noExplicitAny: Sequelize WhereOptions type limitation with Op.is
			where: { id, deletedAt: { [Op.is]: null } } as any,
		});
		const plain = space ? space.get({ plain: true }) : undefined;
		if (plain && userId !== undefined && isInaccessiblePersonalSpace(plain, userId)) {
			return;
		}
		return plain;
	}

	async function getSpaceByJrn(jrn: string): Promise<Space | undefined> {
		const space = await Spaces.findOne({
			// biome-ignore lint/suspicious/noExplicitAny: Sequelize WhereOptions type limitation with Op.is
			where: { jrn, deletedAt: { [Op.is]: null } } as any,
		});
		return space ? space.get({ plain: true }) : undefined;
	}

	async function getSpaceBySlug(slug: string, userId?: number): Promise<Space | undefined> {
		const space = await Spaces.findOne({
			// biome-ignore lint/suspicious/noExplicitAny: Sequelize WhereOptions type limitation with Op.is
			where: { slug, deletedAt: { [Op.is]: null } } as any,
		});
		const plain = space ? space.get({ plain: true }) : undefined;
		if (plain && userId !== undefined && isInaccessiblePersonalSpace(plain, userId)) {
			return;
		}
		return plain;
	}

	async function listSpaces(userId?: number): Promise<Array<Space>> {
		// When userId is provided, exclude personal spaces not owned by that user.
		// When omitted, return all non-deleted spaces (for internal callers like getDefaultSpace).
		// biome-ignore lint/suspicious/noExplicitAny: Sequelize WhereOptions type limitation with Op.is
		const where: any = { deletedAt: { [Op.is]: null } };
		if (userId !== undefined) {
			where[Op.or] = [{ isPersonal: false }, { isPersonal: true, ownerId: userId }];
		}
		const spaces = await Spaces.findAll({
			where,
			order: [["createdAt", "ASC"]],
		});
		return spaces.map(space => space.get({ plain: true }));
	}

	async function updateSpace(id: number, update: Partial<NewSpace>): Promise<Space | undefined> {
		const [affectedCount] = await Spaces.update(update, { where: { id } });
		if (affectedCount === 0) {
			return;
		}
		return getSpace(id);
	}

	/**
	 * Soft deletes a Space by setting deletedAt timestamp.
	 * If deleteContent is true, also soft deletes all documents in the space.
	 * @param id the space ID to delete
	 * @param deleteContent if true, cascade soft delete all docs (sets explicitlyDeleted=true)
	 */
	async function deleteSpace(id: number, deleteContent = false): Promise<void> {
		const now = new Date();

		if (deleteContent) {
			// Cascade soft delete: mark all non-deleted docs in this space as deleted
			// Use explicitlyDeleted=true since user explicitly chose "Delete all content"
			await sequelize.query(
				`UPDATE docs SET deleted_at = :now, explicitly_deleted = true WHERE space_id = :id AND deleted_at IS NULL`,
				{ replacements: { now, id } },
			);
			log.info("Cascade soft deleted all docs in space %d", id);
		}

		// Soft delete the space itself
		await Spaces.update({ deletedAt: now }, { where: { id } });
		log.info("Soft deleted space %d (deleteContent=%s)", id, deleteContent);
	}

	/**
	 * Migrates all content from source space to target space.
	 * All docs are moved to the target space's root level (per JOLLI-442 spec).
	 * The folder/document hierarchy is preserved - only top-level items move to root.
	 */
	async function migrateContent(sourceSpaceId: number, targetSpaceId: number): Promise<void> {
		// Validate both spaces exist
		const sourceSpace = await getSpace(sourceSpaceId);
		const targetSpace = await getSpace(targetSpaceId);
		if (!sourceSpace) {
			throw new Error(`Source space ${sourceSpaceId} not found`);
		}
		if (!targetSpace) {
			throw new Error(`Target space ${targetSpaceId} not found`);
		}

		// Move all docs from source to target space (including deleted docs)
		// The parentId relationships are preserved, so folder structure stays intact
		// Top-level items (parentId = null) will be at root level in target space
		await sequelize.query(`UPDATE docs SET space_id = :targetSpaceId WHERE space_id = :sourceSpaceId`, {
			replacements: { sourceSpaceId, targetSpaceId },
		});

		log.info("Migrated content from space %d to space %d", sourceSpaceId, targetSpaceId);
	}

	/**
	 * Gets document and folder counts for a space.
	 */
	async function getSpaceStats(spaceId: number): Promise<{ docCount: number; folderCount: number }> {
		const [results] = await sequelize.query(
			`SELECT
				COUNT(*) FILTER (WHERE type = 'document') as doc_count,
				COUNT(*) FILTER (WHERE type = 'folder') as folder_count
			FROM docs
			WHERE space_id = :spaceId AND deleted_at IS NULL`,
			{ replacements: { spaceId } },
		);
		const row = (results as Array<{ doc_count: string; folder_count: string }>)[0];
		return {
			docCount: Number(row?.doc_count ?? 0),
			folderCount: Number(row?.folder_count ?? 0),
		};
	}

	/**
	 * Gets the default space without creating it.
	 * Returns the first space by creation time, or undefined if none exists.
	 * @returns the default space, or undefined if none exists
	 */
	async function getDefaultSpace(): Promise<Space | undefined> {
		// Return first space in org (ordered by createdAt ASC)
		const orgSpaces = await listSpaces();
		if (orgSpaces.length > 0) {
			return orgSpaces[0];
		}

		// No space found - return undefined instead of creating
		log.warn("No default space found for org - space should have been created during user/org initialization");
		return;
	}

	/**
	 * Creates the default space for a user/org if it doesn't already exist.
	 * This is idempotent - safe to call multiple times.
	 * Uses timestamp-based slug for uniqueness.
	 * @param ownerId the user ID who will own the space
	 * @returns the created or existing default space
	 */
	async function createDefaultSpaceIfNeeded(ownerId: number): Promise<Space> {
		// Check if org has any spaces at all
		const orgSpaces = await listSpaces();
		if (orgSpaces.length > 0) {
			return orgSpaces[0];
		}

		// Create default space with unique slug
		const slug = generateUniqueSlug(DEFAULT_SPACE_NAME);
		const space = await createSpace({
			name: DEFAULT_SPACE_NAME,
			slug,
			description: "Default workspace for documents",
			ownerId,
			isPersonal: false,
			defaultSort: "default",
			defaultFilters: { ...DEFAULT_SPACE_FILTERS },
		});

		log.info("Created default space for org with ownerId: %d, slug: %s", ownerId, slug);
		return space;
	}

	/**
	 * Gets the personal space for a user.
	 * Returns undefined if no personal space exists for the given user.
	 */
	async function getPersonalSpace(userId: number): Promise<Space | undefined> {
		const space = await Spaces.findOne({
			// biome-ignore lint/suspicious/noExplicitAny: Sequelize WhereOptions type limitation with Op.is
			where: { ownerId: userId, isPersonal: true, deletedAt: { [Op.is]: null } } as any,
		});
		return space ? space.get({ plain: true }) : undefined;
	}

	/**
	 * Creates a personal space for a user if one doesn't already exist.
	 * This is idempotent - safe to call multiple times for the same user.
	 * Handles concurrent creation via unique index constraint (idx_spaces_personal_owner).
	 */
	async function createPersonalSpaceIfNeeded(userId: number): Promise<Space> {
		const existing = await getPersonalSpace(userId);
		if (existing) {
			return existing;
		}

		try {
			const slug = generateUniqueSlug(PERSONAL_SPACE_NAME);
			const space = await createSpace({
				name: PERSONAL_SPACE_NAME,
				slug,
				description: PERSONAL_SPACE_DESCRIPTION,
				ownerId: userId,
				isPersonal: true,
				defaultSort: "default",
				defaultFilters: { ...DEFAULT_SPACE_FILTERS },
			});

			log.info("Created personal space for userId: %d, slug: %s", userId, slug);
			return space;
		} catch (error: unknown) {
			// Handle unique constraint violation from concurrent creation
			// (idx_spaces_personal_owner ensures one active personal space per user)
			const err = error as { name?: string; parent?: { code?: string } };
			if (err.name === "SequelizeUniqueConstraintError" || err.parent?.code === "23505") {
				log.info("Concurrent personal space creation detected for userId: %d, fetching existing", userId);
				const concurrentlyCreated = await getPersonalSpace(userId);
				if (concurrentlyCreated) {
					return concurrentlyCreated;
				}
			}
			throw error;
		}
	}

	/**
	 * Marks a user's personal space as orphaned by soft-deleting it.
	 * Content is preserved (not cascade deleted) for potential recovery.
	 */
	async function orphanPersonalSpace(userId: number): Promise<void> {
		const personalSpace = await getPersonalSpace(userId);
		if (!personalSpace) {
			log.info("No personal space to orphan for userId: %d", userId);
			return;
		}

		await deleteSpace(personalSpace.id);
		log.info("Orphaned personal space %d for deleted userId: %d", personalSpace.id, userId);
	}

	/**
	 * Hard deletes all spaces. Used by dev tools data clearer.
	 */
	async function deleteAllSpaces(): Promise<void> {
		await Spaces.destroy({ where: {} });
		log.info("Deleted all spaces");
	}
}

export function createSpaceDaoProvider(defaultDao: SpaceDao): DaoProvider<SpaceDao> {
	return {
		getDao(context: TenantOrgContext | undefined): SpaceDao {
			return context?.database.spaceDao ?? defaultDao;
		},
	};
}
