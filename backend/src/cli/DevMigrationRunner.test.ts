import { runDevMigrations, shouldRunDevMigrations } from "./DevMigrationRunner";
import type { Org, Tenant } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		NODE_ENV: process.env.NODE_ENV ?? "development",
		SKIP_DEV_MIGRATIONS: process.env.SKIP_DEV_MIGRATIONS === "true",
		MULTI_TENANT_ENABLED: process.env.MULTI_TENANT_ENABLED === "true",
	})),
}));

vi.mock("../util/Logger", () => ({
	getLog: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
}));

vi.mock("../tenant/TenantSequelizeFactory", () => ({
	createTenantSequelize: vi.fn().mockReturnValue({
		authenticate: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
	}),
}));

vi.mock("../core/Database", () => ({
	createDatabase: vi.fn().mockResolvedValue({}),
}));

describe("DevMigrationRunner", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Restore original environment
		process.env = { ...originalEnv };
	});

	describe("shouldRunDevMigrations", () => {
		it("returns true when all conditions are met", () => {
			process.env.NODE_ENV = "development";
			process.env.MULTI_TENANT_ENABLED = "true";
			delete process.env.SKIP_DEV_MIGRATIONS;

			expect(shouldRunDevMigrations()).toBe(true);
		});

		it("returns false when NODE_ENV is not development", () => {
			process.env.NODE_ENV = "production";
			process.env.MULTI_TENANT_ENABLED = "true";

			expect(shouldRunDevMigrations()).toBe(false);
		});

		it("returns false when SKIP_DEV_MIGRATIONS is true", () => {
			process.env.NODE_ENV = "development";
			process.env.MULTI_TENANT_ENABLED = "true";
			process.env.SKIP_DEV_MIGRATIONS = "true";

			expect(shouldRunDevMigrations()).toBe(false);
		});

		it("returns false when multi-tenant is not enabled", () => {
			process.env.NODE_ENV = "development";
			process.env.MULTI_TENANT_ENABLED = "false";

			expect(shouldRunDevMigrations()).toBe(false);
		});
	});

	describe("runDevMigrations", () => {
		const mockTenant: Tenant = {
			id: "tenant-1",
			slug: "test-tenant",
			displayName: "Test Tenant",
			deploymentType: "shared",
			databaseProviderId: "provider-1",
			configs: {},
			configsUpdatedAt: null,
			featureFlags: {},
			primaryDomain: null,
			status: "active",
			createdAt: new Date(),
			updatedAt: new Date(),
			provisionedAt: new Date(),
		};

		const mockOrg: Org = {
			id: "org-1",
			tenantId: "tenant-1",
			slug: "test-org",
			displayName: "Test Org",
			schemaName: "org_test",
			isDefault: true,
			status: "active",
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const mockDbConfig = {
			databaseHost: "localhost",
			databasePort: 5432,
			databaseName: "testdb",
			databaseUsername: "testuser",
			databasePasswordEncrypted: "encrypted-password",
			databaseSsl: false,
			databasePoolMax: 5,
		};

		const createMockRegistryClient = () => ({
			listAllActiveTenants: vi.fn().mockResolvedValue([mockTenant]),
			listAllActiveOrgs: vi.fn().mockResolvedValue([mockOrg]),
			getTenantDatabaseConfig: vi.fn().mockResolvedValue(mockDbConfig),
			close: vi.fn(),
		});

		it("runs migrations for all tenant-orgs", async () => {
			const mockRegistryClient = createMockRegistryClient();
			const mockDecryptPassword = vi.fn().mockReturnValue("decrypted-password");

			await runDevMigrations({
				registryClient: mockRegistryClient as never,
				decryptPassword: mockDecryptPassword,
			});

			expect(mockRegistryClient.listAllActiveTenants).toHaveBeenCalled();
			expect(mockRegistryClient.listAllActiveOrgs).toHaveBeenCalledWith("tenant-1");
			expect(mockRegistryClient.getTenantDatabaseConfig).toHaveBeenCalledWith("tenant-1");
			expect(mockDecryptPassword).toHaveBeenCalledWith("encrypted-password");
		});

		it("continues on failure and logs warning", async () => {
			const mockRegistryClient = createMockRegistryClient();
			const mockDecryptPassword = vi.fn().mockImplementation(() => {
				throw new Error("Decryption failed");
			});

			// Should not throw - continues on failure
			await expect(
				runDevMigrations({
					registryClient: mockRegistryClient as never,
					decryptPassword: mockDecryptPassword,
				}),
			).resolves.not.toThrow();
		});

		it("skips tenant when no database config found", async () => {
			const mockRegistryClient = createMockRegistryClient();
			mockRegistryClient.getTenantDatabaseConfig.mockResolvedValue(null);
			const mockDecryptPassword = vi.fn();

			await runDevMigrations({
				registryClient: mockRegistryClient as never,
				decryptPassword: mockDecryptPassword,
			});

			// Should not call decrypt since no config was found
			expect(mockDecryptPassword).not.toHaveBeenCalled();
		});

		it("handles empty tenant list", async () => {
			const mockRegistryClient = createMockRegistryClient();
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);
			const mockDecryptPassword = vi.fn();

			await runDevMigrations({
				registryClient: mockRegistryClient as never,
				decryptPassword: mockDecryptPassword,
			});

			expect(mockRegistryClient.listAllActiveTenants).toHaveBeenCalled();
			expect(mockRegistryClient.getTenantDatabaseConfig).not.toHaveBeenCalled();
		});

		it("handles registry client failure gracefully", async () => {
			const mockRegistryClient = createMockRegistryClient();
			mockRegistryClient.listAllActiveTenants.mockRejectedValue(new Error("Connection failed"));
			const mockDecryptPassword = vi.fn();

			// Should not throw - logs error and continues
			await expect(
				runDevMigrations({
					registryClient: mockRegistryClient as never,
					decryptPassword: mockDecryptPassword,
				}),
			).resolves.not.toThrow();
		});

		it("handles createDatabase failure gracefully", async () => {
			const mockRegistryClient = createMockRegistryClient();
			const mockDecryptPassword = vi.fn().mockReturnValue("decrypted-password");

			const { createTenantSequelize } = await import("../tenant/TenantSequelizeFactory");
			const mockSequelize = {
				query: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
			};
			vi.mocked(createTenantSequelize).mockReturnValue(mockSequelize as never);

			const { createDatabase } = await import("../core/Database");
			vi.mocked(createDatabase).mockRejectedValue(new Error("Database sync failed"));

			// Should not throw - continues on failure
			await expect(
				runDevMigrations({
					registryClient: mockRegistryClient as never,
					decryptPassword: mockDecryptPassword,
				}),
			).resolves.not.toThrow();
		});

		it("closes sequelize connection on successful migration", async () => {
			const { createTenantSequelize } = await import("../tenant/TenantSequelizeFactory");
			const mockClose = vi.fn().mockResolvedValue(undefined);
			const mockSequelize = {
				query: vi.fn().mockResolvedValue(undefined),
				close: mockClose,
			};
			vi.mocked(createTenantSequelize).mockReturnValue(mockSequelize as never);

			const mockRegistryClient = createMockRegistryClient();
			const mockDecryptPassword = vi.fn().mockReturnValue("decrypted-password");

			await runDevMigrations({
				registryClient: mockRegistryClient as never,
				decryptPassword: mockDecryptPassword,
			});

			// close() called once for the apply phase
			expect(mockClose).toHaveBeenCalledTimes(1);
		});

		it("closes sequelize connection even when apply phase fails", async () => {
			const { createTenantSequelize } = await import("../tenant/TenantSequelizeFactory");
			const { createDatabase } = await import("../core/Database");

			const mockClose = vi.fn().mockResolvedValue(undefined);
			const mockSequelize = {
				query: vi.fn().mockResolvedValue(undefined),
				close: mockClose,
			};
			vi.mocked(createTenantSequelize).mockReturnValue(mockSequelize as never);

			// Make createDatabase fail
			vi.mocked(createDatabase).mockImplementation(() => {
				throw new Error("Apply phase failed");
			});

			const mockRegistryClient = createMockRegistryClient();
			const mockDecryptPassword = vi.fn().mockReturnValue("decrypted-password");

			await runDevMigrations({
				registryClient: mockRegistryClient as never,
				decryptPassword: mockDecryptPassword,
			});

			// close() should still be called (cleanup in finally block)
			expect(mockClose).toHaveBeenCalledTimes(1);
		});

		it("handles non-Error exceptions gracefully", async () => {
			const { createTenantSequelize } = await import("../tenant/TenantSequelizeFactory");
			const { createDatabase } = await import("../core/Database");

			vi.mocked(createTenantSequelize).mockReturnValue({
				query: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
			} as never);

			// Make createDatabase throw a non-Error value
			vi.mocked(createDatabase).mockImplementation(() => {
				throw "string error"; // Non-Error exception
			});

			const mockRegistryClient = createMockRegistryClient();
			const mockDecryptPassword = vi.fn().mockReturnValue("decrypted-password");

			// Should not throw - continues on failure with string error message
			await expect(
				runDevMigrations({
					registryClient: mockRegistryClient as never,
					decryptPassword: mockDecryptPassword,
				}),
			).resolves.not.toThrow();
		});

		it("calls createDatabase with forceSync option and runs postSync hooks", async () => {
			const { createTenantSequelize } = await import("../tenant/TenantSequelizeFactory");
			const { createDatabase } = await import("../core/Database");

			vi.mocked(createTenantSequelize).mockReturnValue({
				query: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
			} as never);
			vi.mocked(createDatabase).mockResolvedValue({} as never);

			const mockRegistryClient = createMockRegistryClient();
			const mockDecryptPassword = vi.fn().mockReturnValue("decrypted-password");

			await runDevMigrations({
				registryClient: mockRegistryClient as never,
				decryptPassword: mockDecryptPassword,
			});

			// Verify createDatabase was called with forceSync and postSync hooks enabled
			expect(createDatabase).toHaveBeenCalledWith(expect.anything(), {
				forceSync: true,
				skipPostSync: false,
			});
		});

		it("supports async decryptPassword function", async () => {
			const mockRegistryClient = createMockRegistryClient();
			const mockDecryptPassword = vi.fn().mockResolvedValue("decrypted-password");

			await runDevMigrations({
				registryClient: mockRegistryClient as never,
				decryptPassword: mockDecryptPassword,
			});

			expect(mockDecryptPassword).toHaveBeenCalledWith("encrypted-password");
		});
	});
});
