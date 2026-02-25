/**
 * Factory functions for creating Sequelize instances for tenant databases.
 * This module is excluded from unit test coverage as it requires real database connections.
 * Coverage is provided through integration tests.
 *
 * ## Multi-Tenant Schema Isolation
 *
 * This factory implements PostgreSQL schema-based multi-tenancy with two isolation mechanisms:
 *
 * 1. **`options.schema`** - Tells Sequelize to schema-qualify table names in generated SQL.
 *    This is the PRIMARY isolation mechanism and works correctly with all connection types.
 *
 * 2. **`SET search_path` in afterConnect** - Sets session-level search path as a fallback.
 *    This fires once when connecting and provides backup isolation for direct connections.
 *
 * ## Neon Pooled Connection Compatibility
 *
 * When using Neon's connection pooler (transaction pooling mode):
 * - The `afterConnect` hook fires once when connecting to the pooler
 * - `SET search_path` (session-level) may not persist across transactions
 * - Each transaction may get a different backend connection with reset `search_path`
 *
 * **ORM queries are safe**: The `options.schema` setting ensures Sequelize generates
 * schema-qualified queries regardless of `search_path`:
 * ```sql
 * SELECT * FROM "org_engineering"."users" WHERE ...
 * ```
 *
 * **Raw queries need explicit schema qualification for pooled connection safety**:
 * ```typescript
 * // UNSAFE with pooled connections - relies on search_path
 * await sequelize.query('SELECT * FROM users');
 *
 * // SAFE - explicit schema qualification
 * const schema = sequelize.options.schema;
 * await sequelize.query(`SELECT * FROM "${schema}"."users"`);
 * ```
 *
 * For detailed guidance on writing multi-tenant raw queries, see DEVELOPERS.md.
 */

import { type CreateDatabaseOptions, createDatabase, type Database } from "../core/Database";
import { getLog } from "../util/Logger";
import type { TenantDatabaseConfig } from "./TenantDatabaseConfig";
import { type Options, Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Logging option type for Sequelize - can be boolean or a function that receives SQL strings.
 */
export type SequelizeLogging = boolean | ((sql: string, timing?: number) => void);

/**
 * Create a Sequelize instance for a tenant database.
 * Uses TenantDatabaseConfig (backend-only) instead of Tenant to keep database credentials
 * separate from the shared Tenant interface.
 *
 * @param dbConfig - Database configuration for the tenant
 * @param password - Decrypted database password
 * @param poolMax - Maximum number of connections in the pool
 * @param logging - Whether to enable SQL logging, or a function to capture SQL statements
 * @param schemaName - PostgreSQL schema name (e.g., "org_engineering"). If provided and not "public",
 *                     sets search_path on every connection in the pool via afterConnect hook.
 */
export function createTenantSequelize(
	dbConfig: TenantDatabaseConfig,
	password: string,
	poolMax: number,
	logging: SequelizeLogging,
	schemaName = "public",
): Sequelize {
	log.info("Creating Sequelize for tenant: %s, schema: %s", dbConfig.tenantId, schemaName);

	const dialectOptions: Record<string, unknown> = {};

	if (dbConfig.databaseSsl) {
		dialectOptions.ssl = { rejectUnauthorized: false };
	}

	// Build the search_path for the schema
	const searchPath = schemaName === "public" ? "public" : `"${schemaName}"`;

	// Create options without hooks first, then add hooks that reference the sequelize instance
	const options: Options = {
		database: dbConfig.databaseName,
		username: dbConfig.databaseUsername,
		password,
		host: dbConfig.databaseHost,
		port: dbConfig.databasePort,
		dialect: "postgres",
		dialectOptions,
		logging,
		pool: {
			max: poolMax,
		},
		define: { underscored: true },
		hooks: {
			// Set search_path when a new connection is established.
			// This provides backup schema isolation for direct connections.
			// NOTE: With pooled connections (e.g., Neon's connection pooler), this hook
			// fires once when connecting to the pooler, not per-transaction. For pooled
			// connections, rely on options.schema (above) which schema-qualifies ORM queries.
			// See module JSDoc for details on writing safe raw queries with pooled connections.
			afterConnect: async (connection: unknown) => {
				// Cast connection to access query method (pg Client interface)
				const pgConnection = connection as { query: (sql: string) => Promise<unknown> };
				await pgConnection.query(`SET search_path TO ${searchPath}`);
			},
		},
	};

	// Only set the schema option for non-public schemas
	// This tells Sequelize to check for table existence and create tables in this schema
	// We don't set it for 'public' to avoid changing default Sequelize behavior
	if (schemaName !== "public") {
		options.schema = schemaName;
		log.info("Using schema: %s with search_path: %s", schemaName, searchPath);
	}

	return new Sequelize(options);
}

/**
 * Create a Database instance with all DAOs for a tenant.
 * @param sequelize - The Sequelize instance
 * @param options - Options including forceSync for bootstrap operations
 */
export function createTenantDatabase(sequelize: Sequelize, options?: CreateDatabaseOptions): Promise<Database> {
	return createDatabase(sequelize, options);
}

/**
 * Create a Sequelize instance for the tenant registry database.
 */
export function createRegistrySequelize(connectionUrl: string, poolMax: number): Sequelize {
	log.debug("Creating Sequelize for tenant registry");
	return new Sequelize(connectionUrl, {
		dialect: "postgres",
		logging: false,
		pool: { max: poolMax },
	});
}
