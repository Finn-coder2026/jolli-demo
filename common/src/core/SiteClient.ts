import type { DocType } from "../types/Doc";
import type { FileTreeNode } from "../util/FileTreeUtils";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/sites";

/**
 * JWT auth mode - controls which pages require authentication
 */
export type JwtAuthMode = "full" | "partial";

/**
 * JWT authentication configuration for sites
 */
export interface JwtAuthConfig {
	/** Whether JWT auth is enabled */
	enabled: boolean;
	/** Auth mode: 'full' (all pages protected) or 'partial' (only non-public pages) */
	mode: JwtAuthMode;
	/** URL to redirect for login */
	loginUrl: string;
	/** ES256 public key for JWT verification (PEM format) */
	publicKey: string;
	/** ES256 private key for JWT signing (PEM format) - stored securely on backend */
	privateKey?: string;
	/** Allowed groups for access control */
	allowedGroups?: Array<string>;
}

/**
 * Request to update JWT auth configuration
 */
export interface JwtAuthConfigUpdate {
	/** Whether to enable JWT auth */
	enabled: boolean;
	/** Auth mode (required if enabled is true) */
	mode?: JwtAuthMode;
	/** Custom login URL (optional - defaults to Jolli endpoint if not provided) */
	loginUrl?: string;
}

export interface ExternalLink {
	label: string;
	url: string;
}

/**
 * Header navigation item - direct link (url) OR dropdown (items), mutually exclusive.
 */
export interface HeaderNavItem {
	label: string;
	url?: string;
	/** Sub-items for dropdown (max 8) */
	items?: Array<ExternalLink>;
}

export interface HeaderLinksConfig {
	/** Max 6 top-level items */
	items: Array<HeaderNavItem>;
}

export interface FooterColumn {
	title: string;
	links: Array<ExternalLink>;
}

export interface SocialLinks {
	github?: string;
	twitter?: string;
	discord?: string;
	linkedin?: string;
	youtube?: string;
}

export interface FooterConfig {
	/** Copyright text (e.g., "2026 Acme Inc.") */
	copyright?: string;
	/** Footer columns with links (max 4 columns) */
	columns?: Array<FooterColumn>;
	/** Social media icon links */
	socialLinks?: SocialLinks;
}

/**
 * Font family options for site typography
 */
export type FontFamily = "inter" | "space-grotesk" | "ibm-plex" | "source-sans";

/**
 * Font configuration - single source of truth for font URLs and CSS values.
 * Used by both frontend (preview) and nextra-generator (site generation).
 */
export interface FontConfig {
	/** Google Fonts CSS URL */
	url: string;
	/** CSS font-family value for the font */
	cssFamily: string;
	/** Display name of the font for UI */
	displayName: string;
}

/**
 * Font configuration mapping from FontFamily to font details.
 */
export const FONT_CONFIG: Record<FontFamily, FontConfig> = {
	inter: {
		url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
		cssFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
		displayName: "Inter",
	},
	"space-grotesk": {
		url: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap",
		cssFamily: "'Space Grotesk', -apple-system, sans-serif",
		displayName: "Space Grotesk",
	},
	"ibm-plex": {
		url: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
		cssFamily: "'IBM Plex Sans', -apple-system, sans-serif",
		displayName: "IBM Plex Sans",
	},
	"source-sans": {
		url: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap",
		cssFamily: "'Source Sans 3', -apple-system, sans-serif",
		displayName: "Source Sans 3",
	},
};

/**
 * Code syntax highlighting theme options
 */
export type CodeTheme = "github" | "dracula" | "one-dark" | "nord";

/**
 * Border radius options for UI elements
 */
export type BorderRadius = "sharp" | "subtle" | "rounded" | "pill";

/**
 * Spacing density options
 */
export type SpacingDensity = "compact" | "comfortable" | "airy";

/**
 * Navigation mode options
 * - sidebar: Traditional sidebar navigation only (default)
 * - tabs: Folder tabs at top, sidebar for pages within
 */
export type NavigationMode = "sidebar" | "tabs";

