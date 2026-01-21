import type { Job, NewJob } from "../model/Job.js";
import { defineJobs } from "../model/Job.js";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { JobExecution, JobExecutionsFilter, JobLog, JobStatus } from "../types/JobTypes";
import type { ModelDef } from "../util/ModelDef.js";
import type { DaoProvider } from "./DaoProvider";
import { Op, type Sequelize } from "sequelize";

/**
 * Data Access Object for job executions
 */
export interface JobDao {
	/**
	 * Create a new job execution record
	 */
	createJobExecution(data: NewJob): Promise<void>;

	/**
	 * Update job status
	 */
	updateJobStatus(
		jobId: string,
		status: JobStatus,
		startedAt?: Date,
		completedAt?: Date,
		error?: string,
		errorStack?: string,
	): Promise<void>;

	/**
	 * Append a log entry to a job execution
	 */
	appendLog(jobId: string, log: JobLog): Promise<void>;

	/**
	 * Update job stats/progress
	 */
	updateStats(jobId: string, stats: unknown): Promise<void>;

	/**
	 * Update job completion info
	 */
	updateCompletionInfo(jobId: string, completionInfo: unknown): Promise<void>;

	/**
	 * Get job execution by ID
	 */
	getJobExecution(jobId: string): Promise<JobExecution | undefined>;

	/**
	 * List job executions with optional filters
	 */
	listJobExecutions(filters?: JobExecutionsFilter): Promise<Array<JobExecution>>;

	/**
	 * Delete old job executions
	 */
	deleteOldExecutions(olderThanDays: number): Promise<number>;

	/**
	 * Pin a job (keeps it visible on dashboard indefinitely)
	 */
	pinJob(jobId: string, userId?: number): Promise<void>;

	/**
	 * Unpin a job (allows it to auto-dismiss after timeout)
	 */
	unpinJob(jobId: string, userId?: number): Promise<void>;

	/**
	 * Dismiss a job (hides it from dashboard for all users)
	 */
	dismissJob(jobId: string, userId?: number): Promise<void>;

	/**
	 * Delete all job executions
	 */
	deleteAllJobs(): Promise<void>;
}

/**
 * Convert database Job to JobExecution
 */
function toJobExecution(job: Job): JobExecution {
	const result: JobExecution = {
		id: job.id,
		name: job.name,
		params: job.params,
		status: job.status,
		logs: job.logs,
		retryCount: job.retryCount,
		createdAt: job.createdAt,
	};

	if (job.title !== null && job.title !== undefined) {
		result.title = job.title;
	}
	if (job.sourceJobId !== null && job.sourceJobId !== undefined) {
		result.sourceJobId = job.sourceJobId;
	}
	if (job.loopPrevented !== null && job.loopPrevented !== undefined) {
		result.loopPrevented = job.loopPrevented;
	}
	if (job.loopReason !== null && job.loopReason !== undefined) {
		result.loopReason = job.loopReason;
	}
	if (job.startedAt !== null && job.startedAt !== undefined) {
		result.startedAt = job.startedAt;
	}
	if (job.completedAt !== null && job.completedAt !== undefined) {
		result.completedAt = job.completedAt;
	}
	if (job.error !== null && job.error !== undefined) {
		result.error = job.error;
	}
	if (job.errorStack !== null && job.errorStack !== undefined) {
		result.errorStack = job.errorStack;
	}
	if (job.stats !== null && job.stats !== undefined) {
		result.stats = job.stats;
	}
	if (job.completionInfo !== null && job.completionInfo !== undefined) {
		result.completionInfo = job.completionInfo;
	}
	if (job.pinnedAt !== null && job.pinnedAt !== undefined) {
		result.pinnedAt = job.pinnedAt;
	}
	if (job.dismissedAt !== null && job.dismissedAt !== undefined) {
		result.dismissedAt = job.dismissedAt;
	}

	// Add computed field for frontend convenience
	result.isPinned = job.pinnedAt !== null && job.pinnedAt !== undefined;

	return result;
}

/**
 * Create a JobDao instance
 */
