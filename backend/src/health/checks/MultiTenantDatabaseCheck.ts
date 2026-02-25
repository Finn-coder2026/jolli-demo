import type { TenantOrgConnectionManager } from "../../tenant/TenantOrgConnectionManager";
import type { CheckResult, HealthCheck } from "../HealthTypes";

export interface MultiTenantDatabaseCheckResult extends CheckResult {
	details?: {
		total: number;
		healthy: number;
		unhealthy: number;
		failures: Array<{ tenant: string; org: string; error: string }>;
	};
}

export interface MultiTenantDatabaseCheckOptions {
	/** Connection manager for checking cached tenant-org connections */
	connectionManager: TenantOrgConnectionManager;
	/** Timeout per connection check in milliseconds (default: 5000) */
	timeoutMs?: number;
}

/**
 * Creates a health check that verifies tenant database connections via the connection manager.
 *
 * **Strategy: Cached Connections (per Doug's recommendation)**
 * This check verifies health of connections the app has already established through the
 * connection manager. This follows best practices by:
 * - Checking the actual connections used to serve requests
 * - Avoiding unnecessary database load from creating new connections
 * - Providing a meaningful "can we serve current users?" health signal
 *
 * @see https://github.com/jolliai/jolli/pull/298#discussion_r2724659003
 */
export function createMultiTenantDatabaseCheck(options: MultiTenantDatabaseCheckOptions): HealthCheck {
	const { connectionManager, timeoutMs = 5000 } = options;

	return {
		name: "multiTenantDatabases",
		critical: true,
		check,
	};

	async function check(): Promise<MultiTenantDatabaseCheckResult> {
		const result = await connectionManager.checkAllConnectionsHealth(timeoutMs);

		if (result.total === 0) {
			return {
				status: "healthy",
				latencyMs: result.latencyMs,
				message: "No active tenant connections to check",
			};
		}

		const failures = result.connections
			.filter(c => c.status === "unhealthy")
			.map(c => ({
				tenant: c.tenantSlug ?? "unknown",
				org: c.orgSlug ?? "unknown",
				error: c.error ?? "Unknown error",
			}));

		const message =
			result.unhealthy > 0
				? `${result.unhealthy} of ${result.total} tenant connections unhealthy`
				: `All ${result.total} tenant connections healthy`;

		return {
			status: result.status,
			latencyMs: result.latencyMs,
			message,
			details: {
				total: result.total,
				healthy: result.healthy,
				unhealthy: result.unhealthy,
				failures,
			},
		};
	}
}
