import { getConfig } from "../config/Config";
import { getLog } from "../util/Logger";
import { withTimeout } from "../util/Timeout";
import type { CheckResult, HealthCheck, HealthResponse } from "./HealthTypes";

const log = getLog(import.meta);

/**
 * Service for orchestrating health checks.
 */
export interface HealthService {
	/**
	 * Run all health checks and return aggregated result.
	 */
	check(): Promise<HealthResponse>;
}

/**
 * Options for creating a HealthService.
 */
export interface HealthServiceOptions {
	/** Array of health checks to run */
	checks: Array<HealthCheck>;
	/** Timeout in milliseconds for each individual check (default: 2000) */
	timeoutMs?: number;
}

/**
 * Creates a health service that orchestrates all health checks.
 *
 * Runs checks in parallel with individual timeouts.
 * Returns 'unhealthy' overall if any critical check fails.
 * Returns 'healthy' if only non-critical checks fail.
 */
export function createHealthService(options: HealthServiceOptions): HealthService {
	const { checks } = options;

	return {
		check: runChecks,
	};

	async function runChecks(): Promise<HealthResponse> {
		const config = getConfig();
		const timeoutMs = options.timeoutMs ?? config.HEALTH_CHECK_TIMEOUT_MS ?? 2000;

		// Run all checks in parallel with individual timeouts
		const results = await Promise.all(
			checks.map(async healthCheck => {
				try {
					const result = await withTimeout(healthCheck.check(), timeoutMs);
					return { name: healthCheck.name, critical: healthCheck.critical, result };
				} catch (error) {
					// Timeout or unexpected error
					log.warn({ check: healthCheck.name, error }, "Health check failed: %s", healthCheck.name);
					return {
						name: healthCheck.name,
						critical: healthCheck.critical,
						result: {
							status: "unhealthy" as const,
							message: "Check timed out",
						},
					};
				}
			}),
		);

		// Build checks record
		const checksRecord: Record<string, CheckResult> = {};
		let hasCriticalFailure = false;

		for (const { name, critical, result } of results) {
			checksRecord[name] = result;
			if (critical && result.status === "unhealthy") {
				hasCriticalFailure = true;
			}
		}

		// Get version from GIT_COMMIT_SHA environment variable (set during deployment)
		const version = process.env.GIT_COMMIT_SHA?.substring(0, 7) ?? "unknown";
		const environment = config.NODE_ENV;

		return {
			status: hasCriticalFailure ? "unhealthy" : "healthy",
			timestamp: new Date().toISOString(),
			version,
			environment,
			checks: checksRecord,
		};
	}
}
