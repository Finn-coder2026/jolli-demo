/**
 * Health check status values
 * - healthy: Service is reachable and working (verified by actual check)
 * - disabled: Feature is intentionally off or not configured
 * - unhealthy: Check failed (service down, auth invalid, timeout)
 */
export type HealthStatus = "healthy" | "unhealthy" | "disabled";

/**
 * Result of a single health check
 */
export interface CheckResult {
	status: HealthStatus;
	latencyMs?: number;
	message?: string;
}

/**
 * Interface for a health check implementation
 */
export interface HealthCheck {
	/** Unique name for this check (e.g., 'database', 'storage') */
	name: string;
	/** If true, failure causes overall health to be unhealthy (503) */
	critical: boolean;
	/** Execute the health check */
	check(): Promise<CheckResult>;
}

/**
 * Overall health response returned by the /api/status/health endpoint
 */
export interface HealthResponse {
	/** Overall status is binary - healthy or unhealthy */
	status: "healthy" | "unhealthy";
	/** ISO-8601 timestamp of when the check was performed */
	timestamp: string;
	/** Git commit SHA (7 chars) or 'unknown' */
	version: string;
	/** Environment name (e.g., 'production', 'development') */
	environment: string;
	/** Individual check results keyed by check name */
	checks: Record<string, CheckResult>;
}
