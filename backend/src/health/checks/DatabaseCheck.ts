import type { CheckResult, HealthCheck } from "../HealthTypes";
import type { Sequelize } from "sequelize";

/**
 * Creates a health check for PostgreSQL database connectivity.
 * Uses sequelize.authenticate() to verify the connection is working.
 */
export function createDatabaseCheck(sequelize: Sequelize): HealthCheck {
	return {
		name: "database",
		critical: true,
		check,
	};

	async function check(): Promise<CheckResult> {
		const start = Date.now();
		try {
			await sequelize.authenticate();
			return {
				status: "healthy",
				latencyMs: Date.now() - start,
			};
		} catch (_error) {
			return {
				status: "unhealthy",
				latencyMs: Date.now() - start,
				message: "Database connection failed",
			};
		}
	}
}
