import { getConfig } from "../config/Config.js";
import type { JobDao } from "../dao/JobDao.js";
import { HEALTH_CHECK_COMPLETED } from "../events/CoreEvents";
import { getTenantContext } from "../tenant/TenantContext";
import type { JobDefinition } from "../types/JobTypes";
import { getLog } from "../util/Logger";
import type { JobScheduler } from "./JobScheduler.js";
import { z } from "zod";

const log = getLog(import.meta);

export const CLEANUP_OLD_JOBS = "core:cleanup-old-jobs";
export const HEALTH_CHECK = "core:health-check";

/**
 * Core system jobs
 */
export interface CoreJobs {
	/**
	 * Get all core job definitions.
	 * These can be registered with any scheduler (multi-tenant support).
	 */
	getDefinitions(): Array<JobDefinition>;

	/**
	 * Register all demo jobs with the scheduler
	 */
	registerJobs(jobScheduler: JobScheduler): void;

	/**
	 * Queue core jobs that should be scheduled on startup
	 */
	queueJobs: (jobScheduler: JobScheduler) => Promise<void>;
}

/**
 * Create core system jobs
 * @param defaultJobDao - The default JobDao to use when no tenant context is available.
 *                        In multi-tenant mode, handlers will use getTenantContext() to get
 *                        the tenant-specific database.
 */
export function createCoreJobs(defaultJobDao: JobDao): CoreJobs {
	/**
	 * Get the JobDao to use - prefers tenant context, falls back to default.
	 * This enables multi-tenant support while maintaining backward compatibility.
	 */
	function getJobDao(): JobDao {
		const tenantContext = getTenantContext();
		if (tenantContext?.database?.jobDao) {
			return tenantContext.database.jobDao;
		}
		return defaultJobDao;
	}

	/**
	 * Get all core job definitions.
	 * Handlers use getJobDao() to support both single-tenant and multi-tenant modes.
	 */
	function getDefinitions(): Array<JobDefinition> {
		/**
		 * Job to clean up old job execution records
		 */
		const cleanupOldJobsDefinition: JobDefinition<{ olderThanDays: number }> = {
			name: CLEANUP_OLD_JOBS,
			description: "Deletes old completed/failed job execution records from the database",
			category: "core",
			schema: z.object({
				olderThanDays: z.number().min(1),
			}),
			handler: async (params: { olderThanDays: number }, context) => {
				context.log("starting", {}, "info");
				context.log("processing-records", { count: 0 }, "info"); // Will be updated when we know the count
				const jobDao = getJobDao();
				const deletedCount = await jobDao.deleteOldExecutions(params.olderThanDays);
				context.log("cleanup-complete", { count: deletedCount }, "info");
				await context.setCompletionInfo({
					messageKey: "success",
					context: { count: deletedCount },
				});
			},
			defaultOptions: {
				// Run daily at 2 AM
				cron: "0 2 * * *",
			},
			showInDashboard: true,
		};

		/**
		 * Job to perform health check (example core job)
		 */
		type HealthCheckParams = {
			component?: string | undefined;
		};

		const healthCheckDefinition: JobDefinition<HealthCheckParams> = {
			name: HEALTH_CHECK,
			description: "Performs system health checks",
			category: "core",
			schema: z.object({
				component: z.string().optional(),
			}) as z.ZodType<HealthCheckParams>,
			handler: async (params: HealthCheckParams, context) => {
				context.log(`Running health check${params.component ? ` for ${params.component}` : ""}`);

				// Add actual health check logic here
				// For now, just log success
				context.log("Health check passed");

				// Example: emit an event
				await context.emitEvent(HEALTH_CHECK_COMPLETED, {
					component: params.component,
					status: "healthy",
					timestamp: new Date(),
				});
			},
		};

		// Cast to Array<JobDefinition> to satisfy the interface
		// The generic types are erased at runtime, this is safe
		return [cleanupOldJobsDefinition, healthCheckDefinition] as Array<JobDefinition>;
	}

	function registerJobs(jobScheduler: JobScheduler): void {
		for (const definition of getDefinitions()) {
			jobScheduler.registerJob(definition);
		}
	}

	/**
	 * Queue core jobs that should be scheduled on startup
	 */
	async function queueJobs(jobScheduler: JobScheduler): Promise<void> {
		const config = getConfig();
		// Schedule the cleanup job to run daily at 2am
		// This is idempotent - safe to call on every startup
		// singletonKey ensures only one instance runs at a time (prevents concurrent execution)
		await jobScheduler.queueJob({
			name: CLEANUP_OLD_JOBS,
			params: { olderThanDays: config.JOBS_STORE_FOR_DAYS },
			options: {
				cron: "0 2 * * *",
				singletonKey: CLEANUP_OLD_JOBS,
			},
		});
		log.debug(
			"Scheduled core:cleanup-old-jobs to run daily at 2am with retention period of %d days",
			config.JOBS_STORE_FOR_DAYS,
		);
	}

	return {
		getDefinitions,
		registerJobs,
		queueJobs,
	};
}