/**
 * Overall page container max-width
 * - compact: 90rem (1440px) - Nextra default
 * - standard: 100rem (1600px)
 * - wide: 100% (no max-width constraint)
 */
export type PageWidth = "compact" | "standard" | "wide";

/**
 * Article content area max-width for readability
 * - compact: 45rem (720px) - tight reading width
 * - standard: 55rem (880px) - optimal line length
 * - wide: 70rem (1120px) - loose reading width
 */
export type ContentWidth = "compact" | "standard" | "wide";

/**
 * Left sidebar navigation panel width
 * - compact: 14rem (224px)
 * - standard: 16rem (256px) - Nextra default
 * - wide: 20rem (320px)
 */
export type SidebarWidth = "compact" | "standard" | "wide";

/**
 * Right table-of-contents panel width
 * - compact: 14rem (224px)
 * - standard: 16rem (256px) - Nextra default
 * - wide: 20rem (320px)
 */
export type TocWidth = "compact" | "standard" | "wide";

/**
 * Header navigation link alignment
 * - left: Links appear immediately after the logo
 * - right: Links are pushed to the right (before search/theme icons)
 */
export type HeaderAlignment = "left" | "right";

/**
 * Theme preset names
 */
export type ThemePreset = "minimal" | "vibrant" | "terminal" | "friendly" | "noir" | "custom";

/** How the logo is displayed in the site header */
export type LogoDisplay = "text" | "image" | "both";

/** Site branding configuration */
export interface SiteBranding {
	// === Logo ===
	/** Text logo (fallback if no logoUrl) */
	logo?: string;
	/** URL to hosted logo image */
	logoUrl?: string;
	/** URL to hosted favicon */
	favicon?: string;
	/** How the logo is displayed: text only, image only, or both */
	logoDisplay?: LogoDisplay;

	// === Colors ===
	/** Primary accent color hue 0-360 (default: 212 blue) */
	primaryHue?: number;

	// === Theme ===
	/** Initial theme for visitors */
	defaultTheme?: "dark" | "light" | "system";

	// === Header ===
	/** External links in header (dropdown or individual links) */
	headerLinks?: HeaderLinksConfig;

	// === Footer ===
	/** Footer configuration */
	footer?: FooterConfig;

	// === Layout ===
	/** Hide right "On This Page" sidebar */
	hideToc?: boolean;
	/** Custom TOC heading */
	tocTitle?: string;
	/** Sidebar collapse depth 1-6 */
	sidebarDefaultCollapseLevel?: number;
	/** Navigation mode: sidebar, tabs, or dropdown */
	navigationMode?: NavigationMode;
	/** Overall page container max-width (default: "wide") */
	pageWidth?: PageWidth;
	/** Article content area max-width for readability (default: "standard") */
	contentWidth?: ContentWidth;
	/** Left sidebar navigation panel width (default: "standard") */
	sidebarWidth?: SidebarWidth;
	/** Right table-of-contents panel width (default: "standard") */
	tocWidth?: TocWidth;
	/** Header navigation link alignment (default: "right") */
	headerAlignment?: HeaderAlignment;

	// === Theme Preset ===
	/** Theme preset (sets defaults for all theme properties) */
	themePreset?: ThemePreset;

	// === Typography ===
	/** Font family for headings and body text */
	fontFamily?: FontFamily;

	// === Code Blocks ===
	/** Syntax highlighting theme for code blocks */
	codeTheme?: CodeTheme;

	// === Appearance ===
	/** Corner roundness for UI elements */
	borderRadius?: BorderRadius;
	/** Whitespace density between elements */
	spacingDensity?: SpacingDensity;
}

/**
 * Site metadata
 */
export interface SiteMetadata {
	githubRepo: string;
	githubUrl: string;

	// NEW: Separate preview and production URLs
	previewUrl?: string; // Latest preview deployment URL (changes with each rebuild)
	previewDeploymentId?: string; // Latest preview deployment ID
	productionUrl?: string; // Stable production URL (never changes after first publish)
	productionDeploymentId?: string; // Current production deployment ID
	deploymentStatus?: "building" | "ready" | "error"; // Current deployment status

