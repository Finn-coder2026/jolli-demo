/**
 * VercelSslProvider - SSL certificate provider using Vercel's Domain API.
 *
 * When a domain is added to a Vercel project, Vercel automatically:
 * 1. Provisions an SSL certificate via Let's Encrypt
 * 2. Handles certificate renewal
 * 3. Routes traffic to the project
 */

import type { SslProvider, SslProviderResult, SslProviderStatus } from "./SslProvider";

/** Configuration for Vercel SSL Provider */
export interface VercelSslProviderConfig {
	/** Vercel API token with project access */
	token: string;
	/** The Vercel project ID to add domains to */
	projectId: string;
	/** Optional team ID for team projects */
	teamId?: string;
}

/** Vercel API domain response */
interface VercelDomainResponse {
	name: string;
	apexName: string;
	projectId: string;
	verified: boolean;
	verification?: Array<{
		type: string;
		domain: string;
		value: string;
		reason: string;
	}>;
	gitBranch?: string | null;
	createdAt: number;
	updatedAt: number;
}

/** Vercel API error response */
interface VercelErrorResponse {
	error: {
		code: string;
		message: string;
	};
}

/**
 * Create a Vercel SSL provider instance.
 *
 * @param config - Provider configuration
 * @returns SslProvider implementation for Vercel
 *
 * @example
 * ```typescript
 * const provider = createVercelSslProvider({
 *   token: process.env.VERCEL_TOKEN!,
 *   projectId: process.env.VERCEL_PROJECT_ID!,
 * });
 *
 * await provider.addDomain("docs.acme.com");
 * ```
 */
export function createVercelSslProvider(config: VercelSslProviderConfig): SslProvider {
	const { token, projectId, teamId } = config;
	const apiUrl = "https://api.vercel.com";

	function buildUrl(path: string): string {
		const url = new URL(path, apiUrl);
		if (teamId) {
			url.searchParams.set("teamId", teamId);
		}
		return url.toString();
	}

	async function addDomain(domain: string): Promise<SslProviderResult> {
		try {
			const response = await fetch(buildUrl(`/v10/projects/${projectId}/domains`), {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: domain }),
			});

			if (!response.ok) {
				const errorData = (await response.json()) as VercelErrorResponse;
				return {
					success: false,
					error: errorData.error?.message || `Failed to add domain: ${response.status}`,
				};
			}

			const data = (await response.json()) as VercelDomainResponse;
			return {
				success: true,
				certificateId: data.name,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error adding domain",
			};
		}
	}

	async function removeDomain(domain: string): Promise<SslProviderResult> {
		try {
			const response = await fetch(buildUrl(`/v9/projects/${projectId}/domains/${domain}`), {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			// 404 is acceptable - domain might already be removed
			if (!response.ok && response.status !== 404) {
				const errorData = (await response.json()) as VercelErrorResponse;
				return {
					success: false,
					error: errorData.error?.message || `Failed to remove domain: ${response.status}`,
				};
			}

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error removing domain",
			};
		}
	}

	async function checkStatus(domain: string): Promise<SslProviderStatus> {
		try {
			const response = await fetch(buildUrl(`/v9/projects/${projectId}/domains/${domain}`), {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				if (response.status === 404) {
					return "failed"; // Domain not found
				}
				return "failed";
			}

			const data = (await response.json()) as VercelDomainResponse;

			// Check if domain is verified
			if (!data.verified) {
				// Check if there are pending verification steps
				if (data.verification && data.verification.length > 0) {
					return "pending";
				}
				return "pending";
			}

			// Domain is verified, SSL is active
			return "active";
		} catch {
			return "failed";
		}
	}

	return {
		type: "vercel",
		addDomain,
		removeDomain,
		checkStatus,
	};
}
