/**
 * SslProvider - Interface for SSL certificate management providers.
 *
 * Provides an abstraction layer for provisioning SSL certificates on custom domains.
 * Different implementations can use various providers (Vercel, AWS, Cloudflare, etc.).
 */

/** Result of an SSL provider operation */
export interface SslProviderResult {
	/** Whether the operation was successful */
	success: boolean;
	/** Error message if operation failed */
	error?: string;
	/** Certificate or domain ID from the provider */
	certificateId?: string;
}

/** SSL certificate/domain status */
export type SslProviderStatus = "pending" | "active" | "failed";

/**
 * Interface for SSL certificate providers.
 *
 * Implementations should handle:
 * - Adding domains for SSL provisioning
 * - Removing domains
 * - Checking SSL/domain verification status
 *
 * @example
 * ```typescript
 * const provider = createVercelSslProvider({ token: "...", projectId: "..." });
 *
 * // Add a domain for SSL
 * const result = await provider.addDomain("docs.acme.com");
 * if (result.success) {
 *   console.log("Domain added, SSL will be provisioned automatically");
 * }
 *
 * // Check status
 * const status = await provider.checkStatus("docs.acme.com");
 * console.log(`SSL status: ${status}`); // "pending" | "active" | "failed"
 *
 * // Remove domain
 * await provider.removeDomain("docs.acme.com");
 * ```
 */
export interface SslProvider {
	/** Provider type identifier (e.g., "vercel", "cloudflare", "none") */
	readonly type: string;

	/**
	 * Add a domain to the provider for SSL provisioning.
	 *
	 * @param domain - The domain to add (e.g., "docs.acme.com")
	 * @returns Result indicating success or failure
	 */
	addDomain(domain: string): Promise<SslProviderResult>;

	/**
	 * Remove a domain from the provider.
	 *
	 * @param domain - The domain to remove
	 * @returns Result indicating success or failure
	 */
	removeDomain(domain: string): Promise<SslProviderResult>;

	/**
	 * Check the SSL/verification status of a domain.
	 *
	 * @param domain - The domain to check
	 * @returns Current status of the domain
	 */
	checkStatus(domain: string): Promise<SslProviderStatus>;
}

/**
 * No-op SSL provider for development/testing or manual SSL setups.
 *
 * Returns success for all operations without actually provisioning SSL.
 */
export function createNoOpSslProvider(): SslProvider {
	return {
		type: "none",
		addDomain(_domain: string): Promise<SslProviderResult> {
			return Promise.resolve({ success: true });
		},
		removeDomain(_domain: string): Promise<SslProviderResult> {
			return Promise.resolve({ success: true });
		},
		checkStatus(_domain: string): Promise<SslProviderStatus> {
			return Promise.resolve("active");
		},
	};
}
