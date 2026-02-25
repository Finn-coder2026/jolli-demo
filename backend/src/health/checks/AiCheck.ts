import { getConfig } from "../../config/Config";
import type { CheckResult, HealthCheck } from "../HealthTypes";

/**
 * Creates a health check for AI service connectivity.
 * Uses the GET /v1/models endpoint which is free (no token cost).
 *
 * Returns 'healthy' if API responds, 'unhealthy' if unreachable, 'disabled' if not configured.
 */
export function createAiCheck(): HealthCheck {
	return {
		name: "ai",
		critical: false,
		check,
	};

	async function check(): Promise<CheckResult> {
		const config = getConfig();
		const apiKey = config.ANTHROPIC_API_KEY;

		if (!apiKey) {
			return {
				status: "disabled",
				message: "AI not configured",
			};
		}

		const start = Date.now();

		try {
			const response = await fetch("https://api.anthropic.com/v1/models", {
				method: "GET",
				headers: {
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
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
				message: `AI service returned ${response.status}`,
			};
		} catch {
			return {
				status: "unhealthy",
				latencyMs: Date.now() - start,
				message: "AI service unreachable",
			};
		}
	}
}
