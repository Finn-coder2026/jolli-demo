import {
	createInitialAuditContext,
	getAuditContext,
	requireAuditContext,
	runWithAuditContext,
	updateAuditContextActor,
} from "./AuditContext";
import type { Request } from "express";
import { describe, expect, it } from "vitest";

describe("AuditContext", () => {
	describe("createInitialAuditContext", () => {
		it("should create context from request with IP from x-forwarded-for", () => {
			const req = {
				headers: {
					"x-forwarded-for": "192.168.1.1, 10.0.0.1",
					"user-agent": "Mozilla/5.0 Test",
					"x-request-id": "req-123",
				},
				ip: "127.0.0.1",
				method: "POST",
				originalUrl: "/api/test",
			} as unknown as Request;

			const context = createInitialAuditContext(req);

			expect(context.actorIp).toBe("192.168.1.1");
			expect(context.actorDevice).toBe("Mozilla/5.0 Test");
			expect(context.httpMethod).toBe("POST");
			expect(context.endpoint).toBe("/api/test");
			expect(context.requestId).toBe("req-123");
			expect(context.actorType).toBe("user");
		});

		it("should use req.ip when x-forwarded-for is not present", () => {
			const req = {
				headers: {
					"user-agent": "Test Agent",
				},
				ip: "10.0.0.5",
				method: "GET",
				originalUrl: "/api/docs",
			} as unknown as Request;

			const context = createInitialAuditContext(req);

			expect(context.actorIp).toBe("10.0.0.5");
		});

		it("should use socket.remoteAddress as fallback", () => {
			const req = {
				headers: {},
				ip: undefined,
				socket: { remoteAddress: "172.16.0.1" },
				method: "DELETE",
				originalUrl: "/api/users",
			} as unknown as Request;

			const context = createInitialAuditContext(req);

			expect(context.actorIp).toBe("172.16.0.1");
		});

		it("should handle array x-forwarded-for header", () => {
			const req = {
				headers: {
					"x-forwarded-for": ["192.168.1.1", "10.0.0.1"],
				},
				ip: "127.0.0.1",
				method: "GET",
				originalUrl: "/test",
			} as unknown as Request;

			const context = createInitialAuditContext(req);

			expect(context.actorIp).toBe("192.168.1.1");
		});

		it("should initialize with null actor info", () => {
			const req = {
				headers: {},
				method: "GET",
				originalUrl: "/test",
			} as unknown as Request;

			const context = createInitialAuditContext(req);

			expect(context.actorId).toBeNull();
			expect(context.actorEmail).toBeNull();
		});
	});

	describe("runWithAuditContext", () => {
		it("should provide context within callback", () => {
			const context = {
				actorId: 1,
				actorType: "user" as const,
				actorEmail: "test@example.com",
				actorIp: "127.0.0.1",
				actorDevice: null,
				httpMethod: "POST",
				endpoint: "/api/test",
				requestId: "test-req-1",
			};

			const result = runWithAuditContext(context, () => {
				const retrieved = getAuditContext();
				return retrieved?.actorId;
			});

			expect(result).toBe(1);
		});

		it("should isolate context between calls", async () => {
			const context1 = {
				actorId: 1,
				actorType: "user" as const,
				actorEmail: "user1@test.com",
				actorIp: "192.168.1.1",
				actorDevice: null,
				httpMethod: "GET",
				endpoint: "/api/a",
				requestId: "req-1",
			};

			const context2 = {
				actorId: 2,
				actorType: "user" as const,
				actorEmail: "user2@test.com",
				actorIp: "192.168.1.2",
				actorDevice: null,
				httpMethod: "POST",
				endpoint: "/api/b",
				requestId: "req-2",
			};

			const [result1, result2] = await Promise.all([
				runWithAuditContext(context1, () => getAuditContext()?.actorId),
				runWithAuditContext(context2, () => getAuditContext()?.actorId),
			]);

			expect(result1).toBe(1);
			expect(result2).toBe(2);
		});

		it("should support async callbacks", async () => {
			const context = {
				actorId: 99,
				actorType: "system" as const,
				actorEmail: null,
				actorIp: null,
				actorDevice: null,
				httpMethod: "GET",
				endpoint: "/system",
				requestId: "system-req",
			};

			const result = await runWithAuditContext(context, async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
				return getAuditContext()?.actorId;
			});

			expect(result).toBe(99);
		});
	});

	describe("getAuditContext", () => {
		it("should return undefined outside of context", () => {
			const context = getAuditContext();
			expect(context).toBeUndefined();
		});
	});

	describe("requireAuditContext", () => {
		it("should throw when no context", () => {
			expect(() => requireAuditContext()).toThrow("Audit context not initialized");
		});

		it("should return context when available", () => {
			const context = {
				actorId: 5,
				actorType: "webhook" as const,
				actorEmail: null,
				actorIp: "10.0.0.1",
				actorDevice: null,
				httpMethod: "POST",
				endpoint: "/webhook",
				requestId: "webhook-123",
			};

			const result = runWithAuditContext(context, () => {
				const ctx = requireAuditContext();
				return ctx.actorType;
			});

			expect(result).toBe("webhook");
		});
	});

	describe("updateAuditContextActor", () => {
		it("should update actor information in context", () => {
			const initialContext = {
				actorId: null,
				actorType: "user" as const,
				actorEmail: null,
				actorIp: "127.0.0.1",
				actorDevice: "Test Browser",
				httpMethod: "POST",
				endpoint: "/api/login",
				requestId: "test-123",
			};

			const result = runWithAuditContext(initialContext, () => {
				updateAuditContextActor({ actorId: 42, actorEmail: "user@example.com" });
				return getAuditContext();
			});

			expect(result?.actorId).toBe(42);
			expect(result?.actorEmail).toBe("user@example.com");
		});

		it("should not throw when no context available", () => {
			// Should not throw
			expect(() => updateAuditContextActor({ actorId: 1, actorEmail: "test@test.com" })).not.toThrow();
		});
	});
});
