import { getConfig } from "../../config/Config";
import type { CheckResult, HealthCheck } from "../HealthTypes";

/**
 * Creates a health check for Vercel API connectivity.
 * Uses the GET /v2/user endpoint to verify token validity.
 *
 * Returns 'healthy' if API responds, 'unhealthy' if unreachable, 'disabled' if not configured.
 */
export function createVercelCheck(): HealthCheck {
	return {
		name: "hosting",
		critical: false,
		check,
	};

	async function check(): Promise<CheckResult> {
		const config = getConfig();
		const token = config.VERCEL_TOKEN;

		if (!token) {
			return {
				status: "disabled",
				message: "Hosting API not configured",
			};
		}

		const start = Date.now();

		try {
			const response = await fetch("https://api.vercel.com/v2/user", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			const latencyMs = Date.now() - start;

			if (response.ok) {
				return {
					status: "healthy",
					latencyMs,
				};
			}

			return {
				status: "unhealthy",
				latencyMs,
				message: `Hosting API returned ${response.status}`,
			};
		} catch {
			return {
				status: "unhealthy",
				latencyMs: Date.now() - start,
				message: "Hosting API unreachable",
			};
		}
	}
}
