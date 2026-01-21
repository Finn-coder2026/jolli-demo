import type { JobScheduler } from "../jobs/JobScheduler";
import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager.js";
import type { TenantOrgJobScheduler } from "../jobs/TenantOrgJobScheduler.js";
import { getLog } from "../util/Logger";
import express, { type Router } from "express";

const log = getLog(import.meta);

export interface KnowledgeGraphRouterOptions {
	// Single-tenant mode: use jobScheduler directly
	// Multi-tenant mode: use schedulerManager to get per-context scheduler
	jobScheduler?: JobScheduler | undefined;
	schedulerManager: MultiTenantJobSchedulerManager;
}

/**
 * Creates the knowledge graph router with development endpoints
 * WARNING: These endpoints are not authenticated and should only be used for development
 */
export function createKnowledgeGraphRouter(options: KnowledgeGraphRouterOptions): Router {
	const { jobScheduler, schedulerManager } = options;
	const router = express.Router();

	// Helper to get the scheduler for the current request context
	async function getScheduler(): Promise<JobScheduler | TenantOrgJobScheduler | undefined> {
		if (jobScheduler) {
			return jobScheduler;
		}
		return await schedulerManager.getSchedulerForContext();
	}

	/**
	 * POST /api/knowledge-graph/process/:integrationId
	 * Triggers a knowledge graph processing job for the specified integration
	 *
	 * This is a development endpoint - no authentication required
	 * TODO: Add authentication before production use
	 */
	router.post("/process/:integrationId", async (req, res) => {
		try {
			const integrationId = Number.parseInt(req.params.integrationId, 10);

			if (Number.isNaN(integrationId)) {
				log.warn({ integrationId: req.params.integrationId }, "Invalid integration ID provided");
				return res.status(400).json({
					error: "Invalid integration ID",
					message: "Integration ID must be a valid number",
				});
			}

			const scheduler = await getScheduler();
			if (!scheduler) {
				return res.status(503).json({
					error: "Job scheduler unavailable",
					message: "No job scheduler available for this context",
				});
			}

			log.info({ integrationId }, "Triggering knowledge graph processing job");

			// Queue the job
			const jobResult = await scheduler.queueJob({
				name: "knowledge-graph:architecture",
				params: {
					integrationId,
				},
				options: {
					// Optional: Add job options here
					priority: "normal",
				},
			});

			log.info({ integrationId, jobId: jobResult.jobId }, "Knowledge graph job queued successfully");

			res.json({
				success: true,
				message: "Knowledge graph processing job queued",
				jobId: jobResult.jobId,
				integrationId,
				// Include warning about dev endpoint
				warning: "This is a development endpoint without authentication",
			});
		} catch (error) {
			log.error({ error }, "Failed to queue knowledge graph job");

			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

			res.status(500).json({
				error: "Failed to queue job",
				message: errorMessage,
			});
		}
	});

	/**
	 * GET /api/knowledge-graph/status/:jobId
	 * Check the status of a knowledge graph processing job
	 *
	 * This is a development endpoint - no authentication required
	 */
	router.get("/status/:jobId", async (req, res) => {
		try {
			const { jobId } = req.params;

			const scheduler = await getScheduler();
			if (!scheduler) {
				return res.status(503).json({
					error: "Job scheduler unavailable",
					message: "No job scheduler available for this context",
				});
			}

			const jobExecution = await scheduler.getJobExecution(jobId);

			if (!jobExecution) {
				return res.status(404).json({
					error: "Job not found",
					message: `No job found with ID: ${jobId}`,
				});
			}

			res.json({
				jobId: jobExecution.id,
				name: jobExecution.name,
				status: jobExecution.status,
				params: jobExecution.params,
				startedAt: jobExecution.startedAt,
				completedAt: jobExecution.completedAt,
				error: jobExecution.error,
				logs: jobExecution.logs,
				retryCount: jobExecution.retryCount,
				// Include warning about dev endpoint
				warning: "This is a development endpoint without authentication",
			});
		} catch (error) {
			log.error({ error }, "Failed to get job status");

			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

			res.status(500).json({
				error: "Failed to get job status",
				message: errorMessage,
			});
		}
	});

	/**
	 * GET /api/knowledge-graph/health
	 * Health check endpoint for the knowledge graph service
	 */
	router.get("/health", (_req, res) => {
		res.json({
			status: "healthy",
			service: "knowledge-graph",
			timestamp: new Date().toISOString(),
			warning: "Development endpoints are enabled without authentication",
		});
	});

	/**
	 * POST /api/knowledge-graph/upload-main
	 * Uploads the Jolli_Main.md file to the document database
	 *
	 * This is a development endpoint - no authentication required
	 */
	router.post("/upload-main", async (_req, res) => {
		try {
			const scheduler = await getScheduler();
			if (!scheduler) {
				return res.status(503).json({
					error: "Job scheduler unavailable",
					message: "No job scheduler available for this context",
				});
			}

			log.info("Triggering upload-main job");

			// Queue the upload-main job
			const jobResult = await scheduler.queueJob({
				name: "knowledge-graph:upload-main",
				params: {},
			});

			log.info({ jobId: jobResult.jobId }, "Upload-main job queued successfully");

			res.json({
				success: true,
				message: "Jolli_Main.md upload job queued",
				jobId: jobResult.jobId,
				// Include warning about dev endpoint
				warning: "This is a development endpoint without authentication",
			});
		} catch (error) {
			log.error({ error }, "Failed to queue upload-main job");

			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

			res.status(500).json({
				error: "Failed to queue upload-main job",
				message: errorMessage,
			});
		}
	});

	/**
	 * POST /api/knowledge-graph/process-batch
	 * Process multiple integrations in batch
	 *
	 * Body: { integrationIds: number[] }
	 */
	router.post("/process-batch", async (req, res) => {
		try {
			const { integrationIds } = req.body;

			if (!Array.isArray(integrationIds)) {
				return res.status(400).json({
					error: "Invalid request",
					message: "integrationIds must be an array of numbers",
				});
			}

			const scheduler = await getScheduler();
			if (!scheduler) {
				return res.status(503).json({
					error: "Job scheduler unavailable",
					message: "No job scheduler available for this context",
				});
			}

			const jobResults = [];
			const errors = [];

			for (const id of integrationIds) {
				const integrationId = Number.parseInt(id, 10);

				if (Number.isNaN(integrationId)) {
					errors.push({
						id,
						error: "Invalid integration ID - must be a number",
					});
					continue;
				}

				try {
					const jobResult = await scheduler.queueJob({
						name: "knowledge-graph:architecture",
						params: { integrationId },
						options: {
							priority: "normal",
						},
					});

					jobResults.push({
						integrationId,
						jobId: jobResult.jobId,
					});

					log.info({ integrationId, jobId: jobResult.jobId }, "Batch job queued");
				} catch (error) {
					errors.push({
						id: integrationId,
						error: error instanceof Error ? error.message : "Failed to queue job",
					});
				}
			}

			res.json({
				success: jobResults.length > 0,
				message: `Queued ${jobResults.length} jobs`,
				jobs: jobResults,
				errors: errors.length > 0 ? errors : undefined,
				warning: "This is a development endpoint without authentication",
			});
		} catch (error) {
			log.error({ error }, "Failed to process batch");

			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

			return res.status(500).json({
				error: "Failed to process batch",
				message: errorMessage,
			});
		}
	});

	log.info("Knowledge graph router initialized (DEV MODE - No authentication)");

	return router;
}