	// DEPRECATED: Keep for backward compatibility
	vercelUrl?: string; // Deprecated: use productionUrl or previewUrl
	vercelDeploymentId?: string; // Deprecated: use productionDeploymentId or previewDeploymentId

	framework: string;
	articleCount: number;
	lastDeployedAt?: string; // ISO timestamp of last deployment (to preview)
	lastPublishedAt?: string; // NEW: ISO timestamp of last publish (to production)
	lastBuildError?: string;
	validationErrors?: string; // MDX/build validation error details if build failed
	buildProgress?: string;
	isProtected?: boolean;
	protectionType?: string;
	lastProtectionCheck?: string;
	allowedDomain?: string;
	isPublished?: boolean; // For external sites: whether site has been published to production
	generatedArticleJrns?: Array<string>; // JRNs of articles included in last generation (for change detection)
	generatedArticleTitles?: Record<string, string>; // Map of JRN -> title at last generation (for deleted article slug derivation)
	generatedJwtAuthEnabled?: boolean; // Whether JWT auth was enabled at last generation (for change detection)
	selectedArticleJrns?: Array<string>; // JRNs of articles selected for this site (undefined = all articles)
	// Config file hashes for detecting manual edits (stored after successful build)
	configFileHashes?: {
		metaTs?: string; // Hash of content/_meta.ts
		nextConfig?: string; // Hash of next.config.mjs
	};
	// Custom domain support fields
	subdomain?: string; // Subdomain slug (e.g., "docs" for docs-tenant.jolli.site)
	jolliSiteDomain?: string; // Full jolli.site domain (e.g., "docs-acme.jolli.site")
	customDomains?: Array<CustomDomainInfo>; // Custom domains attached to this site
	// JWT authentication
	jwtAuth?: JwtAuthConfig; // JWT authentication configuration
	// Site branding
	branding?: SiteBranding; // Site branding/customization configuration
	generatedBranding?: SiteBranding; // Branding at last generation (for change detection)
	// Site structure
	useSpaceFolderStructure?: boolean; // When true, site navigation mirrors the space folder structure
	generatedUseSpaceFolderStructure?: boolean; // Whether folder structure was enabled at last generation (for change detection)
}

/**
 * Status of a custom domain
 */
export type CustomDomainStatus = "pending" | "verified" | "failed";

/**
 * DNS verification challenge from Vercel
 */
export interface DomainVerificationChallenge {
	/** Type of DNS record to add */
	type: "TXT" | "CNAME" | "A";
	/** DNS record name (e.g., "docs" or "_vercel") */
	domain: string;
	/** Value to set for the DNS record */
	value: string;
	/** Human-readable explanation */
	reason?: string;
}

/**
 * Result from adding a domain to Vercel
 */
export interface AddDomainResult {
	/** Whether the domain is verified */
	verified: boolean;
	/** Verification challenges if not verified */
	verification?: Array<DomainVerificationChallenge>;
	/** Error message if add failed */
	error?: string;
}

/**
 * Result from getting domain status from Vercel
 */
export interface DomainStatusResult {
	/** Whether the domain is verified */
	verified: boolean;
	/** Verification challenges if not verified */
	verification?: Array<DomainVerificationChallenge>;
}

/**
 * Custom domain information stored in site metadata
 */
export interface CustomDomainInfo {
	/** The custom domain (e.g., "docs.acme.com") */
	domain: string;
	/** Current verification status */
	status: CustomDomainStatus;
	/** ISO timestamp when domain was added */
	addedAt: string;
	/** ISO timestamp when domain was verified (if verified) */
	verifiedAt?: string;
	/** ISO timestamp when status was last checked */
	lastCheckedAt?: string;
	/** Error message if verification failed */
	verificationError?: string;
	/** Verification challenges if status is pending */
	verification?: Array<DomainVerificationChallenge>;
}

/**
 * Site interface
 */
