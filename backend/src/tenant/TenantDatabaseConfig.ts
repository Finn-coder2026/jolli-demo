/**
 * Backend-only interface for tenant database connection details.
 * Completely separate from Tenant to prevent accidental leakage to frontend.
 *
 * This interface is intentionally NOT exported from common - it should only
 * be used by backend code that needs to establish database connections.
 */
export interface TenantDatabaseConfig {
	tenantId: string;
	databaseHost: string;
	databasePort: number;
	databaseName: string;
	databaseUsername: string;
	databasePasswordEncrypted: string;
	databaseSsl: boolean;
	databasePoolMax: number;
}

/**
 * TenantDatabaseConfig with decrypted password for establishing connections.
 * Only used internally by TenantOrgConnectionManager.
 */
export interface TenantDatabaseCredentials extends Omit<TenantDatabaseConfig, "databasePasswordEncrypted"> {
	databasePassword: string;
}
