/** Status of a tenant in the provisioning lifecycle */
export type TenantStatus = "provisioning" | "active" | "suspended" | "migrating" | "archived";

/** Type of deployment for the tenant */
export type DeploymentType = "shared" | "isolated";

/** Pricing tier for tenant */
export type PricingTier = "free" | "pro" | "enterprise";

/**
 * Feature flags for tenant - stored in the JSONB feature_flags column.
 * Defines which features are enabled for the tenant based on their pricing tier.
 */
export interface TenantFeatureFlags {
	/** Pricing tier (free/pro/enterprise) */
	tier?: PricingTier;
	/** Subdomain access enabled (e.g., tenant.jolli.ai) */
	subdomain?: boolean;
	/** Custom domain enabled (e.g., docs.acme.com) */
	customDomain?: boolean;
	/** Advanced analytics features */
	advancedAnalytics?: boolean;
	/** SSO integration (SAML, OAuth) */
	sso?: boolean;
	/** Dedicated support access */
	dedicatedSupport?: boolean;
}

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
	featureFlags: TenantFeatureFlags;
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
	featureFlags?: TenantFeatureFlags;
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
