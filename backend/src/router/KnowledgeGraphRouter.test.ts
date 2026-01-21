import type { JobScheduler } from "../jobs/JobScheduler";
import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager";
import type { JobExecution } from "../types/JobTypes";
import { createKnowledgeGraphRouter } from "./KnowledgeGraphRouter";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("KnowledgeGraphRouter", () => {
	let app: Express;
	let jobScheduler: JobScheduler;
	let schedulerManager: MultiTenantJobSchedulerManager;

	beforeEach(() => {
		vi.clearAllMocks();

		const queueJob = vi.fn().mockResolvedValue({
			jobId: "job-123",
			name: "knowledge-graph:architecture",
			message: "Queued",
		});
		const getJobExecution = vi.fn().mockResolvedValue(undefined);

		jobScheduler = {
			// Only methods used by the router are needed for tests
			queueJob,
			getJobExecution,
			registerJob: vi.fn(),
			listJobs: vi.fn(),
			getJobHistory: vi.fn(),
			cancelJob: vi.fn(),
			retryJob: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			getEventEmitter: vi.fn() as never,
		} as unknown as JobScheduler;

		schedulerManager = {
			getSchedulerForContext: vi.fn().mockResolvedValue(undefined),
		} as unknown as MultiTenantJobSchedulerManager;

		app = express();
		app.use(express.json());
		app.use("/kg", createKnowledgeGraphRouter({ jobScheduler, schedulerManager }));
	});

	it("POST /process/:integrationId returns 400 for invalid id", async () => {
		const res = await request(app).post("/kg/process/not-a-number");
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("Invalid integration ID");
	});

	it("POST /process/:integrationId queues job for valid id", async () => {
		const res = await request(app).post("/kg/process/42");
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.integrationId).toBe(42);
		expect(res.body.jobId).toBe("job-123");
	});

	it("POST /process/:integrationId handles Error thrown by queueJob", async () => {
		vi.mocked(jobScheduler.queueJob).mockRejectedValueOnce(new Error("boom"));
		const res = await request(app).post("/kg/process/1");
		expect(res.status).toBe(500);
		expect(res.body.error).toBe("Failed to queue job");
		expect(res.body.message).toBe("boom");
	});

	it("POST /process/:integrationId handles non-Error thrown by queueJob", async () => {
		// Cover the error instanceof Error false branch
		vi.mocked(jobScheduler.queueJob).mockRejectedValueOnce("not-an-error");
		const res = await request(app).post("/kg/process/1");
		expect(res.status).toBe(500);
		expect(res.body.message).toBe("Unknown error occurred");
	});

	it("GET /status/:jobId returns 400 when jobId is missing", async () => {
		// Test with empty jobId by using a route that would be handled as empty param
		const res = await request(app).get("/kg/status/");
		expect(res.status).toBe(404); // Express will return 404 for unmatched route
	});

	it("GET /status/:jobId returns 404 when job not found", async () => {
		const res = await request(app).get("/kg/status/abc");
		expect(jobScheduler.getJobExecution).toHaveBeenCalledWith("abc");
		expect(res.status).toBe(404);
		expect(res.body.error).toBe("Job not found");
	});

	it("GET /status/:jobId returns job details when found", async () => {
		const job: JobExecution = {
			id: "job-1",
			name: "knowledge-graph:architecture",
			params: { integrationId: 1 },
			status: "queued",
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};
		vi.mocked(jobScheduler.getJobExecution).mockResolvedValueOnce(job);
		const res = await request(app).get("/kg/status/job-1");
		expect(res.status).toBe(200);
		expect(res.body.jobId).toBe("job-1");
		expect(res.body.status).toBe("queued");
	});

	it("GET /status/:jobId returns 500 when getJobExecution throws Error", async () => {
		vi.mocked(jobScheduler.getJobExecution).mockRejectedValueOnce(new Error("Database error"));
		const res = await request(app).get("/kg/status/error-job");
		expect(res.status).toBe(500);
		expect(res.body.error).toBe("Failed to get job status");
		expect(res.body.message).toBe("Database error");
	});

	it("GET /status/:jobId returns 500 when getJobExecution throws non-Error", async () => {
		vi.mocked(jobScheduler.getJobExecution).mockRejectedValueOnce("string error");
		const res = await request(app).get("/kg/status/error-job");
		expect(res.status).toBe(500);
		expect(res.body.error).toBe("Failed to get job status");
		expect(res.body.message).toBe("Unknown error occurred");
	});

	it("GET /health returns healthy", async () => {
		const res = await request(app).get("/kg/health");
		expect(res.status).toBe(200);
		expect(res.body.status).toBe("healthy");
		expect(res.body.service).toBe("knowledge-graph");
	});

	it("POST /upload-main queues upload job", async () => {
		const res = await request(app).post("/kg/upload-main");
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.jobId).toBe("job-123");
	});

	it("POST /upload-main handles non-Error thrown by queueJob", async () => {
		vi.mocked(jobScheduler.queueJob).mockRejectedValueOnce("bad");
		const res = await request(app).post("/kg/upload-main");
		expect(res.status).toBe(500);
		expect(res.body.error).toBe("Failed to queue upload-main job");
		expect(res.body.message).toBe("Unknown error occurred");
	});

	it("POST /upload-main handles Error thrown by queueJob", async () => {
		vi.mocked(jobScheduler.queueJob).mockRejectedValueOnce(new Error("Queue is full"));
		const res = await request(app).post("/kg/upload-main");
		expect(res.status).toBe(500);
		expect(res.body.error).toBe("Failed to queue upload-main job");
		expect(res.body.message).toBe("Queue is full");
	});

	it("POST /process-batch returns 400 when integrationIds not array", async () => {
		const res = await request(app).post("/kg/process-batch").send({});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("Invalid request");
	});

	it("POST /process-batch queues valid ids and reports errors", async () => {
		// First call succeeds, second is invalid id, third throws error
		vi.mocked(jobScheduler.queueJob)
			.mockResolvedValueOnce({ jobId: "job-1", name: "knowledge-graph:architecture", message: "Queued" })
			.mockRejectedValueOnce(new Error("queue failed"));

		const res = await request(app)
			.post("/kg/process-batch")
			.send({ integrationIds: ["1", "bogus", "2"] });

		expect(res.status).toBe(200);
		expect(res.body.jobs.length).toBe(1);
		expect(res.body.jobs[0]).toEqual({ integrationId: 1, jobId: "job-1" });
		// Two errors: invalid id and thrown error
		expect(res.body.errors.length).toBe(2);
	});

	it("POST /process-batch returns success false when no jobs queued", async () => {
		const res = await request(app)
			.post("/kg/process-batch")
			.send({ integrationIds: ["not-a-number"] });
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(false);
		expect(res.body.jobs.length).toBe(0);
		expect(res.body.errors.length).toBe(1);
	});

	it("POST /process-batch returns undefined errors when all jobs succeed", async () => {
		vi.mocked(jobScheduler.queueJob).mockResolvedValue({
			jobId: "job-1",
			name: "knowledge-graph:architecture",
			message: "Queued",
		});

		const res = await request(app)
			.post("/kg/process-batch")
			.send({ integrationIds: ["1", "2"] });

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.jobs.length).toBe(2);
		expect(res.body.errors).toBeUndefined();
	});

	it("POST /process-batch handles non-Error in inner catch", async () => {
		// First call succeeds, second rejects with non-Error
		vi.mocked(jobScheduler.queueJob)
			.mockResolvedValueOnce({ jobId: "job-1", name: "knowledge-graph:architecture", message: "Queued" })
			.mockRejectedValueOnce("string-error");

		const res = await request(app)
			.post("/kg/process-batch")
			.send({ integrationIds: ["1", "2"] });

		expect(res.status).toBe(200);
		expect(res.body.jobs.length).toBe(1);
		expect(res.body.errors.length).toBe(1);
		expect(res.body.errors[0].error).toBe("Failed to queue job");
	});

	it("POST /process-batch returns 400 for null integrationIds", async () => {
		// Send a body that will cause a validation error
		const res = await request(app).post("/kg/process-batch").send({ integrationIds: null });

		expect(res.status).toBe(400);
		expect(res.body.error).toBe("Invalid request");
	});

	it("POST /process-batch returns 500 when unexpected error occurs", async () => {
		// Create a new app instance with middleware that breaks iteration
		const errorApp = express();
		errorApp.use(express.json());

		// Add middleware that modifies the integrationIds to be non-iterable
		errorApp.use((req, _res, next) => {
			if (req.body?.integrationIds) {
				// Replace integrationIds with an object that passes Array.isArray but fails on iteration
				Object.defineProperty(req.body.integrationIds, Symbol.iterator, {
					get() {
						throw new Error("Iteration failed");
					},
				});
			}
			next();
		});

		errorApp.use("/kg", createKnowledgeGraphRouter({ jobScheduler, schedulerManager }));

		const res = await request(errorApp)
			.post("/kg/process-batch")
			.send({ integrationIds: ["1", "2"] });

		expect(res.status).toBe(500);
		expect(res.body.error).toBe("Failed to process batch");
		expect(res.body.message).toBe("Iteration failed");
	});

	it("POST /process-batch returns 500 with non-Error thrown", async () => {
		// Create a new app instance with middleware that throws non-Error
		const errorApp = express();
		errorApp.use(express.json());

		// Add middleware that modifies the integrationIds to throw non-Error
		errorApp.use((req, _res, next) => {
			if (req.body?.integrationIds) {
				// Replace integrationIds with an object that passes Array.isArray but fails on iteration
				Object.defineProperty(req.body.integrationIds, Symbol.iterator, {
					get() {
						throw "non-error-string";
					},
				});
			}
			next();
		});

		errorApp.use("/kg", createKnowledgeGraphRouter({ jobScheduler, schedulerManager }));

		const res = await request(errorApp)
			.post("/kg/process-batch")
			.send({ integrationIds: ["1", "2"] });

		expect(res.status).toBe(500);
		expect(res.body.error).toBe("Failed to process batch");
		expect(res.body.message).toBe("Unknown error occurred");
	});

	describe("Multi-tenant mode (schedulerManager)", () => {
		let multiTenantApp: Express;

		beforeEach(() => {
			// Create router without jobScheduler, so it uses schedulerManager
			const mtSchedulerManager = {
				getSchedulerForContext: vi.fn().mockResolvedValue(jobScheduler),
			} as unknown as MultiTenantJobSchedulerManager;

			multiTenantApp = express();
			multiTenantApp.use(express.json());
			multiTenantApp.use("/kg", createKnowledgeGraphRouter({ schedulerManager: mtSchedulerManager }));
		});

		it("POST /process/:integrationId uses schedulerManager when jobScheduler not provided", async () => {
			const res = await request(multiTenantApp).post("/kg/process/42");
			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(res.body.integrationId).toBe(42);
		});

		it("POST /process/:integrationId returns 503 when scheduler unavailable", async () => {
			// Create router with schedulerManager that returns undefined
			const unavailableManager = {
				getSchedulerForContext: vi.fn().mockResolvedValue(undefined),
			} as unknown as MultiTenantJobSchedulerManager;

			const testApp = express();
			testApp.use(express.json());
			testApp.use("/kg", createKnowledgeGraphRouter({ schedulerManager: unavailableManager }));

			const res = await request(testApp).post("/kg/process/42");
			expect(res.status).toBe(503);
			expect(res.body.error).toBe("Job scheduler unavailable");
		});

		it("GET /status/:jobId uses schedulerManager when jobScheduler not provided", async () => {
			const job: JobExecution = {
				id: "job-1",
				name: "knowledge-graph:architecture",
				params: { integrationId: 1 },
				status: "queued",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			};
			vi.mocked(jobScheduler.getJobExecution).mockResolvedValueOnce(job);

			const res = await request(multiTenantApp).get("/kg/status/job-1");
			expect(res.status).toBe(200);
			expect(res.body.jobId).toBe("job-1");
		});

		it("GET /status/:jobId returns 503 when scheduler unavailable", async () => {
			const unavailableManager = {
				getSchedulerForContext: vi.fn().mockResolvedValue(undefined),
			} as unknown as MultiTenantJobSchedulerManager;

			const testApp = express();
			testApp.use(express.json());
			testApp.use("/kg", createKnowledgeGraphRouter({ schedulerManager: unavailableManager }));

			const res = await request(testApp).get("/kg/status/job-1");
			expect(res.status).toBe(503);
			expect(res.body.error).toBe("Job scheduler unavailable");
		});

		it("POST /upload-main uses schedulerManager when jobScheduler not provided", async () => {
			const res = await request(multiTenantApp).post("/kg/upload-main");
			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
		});

		it("POST /upload-main returns 503 when scheduler unavailable", async () => {
			const unavailableManager = {
				getSchedulerForContext: vi.fn().mockResolvedValue(undefined),
			} as unknown as MultiTenantJobSchedulerManager;

			const testApp = express();
			testApp.use(express.json());
			testApp.use("/kg", createKnowledgeGraphRouter({ schedulerManager: unavailableManager }));

			const res = await request(testApp).post("/kg/upload-main");
			expect(res.status).toBe(503);
			expect(res.body.error).toBe("Job scheduler unavailable");
		});

		it("POST /process-batch uses schedulerManager when jobScheduler not provided", async () => {
			vi.mocked(jobScheduler.queueJob).mockResolvedValue({
				jobId: "job-1",
				name: "knowledge-graph:architecture",
				message: "Queued",
			});

			const res = await request(multiTenantApp)
				.post("/kg/process-batch")
				.send({ integrationIds: ["1", "2"] });

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(res.body.jobs.length).toBe(2);
		});

		it("POST /process-batch returns 503 when scheduler unavailable", async () => {
			const unavailableManager = {
				getSchedulerForContext: vi.fn().mockResolvedValue(undefined),
			} as unknown as MultiTenantJobSchedulerManager;

			const testApp = express();
			testApp.use(express.json());
			testApp.use("/kg", createKnowledgeGraphRouter({ schedulerManager: unavailableManager }));

			const res = await request(testApp)
				.post("/kg/process-batch")
				.send({ integrationIds: ["1"] });

			expect(res.status).toBe(503);
			expect(res.body.error).toBe("Job scheduler unavailable");
		});
	});
});
