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
}

/**
 * JWT auth configuration for site creation
 */
export interface CreateSiteJwtAuth {
	enabled: boolean;
	mode?: JwtAuthMode; // Required if enabled is true
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
}

/**
 * Update site articles request
 */
export interface UpdateSiteArticlesRequest {
	selectedArticleJrns: Array<string> | null; // null = all articles, array = specific selection
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
}

/**
 * Update check result
 */
export interface UpdateCheckResult {
	needsUpdate: boolean;
	lastGeneratedAt: string | undefined;
	latestArticleUpdate: string;
	changedArticles: Array<ChangedArticle>;
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
	 * Updates a single file in the repository
	 */
	updateRepositoryFile(id: number, filePath: string, content: string): Promise<void>;
	/**
	 * Checks if a docsite needs updating
	 */
	checkUpdateStatus(id: number): Promise<UpdateCheckResult>;
	/**
	 * Toggles protection on/off for a docsite
	 */
	toggleProtection(id: number): Promise<Site>;
	/**
	 * Refreshes protection status from Vercel
	 */
	refreshProtectionStatus(id: number): Promise<Site>;
	/**
	 * Publishes an external docsite (removes protection)
	 */
	publishSite(id: number): Promise<Site>;
	/**
	 * Unpublishes an external docsite (adds protection)
	 */
	unpublishSite(id: number): Promise<Site>;
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
	 * Creates a folder in the site repository
	 * @param id Site ID
	 * @param path Folder path (e.g., "content/guides")
	 */
	createFolder(id: number, path: string): Promise<{ success: boolean; path: string }>;
	/**
	 * Deletes a folder from the site repository
	 * @param id Site ID
	 * @param path Folder path (e.g., "content/guides")
	 */
	deleteFolder(id: number, path: string): Promise<{ success: boolean }>;
	/**
	 * Renames a folder in the site repository
	 * @param id Site ID
	 * @param path Current folder path (e.g., "content/guides")
	 * @param newName New name for the folder (just the name, not full path)
	 */
	renameFolder(id: number, path: string, newName: string): Promise<{ success: boolean; newPath: string }>;
	/**
	 * Moves a file to a different folder in the site repository
	 * @param id Site ID
	 * @param filePath Current file path (e.g., "content/intro.mdx")
	 * @param destination Destination folder path (e.g., "content/guides")
	 */
	moveFile(id: number, filePath: string, destination: string): Promise<{ success: boolean; newPath: string }>;
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
}

export function createSiteClient(baseUrl: string, auth: ClientAuth): SiteClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		listSites,
		getSite,
		createSite,
		regenerateSite,
		updateRepositoryFile,
		checkUpdateStatus,
		toggleProtection,
		refreshProtectionStatus,
		publishSite,
		unpublishSite,
		deleteSite,
		updateSiteArticles,
		cancelBuild,
		getChangedConfigFiles,
		formatCode,
		createFolder,
		deleteFolder,
		renameFolder,
		moveFile,
		listFolderContents,
		checkSubdomainAvailability,
		addCustomDomain,
		removeCustomDomain,
		getCustomDomainStatus,
		verifyCustomDomain,
		refreshDomainStatuses,
		updateJwtAuthConfig,
		getRepositoryTree,
		getFileContent,
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

	async function updateRepositoryFile(id: number, filePath: string, content: string): Promise<void> {
		const response = await fetch(`${basePath}/${id}/repository-file`, createRequest("PUT", { filePath, content }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to update repository file: ${response.statusText}`);
		}
	}

	async function checkUpdateStatus(id: number): Promise<UpdateCheckResult> {
		const response = await fetch(`${basePath}/${id}/check-update`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to check update status: ${response.statusText}`);
		}

		return (await response.json()) as UpdateCheckResult;
	}

	async function toggleProtection(id: number): Promise<Site> {
		const response = await fetch(`${basePath}/${id}/toggle-protection`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to toggle protection: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function refreshProtectionStatus(id: number): Promise<Site> {
		const response = await fetch(`${basePath}/${id}/refresh-protection`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to refresh protection status: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function publishSite(id: number): Promise<Site> {
		const response = await fetch(`${basePath}/${id}/publish`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to publish site: ${response.statusText}`);
		}

		return (await response.json()) as Site;
	}

	async function unpublishSite(id: number): Promise<Site> {
		const response = await fetch(`${basePath}/${id}/unpublish`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to unpublish site: ${response.statusText}`);
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

	async function createFolder(id: number, path: string): Promise<{ success: boolean; path: string }> {
		const response = await fetch(`${basePath}/${id}/folders`, createRequest("POST", { path }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to create folder: ${response.statusText}`);
		}

		return (await response.json()) as { success: boolean; path: string };
	}

	async function deleteFolder(id: number, path: string): Promise<{ success: boolean }> {
		const encodedPath = encodeURIComponent(path);
		const response = await fetch(`${basePath}/${id}/folders?path=${encodedPath}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to delete folder: ${response.statusText}`);
		}

		return (await response.json()) as { success: boolean };
	}

	async function renameFolder(
		id: number,
		path: string,
		newName: string,
	): Promise<{ success: boolean; newPath: string }> {
		const response = await fetch(`${basePath}/${id}/folders/rename`, createRequest("PUT", { path, newName }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to rename folder: ${response.statusText}`);
		}

		return (await response.json()) as { success: boolean; newPath: string };
	}

	async function moveFile(
		id: number,
		filePath: string,
		destination: string,
	): Promise<{ success: boolean; newPath: string }> {
		const response = await fetch(
			`${basePath}/${id}/files/move`,
			createRequest("PUT", { path: filePath, destination }),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({ error: response.statusText }))) as {
				error?: string;
			};
			throw new Error(errorData.error || `Failed to move file: ${response.statusText}`);
		}

		return (await response.json()) as { success: boolean; newPath: string };
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
}
