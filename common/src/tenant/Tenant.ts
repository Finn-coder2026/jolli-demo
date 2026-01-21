/** Status of a tenant in the provisioning lifecycle */
export type TenantStatus = "provisioning" | "active" | "suspended" | "migrating" | "archived";

/** Type of deployment for the tenant */
export type DeploymentType = "shared" | "isolated";

/**
 * Tenant information stored in the registry.
 * Note: Database connection details are NOT included here to prevent
 * accidental leakage to frontend. Use TenantDatabaseConfig in backend
 * for database connection info.
 */
export interface Tenant {
	id: string;
	slug: string;
	displayName: string;
	status: TenantStatus;
	deploymentType: DeploymentType;

	// Reference to which database provider handles this tenant
	databaseProviderId: string;

	// Metadata
	configs: Record<string, unknown>;
	configsUpdatedAt: Date | null;
	featureFlags: Record<string, boolean>;
	primaryDomain: string | null;

	createdAt: Date;
	updatedAt: Date;
	provisionedAt: Date | null;
}

/** Data required to create a new tenant */
export interface NewTenant {
	slug: string;
	displayName: string;
	databaseProviderId?: string;
	configs?: Record<string, unknown>;
	featureFlags?: Record<string, boolean>;
}

/** Summary of a tenant for list views */
export interface TenantSummary {
	id: string;
	slug: string;
	displayName: string;
	status: TenantStatus;
	deploymentType: DeploymentType;
	primaryDomain: string | null;
	createdAt: Date;
	provisionedAt: Date | null;
}