export function createJobDao(sequelize: Sequelize): JobDao {
	const Jobs: ModelDef<Job> = defineJobs(sequelize);

	return {
		createJobExecution,
		updateJobStatus,
		appendLog,
		updateStats,
		updateCompletionInfo,
		getJobExecution,
		listJobExecutions,
		deleteOldExecutions,
		pinJob,
		unpinJob,
		dismissJob,
		deleteAllJobs,
	};

	async function createJobExecution(data: NewJob): Promise<void> {
		type JobCreationData = Omit<
			Job,
			"title" | "startedAt" | "completedAt" | "error" | "errorStack" | "stats" | "completionInfo"
		> & {
			title?: string;
			startedAt?: Date;
			completedAt?: Date;
			error?: string;
			errorStack?: string;
			stats?: unknown;
			completionInfo?: unknown;
		};
		const jobData: JobCreationData = {
			id: data.id,
			name: data.name,
			params: data.params as object,
			status: data.status,
			logs: data.logs,
			retryCount: data.retryCount,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		if (data.title) {
			jobData.title = data.title;
		}
		await Jobs.create(jobData);
	}

	async function updateJobStatus(
		jobId: string,
		status: JobStatus,
		startedAt?: Date,
		completedAt?: Date,
		error?: string,
		errorStack?: string,
	): Promise<void> {
		const updateData: Partial<Job> = { status };

		if (startedAt) {
			updateData.startedAt = startedAt;
		}
		if (completedAt) {
			updateData.completedAt = completedAt;
		}
		if (error !== undefined) {
			updateData.error = error;
		}
		if (errorStack !== undefined) {
			updateData.errorStack = errorStack;
		}

		await Jobs.update(updateData, {
			where: { id: jobId },
		});
	}

	async function appendLog(jobId: string, log: { timestamp: Date; level: string; message: string }): Promise<void> {
		// Use sequelize.fn to append to JSONB array
		const job = await Jobs.findByPk(jobId);
		if (job) {
			const currentLogs = job.get("logs") as Array<{ timestamp: Date; level: string; message: string }>;
			await Jobs.update(
				{ logs: [...currentLogs, log] },
				{
					where: { id: jobId },
				},
			);
		}
	}

	async function updateStats(jobId: string, stats: unknown): Promise<void> {
		await Jobs.update(
			{ stats: stats as object },
			{
				where: { id: jobId },
			},
		);
	}

	async function updateCompletionInfo(jobId: string, completionInfo: unknown): Promise<void> {
		await Jobs.update(
			{ completionInfo: completionInfo as object },
			{
				where: { id: jobId },
			},
		);
	}

	async function getJobExecution(jobId: string): Promise<JobExecution | undefined> {
		const job = await Jobs.findByPk(jobId);
		return job ? toJobExecution(job.get({ plain: true })) : undefined;
	}

	async function listJobExecutions(filters?: JobExecutionsFilter): Promise<Array<JobExecution>> {
		const where: Record<string, unknown> = {};

		if (filters?.name) {
			where.name = filters.name;
		}
		if (filters?.status) {
			where.status = filters.status;
		}

		const jobs = await Jobs.findAll({
			where,
			limit: filters?.limit || 100,
			offset: filters?.offset || 0,
			order: [["createdAt", "DESC"]],
		});

		return jobs.map(job => toJobExecution(job.get({ plain: true })));
	}

	async function deleteOldExecutions(olderThanDays: number): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
		return await Jobs.destroy({
			where: {
				createdAt: {
					[Op.lt]: cutoffDate,
				},
				status: {
					[Op.in]: ["completed", "failed", "cancelled"],
				},
				pinnedAt: {
					[Op.eq]: null,
				},
			},
		});
	}

	async function pinJob(jobId: string, userId?: number): Promise<void> {
		const job = await Jobs.findByPk(jobId);
		if (!job) {
			throw new Error(`Job ${jobId} not found`);
		}

		const currentLogs = job.get("logs") as Array<{ timestamp: Date; level: string; message: string }>;
		const logMessage = userId ? `Job pinned by user ${userId}` : "Job pinned";

		await Jobs.update(
			{
				pinnedAt: new Date(),
				logs: [
					...currentLogs,
					{
						timestamp: new Date(),
						level: "info",
						message: logMessage,
					},
				],
			},
			{
				where: { id: jobId },
			},
		);
	}

	async function unpinJob(jobId: string, userId?: number): Promise<void> {
		const job = await Jobs.findByPk(jobId);
		if (!job) {
			throw new Error(`Job ${jobId} not found`);
		}

		const currentLogs = job.get("logs") as Array<{ timestamp: Date; level: string; message: string }>;
		const logMessage = userId ? `Job unpinned by user ${userId}` : "Job unpinned";

		await Jobs.update(
			{
				pinnedAt: null,
				logs: [
					...currentLogs,
					{
						timestamp: new Date(),
						level: "info",
						message: logMessage,
					},
				],
			},
			{
				where: { id: jobId },
			},
		);
	}

	async function dismissJob(jobId: string, userId?: number): Promise<void> {
		const job = await Jobs.findByPk(jobId);
		if (!job) {
			throw new Error(`Job ${jobId} not found`);
		}

		const currentLogs = job.get("logs") as Array<{ timestamp: Date; level: string; message: string }>;
		const logMessage = userId ? `Job dismissed by user ${userId}` : "Job dismissed";

		await Jobs.update(
			{
				dismissedAt: new Date(),
				logs: [
					...currentLogs,
					{
						timestamp: new Date(),
						level: "info",
						message: logMessage,
					},
				],
			},
			{
				where: { id: jobId },
			},
		);
	}

	async function deleteAllJobs(): Promise<void> {
		await Jobs.destroy({ where: {} });
	}
}

export function createJobDaoProvider(defaultDao: JobDao): DaoProvider<JobDao> {
	return {
		getDao(context: TenantOrgContext | undefined): JobDao {
			return context?.database.jobDao ?? defaultDao;
		},
	};
}
