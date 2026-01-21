import type { Database } from "../core/Database";
import {
	createMultiTenantFromEnv,
	createMultiTenantInfrastructure,
	type MultiTenantSetupConfig,
} from "./MultiTenantSetup";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the config module
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(),
}));

// Mock the registry client
vi.mock("./TenantRegistryClient", () => ({
	createTenantRegistryClient: vi.fn(() => ({
		getTenant: vi.fn(),
		getTenantBySlug: vi.fn(),
		listTenants: vi.fn(),
		getOrg: vi.fn(),
		getOrgBySlug: vi.fn(),
		getDefaultOrg: vi.fn(),
		listOrgs: vi.fn(),
		close: vi.fn().mockResolvedValue(undefined),
	})),
}));

// Mock the connection manager
vi.mock("./TenantOrgConnectionManager", () => ({
	createTenantOrgConnectionManager: vi.fn(() => ({
		getConnection: vi.fn().mockResolvedValue({}),
		evictConnection: vi.fn(),
		closeAll: vi.fn().mockResolvedValue(undefined),
		getCacheSize: vi.fn().mockReturnValue(0),
		evictExpired: vi.fn(),
	})),
}));

// Mock the middleware
vi.mock("./TenantMiddleware", () => ({
	createTenantMiddleware: vi.fn(() => vi.fn()),
}));

import { getConfig } from "../config/Config";
import { createTenantMiddleware } from "./TenantMiddleware";
import { createTenantOrgConnectionManager } from "./TenantOrgConnectionManager";
import { createTenantRegistryClient } from "./TenantRegistryClient";

describe("MultiTenantSetup", () => {
	let decryptPassword: ReturnType<typeof vi.fn>;
	let mockDatabase: Database;

	beforeEach(() => {
		vi.clearAllMocks();
		decryptPassword = vi.fn().mockResolvedValue("decrypted_password");
		mockDatabase = {} as Database;
		// Mock BASE_DOMAIN for createMultiTenantInfrastructure tests
		(getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
			BASE_DOMAIN: "jolli.app",
		});
	});

	describe("createMultiTenantInfrastructure", () => {
		it("creates all infrastructure components", () => {
			const config: MultiTenantSetupConfig = {
				registryDatabaseUrl: "postgres://localhost/registry",
				decryptPassword,
				defaultDatabase: mockDatabase,
				maxConnections: 50,
				ttlMs: 60000,
				poolMaxPerConnection: 10,
				logging: true,
			};

			const infrastructure = createMultiTenantInfrastructure(config);

			expect(infrastructure).toBeDefined();
			expect(infrastructure.registryClient).toBeDefined();
			expect(infrastructure.connectionManager).toBeDefined();
			expect(infrastructure.middleware).toBeDefined();
			expect(infrastructure.shutdown).toBeDefined();
		});

		it("passes correct config to registry client", () => {
			const config: MultiTenantSetupConfig = {
				registryDatabaseUrl: "postgres://localhost/registry",
				decryptPassword,
				defaultDatabase: mockDatabase,
			};

			createMultiTenantInfrastructure(config);

			expect(createTenantRegistryClient).toHaveBeenCalledWith({
				registryDatabaseUrl: "postgres://localhost/registry",
			});
		});

		it("passes correct config to connection manager", () => {
			const config: MultiTenantSetupConfig = {
				registryDatabaseUrl: "postgres://localhost/registry",
				decryptPassword,
				defaultDatabase: mockDatabase,
				maxConnections: 50,
				ttlMs: 60000,
				poolMaxPerConnection: 10,
				logging: true,
			};

			createMultiTenantInfrastructure(config);

			expect(createTenantOrgConnectionManager).toHaveBeenCalledWith({
				registryClient: expect.anything(),
				decryptPassword,
				maxConnections: 50,
				ttlMs: 60000,
				poolMax: 10,
				logging: true,
			});
		});

		it("passes registry client and connection manager to middleware", () => {
			const config: MultiTenantSetupConfig = {
				registryDatabaseUrl: "postgres://localhost/registry",
				decryptPassword,
				defaultDatabase: mockDatabase,
			};

			createMultiTenantInfrastructure(config);

			expect(createTenantMiddleware).toHaveBeenCalledWith({
				registryClient: expect.anything(),
				connectionManager: expect.anything(),
				baseDomain: "jolli.app",
				defaultDatabase: mockDatabase,
			});
		});

		it("shutdown closes all resources", async () => {
			const config: MultiTenantSetupConfig = {
				registryDatabaseUrl: "postgres://localhost/registry",
				decryptPassword,
				defaultDatabase: mockDatabase,
			};

			const infrastructure = createMultiTenantInfrastructure(config);
			await infrastructure.shutdown();

			expect(infrastructure.connectionManager.closeAll).toHaveBeenCalled();
			expect(infrastructure.registryClient.close).toHaveBeenCalled();
		});
	});

	describe("createMultiTenantFromEnv", () => {
		it("returns undefined when multi-tenant is disabled", () => {
			(getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				MULTI_TENANT_ENABLED: false,
			});

			const result = createMultiTenantFromEnv(decryptPassword, mockDatabase);

			expect(result).toBeUndefined();
		});

		it("throws when registry URL is missing but multi-tenant is enabled", () => {
			(getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				MULTI_TENANT_ENABLED: true,
				MULTI_TENANT_REGISTRY_URL: undefined,
			});

			expect(() => createMultiTenantFromEnv(decryptPassword, mockDatabase)).toThrow(
				"MULTI_TENANT_REGISTRY_URL is required when MULTI_TENANT_ENABLED is true",
			);
		});

		it("creates infrastructure with env config values", () => {
			(getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				MULTI_TENANT_ENABLED: true,
				MULTI_TENANT_REGISTRY_URL: "postgres://localhost/registry",
				MULTI_TENANT_CONNECTION_POOL_MAX: 200,
				MULTI_TENANT_CONNECTION_TTL_MS: 120000,
				MULTI_TENANT_POOL_MAX_PER_CONNECTION: 8,
				POSTGRES_LOGGING: true,
				BASE_DOMAIN: "jolli.app",
			});

			const infrastructure = createMultiTenantFromEnv(decryptPassword, mockDatabase);

			expect(infrastructure).toBeDefined();
			expect(createTenantRegistryClient).toHaveBeenCalledWith({
				registryDatabaseUrl: "postgres://localhost/registry",
			});
			expect(createTenantOrgConnectionManager).toHaveBeenCalledWith({
				registryClient: expect.anything(),
				decryptPassword,
				maxConnections: 200,
				ttlMs: 120000,
				poolMax: 8,
				logging: true,
			});
		});
	});
});
