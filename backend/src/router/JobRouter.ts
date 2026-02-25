import { getConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { JobDao } from "../dao/JobDao.js";
import type { JobScheduler } from "../jobs/JobScheduler.js";
import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager.js";
import type { PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import { ChatService } from "../services/ChatService";
import { createMercureService } from "../services/MercureService";
import { getTenantContext } from "../tenant/TenantContext";
import type { JobEvent, QueueJobRequest } from "../types/JobTypes";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil.js";
import express, { type Request, type Response, type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

// Singleton MercureService for publishing job events
const mercureService = createMercureService();

/**
 * Job statistics response
 */
export interface JobStats {
	activeCount: number;
	completedCount: number;
	failedCount: number;
	totalRetries: number;
}

/**
 * Helper to extract user identity from request.
 * In multi-tenant mode, prefers the org-specific user ID from req.orgUser.
 * Falls back to the JWT userId for single-tenant mode.
 */
function getUserId(req: Request, tokenUtil: TokenUtil<UserInfo>): number | undefined {
	// Prefer org-specific user ID (set by UserProvisioningMiddleware in multi-tenant mode)
	return req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
}

/**
 * Sets up Mercure publishing for job events.
 * This runs once when the router is created and publishes all job events to Mercure
 * regardless of whether any SSE clients are connected.
 */
function setupMercureJobEventPublishing(jobScheduler: JobScheduler): void {
	if (!mercureService.isEnabled()) {
		log.info("Mercure not enabled, skipping job event publishing setup");
		return;
	}

	/* v8 ignore start - Mercure publishing setup, only runs when Mercure is configured */
	const eventEmitter = jobScheduler.getEventEmitter();
	log.info("Setting up Mercure publishing for job events");

	eventEmitter.on("job:started", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			showInDashboard?: boolean;
			keepCardAfterCompletion?: boolean;
		};
		const payload = {
			type: "job:started",
			jobId: data.jobId,
			name: data.name,
			showInDashboard: data.showInDashboard,
			keepCardAfterCompletion: data.keepCardAfterCompletion,
			timestamp: new Date().toISOString(),
		};
		mercureService.publishJobEvent("job:started", payload).catch(err => {
			log.warn(err, "Failed to publish job:started to Mercure");
		});
	});

	eventEmitter.on("job:completed", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			showInDashboard?: boolean;
			keepCardAfterCompletion?: boolean;
			completionInfo?: unknown;
		};
		const payload = {
			type: "job:completed",
			jobId: data.jobId,
			name: data.name,
			showInDashboard: data.showInDashboard,
			completionInfo: data.completionInfo,
			keepCardAfterCompletion: data.keepCardAfterCompletion,
			timestamp: new Date().toISOString(),
		};
		mercureService.publishJobEvent("job:completed", payload).catch(err => {
			log.warn(err, "Failed to publish job:completed to Mercure");
		});
	});

	eventEmitter.on("job:failed", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			error?: string;
			showInDashboard?: boolean;
			keepCardAfterCompletion?: boolean;
		};
		const payload = {
			type: "job:failed",
			jobId: data.jobId,
			name: data.name,
			error: data.error,
			showInDashboard: data.showInDashboard,
			keepCardAfterCompletion: data.keepCardAfterCompletion,
			timestamp: new Date().toISOString(),
		};
		mercureService.publishJobEvent("job:failed", payload).catch(err => {
			log.warn(err, "Failed to publish job:failed to Mercure");
		});
	});

	eventEmitter.on("job:cancelled", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			showInDashboard?: boolean;
			keepCardAfterCompletion?: boolean;
		};
		const payload = {
			type: "job:cancelled",
			jobId: data.jobId,
			name: data.name,
			showInDashboard: data.showInDashboard,
			keepCardAfterCompletion: data.keepCardAfterCompletion,
			timestamp: new Date().toISOString(),
		};
		mercureService.publishJobEvent("job:cancelled", payload).catch(err => {
			log.warn(err, "Failed to publish job:cancelled to Mercure");
		});
	});

	eventEmitter.on("job:stats-updated", (event: JobEvent) => {
		const data = event.data as { jobId: string; name: string; stats: unknown; showInDashboard?: boolean };
		const payload = {
			type: "job:stats-updated",
			jobId: data.jobId,
			name: data.name,
			stats: data.stats,
			showInDashboard: data.showInDashboard,
			timestamp: new Date().toISOString(),
		};
		mercureService.publishJobEvent("job:stats-updated", payload).catch(err => {
			log.warn(err, "Failed to publish job:stats-updated to Mercure");
		});
	});
}
/* v8 ignore stop */

