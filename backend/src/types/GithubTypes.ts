import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";

export interface GitHubAppManifest {
	name: string;
	url: string;
	hook_attributes: {
		url: string;
		active: boolean;
	};
	redirect_url: string;
	setup_url: string;
	public: boolean;
	default_permissions: {
		contents: string;
		metadata: string;
	};
	default_events: Array<string>;
}

export interface GithubAppResponse {
	id: number;
	slug: string;
	client_id: string;
	node_id: string;
	owner: {
		login: string;
		id: number;
	};
	name: string;
	description: string | null;
	external_url: string;
	html_url: string;
	created_at: string;
	updated_at: string;
	permissions: Record<string, string>;
	events: Array<string>;
}

export interface GitHubAppConversionResponse extends GithubAppResponse {
	client_secret: string;
	webhook_secret: string;
	pem: string;
}

// Origin is now obtained from getConfig().ORIGIN to support multi-tenant mode
export interface GithubAppRouterOptions {
	/** Registry client for per-org installation mapping cleanup (optional, multi-tenant only) */
	registryClient?: TenantRegistryClient;
}

// GitHub account (organization or user)
export interface GitHubAccount {
	id: number;
	login: string;
	type: "Organization" | "User";
}

// GitHub App installation - represents an installed instance of a GitHub App
export interface GitHubAppInstallation {
	id: number;
	app_id: number;
	account: {
		login: string;
		type: "Organization" | "User";
	};
	target_type?: "Organization" | "User";
	target_id?: number;
	/** ISO-8601 timestamp when the installation was created on GitHub */
	created_at?: string;
}

// GitHub repository
export interface GitHubAppRepository {
	full_name: string;
	default_branch?: string | undefined;
}

export interface GitHubPayload {
	action: string;
	installation?: GitHubAppInstallation;
	organization?: GitHubAccount;
	sender?: GitHubAccount;
}

// Webhook payload for installation events (created, deleted)
export interface GitHubInstallationPayload extends GitHubPayload {
	repositories?: Array<GitHubAppRepository>;
}

// Webhook payload for installation_repositories events (added, removed)
export interface GitHubInstallationRepositoriesPayload extends GitHubPayload {
	repositories_added?: Array<GitHubAppRepository>;
	repositories_removed?: Array<GitHubAppRepository>;
}

// Webhook payload for push events
export interface GitHubPushPayload {
	ref: string;
	before: string;
	after: string;
	repository: {
		id: number;
		full_name: string;
		default_branch: string;
	};
	pusher: {
		name: string;
		email: string;
	};
	sender: GitHubAccount;
	installation?: {
		id: number;
	};
	commits?: Array<{
		id: string;
		message: string;
		added: Array<string>;
		removed: Array<string>;
		modified: Array<string>;
	}>;
}
