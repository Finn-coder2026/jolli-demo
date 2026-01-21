import type { ClientAuth } from "./Client";

export interface SessionConfig {
	idleTimeoutMs: number;
	enabledProviders: Array<string>;
	/** Site deployment environment: "local", "dev", "preview", or "prod" */
	siteEnv: "local" | "dev" | "preview" | "prod";
	/** Base domain for jolli.site subdomains (e.g., "jolli.site") */
	jolliSiteDomain: string;
}

export interface AuthClient {
	/**
	 * Gets a CLI token for command-line authentication
	 */
	getCliToken(): Promise<string>;
	/**
	 * Sets the auth token for subsequent requests
	 */
	setAuthToken(token: string | undefined): void;
	/**
	 * Gets available emails for the pending authentication
	 */
	getEmails(): Promise<Array<string>>;
	/**
	 * Selects an email for the account.
	 * Returns a redirect URL if in gateway mode (for multi-tenant auth).
	 */
	selectEmail(email: string): Promise<{ redirectTo?: string }>;
	/**
	 * Gets session configuration (idle timeout, etc.)
	 */
	getSessionConfig(): Promise<SessionConfig>;
}

export function createAuthClient(baseUrl: string, auth: ClientAuth): AuthClient {
	return {
		getCliToken,
		setAuthToken,
		getEmails,
		selectEmail,
		getSessionConfig,
	};

	async function getCliToken(): Promise<string> {
		const response = await fetch(`${baseUrl}/api/auth/cli-token`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error("Failed to get CLI token");
		}
		const data = (await response.json()) as { token: string };
		return data.token;
	}

	function setAuthToken(token: string | undefined): void {
		auth.authToken = token;
	}

	async function getEmails(): Promise<Array<string>> {
		const response = await fetch(`${baseUrl}/api/auth/emails`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error("Failed to get emails");
		}
		const data = (await response.json()) as { emails: Array<string> };
		return data.emails;
	}

	async function selectEmail(email: string): Promise<{ redirectTo?: string }> {
		const response = await fetch(`${baseUrl}/api/auth/select-email`, auth.createRequest("POST", { email }));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error("Failed to select email");
		}
		const data = (await response.json()) as { success: boolean; redirectTo?: string };
		return data.redirectTo ? { redirectTo: data.redirectTo } : {};
	}

	async function getSessionConfig(): Promise<SessionConfig> {
		const response = await fetch(`${baseUrl}/api/auth/session-config`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error("Failed to get session config");
		}
		return (await response.json()) as SessionConfig;
	}
}
