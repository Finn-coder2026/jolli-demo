export type IntegrationType = "github" | "static_file" | "unknown";

export const IntegrationEventActions = ["created", "updated", "deleted"] as const;

export type IntegrationEventAction = (typeof IntegrationEventActions)[number];

export type IntegrationStatus = "active" | "needs_repo_access" | "error" | "pending_installation";

export interface Integration {
	readonly id: number;
	readonly type: IntegrationType;
	readonly name: string;
	readonly status: IntegrationStatus;
	readonly metadata: IntegrationMetadata | undefined;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type NewIntegration = Omit<Integration, "id" | "createdAt" | "updatedAt">;

/**
 * Access error keys for GitHub repository integrations
 * These keys are mapped to localized error messages on the frontend
 */
export type GithubRepoAccessErrorKey =
	| "repoNotAccessibleByApp" // Repository is not accessible by the GitHub App
	| "repoRemovedFromInstallation" // Repository was removed from GitHub App installation
	| "appInstallationUninstalled" // GitHub App installation was uninstalled
	| "repoNotAccessibleViaInstallation"; // Repository is not accessible via GitHub App installation

export interface GithubRepoIntegrationMetadata {
	repo: string;
	branch: string;
	features: Array<string>;
	githubAppId?: number;
	installationId?: number;
	lastAccessCheck?: string; // ISO timestamp of last successful access check
	accessError?: GithubRepoAccessErrorKey; // Error key if access check failed
}

/**
 * Metadata for static file integrations
 * These are user-uploaded files stored directly in the docs table
 */
export interface StaticFileIntegrationMetadata {
	/** Total number of files uploaded to this integration */
	fileCount: number;
	/** Last upload timestamp */
	lastUpload?: string;
}

/**
 * Union type for all integration metadata types.
 * Use type guards or cast to specific types when accessing type-specific fields.
 */
export type IntegrationMetadata = GithubRepoIntegrationMetadata | StaticFileIntegrationMetadata;

/**
 * Type guard to check if metadata is GitHub repository integration metadata
 */
export function isGithubRepoMetadata(
	metadata: IntegrationMetadata | undefined,
): metadata is GithubRepoIntegrationMetadata {
	return metadata !== undefined && "repo" in metadata && "branch" in metadata;
}

/**
 * Type guard to check if metadata is static file integration metadata
 */
export function isStaticFileMetadata(
	metadata: IntegrationMetadata | undefined,
): metadata is StaticFileIntegrationMetadata {
	return metadata !== undefined && "fileCount" in metadata;
}
