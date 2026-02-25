import type { ClientAuth } from "./Client";

/**
 * Error thrown when tenant selection fails with a specific error code from the server.
 * The `code` field contains the machine-readable error key (e.g., "user_inactive").
 */
export class TenantSelectionError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "TenantSelectionError";
		this.code = code;
	}
}

export interface SessionConfig {
	/** @deprecated Frontend idle timeout removed, kept for backwards compatibility */
	idleTimeoutMs?: number;
	/** @deprecated OAuth provider selection UI not used in production, kept for backwards compatibility */
	enabledProviders?: Array<string>;
	/** Site deployment environment: "local", "dev", "preview", or "prod" */
	siteEnv: "local" | "dev" | "preview" | "prod";
	/** Base domain for jolli.site subdomains (e.g., "jolli.site") */
	jolliSiteDomain: string;
	/** Auth gateway origin for centralized authentication (optional) */
	authGatewayOrigin?: string;
	/** Cookie domain for cross-subdomain cookie sharing (e.g., ".jolli.app") */
	cookieDomain?: string;
}

export interface CliTokenResponse {
	token: string;
	space?: string;
}

export interface AuthClient {
	/**
	 * Gets a CLI token and default space for command-line authentication
	 */
	getCliToken(): Promise<CliTokenResponse>;
	/**
	 * Sets the auth token for subsequent requests
	 */
	setAuthToken(token: string | undefined): void;
	/**
	 * Gets session configuration (idle timeout, etc.)
	 */
	getSessionConfig(): Promise<SessionConfig>;
	/**
	 * Selects a tenant/org and regenerates JWT with new tenant context.
	 * This allows switching tenants while staying logged in.
	 */
	selectTenant(tenantId: string, orgId: string): Promise<{ success: boolean; url: string }>;
}

export function createAuthClient(baseUrl: string, auth: ClientAuth): AuthClient {
	return {
		getCliToken,
		setAuthToken,
		getSessionConfig,
		selectTenant,
	};

	async function getCliToken(): Promise<CliTokenResponse> {
		const response = await fetch(`${baseUrl}/api/auth/cli-token`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error("Failed to get CLI token");
		}
		const data = (await response.json()) as CliTokenResponse;
		return data;
	}

	function setAuthToken(token: string | undefined): void {
		auth.authToken = token;
	}

	async function getSessionConfig(): Promise<SessionConfig> {
		const response = await fetch(`${baseUrl}/api/auth/session-config`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error("Failed to get session config");
		}
		return (await response.json()) as SessionConfig;
	}

	async function selectTenant(tenantId: string, orgId: string): Promise<{ success: boolean; url: string }> {
		const response = await fetch(
			`${baseUrl}/api/auth/tenants/select`,
			auth.createRequest("POST", { tenantId, orgId }),
		);
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: "unknown" }));
			throw new TenantSelectionError(
				(errorData as { error: string }).error ?? "unknown",
				(errorData as { message?: string }).message ?? "Failed to select tenant",
			);
		}
		return (await response.json()) as { success: boolean; url: string };
	}
}
