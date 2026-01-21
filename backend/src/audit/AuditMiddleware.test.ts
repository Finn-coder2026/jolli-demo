import { getAuditContext } from "./AuditContext";
import {
	createAuditMiddleware,
	createAuditUserMiddleware,
	createSchedulerActorMiddleware,
	createSystemActorMiddleware,
	createWebhookActorMiddleware,
} from "./AuditMiddleware";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// Mock the logger to suppress console output during tests
vi.mock("../util/Logger", () => ({
	getLog: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

describe("AuditMiddleware", () => {
	describe("createAuditMiddleware", () => {
		it("should initialize audit context from request", async () => {
			const app = express();
			let capturedContext: ReturnType<typeof getAuditContext>;

			app.use(createAuditMiddleware());
			app.get("/test", (_req, res) => {
				capturedContext = getAuditContext();
				res.json({ success: true });
			});

			await request(app).get("/test").set("User-Agent", "Test Browser").set("X-Request-Id", "req-123");

			expect(capturedContext).toBeDefined();
			expect(capturedContext?.actorDevice).toBe("Test Browser");
			expect(capturedContext?.requestId).toBe("req-123");
			expect(capturedContext?.httpMethod).toBe("GET");
			expect(capturedContext?.endpoint).toBe("/test");
			expect(capturedContext?.actorType).toBe("user");
		});

		it("should extract IP from x-forwarded-for header", async () => {
			const app = express();
			let capturedContext: ReturnType<typeof getAuditContext>;

			app.use(createAuditMiddleware());
			app.get("/test", (_req, res) => {
				capturedContext = getAuditContext();
				res.json({ success: true });
			});

			await request(app).get("/test").set("X-Forwarded-For", "192.168.1.100, 10.0.0.1");

			expect(capturedContext?.actorIp).toBe("192.168.1.100");
		});

		it("should initialize actorId and actorEmail as null", async () => {
			const app = express();
			let capturedContext: ReturnType<typeof getAuditContext>;

			app.use(createAuditMiddleware());
			app.get("/test", (_req, res) => {
				capturedContext = getAuditContext();
				res.json({ success: true });
			});

			await request(app).get("/test");

			expect(capturedContext?.actorId).toBeNull();
			expect(capturedContext?.actorEmail).toBeNull();
		});
	});

	describe("createAuditUserMiddleware", () => {
		it("should update context with authenticated user info", async () => {
			const app = express();
			let capturedContext: ReturnType<typeof getAuditContext>;

			// Simulate a request pipeline with audit middleware then user middleware
			app.use(createAuditMiddleware());
			// Simulate authentication by setting orgUser
			app.use((req, _res, next) => {
				(req as unknown as { orgUser: { id: number; email: string } }).orgUser = {
					id: 42,
					email: "user@example.com",
				};
				next();
			});
			app.use(createAuditUserMiddleware());
			app.get("/test", (_req, res) => {
				capturedContext = getAuditContext();
				res.json({ success: true });
			});

			await request(app).get("/test");

			expect(capturedContext?.actorId).toBe(42);
			expect(capturedContext?.actorEmail).toBe("user@example.com");
			expect(capturedContext?.actorType).toBe("user");
		});

		it("should not update context when no orgUser", async () => {
			const app = express();
			let capturedContext: ReturnType<typeof getAuditContext>;

			app.use(createAuditMiddleware());
			app.use(createAuditUserMiddleware());
			app.get("/test", (_req, res) => {
				capturedContext = getAuditContext();
				res.json({ success: true });
			});

			await request(app).get("/test");

			expect(capturedContext?.actorId).toBeNull();
			expect(capturedContext?.actorEmail).toBeNull();
		});
	});

	describe("createSystemActorMiddleware", () => {
		it("should mark actor as system", async () => {
			const app = express();
			let capturedContext: ReturnType<typeof getAuditContext>;

			app.use(createAuditMiddleware());
			app.use(createSystemActorMiddleware());
			app.get("/test", (_req, res) => {
				capturedContext = getAuditContext();
				res.json({ success: true });
			});

			await request(app).get("/test");

			expect(capturedContext?.actorType).toBe("system");
			expect(capturedContext?.actorId).toBeNull();
			expect(capturedContext?.actorEmail).toBeNull();
		});
	});

	describe("createWebhookActorMiddleware", () => {
		it("should mark actor as webhook", async () => {
			const app = express();
			let capturedContext: ReturnType<typeof getAuditContext>;

			app.use(createAuditMiddleware());
			app.use(createWebhookActorMiddleware());
			app.get("/test", (_req, res) => {
				capturedContext = getAuditContext();
				res.json({ success: true });
			});

			await request(app).get("/test");

			expect(capturedContext?.actorType).toBe("webhook");
			expect(capturedContext?.actorId).toBeNull();
			expect(capturedContext?.actorEmail).toBeNull();
		});
	});

	describe("createSchedulerActorMiddleware", () => {
		it("should mark actor as scheduler", async () => {
			const app = express();
			let capturedContext: ReturnType<typeof getAuditContext>;

			app.use(createAuditMiddleware());
			app.use(createSchedulerActorMiddleware());
			app.get("/test", (_req, res) => {
				capturedContext = getAuditContext();
				res.json({ success: true });
			});

			await request(app).get("/test");

			expect(capturedContext?.actorType).toBe("scheduler");
			expect(capturedContext?.actorId).toBeNull();
			expect(capturedContext?.actorEmail).toBeNull();
		});
	});

	describe("context isolation", () => {
		it("should isolate context between concurrent requests", async () => {
			const app = express();
			const capturedContexts: Array<ReturnType<typeof getAuditContext>> = [];

			app.use(createAuditMiddleware());
			app.use((req, _res, next) => {
				(req as unknown as { orgUser: { id: number; email: string } }).orgUser = {
					id: Number(req.query.userId),
					email: `user${req.query.userId}@example.com`,
				};
				next();
			});
			app.use(createAuditUserMiddleware());
			app.get("/test", async (_req, res) => {
				// Simulate async work
				await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
				capturedContexts.push(getAuditContext());
				res.json({ success: true });
			});

			// Make concurrent requests
			await Promise.all([
				request(app).get("/test?userId=1"),
				request(app).get("/test?userId=2"),
				request(app).get("/test?userId=3"),
			]);

			// Each context should have the correct user ID
			const userIds = capturedContexts.map(c => c?.actorId).sort();
			expect(userIds).toEqual([1, 2, 3]);
		});
	});

	describe("middleware without prior audit context", () => {
		it("createAuditUserMiddleware should not throw when called outside audit context", async () => {
			const app = express();

			// Don't use createAuditMiddleware, just use the user middleware directly
			app.use((req, _res, next) => {
				(req as unknown as { orgUser: { id: number; email: string } }).orgUser = {
					id: 1,
					email: "test@example.com",
				};
				next();
			});
			app.use(createAuditUserMiddleware());
			app.get("/test", (_req, res) => {
				res.json({ success: true });
			});

			const response = await request(app).get("/test");

			expect(response.status).toBe(200);
		});

		it("createSystemActorMiddleware should not throw when called outside audit context", async () => {
			const app = express();

			app.use(createSystemActorMiddleware());
			app.get("/test", (_req, res) => {
				res.json({ success: true });
			});

			const response = await request(app).get("/test");

			expect(response.status).toBe(200);
		});

		it("createWebhookActorMiddleware should not throw when called outside audit context", async () => {
			const app = express();

			app.use(createWebhookActorMiddleware());
			app.get("/test", (_req, res) => {
				res.json({ success: true });
			});

			const response = await request(app).get("/test");

			expect(response.status).toBe(200);
		});

		it("createSchedulerActorMiddleware should not throw when called outside audit context", async () => {
			const app = express();

			app.use(createSchedulerActorMiddleware());
			app.get("/test", (_req, res) => {
				res.json({ success: true });
			});

			const response = await request(app).get("/test");

			expect(response.status).toBe(200);
		});
	});
});
