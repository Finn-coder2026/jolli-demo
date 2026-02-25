import { memoized } from "../util/ObjectUtils";
import { type AgentHubClient, createAgentHubClient } from "./AgentHubClient";
import { type AuthClient, createAuthClient } from "./AuthClient";
import { type CollabConvoClient, createCollabConvoClient } from "./CollabConvoClient";
import { createDevToolsClient, type DevToolsClient } from "./DevToolsClient";
import { createDocClient, type DocClient } from "./DocClient";
import { createDocDraftClient, type DocDraftClient } from "./DocDraftClient";
import { createDocsiteClient, type DocsiteClient } from "./DocsiteClient";
import { createGitHubClient, type GitHubClient } from "./GitHubClient";
import { createImageClient, type ImageClient } from "./ImageClient";
import { createIntegrationClient, type IntegrationClient } from "./IntegrationClient";
import { createJobClient, type JobClient } from "./JobClient";
import { createOnboardingClient, type OnboardingClient } from "./OnboardingClient";
import { createOrgClient, type OrgClient } from "./OrgClient";
import { createProfileClient, type ProfileClient } from "./ProfileClient";
import { createRoleClient, type RoleClient } from "./RoleClient";
import { createSiteClient, type SiteClient } from "./SiteClient";
import { createSourceClient, type SourceClient } from "./SourceClient";
import { createSpaceClient, type SpaceClient } from "./SpaceClient";
import { createSyncChangesetClient, type SyncChangesetClient } from "./SyncChangesetClient";
import { createTenantClient, type TenantClient } from "./TenantClient";
import type { UserInfo } from "./UserInfo";
import { createUserManagementClient, type UserManagementClient } from "./UserManagementClient";

/**
 * Response from login endpoint containing user info.
 * Note: favoritesHash is now obtained from /api/org/current endpoint.
 */
export interface LoginResponse {
	user: UserInfo | undefined;
}

export interface Client {
	login(): Promise<LoginResponse>;
	logout(): Promise<void>;
	status(): Promise<string>;
	visit(): Promise<void>;
	sync(url: string): Promise<void>;
	agentHub(): AgentHubClient;
	auth(): AuthClient;
	devTools(): DevToolsClient;
	docs(): DocClient;
	docDrafts(): DocDraftClient;
	collabConvos(): CollabConvoClient;
	docsites(): DocsiteClient;
	sites(): SiteClient;
	images(): ImageClient;
	sources(): SourceClient;
	spaces(): SpaceClient;
	syncChangesets(): SyncChangesetClient;
	integrations(): IntegrationClient;
	github(): GitHubClient;
	jobs(): JobClient;
	onboarding(): OnboardingClient;
	orgs(): OrgClient;
	profile(): ProfileClient;
	roles(): RoleClient;
	tenants(): TenantClient;
	userManagement(): UserManagementClient;
}

export interface ClientAuth {
	authToken?: string | undefined;
	createRequest(
		method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
		body?: unknown,
		additional?: Partial<RequestInit>,
	): RequestInit;
	/**
	 * Checks if response is a 401 and triggers the onUnauthorized callback if so.
	 * Returns true if unauthorized (so caller can handle early return).
	 * Optional - if not provided, 401 responses are not specially handled.
	 */
	checkUnauthorized?(response: Response): boolean;
}

/**
 * Callbacks that can be triggered by client operations
 */
export interface ClientCallbacks {
	/**
	 * Called when a 401 Unauthorized response is received.
	 * Useful for triggering session expiration handling.
	 */
	onUnauthorized?: () => void;
}

