import * as Config from "../config/Config";
import type { UserOrgDao } from "../dao/UserOrgDao";
import type { ActiveUserProvisioningService } from "../services/ActiveUserProvisioningService";
import * as Cookies from "../util/Cookies";
import type { TokenUtil } from "../util/TokenUtil";
import { createTenantSelectionRouter } from "./TenantSelectionRouter";
import express from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/Config", async importOriginal => {
	const original = await importOriginal<typeof import("../config/Config")>();
	return {
		...original,
		getConfig: vi.fn(),
	};
});
vi.mock("../util/Cookies");

describe("TenantSelectionRouter", () => {
	let app: express.Application;
	let mockUserOrgDao: UserOrgDao;
	let mockTokenUtil: TokenUtil<UserInfo>;

	beforeEach(() => {
		vi.clearAllMocks();

		vi.mocked(Config.getConfig).mockReturnValue({
			BASE_DOMAIN: undefined,
			AUTH_EMAILS: "*", // Allow all emails by default in tests
			SUPER_ADMIN_EMAILS: undefined,
		} as never);

		mockUserOrgDao = {
			getUserTenants: vi.fn(),
			setDefaultTenant: vi.fn(),
			updateLastAccessed: vi.fn(),
		} as unknown as UserOrgDao;

		mockTokenUtil = {
			decodePayload: vi.fn(),
			generateToken: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		app = express();
		app.use(express.json());
		app.use(
			"/api/auth",
			createTenantSelectionRouter({
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			}),
		);
	});

	describe("GET /tenants", () => {
		it("should return user tenants", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "http://acme.localhost:8034",
				},
				{
					tenantId: "tenant2",
					orgId: "org2",
					tenantSlug: "widgets",
					tenantName: "Widgets Inc",
					orgSlug: "default",
					orgName: "Default Org",
					role: "member",
					isDefault: false,
					url: "http://widgets.localhost:8034",
					lastAccessedAt: undefined,
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants");

			expect(response.status).toBe(200);
			expect(response.body.tenants).toHaveLength(2);
			expect(response.body.tenants[0].tenantSlug).toBe("acme");
			expect(mockUserOrgDao.getUserTenants).toHaveBeenCalledWith(1);
		});

		it("should include port in URL for localhost with port", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "http://acme.localhost:8034",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants").set("Host", "localhost:7034");

			expect(response.status).toBe(200);
			expect(response.body.tenants[0].url).toContain(":7034");
		});

		it("should not include port in URL for domain names", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "http://acme.localhost:8034",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants").set("Host", "jolli.ai");

			expect(response.status).toBe(200);
			expect(response.body.tenants[0].url).not.toContain(":80");
			expect(response.body.tenants[0].url).not.toContain(":443");
		});

		it("should include port for IP addresses with port", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "http://acme.localhost:8034",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants").set("Host", "192.168.1.100:8080");

			expect(response.status).toBe(200);
			expect(response.body.tenants[0].url).toContain(":8080");
		});

		it("should include port for .local.me domains", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "http://acme.localhost:8034",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants").set("Host", "auth.jolli-local.me:7034");

			expect(response.status).toBe(200);
			expect(response.body.tenants[0].url).toContain(":7034");
		});

		it("should include port for .local domains", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "http://acme.localhost:8034",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants").set("Host", "app.myapp.local:3000");

			expect(response.status).toBe(200);
			expect(response.body.tenants[0].url).toContain(":3000");
		});

		it("should return 401 when user is not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/auth/tenants");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("not_authenticated");
		});

		it("should return 401 when userId is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				email: "test@example.com",
				name: "Test User",
			} as never);

			const response = await request(app).get("/api/auth/tenants");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("not_authenticated");
		});

		it("should return 500 when database query fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/auth/tenants");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /tenants/set-default", () => {
		it("should set default tenant", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.setDefaultTenant).mockResolvedValue();

			const agent = request.agent(app);
			const response = await agent
				.post("/api/auth/tenants/set-default")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockUserOrgDao.setDefaultTenant).toHaveBeenCalledWith(1, "tenant1", "org1");

			// Verify session was updated
			const sessionCookie = response.headers["set-cookie"];
			if (sessionCookie) {
				const followUpResponse = await agent.get("/api/auth/tenants");
				// Session should still exist with the tenant data
				expect(followUpResponse.status).toBe(200);
			}
		});

		it("should return 401 when user is not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app)
				.post("/api/auth/tenants/set-default")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("not_authenticated");
		});

		it("should return 400 when tenantId is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).post("/api/auth/tenants/set-default").send({ orgId: "org1" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_parameters");
		});

		it("should return 400 when orgId is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).post("/api/auth/tenants/set-default").send({ tenantId: "tenant1" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_parameters");
		});

		it("should return 500 when database update fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.setDefaultTenant).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/api/auth/tenants/set-default")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
			expect(response.body.message).toBe("Failed to set default tenant");
		});

		it("should save tenantId and orgId to session when session exists", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.setDefaultTenant).mockResolvedValue();

			// Create app with session middleware
			const session = await import("express-session");
			const appWithSession = express();
			appWithSession.use(express.json());
			appWithSession.use(
				session.default({
					secret: "test-secret",
					resave: false,
					saveUninitialized: true,
				}),
			);
			appWithSession.use(
				"/api/auth",
				createTenantSelectionRouter({
					userOrgDao: mockUserOrgDao,
					tokenUtil: mockTokenUtil,
				}),
			);

			const response = await request(appWithSession)
				.post("/api/auth/tenants/set-default")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});
	});

	describe("POST /tenants/update-access", () => {
		it("should update last accessed timestamp", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

			const response = await request(app)
				.post("/api/auth/tenants/update-access")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockUserOrgDao.updateLastAccessed).toHaveBeenCalledWith(1, "tenant1", "org1");
		});

		it("should return 401 when user is not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app)
				.post("/api/auth/tenants/update-access")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("not_authenticated");
		});

		it("should return 400 when tenantId is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).post("/api/auth/tenants/update-access").send({ orgId: "org1" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_parameters");
		});

		it("should return 400 when orgId is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).post("/api/auth/tenants/update-access").send({ tenantId: "tenant1" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_parameters");
		});

		it("should return 500 when database update fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.updateLastAccessed).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/api/auth/tenants/update-access")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
			expect(response.body.message).toBe("Failed to update tenant access");
		});

		it("should save tenantId and orgId to session when session exists", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

			// Create app with session middleware
			const session = await import("express-session");
			const appWithSession = express();
			appWithSession.use(express.json());
			appWithSession.use(
				session.default({
					secret: "test-secret",
					resave: false,
					saveUninitialized: true,
				}),
			);
			appWithSession.use(
				"/api/auth",
				createTenantSelectionRouter({
					userOrgDao: mockUserOrgDao,
					tokenUtil: mockTokenUtil,
				}),
			);

			const response = await request(appWithSession)
				.post("/api/auth/tenants/update-access")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});
	});

	describe("GET /tenants with BASE_DOMAIN", () => {
		it("should generate multi-tenant URLs when BASE_DOMAIN is configured", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				BASE_DOMAIN: "jolli.ai",
			} as never);

			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "", // Will be overwritten by the router
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants");

			expect(response.status).toBe(200);
			// When BASE_DOMAIN is set (without subdomain feature flag), URL uses path-based format
			expect(response.body.tenants[0].url).toBe("http://jolli.ai/acme/dashboard");
		});
	});

	describe("GET /tenants with feature flags", () => {
		it("should generate custom domain URL when customDomain feature is enabled", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				BASE_DOMAIN: "jolli.ai",
				AUTH_EMAILS: "*",
			} as never);

			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
					primaryDomain: "docs.acme.com",
					featureFlags: { customDomain: true },
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants");

			expect(response.status).toBe(200);
			expect(response.body.tenants[0].url).toBe("https://docs.acme.com/dashboard");
		});

		it("should generate subdomain URL when subdomain feature is enabled", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				BASE_DOMAIN: "jolli.ai",
				AUTH_EMAILS: "*",
			} as never);

			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
					featureFlags: { subdomain: true },
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app).get("/api/auth/tenants");

			expect(response.status).toBe(200);
			expect(response.body.tenants[0].url).toBe("http://acme.jolli.ai/dashboard");
		});
	});

	describe("POST /tenants/select", () => {
		it("should select tenant and regenerate token with tenant context", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("new-jwt-token-with-tenant");
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);
			vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.url).toContain("/dashboard");
			expect(mockTokenUtil.generateToken).toHaveBeenCalledWith({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 1,
				tenantId: "tenant1",
				orgId: "org1",
			});
			expect(Cookies.issueAuthCookie).toHaveBeenCalledWith(expect.anything(), "new-jwt-token-with-tenant");
			expect(mockUserOrgDao.updateLastAccessed).toHaveBeenCalledWith(1, "tenant1", "org1");
		});

		it("should generate multi-tenant URL when BASE_DOMAIN is configured", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				BASE_DOMAIN: "jolli.ai",
				AUTH_EMAILS: "*",
				SUPER_ADMIN_EMAILS: undefined,
			} as never);

			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("new-jwt-token");
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);
			vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.url).toBe("http://jolli.ai/acme/dashboard");
		});

		it("should return 401 when user is not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("not_authenticated");
		});

		it("should return 400 when tenantId is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).post("/api/auth/tenants/select").send({ orgId: "org1" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_parameters");
		});

		it("should return 400 when orgId is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).post("/api/auth/tenants/select").send({ tenantId: "tenant1" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_parameters");
		});

		it("should return 403 when user does not have access to tenant", async () => {
			const mockTenants = [
				{
					tenantId: "other-tenant",
					orgId: "other-org",
					tenantSlug: "other",
					tenantName: "Other Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(403);
			expect(response.body.error).toBe("access_denied");
		});

		it("should return 403 email_not_authorized when email does not match tenant AUTH_EMAILS", async () => {
			// Mock config to restrict emails
			vi.mocked(Config.getConfig).mockReturnValue({
				BASE_DOMAIN: undefined,
				AUTH_EMAILS: ".*@company\\.com$", // Only allow @company.com emails globally
				SUPER_ADMIN_EMAILS: undefined,
			} as never);

			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
					authEmails: ".*@acme\\.com$", // Tenant only allows @acme.com emails
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com", // This email won't match @acme.com
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(403);
			expect(response.body.error).toBe("email_not_authorized");
			expect(response.body.message).toBe("Your email is not authorized for this organization");
		});

		it("should allow email when it matches tenant AUTH_EMAILS", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				BASE_DOMAIN: undefined,
				AUTH_EMAILS: ".*", // Global allows all
				SUPER_ADMIN_EMAILS: undefined,
			} as never);

			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
					authEmails: ".*@acme\\.com$", // Tenant restricts to @acme.com
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "user@acme.com", // This email matches @acme.com
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("new-jwt-token");
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);
			vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should use global AUTH_EMAILS when tenant has no authEmails configured", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				BASE_DOMAIN: undefined,
				AUTH_EMAILS: ".*@allowed\\.com$", // Global restricts to @allowed.com
				SUPER_ADMIN_EMAILS: undefined,
			} as never);

			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
					authEmails: undefined, // Tenant has no authEmails - should fallback to global
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "user@allowed.com", // This email matches global @allowed.com
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("new-jwt-token");
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);
			vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should reject email not matching global AUTH_EMAILS when tenant has no authEmails", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				BASE_DOMAIN: undefined,
				AUTH_EMAILS: ".*@allowed\\.com$", // Global restricts to @allowed.com
				SUPER_ADMIN_EMAILS: undefined,
			} as never);

			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
					authEmails: undefined, // Tenant has no authEmails - should fallback to global
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "user@notallowed.com", // This email does NOT match global @allowed.com
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(403);
			expect(response.body.error).toBe("email_not_authorized");
		});

		it("should return 500 when database query fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockUserOrgDao.getUserTenants).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});

		it("should save tenantId and orgId to session when session exists", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
					url: "",
				},
			];

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("new-jwt-token");
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);
			vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

			// Create app with session middleware
			const session = await import("express-session");
			const appWithSession = express();
			appWithSession.use(express.json());
			appWithSession.use(
				session.default({
					secret: "test-secret",
					resave: false,
					saveUninitialized: true,
				}),
			);
			appWithSession.use(
				"/api/auth",
				createTenantSelectionRouter({
					userOrgDao: mockUserOrgDao,
					tokenUtil: mockTokenUtil,
				}),
			);

			const response = await request(appWithSession)
				.post("/api/auth/tenants/select")
				.send({ tenantId: "tenant1", orgId: "org1" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		describe("active_users auto-creation", () => {
			let mockActiveUserProvisioningService: ActiveUserProvisioningService;
			let appWithMultiTenant: express.Application;

			beforeEach(() => {
				// Setup mocks for multi-tenant mode
				mockActiveUserProvisioningService = {
					isUserInactiveInTenant: vi.fn().mockResolvedValue(false),
					ensureActiveUser: vi.fn(),
				} as unknown as ActiveUserProvisioningService;

				// Create app with multi-tenant dependencies
				appWithMultiTenant = express();
				appWithMultiTenant.use(express.json());
				appWithMultiTenant.use(
					"/api/auth",
					createTenantSelectionRouter({
						userOrgDao: mockUserOrgDao,
						tokenUtil: mockTokenUtil,
						activeUserProvisioningService: mockActiveUserProvisioningService,
					}),
				);
			});

			it("should call ensureActiveUser when service is provided", async () => {
				const mockTenants = [
					{
						tenantId: "tenant1",
						orgId: "org1",
						tenantSlug: "acme",
						tenantName: "Acme Corp",
						orgSlug: "main",
						orgName: "Main Org",
						role: "owner",
						isDefault: true,
						lastAccessedAt: new Date("2025-01-20"),
						url: "",
					},
				];

				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: "https://example.com/avatar.jpg",
				});
				vi.mocked(mockTokenUtil.generateToken).mockReturnValue("new-jwt-token");
				vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);
				vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();
				vi.mocked(mockActiveUserProvisioningService.ensureActiveUser).mockResolvedValue(true);

				const response = await request(appWithMultiTenant)
					.post("/api/auth/tenants/select")
					.send({ tenantId: "tenant1", orgId: "org1" });

				expect(response.status).toBe(200);
				expect(mockActiveUserProvisioningService.ensureActiveUser).toHaveBeenCalledWith({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: "https://example.com/avatar.jpg",
					tenantId: "tenant1",
					orgId: "org1",
					role: "owner",
				});
			});

			it("should continue login even if ensureActiveUser fails", async () => {
				const mockTenants = [
					{
						tenantId: "tenant1",
						orgId: "org1",
						tenantSlug: "acme",
						tenantName: "Acme Corp",
						orgSlug: "main",
						orgName: "Main Org",
						role: "member",
						isDefault: true,
						lastAccessedAt: new Date("2025-01-20"),
						url: "",
					},
				];

				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				vi.mocked(mockTokenUtil.generateToken).mockReturnValue("new-jwt-token");
				vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);
				vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

				// Service throws error
				vi.mocked(mockActiveUserProvisioningService.ensureActiveUser).mockRejectedValue(
					new Error("Service error"),
				);

				const response = await request(appWithMultiTenant)
					.post("/api/auth/tenants/select")
					.send({ tenantId: "tenant1", orgId: "org1" });

				// Login should still succeed
				expect(response.status).toBe(200);
				expect(response.body.success).toBe(true);
			});

			it("should return 403 user_inactive when user is inactive in tenant", async () => {
				const mockTenants = [
					{
						tenantId: "tenant1",
						orgId: "org1",
						tenantSlug: "acme",
						tenantName: "Acme Corp",
						orgSlug: "main",
						orgName: "Main Org",
						role: "member",
						isDefault: true,
						lastAccessedAt: new Date("2025-01-20"),
						url: "",
					},
				];

				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);

				// User is inactive in this tenant/org
				vi.mocked(mockActiveUserProvisioningService.isUserInactiveInTenant).mockResolvedValue(true);

				const response = await request(appWithMultiTenant)
					.post("/api/auth/tenants/select")
					.send({ tenantId: "tenant1", orgId: "org1" });

				expect(response.status).toBe(403);
				expect(response.body.error).toBe("user_inactive");
				expect(response.body.message).toBe("Your account is inactive in this organization");
				// Should NOT generate a token or call ensureActiveUser
				expect(mockTokenUtil.generateToken).not.toHaveBeenCalled();
				expect(mockActiveUserProvisioningService.ensureActiveUser).not.toHaveBeenCalled();
			});

			it("should proceed normally when user is active in tenant", async () => {
				const mockTenants = [
					{
						tenantId: "tenant1",
						orgId: "org1",
						tenantSlug: "acme",
						tenantName: "Acme Corp",
						orgSlug: "main",
						orgName: "Main Org",
						role: "admin",
						isDefault: true,
						lastAccessedAt: new Date("2025-01-20"),
						url: "",
					},
				];

				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				vi.mocked(mockTokenUtil.generateToken).mockReturnValue("new-jwt-token");
				vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue(mockTenants);
				vi.mocked(mockUserOrgDao.updateLastAccessed).mockResolvedValue();

				// User is NOT inactive (default mock returns false)
				vi.mocked(mockActiveUserProvisioningService.isUserInactiveInTenant).mockResolvedValue(false);
				vi.mocked(mockActiveUserProvisioningService.ensureActiveUser).mockResolvedValue(true);

				const response = await request(appWithMultiTenant)
					.post("/api/auth/tenants/select")
					.send({ tenantId: "tenant1", orgId: "org1" });

				expect(response.status).toBe(200);
				expect(response.body.success).toBe(true);
				expect(mockActiveUserProvisioningService.isUserInactiveInTenant).toHaveBeenCalledWith(
					1,
					"tenant1",
					"org1",
				);
				expect(mockActiveUserProvisioningService.ensureActiveUser).toHaveBeenCalled();
			});
		});
	});
});
