import { getConfig } from "../../config/Config";
import type { CheckResult, HealthCheck } from "../HealthTypes";

interface AuthProviderResult {
	name: string;
	configured: boolean;
	reachable?: boolean;
	latencyMs?: number;
}

/**
 * Creates a health check for OAuth authentication providers.
 * Checks if GitHub and Google OAuth endpoints are configured and reachable.
 *
 * Returns 'healthy' if at least one configured provider is reachable,
 * 'unhealthy' if configured providers are unreachable, 'disabled' if none configured.
 */
export function createAuthCheck(): HealthCheck {
	return {
		name: "auth",
		critical: false,
		check,
	};

	async function check(): Promise<CheckResult> {
		const config = getConfig();

		const hasGitHub = Boolean(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
		const hasGoogle = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);

		if (!hasGitHub && !hasGoogle) {
			return {
				status: "disabled",
				message: "No OAuth providers configured",
			};
		}

		const start = Date.now();

		// Build array of checks to run in parallel
		const checksToRun: Array<Promise<AuthProviderResult>> = [];
		if (hasGitHub) {
			checksToRun.push(checkGitHubOAuth());
		}
		if (hasGoogle) {
			checksToRun.push(checkGoogleOAuth());
		}

		// Run all provider checks in parallel
		const providers = await Promise.all(checksToRun);

		const latencyMs = Date.now() - start;
		const configuredProviders = providers.filter(p => p.configured);
		const reachableProviders = providers.filter(p => p.reachable);

		// At least one configured provider must be reachable
		if (reachableProviders.length > 0) {
			return {
				status: "healthy",
				latencyMs,
			};
		}

		// All configured providers are unreachable
		const unreachableNames = configuredProviders.map(p => p.name).join(", ");
		return {
			status: "unhealthy",
			latencyMs,
			message: `OAuth providers unreachable: ${unreachableNames}`,
		};
	}
}

async function checkGitHubOAuth(): Promise<AuthProviderResult> {
	const start = Date.now();
	try {
		// GitHub API root endpoint - returns 200 and proves GitHub is reachable
		// (GitHub doesn't have a standard OIDC discovery endpoint)
		const response = await fetch("https://api.github.com", {
			method: "GET",
		});
		return {
			name: "GitHub",
			configured: true,
			reachable: response.ok,
			latencyMs: Date.now() - start,
		};
	} catch {
		return {
			name: "GitHub",
			configured: true,
			reachable: false,
			latencyMs: Date.now() - start,
		};
	}
}

async function checkGoogleOAuth(): Promise<AuthProviderResult> {
	const start = Date.now();
	try {
		// Google's OpenID Connect discovery endpoint
		const response = await fetch("https://accounts.google.com/.well-known/openid-configuration", {
			method: "GET",
		});
		return {
			name: "Google",
			configured: true,
			reachable: response.ok,
			latencyMs: Date.now() - start,
		};
	} catch {
		return {
			name: "Google",
			configured: true,
			reachable: false,
			latencyMs: Date.now() - start,
		};
	}
}
