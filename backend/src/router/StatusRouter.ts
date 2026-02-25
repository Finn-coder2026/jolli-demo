import type { HealthService } from "../health";
import express, { type Router } from "express";

export interface StatusRouterOptions {
	/** Optional health service for comprehensive health checks */
	healthService?: HealthService;
}

export function createStatusRouter(options?: StatusRouterOptions): Router {
	const router = express.Router();
	const { healthService } = options ?? {};

	router.get("/check", (_req, res) => {
		res.send("OK");
	});

	/**
	 * Health endpoint for monitoring and load balancers.
	 *
	 * When HealthService is provided, runs comprehensive checks and returns:
	 * - 200 if all critical services are healthy
	 * - 503 if any critical service is unhealthy
	 *
	 * Without HealthService, returns a simple healthy response (backward compatible).
	 */
	router.get("/health", async (_req, res) => {
		if (healthService) {
			try {
				const result = await healthService.check();
				const statusCode = result.status === "healthy" ? 200 : 503;
				res.status(statusCode).json(result);
			} catch (_error) {
				res.status(503).json({
					status: "unhealthy",
					timestamp: new Date().toISOString(),
					message: "Health check failed unexpectedly",
				});
			}
		} else {
			// Fallback for backward compatibility or when health service not configured
			res.json({ status: "healthy", timestamp: new Date().toISOString() });
		}
	});

	return router;
}
