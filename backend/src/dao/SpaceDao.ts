import type { DaoPostSyncHook, Database } from "../core/Database";
import { defineSpaces, type NewSpace, type Space } from "../model/Space";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import { jrnParser } from "jolli-common";
import { generateSlug } from "jolli-common/server";
import type { Sequelize } from "sequelize";

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
	 * @param id the space ID.
	 */
	getSpace(id: number): Promise<Space | undefined>;

	/**
	 * Gets a Space by JRN.
	 * @param jrn the space JRN.
	 */
	getSpaceByJrn(jrn: string): Promise<Space | undefined>;

	/**
	 * Gets a Space by slug.
	 * @param slug the space slug.
	 */
	getSpaceBySlug(slug: string): Promise<Space | undefined>;

	/**
	 * Lists all Spaces accessible to a user.
	 * @param userId the user ID.
	 */
	listSpaces(userId: number): Promise<Array<Space>>;

	/**
	 * Updates a Space.
	 * @param id the space ID.
	 * @param update the fields to update.
	 */
	updateSpace(id: number, update: Partial<NewSpace>): Promise<Space | undefined>;

	/**
	 * Deletes a Space.
	 * @param id the space ID.
	 */
	deleteSpace(id: number): Promise<void>;

	/**
	 * Gets or creates the default Space for a user.
	 * @param ownerId the owner user ID.
	 */
	getOrCreateDefaultSpace(ownerId: number): Promise<Space>;
}

