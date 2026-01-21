import type { Database } from "../core/Database";
import { getTenantContext } from "./TenantContext";
import { createTenantMiddleware, type TenantMiddlewareConfig } from "./TenantMiddleware";
import type { TenantOrgConnectionManager } from "./TenantOrgConnectionManager";
import type { TenantRegistryClient } from "./TenantRegistryClient";
import type { Org, Tenant } from "jolli-common";
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
	hostname?: string;
}

interface MockResponse {
	status: ReturnType<typeof vi.fn>;
	json: ReturnType<typeof vi.fn>;
}

function createMockRequest(headers: Record<string, string> = {}, hostname?: string): MockRequest {
	const request: MockRequest = { headers };
	if (hostname !== undefined) {
		request.hostname = hostname;
	}
	return request;
}

function createMockResponse(): MockResponse {
	const res = {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
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
			listAllActiveTenants: vi.fn(),
			getOrg: vi.fn(),
			getOrgBySlug: vi.fn(),
			getDefaultOrg: vi.fn(),
			listOrgs: vi.fn(),
			listAllActiveOrgs: vi.fn(),
			getTenantOrgByInstallationId: vi.fn(),
			createInstallationMapping: vi.fn(),
			deleteInstallationMapping: vi.fn(),
			close: vi.fn(),
		};

		connectionManager = {
			getConnection: vi.fn().mockResolvedValue(mockDatabase),
			evictConnection: vi.fn(),
			closeAll: vi.fn(),
			getCacheSize: vi.fn(),
			evictExpired: vi.fn(),
		};

		config = {
			registryClient,
			connectionManager,
			defaultDatabase: mockDatabase,
		};
	});

	describe("header resolution", () => {
		it("returns 404 when tenant cannot be determined from URL or headers", async () => {
			const middleware = createTenantMiddleware(config);
			const req = createMockRequest();
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

		it("uses 'jolli' as tenant slug for baseDomain itself", async () => {
			const tenant = createMockTenant({ slug: "jolli" });
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "jolli.app",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "jolli.app");
			const res = createMockResponse();
			const next = vi.fn();

			await middleware(req as never, res as never, next);

			expect(registryClient.getTenantByDomain).not.toHaveBeenCalled();
			// Should use "jolli" as tenant slug for bare baseDomain
			expect(registryClient.getTenantBySlug).toHaveBeenCalledWith("jolli");
			expect(next).toHaveBeenCalled();
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

	describe("jolli tenant fallback", () => {
		it("uses default database when jolli tenant not in registry and accessing base domain", async () => {
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "dougschroeder.dev",
			};
			const middleware = createTenantMiddleware(customConfig);
			// Access the base domain directly (no subdomain)
			const req = createMockRequest({}, "dougschroeder.dev");
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			// Should NOT return 404
			expect(res.status).not.toHaveBeenCalled();
			// Should call next (proceed with default database)
			expect(next).toHaveBeenCalled();
			// Should have tenant context with default jolli tenant
			expect(capturedContext).toBeDefined();
			expect(capturedContext?.tenant.slug).toBe("jolli");
			expect(capturedContext?.tenant.id).toBe("00000000-0000-0000-0000-000000000000");
			expect(capturedContext?.org.slug).toBe("default");
			expect(capturedContext?.org.id).toBe("00000000-0000-0000-0000-000000000001");
			expect(capturedContext?.database).toBe(mockDatabase);
		});

		it("uses registry tenant when jolli tenant IS in registry", async () => {
			const tenant = createMockTenant({ id: "registry-jolli", slug: "jolli" });
			const org = createMockOrg();
			(registryClient.getTenantBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(tenant);
			(registryClient.getDefaultOrg as ReturnType<typeof vi.fn>).mockResolvedValue(org);

			const customConfig: TenantMiddlewareConfig = {
				...config,
				baseDomain: "dougschroeder.dev",
			};
			const middleware = createTenantMiddleware(customConfig);
			const req = createMockRequest({}, "dougschroeder.dev");
			const res = createMockResponse();

			let capturedContext: ReturnType<typeof getTenantContext> | undefined;
			const next = vi.fn(() => {
				capturedContext = getTenantContext();
			});

			await middleware(req as never, res as never, next);

			// Should use the registry tenant, not the default
			expect(capturedContext?.tenant.id).toBe("registry-jolli");
			// Should have called connectionManager for registry tenant
			expect(connectionManager.getConnection).toHaveBeenCalledWith(tenant, org);
		});

		it("still returns 404 for non-jolli tenants not in registry", async () => {
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
});
