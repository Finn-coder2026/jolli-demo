import { getConfig } from "../../config/Config";
import type { CheckResult, HealthCheck } from "../HealthTypes";
import type { Octokit } from "@octokit/rest";

/**
 * Creates a health check for GitHub API connectivity.
 * Uses the /rate_limit endpoint which doesn't count against rate limits
 * and validates that credentials are working.
 *
 * Returns 'disabled' if GITHUB_APPS_INFO is not configured.
 */
export function createGitCheck(octokit: Octokit): HealthCheck {
	return {
		name: "git",
		critical: false,
		check,
	};

	async function check(): Promise<CheckResult> {
		const config = getConfig();

		// If no GitHub App configured, consider git integration disabled
		if (!config.GITHUB_APPS_INFO) {
			return {
				status: "disabled",
				message: "Git integration not configured",
			};
		}

		const start = Date.now();
		try {
			// GET /rate_limit doesn't count against rate limits
			// and validates that our credentials are working
			await octokit.rateLimit.get();
			return {
				status: "healthy",
				latencyMs: Date.now() - start,
			};
		} catch (_error) {
			return {
				status: "unhealthy",
				latencyMs: Date.now() - start,
				message: "Git service unreachable",
			};
		}
	}
}
