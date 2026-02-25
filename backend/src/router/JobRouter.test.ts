import type { DaoProvider } from "../dao/DaoProvider";
import type { JobDao } from "../dao/JobDao.js";
import type { JobScheduler } from "../jobs/JobScheduler.js";
import type { AuthenticatedRequest, PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import { createJobRouter } from "./JobRouter.js";
import express, { type Express, type NextFunction, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("JobRouter", () => {
	let app: Express;
	let mockScheduler: JobScheduler;
	let mockJobDao: JobDao;
	let mockPermissionMiddleware: PermissionMiddlewareFactory;

	beforeEach(() => {
		// Create a simple event emitter mock that actually stores and calls listeners
		const eventListeners = new Map<string, Array<(event: unknown) => void>>();
		const mockEventEmitter = {
			emit: (eventName: string, data: unknown) => {
				const listeners = eventListeners.get(eventName) || [];
				for (const listener of listeners) {
					listener(data);
				}
			},
			on: (eventName: string, listener: (event: unknown) => void) => {
				if (!eventListeners.has(eventName)) {
					eventListeners.set(eventName, []);
				}
				eventListeners.get(eventName)?.push(listener);
			},
			off: (eventName: string, listener: (event: unknown) => void) => {
				const listeners = eventListeners.get(eventName) || [];
				const index = listeners.indexOf(listener);
				if (index > -1) {
					listeners.splice(index, 1);
				}
			},
			removeAllListeners: () => {
				eventListeners.clear();
			},
		};

		mockScheduler = {
			registerJob: vi.fn(),
			queueJob: vi.fn().mockResolvedValue({
				jobId: "test-job-id",
				name: "test-job",
				message: "Job queued successfully",
			}),
			listJobs: vi.fn().mockReturnValue([
				{
					name: "test-job",
					description: "A test job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: false,
					excludeFromStats: false,
				},
			]),
			getJobHistory: vi.fn().mockResolvedValue([
				{
					id: "test-job-id",
					name: "test-job",
					params: {},
					status: "completed",
					logs: [],
					retryCount: 0,
					createdAt: new Date(),
				},
			]),
			getJobExecution: vi.fn().mockResolvedValue({
				id: "test-job-id",
				name: "test-job",
				params: {},
				status: "completed",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			}),
			cancelJob: vi.fn().mockResolvedValue(undefined),
			retryJob: vi.fn().mockResolvedValue({
				jobId: "new-job-id",
				name: "test-job",
				message: "Job queued successfully",
			}),
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			getEventEmitter: vi.fn().mockReturnValue(mockEventEmitter),
		};

		mockJobDao = {
			createJobExecution: vi.fn().mockResolvedValue(undefined),
			updateJobStatus: vi.fn().mockResolvedValue(undefined),
			appendLog: vi.fn().mockResolvedValue(undefined),
			updateStats: vi.fn().mockResolvedValue(undefined),
			getJobExecution: vi.fn().mockResolvedValue({
				id: "test-job-id",
				name: "test-job",
				params: {},
				status: "completed",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			}),
			listJobExecutions: vi.fn().mockResolvedValue([
				{
					id: "test-job-id",
					name: "test-job",
					params: {},
					status: "completed",
					logs: [],
					retryCount: 0,
					createdAt: new Date(),
				},
			]),
			deleteOldExecutions: vi.fn().mockResolvedValue(0),
			deleteAllJobs: vi.fn().mockResolvedValue(undefined),
			updateCompletionInfo: vi.fn().mockResolvedValue(undefined),
			pinJob: vi.fn().mockResolvedValue(undefined),
			unpinJob: vi.fn().mockResolvedValue(undefined),
			dismissJob: vi.fn().mockResolvedValue(undefined),
		};

		const mockTokenUtil = {
			decodePayload: vi.fn().mockReturnValue({ userId: 1 }),
		};

		mockPermissionMiddleware = {
			requireAuth: vi.fn(() => (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
				req.user = { userId: 1, email: "test@example.com", name: "Test User", picture: undefined };
				next();
			}),
			requirePermission: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			requireAllPermissions: vi.fn(
				() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next(),
			),
			requireRole: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			loadPermissions: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
		};

		app = express();
		app.use(express.json());
		app.use(
			"/api/jobs",
			createJobRouter(
				mockScheduler,
				mockDaoProvider(mockJobDao),
				mockTokenUtil as never,
				mockPermissionMiddleware,
			),
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should list jobs", async () => {
		const response = await request(app).get("/api/jobs").expect(200);

		expect(response.body).toHaveLength(1);
		expect(response.body[0].name).toBe("test-job");
	});

	it("should queue a job", async () => {
		const response = await request(app)
			.post("/api/jobs/queue")
			.send({
				name: "test-job",
				params: { foo: "bar" },
			})
			.expect(200);

		expect(response.body.jobId).toBe("test-job-id");
		expect(response.body.name).toBe("test-job");
		expect(mockScheduler.queueJob).toHaveBeenCalledWith({
			name: "test-job",
			params: { foo: "bar" },
		});
	});

	it("should return 400 if job name is missing", async () => {
		await request(app)
			.post("/api/jobs/queue")
			.send({
				params: { foo: "bar" },
			})
			.expect(400);
	});

	it("should get job history", async () => {
		const response = await request(app).get("/api/jobs/history").expect(200);

		expect(response.body).toHaveLength(1);
		expect(response.body[0].id).toBe("test-job-id");
	});

	it("should get job history with filters", async () => {
		await request(app)
			.get("/api/jobs/history")
			.query({ name: "test-job", status: "completed", limit: "10", offset: "5" })
			.expect(200);

		expect(mockJobDao.listJobExecutions).toHaveBeenCalledWith({
			name: "test-job",
			status: "completed",
			limit: 10,
			offset: 5,
		});
	});

	it("should get job execution by ID", async () => {
		const response = await request(app).get("/api/jobs/history/test-job-id").expect(200);

		expect(response.body.id).toBe("test-job-id");
		expect(mockJobDao.getJobExecution).toHaveBeenCalledWith("test-job-id");
	});

	it("should return 404 if job execution not found", async () => {
		mockJobDao.getJobExecution = vi.fn().mockResolvedValue(undefined);

		await request(app).get("/api/jobs/history/nonexistent").expect(404);
	});

	it("should cancel a job", async () => {
		const response = await request(app).post("/api/jobs/test-job-id/cancel").expect(200);

		expect(response.body.message).toBe("Job cancelled successfully");
		expect(response.body.jobId).toBe("test-job-id");
		expect(mockScheduler.cancelJob).toHaveBeenCalledWith("test-job-id");
	});

	it("should retry a job", async () => {
		const response = await request(app).post("/api/jobs/test-job-id/retry").expect(200);

		expect(response.body.jobId).toBe("new-job-id");
		expect(mockScheduler.retryJob).toHaveBeenCalledWith("test-job-id");
	});

	it("should pin a job", async () => {
		const response = await request(app).post("/api/jobs/test-job-id/pin").expect(200);

		expect(response.body.message).toBe("Job pinned successfully");
		expect(response.body.jobId).toBe("test-job-id");
		expect(mockJobDao.pinJob).toHaveBeenCalledWith("test-job-id", 1);
	});

	it("should unpin a job", async () => {
		const response = await request(app).post("/api/jobs/test-job-id/unpin").expect(200);

		expect(response.body.message).toBe("Job unpinned successfully");
		expect(response.body.jobId).toBe("test-job-id");
		expect(mockJobDao.unpinJob).toHaveBeenCalledWith("test-job-id", 1);
	});

	it("should dismiss a job", async () => {
		const response = await request(app).post("/api/jobs/test-job-id/dismiss").expect(200);

		expect(response.body.message).toBe("Job dismissed successfully");
		expect(response.body.jobId).toBe("test-job-id");
		expect(mockJobDao.dismissJob).toHaveBeenCalledWith("test-job-id", 1);
	});

	it("should handle errors when pinning a job", async () => {
		mockJobDao.pinJob = vi.fn().mockRejectedValue(new Error("Test error"));

		await request(app).post("/api/jobs/test-job-id/pin").expect(400);
	});

	it("should handle errors when unpinning a job", async () => {
		mockJobDao.unpinJob = vi.fn().mockRejectedValue(new Error("Test error"));

		await request(app).post("/api/jobs/test-job-id/unpin").expect(400);
	});

	it("should handle errors when dismissing a job", async () => {
		mockJobDao.dismissJob = vi.fn().mockRejectedValue(new Error("Test error"));

		await request(app).post("/api/jobs/test-job-id/dismiss").expect(400);
	});

	it("should handle non-Error exceptions when pinning a job", async () => {
		mockJobDao.pinJob = vi.fn().mockRejectedValue("String error");

		const response = await request(app).post("/api/jobs/test-job-id/pin").expect(400);
		expect(response.body.error).toBe("Unknown error");
	});

	it("should handle non-Error exceptions when unpinning a job", async () => {
		mockJobDao.unpinJob = vi.fn().mockRejectedValue("String error");

		const response = await request(app).post("/api/jobs/test-job-id/unpin").expect(400);
		expect(response.body.error).toBe("Unknown error");
	});

	it("should handle non-Error exceptions when dismissing a job", async () => {
		mockJobDao.dismissJob = vi.fn().mockRejectedValue("String error");

		const response = await request(app).post("/api/jobs/test-job-id/dismiss").expect(400);
		expect(response.body.error).toBe("Unknown error");
	});

	it("should handle errors when listing jobs", async () => {
		mockScheduler.listJobs = vi.fn().mockImplementation(() => {
			throw new Error("Test error");
		});

		await request(app).get("/api/jobs").expect(500);
	});

	it("should handle errors when queuing a job", async () => {
		mockScheduler.queueJob = vi.fn().mockRejectedValue(new Error("Test error"));

		await request(app)
			.post("/api/jobs/queue")
			.send({
				name: "test-job",
				params: {},
			})
			.expect(400);
	});

	it("should handle errors when getting job history", async () => {
		mockJobDao.listJobExecutions = vi.fn().mockRejectedValue(new Error("Test error"));

		await request(app).get("/api/jobs/history").expect(500);
	});

	it("should handle errors when getting job execution", async () => {
		mockJobDao.getJobExecution = vi.fn().mockRejectedValue(new Error("Test error"));

		await request(app).get("/api/jobs/history/test-job-id").expect(500);
	});

	it("should handle errors when cancelling a job", async () => {
		mockScheduler.cancelJob = vi.fn().mockRejectedValue(new Error("Test error"));

		await request(app).post("/api/jobs/test-job-id/cancel").expect(400);
	});

	it("should handle errors when retrying a job", async () => {
		mockScheduler.retryJob = vi.fn().mockRejectedValue(new Error("Test error"));

		await request(app).post("/api/jobs/test-job-id/retry").expect(400);
	});

	it("should handle non-Error exceptions when listing jobs", async () => {
		mockScheduler.listJobs = vi.fn().mockImplementation(() => {
			throw "String error";
		});

		const response = await request(app).get("/api/jobs").expect(500);
		expect(response.body.error).toBe("Unknown error");
	});

	it("should handle non-Error exceptions when queuing a job", async () => {
		mockScheduler.queueJob = vi.fn().mockRejectedValue("String error");

		const response = await request(app)
			.post("/api/jobs/queue")
			.send({
				name: "test-job",
				params: {},
			})
			.expect(400);
		expect(response.body.error).toBe("Unknown error");
	});

	it("should handle non-Error exceptions when getting job history", async () => {
		mockJobDao.listJobExecutions = vi.fn().mockRejectedValue("String error");

		const response = await request(app).get("/api/jobs/history").expect(500);
		expect(response.body.error).toBe("Unknown error");
	});

	it("should handle non-Error exceptions when getting job execution", async () => {
		mockJobDao.getJobExecution = vi.fn().mockRejectedValue("String error");

		const response = await request(app).get("/api/jobs/history/test-job-id").expect(500);
		expect(response.body.error).toBe("Unknown error");
	});

	it("should handle non-Error exceptions when cancelling a job", async () => {
		mockScheduler.cancelJob = vi.fn().mockRejectedValue("String error");

		const response = await request(app).post("/api/jobs/test-job-id/cancel").expect(400);
		expect(response.body.error).toBe("Unknown error");
	});

	it("should handle non-Error exceptions when retrying a job", async () => {
		mockScheduler.retryJob = vi.fn().mockRejectedValue("String error");

		const response = await request(app).post("/api/jobs/test-job-id/retry").expect(400);
		expect(response.body.error).toBe("Unknown error");
	});

	describe("GET /api/jobs/stats", () => {
		it("should get job statistics", async () => {
			const now = new Date();
			const oldDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000); // 35 days ago

			mockJobDao.listJobExecutions = vi.fn().mockImplementation(filters => {
				if (filters.status === "active") {
					return Promise.resolve([
						{
							id: "active-1",
							name: "test-job",
							params: {},
							status: "active",
							logs: [],
							retryCount: 0,
							createdAt: now,
						},
						{
							id: "active-2",
							name: "test-job",
							params: {},
							status: "active",
							logs: [],
							retryCount: 1,
							createdAt: now,
						},
					]);
				}
				return Promise.resolve([
					{
						id: "completed-1",
						name: "test-job",
						params: {},
						status: "completed",
						logs: [],
						retryCount: 0,
						createdAt: now,
					},
					{
						id: "failed-1",
						name: "test-job",
						params: {},
						status: "failed",
						logs: [],
						retryCount: 2,
						createdAt: now,
					},
					{
						id: "old-job",
						name: "test-job",
						params: {},
						status: "completed",
						logs: [],
						retryCount: 0,
						createdAt: oldDate,
					},
				]);
			});

			const response = await request(app).get("/api/jobs/stats").expect(200);

			expect(response.body).toEqual({
				activeCount: 2,
				completedCount: 1,
				failedCount: 1,
				totalRetries: 2, // Only counting retries from recent jobs (completed + failed = 0 + 2)
			});
		});

		it("should filter out jobs with excludeFromStats", async () => {
			mockScheduler.listJobs = vi.fn().mockReturnValue([
				{
					name: "test-job",
					description: "A test job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: false,
					excludeFromStats: false,
				},
				{
					name: "excluded-job",
					description: "An excluded job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: false,
					excludeFromStats: true,
				},
			]);

			const now = new Date();
			mockJobDao.listJobExecutions = vi.fn().mockImplementation(filters => {
				if (filters.status === "active") {
					return Promise.resolve([
						{
							id: "active-1",
							name: "test-job",
							params: {},
							status: "active",
							logs: [],
							retryCount: 0,
							createdAt: now,
						},
						{
							id: "active-excluded",
							name: "excluded-job",
							params: {},
							status: "active",
							logs: [],
							retryCount: 0,
							createdAt: now,
						},
					]);
				}
				return Promise.resolve([
					{
						id: "completed-1",
						name: "test-job",
						params: {},
						status: "completed",
						logs: [],
						retryCount: 0,
						createdAt: now,
					},
					{
						id: "completed-excluded",
						name: "excluded-job",
						params: {},
						status: "completed",
						logs: [],
						retryCount: 0,
						createdAt: now,
					},
				]);
			});

			const response = await request(app).get("/api/jobs/stats").expect(200);

			expect(response.body).toEqual({
				activeCount: 1, // Only test-job, excluded-job is filtered out
				completedCount: 1,
				failedCount: 0,
				totalRetries: 0,
			});
		});

		it("should handle errors when getting stats", async () => {
			mockJobDao.listJobExecutions = vi.fn().mockRejectedValue(new Error("Test error"));

			await request(app).get("/api/jobs/stats").expect(500);
		});

		it("should handle non-Error exceptions when getting stats", async () => {
			mockJobDao.listJobExecutions = vi.fn().mockRejectedValue("String error");

			const response = await request(app).get("/api/jobs/stats").expect(500);
			expect(response.body.error).toBe("Unknown error");
		});
	});

	describe("GET /api/jobs/dashboard-active", () => {
		it("should get dashboard active jobs", async () => {
			mockScheduler.listJobs = vi.fn().mockReturnValue([
				{
					name: "dashboard-job",
					description: "A dashboard job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: true,
					excludeFromStats: false,
				},
				{
					name: "hidden-job",
					description: "A hidden job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: false,
					excludeFromStats: false,
				},
			]);

			const now = new Date();
			mockJobDao.listJobExecutions = vi.fn().mockResolvedValue([
				{
					id: "active-1",
					name: "dashboard-job",
					params: {},
					status: "active",
					logs: [],
					retryCount: 0,
					createdAt: now,
				},
				{
					id: "active-2",
					name: "hidden-job",
					params: {},
					status: "active",
					logs: [],
					retryCount: 0,
					createdAt: now,
				},
			]);

			const response = await request(app).get("/api/jobs/dashboard-active").expect(200);

			expect(response.body).toHaveLength(1);
			expect(response.body[0].name).toBe("dashboard-job");
		});

		it("should filter out jobs with excludeFromStats in dashboard-active", async () => {
			mockScheduler.listJobs = vi.fn().mockReturnValue([
				{
					name: "dashboard-job",
					description: "A dashboard job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: true,
					excludeFromStats: false,
				},
				{
					name: "excluded-job",
					description: "An excluded job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: true,
					excludeFromStats: true,
				},
			]);

			const now = new Date();
			mockJobDao.listJobExecutions = vi.fn().mockResolvedValue([
				{
					id: "active-1",
					name: "dashboard-job",
					params: {},
					status: "active",
					logs: [],
					retryCount: 0,
					createdAt: now,
				},
				{
					id: "active-excluded",
					name: "excluded-job",
					params: {},
					status: "active",
					logs: [],
					retryCount: 0,
					createdAt: now,
				},
			]);

			const response = await request(app).get("/api/jobs/dashboard-active").expect(200);

			expect(response.body).toHaveLength(1);
			expect(response.body[0].name).toBe("dashboard-job");
		});

		it("should filter out old unpinned jobs in dashboard-active", async () => {
			mockScheduler.listJobs = vi.fn().mockReturnValue([
				{
					name: "dashboard-job",
					description: "A dashboard job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: true,
					excludeFromStats: false,
					keepCardAfterCompletion: true,
				},
			]);

			const now = new Date();
			const thirteenHoursAgo = new Date(now.getTime() - 13 * 60 * 60 * 1000);

			// Mock active, completed, failed, and cancelled calls
			mockJobDao.listJobExecutions = vi.fn().mockImplementation(({ status }) => {
				if (status === "active" || status === "queued") {
					return Promise.resolve([]);
				}
				if (status === "failed" || status === "cancelled") {
					return Promise.resolve([]);
				}
				// For completed jobs - one old unpinned, one recent
				return Promise.resolve([
					{
						id: "completed-recent",
						name: "dashboard-job",
						params: {},
						status: "completed",
						completedAt: now,
						logs: [],
						retryCount: 0,
						createdAt: now,
					},
					{
						id: "completed-old",
						name: "dashboard-job",
						params: {},
						status: "completed",
						completedAt: thirteenHoursAgo,
						logs: [],
						retryCount: 0,
						createdAt: thirteenHoursAgo,
					},
				]);
			});

			const response = await request(app).get("/api/jobs/dashboard-active").expect(200);

			// Should only return the recent job (old unpinned job is filtered out)
			expect(response.body).toHaveLength(1);
			expect(response.body[0].id).toBe("completed-recent");
		});

		it("should filter out dismissed jobs in dashboard-active", async () => {
			mockScheduler.listJobs = vi.fn().mockReturnValue([
				{
					name: "dashboard-job",
					description: "A dashboard job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: true,
					excludeFromStats: false,
					keepCardAfterCompletion: true,
				},
			]);

			const now = new Date();
			// Mock active, completed, failed, and cancelled calls
			mockJobDao.listJobExecutions = vi.fn().mockImplementation(({ status }) => {
				if (status === "active" || status === "queued") {
					return Promise.resolve([]);
				}
				if (status === "failed" || status === "cancelled") {
					return Promise.resolve([]);
				}
				// For completed jobs
				return Promise.resolve([
					{
						id: "completed-1",
						name: "dashboard-job",
						params: {},
						status: "completed",
						completedAt: now,
						logs: [],
						retryCount: 0,
						createdAt: now,
					},
					{
						id: "completed-dismissed",
						name: "dashboard-job",
						params: {},
						status: "completed",
						completedAt: now,
						dismissedAt: now,
						logs: [],
						retryCount: 0,
						createdAt: now,
					},
				]);
			});

			const response = await request(app).get("/api/jobs/dashboard-active").expect(200);

			// Should only return the non-dismissed job
			expect(response.body).toHaveLength(1);
			expect(response.body[0].id).toBe("completed-1");
		});

		it("should handle errors when getting dashboard active jobs", async () => {
			mockJobDao.listJobExecutions = vi.fn().mockRejectedValue(new Error("Test error"));

			await request(app).get("/api/jobs/dashboard-active").expect(500);
		});

		it("should handle non-Error exceptions when getting dashboard active jobs", async () => {
			mockJobDao.listJobExecutions = vi.fn().mockRejectedValue("String error");

			const response = await request(app).get("/api/jobs/dashboard-active").expect(500);
			expect(response.body.error).toBe("Unknown error");
		});
	});

	describe("GET /api/jobs/history with excludeFromStats", () => {
		it("should filter out jobs with excludeFromStats in history", async () => {
			mockScheduler.listJobs = vi.fn().mockReturnValue([
				{
					name: "test-job",
					description: "A test job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: false,
					excludeFromStats: false,
				},
				{
					name: "excluded-job",
					description: "An excluded job",
					category: "core",
					parameterSchema: {},
					triggerEvents: [],
					showInDashboard: false,
					excludeFromStats: true,
				},
			]);

			mockJobDao.listJobExecutions = vi.fn().mockResolvedValue([
				{
					id: "test-job-id",
					name: "test-job",
					params: {},
					status: "completed",
					logs: [],
					retryCount: 0,
					createdAt: new Date(),
				},
				{
					id: "excluded-job-id",
					name: "excluded-job",
					params: {},
					status: "completed",
					logs: [],
					retryCount: 0,
					createdAt: new Date(),
				},
			]);

			const response = await request(app).get("/api/jobs/history").expect(200);

			expect(response.body).toHaveLength(1);
			expect(response.body[0].name).toBe("test-job");
		});
	});

	describe("GET /api/jobs/events", () => {
		it("should establish SSE connection", (done: () => void) => {
			const req = request(app).get("/api/jobs/events");

			req.on("response", response => {
				expect(response.statusCode).toBe(200);
				expect(response.headers["content-type"]).toBe("text/event-stream");
				expect(response.headers["cache-control"]).toBe("no-cache");
				expect(response.headers.connection).toBe("keep-alive");

				// Close the connection after verifying headers
				req.abort();
				done();
			});
		});

		it("should emit job:started events", (done: () => void) => {
			const req = request(app).get("/api/jobs/events");
			let receivedData = "";

			req.on("response", response => {
				response.on("data", (chunk: Buffer) => {
					receivedData += chunk.toString();

					// Check if we received the connected message
					if (receivedData.includes('"type":"connected"')) {
						// Use setImmediate to ensure event handlers are registered
						setImmediate(() => {
							// Simulate a job started event
							const eventEmitter = mockScheduler.getEventEmitter();
							if (eventEmitter && typeof eventEmitter.emit === "function") {
								eventEmitter.emit("job:started", {
									data: { jobId: "test-job-id", name: "test-job", showInDashboard: true },
								});
							}
						});
					}

					// Check if we received the job:started message
					if (receivedData.includes('"type":"job:started"')) {
						expect(receivedData).toContain('"jobId":"test-job-id"');
						expect(receivedData).toContain('"name":"test-job"');
						expect(receivedData).toContain('"showInDashboard":true');
						req.abort();
						done();
					}
				});
			});
		});

		it("should emit job:completed events", (done: () => void) => {
			const req = request(app).get("/api/jobs/events");
			let receivedData = "";

			req.on("response", response => {
				response.on("data", (chunk: Buffer) => {
					receivedData += chunk.toString();

					// Check if we received the connected message
					if (receivedData.includes('"type":"connected"')) {
						// Use setImmediate to ensure event handlers are registered
						setImmediate(() => {
							// Simulate a job completed event
							const eventEmitter = mockScheduler.getEventEmitter();
							if (eventEmitter && typeof eventEmitter.emit === "function") {
								eventEmitter.emit("job:completed", {
									data: { jobId: "test-job-id", name: "test-job", showInDashboard: false },
								});
							}
						});
					}

					// Check if we received the job:completed message
					if (receivedData.includes('"type":"job:completed"')) {
						expect(receivedData).toContain('"jobId":"test-job-id"');
						expect(receivedData).toContain('"name":"test-job"');
						req.abort();
						done();
					}
				});
			});
		});

		it("should emit job:failed events", (done: () => void) => {
			const req = request(app).get("/api/jobs/events");
			let receivedData = "";

			req.on("response", response => {
				response.on("data", (chunk: Buffer) => {
					receivedData += chunk.toString();

					// Check if we received the connected message
					if (receivedData.includes('"type":"connected"')) {
						// Use setImmediate to ensure event handlers are registered
						setImmediate(() => {
							// Simulate a job failed event
							const eventEmitter = mockScheduler.getEventEmitter();
							if (eventEmitter && typeof eventEmitter.emit === "function") {
								eventEmitter.emit("job:failed", {
									data: {
										jobId: "test-job-id",
										name: "test-job",
										error: "Test error",
										showInDashboard: true,
									},
								});
							}
						});
					}

					// Check if we received the job:failed message
					if (receivedData.includes('"type":"job:failed"')) {
						expect(receivedData).toContain('"jobId":"test-job-id"');
						expect(receivedData).toContain('"error":"Test error"');
						req.abort();
						done();
					}
				});
			});
		});

		it("should emit job:cancelled events", (done: () => void) => {
			const req = request(app).get("/api/jobs/events");
			let receivedData = "";

			req.on("response", response => {
				response.on("data", (chunk: Buffer) => {
					receivedData += chunk.toString();

					// Check if we received the connected message
					if (receivedData.includes('"type":"connected"')) {
						// Use setImmediate to ensure event handlers are registered
						setImmediate(() => {
							// Simulate a job cancelled event
							const eventEmitter = mockScheduler.getEventEmitter();
							if (eventEmitter && typeof eventEmitter.emit === "function") {
								eventEmitter.emit("job:cancelled", {
									data: { jobId: "test-job-id", name: "test-job", showInDashboard: true },
								});
							}
						});
					}

					// Check if we received the job:cancelled message
					if (receivedData.includes('"type":"job:cancelled"')) {
						expect(receivedData).toContain('"jobId":"test-job-id"');
						expect(receivedData).toContain('"name":"test-job"');
						req.abort();
						done();
					}
				});
			});
		});

		it("should emit job:stats-updated events", (done: () => void) => {
			const req = request(app).get("/api/jobs/events");
			let receivedData = "";

			req.on("response", response => {
				response.on("data", (chunk: Buffer) => {
					receivedData += chunk.toString();

					// Check if we received the connected message
					if (receivedData.includes('"type":"connected"')) {
						// Use setImmediate to ensure event handlers are registered
						setImmediate(() => {
							// Simulate a job stats-updated event
							const eventEmitter = mockScheduler.getEventEmitter();
							if (eventEmitter && typeof eventEmitter.emit === "function") {
								eventEmitter.emit("job:stats-updated", {
									data: {
										jobId: "test-job-id",
										name: "test-job",
										stats: { progress: 50, total: 100 },
										showInDashboard: true,
									},
								});
							}
						});
					}

					// Check if we received the job:stats-updated message
					if (receivedData.includes('"type":"job:stats-updated"')) {
						expect(receivedData).toContain('"jobId":"test-job-id"');
						expect(receivedData).toContain('"name":"test-job"');
						expect(receivedData).toContain('"progress":50');
						expect(receivedData).toContain('"total":100');
						req.abort();
						done();
					}
				});
			});
		});
	});
});