export interface Site {
	readonly id: number;
	readonly name: string;
	readonly displayName: string;
	readonly userId: number | undefined;
	readonly visibility: "internal" | "external";
	readonly status: "pending" | "building" | "active" | "error";
	readonly metadata: SiteMetadata | undefined;
	readonly lastGeneratedAt: string | undefined;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly needsUpdate?: boolean; // Added by API, not stored
}

/**
 * Changed config file info for update detection
 */
export interface ChangedConfigFile {
	path: string; // e.g., "content/_meta.ts", "next.config.mjs"
	displayName: string; // Human-readable name
}

/**
 * Auth change info for detecting JWT auth setting changes since last build
 */
export interface AuthChange {
	from: boolean; // Auth enabled state at last build
	to: boolean; // Current auth enabled state
}

/**
 * Site with needsUpdate flag and change details
 */
export interface SiteWithUpdate extends Site {
	needsUpdate: boolean;
	changedArticles?: Array<ChangedArticle>;
	changedConfigFiles?: Array<ChangedConfigFile>;
	authChange?: AuthChange; // Present when auth settings differ from last build
	brandingChanged?: boolean; // True when branding differs from last build
	folderStructureChanged?: boolean; // True when folder structure setting differs from last build
}

/**
 * JWT auth configuration for site creation
 */
export interface CreateSiteJwtAuth {
	enabled: boolean;
	mode?: JwtAuthMode; // Required if enabled is true
}

/**
 * Create Site request
 */
export interface CreateSiteRequest {
	name: string;
	displayName: string;
	visibility?: "internal" | "external";
	framework?: "docusaurus-2" | "nextra";
	allowedDomain?: string;
	selectedArticleJrns?: Array<string>; // JRNs of articles to include (undefined = all articles)
	subdomain?: string; // Custom subdomain for jolli.site domain (auto-generated from name if not provided)
	jwtAuth?: CreateSiteJwtAuth; // JWT authentication configuration
	useSpaceFolderStructure?: boolean; // When true, site navigation mirrors the space folder structure
}

/**
 * Type of change detected for an article
 */
export type ArticleChangeType = "new" | "updated" | "deleted";

/**
 * Reason for the change (helps distinguish content changes from selection changes)
 */
export type ChangeReason = "content" | "selection" | "config";

/**
 * Changed article info for update detection
 */
export interface ChangedArticle {
	id: number;
	title: string;
	jrn: string;
	updatedAt: string;
	contentType: string;
	changeType: ArticleChangeType;
	/** Why this change occurred - content update or selection change */
	changeReason?: ChangeReason;
	/** Whether this is a document or folder (undefined for deleted items with no DB record) */
	docType?: DocType;
}

/**
 * Lightweight site info returned by the sites-for-article endpoint.
 * Used by the article sites badge to show which sites include an article.
 */
export interface ArticleSiteInfo {
	readonly id: number;
	readonly name: string;
	readonly displayName: string;
	readonly visibility: "internal" | "external";
}

