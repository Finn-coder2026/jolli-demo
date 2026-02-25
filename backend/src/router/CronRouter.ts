import { getConfig } from "../config/Config";
import type { HealthService } from "../health";
import { getLog } from "../util/Logger";
import { Router } from "express";

const log = getLog(import.meta);

export interface CronRouterOptions {
	healthService: HealthService;
}

/**
 * Creates a router for cron job endpoints.
 *
 * ## Deployment Options
 *
 * **Option 1: Better Stack Uptime Monitor (Recommended for AWS)**
 * Configure Better Stack to poll `/api/status/health` directly. This is simpler
 * and verifies external accessibility. The heartbeat endpoint becomes optional.
 *
 * **Option 2: Push-based Heartbeat**
 * For environments where push is preferred (e.g., Vercel cron), configure a
 * scheduler to call this `/heartbeat` endpoint. It will ping Better Stack
 * on successful health checks.
 */
export function createCronRouter(options: CronRouterOptions): Router {
	const { healthService } = options;
	const router = Router();

	/**
	 * GET /heartbeat - Called by Vercel cron every 5 minutes
	 *
	 * 1. Runs health checks via HealthService
	 * 2. If healthy, pings Better Stack heartbeat URL
	 * 3. If unhealthy, skips the ping (Better Stack alerts after grace period)
	 *
	 * This endpoint also helps prevent Vercel cold starts by keeping the
	 * serverless function warm.
	 *
	 * Always returns 200 so Vercel cron doesn't treat it as a failure.
	 */
	router.get("/heartbeat", async (req, res) => {
		const config = getConfig();

		// Verify Vercel cron secret if configured
		if (config.CRON_SECRET) {
			const authHeader = req.headers.authorization;
			if (authHeader !== `Bearer ${config.CRON_SECRET}`) {
				log.warn("Unauthorized cron request attempt");
				res.status(401).json({ error: "Unauthorized" });
				return;
			}
		}

		const heartbeatUrl = config.BETTER_STACK_HEARTBEAT_URL;

		try {
			// Run health checks
			const healthResult = await healthService.check();

			if (healthResult.status === "healthy") {
				// Ping Better Stack if configured
				if (heartbeatUrl) {
					try {
						await fetch(heartbeatUrl, { method: "GET" });
						log.info("Heartbeat sent to Better Stack");
					} catch (error) {
						log.error(error, "Failed to send heartbeat to Better Stack");
					}
				}

				res.json({
					pinged: true,
					health: healthResult.status,
				});
			} else {
				// Don't ping Better Stack - let it alert after grace period
				log.warn({ checks: healthResult.checks }, "Health check failed, skipping heartbeat");
				res.json({
					pinged: false,
					reason: "Health check failed",
					health: healthResult.status,
				});
			}
		} catch (error) {
			log.error(error, "Heartbeat endpoint error");
			res.json({
				pinged: false,
				reason: "Heartbeat endpoint error",
			});
		}
	});

	return router;
}
