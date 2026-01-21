import type { DatabaseProvider } from "./DatabaseProvider";

/** Status of a tenant in the provisioning lifecycle */
export type TenantStatus = "provisioning" | "active" | "suspended" | "migrating" | "archived";

/** Type of deployment for the tenant */
export type DeploymentType = "shared" | "isolated";

/** Tenant information stored in the registry */
export interface Tenant {
	id: string;
	slug: string;
	displayName: string;
	status: TenantStatus;
	deploymentType: DeploymentType;

	// Database provider reference (credentials are stored on provider)
	databaseProviderId: string;
	databaseProvider?: DatabaseProvider; // Optional - populated when needed

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

/** @deprecated Database credentials are now stored on the Provider, not the Tenant */
export type TenantWithCredentials = Tenant;

/** Summary of a tenant for list views */
export interface TenantSummary {
	id: string;
	slug: string;
	displayName: string;
	status: TenantStatus;
	deploymentType: DeploymentType;
	databaseProviderId: string;
	databaseProvider?: DatabaseProvider; // Optional - populated when needed
	createdAt: Date;
	provisionedAt: Date | null;
}
