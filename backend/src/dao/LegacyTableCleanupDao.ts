import type { DaoPostSyncHook, Database } from "../core/Database";
import { getLog } from "../util/Logger";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * DAO for cleaning up legacy authentication tables (users, auths) from tenant schemas.
 *
 * This DAO exists solely for its postSync hook which drops the deprecated 'users' and 'auths'
 * tables that were removed in JOLLI-521. These tables were replaced by:
 * - Tenant DBs: active_users, archived_users
 * - Manager DB: global_users, global_auths
 *
 * The postSync hook is idempotent and safe to run multiple times. Once all environments
 * have been migrated, this DAO can be removed from the codebase.
 */
// biome-ignore lint/suspicious/noEmptyInterface: This DAO exists only for its postSync hook
export interface LegacyTableCleanupDao {}

/**
 * Create a LegacyTableCleanupDao instance with postSync hook.
 */
export function createLegacyTableCleanupDao(sequelize: Sequelize): LegacyTableCleanupDao & DaoPostSyncHook {
	return {
		postSync,
	};

	/**
	 * Post-sync hook that drops legacy users and auths tables from tenant-org schemas.
	 *
	 * This hook:
	 * - Only affects tenant-org schemas (uses current_schema())
	 * - Never touches the manager/registry database
	 * - Is idempotent (safe to run multiple times)
	 * - Uses CASCADE to handle any remaining foreign key dependencies
	 * - Logs all actions for audit purposes
	 */
	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		try {
			await dropLegacyTables(sequelize);
		} catch (error) {
			log.error(error, "Failed to drop legacy users/auths tables");
			// Don't rethrow - postSync failures shouldn't block startup
		}
	}
}

/**
 * Drop legacy users and auths tables if they exist in the current schema.
 *
 * Steps:
 * 1. Drop FK constraint from audit_events.actor_id to users (if exists)
 * 2. Drop auths table (may have FK to users)
 * 3. Drop users table
 */
async function dropLegacyTables(sequelize: Sequelize): Promise<void> {
	// Check if legacy users table exists in current schema
	const [userTableCheck] = (await sequelize.query(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = current_schema()
			AND table_name = 'users'
		) as exists
	`)) as [Array<{ exists: boolean }>, unknown];

	const usersTableExists = userTableCheck[0]?.exists ?? false;

	// Check if legacy auths table exists in current schema
	const [authTableCheck] = (await sequelize.query(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = current_schema()
			AND table_name = 'auths'
		) as exists
	`)) as [Array<{ exists: boolean }>, unknown];

	const authsTableExists = authTableCheck[0]?.exists ?? false;

	// Step 1: Drop FK constraint from audit_events.actor_id to users (if exists)
	if (usersTableExists) {
		await dropAuditEventsForeignKey(sequelize);
	}

	// Step 2: Drop auths first (it may have FK to users)
	if (authsTableExists) {
		log.info("Dropping legacy 'auths' table from tenant schema");
		await sequelize.query("DROP TABLE IF EXISTS auths CASCADE");
		log.info("Successfully dropped legacy 'auths' table");
	}

	// Step 3: Drop users second
	if (usersTableExists) {
		log.info("Dropping legacy 'users' table from tenant schema");
		await sequelize.query("DROP TABLE IF EXISTS users CASCADE");
		log.info("Successfully dropped legacy 'users' table");
	}

	if (!usersTableExists && !authsTableExists) {
		log.debug("Legacy tables already cleaned up (users and auths do not exist)");
	}
}

/**
 * Drop foreign key constraint from audit_events.actor_id to users table.
 *
 * This is necessary because existing audit_events tables may have a FK constraint
 * that prevents dropping the users table.
 *
 * IMPORTANT: audit_events uses PostgreSQL range partitioning by timestamp.
 * FK constraints on partitioned tables are defined on the parent table, not on
 * individual partitions. This function correctly queries and drops the constraint
 * from the parent partitioned table.
 */
async function dropAuditEventsForeignKey(sequelize: Sequelize): Promise<void> {
	try {
		// Query to find FK constraint name pointing from audit_events.actor_id to users
		// Note: For partitioned tables, constraints are defined on the parent table
		const [fkConstraints] = (await sequelize.query(`
			SELECT constraint_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			JOIN information_schema.constraint_column_usage ccu
				ON ccu.constraint_name = tc.constraint_name
				AND ccu.table_schema = tc.table_schema
			WHERE tc.constraint_type = 'FOREIGN KEY'
				AND tc.table_schema = current_schema()
				AND tc.table_name = 'audit_events'
				AND kcu.column_name = 'actor_id'
				AND ccu.table_name = 'users'
		`)) as [Array<{ constraint_name: string }>, unknown];

		if (fkConstraints.length > 0) {
			for (const fk of fkConstraints) {
				const constraintName = fk.constraint_name;
				log.info("Dropping FK constraint %s from audit_events.actor_id to users", constraintName);
				// For partitioned tables, dropping constraint from parent table also removes
				// it from all partitions
				await sequelize.query(`ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS "${constraintName}"`);
				log.info("Successfully dropped FK constraint %s", constraintName);
			}
		} else {
			log.debug("No FK constraint found from audit_events.actor_id to users");
		}
	} catch (error) {
		log.warn(error, "Failed to drop audit_events FK constraint - table may not exist or already removed");
		// Don't rethrow - this is a cleanup operation and should be best-effort
	}
}