const DEFAULT_SPACE_SLUG = "default";
const DEFAULT_SPACE_JRN = jrnParser.space(DEFAULT_SPACE_SLUG);
const DEFAULT_SPACE_NAME = "Default Space";

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
		getOrCreateDefaultSpace,
	};

	/**
	 * Post-sync hook that runs after database initialization.
	 * - Migrates spaces with NULL slugs by generating slugs from name.
	 * - Migrates spaces with old JRN format to standard JRN format.
	 * - Migrates orphaned docs (with spaceId = NULL) to the default space.
	 *
	 * IMPORTANT: migrateSpaceJrns must run BEFORE migrateOrphanedDocs because
	 * migrateOrphanedDocs uses the new JRN format to create/find the default space.
	 * If old JRNs are not migrated first, a duplicate space would be created.
	 */
	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		// Run migrations sequentially to avoid connection pool exhaustion
		// Order matters: slugs -> JRNs -> orphaned docs
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
		try {
			await migrateOrphanedDocs(sequelize);
		} catch (error) {
			log.error(error, "Error during orphaned docs migration");
		}
	}

	/**
	 * Migrates docs that don't have a spaceId to the default space.
	 */
	async function migrateOrphanedDocs(seq: Sequelize): Promise<void> {
		// 1. Check if there are orphaned docs (spaceId = NULL)
		const [orphanedResult] = await seq.query(`
			SELECT COUNT(*)::text as count FROM docs WHERE space_id IS NULL
		`);
		const orphanedCount = Number((orphanedResult as Array<{ count: string }>)[0]?.count ?? 0);

		if (orphanedCount === 0) {
			log.info("No orphaned docs to migrate");
			return;
		}

		log.info({ orphanedCount }, "Found orphaned docs to migrate");

		// 2. Get the first user as the default space owner
		const [usersResult] = await seq.query(`
			SELECT id FROM users ORDER BY id ASC LIMIT 1
		`);

		if (!usersResult || (usersResult as Array<{ id: number }>).length === 0) {
			log.warn("No users found, skipping space migration");
			return;
		}

		const firstUserId = (usersResult as Array<{ id: number }>)[0].id;
		log.info({ ownerId: firstUserId }, "Using first user as default space owner");

		// 3. Create or get the default space (use slug for lookup - more stable than JRN)
		const [existingSpaceResult] = await seq.query(`SELECT id FROM spaces WHERE slug = :slug LIMIT 1`, {
			replacements: { slug: DEFAULT_SPACE_SLUG },
		});
		const existingSpace = (existingSpaceResult as Array<{ id: number }>)[0];

		if (!existingSpace) {
			// Only create if no space with this slug exists
			await seq.query(
				`
				INSERT INTO spaces (jrn, slug, name, description, owner_id, default_sort, default_filters, created_at, updated_at)
				VALUES (:jrn, :slug, :name, :description, :ownerId, :defaultSort, :defaultFilters, NOW(), NOW())
				ON CONFLICT (slug) DO NOTHING
			`,
				{
					replacements: {
						jrn: DEFAULT_SPACE_JRN,
						slug: DEFAULT_SPACE_SLUG,
						name: DEFAULT_SPACE_NAME,
						description: "Default workspace for documents",
						ownerId: firstUserId,
						defaultSort: "default",
						defaultFilters: "{}",
					},
				},
			);
			log.info("Created default space for orphaned docs migration");
		} else {
			log.info({ spaceId: existingSpace.id }, "Using existing default space for orphaned docs migration");
		}

		// 4. Migrate orphaned docs to the default space (use slug for lookup)
		const [updateResult] = await seq.query(
			`
			UPDATE docs
			SET space_id = (SELECT id FROM spaces WHERE slug = :slug LIMIT 1)
			WHERE space_id IS NULL
		`,
			{ replacements: { slug: DEFAULT_SPACE_SLUG } },
		);

		log.info({ result: updateResult }, "Migrated orphaned docs to default space");
	}

	/**
	 * Migrates spaces slugs:
	 * 1. If there's only ONE space in the system, ensure its slug is "default" (regardless of current value)
	 * 2. If there are multiple spaces, generate timestamp-based slugs for those with NULL slugs
	 * 3. Add NOT NULL constraint to slug column
	 */
	async function migrateSpaceSlugs(seq: Sequelize): Promise<void> {
		// Step 1: Check total space count
		const [countResult] = await seq.query(`SELECT COUNT(*)::text as count FROM spaces`);
		const totalSpaces = Number((countResult as Array<{ count: string }>)[0]?.count ?? 0);

		if (totalSpaces === 0) {
			log.info("No spaces to migrate");
			return;
		}

		// Step 2: If only ONE space exists, ensure it has slug "default"
		// This handles both NULL slugs and non-default slugs (e.g., "abcdefgh")
		if (totalSpaces === 1) {
			const [spaceResult] = await seq.query(`SELECT id, name, slug FROM spaces LIMIT 1`);
			const space = (spaceResult as Array<{ id: number; name: string; slug: string | null }>)[0];

			if (space && space.slug !== DEFAULT_SPACE_SLUG) {
				await seq.query(`UPDATE spaces SET slug = :slug WHERE id = :id`, {
					replacements: { slug: DEFAULT_SPACE_SLUG, id: space.id },
				});
				log.info(
					{ id: space.id, name: space.name, oldSlug: space.slug, newSlug: DEFAULT_SPACE_SLUG },
					"Updated single space to default slug",
				);
			} else {
				log.info("Single space already has default slug");
			}
		} else {
			// Step 3: Multiple spaces - only handle NULL slugs with timestamp-based slugs
			const [nullSlugResult] = await seq.query(`SELECT id, name FROM spaces WHERE slug IS NULL`);
			const spacesWithNullSlug = nullSlugResult as Array<{ id: number; name: string }>;

			if (spacesWithNullSlug.length === 0) {
				log.info("No spaces with NULL slugs to migrate");
			} else {
				log.info({ count: spacesWithNullSlug.length }, "Found spaces with NULL slugs to migrate");
				for (const space of spacesWithNullSlug) {
					const timestamp = Date.now();
					const baseSlug = generateSlug(space.name);
					// Add timestamp to ensure uniqueness
					const slug = `${baseSlug}-${timestamp}`;
					await seq.query(`UPDATE spaces SET slug = :slug WHERE id = :id`, {
						replacements: { slug, id: space.id },
					});
					log.info({ id: space.id, name: space.name, slug }, "Generated slug for space");
				}
			}
		}

		log.info("Completed space slug migration");

		// Step 4: Try to add NOT NULL constraint (will fail if already set, which is OK)
		try {
			await seq.query(`ALTER TABLE spaces ALTER COLUMN slug SET NOT NULL`);
			log.info("Added NOT NULL constraint to spaces.slug column");
		} catch {
			// Constraint may already exist, ignore error
			log.debug("NOT NULL constraint already exists on spaces.slug (or cannot be added)");
		}
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

	async function getSpace(id: number): Promise<Space | undefined> {
		const space = await Spaces.findByPk(id);
		return space ? space.get({ plain: true }) : undefined;
	}

	async function getSpaceByJrn(jrn: string): Promise<Space | undefined> {
		const space = await Spaces.findOne({ where: { jrn } });
		return space ? space.get({ plain: true }) : undefined;
	}

	async function getSpaceBySlug(slug: string): Promise<Space | undefined> {
		const space = await Spaces.findOne({ where: { slug } });
		return space ? space.get({ plain: true }) : undefined;
	}

	async function listSpaces(userId: number): Promise<Array<Space>> {
		// Return all spaces owned by the user
		const spaces = await Spaces.findAll({
			where: { ownerId: userId },
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

	async function deleteSpace(id: number): Promise<void> {
		await Spaces.destroy({ where: { id } });
	}

	async function getOrCreateDefaultSpace(ownerId: number): Promise<Space> {
		// Try to find existing default space by slug (more stable than JRN which may change format)
		let space = await getSpaceBySlug(DEFAULT_SPACE_SLUG);
		if (space) {
			return space;
		}

		// Create default space (JRN is auto-generated from slug in createSpace)
		space = await createSpace({
			name: DEFAULT_SPACE_NAME,
			slug: DEFAULT_SPACE_SLUG,
			description: "Default workspace for documents",
			ownerId,
			defaultSort: "default",
			defaultFilters: {},
		});

		return space;
	}
}

export function createSpaceDaoProvider(defaultDao: SpaceDao): DaoProvider<SpaceDao> {
	return {
		getDao(context: TenantOrgContext | undefined): SpaceDao {
			return context?.database.spaceDao ?? defaultDao;
		},
	};
}