export function createClient(baseUrl = "", authToken?: string, callbacks?: ClientCallbacks): Client {
	const auth: ClientAuth = {
		authToken,
		createRequest,
		checkUnauthorized,
	};
	return {
		login,
		logout,
		status,
		visit,
		sync,
		agentHub: memoized(() => createAgentHubClient(baseUrl, auth)),
		auth: memoized(() => createAuthClient(baseUrl, auth)),
		devTools: memoized(() => createDevToolsClient(baseUrl, auth)),
		docs: memoized(() => createDocClient(baseUrl, auth)),
		docDrafts: memoized(() => createDocDraftClient(baseUrl, auth)),
		collabConvos: memoized(() => createCollabConvoClient(baseUrl, auth)),
		docsites: memoized(() => createDocsiteClient(baseUrl, auth)),
		sites: memoized(() => createSiteClient(baseUrl, auth)),
		images: memoized(() => createImageClient(baseUrl, auth)),
		sources: memoized(() => createSourceClient(baseUrl, auth)),
		spaces: memoized(() => createSpaceClient(baseUrl, auth)),
		syncChangesets: memoized(() => createSyncChangesetClient(baseUrl, auth)),
		integrations: memoized(() => createIntegrationClient(baseUrl, auth)),
		github: memoized(() => createGitHubClient(baseUrl, auth)),
		jobs: memoized(() => createJobClient(baseUrl)),
		onboarding: memoized(() => createOnboardingClient(baseUrl, auth)),
		orgs: memoized(() => createOrgClient(baseUrl, auth)),
		profile: memoized(() => createProfileClient(baseUrl, auth)),
		roles: memoized(() => createRoleClient(baseUrl, auth)),
		tenants: memoized(() => createTenantClient(baseUrl, auth)),
		userManagement: memoized(() => createUserManagementClient(baseUrl, auth)),
	};

	/**
	 * Checks if response is a 401 and triggers the onUnauthorized callback if so.
	 * Returns true if unauthorized (so caller can handle early return).
	 */
	function checkUnauthorized(response: Response): boolean {
		if (response.status === 401 && callbacks?.onUnauthorized) {
			callbacks.onUnauthorized();
			return true;
		}
		return false;
	}

	async function login(): Promise<LoginResponse> {
		const response = await fetch(`${baseUrl}/api/auth/login`, createRequest("GET"));
		if (response.ok) {
			const data = (await response.json()) as { user: UserInfo | undefined };
			return { user: data.user };
		}
		// Don't trigger onUnauthorized for login endpoint - it's expected to return undefined
		// when not logged in
		return { user: undefined };
	}

	async function logout(): Promise<void> {
		await fetch(`${baseUrl}/api/auth/logout`, createRequest("POST"));
	}

	async function status(): Promise<string> {
		try {
			const response = await fetch(`${baseUrl}/api/status/check`, createRequest("GET"));
			checkUnauthorized(response);
			return response.text();
		} catch {
			return "ERROR";
		}
	}

	async function visit(): Promise<void> {
		const response = await fetch(`${baseUrl}/api/visit/create`, createRequest("POST"));
		checkUnauthorized(response);
	}

	async function sync(url: string): Promise<void> {
		const response = await fetch(`${baseUrl}/api/ingest/sync`, createRequest("POST", { url }));
		if (checkUnauthorized(response)) {
			throw new Error("Unauthorized");
		}
		if (!response.ok) {
			const data = (await response.json()) as { error: string };
			throw new Error(`Failed to sync: ${data.error}`);
		}
	}

	function createRequest(
		method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
		body?: unknown,
		additional?: Partial<RequestInit>,
	): RequestInit {
		const headers: Record<string, string> = {};
		if (auth.authToken) {
			headers.Authorization = `Bearer ${auth.authToken}`;
		}
		if (body) {
			headers["Content-Type"] = "application/json";
		}

		// Add X-Tenant-Slug header for path-based multi-tenant mode (browser only).
		// In path-based mode, the backend can't resolve tenant from URL alone when JWT is
		// missing (e.g., expired/cleared cookies). This header ensures proper 401 responses
		// instead of 404 "Unable to determine tenant".
		const tenantSlug = getTenantSlug();
		if (tenantSlug) {
			headers["X-Tenant-Slug"] = tenantSlug;
		}

		// Add X-Org-Slug header for multi-tenant org selection (browser only)
		const selectedOrgSlug = getSelectedOrgSlug();
		if (selectedOrgSlug) {
			headers["X-Org-Slug"] = selectedOrgSlug;
		}

		return {
			method,
			headers,
			body: body ? JSON.stringify(body) : null,
			credentials: "include",
			...additional,
		};
	}

	/**
	 * Gets the tenant slug from session storage (browser only).
	 * Stored by Main.tsx during tenant detection for path-based multi-tenancy.
	 * Returns undefined if not in browser or no tenant slug is stored.
	 */
	function getTenantSlug(): string | undefined {
		try {
			const storage = typeof sessionStorage !== "undefined" ? sessionStorage : null;
			return storage?.getItem("tenantSlug") ?? undefined;
		} catch {
			return;
		}
	}

	/**
	 * Gets the selected org slug from session storage (browser only).
	 * Returns undefined if not in browser or no org is selected.
	 */
	function getSelectedOrgSlug(): string | undefined {
		try {
			// sessionStorage is only available in browser environments
			// Using indirect eval to avoid TypeScript errors in non-DOM environments
			const storage = typeof sessionStorage !== "undefined" ? sessionStorage : null;
			return storage?.getItem("selectedOrgSlug") ?? undefined;
		} catch {
			// sessionStorage access can throw in some contexts (e.g., sandboxed iframes)
			return;
		}
	}
}
