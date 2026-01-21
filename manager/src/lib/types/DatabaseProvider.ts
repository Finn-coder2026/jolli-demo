/**
 * Type of database provider.
 * - "connection_string": Uses a PostgreSQL connection string (formerly "local")
 * - "neon": Uses Neon's API via API key
 * - "local": Legacy alias for "connection_string" (for backward compatibility)
 */
export type ProviderType = "connection_string" | "neon" | "local";

/**
 * Status of a database provider in the provisioning lifecycle.
 */
export type ProviderStatus = "pending" | "provisioning" | "active" | "suspended" | "archived";

/** Configuration for ConnectionString provider */
export interface ConnectionStringProviderConfig {
	/** Admin connection URL for provisioning databases */
	adminConnectionUrl: string;
}

/** Configuration for Neon provider (API key only) */
export interface NeonProviderConfig {
	/** API key for Neon API authentication */
	apiKey: string;
	/** Organization ID (required for API key authentication) */
	orgId: string;
	/** Optional region ID for new projects (defaults to org's default region) */
	regionId?: string;
}

/** Database provider configuration */
export interface DatabaseProvider {
	id: string;
	name: string;
	slug: string;
	type: ProviderType;
	status: ProviderStatus;
	isDefault: boolean;
	region: string;
	configEncrypted: string | null;
	connectionTemplate: DatabaseConnectionTemplate | null;

	// Database connection credentials (populated after provisioning)
	databaseHost: string | null;
	databasePort: number;
	databaseName: string | null;
	databaseUsername: string | null;
	databasePasswordEncrypted: string | null;
	databaseSsl: boolean;
	databasePoolMax: number;
	databaseRetained: boolean;

	createdAt: Date;
	updatedAt: Date;
	provisionedAt: Date | null;
}

/** Template for new database connections */
export interface DatabaseConnectionTemplate {
	host?: string;
	port?: number;
	ssl?: boolean;
	poolMax?: number;
}

/** Data required to create a new provider */
export interface NewDatabaseProvider {
	name: string;
	/** Optional slug - auto-generated from name if not provided */
	slug?: string;
	type: ProviderType;
	isDefault?: boolean;
	/** Region slug (e.g., "us-west-2") - defaults to DEFAULT_REGION if not provided */
	region?: string;
	/** Provider config (will be JSON stringified if provided) */
	config?: Record<string, unknown>;
	/** Pre-encrypted config string (takes precedence over config if both provided) */
	configEncrypted?: string;
	connectionTemplate?: DatabaseConnectionTemplate;
}

/** Database credentials returned from provisioning */
export interface DatabaseCredentials {
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	ssl: boolean;
}

/** Result of provisioning a database */
export interface ProvisionResult {
	success: boolean;
	credentials?: DatabaseCredentials;
	error?: string;
	/** True if an existing database was reused instead of creating a new one */
	reused?: boolean;
	/** Provider-specific resource ID (e.g., Neon project ID) for cleanup on failure */
	resourceId?: string;
}
