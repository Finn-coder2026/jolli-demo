/**
 * Status enum - lifecycle of a docsite
 */
export type DocsiteStatus = "pending" | "building" | "active" | "error" | "archived";

/**
 * Visibility enum - access control marker
 */
export type DocsiteVisibility = "internal" | "external";

/**
 * Deployment environment
 */
export type DocsiteEnvironment = "production" | "preview";

/**
 * Single deployment record
 */
export interface DocsiteDeployment {
	environment: DocsiteEnvironment;
	url: string;
	deploymentId?: string;
	deployedAt: string;
	status: "ready" | "building" | "error";
	error?: string;
}

/**
 * Repository source configuration
 */
export interface DocsiteRepoSource {
	repo: string;
	branch: string;
	paths?: Array<string>;
	integrationId?: number;
}

/**
 * Metadata - stored in JSONB field
 */
export interface DocsiteMetadata {
	repos: Array<DocsiteRepoSource>;
	deployments: Array<DocsiteDeployment>;
	framework?: string;
	buildCommand?: string;
	outputDirectory?: string;
	access?: {
		requiresAuth?: boolean;
		allowedDomains?: Array<string>;
		allowedEmails?: Array<string>;
		customAuthUrl?: string;
	};
	lastBuildAt?: string;
	lastDeployedAt?: string;
	lastHealthCheck?: string;
	lastBuildError?: string;
}

/**
 * Main docsite interface
 */
export interface Docsite {
	readonly id: number;
	readonly name: string;
	readonly displayName: string;
	readonly userId: number | undefined;
	readonly visibility: DocsiteVisibility;
	readonly status: DocsiteStatus;
	readonly metadata: DocsiteMetadata | undefined;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/**
 * Request to create a site
 */
export interface CreateDocsiteRequest {
	name: string;
	displayName: string;
	visibility?: DocsiteVisibility;
	status?: DocsiteStatus;
	metadata?: DocsiteMetadata;
}

/**
 * Request to update an existing docsite
 */
export interface UpdateDocsiteRequest extends Partial<CreateDocsiteRequest> {
	id: number;
}

/**
 * Request to generate a docsite from one or more integrations
 */
export interface GenerateDocsiteRequest {
	integrationIds: Array<number>;
	name: string;
	displayName: string;
	visibility?: DocsiteVisibility;
}

/**
 * Repository information for atomic docsite generation
 */
export interface DocsiteRepoInfo {
	fullName: string;
	defaultBranch: string;
}

/**
 * Request to atomically enable repositories and generate a docsite
 */
export interface GenerateDocsiteFromReposRequest {
	repositories: Array<DocsiteRepoInfo>;
	name: string;
	displayName: string;
	visibility?: DocsiteVisibility;
}
