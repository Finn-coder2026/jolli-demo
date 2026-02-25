import type { Database } from "../core/Database";
import { createTenantOrgContext, runWithTenantContext } from "../tenant/TenantContext";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import type { TokenUtil } from "../util/TokenUtil";
import { createSyncSpaceScopeMiddleware, createSyncTenantMiddleware } from "./SyncAuthMiddleware";
import type { NextFunction, Request, Response } from "express";
import type { Org, Tenant, UserInfo } from "jolli-common";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenant/TenantContext", async importOriginal => {
	const actual = await importOriginal<typeof import("../tenant/TenantContext")>();
	return {
		...actual,
		createTenantOrgContext: vi.fn((tenant: Tenant, org: Org, database: Database) => ({
			tenant,
			org,
			schemaName: org.schemaName,
			database,
		})),
		runWithTenantContext: vi.fn((_context: unknown, fn: () => void) => fn()),
	};
});

describe("SyncAuthMiddleware", () => {
	let mockTokenUtil: TokenUtil<UserInfo>;
	let mockRequest: Partial<Request>;
	let mockResponse: Partial<Response>;
	let mockNext: NextFunction;
	let middleware: ReturnType<typeof createSyncSpaceScopeMiddleware>;

	beforeEach(() => {
		mockTokenUtil = {
			decodePayloadFromToken: vi.fn(),
			decodePayload: vi.fn(),
			generateToken: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		mockRequest = {
			headers: {},
			cookies: {},
		};

		mockResponse = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
		};

		mockNext = vi.fn();

		middleware = createSyncSpaceScopeMiddleware(mockTokenUtil);
	});

	it("passes through when no token is present", () => {
		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).toHaveBeenCalled();
		expect(mockResponse.status).not.toHaveBeenCalled();
	});

	it("passes through for regular user tokens (no tokenType)", () => {
		mockRequest.headers = { authorization: "Bearer regular-token" };
		vi.mocked(mockTokenUtil.decodePayloadFromToken).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
		});

		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).toHaveBeenCalled();
		expect(mockResponse.status).not.toHaveBeenCalled();
	});

	it("passes through for sandbox-service tokens when spaceSlug matches X-Jolli-Space", () => {
		mockRequest.headers = {
			authorization: "Bearer sandbox-token",
			"x-jolli-space": "my-space",
		};
		vi.mocked(mockTokenUtil.decodePayloadFromToken).mockReturnValue({
			userId: 1,
			email: "owner@example.com",
			name: "Owner",
			picture: undefined,
			tokenType: "sandbox-service",
			spaceSlug: "my-space",
		} as UserInfo & { tokenType: string; spaceSlug: string });

		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).toHaveBeenCalled();
		expect(mockResponse.status).not.toHaveBeenCalled();
	});

	it("returns 403 when sandbox-service token spaceSlug does not match X-Jolli-Space", () => {
		mockRequest.headers = {
			authorization: "Bearer sandbox-token",
			"x-jolli-space": "other-space",
		};
		vi.mocked(mockTokenUtil.decodePayloadFromToken).mockReturnValue({
			userId: 1,
			email: "owner@example.com",
			name: "Owner",
			picture: undefined,
			tokenType: "sandbox-service",
			spaceSlug: "my-space",
		} as UserInfo & { tokenType: string; spaceSlug: string });

		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).not.toHaveBeenCalled();
		expect(mockResponse.status).toHaveBeenCalledWith(403);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: "Token not authorized for this space" });
	});

	it("returns 403 when sandbox-service token has no X-Jolli-Space header", () => {
		mockRequest.headers = {
			authorization: "Bearer sandbox-token",
		};
		vi.mocked(mockTokenUtil.decodePayloadFromToken).mockReturnValue({
			userId: 1,
			email: "owner@example.com",
			name: "Owner",
			picture: undefined,
			tokenType: "sandbox-service",
			spaceSlug: "my-space",
		} as UserInfo & { tokenType: string; spaceSlug: string });

		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).not.toHaveBeenCalled();
		expect(mockResponse.status).toHaveBeenCalledWith(403);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: "Token not authorized for this space" });
	});

	it("returns 403 when sandbox-service token has no spaceSlug claim", () => {
		mockRequest.headers = {
			authorization: "Bearer sandbox-token",
			"x-jolli-space": "my-space",
		};
		vi.mocked(mockTokenUtil.decodePayloadFromToken).mockReturnValue({
			userId: 1,
			email: "owner@example.com",
			name: "Owner",
			picture: undefined,
			tokenType: "sandbox-service",
		} as UserInfo & { tokenType: string });

		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).not.toHaveBeenCalled();
		expect(mockResponse.status).toHaveBeenCalledWith(403);
	});

	it("reads token from cookie when Authorization header is absent", () => {
		mockRequest.cookies = { authToken: "cookie-token" };
		vi.mocked(mockTokenUtil.decodePayloadFromToken).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
		});

		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockTokenUtil.decodePayloadFromToken).toHaveBeenCalledWith("cookie-token");
		expect(mockNext).toHaveBeenCalled();
	});

	it("passes through when payload cannot be decoded", () => {
		mockRequest.headers = { authorization: "Bearer bad-token" };
		vi.mocked(mockTokenUtil.decodePayloadFromToken).mockReturnValue(undefined);

		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).toHaveBeenCalled();
		expect(mockResponse.status).not.toHaveBeenCalled();
	});

	it("enforces sandbox space scope even when re-verification fails after tenant context switch", () => {
		mockRequest.headers = {
			authorization: "Bearer sandbox-token",
			"x-jolli-space": "other-space",
		};
		vi.mocked(mockTokenUtil.decodePayloadFromToken).mockReturnValue(undefined);
		const decodeSpy = vi.spyOn(jwt, "decode").mockReturnValue({
			userId: 1,
			email: "owner@example.com",
			name: "Owner",
			picture: undefined,
			tokenType: "sandbox-service",
			spaceSlug: "my-space",
		});

		middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).not.toHaveBeenCalled();
		expect(mockResponse.status).toHaveBeenCalledWith(403);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: "Token not authorized for this space" });
		decodeSpy.mockRestore();
	});
});

