import type { DatabaseCredentials, ProviderType, ProvisionResult } from "../types";

/**
 * Result of a schema provisioning operation.
 */
export interface SchemaProvisionResult {
	/** Whether the schema was created (true) or already existed (false when reusing) */
	created: boolean;
	/** Whether the schema existed before provisioning */
	existed: boolean;
}

/**
 * Interface for database providers that can provision provider databases.
 * Each provider gets its own database, which is shared by all tenants using that provider.
 */
export interface DatabaseProviderAdapter {
	/** The type of this provider */
	readonly type: ProviderType;

	/**
	 * Provision a new database for this provider.
	 * Called once when the provider is created - the database is then shared by all tenants.
	 * @param providerSlug - Unique provider identifier (used in database naming: jolli_{providerSlug})
	 * @param options - Provisioning options
	 * @param options.reuseExisting - If true, reuse existing database if found (default: false)
	 * @param options.force - If true, force drop and recreate even if database exists (default: false)
	 * @returns Result containing credentials or error
	 */
	provisionDatabase(
		providerSlug: string,
		options?: { reuseExisting?: boolean; force?: boolean },
	): Promise<ProvisionResult>;

	/**
	 * Deprovision (delete) the provider's database.
	 * @param providerSlug - Unique provider identifier
	 * @param credentials - The credentials to the database being deleted
	 * @param mode - Deprovisioning mode: 'drop' to delete database, 'retain' to keep it
	 */
	deprovisionDatabase(
		providerSlug: string,
		credentials: DatabaseCredentials,
		mode?: "drop" | "retain",
	): Promise<void>;

	/**
	 * Test connection to a database.
	 * @param credentials - Database credentials to test
	 * @returns true if connection successful
	 */
	testConnection(credentials: DatabaseCredentials): Promise<boolean>;

	/**
	 * Run Jolli schema migrations on the database.
	 * @param credentials - Database credentials
	 */
	migrate(credentials: DatabaseCredentials): Promise<void>;

	/**
	 * Create a PostgreSQL schema for an org within a tenant database.
	 * @param credentials - Database credentials for the tenant database
	 * @param schemaName - Name of the schema to create (e.g., "org_engineering")
	 * @param options - Provisioning options
	 * @param options.reuseExisting - If true, reuse existing schema if found (skip creation and bootstrap)
	 * @param options.force - If true, drop existing schema and recreate (destroys data)
	 * @returns Result indicating whether schema was created or already existed
	 */
	provisionSchema(
		credentials: DatabaseCredentials,
		schemaName: string,
		options?: { reuseExisting?: boolean; force?: boolean },
	): Promise<SchemaProvisionResult>;

	/**
	 * Drop a PostgreSQL schema for an org.
	 * @param credentials - Database credentials for the tenant database
	 * @param schemaName - Name of the schema to drop
	 * @param mode - Deprovisioning mode: 'drop' to delete schema, 'retain' to keep it
	 */
	deprovisionSchema(credentials: DatabaseCredentials, schemaName: string, mode?: "drop" | "retain"): Promise<void>;

	/**
	 * Run Jolli backend migrations in a specific schema.
	 * @param credentials - Database credentials for the tenant database
	 * @param schemaName - Name of the schema to run migrations in
	 */
	migrateSchema(credentials: DatabaseCredentials, schemaName: string): Promise<void>;

	/**
	 * Check if a database exists.
	 * @param dbName - Database name to check
	 * @returns true if database exists
	 */
	checkDatabaseExists(dbName: string): Promise<boolean>;

	/**
	 * Check if a schema exists in a database.
	 * @param credentials - Database credentials
	 * @param schemaName - Schema name to check
	 * @returns true if schema exists
	 */
	checkSchemaExists(credentials: DatabaseCredentials, schemaName: string): Promise<boolean>;

	/**
	 * Validate that a database contains expected Jolli tables.
	 * @param credentials - Database credentials
	 * @returns validation result with list of missing tables if invalid
	 */
	validateJolliDatabase(credentials: DatabaseCredentials): Promise<{ valid: boolean; missingTables?: Array<string> }>;

	/**
	 * Delete a provider-specific resource (e.g., Neon project) for cleanup on failure.
	 * Optional - only implemented by providers that create external resources.
	 * @param resourceId - Provider-specific resource ID (from ProvisionResult.resourceId)
	 */
	deleteResource?(resourceId: string): Promise<void>;
}
