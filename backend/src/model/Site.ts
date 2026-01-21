import { PIIField, PIISchema } from "../audit/PiiDecorators";
import type { ModelDef } from "../util/ModelDef";
import type {
	AddDomainResult,
	CustomDomainInfo,
	CustomDomainStatus,
	DomainStatusResult,
	DomainVerificationChallenge,
	JwtAuthConfig,
	JwtAuthMode,
} from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

// Re-export domain and auth types from common for use throughout the backend
export type {
	AddDomainResult,
	CustomDomainInfo,
	CustomDomainStatus,
	DomainStatusResult,
	DomainVerificationChallenge,
	JwtAuthConfig,
	JwtAuthMode,
};

/**
 * Status enum - lifecycle of a site
 */
export type SiteStatus = "pending" | "building" | "active" | "error";

/**
 * Visibility enum - access control marker
 */
export type SiteVisibility = "internal" | "external";

/**
 * Metadata - stored in JSONB field
 */
export interface SiteMetadata {
	githubRepo: string; // e.g., "Jolli-sample-repos/customerabcsite"
	githubUrl: string; // Full GitHub repository URL

	// NEW: Separate preview and production URLs
	previewUrl?: string; // Latest preview deployment URL (changes with each rebuild)
	previewDeploymentId?: string; // Latest preview deployment ID
	productionUrl?: string; // Stable production URL (never changes after first publish)
	productionDeploymentId?: string; // Current production deployment ID
	deploymentStatus?: "building" | "ready" | "error"; // Current deployment status

	// DEPRECATED: Keep for backward compatibility
	vercelUrl?: string; // Deprecated: use productionUrl or previewUrl
	vercelDeploymentId?: string; // Deprecated: use productionDeploymentId or previewDeploymentId

	framework: string; // e.g., "docusaurus-2"
	nextraVersion?: "3" | "4"; // For Nextra sites: version used (3.x Pages Router or 4.x App Router)
	articleCount: number; // Number of articles included (for change detection)
	lastDeployedAt?: string; // ISO timestamp of last deployment (to preview)
	lastPublishedAt?: string; // NEW: ISO timestamp of last publish (to production)
	lastBuildError?: string; // Error message if build failed
	buildProgress?: string; // Current build step (e.g., "Creating repository...", "Deploying...")
	isProtected?: boolean; // Whether site requires login (cached from Vercel)
	protectionType?: string; // Type of protection: "password", "sso", "vercel-auth", "none", "app-level"
	lastProtectionCheck?: string; // ISO timestamp of last protection status check
	allowedDomain?: string; // For internal sites: allowed email domain (e.g., "jolli.ai")
	isPublished?: boolean; // For external sites: whether site has been published to production
	generatedArticleJrns?: Array<string>; // JRNs of articles included in last generation (for change detection)
	generatedJwtAuthEnabled?: boolean; // Whether JWT auth was enabled at last generation (for change detection)
	selectedArticleJrns?: Array<string>; // JRNs of articles selected for this site (undefined = all articles)
	validationErrors?: string; // MDX/build validation error details if build failed
	jwtAuth?: JwtAuthConfig; // JWT authentication configuation
	// Config file hashes for detecting manual edits (stored after successful build)
	configFileHashes?: {
		metaTs?: string; // Hash of content/_meta.ts
		nextConfig?: string; // Hash of next.config.mjs
	};
	// Custom domain support fields
	subdomain?: string; // Subdomain slug (e.g., "docs" for docs-tenant.jolli.site)
	jolliSiteDomain?: string; // Full jolli.site domain (e.g., "docs-acme.jolli.site")
	customDomains?: Array<CustomDomainInfo>; // Custom domains attached to this site
}

// Domain types (CustomDomainStatus, DomainVerificationChallenge, CustomDomainInfo,
// AddDomainResult, DomainStatusResult) are re-exported from jolli-common above

/**
 * Main site interface
 */
export interface Site {
	readonly id: number;
	readonly name: string; // Unique slug, maps to GitHub repo name
	readonly displayName: string; // Human-readable name
	readonly userId: number | undefined; // Owner user ID
	readonly visibility: SiteVisibility;
	readonly status: SiteStatus;
	readonly metadata: SiteMetadata | undefined;
	readonly lastGeneratedAt: Date | undefined; // For change detection
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Type for creating new sites
 */
export type NewSite = Omit<Site, "id" | "createdAt" | "updatedAt">;

export const TABLE_NAME_SITES = "sites";

export function defineSites(sequelize: Sequelize): ModelDef<Site> {
	return sequelize.define(TABLE_NAME_SITES, schema, { timestamps: true, indexes });
}

const indexes = [
	{
		unique: true,
		fields: ["name"],
	},
	{
		fields: ["user_id"],
	},
	{
		fields: ["status"],
	},
	{
		fields: ["last_generated_at"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	displayName: {
		type: DataTypes.STRING,
		field: "display_name",
		allowNull: false,
	},
	userId: {
		type: DataTypes.INTEGER,
		field: "user_id",
		allowNull: true,
		references: {
			model: "users",
			key: "id",
		},
		onDelete: "SET NULL",
	},
	visibility: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "internal",
		validate: {
			isIn: [["internal", "external"]],
		},
	},
	status: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "pending",
		validate: {
			isIn: [["pending", "building", "active", "error"]],
		},
	},
	metadata: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
	lastGeneratedAt: {
		type: DataTypes.DATE,
		field: "last_generated_at",
		allowNull: true,
	},
};

/**
 * PII schema for site resource type.
 * Registers which fields contain PII and should be encrypted in audit logs.
 */
@PIISchema("site")
class SitePII {
	@PIIField({ description: "Site owner email (from metadata)" })
	ownerEmail!: string;

	@PIIField({ description: "Site contact email (from metadata)" })
	contactEmail!: string;
}

// Reference the class to ensure decorators are executed
void SitePII;
