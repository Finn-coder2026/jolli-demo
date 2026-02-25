import type { Database } from "../core/Database";
import type { TokenUtil } from "../util/TokenUtil";
import { getTenantContext } from "./TenantContext";
import { createTenantMiddleware, type TenantMiddlewareConfig } from "./TenantMiddleware";
import type { TenantOrgConnectionManager } from "./TenantOrgConnectionManager";
import type { TenantRegistryClient } from "./TenantRegistryClient";
import type { Org, Tenant, UserInfo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockTenant(overrides: Partial<Tenant> = {}): Tenant {
	return {
		id: "tenant-123",
		slug: "test-tenant",
		displayName: "Test Tenant",
		status: "active",
		deploymentType: "shared",
		databaseProviderId: "provider-123",
		configs: {},
		configsUpdatedAt: null,
		featureFlags: {},
		primaryDomain: null,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		provisionedAt: new Date("2024-01-01"),
		...overrides,
	};
}

function createMockOrg(overrides: Partial<Org> = {}): Org {
	return {
		id: "org-123",
		tenantId: "tenant-123",
		slug: "default",
		displayName: "Default Org",
		schemaName: "org_default",
		status: "active",
		isDefault: true,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		...overrides,
	};
}

function createMockDatabase(): Database {
	return {} as Database;
}

interface MockRequest {
	headers: Record<string, string | Array<string> | undefined>;
	cookies?: Record<string, string>;
	hostname?: string;
	protocol?: string;
	originalUrl?: string;
	path?: string;
	url?: string;
}

interface MockResponse {
	status: ReturnType<typeof vi.fn>;
	json: ReturnType<typeof vi.fn>;
}

function createMockRequest(
	headers: Record<string, string> = {},
	hostname?: string,
	options?: {
		protocol?: string;
		originalUrl?: string;
		path?: string;
		url?: string;
		cookies?: Record<string, string>;
	},
): MockRequest {
	const request: MockRequest = { headers };
	if (hostname !== undefined) {
		request.hostname = hostname;
	}
	if (options?.protocol) {
		request.protocol = options.protocol;
	}
	if (options?.originalUrl) {
		request.originalUrl = options.originalUrl;
	}
	if (options?.cookies) {
		request.cookies = options.cookies;
	}
	// Default path and url to "/" if not provided
	request.path = options?.path ?? "/";
	request.url = options?.url ?? "/";
	return request;
}

function createMockResponse(): MockResponse {
	const res = {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
		clearCookie: vi.fn().mockReturnThis(),
	};
	return res;
}

describe("TenantMiddleware", () => {
	let registryClient: TenantRegistryClient;
	let connectionManager: TenantOrgConnectionManager;
	let config: TenantMiddlewareConfig;
	let mockDatabase: Database;

	beforeEach(() => {
		mockDatabase = createMockDatabase();

		registryClient = {
			getTenant: vi.fn(),
			getTenantBySlug: vi.fn(),
			getTenantByDomain: vi.fn(),
			getTenantDatabaseConfig: vi.fn(),
			listTenants: vi.fn(),
			listTenantsWithDefaultOrg: vi.fn(),
			listAllActiveTenants: vi.fn(),
			getOrg: vi.fn(),
			getOrgBySlug: vi.fn(),
			getDefaultOrg: vi.fn(),
			listOrgs: vi.fn(),
			listAllActiveOrgs: vi.fn(),
			getTenantOrgByInstallationId: vi.fn(),
			createInstallationMapping: vi.fn(),
			ensureInstallationMapping: vi.fn(),
			deleteInstallationMapping: vi.fn(),
			close: vi.fn(),
		};

		connectionManager = {
			getConnection: vi.fn().mockResolvedValue(mockDatabase),
			evictConnection: vi.fn(),
			closeAll: vi.fn(),
			getCacheSize: vi.fn(),
			evictExpired: vi.fn(),
			checkAllConnectionsHealth: vi.fn(),
		};

		config = {
			registryClient,
			connectionManager,
		};
	});

	describe("header resolution", () => {
		it("returns 401 when tenant cannot be determined and no auth credentials present", async () => {
			const middleware = createTenantMiddleware(config);
			const req = createMockRequest();
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ error: "Not authorized" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 404 when tenant cannot be determined but auth credentials present", async () => {
			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({}, undefined, { cookies: { authToken: "some-token" } });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: "Unable to determine tenant from URL" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 404 when tenant cannot be determined but Authorization header present", async () => {
			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ authorization: "Bearer some-token" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: "Unable to determine tenant from URL" });
			expect(next).not.toHaveBeenCalled();
		});

		it("uses header resolution when subdomain resolution fails", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				tenantHeader: "x-custom-tenant",
				orgHeader: "x-custom-org",
			};
			const middleware = createTenantMiddleware(customConfig);
			// No baseDomain configured, so subdomain resolution won't work
			const req = createMockRequest({ "x-custom-tenant": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("test-tenant");
			expect(next).toHaveBeenCalled();
		});
	});

	describe("authGatewayOrigin redirects", () => {
		it("includes redirectTo in 404 error when authGatewayOrigin is configured and tenant not found", async () => {
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const gatewayConfig: TenantMiddlewareConfig = {
				...config,
				authGatewayOrigin: "https://admin.jolli.app",
			};
			const middleware = createTenantMiddleware(gatewayConfig);
			const req = createMockRequest({ "x-tenant-slug": "unknown-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({
				error: "Tenant not found: unknown-tenant",
				redirectTo: "https://admin.jolli.app/login",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 401 when authGatewayOrigin is configured but no resolution and no auth", async () => {
			const gatewayConfig: TenantMiddlewareConfig = {
				...config,
				authGatewayOrigin: "https://admin.jolli.app",
			};
			const middleware = createTenantMiddleware(gatewayConfig);
			// No headers, no subdomain, no auth → 401 takes priority
			const req = createMockRequest();
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ error: "Not authorized" });
			expect(next).not.toHaveBeenCalled();
		});

		it("includes redirectTo in 404 when authGatewayOrigin configured and auth credentials present", async () => {
			const gatewayConfig: TenantMiddlewareConfig = {
				...config,
				authGatewayOrigin: "https://admin.jolli.app",
			};
			const middleware = createTenantMiddleware(gatewayConfig);
			// Has auth cookie but no tenant resolution
			const req = createMockRequest({}, undefined, { cookies: { authToken: "some-token" } });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({
				error: "Unable to determine tenant from URL",
				redirectTo: "https://admin.jolli.app/login",
			});
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("tenant resolution", () => {
		it("returns 404 when tenant not found", async () => {
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "unknown-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("unknown-tenant");
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: "Tenant not found: unknown-tenant" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 403 when tenant is not active", async () => {
			const suspendedTenant = createMockTenant({ status: "suspended" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(suspendedTenant);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({ error: "Tenant is not active: test-tenant" });
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("org resolution", () => {
		it("uses default org when org header not provided", async () => {
			const tenant = createMockTenant();
			const defaultOrg = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(defaultOrg);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getDefaultOrg).toHaveBeenCalledWith("tenant-123");
			expect(registryClient.getOrgBySlug).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalled();
		});

		it("looks up org by slug when org header provided", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ slug: "engineering" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrgBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({
				"x-tenant-slug": "test-tenant",
				"x-org-slug": "engineering",
			});
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getOrgBySlug).toHaveBeenCalledWith("tenant-123", "engineering");
			expect(registryClient.getDefaultOrg).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalled();
		});

		it("returns 404 when org not found", async () => {
			const tenant = createMockTenant();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrgBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({
				"x-tenant-slug": "test-tenant",
				"x-org-slug": "unknown-org",
			});
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: "Org not found: unknown-org" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 404 when no default org exists", async () => {
			const tenant = createMockTenant();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: "Org not found: default" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 403 when org is not active", async () => {
			const tenant = createMockTenant();
			const suspendedOrg = createMockOrg({ status: "suspended" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(suspendedOrg);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({ error: "Org is not active: default" });
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("connection management", () => {
		it("gets connection from connection manager", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(connectionManager.getConnection).toHaveBeenCalledWith(tenant, org);
			expect(next).toHaveBeenCalled();
		});
	});

	describe("context propagation", () => {
		it("sets tenant context for request handler", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			expect(capturedContext).toBeDefined();
			expect(capturedContext?.tenant.id).toBe("tenant-123");
			expect(capturedContext?.org.id).toBe("org-123");
			expect(capturedContext?.schemaName).toBe("org_default");
			expect(capturedContext?.database).toBe(mockDatabase);
		});

		it("context is not available after middleware completes", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Context should not be available outside the middleware chain
			expect(getTenantContext()).toBeUndefined();
		});
	});

	describe("custom domain resolution", () => {
		it("resolves tenant via custom domain when baseDomain is configured", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantByDomain as ReturnType<typeof vi.fn>).mockResolvedValue({ tenant, org });

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "docs.acme.com");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantByDomain).toHaveBeenCalledWith("docs.acme.com");
			expect(registryClient.getTenantBySlug).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalled();
		});

		it("extracts tenant from subdomain of baseDomain", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantByDomain).not.toHaveBeenCalled();
			// Should extract "acme" from the subdomain, not use headers
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			expect(registryClient.getDefaultOrg).toHaveBeenCalled();
			expect(next).toHaveBeenCalled();
		});

		it("returns 401 for bare baseDomain without path and no auth credentials", async () => {
			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			// Access bare base domain without any tenant in path and no auth
			const req = createMockRequest({}, "jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// No auth credentials → 401 (user needs to login)
			expect(res.status).toHaveBeenCalledWith(401);
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 404 for bare baseDomain without path when auth credentials present", async () => {
			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			// Access bare base domain with auth but no tenant in path
			const req = createMockRequest({}, "jolli.app", { cookies: { authToken: "some-token" } });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Has auth but no tenant specified → 404 (tenant not found)
			expect(res.status).toHaveBeenCalledWith(404);
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 404 when custom domain is not verified", async () => {
			(registryClient.getTenantByDomain as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "unverified.example.com");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: "Custom domain not configured: unverified.example.com" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 403 when org is not active for custom domain", async () => {
			const tenant = createMockTenant();
			const suspendedOrg = createMockOrg({ status: "suspended" });
			(registryClient.getTenantByDomain as ReturnType<typeof vi.fn>).mockResolvedValue({
				tenant,
				org: suspendedOrg,
			});

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "docs.acme.com");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({ error: "Org is not active: default" });
			expect(next).not.toHaveBeenCalled();
		});

		it("sets tenant context for custom domain request", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantByDomain as ReturnType<typeof vi.fn>).mockResolvedValue({ tenant, org });

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "docs.acme.com");
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			expect(capturedContext).toBeDefined();
			expect(capturedContext?.tenant.id).toBe("tenant-123");
			expect(capturedContext?.org.id).toBe("org-123");
		});

		it("lowercases custom domain before lookup", async () => {
			(registryClient.getTenantByDomain as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "Docs.ACME.com");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantByDomain).toHaveBeenCalledWith("docs.acme.com");
		});

		it("uses header resolution when no baseDomain is configured", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			// No baseDomain configured
			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" }, "docs.acme.com");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should skip custom domain check and use headers
			expect(registryClient.getTenantByDomain).not.toHaveBeenCalled();
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("test-tenant");
			expect(next).toHaveBeenCalled();
		});

		it("uses headers.host when hostname is not available", async () => {
			(registryClient.getTenantByDomain as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({ host: "docs.acme.com:3000" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantByDomain).toHaveBeenCalledWith("docs.acme.com");
		});

		it("falls back to header resolution when no hostname or host header available", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			// No hostname and no host header - should fall back to header-based resolution
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should not attempt custom domain lookup since no host found
			expect(registryClient.getTenantByDomain).not.toHaveBeenCalled();
			// Should use header resolution
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("test-tenant");
			expect(next).toHaveBeenCalled();
		});
	});

	describe("subdomain resolution", () => {
		it("extracts tenant and org from nested subdomain (org.tenant.baseDomain)", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg({ slug: "engineering" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrgBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "engineering.acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			expect(registryClient.getOrgBySlug).toHaveBeenCalledWith("tenant-123", "engineering");
			expect(registryClient.getDefaultOrg).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalled();
		});

		it("handles deeply nested subdomains (a.b.c.baseDomain → tenant=c, org=b)", async () => {
			const tenant = createMockTenant({ slug: "c" });
			const org = createMockOrg({ slug: "b" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrgBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "a.b.c.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should use last two parts: tenant="c", org="b"
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("c");
			expect(registryClient.getOrgBySlug).toHaveBeenCalledWith("tenant-123", "b");
			expect(next).toHaveBeenCalled();
		});

		it("lowercases subdomain for tenant lookup", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "ACME.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			expect(next).toHaveBeenCalled();
		});

		it("uses x-org-slug header to override org when subdomain resolves only tenant", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg({ slug: "engineering", schemaName: "org_engineering" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrgBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			// Subdomain only has tenant (acme.jolli.app), but x-org-slug header provides org
			const req = createMockRequest({ "x-org-slug": "engineering" }, "acme.jolli.app");
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			// Should use tenant from subdomain
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			// Should use org from x-org-slug header, not default org
			expect(registryClient.getOrgBySlug).toHaveBeenCalledWith("tenant-123", "engineering");
			expect(registryClient.getDefaultOrg).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalled();
			// Verify context has the correct org
			expect(capturedContext?.org.slug).toBe("engineering");
			expect(capturedContext?.schemaName).toBe("org_engineering");
		});

		it("uses default org when subdomain has no org and no x-org-slug header", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const defaultOrg = createMockOrg({ slug: "default", isDefault: true });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(defaultOrg);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			// Subdomain only has tenant, no org header
			const req = createMockRequest({}, "acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			expect(registryClient.getDefaultOrg).toHaveBeenCalledWith("tenant-123");
			expect(registryClient.getOrgBySlug).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalled();
		});

		it("subdomain org takes precedence over x-org-slug header", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg({ slug: "engineering" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrgBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			// Both subdomain org (engineering.acme.jolli.app) and header (marketing) present
			// Subdomain org should take precedence
			const req = createMockRequest({ "x-org-slug": "marketing" }, "engineering.acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should use org from subdomain, not header
			expect(registryClient.getOrgBySlug).toHaveBeenCalledWith("tenant-123", "engineering");
			expect(next).toHaveBeenCalled();
		});

		it("subdomain takes precedence over x-tenant-slug header", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			// Both subdomain and header present - subdomain should win
			const req = createMockRequest({ "x-tenant-slug": "other-tenant" }, "acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should use subdomain "acme", not header "other-tenant"
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			expect(next).toHaveBeenCalled();
		});

		it("falls back to header when no baseDomain configured and host present", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			// No baseDomain configured - subdomain resolution won't work
			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" }, "localhost");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should fall back to header resolution
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("test-tenant");
			expect(next).toHaveBeenCalled();
		});

		it("returns 404 when subdomain tenant not found", async () => {
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "unknown.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("unknown");
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: "Tenant not found: unknown" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 404 when subdomain org not found", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrgBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "unknown-org.acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			expect(registryClient.getOrgBySlug).toHaveBeenCalledWith("tenant-123", "unknown-org");
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: "Org not found: unknown-org" });
			expect(next).not.toHaveBeenCalled();
		});

		it("uses headers.host for subdomain resolution when hostname is not available", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			// No req.hostname, but host header is present with port
			const req = createMockRequest({ host: "acme.jolli.app:3000" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			expect(next).toHaveBeenCalled();
		});

		it("sets tenant context for subdomain request", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg({ slug: "engineering" });
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrgBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "engineering.acme.jolli.app");
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			expect(capturedContext).toBeDefined();
			expect(capturedContext?.tenant.slug).toBe("acme");
			expect(capturedContext?.org.slug).toBe("engineering");
		});
	});

	describe("error handling", () => {
		it("returns 500 on unexpected error", async () => {
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("Database connection failed"),
			);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 500 when connection manager fails", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);
			(connectionManager.getConnection as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("Connection pool exhausted"),
			);

			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("JWT resolution", () => {
		let tokenUtil: TokenUtil<UserInfo>;

		beforeEach(() => {
			tokenUtil = {
				decodePayload: vi.fn(),
				generateToken: vi.fn(),
				decodePayloadFromToken: vi.fn(),
			};
		});

		it("resolves tenant from JWT when tenantId and orgId are present", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "tenant-123",
				orgId: "org-123",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
			};
			const middleware = createTenantMiddleware(jwtConfig);
			const req = createMockRequest();
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			expect(tokenUtil.decodePayload).toHaveBeenCalled();
			expect(registryClient.getTenant).toHaveBeenCalledWith("tenant-123");
			expect(registryClient.getOrg).toHaveBeenCalledWith("org-123");
			expect(next).toHaveBeenCalled();
			expect(capturedContext?.tenant.id).toBe("tenant-123");
			expect(capturedContext?.org.id).toBe("org-123");
		});

		it("returns 403 with redirectTo when JWT tenant differs from subdomain tenant", async () => {
			const jwtTenant = createMockTenant({ id: "jwt-tenant-id", slug: "jwt-tenant" });
			const jwtOrg = createMockOrg({ id: "jwt-org-id", tenantId: "jwt-tenant-id" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "jwt-tenant-id",
				orgId: "jwt-org-id",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(jwtTenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(jwtOrg);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			// Request has subdomain for different tenant
			const req = createMockRequest({}, "other-tenant.jolli.app", {
				protocol: "https",
				originalUrl: "/api/test",
			});
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should return 403 with redirectTo to correct tenant domain
			// Free tier (no feature flags) → path-based URL
			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({
				error: "tenant_mismatch",
				// Backend returns only the tenant origin, frontend appends the path
				redirectTo: "https://jolli.app/jwt-tenant",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("proceeds normally when JWT tenant matches subdomain tenant", async () => {
			const tenant = createMockTenant({ id: "tenant-123", slug: "acme" });
			const org = createMockOrg({ id: "org-123", tenantId: "tenant-123" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "tenant-123",
				orgId: "org-123",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			// Request has same tenant in subdomain as JWT
			const req = createMockRequest({}, "acme.jolli.app");
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			// Should proceed normally
			expect(next).toHaveBeenCalled();
			expect(capturedContext?.tenant.slug).toBe("acme");
			expect(res.status).not.toHaveBeenCalled();
		});

		it("redirects to custom domain when JWT tenant has primaryDomain", async () => {
			const jwtTenant = createMockTenant({
				id: "jwt-tenant-id",
				slug: "jwt-tenant",
				primaryDomain: "docs.acme.com",
				featureFlags: { customDomain: true },
			});
			const jwtOrg = createMockOrg({ id: "jwt-org-id", tenantId: "jwt-tenant-id" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "jwt-tenant-id",
				orgId: "jwt-org-id",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(jwtTenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(jwtOrg);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			// Request has subdomain for different tenant
			const req = createMockRequest({}, "other-tenant.jolli.app", {
				protocol: "https",
				originalUrl: "/dashboard",
			});
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should redirect to custom domain origin (frontend appends path)
			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({
				error: "tenant_mismatch",
				redirectTo: "https://docs.acme.com",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("redirects to subdomain URL when JWT tenant has subdomain feature enabled", async () => {
			const jwtTenant = createMockTenant({
				id: "jwt-tenant-id",
				slug: "jwt-tenant",
				featureFlags: { subdomain: true },
			});
			const jwtOrg = createMockOrg({ id: "jwt-org-id", tenantId: "jwt-tenant-id" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "jwt-tenant-id",
				orgId: "jwt-org-id",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(jwtTenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(jwtOrg);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			// Request has subdomain for different tenant
			const req = createMockRequest({}, "other-tenant.jolli.app", {
				protocol: "https",
				originalUrl: "/api/test",
			});
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should redirect to subdomain URL without API path (frontend appends page path)
			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({
				error: "tenant_mismatch",
				redirectTo: "https://jwt-tenant.jolli.app",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 403 with redirectTo when accessing wrong custom domain", async () => {
			const jwtTenant = createMockTenant({
				id: "jwt-tenant-id",
				slug: "jwt-tenant",
				primaryDomain: "docs.acme.com",
				featureFlags: { customDomain: true },
			});
			const jwtOrg = createMockOrg({ id: "jwt-org-id", tenantId: "jwt-tenant-id" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "jwt-tenant-id",
				orgId: "jwt-org-id",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(jwtTenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(jwtOrg);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			// Request is for a different custom domain
			const req = createMockRequest({}, "docs.other.com", { protocol: "https", originalUrl: "/api/data" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should redirect to correct custom domain
			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({
				error: "tenant_mismatch",
				// Backend returns only the tenant origin, frontend appends the path
				redirectTo: "https://docs.acme.com",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("proceeds normally when JWT tenant matches custom domain", async () => {
			const jwtTenant = createMockTenant({
				id: "jwt-tenant-id",
				slug: "jwt-tenant",
				primaryDomain: "docs.acme.com",
			});
			const jwtOrg = createMockOrg({ id: "jwt-org-id", tenantId: "jwt-tenant-id" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "jwt-tenant-id",
				orgId: "jwt-org-id",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(jwtTenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(jwtOrg);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			// Request is for the correct custom domain
			const req = createMockRequest({}, "docs.acme.com");
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			// Should proceed normally
			expect(next).toHaveBeenCalled();
			expect(capturedContext?.tenant.slug).toBe("jwt-tenant");
			expect(res.status).not.toHaveBeenCalled();
		});

		it("skips mismatch check when baseDomain is not configured", async () => {
			const jwtTenant = createMockTenant({ id: "jwt-tenant-id", slug: "jwt-tenant" });
			const jwtOrg = createMockOrg({ id: "jwt-org-id", tenantId: "jwt-tenant-id" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "jwt-tenant-id",
				orgId: "jwt-org-id",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(jwtTenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(jwtOrg);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				// No baseDomain configured
			};
			const middleware = createTenantMiddleware(jwtConfig);
			const req = createMockRequest({}, "any-domain.com");
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			// Should proceed normally (no subdomain resolution possible without baseDomain)
			expect(next).toHaveBeenCalled();
			expect(capturedContext?.tenant.slug).toBe("jwt-tenant");
			expect(res.status).not.toHaveBeenCalled();
		});

		it("falls back to subdomain when JWT has no tenantId", async () => {
			const tenant = createMockTenant({ slug: "acme" });
			const org = createMockOrg();
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				// No tenantId/orgId
			});
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			const req = createMockRequest({}, "acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should fall back to subdomain resolution
			expect(registryClient.getTenant).not.toHaveBeenCalled();
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("acme");
			expect(next).toHaveBeenCalled();
		});

		it("returns 401 when JWT tenant not found (deleted)", async () => {
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "nonexistent-tenant",
				orgId: "org-123",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			const req = createMockRequest({}, "acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should return 401 session_invalid instead of falling back
			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ error: "session_invalid" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 401 when JWT org not found (deleted)", async () => {
			const jwtTenant = createMockTenant({ id: "jwt-tenant-id" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "jwt-tenant-id",
				orgId: "nonexistent-org",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(jwtTenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(jwtConfig);
			const req = createMockRequest({}, "acme.jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should return 401 session_invalid instead of falling back
			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ error: "session_invalid" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 401 when org does not belong to tenant", async () => {
			const tenant = createMockTenant({ id: "tenant-123" });
			const org = createMockOrg({ id: "org-456", tenantId: "different-tenant" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "tenant-123",
				orgId: "org-456",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
			};
			const middleware = createTenantMiddleware(jwtConfig);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should return 401 session_invalid instead of falling back
			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ error: "session_invalid" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 403 when JWT tenant is not active", async () => {
			const suspendedTenant = createMockTenant({ status: "suspended" });
			const org = createMockOrg();
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "tenant-123",
				orgId: "org-123",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(suspendedTenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
			};
			const middleware = createTenantMiddleware(jwtConfig);
			const req = createMockRequest();
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({ error: "Tenant is not active: test-tenant" });
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 403 when JWT org is not active", async () => {
			const tenant = createMockTenant();
			const suspendedOrg = createMockOrg({ status: "suspended" });
			(tokenUtil.decodePayload as ReturnType<typeof vi.fn>).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				tenantId: "tenant-123",
				orgId: "org-123",
			});
			(registryClient.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getOrg as ReturnType<typeof vi.fn>).mockResolvedValue(suspendedOrg);

			const jwtConfig: TenantMiddlewareConfig = {
				...config,
				tokenUtil,
			};
			const middleware = createTenantMiddleware(jwtConfig);
			const req = createMockRequest();
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({ error: "Org is not active: default" });
			expect(next).not.toHaveBeenCalled();
		});

		it("skips JWT resolution when tokenUtil is not configured", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			// No tokenUtil in config
			const middleware = createTenantMiddleware(config);
			const req = createMockRequest({ "x-tenant-slug": "test-tenant" });
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			// Should use header resolution directly
			expect(registryClient.getTenant).not.toHaveBeenCalled();
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("test-tenant");
			expect(next).toHaveBeenCalled();
		});
	});
});
