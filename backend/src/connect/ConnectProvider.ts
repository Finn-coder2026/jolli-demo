import type { TenantOrgContext } from "../tenant/TenantContext";
import type { Request } from "express";

/**
 * Common state payload included in all encrypted states.
 * This is the decoded payload from the state parameter after validation.
 */
export interface ConnectStatePayload {
	/** The provider name (e.g., "github", "gitlab", "jira") */
	provider: string;
	/** The tenant slug this connect flow is for */
	tenantSlug: string;
	/** The org slug within the tenant (optional) */
	orgSlug?: string;
	/** The URL to redirect back to after completion */
	returnTo: string;
	/** Timestamp when the state was issued (ms since epoch) */
	issuedAt: number;
	/** Timestamp when the state expires (ms since epoch) */
	expiresAt: number;
}

/**
 * Result from handling a callback on the connect gateway.
 * Either redirects to the tenant's complete endpoint, or redirects with an error.
 */
export type ConnectCallbackResult =
	| {
			success: true;
			/** URL to redirect to (tenant's /complete endpoint with encrypted code) */
			redirectUrl: string;
	  }
	| {
			success: false;
			/** Error code for logging/debugging */
			error: string;
			/** URL to redirect to with error (usually tenant's origin with error param) */
			redirectUrl: string;
	  };

/**
 * Result from completing setup on the tenant.
 * Either provides a redirect path for success, or an error.
 */
export type ConnectCompleteResult =
	| {
			success: true;
			/** Path to redirect to after completion (e.g., /integrations/github/org/name) */
			redirectPath: string;
	  }
	| {
			success: false;
			/** Error code for logging/debugging */
			error: string;
	  };

/**
 * Interface that all integration providers must implement.
 *
 * The connect flow works as follows:
 * 1. User on tenant calls getSetupRedirectUrl() -> returns external service URL with encrypted state
 * 2. External service redirects to connect gateway -> handleCallback() processes and redirects to tenant
 * 3. Tenant receives redirect -> handleComplete() creates integration records
 *
 * Optionally, providers can implement handleWebhook() to process webhook events.
 */
export interface ConnectProvider {
	/**
	 * Provider name, e.g., "github", "gitlab", "jira".
	 * Used for routing and config key lookup.
	 */
	readonly name: string;

	/**
	 * Get the redirect URL to start the setup flow.
	 * Called on the tenant's domain.
	 *
	 * @param tenantSlug - The tenant's slug
	 * @param orgSlug - The org's slug within the tenant (optional)
	 * @param returnTo - The URL to redirect back to after completion
	 * @param options - Provider-specific options (optional)
	 * @returns The URL to redirect the user to (external service)
	 */
	getSetupRedirectUrl(
		tenantSlug: string,
		orgSlug: string | undefined,
		returnTo: string,
		options?: Record<string, unknown>,
	): Promise<string>;

	/**
	 * Handle callback from external service.
	 * Called on the connect gateway (connect.{BASE_DOMAIN}).
	 *
	 * This method should:
	 * 1. Validate the callback parameters from the external service
	 * 2. Fetch any additional data needed from the external service
	 * 3. Generate an encrypted code containing the data
	 * 4. Return a redirect URL to the tenant's complete endpoint
	 *
	 * @param req - The Express request object with callback parameters
	 * @param statePayload - The decoded and validated state payload
	 * @returns Result with redirect URL (success or error)
	 */
	handleCallback(req: Request, statePayload: ConnectStatePayload): Promise<ConnectCallbackResult>;

	/**
	 * Complete setup on the tenant.
	 * Called on the tenant's domain after callback redirects here.
	 *
	 * This method should:
	 * 1. Validate the code payload
	 * 2. Verify the tenant matches
	 * 3. Create/update integration records in the tenant's database
	 * 4. Return a redirect path for the UI
	 *
	 * @param codePayload - The decoded provider-specific data from the code
	 * @param tenantContext - The current tenant context
	 * @returns Result with redirect path (success) or error
	 */
	handleComplete(codePayload: unknown, tenantContext: TenantOrgContext): Promise<ConnectCompleteResult>;

	/**
	 * Handle webhooks from external service (optional).
	 * Called when the external service sends webhook events.
	 *
	 * @param req - The Express request object with webhook payload
	 */
	handleWebhook?(req: Request): Promise<void>;

	/**
	 * List available installations for the current user (optional).
	 * Returns installations that can be connected to the current tenant/org.
	 *
	 * This is used when the external service's app is already installed
	 * and we want to allow connecting it without going through the full
	 * installation flow again.
	 *
	 * @param userAccessToken - OAuth access token for the user
	 * @param tenantContext - The current tenant context
	 * @returns List of available installations
	 */
	listAvailableInstallations?(
		userAccessToken: string,
		tenantContext: TenantOrgContext,
	): Promise<Array<AvailableInstallation>>;

	/**
	 * Connect an existing installation to the current tenant/org (optional).
	 * Used when the external service's app is already installed elsewhere.
	 *
	 * @param installationId - The installation ID to connect
	 * @param tenantContext - The current tenant context
	 * @returns Result with redirect path (success) or error
	 */
	connectExistingInstallation?(
		installationId: number,
		tenantContext: TenantOrgContext,
	): Promise<ConnectCompleteResult>;
}

/**
 * An installation available to connect to the current tenant/org.
 * Used by providers that support connecting existing installations.
 */
export interface AvailableInstallation {
	/** Account login (org or user name) */
	accountLogin: string;
	/** Account type */
	accountType: "Organization" | "User";
	/** Installation ID from the external service */
	installationId: number;
	/** Repository names the installation has access to */
	repos: Array<string>;
	/** Whether this installation is already connected to the current tenant+org */
	alreadyConnectedToCurrentOrg: boolean;
}