describe("SyncTenantMiddleware", () => {
	let mockTokenUtil: TokenUtil<UserInfo>;
	let mockRegistryClient: TenantRegistryClient;
	let mockConnectionManager: TenantOrgConnectionManager;
	let mockRequest: Partial<Request>;
	let mockResponse: Partial<Response>;
	let mockNext: NextFunction;
	let middleware: ReturnType<typeof createSyncTenantMiddleware>;

	/** Helper to build a valid Tenant object with optional overrides. */
	function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
		return {
			id: "tenant-1",
			slug: "acme",
			displayName: "Acme Corp",
			status: "active",
			deploymentType: "shared",
			databaseProviderId: "provider-1",
			configs: {},
			configsUpdatedAt: null,
			featureFlags: {},
			primaryDomain: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			provisionedAt: new Date(),
			...overrides,
		};
	}

	/** Helper to build a valid Org object with optional overrides. */
	function buildOrg(overrides: Partial<Org> = {}): Org {
		return {
			id: "org-1",
			tenantId: "tenant-1",
			slug: "engineering",
			displayName: "Engineering",
			schemaName: "org_engineering",
			status: "active",
			isDefault: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			...overrides,
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();

		mockTokenUtil = {
			decodePayload: vi.fn(),
			decodePayloadFromToken: vi.fn(),
			generateToken: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		mockRegistryClient = {
			getTenant: vi.fn(),
			getOrg: vi.fn(),
		} as unknown as TenantRegistryClient;

		mockConnectionManager = {
			getConnection: vi.fn(),
		} as unknown as TenantOrgConnectionManager;

		mockRequest = {
			headers: {},
			cookies: {},
		};

		mockResponse = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
		};

		mockNext = vi.fn();

		middleware = createSyncTenantMiddleware({
			tokenUtil: mockTokenUtil,
			registryClient: mockRegistryClient,
			connectionManager: mockConnectionManager,
		});
	});

	it("passes through when no tenantId/orgId in token (single-tenant mode)", async () => {
		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
		});

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).toHaveBeenCalled();
		expect(mockResponse.status).not.toHaveBeenCalled();
		expect(mockRegistryClient.getTenant).not.toHaveBeenCalled();
	});

	it("passes through when decodePayload returns undefined", async () => {
		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockNext).toHaveBeenCalled();
		expect(mockResponse.status).not.toHaveBeenCalled();
	});

	it("returns 401 when tenant is not found", async () => {
		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
			tenantId: "tenant-missing",
			orgId: "org-1",
		});
		vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockRegistryClient.getTenant).toHaveBeenCalledWith("tenant-missing");
		expect(mockResponse.status).toHaveBeenCalledWith(401);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: "Tenant not found" });
		expect(mockNext).not.toHaveBeenCalled();
	});

	it("returns 401 when org is not found", async () => {
		const tenant = buildTenant();
		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
			tenantId: "tenant-1",
			orgId: "org-missing",
		});
		vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(tenant);
		vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(undefined);

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockRegistryClient.getOrg).toHaveBeenCalledWith("org-missing");
		expect(mockResponse.status).toHaveBeenCalledWith(401);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: "Org not found" });
		expect(mockNext).not.toHaveBeenCalled();
	});

	it("returns 401 when org does not belong to tenant", async () => {
		const tenant = buildTenant({ id: "tenant-1" });
		const org = buildOrg({ id: "org-1", tenantId: "tenant-other" });
		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
			tenantId: "tenant-1",
			orgId: "org-1",
		});
		vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(tenant);
		vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(org);

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockResponse.status).toHaveBeenCalledWith(401);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: "Org does not belong to tenant" });
		expect(mockNext).not.toHaveBeenCalled();
	});

	it("returns 403 when tenant is not active", async () => {
		const tenant = buildTenant({ status: "suspended" });
		const org = buildOrg({ tenantId: tenant.id });
		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
			tenantId: tenant.id,
			orgId: org.id,
		});
		vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(tenant);
		vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(org);

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockResponse.status).toHaveBeenCalledWith(403);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: `Tenant is not active: ${tenant.slug}` });
		expect(mockNext).not.toHaveBeenCalled();
	});

	it("returns 403 when org is not active", async () => {
		const tenant = buildTenant();
		const org = buildOrg({ tenantId: tenant.id, status: "suspended" });
		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
			tenantId: tenant.id,
			orgId: org.id,
		});
		vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(tenant);
		vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(org);

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockResponse.status).toHaveBeenCalledWith(403);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: `Org is not active: ${org.slug}` });
		expect(mockNext).not.toHaveBeenCalled();
	});

	it("establishes tenant context and calls next on success", async () => {
		const tenant = buildTenant();
		const org = buildOrg({ tenantId: tenant.id });
		const mockDatabase = { name: "mock-database" } as unknown as Database;
		const mockContext = { tenant, org, schemaName: org.schemaName, database: mockDatabase };

		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
			tenantId: tenant.id,
			orgId: org.id,
		});
		vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(tenant);
		vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(org);
		vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
		vi.mocked(createTenantOrgContext).mockReturnValue(mockContext);

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockConnectionManager.getConnection).toHaveBeenCalledWith(tenant, org);
		expect(vi.mocked(createTenantOrgContext)).toHaveBeenCalledWith(tenant, org, mockDatabase);
		expect(vi.mocked(runWithTenantContext)).toHaveBeenCalledWith(mockContext, expect.any(Function));
		expect(mockNext).toHaveBeenCalled();
		expect(mockResponse.status).not.toHaveBeenCalled();
	});

	it("returns 500 on unexpected error", async () => {
		vi.mocked(mockTokenUtil.decodePayload).mockImplementation(() => {
			throw new Error("Unexpected JWT failure");
		});

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockResponse.status).toHaveBeenCalledWith(500);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: "Internal server error" });
		expect(mockNext).not.toHaveBeenCalled();
	});

	it("returns 500 when connectionManager.getConnection throws", async () => {
		const tenant = buildTenant();
		const org = buildOrg({ tenantId: tenant.id });

		vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
			userId: 1,
			email: "user@example.com",
			name: "User",
			picture: undefined,
			tenantId: tenant.id,
			orgId: org.id,
		});
		vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(tenant);
		vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(org);
		vi.mocked(mockConnectionManager.getConnection).mockRejectedValue(new Error("DB connection failed"));

		await middleware(mockRequest as Request, mockResponse as Response, mockNext);

		expect(mockResponse.status).toHaveBeenCalledWith(500);
		expect(mockResponse.json).toHaveBeenCalledWith({ error: "Internal server error" });
		expect(mockNext).not.toHaveBeenCalled();
	});
});
