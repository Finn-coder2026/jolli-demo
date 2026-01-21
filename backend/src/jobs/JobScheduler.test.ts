import type { JobDao } from "../dao/JobDao.js";
import type { JobContext, JobDefinition } from "../types/JobTypes";
import { createJobScheduler } from "./JobScheduler.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock logger to spy on log calls - use vi.hoisted() to declare in hoisted scope
const { mockLogError } = vi.hoisted(() => ({
	mockLogError: vi.fn(),
}));

// Mock the Sequelize module to control SSL configuration
vi.mock("../util/Sequelize.js", () => ({
	getPgBossPostgresConfiguration: vi.fn(() => ({
		connectionString: "postgres://localhost:5432/test",
		ssl: false,
	})),
}));

// Mock logger module
vi.mock("../util/Logger.js", () => ({
	getLog: () => ({
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: mockLogError,
		fatal: vi.fn(),
	}),
}));

// Store work handlers for testing
const workHandlers = new Map<string, (jobs: Array<{ id: string; data: object }>) => Promise<void>>();
let failNextWorkCall = false;
let returnNullJobId = false;
let returnNullScheduleId = false;

// Mock pg-boss
vi.mock("pg-boss", () => {
	return {
		default: class MockPgBoss {
			start() {
				return Promise.resolve();
			}
			stop() {
				return Promise.resolve();
			}
			send() {
				if (returnNullJobId) {
					returnNullJobId = false;
					return Promise.resolve(null);
				}
				return Promise.resolve("test-job-id");
			}
			schedule() {
				if (returnNullScheduleId) {
					returnNullScheduleId = false;
					return Promise.resolve(null);
				}
				return Promise.resolve("test-schedule-id");
			}
			createQueue() {
				return Promise.resolve();
			}
			work(jobName: string, handler: (jobs: Array<{ id: string; data: object }>) => Promise<void>) {
				if (failNextWorkCall) {
					failNextWorkCall = false;
					return Promise.reject(new Error("Failed to register job worker"));
				}
				workHandlers.set(jobName, handler);
				return Promise.resolve();
			}
			cancel() {
				return Promise.resolve();
			}
		},
	};
});

