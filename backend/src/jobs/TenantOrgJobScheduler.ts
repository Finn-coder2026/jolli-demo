/**
 * TenantOrgJobScheduler - Wraps a JobScheduler with tenant and org context.
 *
 * This class associates a JobScheduler instance with a specific tenant and org,
 * allowing the MultiTenantJobSchedulerManager to track which scheduler belongs
 * to which tenant-org pair.
 *
 * @module TenantOrgJobScheduler
 */

import type { JobDefinition, JobExecution, QueueJobRequest, QueueJobResponse } from "../types/JobTypes";
import type { JobScheduler } from "./JobScheduler";
import type { Org, Tenant } from "jolli-common";

/**
 * A JobScheduler wrapped with tenant and org context.
 */
export interface TenantOrgJobScheduler {
	/**
	 * The tenant this scheduler is associated with.
	 */
	readonly tenant: Tenant;

	/**
	 * The org within the tenant this scheduler is associated with.
	 */
	readonly org: Org;

	/**
	 * The underlying JobScheduler instance.
	 */
	readonly scheduler: JobScheduler;

	/**
	 * Queue a job for execution in this org's job queue.
	 */
	queueJob(request: QueueJobRequest): Promise<QueueJobResponse>;

	/**
	 * Get information about a specific job execution.
	 */
	getJobExecution(jobId: string): Promise<JobExecution | undefined>;

	/**
	 * Register a job definition with this scheduler.
	 */
	registerJob<T = unknown>(definition: JobDefinition<T>): void;

	/**
	 * Start the scheduler (creates pg-boss schema/tables if needed).
	 * This does NOT start workers - use startWorker() for that.
	 */
	start(): Promise<void>;

	/**
	 * Stop the scheduler.
	 */
	stop(): Promise<void>;
}

/**
 * Configuration for creating a TenantOrgJobScheduler.
 */
export interface TenantOrgJobSchedulerConfig {
	/**
	 * The tenant this scheduler is for.
	 */
	tenant: Tenant;

	/**
	 * The org within the tenant this scheduler is for.
	 */
	org: Org;

	/**
	 * The underlying JobScheduler instance.
	 */
	scheduler: JobScheduler;
}

/**
 * Create a TenantOrgJobScheduler that wraps a JobScheduler with tenant/org context.
 */
export function createTenantOrgJobScheduler(config: TenantOrgJobSchedulerConfig): TenantOrgJobScheduler {
	const { tenant, org, scheduler } = config;

	return {
		tenant,
		org,
		scheduler,

		queueJob(request: QueueJobRequest): Promise<QueueJobResponse> {
			return scheduler.queueJob(request);
		},

		getJobExecution(jobId: string): Promise<JobExecution | undefined> {
			return scheduler.getJobExecution(jobId);
		},

		registerJob<T = unknown>(definition: JobDefinition<T>): void {
			scheduler.registerJob(definition);
		},

		async start(): Promise<void> {
			await scheduler.start();
		},

		async stop(): Promise<void> {
			await scheduler.stop();
		},
	};
}
