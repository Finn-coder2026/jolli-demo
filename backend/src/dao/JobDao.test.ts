import type { TenantOrgContext } from "../tenant/TenantContext";
import { createMemorySequelize, type MemorySequelizeInstance } from "../util/Sequelize.js";
import { createJobDao, createJobDaoProvider, type JobDao } from "./JobDao.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("JobDao", () => {
	let instance: MemorySequelizeInstance;
	let jobDao: ReturnType<typeof createJobDao>;

	beforeEach(async () => {
		instance = await createMemorySequelize(true);
		jobDao = createJobDao(instance.sequelize);
		await instance.sequelize.sync({ force: true });
	});

	afterEach(async () => {
		await instance.sequelize.close();
		await instance.server.stop();
	});

	it("should create a job execution", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: { foo: "bar" },
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution).toBeDefined();
		expect(execution?.id).toBe("test-job-1");
		expect(execution?.name).toBe("test-job");
		expect(execution?.status).toBe("queued");
	});

	it("should update job status", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const startTime = new Date();
		await jobDao.updateJobStatus("test-job-1", "active", startTime);

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.status).toBe("active");
		expect(execution?.startedAt).toBeDefined();
	});

	it("should append log entries", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		await jobDao.appendLog("test-job-1", {
			timestamp: new Date(),
			level: "info",
			message: "Test log message",
		});

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.logs).toHaveLength(1);
		expect(execution?.logs[0].message).toBe("Test log message");
	});

	it("should list job executions", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "job1",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		await jobDao.createJobExecution({
			id: "test-job-2",
			name: "job2",
			params: {},
			status: "failed",
			logs: [],
			retryCount: 0,
		});

		const executions = await jobDao.listJobExecutions();
		expect(executions).toHaveLength(2);
	});

	it("should filter job executions by name", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "job1",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		await jobDao.createJobExecution({
			id: "test-job-2",
			name: "job2",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		const executions = await jobDao.listJobExecutions({ name: "job1" });
		expect(executions).toHaveLength(1);
		expect(executions[0].name).toBe("job1");
	});

	it("should filter job executions by status", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "job1",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		await jobDao.createJobExecution({
			id: "test-job-2",
			name: "job1",
			params: {},
			status: "failed",
			logs: [],
			retryCount: 0,
		});

		const executions = await jobDao.listJobExecutions({ status: "failed" });
		expect(executions).toHaveLength(1);
		expect(executions[0].status).toBe("failed");
	});

	it("should update job status with error", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const completedTime = new Date();
		await jobDao.updateJobStatus("test-job-1", "failed", undefined, completedTime, "Test error");

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.status).toBe("failed");
		expect(execution?.error).toBe("Test error");
	});

	it("should update job status with error and stack", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const completedTime = new Date();
		await jobDao.updateJobStatus(
			"test-job-1",
			"failed",
			undefined,
			completedTime,
			"Test error",
			"Stack trace here",
		);

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.status).toBe("failed");
		expect(execution?.error).toBe("Test error");
	});

	it("should delete old job executions", async () => {
		// Create an old job execution
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 40);

		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "job1",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		// Manually update the createdAt date to be old
		await instance.sequelize.query("UPDATE jobs SET created_at = :oldDate WHERE id = :id", {
			replacements: { oldDate, id: "test-job-1" },
		});

		const deletedCount = await jobDao.deleteOldExecutions(30);
		expect(deletedCount).toBe(1);

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution).toBeUndefined();
	});

	it("should not delete old pinned job executions", async () => {
		// Create an old job execution
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 40);

		await jobDao.createJobExecution({
			id: "test-job-pinned",
			name: "job1",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		// Pin the job
		await jobDao.pinJob("test-job-pinned");

		// Manually update the createdAt date to be old
		await instance.sequelize.query("UPDATE jobs SET created_at = :oldDate WHERE id = :id", {
			replacements: { oldDate, id: "test-job-pinned" },
		});

		// Try to delete old executions
		const deletedCount = await jobDao.deleteOldExecutions(30);
		expect(deletedCount).toBe(0);

		// Verify the pinned job still exists
		const execution = await jobDao.getJobExecution("test-job-pinned");
		expect(execution).toBeDefined();
		expect(execution?.id).toBe("test-job-pinned");
		expect(execution?.isPinned).toBe(true);
	});

	it("should update job stats", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const stats = { processed: 10, total: 100 };
		await jobDao.updateStats("test-job-1", stats);

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.stats).toBeDefined();
		expect(execution?.stats).toEqual(stats);
	});

	it("should return job execution with stats when stats are present", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const stats = { progress: 50, total: 100 };
		await jobDao.updateStats("test-job-1", stats);

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.stats).toEqual(stats);
	});

	it("should update and retrieve completion info", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const completionInfo = {
			message: "Job completed successfully",
			linkType: "article" as const,
			articleJrn: "jrn:aws:s3:::bucket/article-123",
		};
		await jobDao.updateCompletionInfo("test-job-1", completionInfo);

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.completionInfo).toBeDefined();
		expect(execution?.completionInfo).toEqual(completionInfo);
	});

	it("should handle completion info with docsite link", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const completionInfo = {
			message: "Documentation site generated",
			linkType: "docsite" as const,
			docsiteId: 42,
		};
		await jobDao.updateCompletionInfo("test-job-1", completionInfo);

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.completionInfo).toEqual(completionInfo);
	});

	it("should handle completion info with GitHub repo link", async () => {
		await jobDao.createJobExecution({
			id: "test-job-1",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const completionInfo = {
			message: "Synced with GitHub repository",
			linkType: "github-repo" as const,
			orgName: "myorg",
			repoName: "myrepo",
			containerType: "org" as const,
		};
		await jobDao.updateCompletionInfo("test-job-1", completionInfo);

		const execution = await jobDao.getJobExecution("test-job-1");
		expect(execution?.completionInfo).toEqual(completionInfo);
	});

	it("should create and retrieve job execution with title", async () => {
		await jobDao.createJobExecution({
			id: "test-job-with-title",
			name: "demo:quick-stats",
			title: "Quick Stats Demo",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		const execution = await jobDao.getJobExecution("test-job-with-title");
		expect(execution).toBeDefined();
		expect(execution?.name).toBe("demo:quick-stats");
		expect(execution?.title).toBe("Quick Stats Demo");
	});

	it("should pin a job", async () => {
		await jobDao.createJobExecution({
			id: "test-job-pin",
			name: "test-job",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		await jobDao.pinJob("test-job-pin", 123);

		const execution = await jobDao.getJobExecution("test-job-pin");
		expect(execution).toBeDefined();
		expect(execution?.pinnedAt).toBeDefined();
		expect(execution?.isPinned).toBe(true);
		expect(execution?.logs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					level: "info",
					message: "Job pinned by user 123",
				}),
			]),
		);
	});

	it("should pin a job without userId", async () => {
		await jobDao.createJobExecution({
			id: "test-job-pin-no-user",
			name: "test-job",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		await jobDao.pinJob("test-job-pin-no-user");

		const execution = await jobDao.getJobExecution("test-job-pin-no-user");
		expect(execution).toBeDefined();
		expect(execution?.pinnedAt).toBeDefined();
		expect(execution?.isPinned).toBe(true);
		expect(execution?.logs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					level: "info",
					message: "Job pinned",
				}),
			]),
		);
	});

	it("should throw error when pinning non-existent job", async () => {
		await expect(jobDao.pinJob("non-existent-job")).rejects.toThrow("Job non-existent-job not found");
	});

	it("should unpin a job", async () => {
		await jobDao.createJobExecution({
			id: "test-job-unpin",
			name: "test-job",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		// First pin it
		await jobDao.pinJob("test-job-unpin", 123);

		// Then unpin it
		await jobDao.unpinJob("test-job-unpin", 456);

		const execution = await jobDao.getJobExecution("test-job-unpin");
		expect(execution).toBeDefined();
		expect(execution?.pinnedAt).toBeUndefined();
		expect(execution?.isPinned).toBe(false);
		expect(execution?.logs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					level: "info",
					message: "Job unpinned by user 456",
				}),
			]),
		);
	});

	it("should unpin a job without userId", async () => {
		await jobDao.createJobExecution({
			id: "test-job-unpin-no-user",
			name: "test-job",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		// First pin it
		await jobDao.pinJob("test-job-unpin-no-user");

		// Then unpin it
		await jobDao.unpinJob("test-job-unpin-no-user");

		const execution = await jobDao.getJobExecution("test-job-unpin-no-user");
		expect(execution).toBeDefined();
		expect(execution?.pinnedAt).toBeUndefined();
		expect(execution?.isPinned).toBe(false);
		expect(execution?.logs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					level: "info",
					message: "Job unpinned",
				}),
			]),
		);
	});

	it("should throw error when unpinning non-existent job", async () => {
		await expect(jobDao.unpinJob("non-existent-job")).rejects.toThrow("Job non-existent-job not found");
	});

	it("should dismiss a job", async () => {
		await jobDao.createJobExecution({
			id: "test-job-dismiss",
			name: "test-job",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		await jobDao.dismissJob("test-job-dismiss", 789);

		const execution = await jobDao.getJobExecution("test-job-dismiss");
		expect(execution).toBeDefined();
		expect(execution?.dismissedAt).toBeDefined();
		expect(execution?.logs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					level: "info",
					message: "Job dismissed by user 789",
				}),
			]),
		);
	});

	it("should dismiss a job without userId", async () => {
		await jobDao.createJobExecution({
			id: "test-job-dismiss-no-user",
			name: "test-job",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		await jobDao.dismissJob("test-job-dismiss-no-user");

		const execution = await jobDao.getJobExecution("test-job-dismiss-no-user");
		expect(execution).toBeDefined();
		expect(execution?.dismissedAt).toBeDefined();
		expect(execution?.logs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					level: "info",
					message: "Job dismissed",
				}),
			]),
		);
	});

	it("should throw error when dismissing non-existent job", async () => {
		await expect(jobDao.dismissJob("non-existent-job")).rejects.toThrow("Job non-existent-job not found");
	});

	it("should create and retrieve job execution with sourceJobId and loopReason", async () => {
		await jobDao.createJobExecution({
			id: "test-job-loop",
			name: "test-job",
			params: {},
			status: "queued",
			logs: [],
			retryCount: 0,
		});

		// Update the job to include sourceJobId, loopPrevented, and loopReason
		await instance.sequelize.query(
			"UPDATE jobs SET source_job_id = :sourceJobId, loop_prevented = :loopPrevented, loop_reason = :loopReason WHERE id = :id",
			{
				replacements: {
					sourceJobId: "parent-job-123",
					loopPrevented: true,
					loopReason: "Circular dependency detected",
					id: "test-job-loop",
				},
			},
		);

		const execution = await jobDao.getJobExecution("test-job-loop");
		expect(execution).toBeDefined();
		expect(execution?.sourceJobId).toBe("parent-job-123");
		expect(execution?.loopPrevented).toBe(true);
		expect(execution?.loopReason).toBe("Circular dependency detected");
	});

	it("should delete all job executions", async () => {
		// Create multiple jobs
		await jobDao.createJobExecution({
			id: "job-1",
			name: "test-job",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
		});

		await jobDao.createJobExecution({
			id: "job-2",
			name: "another-job",
			params: {},
			status: "failed",
			logs: [],
			retryCount: 0,
		});

		// Delete all jobs
		await jobDao.deleteAllJobs();

		// Verify all jobs are deleted
		const job1 = await jobDao.getJobExecution("job-1");
		const job2 = await jobDao.getJobExecution("job-2");
		expect(job1).toBeUndefined();
		expect(job2).toBeUndefined();

		// Verify empty list
		const allJobs = await jobDao.listJobExecutions({});
		expect(allJobs).toHaveLength(0);
	});
});

describe("createJobDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as JobDao;
		const provider = createJobDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context jobDao when context has database", () => {
		const defaultDao = {} as JobDao;
		const contextJobDao = {} as JobDao;
		const context = {
			database: {
				jobDao: contextJobDao,
			},
		} as TenantOrgContext;

		const provider = createJobDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextJobDao);
	});
});
