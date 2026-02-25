import type { DatabaseProvider } from "./DatabaseProvider";

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
	ownerEmail?: string;
	databaseProviderId?: string;
	configs?: Record<string, unknown>;
	featureFlags?: TenantFeatureFlags;
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
