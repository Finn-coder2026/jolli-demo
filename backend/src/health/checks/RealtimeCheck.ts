import { getConfig } from "../../config/Config";
import type { CheckResult, HealthCheck } from "../HealthTypes";

/**
 * Creates a health check for Mercure realtime connectivity.
 * Uses HTTP HEAD request to the Mercure hub to verify connectivity.
 *
 * Returns 'disabled' if MERCURE_ENABLED is false or hub URL is not configured.
 */
export function createRealtimeCheck(): HealthCheck {
	return {
		name: "realtime",
		critical: false,
		check,
	};

	async function check(): Promise<CheckResult> {
		const config = getConfig();

		// Check if Mercure is enabled and configured
		if (!config.MERCURE_ENABLED || !config.MERCURE_HUB_BASE_URL) {
			return {
				status: "disabled",
				message: "Realtime not enabled",
			};
		}

		const hubUrl = `${config.MERCURE_HUB_BASE_URL.replace(/\/$/, "")}/.well-known/mercure`;
		const start = Date.now();

		try {
			// Note: HealthService applies its own timeout wrapper, so we don't need one here.
			// Using a slightly longer fetch timeout as a safety net for network issues.
			const response = await fetch(hubUrl, {
				method: "HEAD",
			});

			// Mercure hub returns 405 for HEAD requests to the topic endpoint
			// but that still means it's reachable, so we accept 2xx, 4xx as "healthy"
			// Only network errors or 5xx indicate unhealthy
			if (response.status < 500) {
				return {
					status: "healthy",
					latencyMs: Date.now() - start,
				};
			}

			return {
				status: "unhealthy",
				latencyMs: Date.now() - start,
				message: `Realtime hub returned ${response.status}`,
			};
		} catch (_error) {
			return {
				status: "unhealthy",
				latencyMs: Date.now() - start,
				message: "Realtime hub unreachable",
			};
		}
	}
}