/**
 * Configuration for the Job router.
 * Supports both single-scheduler mode (backward compatible) and scheduler manager mode.
 */
export interface JobRouterConfig {
	/** Single scheduler for backward compatibility */
	jobScheduler?: JobScheduler | undefined;
	/** Scheduler manager for multi-tenant mode */
	schedulerManager?: MultiTenantJobSchedulerManager | undefined;
	jobDaoProvider: DaoProvider<JobDao>;
	tokenUtil: TokenUtil<UserInfo>;
	permissionMiddleware: PermissionMiddlewareFactory;
}

/**
 * Create the Job router
 * @param jobSchedulerOrConfig - Either a JobScheduler (backward compatible) or JobRouterConfig
 * @param jobDaoProvider - Optional if using config object
 * @param tokenUtil - Optional if using config object
 */
export function createJobRouter(
	jobSchedulerOrConfig: JobScheduler | JobRouterConfig,
	jobDaoProvider?: DaoProvider<JobDao>,
	tokenUtil?: TokenUtil<UserInfo>,
	permissionMw?: PermissionMiddlewareFactory,
): Router {
	const router = express.Router();

	// Handle both old signature (scheduler, daoProvider, tokenUtil, permissionMiddleware) and new config object
	let jobScheduler: JobScheduler | undefined;
	let schedulerManager: MultiTenantJobSchedulerManager | undefined;
	let daoProvider: DaoProvider<JobDao>;
	let tokenUtilResolved: TokenUtil<UserInfo>;
	let permissionMiddleware: PermissionMiddlewareFactory;

	if ("jobDaoProvider" in jobSchedulerOrConfig) {
		// New config object style
		const config = jobSchedulerOrConfig;
		jobScheduler = config.jobScheduler;
		schedulerManager = config.schedulerManager;
		daoProvider = config.jobDaoProvider;
		tokenUtilResolved = config.tokenUtil;
		permissionMiddleware = config.permissionMiddleware;

		if (!jobScheduler && !schedulerManager) {
			throw new Error("Either jobScheduler or schedulerManager must be provided");
		}
	} else {
		// Old signature style (backward compatible)
		jobScheduler = jobSchedulerOrConfig;
		if (!jobDaoProvider || !tokenUtil || !permissionMw) {
			throw new Error(
				"jobDaoProvider, tokenUtil, and permissionMiddleware are required when using old signature",
			);
		}
		daoProvider = jobDaoProvider;
		tokenUtilResolved = tokenUtil;
		permissionMiddleware = permissionMw;
	}

	// Helper to get the scheduler for the current request
	// Uses single scheduler if available, otherwise gets from manager
	async function getSchedulerForRequest(): Promise<JobScheduler> {
		if (jobScheduler) {
			return jobScheduler;
		}
		if (!schedulerManager) {
			throw new Error("No job scheduler or scheduler manager available");
		}
		const tenantOrgScheduler = await schedulerManager.getSchedulerForContext();
		return tenantOrgScheduler.scheduler;
	}

	// Set up Mercure publishing for job events (runs once, independent of SSE connections)
	// In multi-tenant mode, this is set up per-scheduler when they're created
	if (jobScheduler) {
		setupMercureJobEventPublishing(jobScheduler);
	}

	/**
	 * GET /api/jobs
	 * List all available job types with their schemas
	 */
	router.get("/", permissionMiddleware.requirePermission("dashboard.view"), async (_req: Request, res: Response) => {
		try {
			const scheduler = await getSchedulerForRequest();
			const jobs = scheduler.listJobs();
			res.json(jobs);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(500).json({ error: message });
		}
	});

	/**
	 * GET /api/jobs/stats
	 * Get job statistics
	 */
	router.get(
		"/stats",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (_req: Request, res: Response) => {
			try {
				const jobDao = daoProvider.getDao(getTenantContext());
				const scheduler = await getSchedulerForRequest();
				const config = getConfig();
				const cutoffDate = new Date();
				cutoffDate.setDate(cutoffDate.getDate() - config.JOBS_STORE_FOR_DAYS);

				// Get all active jobs
				const activeJobs = await jobDao.listJobExecutions({
					status: "active",
					limit: 10000,
				});

				// Get completed jobs in the last JOBS_STORE_FOR_DAYS days
				const allRecentJobs = await jobDao.listJobExecutions({
					limit: 10000,
				});

				const recentJobs = allRecentJobs.filter(job => job.createdAt >= cutoffDate);

				// Get job listings to filter out excluded jobs
				const jobListings = scheduler.listJobs();
				const excludedJobNames = new Set(jobListings.filter(j => j.excludeFromStats).map(j => j.name));

				// Filter out excluded jobs
				const filteredActiveJobs = activeJobs.filter(job => !excludedJobNames.has(job.name));
				const filteredRecentJobs = recentJobs.filter(job => !excludedJobNames.has(job.name));

				const completedCount = filteredRecentJobs.filter(job => job.status === "completed").length;
				const failedCount = filteredRecentJobs.filter(job => job.status === "failed").length;
				const totalRetries = filteredRecentJobs.reduce((sum, job) => sum + job.retryCount, 0);

				const stats: JobStats = {
					activeCount: filteredActiveJobs.length,
					completedCount,
					failedCount,
					totalRetries,
				};

				res.json(stats);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(500).json({ error: message });
			}
		},
	);

	/**
	 * GET /api/jobs/dashboard-active
	 * Get active and recently completed jobs that should be shown in the dashboard
	 */
	router.get(
		"/dashboard-active",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (_req: Request, res: Response) => {
			try {
				const jobDao = daoProvider.getDao(getTenantContext());
				const scheduler = await getSchedulerForRequest();
				const activeJobs = await jobDao.listJobExecutions({
					status: "active",
					limit: 100,
				});

				const completedJobs = await jobDao.listJobExecutions({
					status: "completed",
					limit: 100,
				});

				const failedJobs = await jobDao.listJobExecutions({
					status: "failed",
					limit: 100,
				});

				const cancelledJobs = await jobDao.listJobExecutions({
					status: "cancelled",
					limit: 100,
				});

				const jobListings = scheduler.listJobs();

				// Filter active jobs with showInDashboard
				const filteredActiveJobs = activeJobs.filter(job => {
					const listing = jobListings.find(l => l.name === job.name);
					return listing?.showInDashboard === true && listing?.excludeFromStats !== true;
				});

				// Filter completed/failed/cancelled jobs based on:
				// - showInDashboard = true
				// - keepCardAfterCompletion = true
				// - not dismissed
				// - within 12 hours OR pinned
				const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

				const allFinishedJobs = [...completedJobs, ...failedJobs, ...cancelledJobs];
				const filteredFinishedJobs = allFinishedJobs.filter(job => {
					const listing = jobListings.find(l => l.name === job.name);

					// Must have showInDashboard and keepCardAfterCompletion
					if (listing?.showInDashboard !== true || listing?.keepCardAfterCompletion !== true) {
						return false;
					}

					// Must not be dismissed
					if (job.dismissedAt) {
						return false;
					}

					// Must be within 12 hours OR pinned
					const isWithin12Hours = job.completedAt && job.completedAt >= twelveHoursAgo;
					const isPinned = job.pinnedAt !== null && job.pinnedAt !== undefined;

					return isWithin12Hours || isPinned;
				});

				const dashboardJobs = [...filteredActiveJobs, ...filteredFinishedJobs];

				res.json(dashboardJobs);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(500).json({ error: message });
			}
		},
	);

	/**
	 * POST /api/jobs/queue
	 * Queue a job for execution
	 */
	router.post(
		"/queue",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			try {
				const request = req.body as QueueJobRequest;

				if (!request.name) {
					res.status(400).json({ error: "Job name is required" });
					return;
				}

				const scheduler = await getSchedulerForRequest();
				const result = await scheduler.queueJob(request);
				res.json(result);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(400).json({ error: message });
			}
		},
	);

	/**
	 * GET /api/jobs/history
	 * List job execution history
	 */
	router.get(
		"/history",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			try {
				const jobDao = daoProvider.getDao(getTenantContext());
				const scheduler = await getSchedulerForRequest();
				const filters: { name?: string; status?: string; limit?: number; offset?: number } = {};

				if (req.query.name) {
					filters.name = req.query.name as string;
				}
				if (req.query.status) {
					filters.status = req.query.status as string;
				}
				if (req.query.limit) {
					filters.limit = Number.parseInt(req.query.limit as string, 10);
				}
				if (req.query.offset) {
					filters.offset = Number.parseInt(req.query.offset as string, 10);
				}

				const history = await jobDao.listJobExecutions(filters);

				// Get job listings to filter out excluded jobs
				const jobListings = scheduler.listJobs();
				const excludedJobNames = new Set(jobListings.filter(j => j.excludeFromStats).map(j => j.name));

				// Filter out excluded jobs
				const filteredHistory = history.filter(job => !excludedJobNames.has(job.name));

				res.json(filteredHistory);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(500).json({ error: message });
			}
		},
	);

	/**
	 * GET /api/jobs/history/:id
	 * Get job execution details
	 */
	router.get(
		"/history/:id",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			try {
				const jobDao = daoProvider.getDao(getTenantContext());
				const jobId = req.params.id;
				const execution = await jobDao.getJobExecution(jobId);

				if (!execution) {
					res.status(404).json({ error: "Job execution not found" });
					return;
				}

				res.json(execution);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(500).json({ error: message });
			}
		},
	);

	/**
	 * POST /api/jobs/:id/cancel
	 * Cancel a running job
	 */
	router.post(
		"/:id/cancel",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			try {
				const jobId = req.params.id;
				const scheduler = await getSchedulerForRequest();
				await scheduler.cancelJob(jobId);
				res.json({ message: "Job cancelled successfully", jobId });
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(400).json({ error: message });
			}
		},
	);

	/**
	 * POST /api/jobs/:id/retry
	 * Retry a failed job
	 */
	router.post(
		"/:id/retry",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			try {
				const jobId = req.params.id;
				const scheduler = await getSchedulerForRequest();
				const result = await scheduler.retryJob(jobId);
				res.json(result);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(400).json({ error: message });
			}
		},
	);

	/**
	 * POST /api/jobs/:id/pin
	 * Pin a job to keep it visible on dashboard indefinitely
	 */
	router.post(
		"/:id/pin",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			try {
				const jobDao = daoProvider.getDao(getTenantContext());
				const jobId = req.params.id;
				const userId = getUserId(req, tokenUtilResolved);
				await jobDao.pinJob(jobId, userId);
				res.json({ message: "Job pinned successfully", jobId });
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(400).json({ error: message });
			}
		},
	);

	/**
	 * POST /api/jobs/:id/unpin
	 * Unpin a job to allow it to auto-dismiss after timeout
	 */
	router.post(
		"/:id/unpin",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			try {
				const jobDao = daoProvider.getDao(getTenantContext());
				const jobId = req.params.id;
				const userId = getUserId(req, tokenUtilResolved);
				await jobDao.unpinJob(jobId, userId);
				res.json({ message: "Job unpinned successfully", jobId });
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(400).json({ error: message });
			}
		},
	);

	/**
	 * POST /api/jobs/:id/dismiss
	 * Dismiss a job to hide it from dashboard for all users
	 */
	router.post(
		"/:id/dismiss",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			try {
				const jobDao = daoProvider.getDao(getTenantContext());
				const jobId = req.params.id;
				const userId = getUserId(req, tokenUtilResolved);
				await jobDao.dismissJob(jobId, userId);
				res.json({ message: "Job dismissed successfully", jobId });
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				res.status(400).json({ error: message });
			}
		},
	);

	/**
	 * GET /api/jobs/events
	 * Server-Sent Events stream for real-time job updates
	 */
	/* v8 ignore start - SSE endpoint not properly detected by v8 coverage */
	router.get(
		"/events",
		permissionMiddleware.requirePermission("dashboard.view"),
		async (req: Request, res: Response) => {
			// Set SSE headers
			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");
			res.setHeader("X-Accel-Buffering", "no"); // Disable buffering in nginx

			// Send initial connection message
			res.write('data: {"type":"connected"}\n\n');

			// Start keep-alive to prevent proxy timeouts
			const chatService = new ChatService();
			const keepAliveInterval = chatService.startKeepAlive(res);

			log.info("SSE connection opened for job events");

			let scheduler: JobScheduler;
			try {
				scheduler = await getSchedulerForRequest();
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				chatService.stopKeepAlive(keepAliveInterval);
				res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
				res.end();
				return;
			}

			const eventEmitter = scheduler.getEventEmitter();

			// Create event listeners
			const onJobStarted = (event: JobEvent) => {
				const data = event.data as {
					jobId: string;
					name: string;
					showInDashboard?: boolean;
					keepCardAfterCompletion?: boolean;
				};
				const payload = {
					type: "job:started",
					jobId: data.jobId,
					name: data.name,
					showInDashboard: data.showInDashboard,
					keepCardAfterCompletion: data.keepCardAfterCompletion,
					timestamp: new Date().toISOString(),
				};
				res.write(`data: ${JSON.stringify(payload)}\n\n`);
				// Mercure publishing is handled by setupMercureJobEventPublishing()
			};

			const onJobCompleted = (event: JobEvent) => {
				const data = event.data as {
					jobId: string;
					name: string;
					showInDashboard?: boolean;
					keepCardAfterCompletion?: boolean;
					completionInfo?: unknown;
				};
				const payload = {
					type: "job:completed",
					jobId: data.jobId,
					name: data.name,
					showInDashboard: data.showInDashboard,
					completionInfo: data.completionInfo,
					keepCardAfterCompletion: data.keepCardAfterCompletion,
					timestamp: new Date().toISOString(),
				};
				res.write(`data: ${JSON.stringify(payload)}\n\n`);
				// Mercure publishing is handled by setupMercureJobEventPublishing()
			};

			const onJobFailed = (event: JobEvent) => {
				const data = event.data as {
					jobId: string;
					name: string;
					error?: string;
					showInDashboard?: boolean;
					keepCardAfterCompletion?: boolean;
				};
				const payload = {
					type: "job:failed",
					jobId: data.jobId,
					name: data.name,
					error: data.error,
					showInDashboard: data.showInDashboard,
					keepCardAfterCompletion: data.keepCardAfterCompletion,
					timestamp: new Date().toISOString(),
				};
				res.write(`data: ${JSON.stringify(payload)}\n\n`);
				// Mercure publishing is handled by setupMercureJobEventPublishing()
			};

			const onJobCancelled = (event: JobEvent) => {
				const data = event.data as {
					jobId: string;
					name: string;
					showInDashboard?: boolean;
					keepCardAfterCompletion?: boolean;
				};
				const payload = {
					type: "job:cancelled",
					jobId: data.jobId,
					name: data.name,
					showInDashboard: data.showInDashboard,
					keepCardAfterCompletion: data.keepCardAfterCompletion,
					timestamp: new Date().toISOString(),
				};
				res.write(`data: ${JSON.stringify(payload)}\n\n`);
				// Mercure publishing is handled by setupMercureJobEventPublishing()
			};

			const onJobStatsUpdated = (event: JobEvent) => {
				const data = event.data as { jobId: string; name: string; stats: unknown; showInDashboard?: boolean };
				const payload = {
					type: "job:stats-updated",
					jobId: data.jobId,
					name: data.name,
					stats: data.stats,
					showInDashboard: data.showInDashboard,
					timestamp: new Date().toISOString(),
				};
				res.write(`data: ${JSON.stringify(payload)}\n\n`);
				// Mercure publishing is handled by setupMercureJobEventPublishing()
			};

			// Register event listeners
			eventEmitter.on("job:started", onJobStarted);
			eventEmitter.on("job:completed", onJobCompleted);
			eventEmitter.on("job:failed", onJobFailed);
			eventEmitter.on("job:cancelled", onJobCancelled);
			eventEmitter.on("job:stats-updated", onJobStatsUpdated);

			// Clean up on client disconnect
			req.on("close", () => {
				chatService.stopKeepAlive(keepAliveInterval);
				eventEmitter.off("job:started", onJobStarted);
				eventEmitter.off("job:completed", onJobCompleted);
				eventEmitter.off("job:failed", onJobFailed);
				eventEmitter.off("job:cancelled", onJobCancelled);
				eventEmitter.off("job:stats-updated", onJobStatsUpdated);
				log.info("SSE connection closed for job events");
				res.end();
			});
			/* v8 ignore stop */
		},
	);

	return router;
}