export interface SiteClient {
	/**
	 * Lists all sites for the current user
	 */
	listSites(): Promise<Array<SiteWithUpdate>>;
	/**
	 * Gets a specific site by ID
	 */
	getSite(id: number): Promise<SiteWithUpdate | undefined>;
	/**
	 * Creates a site (from all articles)
	 */
	createSite(data: CreateSiteRequest): Promise<Site>;
	/**
	 * Regenerates/updates an existing docsite
	 */
	regenerateSite(id: number): Promise<Site>;
	/**
	 * Deletes a site
	 */
	deleteSite(id: number): Promise<void>;
	/**
	 * Updates the article selection for a site
	 * @param id Site ID
	 * @param selectedArticleJrns Array of JRNs to include, or null for all articles
	 */
	updateSiteArticles(id: number, selectedArticleJrns: Array<string> | null): Promise<SiteWithUpdate>;
	/**
	 * Cancels a build in progress (sets status to error)
	 * @param id Site ID
	 */
	cancelBuild(id: number): Promise<Site>;
	/**
	 * Gets changed config files for a site (async endpoint for performance)
	 * This is fetched separately from getSite to avoid blocking on GitHub API calls.
	 * @param id Site ID
	 */
	getChangedConfigFiles(id: number): Promise<Array<ChangedConfigFile>>;
	/**
	 * Formats code using Biome
	 * @param content The code content to format
	 * @param filePath The file path (used to determine language)
	 * @returns The formatted code
	 */
	formatCode(content: string, filePath: string): Promise<{ formatted: string }>;
	/**
	 * Lists contents of a folder in the site repository
	 * @param id Site ID
	 * @param path Folder path (e.g., "content/guides")
	 */
	listFolderContents(id: number, path: string): Promise<{ files: Array<string> }>;
	/**
	 * Check if a subdomain is available
	 * @param subdomain The subdomain to check
	 */
	checkSubdomainAvailability(subdomain: string): Promise<{
		available: boolean;
		suggestion?: string;
		error?: string;
	}>;
	/**
	 * Add a custom domain to a site
	 * @param siteId Site ID
	 * @param domain The custom domain to add
	 */
	addCustomDomain(siteId: number, domain: string): Promise<{ domain: CustomDomainInfo }>;
	/**
	 * Remove a custom domain from a site
	 * @param siteId Site ID
	 * @param domain The custom domain to remove
	 */
	removeCustomDomain(siteId: number, domain: string): Promise<void>;
	/**
	 * Get custom domain status
	 * @param siteId Site ID
	 * @param domain The custom domain to check
	 */
	getCustomDomainStatus(
		siteId: number,
		domain: string,
	): Promise<{
		domain: CustomDomainInfo;
		verification?: Array<DomainVerificationChallenge>;
	}>;
	/**
	 * Trigger domain verification check
	 * @param siteId Site ID
	 * @param domain The custom domain to verify
	 */
	verifyCustomDomain(siteId: number, domain: string): Promise<{ domain: CustomDomainInfo }>;
	/**
	 * Refresh status of all custom domains on a site
	 * @param siteId Site ID
	 */
	refreshDomainStatuses(siteId: number): Promise<{ domains: Array<CustomDomainInfo> }>;
	/**
	 * Updates JWT auth configuration for a site
	 * @param id Site ID
	 * @param config JWT auth configuration update
	 */
	updateJwtAuthConfig(id: number, config: JwtAuthConfigUpdate): Promise<Site>;
	/**
	 * Updates branding configuration for a site
	 * @param id Site ID
	 * @param branding Branding configuration
	 */
	updateBranding(id: number, branding: SiteBranding): Promise<Site>;
	/**
	 * Updates whether the site uses space folder structure for navigation
	 * @param id Site ID
	 * @param useSpaceFolderStructure Whether to use space folder structure
	 */
	updateFolderStructure(id: number, useSpaceFolderStructure: boolean): Promise<Site>;
	/**
	 * Gets the repository file tree for a site (proxied through backend for private repos)
	 * @param id Site ID
	 * @param branch Branch name (defaults to "main")
	 */
	getRepositoryTree(
		id: number,
		branch?: string,
	): Promise<{
		sha: string;
		tree: Array<{ path: string; mode: string; type: string; sha: string; size?: number; url?: string }>;
		truncated: boolean;
	}>;
	/**
	 * Gets file content from the repository (proxied through backend for private repos)
	 * @param id Site ID
	 * @param path File path
	 * @param branch Branch name (defaults to "main")
	 */
	getFileContent(
		id: number,
		path: string,
		branch?: string,
	): Promise<{
		name: string;
		path: string;
		sha: string;
		type: string;
		content?: string;
		encoding?: string;
	}>;
	/**
	 * Syncs the entire file tree to GitHub in a single atomic commit.
	 * Replaces the batch operations approach with a simpler tree-based sync.
	 * @param id Site ID
	 * @param tree Complete file tree structure
	 * @param commitMessage Optional commit message
	 */
	syncTree(
		id: number,
		tree: Array<FileTreeNode>,
		commitMessage?: string,
	): Promise<{ success: boolean; commitSha: string }>;
	/**
	 * Gets all sites that include a given article.
	 * Used by the article sites badge.
	 * @param articleJrn - JRN of the article
	 * @returns Sites that include this article
	 */
	getSitesForArticle(articleJrn: string): Promise<Array<ArticleSiteInfo>>;
}

