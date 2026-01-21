import { memoized } from "../util/ObjectUtils";
import { type AuthClient, createAuthClient } from "./AuthClient";
import { type ChatClient, createChatClient } from "./ChatClient";
import { type CollabConvoClient, createCollabConvoClient } from "./CollabConvoClient";
import { type ConvoClient, createConvoClient } from "./ConvoClient";
import { createDevToolsClient, type DevToolsClient } from "./DevToolsClient";
import { createDocClient, type DocClient } from "./DocClient";
import { createDocDraftClient, type DocDraftClient } from "./DocDraftClient";
import { createDocsiteClient, type DocsiteClient } from "./DocsiteClient";
import { createGitHubClient, type GitHubClient } from "./GitHubClient";
import { createImageClient, type ImageClient } from "./ImageClient";
import { createIntegrationClient, type IntegrationClient } from "./IntegrationClient";
import { createJobClient, type JobClient } from "./JobClient";
import { createOrgClient, type OrgClient } from "./OrgClient";
import { createSiteClient, type SiteClient } from "./SiteClient";
import { createSpaceClient, type SpaceClient } from "./SpaceClient";
import { createTenantClient, type TenantClient } from "./TenantClient";
import type { UserInfo } from "./UserInfo";

export interface Client {
	login(): Promise<UserInfo | undefined>;
	logout(): Promise<void>;
	status(): Promise<string>;
	visit(): Promise<void>;
	sync(url: string): Promise<void>;
	auth(): AuthClient;
	chat(): ChatClient;
	convos(): ConvoClient;
	devTools(): DevToolsClient;
	docs(): DocClient;
	docDrafts(): DocDraftClient;
	collabConvos(): CollabConvoClient;
	docsites(): DocsiteClient;
	sites(): SiteClient;
	images(): ImageClient;
	spaces(): SpaceClient;
	integrations(): IntegrationClient;
	github(): GitHubClient;
	jobs(): JobClient;
	orgs(): OrgClient;
	tenants(): TenantClient;
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
		auth: memoized(() => createAuthClient(baseUrl, auth)),
		chat: memoized(() => createChatClient(baseUrl, auth)),
		convos: memoized(() => createConvoClient(baseUrl, auth)),
		devTools: memoized(() => createDevToolsClient(baseUrl, auth)),
		docs: memoized(() => createDocClient(baseUrl, auth)),
		docDrafts: memoized(() => createDocDraftClient(baseUrl, auth)),
		collabConvos: memoized(() => createCollabConvoClient(baseUrl, auth)),
		docsites: memoized(() => createDocsiteClient(baseUrl, auth)),
		sites: memoized(() => createSiteClient(baseUrl, auth)),
		images: memoized(() => createImageClient(baseUrl, auth)),
		spaces: memoized(() => createSpaceClient(baseUrl, auth)),
		integrations: memoized(() => createIntegrationClient(baseUrl, auth)),
		github: memoized(() => createGitHubClient(baseUrl, auth)),
		jobs: memoized(() => createJobClient(baseUrl)),
		orgs: memoized(() => createOrgClient(baseUrl, auth)),
		tenants: memoized(() => createTenantClient(baseUrl, auth)),
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

	async function login(): Promise<UserInfo | undefined> {
		const response = await fetch(`${baseUrl}/api/auth/login`, createRequest("GET"));
		if (response.ok) {
			const data = (await response.json()) as { user: UserInfo };
			return data.user;
		}
		// Don't trigger onUnauthorized for login endpoint - it's expected to return undefined
		// when not logged in
		return;
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
