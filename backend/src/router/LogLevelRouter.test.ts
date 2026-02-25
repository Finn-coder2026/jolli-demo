import type { LogLevelService } from "../services/LogLevelService";
import { createLogLevelAuthHeaders, createLogLevelRouter } from "./LogLevelRouter";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Logger
vi.mock("../util/Logger", () => ({
	getLog: () => ({
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
	}),
}));

describe("LogLevelRouter", () => {
	const TEST_SECRET = "test-admin-secret-32-chars-long!";
	let app: express.Application;
	let mockLogLevelService: LogLevelService;

	beforeEach(() => {
		// Create mock service
		mockLogLevelService = {
			setGlobalLevel: vi.fn().mockResolvedValue(undefined),
			setModuleLevel: vi.fn().mockResolvedValue(undefined),
			setTenantOrgLevel: vi.fn().mockResolvedValue(undefined),
			setTenantOrgModuleLevel: vi.fn().mockResolvedValue(undefined),
			getState: vi.fn().mockReturnValue({
				global: "info",
				modules: { TestModule: "debug" },
				tenantOrg: { "acme:eng": "trace" },
				tenantOrgModule: { "acme:eng:JobRouter": "debug" },
			}),
			getRegisteredModules: vi.fn().mockReturnValue(["Config", "AppFactory", "TestModule"]),
			close: vi.fn().mockResolvedValue(undefined),
			clearAll: vi.fn().mockResolvedValue(undefined),
			clearTenantOrg: vi.fn().mockResolvedValue(undefined),
		};

		// Create Express app with router
		app = express();
		app.use(express.json());
		app.use(
			"/api/admin/log-level",
			createLogLevelRouter({
				logLevelService: mockLogLevelService,
				adminSecret: TEST_SECRET,
			}),
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("createLogLevelAuthHeaders", () => {
		it("should create valid HMAC auth headers", () => {
			const headers = createLogLevelAuthHeaders("get", "global", TEST_SECRET);

			expect(headers["X-Bootstrap-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
			expect(headers["X-Bootstrap-Timestamp"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});
	});

	describe("GET /api/admin/log-level", () => {
		it("should return current log level state with valid auth", async () => {
			const headers = createLogLevelAuthHeaders("get", "global", TEST_SECRET);

			const response = await request(app)
				.get("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				global: "info",
				modules: { TestModule: "debug" },
				tenantOrg: { "acme:eng": "trace" },
				tenantOrgModule: { "acme:eng:JobRouter": "debug" },
				registeredLoggers: ["Config", "AppFactory", "TestModule"],
			});
		});

		it("should reject request without signature", async () => {
			const response = await request(app).get("/api/admin/log-level");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "invalid_request" });
		});

		it("should reject request with invalid signature", async () => {
			const headers = createLogLevelAuthHeaders("get", "global", "wrong-secret");

			const response = await request(app)
				.get("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"]);

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "invalid_request" });
		});

		it("should reject request with expired timestamp", async () => {
			const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
			const headers = createLogLevelAuthHeaders("get", "global", TEST_SECRET);

			const response = await request(app)
				.get("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", oldTimestamp);

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "invalid_request" });
		});
	});

	describe("POST /api/admin/log-level", () => {
		it("should set global log level", async () => {
			const headers = createLogLevelAuthHeaders("set", "global", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "global", level: "debug" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true, type: "global", level: "debug" });
			expect(mockLogLevelService.setGlobalLevel).toHaveBeenCalledWith("debug");
		});

		it("should set module log level", async () => {
			const headers = createLogLevelAuthHeaders("set", "module", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "module", moduleName: "TestModule", level: "trace" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true, type: "module", moduleName: "TestModule", level: "trace" });
			expect(mockLogLevelService.setModuleLevel).toHaveBeenCalledWith("TestModule", "trace");
		});

		it("should set tenant-org log level", async () => {
			const headers = createLogLevelAuthHeaders("set", "tenant-org", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "tenant-org", tenantSlug: "acme", orgSlug: "engineering", level: "debug" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				type: "tenant-org",
				tenantSlug: "acme",
				orgSlug: "engineering",
				level: "debug",
			});
			expect(mockLogLevelService.setTenantOrgLevel).toHaveBeenCalledWith("acme", "engineering", "debug");
		});

		it("should set tenant-org-module log level", async () => {
			const headers = createLogLevelAuthHeaders("set", "tenant-org-module", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({
					type: "tenant-org-module",
					tenantSlug: "acme",
					orgSlug: "engineering",
					moduleName: "JobRouter",
					level: "trace",
				});

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				type: "tenant-org-module",
				tenantSlug: "acme",
				orgSlug: "engineering",
				moduleName: "JobRouter",
				level: "trace",
			});
			expect(mockLogLevelService.setTenantOrgModuleLevel).toHaveBeenCalledWith(
				"acme",
				"engineering",
				"JobRouter",
				"trace",
			);
		});

		it("should reject invalid log level", async () => {
			const headers = createLogLevelAuthHeaders("set", "global", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "global", level: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid level");
			expect(response.body.validLevels).toEqual(["trace", "debug", "info", "warn", "error", "fatal"]);
		});

		it("should reject missing level", async () => {
			const headers = createLogLevelAuthHeaders("set", "global", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "global" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid level");
		});

		it("should reject module type without moduleName", async () => {
			const headers = createLogLevelAuthHeaders("set", "module", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "module", level: "debug" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("moduleName required for type=module");
		});

		it("should reject tenant-org type without tenantSlug or orgSlug", async () => {
			const headers = createLogLevelAuthHeaders("set", "tenant-org", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "tenant-org", level: "debug" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("tenantSlug and orgSlug required for type=tenant-org");
		});

		it("should reject tenant-org-module type without required fields", async () => {
			const headers = createLogLevelAuthHeaders("set", "tenant-org-module", TEST_SECRET);

			// Missing moduleName
			const response1 = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "tenant-org-module", tenantSlug: "acme", orgSlug: "engineering", level: "debug" });

			expect(response1.status).toBe(400);
			expect(response1.body.error).toBe(
				"tenantSlug, orgSlug, and moduleName required for type=tenant-org-module",
			);

			// Missing tenantSlug
			const headers2 = createLogLevelAuthHeaders("set", "tenant-org-module", TEST_SECRET);
			const response2 = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers2["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers2["X-Bootstrap-Timestamp"])
				.send({ type: "tenant-org-module", orgSlug: "engineering", moduleName: "JobRouter", level: "debug" });

			expect(response2.status).toBe(400);
			expect(response2.body.error).toBe(
				"tenantSlug, orgSlug, and moduleName required for type=tenant-org-module",
			);
		});

		it("should reject invalid type", async () => {
			const headers = createLogLevelAuthHeaders("set", "invalid", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "invalid", level: "debug" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid type");
			expect(response.body.validTypes).toEqual(["global", "module", "tenant-org", "tenant-org-module"]);
		});

		it("should handle service error gracefully", async () => {
			vi.mocked(mockLogLevelService.setGlobalLevel).mockRejectedValue(new Error("Service error"));
			const headers = createLogLevelAuthHeaders("set", "global", TEST_SECRET);

			const response = await request(app)
				.post("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "global", level: "debug" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to set log level");
			expect(response.body.details).toBe("Service error");
		});
	});

	describe("DELETE /api/admin/log-level", () => {
		it("should clear module log level override", async () => {
			const headers = createLogLevelAuthHeaders("clear", "module", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "module", moduleName: "TestModule" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true, type: "module", moduleName: "TestModule", cleared: true });
			expect(mockLogLevelService.setModuleLevel).toHaveBeenCalledWith("TestModule", null);
		});

		it("should clear tenant-org log level override", async () => {
			const headers = createLogLevelAuthHeaders("clear", "tenant-org", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "tenant-org", tenantSlug: "acme", orgSlug: "engineering" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				type: "tenant-org",
				tenantSlug: "acme",
				orgSlug: "engineering",
				cleared: true,
			});
			expect(mockLogLevelService.setTenantOrgLevel).toHaveBeenCalledWith("acme", "engineering", null);
		});

		it("should clear tenant-org-module log level override", async () => {
			const headers = createLogLevelAuthHeaders("clear", "tenant-org-module", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({
					type: "tenant-org-module",
					tenantSlug: "acme",
					orgSlug: "engineering",
					moduleName: "JobRouter",
				});

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				type: "tenant-org-module",
				tenantSlug: "acme",
				orgSlug: "engineering",
				moduleName: "JobRouter",
				cleared: true,
			});
			expect(mockLogLevelService.setTenantOrgModuleLevel).toHaveBeenCalledWith(
				"acme",
				"engineering",
				"JobRouter",
				null,
			);
		});

		it("should reject tenant-org type without required fields", async () => {
			const headers = createLogLevelAuthHeaders("clear", "tenant-org", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "tenant-org" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("tenantSlug and orgSlug required for type=tenant-org");
		});

		it("should reject tenant-org-module type without required fields", async () => {
			const headers = createLogLevelAuthHeaders("clear", "tenant-org-module", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "tenant-org-module", tenantSlug: "acme", orgSlug: "engineering" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("tenantSlug, orgSlug, and moduleName required for type=tenant-org-module");
		});

		it("should reject module type without moduleName", async () => {
			const headers = createLogLevelAuthHeaders("clear", "module", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "module" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("moduleName required for type=module");
		});

		it("should reject global type (cannot be cleared)", async () => {
			const headers = createLogLevelAuthHeaders("clear", "global", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "global" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe(
				"Invalid type for DELETE (only module, tenant-org, and tenant-org-module can be cleared)",
			);
			expect(response.body.validTypes).toEqual(["module", "tenant-org", "tenant-org-module"]);
		});

		it("should handle service error gracefully", async () => {
			vi.mocked(mockLogLevelService.setModuleLevel).mockRejectedValue(new Error("Service error"));
			const headers = createLogLevelAuthHeaders("clear", "module", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
				.send({ type: "module", moduleName: "TestModule" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to clear log level");
			expect(response.body.details).toBe("Service error");
		});
	});

	describe("DELETE /api/admin/log-level/cache", () => {
		it("should clear all log level overrides", async () => {
			const headers = createLogLevelAuthHeaders("clear-cache", "all", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level/cache?type=all")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true, type: "all", cleared: true });
			expect(mockLogLevelService.clearAll).toHaveBeenCalled();
		});

		it("should clear tenant-org log level overrides", async () => {
			const headers = createLogLevelAuthHeaders("clear-cache", "tenant-org", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level/cache?type=tenant-org&tenantSlug=acme&orgSlug=engineering")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				type: "tenant-org",
				tenantSlug: "acme",
				orgSlug: "engineering",
				cleared: true,
			});
			expect(mockLogLevelService.clearTenantOrg).toHaveBeenCalledWith("acme", "engineering");
		});

		it("should reject tenant-org type without tenantSlug or orgSlug", async () => {
			const headers = createLogLevelAuthHeaders("clear-cache", "tenant-org", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level/cache?type=tenant-org")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"]);

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("tenantSlug and orgSlug required for type=tenant-org");
		});

		it("should reject invalid type", async () => {
			const headers = createLogLevelAuthHeaders("clear-cache", "invalid", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level/cache?type=invalid")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"]);

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid type");
			expect(response.body.validTypes).toEqual(["all", "tenant-org"]);
		});

		it("should handle service error gracefully", async () => {
			vi.mocked(mockLogLevelService.clearAll).mockRejectedValue(new Error("Service error"));
			const headers = createLogLevelAuthHeaders("clear-cache", "all", TEST_SECRET);

			const response = await request(app)
				.delete("/api/admin/log-level/cache?type=all")
				.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"]);

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to clear log level cache");
			expect(response.body.details).toBe("Service error");
		});
	});

	describe("Authentication edge cases", () => {
		it("should reject signature without sha256= prefix", async () => {
			const headers = createLogLevelAuthHeaders("get", "global", TEST_SECRET);
			const signatureWithoutPrefix = headers["X-Bootstrap-Signature"].replace("sha256=", "");

			const response = await request(app)
				.get("/api/admin/log-level")
				.set("X-Bootstrap-Signature", signatureWithoutPrefix)
				.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"]);

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "invalid_request" });
		});

		it("should reject signature with wrong length", async () => {
			const response = await request(app)
				.get("/api/admin/log-level")
				.set("X-Bootstrap-Signature", "sha256=tooshort")
				.set("X-Bootstrap-Timestamp", new Date().toISOString());

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "invalid_request" });
		});
	});
});