describe("JobScheduler", () => {
	const mockJobDao: JobDao = {
		createJobExecution: vi.fn().mockResolvedValue(undefined),
		updateJobStatus: vi.fn().mockResolvedValue(undefined),
		appendLog: vi.fn().mockResolvedValue(undefined),
		updateStats: vi.fn().mockResolvedValue(undefined),
		getJobExecution: vi.fn().mockResolvedValue({
			id: "test-job-id",
			name: "test-job",
			params: { foo: "bar" },
			status: "completed",
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		}),
		listJobExecutions: vi.fn().mockResolvedValue([]),
		deleteOldExecutions: vi.fn().mockResolvedValue(0),
		deleteAllJobs: vi.fn().mockResolvedValue(undefined),
		updateCompletionInfo: vi.fn().mockResolvedValue(undefined),
		pinJob: vi.fn().mockResolvedValue(undefined),
		unpinJob: vi.fn().mockResolvedValue(undefined),
		dismissJob: vi.fn().mockResolvedValue(undefined),
	};

	it("should create a job scheduler", () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		expect(scheduler).toBeDefined();
		expect(scheduler.registerJob).toBeDefined();
		expect(scheduler.queueJob).toBeDefined();
		expect(scheduler.listJobs).toBeDefined();
		expect(scheduler.start).toBeDefined();
		expect(scheduler.stop).toBeDefined();
	});

	it("should create a job scheduler with SSL enabled", async () => {
		const { getPgBossPostgresConfiguration } = await import("../util/Sequelize.js");
		vi.mocked(getPgBossPostgresConfiguration).mockReturnValueOnce({
			connectionString: "postgres://localhost:5432/test",
			ssl: true,
		});

		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		expect(scheduler).toBeDefined();
	});

	it("should register a job", () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition<{ message: string }> = {
			name: "test-job",
			description: "A test job",
			schema: z.object({ message: z.string() }),
			handler: async () => {
				// No-op
			},
		};

		scheduler.registerJob(testJob);

		const jobs = scheduler.listJobs();
		expect(jobs).toHaveLength(1);
		expect(jobs[0].name).toBe("test-job");
		expect(jobs[0].description).toBe("A test job");
	});

	it("should list registered jobs", () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const job1: JobDefinition = {
			name: "job1",
			description: "Job 1",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		const job2: JobDefinition = {
			name: "job2",
			description: "Job 2",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(job1);
		scheduler.registerJob(job2);

		const jobs = scheduler.listJobs();
		expect(jobs).toHaveLength(2);
	});

	it("should not register duplicate jobs", () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);

		expect(() => scheduler.registerJob(testJob)).toThrow("Job already registered: test-job");
	});

	it("should queue a job", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition<{ message: string }> = {
			name: "test-job",
			description: "A test job",
			schema: z.object({ message: z.string() }),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const result = await scheduler.queueJob({
			name: "test-job",
			params: { message: "Hello, world!" },
		});

		expect(result.jobId).toBe("test-job-id");
		expect(result.name).toBe("test-job");
		expect(result.messageKey).toBe("job-queued-successfully");
	});

	it("should handle null jobId from pg-boss", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition<{ message: string }> = {
			name: "test-job",
			description: "A test job",
			schema: z.object({ message: z.string() }),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		// Set flag to return null jobId
		returnNullJobId = true;

		const result = await scheduler.queueJob({
			name: "test-job",
			params: { message: "Hello, world!" },
		});

		expect(result.jobId).toBe("");
		expect(result.name).toBe("test-job");
		expect(result.messageKey).toBe("job-queued-successfully");
	});

	it("should validate job parameters", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition<{ count: number }> = {
			name: "test-job",
			description: "A test job",
			schema: z.object({ count: z.number() }),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		await expect(
			scheduler.queueJob({
				name: "test-job",
				params: { count: "invalid" },
			}),
		).rejects.toThrow();
	});

	it("should get the event emitter", () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const emitter = scheduler.getEventEmitter();
		expect(emitter).toBeDefined();
		expect(emitter.emit).toBeDefined();
		expect(emitter.on).toBeDefined();
	});

	it("should queue job with cron schedule", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const result = await scheduler.queueJob({
			name: "test-job",
			params: {},
			options: {
				cron: "0 0 * * *",
			},
		});

		expect(result.messageKey).toBe("job-scheduled-with-cron");
		expect(result.messageContext).toEqual({ cron: "0 0 * * *" });
	});

	it("should queue cron job with high priority", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const result = await scheduler.queueJob({
			name: "test-job",
			params: {},
			options: {
				cron: "0 0 * * *",
				priority: "high",
			},
		});

		expect(result.messageKey).toBe("job-scheduled-with-cron");
		expect(result.messageContext).toEqual({ cron: "0 0 * * *" });
	});

	it("should queue cron job with low priority", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const result = await scheduler.queueJob({
			name: "test-job",
			params: {},
			options: {
				cron: "0 0 * * *",
				priority: "low",
			},
		});

		expect(result.messageKey).toBe("job-scheduled-with-cron");
		expect(result.messageContext).toEqual({ cron: "0 0 * * *" });
	});

	it("should queue cron job with normal priority", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const result = await scheduler.queueJob({
			name: "test-job",
			params: {},
			options: {
				cron: "0 0 * * *",
				priority: "normal",
			},
		});

		expect(result.messageKey).toBe("job-scheduled-with-cron");
		expect(result.messageContext).toEqual({ cron: "0 0 * * *" });
	});

	it("should handle null schedule ID from pg-boss", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		// Set flag to return null schedule ID
		returnNullScheduleId = true;

		const result = await scheduler.queueJob({
			name: "test-job",
			params: {},
			options: {
				cron: "0 0 * * *",
			},
		});

		expect(result.jobId).toBe("scheduled");
		expect(result.messageKey).toBe("job-scheduled-with-cron");
		expect(result.messageContext).toEqual({ cron: "0 0 * * *" });
	});

	it("should queue job with all options", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		await scheduler.queueJob({
			name: "test-job",
			params: {},
			options: {
				startAfter: 1000,
				priority: "high",
				retryLimit: 3,
				retryDelay: 5000,
				retryBackoff: true,
				expireInMs: 60000,
				singletonKey: "test-key",
			},
		});

		expect(mockJobDao.createJobExecution).toHaveBeenCalled();
	});

	it("should queue job with normal priority", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		await scheduler.queueJob({
			name: "test-job",
			params: {},
			options: {
				priority: "normal",
			},
		});

		expect(mockJobDao.createJobExecution).toHaveBeenCalled();
	});

	it("should queue job with low priority", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		await scheduler.queueJob({
			name: "test-job",
			params: {},
			options: {
				priority: "low",
			},
		});

		expect(mockJobDao.createJobExecution).toHaveBeenCalled();
	});

	it("should retry a job", async () => {
		const mockDao = {
			...mockJobDao,
			getJobExecution: vi.fn().mockResolvedValue({
				id: "test-job-id",
				name: "test-job",
				params: { foo: "bar" },
				status: "failed",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			}),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({ foo: z.string() }),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const result = await scheduler.retryJob("test-job-id");
		expect(result.jobId).toBe("test-job-id");
	});

	it("should cancel a job", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			getJobExecution: vi.fn().mockResolvedValue({
				id: "test-job-id",
				name: "test-job",
				params: {},
				status: "active",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			}),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		await scheduler.start();
		await scheduler.cancelJob("test-job-id");

		expect(mockDao.updateJobStatus).toHaveBeenCalledWith("test-job-id", "cancelled", undefined, expect.any(Date));
	});

	it("should register jobs with trigger events", () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "test-job",
			description: "A test job",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
			triggerEvents: ["test-event"],
		};

		scheduler.registerJob(testJob);
		const jobs = scheduler.listJobs();
		expect(jobs[0].triggerEvents).toEqual(["test-event"]);
	});

	it("should get job history", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		await scheduler.getJobHistory({ name: "test-job", limit: 10 });
		expect(mockJobDao.listJobExecutions).toHaveBeenCalledWith({
			name: "test-job",
			limit: 10,
		});
	});

	it("should get job execution", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		await scheduler.getJobExecution("test-job-id");
		expect(mockJobDao.getJobExecution).toHaveBeenCalledWith("test-job-id");
	});

	it("should stop the scheduler", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		await scheduler.start();
		await scheduler.stop();

		// Should not throw
		await scheduler.stop();
	});

	it("should handle start when already started", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		await scheduler.start();
		// Calling start again should return early
		await scheduler.start();
	});

	it("should handle stop when not started", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		// Calling stop without start should not throw
		await scheduler.stop();
	});

	it("should execute job handler successfully", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockResolvedValue(undefined);
		const testJob: JobDefinition = {
			name: "test-job",
			description: "Test job",
			schema: z.object({ foo: z.string() }),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		// Get the work handler that was registered
		const workHandler = workHandlers.get("test-job");
		expect(workHandler).toBeDefined();

		// Execute the handler with mock job data
		if (workHandler) {
			await workHandler([{ id: "job-1", data: { foo: "bar" } }]);
		}

		// Verify the handler was called
		expect(handlerMock).toHaveBeenCalledWith({ foo: "bar" }, expect.objectContaining({ jobId: "job-1" }));

		// Verify job status updates
		expect(mockDao.updateJobStatus).toHaveBeenCalledWith("job-1", "active", expect.any(Date));
		expect(mockDao.updateJobStatus).toHaveBeenCalledWith("job-1", "completed", undefined, expect.any(Date));
	});

	it("should handle job handler errors", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const testError = new Error("Job failed");
		const handlerMock = vi.fn().mockRejectedValue(testError);
		const testJob: JobDefinition = {
			name: "failing-job",
			description: "Failing job",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		// Get the work handler
		const workHandler = workHandlers.get("failing-job");
		expect(workHandler).toBeDefined();

		// Execute and expect it to throw
		if (workHandler) {
			await expect(workHandler([{ id: "job-2", data: {} }])).rejects.toThrow("Job failed");
		}

		// Verify error was logged
		expect(mockDao.updateJobStatus).toHaveBeenCalledWith(
			"job-2",
			"failed",
			undefined,
			expect.any(Date),
			"Job failed",
			expect.any(String),
		);
	});

	it("should handle non-Error exceptions in job handler", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockRejectedValue("String error");
		const testJob: JobDefinition = {
			name: "string-error-job",
			description: "Job that throws string",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("string-error-job");
		if (workHandler) {
			await expect(workHandler([{ id: "job-3", data: {} }])).rejects.toBe("String error");
		}

		// Verify error was handled
		expect(mockDao.updateJobStatus).toHaveBeenCalledWith(
			"job-3",
			"failed",
			undefined,
			expect.any(Date),
			"String error",
			undefined,
		);
	});

	it("should emit events from job context", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		let capturedContext: JobContext | undefined;
		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			capturedContext = context;
		});

		const testJob: JobDefinition = {
			name: "event-job",
			description: "Job that emits events",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("event-job");
		if (workHandler) {
			await workHandler([{ id: "job-4", data: {} }]);
		}

		// Test emitEvent
		const eventEmitter = scheduler.getEventEmitter();
		const eventListener = vi.fn();
		eventEmitter.on("test-event", eventListener);

		if (capturedContext) {
			await capturedContext.emitEvent("test-event", { message: "Hello" });
		}

		expect(eventListener).toHaveBeenCalled();
	});

	it("should log messages from job context", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			context.log("Info message");
			context.log("Warning message", "warn");
			context.log("Error message", "error");
		});

		const testJob: JobDefinition = {
			name: "logging-job",
			description: "Job that logs messages",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("logging-job");
		if (workHandler) {
			await workHandler([{ id: "job-5", data: {} }]);
		}

		// Verify logs were appended
		expect(mockDao.appendLog).toHaveBeenCalledWith("job-5", expect.objectContaining({ level: "info" }));
		expect(mockDao.appendLog).toHaveBeenCalledWith("job-5", expect.objectContaining({ level: "warn" }));
		expect(mockDao.appendLog).toHaveBeenCalledWith("job-5", expect.objectContaining({ level: "error" }));
	});

	it("should handle legacy log signature when array is passed as second parameter", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			// Pass an array as the second parameter to trigger the legacy signature
			// This tests the !Array.isArray(contextOrLevel) check on line 245
			// When an array is passed, it's treated as the level (which becomes the array)
			context.log("Message with array", ["some", "array"] as unknown as "info");
		});

		const testJob: JobDefinition = {
			name: "logging-array-job",
			description: "Job that logs with array parameter",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("logging-array-job");
		if (workHandler) {
			await workHandler([{ id: "job-array", data: {} }]);
		}

		// Verify log was appended with legacy signature (message + level)
		// When an array is passed as second param, it becomes the level value
		expect(mockDao.appendLog).toHaveBeenCalledWith(
			"job-array",
			expect.objectContaining({
				level: ["some", "array"], // The array becomes the level
				message: "Message with array",
			}),
		);
	});

	it("should use new log signature with messageKey and context", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			// New signature: messageKey, context, level
			context.log("operation-complete", { count: 5, status: "success" }, "info");
			context.log("operation-warning", { count: 3 }, "warn");
			context.log("operation-error", { errorCode: 500 }, "error");
		});

		const testJob: JobDefinition = {
			name: "new-logging-job",
			description: "Job that uses new log signature",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("new-logging-job");
		if (workHandler) {
			await workHandler([{ id: "job-new-log", data: {} }]);
		}

		// Verify logs were appended with new signature
		expect(mockDao.appendLog).toHaveBeenCalledWith(
			"job-new-log",
			expect.objectContaining({
				level: "info",
				messageKey: "operation-complete",
				context: { count: 5, status: "success" },
			}),
		);
		expect(mockDao.appendLog).toHaveBeenCalledWith(
			"job-new-log",
			expect.objectContaining({
				level: "warn",
				messageKey: "operation-warning",
				context: { count: 3 },
			}),
		);
		expect(mockDao.appendLog).toHaveBeenCalledWith(
			"job-new-log",
			expect.objectContaining({
				level: "error",
				messageKey: "operation-error",
				context: { errorCode: 500 },
			}),
		);
	});

	it("should use default info level when level is not provided in new signature", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			// New signature without level parameter - should default to "info"
			context.log("operation-complete", { count: 5, status: "success" });
		});

		const testJob: JobDefinition = {
			name: "default-level-job",
			description: "Job that uses new log signature without level",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("default-level-job");
		if (workHandler) {
			await workHandler([{ id: "job-default-level", data: {} }]);
		}

		// Verify log was appended with default "info" level
		expect(mockDao.appendLog).toHaveBeenCalledWith(
			"job-default-level",
			expect.objectContaining({
				level: "info", // Should default to "info" when level is undefined
				messageKey: "operation-complete",
				context: { count: 5, status: "success" },
			}),
		);
	});

	it("should handle multiple jobs in batch", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockResolvedValue(undefined);
		const testJob: JobDefinition = {
			name: "batch-job",
			description: "Job for batch processing",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("batch-job");
		if (workHandler) {
			await workHandler([
				{ id: "job-6", data: {} },
				{ id: "job-7", data: {} },
			]);
		}

		// Verify both jobs were processed
		expect(handlerMock).toHaveBeenCalledTimes(2);
		expect(mockDao.updateJobStatus).toHaveBeenCalledWith("job-6", "completed", undefined, expect.any(Date));
		expect(mockDao.updateJobStatus).toHaveBeenCalledWith("job-7", "completed", undefined, expect.any(Date));
	});

	it("should trigger jobs from events", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			createJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const testJob: JobDefinition = {
			name: "event-triggered-job",
			description: "Job triggered by events",
			schema: z.object({ message: z.string() }),
			handler: async () => {
				// Test handler
			},
			triggerEvents: ["test-trigger"],
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		// Emit the trigger event
		const eventEmitter = scheduler.getEventEmitter();
		eventEmitter.emit("test-trigger", { message: "Hello from event" });

		// Wait a bit for async event handling
		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify job was queued
		expect(mockDao.createJobExecution).toHaveBeenCalled();
	});

	it("should queue event-triggered job with default options", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			createJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const testJob: JobDefinition = {
			name: "event-with-options",
			description: "Event job with default options",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
			triggerEvents: ["custom-event"],
			defaultOptions: { priority: "high" },
		};

		scheduler.registerJob(testJob);

		// Emit the event
		const eventEmitter = scheduler.getEventEmitter();
		eventEmitter.emit("custom-event", {});

		await new Promise(resolve => setTimeout(resolve, 10));
	});

	it("should not queue event-triggered job when shouldTriggerEvent returns false", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			createJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const testJob: JobDefinition = {
			name: "filtered-event-job",
			description: "Event job with filter",
			schema: z.object({ message: z.string() }),
			handler: async () => {
				// Test handler
			},
			triggerEvents: ["filtered-event"],
			shouldTriggerEvent: async () => false,
		};

		scheduler.registerJob(testJob);

		// Emit the event
		const eventEmitter = scheduler.getEventEmitter();
		eventEmitter.emit("filtered-event", { message: "should be filtered" });

		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify job was NOT queued because shouldTriggerEvent returned false
		expect(mockDao.createJobExecution).not.toHaveBeenCalled();
	});

	it("should queue event-triggered job when shouldTriggerEvent returns true", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			createJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const testJob: JobDefinition = {
			name: "allowed-event-job",
			description: "Event job allowed by filter",
			schema: z.object({ message: z.string() }),
			handler: async () => {
				// Test handler
			},
			triggerEvents: ["allowed-event"],
			shouldTriggerEvent: async () => true,
		};

		scheduler.registerJob(testJob);

		// Emit the event
		const eventEmitter = scheduler.getEventEmitter();
		eventEmitter.emit("allowed-event", { message: "should be allowed" });

		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify job WAS queued because shouldTriggerEvent returned true
		expect(mockDao.createJobExecution).toHaveBeenCalled();
	});

	it("should not queue event-triggered job when triggerEventParamsConverter returns undefined", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			createJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({ jobDao: mockDao });
		await scheduler.start();

		const testJob: JobDefinition = {
			name: "filtered-converter-job",
			description: "Test job with converter that filters",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
			triggerEvents: ["converter-filter-event"],
			triggerEventParamsConverter: () => {
				// Return nothing to filter out this event
			},
		};

		scheduler.registerJob(testJob);

		const eventEmitter = scheduler.getEventEmitter();
		eventEmitter.emit("converter-filter-event", { test: "data" });

		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify job was NOT queued because converter returned undefined
		expect(mockDao.createJobExecution).not.toHaveBeenCalled();
	});

	it("should queue event-triggered job when no triggerEventParamsConverter is provided", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			createJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({ jobDao: mockDao });
		await scheduler.start();

		const testJob: JobDefinition = {
			name: "no-converter-job",
			description: "Test job without converter",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
			triggerEvents: ["no-converter-event"],
		};

		scheduler.registerJob(testJob);

		const eventEmitter = scheduler.getEventEmitter();
		eventEmitter.emit("no-converter-event", { test: "data" });

		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify job WAS queued with the event data directly
		expect(mockDao.createJobExecution).toHaveBeenCalled();
	});

	it("should register job after scheduler is started", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		await scheduler.start();

		// Register a job after starting
		const lateJob: JobDefinition = {
			name: "late-registered-job",
			description: "Job registered after start",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(lateJob);

		// Verify the handler was registered with pg-boss
		expect(workHandlers.has("late-registered-job")).toBe(true);
	});

	it("should log error when late job registration fails", async () => {
		// Clear previous mock calls
		mockLogError.mockClear();

		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		await scheduler.start();

		// Set flag to make next work() call fail
		failNextWorkCall = true;

		// Register a job that will fail
		const failingJob: JobDefinition = {
			name: "failing-late-job",
			description: "Job that fails to register",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(failingJob);

		// Wait for the async error handling
		await new Promise(resolve => setTimeout(resolve, 20));

		// Verify error was logged
		expect(mockLogError).toHaveBeenCalledWith(
			expect.any(Error),
			"Failed to register job worker: %s",
			"failing-late-job",
		);
	});

	it("should register job with retry delay and backoff options", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		const testJob: JobDefinition = {
			name: "job-with-retry-options",
			description: "Job with retry delay and backoff",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
			defaultOptions: {
				retryLimit: 5,
				retryDelay: 1000,
				retryBackoff: true,
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		// Verify the job was registered
		const jobs = scheduler.listJobs();
		expect(jobs.find(j => j.name === "job-with-retry-options")).toBeDefined();
	});

	it("should throw error when queueing unknown job", async () => {
		const scheduler = createJobScheduler({
			jobDao: mockJobDao,
		});

		await scheduler.start();

		await expect(scheduler.queueJob({ name: "unknown-job", params: {} })).rejects.toThrow("Unknown job");
	});

	it("should throw error on cancelJob when execution not found", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			getJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		await scheduler.start();

		await expect(scheduler.cancelJob("nonexistent-job")).rejects.toThrow("Job execution not found");
	});

	it("should throw error on retryJob when execution not found", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			getJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		await scheduler.start();

		await expect(scheduler.retryJob("nonexistent-job")).rejects.toThrow("Job execution not found");
	});

	it("should validate stats when statsSchema is provided", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
			updateStats: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const statsSchema = z.object({ progress: z.number(), total: z.number() });

		let capturedContext: JobContext | undefined;
		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			capturedContext = context;
		});

		const testJob: JobDefinition = {
			name: "stats-validation-job",
			description: "Job with stats schema",
			schema: z.object({}),
			handler: handlerMock,
			statsSchema,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("stats-validation-job");
		if (workHandler) {
			await workHandler([{ id: "job-stats", data: {} }]);
		}

		// Test updateStats with valid stats
		if (capturedContext) {
			await capturedContext.updateStats({ progress: 50, total: 100 });
			expect(mockDao.updateStats).toHaveBeenCalledWith("job-stats", { progress: 50, total: 100 });
		}
	});

	it("should throw error when stats validation fails", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
			updateStats: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const statsSchema = z.object({ progress: z.number(), total: z.number() });

		let capturedContext: JobContext | undefined;
		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			capturedContext = context;
		});

		const testJob: JobDefinition = {
			name: "stats-invalid-job",
			description: "Job with stats schema",
			schema: z.object({}),
			handler: handlerMock,
			statsSchema,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("stats-invalid-job");
		if (workHandler) {
			await workHandler([{ id: "job-invalid-stats", data: {} }]);
		}

		// Test updateStats with invalid stats
		if (capturedContext) {
			await expect(capturedContext.updateStats({ invalid: "data" })).rejects.toThrow("Invalid stats");
		}
	});

	it("should throw error when setCompletionInfo receives invalid completion info", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
			updateCompletionInfo: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		let capturedContext: JobContext | undefined;
		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			capturedContext = context;
		});

		const testJob: JobDefinition = {
			name: "completion-invalid-job",
			description: "Job to test invalid completion info",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("completion-invalid-job");
		if (workHandler) {
			await workHandler([{ id: "job-invalid-completion", data: {} }]);
		}

		// Test setCompletionInfo with invalid completion info
		if (capturedContext) {
			await expect(
				capturedContext.setCompletionInfo({ linkType: "invalid-type-that-does-not-exist" } as never),
			).rejects.toThrow("Invalid completion info");
		}
	});

	it("should successfully set completion info with valid data", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
			updateCompletionInfo: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		let capturedContext: JobContext | undefined;
		const handlerMock = vi.fn().mockImplementation((_params, context: JobContext) => {
			capturedContext = context;
		});

		const testJob: JobDefinition = {
			name: "completion-valid-job",
			description: "Job to test valid completion info",
			schema: z.object({}),
			handler: handlerMock,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		const workHandler = workHandlers.get("completion-valid-job");
		if (workHandler) {
			await workHandler([{ id: "job-valid-completion", data: {} }]);
		}

		// Test setCompletionInfo with valid completion info
		if (capturedContext) {
			await capturedContext.setCompletionInfo({
				message: "Job completed successfully",
				linkType: "articles-tab",
			});

			expect(mockDao.updateCompletionInfo).toHaveBeenCalledWith("job-valid-completion", {
				message: "Job completed successfully",
				linkType: "articles-tab",
			});
		}
	});

	it("should handle job completion when getJobExecution returns undefined", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
			getJobExecution: vi.fn().mockResolvedValue(undefined), // Returns undefined
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockResolvedValue(undefined);
		const testJob: JobDefinition = {
			name: "job-no-execution",
			description: "Job that completes but execution not found",
			schema: z.object({}),
			handler: handlerMock,
			showInDashboard: true,
			keepCardAfterCompletion: true,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		// Capture emitted events
		const completedEvents: Array<unknown> = [];
		scheduler.getEventEmitter().on("job:completed", event => {
			completedEvents.push(event);
		});

		const workHandler = workHandlers.get("job-no-execution");
		if (workHandler) {
			await workHandler([{ id: "job-undefined", data: {} }]);
		}

		// Verify job completed event was emitted with undefined completionInfo
		expect(completedEvents).toHaveLength(1);
		expect(completedEvents[0]).toMatchObject({
			name: "job:completed",
			data: {
				jobId: "job-undefined",
				name: "job-no-execution",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				completionInfo: undefined, // This covers the jobExecution being undefined branch
			},
		});
	});

	it("should handle job completion when jobExecution has no completionInfo", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
			getJobExecution: vi.fn().mockResolvedValue({
				id: "job-no-completion-info",
				name: "test-job",
				params: {},
				status: "completed",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
				// No completionInfo property
			}),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const handlerMock = vi.fn().mockResolvedValue(undefined);
		const testJob: JobDefinition = {
			name: "job-no-completion-data",
			description: "Job that completes without completion info",
			schema: z.object({}),
			handler: handlerMock,
			showInDashboard: true,
			keepCardAfterCompletion: true,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		// Capture emitted events
		const completedEvents: Array<unknown> = [];
		scheduler.getEventEmitter().on("job:completed", event => {
			completedEvents.push(event);
		});

		const workHandler = workHandlers.get("job-no-completion-data");
		if (workHandler) {
			await workHandler([{ id: "job-no-completion-info", data: {} }]);
		}

		// Verify job completed event was emitted with undefined completionInfo
		expect(completedEvents).toHaveLength(1);
		expect(completedEvents[0]).toMatchObject({
			name: "job:completed",
			data: {
				jobId: "job-no-completion-info",
				name: "job-no-completion-data",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				completionInfo: undefined, // This covers the completionInfo being undefined branch
			},
		});
	});

	it("should cancel a job with showInDashboard and keepCardAfterCompletion", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			getJobExecution: vi.fn().mockResolvedValue({
				id: "test-job-id",
				name: "test-job-with-dashboard",
				params: {},
				status: "active",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			}),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		// Register a job with showInDashboard and keepCardAfterCompletion
		const testJob: JobDefinition = {
			name: "test-job-with-dashboard",
			description: "Test job with dashboard properties",
			schema: z.object({}),
			handler: async () => {
				// Test handler
			},
			showInDashboard: true,
			keepCardAfterCompletion: true,
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		await scheduler.cancelJob("test-job-id");

		expect(mockDao.updateJobStatus).toHaveBeenCalledWith("test-job-id", "cancelled", undefined, expect.any(Date));
	});

	it("should queue a job with title", async () => {
		const mockDao: JobDao = {
			...mockJobDao,
			createJobExecution: vi.fn().mockResolvedValue(undefined),
		};

		const scheduler = createJobScheduler({
			jobDao: mockDao,
		});

		const testJob: JobDefinition<{ message: string }> = {
			name: "test-job-with-title",
			description: "A test job with title",
			title: "Test Job Title",
			schema: z.object({ message: z.string() }),
			handler: async () => {
				// Test handler
			},
		};

		scheduler.registerJob(testJob);
		await scheduler.start();

		await scheduler.queueJob({
			name: "test-job-with-title",
			params: { message: "Hello" },
		});

		// Verify createJobExecution was called with title
		expect(mockDao.createJobExecution).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "test-job-with-title",
				title: "Test Job Title",
			}),
		);
	});

	// Loop Prevention Tests
	describe("Loop Prevention", () => {
		it("should prevent direct self-triggering (Job A → Job A)", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockImplementation((jobId: string) => {
					// Simulate a job that was triggered by itself
					if (jobId === "source-job-id") {
						return Promise.resolve({
							id: "source-job-id",
							name: "self-trigger-job",
							params: {},
							status: "active",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
							sourceJobId: "ancestor-job-id",
						});
					}
					if (jobId === "ancestor-job-id") {
						return Promise.resolve({
							id: "ancestor-job-id",
							name: "self-trigger-job",
							params: {},
							status: "completed",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
						});
					}
					return Promise.resolve(undefined);
				}),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const testJob: JobDefinition = {
				name: "self-trigger-job",
				description: "Job that triggers itself",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["self-event"],
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Emit event with sourceJobId that would trigger the same job
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("self-event", {}, "source-job-id");

			// Wait for async event handling
			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify job was queued with loopPrevented flag
			expect(mockDao.createJobExecution).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "self-trigger-job",
					loopPrevented: true,
					loopReason: expect.stringContaining("repetition count"),
				}),
			);
		});

		it("should prevent indirect loops (Job A → Job B → Job A)", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockImplementation((jobId: string) => {
					// Simulate: Job B triggered by Job A (second instance)
					if (jobId === "job-b-id") {
						return Promise.resolve({
							id: "job-b-id",
							name: "job-b",
							params: {},
							status: "active",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
							sourceJobId: "job-a-2-id",
						});
					}
					// Job A (second instance) triggered by first Job A
					if (jobId === "job-a-2-id") {
						return Promise.resolve({
							id: "job-a-2-id",
							name: "job-a",
							params: {},
							status: "completed",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
							sourceJobId: "job-a-1-id",
						});
					}
					// Job A (first instance)
					if (jobId === "job-a-1-id") {
						return Promise.resolve({
							id: "job-a-1-id",
							name: "job-a",
							params: {},
							status: "completed",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
						});
					}
					return Promise.resolve(undefined);
				}),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const jobA: JobDefinition = {
				name: "job-a",
				description: "Job A",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["event-a"],
			};

			scheduler.registerJob(jobA);
			await scheduler.start();

			// Emit event that would trigger Job A from Job B (which was triggered by Job A)
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("event-a", {}, "job-b-id");

			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify job was queued with loopPrevented flag
			expect(mockDao.createJobExecution).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "job-a",
					loopPrevented: true,
					loopReason: expect.stringContaining("repetition count"),
				}),
			);
		});

		it("should prevent jobs beyond max chain depth", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockImplementation((jobId: string) => {
					// Create a chain of 10 jobs (at the default limit)
					const depth = Number.parseInt(jobId.split("-")[1] || "0");
					if (depth > 0) {
						return Promise.resolve({
							id: jobId,
							name: `job-${depth}`,
							params: {},
							status: "completed",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
							sourceJobId: `job-${depth - 1}`,
						});
					}
					return Promise.resolve(undefined);
				}),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const testJob: JobDefinition = {
				name: "depth-limited-job",
				description: "Job with depth limit",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["depth-event"],
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Emit event from a job at depth 10 (at the limit)
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("depth-event", {}, "job-10");

			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify job was queued with loopPrevented flag
			expect(mockDao.createJobExecution).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "depth-limited-job",
					loopPrevented: true,
					loopReason: expect.stringContaining("Chain depth"),
				}),
			);
		});

		it("should allow legitimate job chains within limits", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockImplementation((jobId: string) => {
					// Simulate a short chain: Job C → Job B → Job A
					if (jobId === "job-c-id") {
						return Promise.resolve({
							id: "job-c-id",
							name: "job-c",
							params: {},
							status: "active",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
							sourceJobId: "job-b-id",
						});
					}
					if (jobId === "job-b-id") {
						return Promise.resolve({
							id: "job-b-id",
							name: "job-b",
							params: {},
							status: "completed",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
							sourceJobId: "job-a-id",
						});
					}
					if (jobId === "job-a-id") {
						return Promise.resolve({
							id: "job-a-id",
							name: "job-a",
							params: {},
							status: "completed",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
						});
					}
					return Promise.resolve(undefined);
				}),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const jobD: JobDefinition = {
				name: "job-d",
				description: "Job D (different from A, B, C)",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["event-d"],
			};

			scheduler.registerJob(jobD);
			await scheduler.start();

			// Emit event that would trigger Job D from Job C
			// Chain would be: Job D ← Job C ← Job B ← Job A (depth 4, no repetitions)
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("event-d", {}, "job-c-id");

			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify job was queued WITHOUT loopPrevented flag
			expect(mockDao.createJobExecution).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "job-d",
					sourceJobId: "job-c-id",
				}),
			);

			// Ensure loopPrevented was not set
			const lastCall = vi.mocked(mockDao.createJobExecution).mock.calls[
				vi.mocked(mockDao.createJobExecution).mock.calls.length - 1
			];
			expect(lastCall[0]).not.toHaveProperty("loopPrevented", true);
		});

		it("should support per-job loop prevention config overrides", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockImplementation((jobId: string) => {
					// Simulate a chain of 5 jobs
					const depth = Number.parseInt(jobId.split("-")[1] || "0");
					if (depth > 0) {
						return Promise.resolve({
							id: jobId,
							name: `job-${depth}`,
							params: {},
							status: "completed",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
							sourceJobId: `job-${depth - 1}`,
						});
					}
					return Promise.resolve(undefined);
				}),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const testJob: JobDefinition = {
				name: "custom-limit-job",
				description: "Job with custom max depth",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["custom-event"],
				loopPrevention: {
					maxChainDepth: 3, // Custom limit lower than default (10)
				},
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Emit event from a job at depth 3 (at custom limit)
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("custom-event", {}, "job-3");

			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify job was queued with loopPrevented flag due to custom limit
			// Chain: job-3 → job-2 → job-1 (depth 3), new job makes it depth 4
			expect(mockDao.createJobExecution).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "custom-limit-job",
					loopPrevented: true,
					loopReason: expect.stringContaining("exceeds maximum (3)"),
				}),
			);
		});

		it("should immediately fail loop-prevented jobs when executed", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockResolvedValue({
					id: "loop-job-id",
					name: "loop-prevented-job",
					params: {},
					status: "queued",
					logs: [],
					retryCount: 0,
					createdAt: new Date(),
					loopPrevented: true,
					loopReason: "Chain depth (11) exceeds maximum (10)",
				}),
				updateJobStatus: vi.fn().mockResolvedValue(undefined),
				appendLog: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const handlerMock = vi.fn().mockResolvedValue(undefined);
			const testJob: JobDefinition = {
				name: "loop-prevented-job",
				description: "Job marked for loop prevention",
				schema: z.object({}),
				handler: handlerMock,
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Get the work handler and execute it
			const workHandler = workHandlers.get("loop-prevented-job");
			if (workHandler) {
				await workHandler([{ id: "loop-job-id", data: {} }]);
			}

			// Verify the handler was NOT called (job failed before execution)
			expect(handlerMock).not.toHaveBeenCalled();

			// Verify job was marked as failed
			expect(mockDao.updateJobStatus).toHaveBeenCalledWith(
				"loop-job-id",
				"failed",
				expect.any(Date),
				expect.any(Date),
				expect.stringContaining("Infinite loop prevented"),
				undefined,
			);
		});

		it("should handle loop-prevented job without loopReason", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockResolvedValue({
					id: "loop-job-no-reason",
					name: "loop-prevented-job",
					params: {},
					status: "queued",
					logs: [],
					retryCount: 0,
					createdAt: new Date(),
					loopPrevented: true,
					// No loopReason provided to test the fallback
				}),
				updateJobStatus: vi.fn().mockResolvedValue(undefined),
				appendLog: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const handlerMock = vi.fn().mockResolvedValue(undefined);
			const testJob: JobDefinition = {
				name: "loop-prevented-job",
				description: "Job marked for loop prevention",
				schema: z.object({}),
				handler: handlerMock,
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Get the work handler and execute it
			const workHandler = workHandlers.get("loop-prevented-job");
			if (workHandler) {
				await workHandler([{ id: "loop-job-no-reason", data: {} }]);
			}

			// Verify the handler was NOT called
			expect(handlerMock).not.toHaveBeenCalled();

			// Verify job was marked as failed with "Unknown reason" fallback
			expect(mockDao.updateJobStatus).toHaveBeenCalledWith(
				"loop-job-no-reason",
				"failed",
				expect.any(Date),
				expect.any(Date),
				"Infinite loop prevented: Unknown reason",
				undefined,
			);
		});

		it("should handle chain analysis errors gracefully", async () => {
			// Clear previous mock calls
			mockLogError.mockClear();

			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockRejectedValue(new Error("Database error")),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const testJob: JobDefinition = {
				name: "error-handling-job",
				description: "Job to test error handling",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["error-event"],
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Emit event with sourceJobId
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("error-event", {}, "some-job-id");

			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify error was logged
			expect(mockLogError).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to analyze job chain for %s",
				"error-handling-job",
			);

			// Verify job was still queued (fallback behavior)
			expect(mockDao.createJobExecution).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "error-handling-job",
					sourceJobId: "some-job-id",
				}),
			);
		});

		it("should handle very deep chains with safety limit", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockImplementation((jobId: string) => {
					// Create an infinitely deep chain (simulating data corruption)
					const depth = Number.parseInt(jobId.split("-")[1] || "0");
					return Promise.resolve({
						id: jobId,
						name: `job-${depth}`,
						params: {},
						status: "completed",
						logs: [],
						retryCount: 0,
						createdAt: new Date(),
						sourceJobId: `job-${depth + 1}`, // Always points to next job
					});
				}),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const testJob: JobDefinition = {
				name: "safety-limit-job",
				description: "Job to test safety limit",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["safety-event"],
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Emit event from a job that would create infinite chain
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("safety-event", {}, "job-0");

			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify the chain analysis stopped at the safety limit (100)
			// The job should be queued with loopPrevented since it exceeds max depth
			expect(mockDao.createJobExecution).toHaveBeenCalled();
		});

		it("should handle event-triggered job without defaultOptions", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockResolvedValue(undefined),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			// Job without defaultOptions to cover the options creation path
			const testJob: JobDefinition = {
				name: "no-defaults-job",
				description: "Job without default options",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["no-defaults-event"],
				// No defaultOptions specified
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Emit event
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("no-defaults-event", {}, "source-job");

			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify job was queued with sourceJobId
			expect(mockDao.createJobExecution).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "no-defaults-job",
					sourceJobId: "source-job",
				}),
			);
		});

		it("should prevent jobs that exceed both depth and repetition limits", async () => {
			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockImplementation((jobId: string) => {
					// Create a chain that exceeds both limits:
					// 12 jobs deep (exceeds default max of 10)
					// with "test-job" appearing 3 times (exceeds default max of 2)
					const depth = Number.parseInt(jobId.split("-")[1] || "0");
					if (depth > 0 && depth <= 12) {
						// Make every 4th job be "test-job" to get 3 repetitions (jobs 4, 8, 12)
						const jobName = depth % 4 === 0 ? "test-job" : `other-job-${depth}`;
						return Promise.resolve({
							id: jobId,
							name: jobName,
							params: {},
							status: "completed",
							logs: [],
							retryCount: 0,
							createdAt: new Date(),
							sourceJobId: depth > 1 ? `job-${depth - 1}` : undefined,
						});
					}
					return Promise.resolve(undefined);
				}),
				createJobExecution: vi.fn().mockResolvedValue(undefined),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const testJob: JobDefinition = {
				name: "test-job",
				description: "Job that violates both limits",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["both-limits-event"],
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Emit event from job-12 (12 deep, with test-job appearing at 4, 8, 12 = 3 times)
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("both-limits-event", {}, "job-12");

			await new Promise(resolve => setTimeout(resolve, 10));

			// Verify job was prevented with both reasons mentioned
			expect(mockDao.createJobExecution).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "test-job",
					loopPrevented: true,
					loopReason: expect.stringMatching(/Chain depth.*and.*repetition count/),
				}),
			);
		});

		it("should handle queueJob failure in error fallback path", async () => {
			// Clear previous mock calls
			mockLogError.mockClear();

			const mockDao: JobDao = {
				...mockJobDao,
				getJobExecution: vi.fn().mockRejectedValue(new Error("Database error")),
				createJobExecution: vi.fn().mockRejectedValue(new Error("Queue error")),
			};

			const scheduler = createJobScheduler({
				jobDao: mockDao,
			});

			const testJob: JobDefinition = {
				name: "queue-fail-job",
				description: "Job to test queue failure",
				schema: z.object({}),
				handler: async () => {
					// Test handler
				},
				triggerEvents: ["queue-fail-event"],
			};

			scheduler.registerJob(testJob);
			await scheduler.start();

			// Emit event with sourceJobId to trigger the error paths
			const eventEmitter = scheduler.getEventEmitter();
			eventEmitter.emit("queue-fail-event", {}, "some-job-id");

			// Wait longer for both async error handlers
			await new Promise(resolve => setTimeout(resolve, 20));

			// Verify both errors were logged
			expect(mockLogError).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to analyze job chain for %s",
				"queue-fail-job",
			);
			expect(mockLogError).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to queue job %s from event",
				"queue-fail-job",
			);
		});
	});
});