export function createSiteClient(baseUrl: string, auth: ClientAuth): SiteClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		listSites,
		getSite,
		createSite,
		regenerateSite,
		deleteSite,
		updateSiteArticles,
		cancelBuild,
		getChangedConfigFiles,
		formatCode,
		listFolderContents,
		checkSubdomainAvailability,
		addCustomDomain,
		removeCustomDomain,
		getCustomDomainStatus,
		verifyCustomDomain,
		refreshDomainStatuses,
		updateJwtAuthConfig,
		updateBranding,
		updateFolderStructure,
		getRepositoryTree,
		getFileContent,
		syncTree,
		getSitesForArticle,
	};

	async function listSites(): Promise<Array<SiteWithUpdate>> {
		const response = await fetch(basePath, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list sites: ${response.statusText}`);
		}

		return (await response.json()) as Array<SiteWithUpdate>;
	}

	async function getSite(id: number): Promise<SiteWithUpdate | undefined> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (response.status === 404) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to get site: ${response.statusText}`);
		}

		return (await response.json()) as SiteWithUpdate;
	}

	async function createSite(data: CreateSiteRequest): Promise<Site> {
		const response = await fetch(basePath, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create site: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function regenerateSite(id: number): Promise<Site> {
		const response = await fetch(`${basePath}/${id}/regenerate`, createRequest("PUT"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to regenerate site: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function deleteSite(id: number): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete site: ${response.statusText}`);
		}
	}

	async function updateSiteArticles(id: number, selectedArticleJrns: Array<string> | null): Promise<SiteWithUpdate> {
		const response = await fetch(`${basePath}/${id}/articles`, createRequest("PUT", { selectedArticleJrns }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update site articles: ${response.statusText}`);
		}

		return (await response.json()) as SiteWithUpdate;
	}

	async function cancelBuild(id: number): Promise<Site> {
		const response = await fetch(`${basePath}/${id}/cancel-build`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to cancel build: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function getChangedConfigFiles(id: number): Promise<Array<ChangedConfigFile>> {
		const response = await fetch(`${basePath}/${id}/changed-config-files`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get changed config files: ${response.statusText}`);
		}

		const data = (await response.json()) as { changedConfigFiles: Array<ChangedConfigFile> };
		return data.changedConfigFiles;
	}

	async function formatCode(content: string, filePath: string): Promise<{ formatted: string }> {
		const response = await fetch(`${basePath}/format-code`, createRequest("POST", { content, filePath }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to format code: ${response.statusText}`);
		}

		return (await response.json()) as { formatted: string };
	}

	async function listFolderContents(id: number, path: string): Promise<{ files: Array<string> }> {
		const encodedPath = encodeURIComponent(path);
		const response = await fetch(`${basePath}/${id}/folders/contents?path=${encodedPath}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to list folder contents: ${response.statusText}`);
		}

		return (await response.json()) as { files: Array<string> };
	}

	async function checkSubdomainAvailability(subdomain: string): Promise<{
		available: boolean;
		suggestion?: string;
		error?: string;
	}> {
		const response = await fetch(
			`${basePath}/check-subdomain?subdomain=${encodeURIComponent(subdomain)}`,
			createRequest("GET"),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				available: boolean;
				error?: string;
			};
			return errorData;
		}

		return (await response.json()) as { available: boolean; suggestion?: string };
	}

	async function addCustomDomain(siteId: number, domain: string): Promise<{ domain: CustomDomainInfo }> {
		const response = await fetch(`${basePath}/${siteId}/domains`, createRequest("POST", { domain }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to add domain: ${response.statusText}`);
		}

		return (await response.json()) as { domain: CustomDomainInfo };
	}

	async function removeCustomDomain(siteId: number, domain: string): Promise<void> {
		const encodedDomain = encodeURIComponent(domain);
		const response = await fetch(`${basePath}/${siteId}/domains/${encodedDomain}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to remove domain: ${response.statusText}`);
		}
	}

	async function getCustomDomainStatus(
		siteId: number,
		domain: string,
	): Promise<{
		domain: CustomDomainInfo;
		verification?: Array<DomainVerificationChallenge>;
	}> {
		const encodedDomain = encodeURIComponent(domain);
		const response = await fetch(`${basePath}/${siteId}/domains/${encodedDomain}/status`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to get domain status: ${response.statusText}`);
		}

		return (await response.json()) as {
			domain: CustomDomainInfo;
			verification?: Array<DomainVerificationChallenge>;
		};
	}

	async function verifyCustomDomain(siteId: number, domain: string): Promise<{ domain: CustomDomainInfo }> {
		const encodedDomain = encodeURIComponent(domain);
		const response = await fetch(`${basePath}/${siteId}/domains/${encodedDomain}/verify`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to verify domain: ${response.statusText}`);
		}

		return (await response.json()) as { domain: CustomDomainInfo };
	}

	async function refreshDomainStatuses(siteId: number): Promise<{ domains: Array<CustomDomainInfo> }> {
		const response = await fetch(`${basePath}/${siteId}/domains/refresh`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to refresh domain statuses: ${response.statusText}`);
		}

		return (await response.json()) as { domains: Array<CustomDomainInfo> };
	}

	async function updateJwtAuthConfig(id: number, config: JwtAuthConfigUpdate): Promise<Site> {
		const response = await fetch(`${basePath}/${id}/auth/config`, createRequest("PUT", config));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to update JWT auth config: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function updateBranding(id: number, branding: SiteBranding): Promise<Site> {
		const response = await fetch(`${basePath}/${id}/branding`, createRequest("PUT", branding));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to update branding: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function updateFolderStructure(id: number, useSpaceFolderStructure: boolean): Promise<Site> {
		const response = await fetch(
			`${basePath}/${id}/folder-structure`,
			createRequest("PUT", { useSpaceFolderStructure }),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to update folder structure: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function getRepositoryTree(
		id: number,
		branch = "main",
	): Promise<{
		sha: string;
		tree: Array<{ path: string; mode: string; type: string; sha: string; size?: number; url?: string }>;
		truncated: boolean;
	}> {
		const response = await fetch(
			`${basePath}/${id}/github/tree?branch=${encodeURIComponent(branch)}`,
			createRequest("GET"),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to get repository tree: ${response.statusText}`);
		}

		return (await response.json()) as {
			sha: string;
			tree: Array<{ path: string; mode: string; type: string; sha: string; size?: number; url?: string }>;
			truncated: boolean;
		};
	}

	async function getFileContent(
		id: number,
		path: string,
		branch = "main",
	): Promise<{
		name: string;
		path: string;
		sha: string;
		type: string;
		content?: string;
		encoding?: string;
	}> {
		const response = await fetch(
			`${basePath}/${id}/github/content?path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`,
			createRequest("GET"),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to get file content: ${response.statusText}`);
		}

		return (await response.json()) as {
			name: string;
			path: string;
			sha: string;
			type: string;
			content?: string;
			encoding?: string;
		};
	}

	async function syncTree(
		id: number,
		tree: Array<FileTreeNode>,
		commitMessage?: string,
	): Promise<{ success: boolean; commitSha: string }> {
		const response = await fetch(
			`${basePath}/${id}/repository/sync`,
			createRequest("POST", { tree, commitMessage }),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to sync tree: ${response.statusText}`);
		}

		return (await response.json()) as { success: boolean; commitSha: string };
	}

	async function getSitesForArticle(articleJrn: string): Promise<Array<ArticleSiteInfo>> {
		const response = await fetch(`${basePath}/for-article/${encodeURIComponent(articleJrn)}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get sites for article: ${response.statusText}`);
		}

		const data = (await response.json()) as { sites: Array<ArticleSiteInfo> };
		return data.sites;
	}
}
