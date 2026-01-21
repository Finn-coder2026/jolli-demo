import type { JobDao } from "../dao/JobDao.js";
import type { JobDefinition } from "../types/JobTypes.js";
import type { JobScheduler } from "./JobScheduler.js";
import { describe, expect, it, vi } from "vitest";

// Mock the config module
vi.mock("../config/Config.js", () => ({
	getConfig: () => ({
		JOBS_STORE_FOR_DAYS: 30,
	}),
}));

// Mock the TenantContext module
const mockGetTenantContext = vi.fn();
vi.mock("../tenant/TenantContext.js", () => ({
	getTenantContext: () => mockGetTenantContext(),
}));

import { createCoreJobs } from "./CoreJobs.js";

describe("CoreJobs", () => {
	const mockJobDao: JobDao = {
		createJobExecution: vi.fn().mockResolvedValue(undefined),
		updateJobStatus: vi.fn().mockResolvedValue(undefined),
		appendLog: vi.fn().mockResolvedValue(undefined),
		getJobExecution: vi.fn().mockResolvedValue(undefined),
		listJobExecutions: vi.fn().mockResolvedValue([]),
		deleteOldExecutions: vi.fn().mockResolvedValue(5),
		deleteAllJobs: vi.fn().mockResolvedValue(undefined),
		updateStats: vi.fn().mockResolvedValue(undefined),
		updateCompletionInfo: vi.fn().mockResolvedValue(undefined),
		pinJob: vi.fn().mockResolvedValue(undefined),
		unpinJob: vi.fn().mockResolvedValue(undefined),
		dismissJob: vi.fn().mockResolvedValue(undefined),
	};

	/**
	 * Helper function to capture registered jobs
	 */
	function getRegisteredJobs(coreJobs: ReturnType<typeof createCoreJobs>): Array<JobDefinition<unknown>> {
		const registeredJobs: Array<JobDefinition<unknown>> = [];
		const mockScheduler: JobScheduler = {
			registerJob: vi.fn(<T = unknown>(job: JobDefinition<T>) => {
				registeredJobs.push(job as JobDefinition<unknown>);
			}) as JobScheduler["registerJob"],
			queueJob: vi.fn(),
			listJobs: vi.fn().mockReturnValue([]),
			getJobHistory: vi.fn().mockResolvedValue([]),
			getJobExecution: vi.fn().mockResolvedValue(undefined),
			cancelJob: vi.fn().mockResolvedValue(undefined),
			retryJob: vi.fn().mockResolvedValue({ jobId: "retry-id", name: "test", message: "retried" }),
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			getEventEmitter: vi.fn(),
		};
		coreJobs.registerJobs(mockScheduler);
		return registeredJobs;
	}

	it("should create core jobs", () => {
		const coreJobs = createCoreJobs(mockJobDao);
		expect(coreJobs).toBeDefined();
		expect(coreJobs.registerJobs).toBeDefined();
	});

	it("should register job definitions", () => {
		const coreJobs = createCoreJobs(mockJobDao);
		const jobs = getRegisteredJobs(coreJobs);

		expect(jobs).toHaveLength(2);
		expect(jobs[0].name).toBe("core:cleanup-old-jobs");
		expect(jobs[1].name).toBe("core:health-check");
	});

	it("should have cleanup job with cron schedule", () => {
		const coreJobs = createCoreJobs(mockJobDao);
		const jobs = getRegisteredJobs(coreJobs);
		const cleanupJob = jobs.find(j => j.name === "core:cleanup-old-jobs");

		expect(cleanupJob).toBeDefined();
		expect(cleanupJob?.defaultOptions?.cron).toBe("0 2 * * *");
	});

	it("should execute cleanup job", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			deleteOldExecutions: vi.fn().mockResolvedValue(5),
		};
		const coreJobs = createCoreJobs(mockDao);
		const jobs = getRegisteredJobs(coreJobs);
		const cleanupJob = jobs.find(j => j.name === "core:cleanup-old-jobs");

		const mockContext = {
			jobId: "test-job-id",
			jobName: "core:cleanup-old-jobs",
			emitEvent: vi.fn(),
			log: vi.fn(),
			updateStats: vi.fn(),
			setCompletionInfo: vi.fn(),
		};

		await cleanupJob?.handler({ olderThanDays: 30 }, mockContext);

		expect(mockDao.deleteOldExecutions).toHaveBeenCalledWith(30);
		expect(mockContext.log).toHaveBeenCalledWith("starting", {}, "info");
		expect(mockContext.log).toHaveBeenCalledWith("processing-records", { count: 0 }, "info");
		expect(mockContext.log).toHaveBeenCalledWith("cleanup-complete", { count: 5 }, "info");
	});

	it("should execute health check job", async () => {
		const coreJobs = createCoreJobs(mockJobDao);
		const jobs = getRegisteredJobs(coreJobs);
		const healthCheckJob = jobs.find(j => j.name === "core:health-check");

		const mockContext = {
			jobId: "test-job-id",
			jobName: "core:health-check",
			emitEvent: vi.fn(),
			log: vi.fn(),
			updateStats: vi.fn(),
			setCompletionInfo: vi.fn(),
		};

		await healthCheckJob?.handler({ component: "database" }, mockContext);

		expect(mockContext.log).toHaveBeenCalledWith("Running health check for database");
		expect(mockContext.log).toHaveBeenCalledWith("Health check passed");
		expect(mockContext.emitEvent).toHaveBeenCalledWith("health-check:completed", {
			component: "database",
			status: "healthy",
			timestamp: expect.any(Date),
		});
	});

	it("should execute health check without component", async () => {
		const coreJobs = createCoreJobs(mockJobDao);
		const jobs = getRegisteredJobs(coreJobs);
		const healthCheckJob = jobs.find(j => j.name === "core:health-check");

		const mockContext = {
			jobId: "test-job-id",
			jobName: "core:health-check",
			emitEvent: vi.fn(),
			log: vi.fn(),
			updateStats: vi.fn(),
			setCompletionInfo: vi.fn(),
		};

		await healthCheckJob?.handler({}, mockContext);

		expect(mockContext.log).toHaveBeenCalledWith("Running health check");
	});

	it("should have queueJobs method", () => {
		const coreJobs = createCoreJobs(mockJobDao);
		expect(coreJobs.queueJobs).toBeDefined();
		expect(typeof coreJobs.queueJobs).toBe("function");
	});

	it("should queue cleanup job using config value", async () => {
		const coreJobs = createCoreJobs(mockJobDao);

		const mockJobScheduler: JobScheduler = {
			queueJob: vi
				.fn()
				.mockResolvedValue({ jobId: "test-id", name: "core:cleanup-old-jobs", message: "scheduled" }),
			registerJob: vi.fn(),
			listJobs: vi.fn().mockReturnValue([]),
			getJobHistory: vi.fn().mockResolvedValue([]),
			getJobExecution: vi.fn().mockResolvedValue(undefined),
			cancelJob: vi.fn().mockResolvedValue(undefined),
			retryJob: vi.fn().mockResolvedValue({ jobId: "retry-id", name: "test", message: "retried" }),
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			getEventEmitter: vi.fn(),
		};

		await coreJobs.queueJobs(mockJobScheduler);

		expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
			name: "core:cleanup-old-jobs",
			params: { olderThanDays: 30 },
			options: {
				cron: "0 2 * * *",
				singletonKey: "core:cleanup-old-jobs",
			},
		});
	});

	it("should use tenant context jobDao when available", async () => {
		// Create a tenant-specific jobDao mock
		const tenantJobDao: JobDao = {
			...mockJobDao,
			deleteOldExecutions: vi.fn().mockResolvedValue(10),
		};

		// Set up tenant context to return the tenant-specific jobDao
		mockGetTenantContext.mockReturnValue({
			database: {
				jobDao: tenantJobDao,
			},
		});

		const coreJobs = createCoreJobs(mockJobDao);
		const jobs = getRegisteredJobs(coreJobs);
		const cleanupJob = jobs.find(j => j.name === "core:cleanup-old-jobs");

		const mockContext = {
			jobId: "test-job-id",
			jobName: "core:cleanup-old-jobs",
			emitEvent: vi.fn(),
			log: vi.fn(),
			updateStats: vi.fn(),
			setCompletionInfo: vi.fn(),
		};

		await cleanupJob?.handler({ olderThanDays: 7 }, mockContext);

		// Verify tenant jobDao was used, not the default
		expect(tenantJobDao.deleteOldExecutions).toHaveBeenCalledWith(7);
		expect(mockJobDao.deleteOldExecutions).not.toHaveBeenCalled();

		// Clean up mock
		mockGetTenantContext.mockReturnValue(undefined);
	});
});
