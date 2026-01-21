import type { TenantDatabaseConfig } from "../tenant/TenantDatabaseConfig";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import {
	buildInitialConfig,
	captureSchemaState,
	createConsoleLogger,
	createDdlCapture,
	createDryRunSequelize,
	createRegistryClientFromConfig,
	decryptDatabasePasswordCli,
	diffSchemas,
	EXIT_CODES,
	enrichConfig,
	formatDryRunResult,
	formatSchemaDiffs,
	loadConfig,
	type MigrateConfig,
	type MigrateDependencies,
	type MigrateLogger,
	migrateAllTenants,
	migrateTenantOrg,
	parseArgs,
	printSummary,
	runDryRun,
	runDryRunCheck,
	runMigrationCli,
} from "./SchemaMigration";
import type { Org, Tenant } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../config/ParameterStoreLoader", () => {
	const mockLoad = vi.fn().mockResolvedValue({ MULTI_TENANT_REGISTRY_URL: "postgres://test" });
	return {
		ParameterStoreLoader: vi.fn().mockImplementation(() => ({
			load: mockLoad,
		})),
	};
});

vi.mock("../tenant/TenantRegistryClient", () => ({
	createTenantRegistryClient: vi.fn().mockReturnValue({
		close: vi.fn(),
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
	}),
}));

// Mock getConfig and reloadEnvFiles to return values from process.env for testing
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		SKIP_SCHEMA_MIGRATIONS: process.env.SKIP_SCHEMA_MIGRATIONS === "true",
		AWS_REGION: process.env.AWS_REGION ?? "us-west-2",
		PSTORE_ENV: process.env.PSTORE_ENV,
		MULTI_TENANT_REGISTRY_URL: process.env.MULTI_TENANT_REGISTRY_URL,
		DB_PASSWORD_ENCRYPTION_KEY: process.env.DB_PASSWORD_ENCRYPTION_KEY,
		CANARY_TENANT_SLUG: process.env.CANARY_TENANT_SLUG,
		CANARY_ORG_SLUG: process.env.CANARY_ORG_SLUG,
	})),
	reloadEnvFiles: vi.fn(), // Mock to avoid actual file operations during tests
}));

// Mock createTenantSequelize for runDryRun tests
vi.mock("../tenant/TenantSequelizeFactory", () => ({
	createTenantSequelize: vi.fn().mockReturnValue({
		query: vi.fn().mockResolvedValue([]),
		sync: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		getQueryInterface: vi.fn().mockReturnValue({
			showAllTables: vi.fn().mockResolvedValue([]),
		}),
	}),
}));

describe("MigrateSchemas", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {
			// Intentionally empty - suppress console output in tests
		});
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
		consoleSpy.mockRestore();
	});

	describe("parseArgs", () => {
		it("parses --dry-run flag", () => {
			const result = parseArgs(["--dry-run"]);
			expect(result.config.dryRun).toBe(true);
			expect(result.validationError).toBeUndefined();
		});

		it("parses --verbose flag", () => {
			const result = parseArgs(["--verbose"]);
			expect(result.config.verbose).toBe(true);
		});

		it("parses -v flag", () => {
			const result = parseArgs(["-v"]);
			expect(result.config.verbose).toBe(true);
		});

		it("parses --check-only flag", () => {
			const result = parseArgs(["--check-only"]);
			expect(result.config.checkOnly).toBe(true);
		});

		it("parses multiple flags", () => {
			const result = parseArgs(["--dry-run", "--verbose", "--check-only"]);
			expect(result.config.dryRun).toBe(true);
			expect(result.config.verbose).toBe(true);
			expect(result.config.checkOnly).toBe(true);
		});

		it("returns false for missing flags", () => {
			const result = parseArgs([]);
			expect(result.config.dryRun).toBe(false);
			expect(result.config.verbose).toBe(false);
			expect(result.config.checkOnly).toBe(false);
		});

		it("parses --canary-tenant and --canary-org arguments", () => {
			const result = parseArgs(["--canary-tenant", "acme", "--canary-org", "engineering"]);
			expect(result.config.canaryTenantSlug).toBe("acme");
			expect(result.config.canaryOrgSlug).toBe("engineering");
			expect(result.validationError).toBeUndefined();
		});

		it("parses canary args mixed with other flags", () => {
			const result = parseArgs(["--dry-run", "--canary-tenant", "acme", "--verbose", "--canary-org", "default"]);
			expect(result.config.dryRun).toBe(true);
			expect(result.config.verbose).toBe(true);
			expect(result.config.canaryTenantSlug).toBe("acme");
			expect(result.config.canaryOrgSlug).toBe("default");
		});

		it("returns undefined for missing canary args", () => {
			const result = parseArgs(["--dry-run"]);
			expect(result.config.canaryTenantSlug).toBeUndefined();
			expect(result.config.canaryOrgSlug).toBeUndefined();
		});

		it("returns validation error when only --canary-tenant is provided", () => {
			const result = parseArgs(["--canary-tenant", "acme"]);
			expect(result.validationError).toBeDefined();
			expect(result.validationError).toContain("--canary-tenant and --canary-org must be specified together");
		});

		it("returns validation error when only --canary-org is provided", () => {
			const result = parseArgs(["--canary-org", "engineering"]);
			expect(result.validationError).toBeDefined();
			expect(result.validationError).toContain("--canary-tenant and --canary-org must be specified together");
		});
	});

	describe("buildInitialConfig", () => {
		it("builds initial config from args and basic env vars", () => {
			process.env.PSTORE_ENV = "dev";
			process.env.AWS_REGION = "us-east-1";

			const result = buildInitialConfig({ dryRun: true, verbose: true });

			expect(result.dryRun).toBe(true);
			expect(result.verbose).toBe(true);
			expect(result.awsRegion).toBe("us-east-1");
			expect(result.pstoreEnv).toBe("dev");
			// registryUrl is NOT set by buildInitialConfig (comes from enrichConfig)
			expect(result.registryUrl).toBeUndefined();
		});

		it("uses defaults for missing values", () => {
			delete process.env.AWS_REGION;
			delete process.env.PSTORE_ENV;

			const result = buildInitialConfig({});

			expect(result.dryRun).toBe(false);
			expect(result.verbose).toBe(false);
			expect(result.awsRegion).toBe("us-west-2");
			expect(result.pstoreEnv).toBeUndefined();
		});

		it("sets skipMigrations from environment", () => {
			process.env.SKIP_SCHEMA_MIGRATIONS = "true";

			const result = buildInitialConfig({});

			expect(result.skipMigrations).toBe(true);
		});
	});

	describe("enrichConfig", () => {
		it("enriches config with values from getConfig", () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test";
			process.env.DB_PASSWORD_ENCRYPTION_KEY = "test-key";

			const initialConfig = buildInitialConfig({ dryRun: true });
			const result = enrichConfig(initialConfig);

			expect(result.dryRun).toBe(true);
			expect(result.registryUrl).toBe("postgres://test");
			expect(result.encryptionKey).toBe("test-key");
		});

		it("preserves initial config values", () => {
			process.env.AWS_REGION = "us-east-1";
			process.env.PSTORE_ENV = "dev";

			const initialConfig = buildInitialConfig({ verbose: true });
			const result = enrichConfig(initialConfig);

			expect(result.verbose).toBe(true);
			expect(result.awsRegion).toBe("us-east-1");
			expect(result.pstoreEnv).toBe("dev");
		});

		it("loads canary config from env vars", () => {
			process.env.CANARY_TENANT_SLUG = "acme";
			process.env.CANARY_ORG_SLUG = "default";

			const initialConfig = buildInitialConfig({});
			const result = enrichConfig(initialConfig);

			expect(result.canaryTenantSlug).toBe("acme");
			expect(result.canaryOrgSlug).toBe("default");
		});

		it("CLI args take precedence over env vars for canary config", () => {
			process.env.CANARY_TENANT_SLUG = "env-tenant";
			process.env.CANARY_ORG_SLUG = "env-org";

			const initialConfig = buildInitialConfig({});
			initialConfig.canaryTenantSlug = "cli-tenant";
			initialConfig.canaryOrgSlug = "cli-org";
			const result = enrichConfig(initialConfig);

			expect(result.canaryTenantSlug).toBe("cli-tenant");
			expect(result.canaryOrgSlug).toBe("cli-org");
		});
	});

	describe("createConsoleLogger", () => {
		it("logs info messages", () => {
			const logger = createConsoleLogger(false);
			logger.info("test message");

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[INFO] test message"));
		});

		it("logs warn messages", () => {
			const logger = createConsoleLogger(false);
			logger.warn("test warning");

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[WARN] test warning"));
		});

		it("logs error messages", () => {
			const logger = createConsoleLogger(false);
			logger.error("test error");

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[ERROR] test error"));
		});

		it("logs debug messages when verbose is true", () => {
			const logger = createConsoleLogger(true);
			logger.debug("debug message");

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[DEBUG] debug message"));
		});

		it("skips debug messages when verbose is false", () => {
			const logger = createConsoleLogger(false);
			logger.debug("debug message");

			expect(consoleSpy).not.toHaveBeenCalled();
		});

		it("includes data in log output", () => {
			const logger = createConsoleLogger(false);
			logger.info("test", { key: "value" });

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('{"key":"value"}'));
		});
	});

	describe("loadConfig", () => {
		it("skips Parameter Store when pstoreEnv is not set", async () => {
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};
			const logger = createConsoleLogger(false);

			// Should return empty object without throwing
			const result = await loadConfig(config, logger);
			expect(result).toEqual({});
		});

		it("loads from Parameter Store when pstoreEnv is set", async () => {
			// Re-mock the ParameterStoreLoader since vi.clearAllMocks() cleared it
			const { ParameterStoreLoader } = await import("../config/ParameterStoreLoader");
			vi.mocked(ParameterStoreLoader).mockImplementation(
				() =>
					({
						load: vi.fn().mockResolvedValue({ SOME_KEY: "some-value" }),
					}) as never,
			);

			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
				pstoreEnv: "staging",
			};
			const logger = createConsoleLogger(false);

			const result = await loadConfig(config, logger);
			expect(result).toEqual({ SOME_KEY: "some-value" });
		});
	});

	describe("createRegistryClientFromConfig", () => {
		it("throws error when registry URL is missing", () => {
			delete process.env.MULTI_TENANT_REGISTRY_URL;
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};
			const logger = createConsoleLogger(false);

			expect(() => createRegistryClientFromConfig(config, logger)).toThrow(
				"MULTI_TENANT_REGISTRY_URL not configured",
			);
		});
	});

	describe("decryptDatabasePasswordCli", () => {
		it("returns password as-is when no encryption key", () => {
			const result = decryptDatabasePasswordCli("plaintext");

			expect(result).toBe("plaintext");
		});

		it("returns password as-is when not encrypted format", () => {
			const result = decryptDatabasePasswordCli("plaintext", "some-key");

			expect(result).toBe("plaintext");
		});

		it("decrypts encrypted password when key is provided", async () => {
			// Import encryption functions from jolli-common
			const { encryptPassword, generatePasswordEncryptionKey } = await import("jolli-common/server");

			// Generate a valid encryption key and encrypt a test password
			const key = generatePasswordEncryptionKey();
			const originalPassword = "my-secret-password";
			const encryptedPassword = encryptPassword(originalPassword, key);

			// Decrypt using the CLI function
			const result = decryptDatabasePasswordCli(encryptedPassword, key);

			expect(result).toBe(originalPassword);
		});
	});

	describe("migrateTenantOrg", () => {
		const mockTenant: Tenant = {
			id: "tenant-1",
			slug: "test-tenant",
			displayName: "Test Tenant",
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
		};

		const mockOrg: Org = {
			id: "org-1",
			tenantId: "tenant-1",
			slug: "default",
			displayName: "Default",
			schemaName: "org_default",
			isDefault: true,
			status: "active",
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const mockDbConfig: TenantDatabaseConfig = {
			tenantId: "tenant-1",
			databaseHost: "localhost",
			databasePort: 5432,
			databaseName: "testdb",
			databaseUsername: "user",
			databasePasswordEncrypted: "password",
			databaseSsl: false,
			databasePoolMax: 10,
		};

		function createMockRegistryClient(): TenantRegistryClient {
			return {
				getTenant: vi.fn(),
				getTenantBySlug: vi.fn(),
				getTenantByDomain: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue(mockDbConfig),
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
		}

		function createMockLogger(): MigrateLogger {
			return {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				debug: vi.fn(),
			};
		}

		function createMockDependencies(): MigrateDependencies {
			const mockSequelize = {
				authenticate: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
				// Mock query for captureSchemaState - returns empty schema (no tables)
				query: vi.fn().mockResolvedValue([[], undefined]),
			};

			return {
				createSequelize: vi.fn().mockReturnValue(mockSequelize),
				createDb: vi.fn().mockResolvedValue(undefined),
			};
		}

		it("returns success for live migration", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateTenantOrg(registryClient, mockTenant, mockOrg, config, logger, deps);

			expect(result.status).toBe("success");
			expect(result.tenantId).toBe("tenant-1");
			expect(result.orgId).toBe("org-1");
			expect(deps.createDb).toHaveBeenCalled();
		});

		it("returns skipped for dry run", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: true,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateTenantOrg(registryClient, mockTenant, mockOrg, config, logger, deps);

			expect(result.status).toBe("skipped");
			expect(deps.createDb).not.toHaveBeenCalled();
		});

		it("returns skipped for check only", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: true,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateTenantOrg(registryClient, mockTenant, mockOrg, config, logger, deps);

			expect(result.status).toBe("skipped");
			expect(deps.createDb).not.toHaveBeenCalled();
		});

		it("returns failed when no db config found", async () => {
			const registryClient = createMockRegistryClient();
			(registryClient.getTenantDatabaseConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateTenantOrg(registryClient, mockTenant, mockOrg, config, logger, deps);

			expect(result.status).toBe("failed");
			expect(result.error).toContain("No database config found");
		});

		it("handles empty password in database config", async () => {
			const registryClient = createMockRegistryClient();
			// Set up db config with empty password
			(registryClient.getTenantDatabaseConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
				...mockDbConfig,
				databasePasswordEncrypted: "", // Empty password
			});
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: true, // Enable verbose to trigger debug logging
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateTenantOrg(registryClient, mockTenant, mockOrg, config, logger, deps);

			expect(result.status).toBe("success");
			// Verify the "(empty)" password preview was logged
			expect(logger.debug).toHaveBeenCalledWith(
				expect.stringContaining(`Database connection for ${mockTenant.slug}`),
				expect.objectContaining({ passwordEncrypted: "(empty)" }),
			);
		});

		it("reports schema changes when they are detected", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();

			// Create mock with schema changes - before has no columns, after has one column
			let queryCallCount = 0;
			const mockSequelize = {
				authenticate: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockImplementation(() => {
					queryCallCount++;
					// First call (before sync): return empty schema
					if (queryCallCount === 1) {
						return Promise.resolve([[]]);
					}
					// Second call (after sync): return schema with a new column
					return Promise.resolve([
						[
							{
								table_name: "users",
								column_name: "email",
								data_type: "varchar",
								is_nullable: "YES",
								column_default: null,
							},
						],
					]);
				}),
			};

			const deps: MigrateDependencies = {
				createSequelize: vi.fn().mockReturnValue(mockSequelize),
				createDb: vi.fn().mockResolvedValue(undefined),
			};

			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateTenantOrg(registryClient, mockTenant, mockOrg, config, logger, deps);

			expect(result.status).toBe("success");
			expect(result.changesApplied).toBe(true);
			expect(result.changeCount).toBe(1);
			// Verify the changes were logged
			expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("1 change(s) applied"));
			expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE users"));
		});
	});

	describe("migrateAllTenants", () => {
		const mockTenant: Tenant = {
			id: "tenant-1",
			slug: "test-tenant",
			displayName: "Test Tenant",
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
		};

		const mockOrg: Org = {
			id: "org-1",
			tenantId: "tenant-1",
			slug: "default",
			displayName: "Default",
			schemaName: "org_default",
			isDefault: true,
			status: "active",
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const mockDbConfig: TenantDatabaseConfig = {
			tenantId: "tenant-1",
			databaseHost: "localhost",
			databasePort: 5432,
			databaseName: "testdb",
			databaseUsername: "user",
			databasePasswordEncrypted: "password",
			databaseSsl: false,
			databasePoolMax: 10,
		};

		function createMockRegistryClient(): TenantRegistryClient {
			return {
				getTenant: vi.fn(),
				getTenantBySlug: vi.fn(),
				getTenantByDomain: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue(mockDbConfig),
				listTenants: vi.fn(),
				listAllActiveTenants: vi.fn().mockResolvedValue([mockTenant]),
				getOrg: vi.fn(),
				getOrgBySlug: vi.fn(),
				getDefaultOrg: vi.fn(),
				listOrgs: vi.fn(),
				listAllActiveOrgs: vi.fn().mockResolvedValue([mockOrg]),
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
				close: vi.fn(),
			};
		}

		function createMockLogger(): MigrateLogger {
			return {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				debug: vi.fn(),
			};
		}

		function createMockDependencies(): MigrateDependencies {
			const mockSequelize = {
				authenticate: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
				// Mock query for captureSchemaState - returns empty schema (no tables)
				query: vi.fn().mockResolvedValue([[], undefined]),
			};

			return {
				createSequelize: vi.fn().mockReturnValue(mockSequelize),
				createDb: vi.fn().mockResolvedValue(undefined),
			};
		}

		it("migrates all tenants successfully", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateAllTenants(registryClient, config, logger, deps);

			expect(result.totalTenants).toBe(1);
			expect(result.totalOrgs).toBe(1);
			expect(result.successful).toBe(1);
			expect(result.failed).toBe(0);
		});

		it("counts migrations with schema changes in summary", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();

			// Create mock with schema changes - before has no columns, after has one column
			let queryCallCount = 0;
			const mockSequelize = {
				authenticate: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockImplementation(() => {
					queryCallCount++;
					// First call (before sync): return empty schema
					if (queryCallCount === 1) {
						return Promise.resolve([[]]);
					}
					// Second call (after sync): return schema with a new column
					return Promise.resolve([
						[
							{
								table_name: "users",
								column_name: "email",
								data_type: "varchar",
								is_nullable: "YES",
								column_default: null,
							},
						],
					]);
				}),
			};

			const deps: MigrateDependencies = {
				createSequelize: vi.fn().mockReturnValue(mockSequelize),
				createDb: vi.fn().mockResolvedValue(undefined),
			};

			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateAllTenants(registryClient, config, logger, deps);

			expect(result.totalTenants).toBe(1);
			expect(result.totalOrgs).toBe(1);
			expect(result.successful).toBe(1);
			expect(result.withChanges).toBe(1);
			expect(result.noChanges).toBe(0);
		});

		it("counts skipped migrations in summary for dry-run mode", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: true, // Dry-run mode causes skipped status
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateAllTenants(registryClient, config, logger, deps);

			expect(result.totalTenants).toBe(1);
			expect(result.totalOrgs).toBe(1);
			expect(result.skipped).toBe(1);
			expect(result.successful).toBe(0);
		});

		it("skips tenant without db config", async () => {
			const registryClient = createMockRegistryClient();
			(registryClient.getTenantDatabaseConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateAllTenants(registryClient, config, logger, deps);

			expect(result.totalTenants).toBe(1);
			// With the new canary pattern, orgs are counted after filtering tenants with no db config
			expect(result.totalOrgs).toBe(0);
			expect(result.successful).toBe(0);
			expect(result.failed).toBe(0);
			expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("No database config"));
		});

		it("stops on first failure (fail-fast) - canary fails", async () => {
			const registryClient = createMockRegistryClient();
			const mockOrg2: Org = { ...mockOrg, id: "org-2", slug: "second", schemaName: "org_second" };
			(registryClient.listAllActiveOrgs as ReturnType<typeof vi.fn>).mockResolvedValue([mockOrg, mockOrg2]);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			let callCount = 0;
			(deps.createDb as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.reject(new Error("First org failed"));
				}
				return Promise.resolve();
			});
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateAllTenants(registryClient, config, logger, deps);

			expect(result.failed).toBe(1);
			expect(result.successful).toBe(0);
			expect(callCount).toBe(1); // Only canary (first org) attempted
			expect(logger.error).toHaveBeenCalledWith("Canary migration failed - stopping before affecting other orgs");
		});

		it("canary succeeds, then second org fails", async () => {
			const registryClient = createMockRegistryClient();
			const mockOrg2: Org = { ...mockOrg, id: "org-2", slug: "second", schemaName: "org_second" };
			const mockOrg3: Org = { ...mockOrg, id: "org-3", slug: "third", schemaName: "org_third" };
			(registryClient.listAllActiveOrgs as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockOrg,
				mockOrg2,
				mockOrg3,
			]);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			let callCount = 0;
			(deps.createDb as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 2) {
					// Second org (after canary) fails
					return Promise.reject(new Error("Second org failed"));
				}
				return Promise.resolve();
			});
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateAllTenants(registryClient, config, logger, deps);

			expect(result.failed).toBe(1);
			expect(result.successful).toBe(1); // Canary succeeded
			expect(callCount).toBe(2); // Canary + second org, third not attempted
			expect(logger.info).toHaveBeenCalledWith("Canary migration succeeded - proceeding with remaining orgs");
		});

		it("logs canary migration header", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			await migrateAllTenants(registryClient, config, logger, deps);

			expect(logger.info).toHaveBeenCalledWith("CANARY MIGRATION: test-tenant/default");
		});

		it("handles empty org list", async () => {
			const registryClient = createMockRegistryClient();
			(registryClient.listAllActiveOrgs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateAllTenants(registryClient, config, logger, deps);

			expect(result.totalOrgs).toBe(0);
			expect(result.successful).toBe(0);
			expect(result.failed).toBe(0);
			expect(logger.info).toHaveBeenCalledWith("No orgs to migrate");
		});

		it("migrates all orgs when canary succeeds", async () => {
			const registryClient = createMockRegistryClient();
			const mockOrg2: Org = { ...mockOrg, id: "org-2", slug: "second", schemaName: "org_second" };
			const mockOrg3: Org = { ...mockOrg, id: "org-3", slug: "third", schemaName: "org_third" };
			(registryClient.listAllActiveOrgs as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockOrg,
				mockOrg2,
				mockOrg3,
			]);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			let callCount = 0;
			(deps.createDb as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				return Promise.resolve();
			});
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			const result = await migrateAllTenants(registryClient, config, logger, deps);

			expect(result.totalOrgs).toBe(3);
			expect(result.successful).toBe(3);
			expect(result.failed).toBe(0);
			expect(callCount).toBe(3); // All 3 orgs migrated
		});

		it("uses configured canary when both tenant and org specified", async () => {
			const mockTenant2: Tenant = {
				...mockTenant,
				id: "tenant-2",
				slug: "other-tenant",
			};
			const mockOrg2: Org = { ...mockOrg, id: "org-2", slug: "engineering", schemaName: "org_engineering" };
			const registryClient = createMockRegistryClient();
			(registryClient.listAllActiveTenants as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockTenant,
				mockTenant2,
			]);
			(registryClient.listAllActiveOrgs as ReturnType<typeof vi.fn>).mockImplementation((tenantId: string) => {
				if (tenantId === "tenant-1") {
					return Promise.resolve([mockOrg]);
				}
				return Promise.resolve([mockOrg2]);
			});
			(registryClient.getTenantDatabaseConfig as ReturnType<typeof vi.fn>).mockResolvedValue(mockDbConfig);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
				canaryTenantSlug: "other-tenant",
				canaryOrgSlug: "engineering",
			};

			await migrateAllTenants(registryClient, config, logger, deps);

			expect(logger.info).toHaveBeenCalledWith("Using configured canary: other-tenant/engineering");
			expect(logger.info).toHaveBeenCalledWith("CANARY MIGRATION: other-tenant/engineering");
		});

		it("throws error when configured canary not found", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
				canaryTenantSlug: "nonexistent",
				canaryOrgSlug: "nonexistent",
			};

			await expect(migrateAllTenants(registryClient, config, logger, deps)).rejects.toThrow(
				"Configured canary tenant+org not found or inactive: nonexistent/nonexistent",
			);
		});

		it("throws error when only canary tenant specified without org", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
				canaryTenantSlug: "test-tenant",
				// canaryOrgSlug not set
			};

			await expect(migrateAllTenants(registryClient, config, logger, deps)).rejects.toThrow(
				"Both --canary-tenant and --canary-org must be specified together",
			);
		});

		it("throws error when only canary org specified without tenant", async () => {
			const registryClient = createMockRegistryClient();
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
				// canaryTenantSlug not set
				canaryOrgSlug: "default",
			};

			await expect(migrateAllTenants(registryClient, config, logger, deps)).rejects.toThrow(
				"Both --canary-tenant and --canary-org must be specified together",
			);
		});

		it("uses default canary (first org) when no canary configured", async () => {
			const registryClient = createMockRegistryClient();
			const mockOrg2: Org = { ...mockOrg, id: "org-2", slug: "second", schemaName: "org_second" };
			(registryClient.listAllActiveOrgs as ReturnType<typeof vi.fn>).mockResolvedValue([mockOrg, mockOrg2]);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
				// No canary configured
			};

			await migrateAllTenants(registryClient, config, logger, deps);

			expect(logger.info).toHaveBeenCalledWith("Using default canary (first org): test-tenant/default");
		});

		it("moves configured canary to front of array for processing order", async () => {
			const mockOrg2: Org = { ...mockOrg, id: "org-2", slug: "second", schemaName: "org_second" };
			const mockOrg3: Org = { ...mockOrg, id: "org-3", slug: "third", schemaName: "org_third" };
			const registryClient = createMockRegistryClient();
			(registryClient.listAllActiveOrgs as ReturnType<typeof vi.fn>).mockResolvedValue([
				mockOrg,
				mockOrg2,
				mockOrg3,
			]);
			const logger = createMockLogger();
			const deps = createMockDependencies();
			const migratedOrgs: Array<string> = [];
			(deps.createDb as ReturnType<typeof vi.fn>).mockImplementation(() => {
				// Track the order of migrations by examining the last call to createSequelize
				const lastCall = (deps.createSequelize as ReturnType<typeof vi.fn>).mock.calls.at(-1);
				const schemaName = lastCall?.[4];
				migratedOrgs.push(schemaName);
				return Promise.resolve();
			});
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
				canaryTenantSlug: "test-tenant",
				canaryOrgSlug: "third", // Select the third org as canary
			};

			await migrateAllTenants(registryClient, config, logger, deps);

			// The configured canary (third) should be migrated first
			expect(migratedOrgs[0]).toBe("org_third");
		});
	});

	describe("printSummary", () => {
		// Create a test logger that routes to console.log (which is spied on)
		const testLogger = createConsoleLogger(false);

		it("prints summary with all metrics", () => {
			const summary = {
				totalTenants: 2,
				totalOrgs: 5,
				successful: 3,
				failed: 1,
				skipped: 1,
				withChanges: 2,
				noChanges: 1,
				results: [
					{ tenantId: "t1", orgId: "o1", schemaName: "org_a", status: "success" as const },
					{
						tenantId: "t1",
						orgId: "o2",
						schemaName: "org_b",
						status: "failed" as const,
						error: "Test error",
					},
				],
				durationMs: 5000,
			};
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			printSummary(summary, config, testLogger);

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Total Tenants:  2"));
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Total Orgs:     5"));
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Successful:     3"));
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed:         1"));
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("FAILED MIGRATIONS:"));
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("org_b: Test error"));
		});

		it("prints check-only message", () => {
			const summary = {
				totalTenants: 1,
				totalOrgs: 1,
				successful: 0,
				failed: 0,
				skipped: 1,
				withChanges: 0,
				noChanges: 0,
				results: [],
				durationMs: 1000,
			};
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: true,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			printSummary(summary, config, testLogger);

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[CHECK ONLY]"));
		});

		it("prints dry-run message", () => {
			const summary = {
				totalTenants: 1,
				totalOrgs: 1,
				successful: 0,
				failed: 0,
				skipped: 1,
				withChanges: 0,
				noChanges: 0,
				results: [],
				durationMs: 1000,
			};
			const config: MigrateConfig = {
				dryRun: true,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			printSummary(summary, config, testLogger);

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
		});

		it("prints up to date message when all successful with no changes", () => {
			const summary = {
				totalTenants: 1,
				totalOrgs: 2,
				successful: 2,
				failed: 0,
				skipped: 0,
				withChanges: 0,
				noChanges: 2, // All successful had no changes
				results: [
					{ tenantId: "t1", orgId: "o1", schemaName: "org_a", status: "success" as const },
					{ tenantId: "t1", orgId: "o2", schemaName: "org_b", status: "success" as const },
				],
				durationMs: 1000,
			};
			const config: MigrateConfig = {
				dryRun: false,
				verbose: false,
				checkOnly: false,
				skipMigrations: false,
				awsRegion: "us-west-2",
			};

			printSummary(summary, config, testLogger);

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("All schemas are up to date"));
		});
	});

	describe("createDdlCapture", () => {
		it("captures ALTER statements", () => {
			const { loggingFn, statements } = createDdlCapture();

			loggingFn("Executing (default): ALTER TABLE users ADD COLUMN name VARCHAR(255)");
			loggingFn("Executing (default): SELECT * FROM users");

			expect(statements).toHaveLength(1);
			expect(statements[0]).toBe("ALTER TABLE users ADD COLUMN name VARCHAR(255)");
		});

		it("captures CREATE statements", () => {
			const { loggingFn, statements } = createDdlCapture();

			loggingFn("Executing (default): CREATE TABLE users (id SERIAL PRIMARY KEY)");
			loggingFn("Executing (default): INSERT INTO users VALUES (1)");

			expect(statements).toHaveLength(1);
			expect(statements[0]).toBe("CREATE TABLE users (id SERIAL PRIMARY KEY)");
		});

		it("captures DROP statements", () => {
			const { loggingFn, statements } = createDdlCapture();

			loggingFn("Executing (default): DROP TABLE users");
			loggingFn("Executing (default): DELETE FROM users WHERE id = 1");

			expect(statements).toHaveLength(1);
			expect(statements[0]).toBe("DROP TABLE users");
		});

		it("ignores SELECT, INSERT, UPDATE, DELETE queries", () => {
			const { loggingFn, statements } = createDdlCapture();

			loggingFn("Executing (default): SELECT * FROM users");
			loggingFn("Executing (default): INSERT INTO users VALUES (1)");
			loggingFn("Executing (default): UPDATE users SET name = 'test'");
			loggingFn("Executing (default): DELETE FROM users WHERE id = 1");

			expect(statements).toHaveLength(0);
		});

		it("handles statements without Sequelize prefix", () => {
			const { loggingFn, statements } = createDdlCapture();

			loggingFn("ALTER TABLE users ADD COLUMN email VARCHAR(255)");

			expect(statements).toHaveLength(1);
			expect(statements[0]).toBe("ALTER TABLE users ADD COLUMN email VARCHAR(255)");
		});

		it("captures multiple DDL statements", () => {
			const { loggingFn, statements } = createDdlCapture();

			loggingFn("Executing (default): CREATE TABLE users (id SERIAL PRIMARY KEY)");
			loggingFn("Executing (default): ALTER TABLE users ADD COLUMN name VARCHAR(255)");
			loggingFn("Executing (default): CREATE INDEX idx_users_name ON users(name)");

			expect(statements).toHaveLength(3);
		});

		it("captures lowercase DDL statements (case-insensitive)", () => {
			const { loggingFn, statements } = createDdlCapture();

			loggingFn("alter table users add column name varchar(255)");
			loggingFn("create index idx_users_name on users(name)");
			loggingFn("drop index idx_old");

			expect(statements).toHaveLength(3);
			// Verify original case is preserved
			expect(statements[0]).toBe("alter table users add column name varchar(255)");
		});
	});

	describe("createDryRunSequelize", () => {
		it("creates Sequelize instance with correct connection URI", () => {
			const loggingFn = vi.fn();

			const sequelize = createDryRunSequelize(
				{
					scheme: "postgresql",
					host: "localhost",
					port: 5432,
					noPort: false,
					database: "testdb",
					username: "testuser",
					password: "testpass",
					ssl: false,
				},
				loggingFn,
			);

			// Verify it's a Sequelize instance
			expect(sequelize).toBeDefined();
			expect(sequelize.getDialect()).toBe("postgres");
			expect(sequelize.config.database).toBe("testdb");
		});

		it("handles special characters in username and password", () => {
			const loggingFn = vi.fn();

			// Should not throw with special characters
			const sequelize = createDryRunSequelize(
				{
					scheme: "postgresql",
					host: "localhost",
					port: 5432,
					noPort: false,
					database: "testdb",
					username: "user@domain",
					password: "pass#word!@$",
					ssl: false,
				},
				loggingFn,
			);

			expect(sequelize).toBeDefined();
		});

		it("omits port when noPort is true", () => {
			const loggingFn = vi.fn();

			// noPort=true creates URI without port (e.g., postgresql://user:pass@host/db)
			// Sequelize may still parse a default port, but the URI excludes it
			const sequelize = createDryRunSequelize(
				{
					scheme: "postgresql",
					host: "localhost",
					port: 5432,
					noPort: true,
					database: "testdb",
					username: "testuser",
					password: "testpass",
					ssl: false,
				},
				loggingFn,
			);

			expect(sequelize).toBeDefined();
			// Sequelize still parses connection details internally
			// The test just verifies the function doesn't throw with noPort=true
			expect(sequelize.config.database).toBe("testdb");
		});

		it("includes query params when provided", () => {
			const loggingFn = vi.fn();

			const sequelize = createDryRunSequelize(
				{
					scheme: "postgresql",
					host: "localhost",
					port: 5432,
					noPort: false,
					database: "testdb",
					username: "testuser",
					password: "testpass",
					queryParams: "sslmode=require",
					ssl: true,
				},
				loggingFn,
			);

			expect(sequelize).toBeDefined();
		});
	});

	describe("captureSchemaState", () => {
		it("captures table and column state from information_schema", async () => {
			const mockSequelize = {
				query: vi.fn().mockResolvedValue([
					[
						{
							table_name: "users",
							column_name: "id",
							data_type: "integer",
							is_nullable: "NO",
							column_default: "nextval('users_id_seq')",
						},
						{
							table_name: "users",
							column_name: "name",
							data_type: "character varying",
							is_nullable: "YES",
							column_default: null,
						},
						{
							table_name: "docs",
							column_name: "id",
							data_type: "uuid",
							is_nullable: "NO",
							column_default: null,
						},
					],
				]),
			};

			const result = await captureSchemaState(mockSequelize as never);

			expect(result.size).toBe(2);
			expect(result.has("users")).toBe(true);
			expect(result.has("docs")).toBe(true);

			const usersTable = result.get("users");
			expect(usersTable).toBeDefined();
			expect(usersTable?.columns.size).toBe(2);
			expect(usersTable?.columns.get("id")?.dataType).toBe("integer");
			expect(usersTable?.columns.get("id")?.isNullable).toBe(false);
			expect(usersTable?.columns.get("name")?.isNullable).toBe(true);

			const docsTable = result.get("docs");
			expect(docsTable).toBeDefined();
			expect(docsTable?.columns.size).toBe(1);
			expect(docsTable?.columns.get("id")?.dataType).toBe("uuid");
		});

		it("returns empty map when no tables exist", async () => {
			const mockSequelize = {
				query: vi.fn().mockResolvedValue([[]]),
			};

			const result = await captureSchemaState(mockSequelize as never);

			expect(result.size).toBe(0);
		});
	});

	describe("diffSchemas", () => {
		// Use a more explicit type for the helper
		interface TestColumnState {
			tableName: string;
			columnName: string;
			dataType: string;
			isNullable: boolean;
			columnDefault: string | null;
		}

		interface TestTableState {
			tableName: string;
			columns: Map<string, TestColumnState>;
		}

		function createTableState(
			tableName: string,
			columns: Array<{ name: string; dataType: string; nullable: boolean; default?: string | null }>,
		): Map<string, TestTableState> {
			const map = new Map<string, TestTableState>();
			const colMap = new Map<string, TestColumnState>();
			for (const col of columns) {
				colMap.set(col.name, {
					tableName,
					columnName: col.name,
					dataType: col.dataType,
					isNullable: col.nullable,
					columnDefault: col.default ?? null,
				});
			}
			map.set(tableName, { tableName, columns: colMap });
			return map;
		}

		it("detects added tables", () => {
			const before = new Map();
			const after = createTableState("users", [{ name: "id", dataType: "integer", nullable: false }]);

			const diffs = diffSchemas(before, after);

			expect(diffs).toHaveLength(1);
			expect(diffs[0]).toEqual({ type: "table_added", tableName: "users" });
		});

		it("detects removed tables", () => {
			const before = createTableState("users", [{ name: "id", dataType: "integer", nullable: false }]);
			const after = new Map();

			const diffs = diffSchemas(before, after);

			expect(diffs).toHaveLength(1);
			expect(diffs[0]).toEqual({ type: "table_removed", tableName: "users" });
		});

		it("detects added columns", () => {
			const before = createTableState("users", [{ name: "id", dataType: "integer", nullable: false }]);
			const after = createTableState("users", [
				{ name: "id", dataType: "integer", nullable: false },
				{ name: "email", dataType: "varchar", nullable: true },
			]);

			const diffs = diffSchemas(before, after);

			expect(diffs).toHaveLength(1);
			expect(diffs[0]).toEqual({ type: "column_added", tableName: "users", columnName: "email" });
		});

		it("detects removed columns", () => {
			const before = createTableState("users", [
				{ name: "id", dataType: "integer", nullable: false },
				{ name: "legacy_field", dataType: "text", nullable: true },
			]);
			const after = createTableState("users", [{ name: "id", dataType: "integer", nullable: false }]);

			const diffs = diffSchemas(before, after);

			expect(diffs).toHaveLength(1);
			expect(diffs[0]).toEqual({ type: "column_removed", tableName: "users", columnName: "legacy_field" });
		});

		it("detects column type changes", () => {
			const before = createTableState("users", [{ name: "score", dataType: "integer", nullable: true }]);
			const after = createTableState("users", [{ name: "score", dataType: "bigint", nullable: true }]);

			const diffs = diffSchemas(before, after);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].type).toBe("column_changed");
			expect(diffs[0].columnName).toBe("score");
			expect(diffs[0].details).toContain("type: integer → bigint");
		});

		it("detects nullable changes", () => {
			const before = createTableState("users", [{ name: "email", dataType: "varchar", nullable: true }]);
			const after = createTableState("users", [{ name: "email", dataType: "varchar", nullable: false }]);

			const diffs = diffSchemas(before, after);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].type).toBe("column_changed");
			expect(diffs[0].details).toContain("nullable: true → false");
		});

		it("detects default value changes", () => {
			const before = createTableState("users", [
				{ name: "status", dataType: "varchar", nullable: false, default: "'active'" },
			]);
			const after = createTableState("users", [
				{ name: "status", dataType: "varchar", nullable: false, default: "'pending'" },
			]);

			const diffs = diffSchemas(before, after);

			expect(diffs).toHaveLength(1);
			expect(diffs[0].type).toBe("column_changed");
			expect(diffs[0].details).toContain("default:");
		});

		it("ignores cosmetic default differences (type casts)", () => {
			const before = createTableState("users", [
				{ name: "status", dataType: "varchar", nullable: false, default: "'active'::character varying" },
			]);
			const after = createTableState("users", [
				{ name: "status", dataType: "varchar", nullable: false, default: "'active'" },
			]);

			const diffs = diffSchemas(before, after);

			// No changes - the type cast is stripped for comparison
			expect(diffs).toHaveLength(0);
		});

		it("treats all nextval sequences as equivalent", () => {
			const before = createTableState("users", [
				{ name: "id", dataType: "integer", nullable: false, default: "nextval('users_id_seq'::regclass)" },
			]);
			const after = createTableState("users", [
				{ name: "id", dataType: "integer", nullable: false, default: "nextval('users_id_seq2'::regclass)" },
			]);

			const diffs = diffSchemas(before, after);

			// No changes - both are sequences
			expect(diffs).toHaveLength(0);
		});

		it("returns empty array when schemas are identical", () => {
			const before = createTableState("users", [
				{ name: "id", dataType: "integer", nullable: false },
				{ name: "name", dataType: "varchar", nullable: true },
			]);
			const after = createTableState("users", [
				{ name: "id", dataType: "integer", nullable: false },
				{ name: "name", dataType: "varchar", nullable: true },
			]);

			const diffs = diffSchemas(before, after);

			expect(diffs).toHaveLength(0);
		});

		it("handles multiple tables with multiple changes", () => {
			const before = new Map([
				[
					"users",
					{
						tableName: "users",
						columns: new Map([
							[
								"id",
								{
									tableName: "users",
									columnName: "id",
									dataType: "integer",
									isNullable: false,
									columnDefault: null,
								},
							],
						]),
					},
				],
				[
					"old_table",
					{
						tableName: "old_table",
						columns: new Map([
							[
								"id",
								{
									tableName: "old_table",
									columnName: "id",
									dataType: "integer",
									isNullable: false,
									columnDefault: null,
								},
							],
						]),
					},
				],
			]);

			const after = new Map([
				[
					"users",
					{
						tableName: "users",
						columns: new Map([
							[
								"id",
								{
									tableName: "users",
									columnName: "id",
									dataType: "integer",
									isNullable: false,
									columnDefault: null,
								},
							],
							[
								"email",
								{
									tableName: "users",
									columnName: "email",
									dataType: "varchar",
									isNullable: true,
									columnDefault: null,
								},
							],
						]),
					},
				],
				[
					"new_table",
					{
						tableName: "new_table",
						columns: new Map([
							[
								"id",
								{
									tableName: "new_table",
									columnName: "id",
									dataType: "uuid",
									isNullable: false,
									columnDefault: null,
								},
							],
						]),
					},
				],
			]);

			const diffs = diffSchemas(before as never, after as never);

			expect(diffs).toHaveLength(3);
			expect(diffs).toContainEqual({ type: "table_added", tableName: "new_table" });
			expect(diffs).toContainEqual({ type: "table_removed", tableName: "old_table" });
			expect(diffs).toContainEqual({ type: "column_added", tableName: "users", columnName: "email" });
		});
	});

	describe("formatSchemaDiffs", () => {
		it("formats table_added diff", () => {
			const result = formatSchemaDiffs([{ type: "table_added", tableName: "users" }]);
			expect(result).toEqual(["CREATE TABLE users"]);
		});

		it("formats table_removed diff", () => {
			const result = formatSchemaDiffs([{ type: "table_removed", tableName: "old_table" }]);
			expect(result).toEqual(["DROP TABLE old_table"]);
		});

		it("formats column_added diff", () => {
			const result = formatSchemaDiffs([{ type: "column_added", tableName: "users", columnName: "email" }]);
			expect(result).toEqual(["ALTER TABLE users ADD COLUMN email"]);
		});

		it("formats column_removed diff", () => {
			const result = formatSchemaDiffs([{ type: "column_removed", tableName: "users", columnName: "legacy" }]);
			expect(result).toEqual(["ALTER TABLE users DROP COLUMN legacy"]);
		});

		it("formats column_changed diff with details", () => {
			const result = formatSchemaDiffs([
				{
					type: "column_changed",
					tableName: "users",
					columnName: "score",
					details: "type: integer → bigint",
				},
			]);
			expect(result).toEqual(["ALTER TABLE users ALTER COLUMN score (type: integer → bigint)"]);
		});

		it("formats multiple diffs", () => {
			const result = formatSchemaDiffs([
				{ type: "table_added", tableName: "new_table" },
				{ type: "column_added", tableName: "users", columnName: "email" },
				{ type: "column_removed", tableName: "users", columnName: "legacy" },
			]);

			expect(result).toHaveLength(3);
			expect(result[0]).toBe("CREATE TABLE new_table");
			expect(result[1]).toBe("ALTER TABLE users ADD COLUMN email");
			expect(result[2]).toBe("ALTER TABLE users DROP COLUMN legacy");
		});

		it("returns empty array for empty diffs", () => {
			const result = formatSchemaDiffs([]);
			expect(result).toEqual([]);
		});
	});

	describe("runDryRunCheck", () => {
		// Helper to create mock schema query responses
		function createSchemaRows(
			tables: Array<{ tableName: string; columns: Array<{ name: string; type: string; nullable: boolean }> }>,
		) {
			const rows: Array<Record<string, unknown>> = [];
			for (const table of tables) {
				for (const col of table.columns) {
					rows.push({
						table_name: table.tableName,
						column_name: col.name,
						data_type: col.type,
						is_nullable: col.nullable ? "YES" : "NO",
						column_default: null,
					});
				}
			}
			return [rows];
		}

		it("returns hasChanges=false when schema is unchanged", async () => {
			// Same schema before and after
			const schemaRows = createSchemaRows([
				{ tableName: "users", columns: [{ name: "id", type: "integer", nullable: false }] },
			]);

			const mockSequelize = {
				query: vi.fn().mockResolvedValue(schemaRows),
				close: vi.fn().mockResolvedValue(undefined),
			};
			const mockCreateDb = vi.fn().mockResolvedValue(undefined);

			const result = await runDryRunCheck(mockSequelize as never, mockCreateDb);

			expect(result.hasChanges).toBe(false);
			expect(result.ddlStatements).toHaveLength(0);
			expect(result.error).toBeUndefined();
			expect(mockSequelize.query).toHaveBeenCalledWith("BEGIN");
			expect(mockSequelize.query).toHaveBeenCalledWith("ROLLBACK");
		});

		it("returns hasChanges=true when schema has real changes", async () => {
			// Schema before: just id column
			const schemaBefore = createSchemaRows([
				{ tableName: "users", columns: [{ name: "id", type: "integer", nullable: false }] },
			]);
			// Schema after: id + email column
			const schemaAfter = createSchemaRows([
				{
					tableName: "users",
					columns: [
						{ name: "id", type: "integer", nullable: false },
						{ name: "email", type: "varchar", nullable: true },
					],
				},
			]);

			let queryCallCount = 0;
			const mockSequelize = {
				query: vi.fn().mockImplementation((sql: string) => {
					queryCallCount++;
					// First query is captureSchemaState before, second is after
					if (sql.includes("information_schema")) {
						if (queryCallCount === 1) {
							return Promise.resolve(schemaBefore);
						}
						return Promise.resolve(schemaAfter);
					}
					return Promise.resolve([]);
				}),
				close: vi.fn().mockResolvedValue(undefined),
			};
			const mockCreateDb = vi.fn().mockResolvedValue(undefined);

			const result = await runDryRunCheck(mockSequelize as never, mockCreateDb);

			expect(result.hasChanges).toBe(true);
			expect(result.ddlStatements).toHaveLength(1);
			expect(result.ddlStatements[0]).toBe("ALTER TABLE users ADD COLUMN email");
		});

		it("returns error when createDb fails", async () => {
			const schemaRows = createSchemaRows([
				{ tableName: "users", columns: [{ name: "id", type: "integer", nullable: false }] },
			]);

			const mockSequelize = {
				query: vi.fn().mockResolvedValue(schemaRows),
				close: vi.fn().mockResolvedValue(undefined),
			};
			const mockCreateDb = vi.fn().mockRejectedValue(new Error("Database sync failed"));

			const result = await runDryRunCheck(mockSequelize as never, mockCreateDb);

			expect(result.hasChanges).toBe(false);
			expect(result.error).toBe("Database sync failed");
		});

		it("attempts rollback on createDb failure", async () => {
			const schemaRows = createSchemaRows([
				{ tableName: "users", columns: [{ name: "id", type: "integer", nullable: false }] },
			]);

			const mockSequelize = {
				query: vi.fn().mockResolvedValue(schemaRows),
				close: vi.fn().mockResolvedValue(undefined),
			};
			const mockCreateDb = vi.fn().mockRejectedValue(new Error("Database sync failed"));

			await runDryRunCheck(mockSequelize as never, mockCreateDb);

			// Should call ROLLBACK after failure
			expect(mockSequelize.query).toHaveBeenCalledWith("ROLLBACK");
		});

		it("handles rollback failure gracefully", async () => {
			const schemaRows = createSchemaRows([
				{ tableName: "users", columns: [{ name: "id", type: "integer", nullable: false }] },
			]);

			const mockSequelize = {
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql === "ROLLBACK") {
						return Promise.reject(new Error("Rollback failed"));
					}
					return Promise.resolve(schemaRows);
				}),
				close: vi.fn().mockResolvedValue(undefined),
			};
			const mockCreateDb = vi.fn().mockRejectedValue(new Error("Database sync failed"));

			// Should not throw even when rollback fails
			const result = await runDryRunCheck(mockSequelize as never, mockCreateDb);

			expect(result.error).toBe("Database sync failed");
		});

		it("handles non-Error thrown values in runDryRunCheck", async () => {
			const mockSequelize = {
				query: vi.fn().mockResolvedValue([[]]),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
					},
				}),
				close: vi.fn().mockResolvedValue(undefined),
			};
			// Throw a non-Error value (string)
			const mockCreateDb = vi.fn().mockRejectedValue("Something bad happened");

			const result = await runDryRunCheck(mockSequelize as never, mockCreateDb);

			expect(result.status).toBe("error");
			expect(result.error).toBe("Something bad happened");
		});
	});

	describe("runDryRun", () => {
		// Create a mock registry client for these tests
		function createMockRegistryClientForDryRun() {
			return {
				close: vi.fn().mockResolvedValue(undefined),
				getTenant: vi.fn(),
				getTenantBySlug: vi.fn(),
				getTenantByDomain: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
				listTenants: vi.fn(),
				listAllActiveTenants: vi.fn().mockResolvedValue([]),
				getOrg: vi.fn(),
				getOrgBySlug: vi.fn(),
				getDefaultOrg: vi.fn(),
				listOrgs: vi.fn(),
				listAllActiveOrgs: vi.fn().mockResolvedValue([]),
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
			};
		}

		let mockRegistryClient: ReturnType<typeof createMockRegistryClientForDryRun>;

		beforeEach(async () => {
			// Ensure PSTORE_ENV is not set - these tests use local config only
			// This prevents the ParameterStoreLoader code path from being triggered
			delete process.env.PSTORE_ENV;

			// Reset the createTenantRegistryClient mock to return our mock client
			mockRegistryClient = createMockRegistryClientForDryRun();
			const { createTenantRegistryClient } = await import("../tenant/TenantRegistryClient");
			vi.mocked(createTenantRegistryClient).mockReturnValue(mockRegistryClient as never);

			// Reset the createTenantSequelize mock to return a proper mock sequelize
			const { createTenantSequelize } = await import("../tenant/TenantSequelizeFactory");
			vi.mocked(createTenantSequelize).mockReturnValue({
				query: vi.fn().mockResolvedValue([]),
				sync: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
				getQueryInterface: vi.fn().mockReturnValue({
					showAllTables: vi.fn().mockResolvedValue([]),
				}),
			} as never);
		});

		it("returns error when MULTI_TENANT_REGISTRY_URL is not configured", async () => {
			delete process.env.MULTI_TENANT_REGISTRY_URL;

			const result = await runDryRun();

			expect(result.hasChanges).toBe(false);
			expect(result.ddlStatements).toEqual([]);
			expect(result.error).toBe("MULTI_TENANT_REGISTRY_URL not configured - cannot run dry-run");
		});

		it("returns no_changes when no active tenants found (fresh environment)", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);

			const result = await runDryRun();

			expect(result.status).toBe("no_changes");
			expect(result.hasChanges).toBe(false);
			expect(result.ddlStatements).toEqual([]);
			expect(result.error).toBeUndefined();
		});

		it("returns error when no database config for tenant", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			const mockTenant: Tenant = {
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
			};
			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "engineering",
				displayName: "Engineering",
				schemaName: "org_engineering",
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
				isDefault: true,
			};
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([mockTenant]);
			mockRegistryClient.listAllActiveOrgs.mockResolvedValue([mockOrg]);
			mockRegistryClient.getTenantDatabaseConfig.mockResolvedValue(null);

			const result = await runDryRun();

			expect(result.hasChanges).toBe(false);
			expect(result.error).toBe("No database config for tenant: acme");
		});

		it("returns error when no active orgs for tenant", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			const mockTenant: Tenant = {
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
			};
			const mockDbConfig: TenantDatabaseConfig = {
				tenantId: "tenant-1",
				databaseHost: "localhost",
				databasePort: 5432,
				databaseName: "acme_db",
				databaseUsername: "acme_user",
				databasePasswordEncrypted: "password123",
				databaseSsl: false,
				databasePoolMax: 5,
			};
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([mockTenant]);
			mockRegistryClient.getTenantDatabaseConfig.mockResolvedValue(mockDbConfig);
			mockRegistryClient.listAllActiveOrgs.mockResolvedValue([]);

			const result = await runDryRun();

			expect(result.hasChanges).toBe(false);
			expect(result.error).toBe("No active orgs for tenant: acme");
		});

		it("uses canary tenant/org for dry-run check", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			const mockTenant: Tenant = {
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
			};
			const mockDbConfig: TenantDatabaseConfig = {
				tenantId: "tenant-1",
				databaseHost: "db.acme.com",
				databasePort: 5432,
				databaseName: "acme_db",
				databaseUsername: "acme_user",
				databasePasswordEncrypted: "password123",
				databaseSsl: true,
				databasePoolMax: 5,
			};
			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "engineering",
				displayName: "Engineering",
				schemaName: "org_engineering",
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
				isDefault: true,
			};
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([mockTenant]);
			mockRegistryClient.getTenantDatabaseConfig.mockResolvedValue(mockDbConfig);
			mockRegistryClient.listAllActiveOrgs.mockResolvedValue([mockOrg]);

			const result = await runDryRun();

			// Verify registry client was closed
			expect(mockRegistryClient.close).toHaveBeenCalled();
			// Should return a result (no changes since mock sequelize returns empty tables)
			expect(result).toHaveProperty("hasChanges");
			expect(result).toHaveProperty("ddlStatements");
			// Console should show which canary was used (default = first org)
			// Logger adds timestamp prefix, so use stringContaining
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[DRY RUN] Using default canary (first org): acme/engineering"),
			);
		});

		it("uses configured canary when both CANARY_TENANT_SLUG and CANARY_ORG_SLUG are set", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			process.env.CANARY_TENANT_SLUG = "canary-tenant";
			process.env.CANARY_ORG_SLUG = "canary-org";
			const mockTenant: Tenant = {
				id: "tenant-1",
				slug: "canary-tenant",
				displayName: "Canary Tenant",
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
			};
			const mockDbConfig: TenantDatabaseConfig = {
				tenantId: "tenant-1",
				databaseHost: "db.canary.com",
				databasePort: 5432,
				databaseName: "canary_db",
				databaseUsername: "canary_user",
				databasePasswordEncrypted: "password123",
				databaseSsl: true,
				databasePoolMax: 5,
			};
			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "canary-org",
				displayName: "Canary Org",
				schemaName: "org_canary",
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
				isDefault: true,
			};
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([mockTenant]);
			mockRegistryClient.getTenantDatabaseConfig.mockResolvedValue(mockDbConfig);
			mockRegistryClient.listAllActiveOrgs.mockResolvedValue([mockOrg]);

			const result = await runDryRun();

			expect(result).toHaveProperty("hasChanges");
			// Logger adds timestamp prefix, so use stringContaining
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[DRY RUN] Using configured canary: canary-tenant/canary-org"),
			);
		});

		it("returns error when only CANARY_TENANT_SLUG is set without CANARY_ORG_SLUG", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			process.env.CANARY_TENANT_SLUG = "canary-tenant";
			delete process.env.CANARY_ORG_SLUG;

			const result = await runDryRun();

			expect(result.hasChanges).toBe(false);
			expect(result.ddlStatements).toEqual([]);
			expect(result.error).toContain("Both CANARY_TENANT_SLUG and CANARY_ORG_SLUG must be specified together");
			expect(result.error).toContain("tenant=canary-tenant");
			expect(result.error).toContain("org=(not set)");
		});

		it("returns error when only CANARY_ORG_SLUG is set without CANARY_TENANT_SLUG", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			delete process.env.CANARY_TENANT_SLUG;
			process.env.CANARY_ORG_SLUG = "canary-org";

			const result = await runDryRun();

			expect(result.hasChanges).toBe(false);
			expect(result.ddlStatements).toEqual([]);
			expect(result.error).toContain("Both CANARY_TENANT_SLUG and CANARY_ORG_SLUG must be specified together");
			expect(result.error).toContain("tenant=(not set)");
			expect(result.error).toContain("org=canary-org");
		});

		it("returns error when configured canary tenant not found", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			process.env.CANARY_TENANT_SLUG = "nonexistent-tenant";
			process.env.CANARY_ORG_SLUG = "canary-org";
			// Return different tenant than the configured canary
			const mockTenant: Tenant = {
				id: "tenant-1",
				slug: "other-tenant",
				displayName: "Other Tenant",
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
			};
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([mockTenant]);

			const result = await runDryRun();

			expect(result.hasChanges).toBe(false);
			expect(result.ddlStatements).toEqual([]);
			expect(result.error).toBe("Configured canary tenant not found or inactive: nonexistent-tenant");
		});

		it("returns error when configured canary org not found", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			process.env.CANARY_TENANT_SLUG = "canary-tenant";
			process.env.CANARY_ORG_SLUG = "nonexistent-org";
			const mockTenant: Tenant = {
				id: "tenant-1",
				slug: "canary-tenant",
				displayName: "Canary Tenant",
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
			};
			const mockDbConfig: TenantDatabaseConfig = {
				tenantId: "tenant-1",
				databaseHost: "db.canary.com",
				databasePort: 5432,
				databaseName: "canary_db",
				databaseUsername: "canary_user",
				databasePasswordEncrypted: "password123",
				databaseSsl: true,
				databasePoolMax: 5,
			};
			// Return different org than the configured canary
			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "other-org",
				displayName: "Other Org",
				schemaName: "org_other",
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
				isDefault: true,
			};
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([mockTenant]);
			mockRegistryClient.getTenantDatabaseConfig.mockResolvedValue(mockDbConfig);
			mockRegistryClient.listAllActiveOrgs.mockResolvedValue([mockOrg]);

			const result = await runDryRun();

			expect(result.hasChanges).toBe(false);
			expect(result.ddlStatements).toEqual([]);
			expect(result.error).toBe("Configured canary org not found or inactive: canary-tenant/nonexistent-org");
		});

		it("loads config from Parameter Store when PSTORE_ENV is set", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			process.env.PSTORE_ENV = "staging";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);

			// Re-mock the ParameterStoreLoader since vi.clearAllMocks() cleared it
			const { ParameterStoreLoader } = await import("../config/ParameterStoreLoader");
			vi.mocked(ParameterStoreLoader).mockImplementation(
				() =>
					({
						load: vi.fn().mockResolvedValue({}),
					}) as never,
			);

			const result = await runDryRun();

			// No tenants = no changes
			expect(result.status).toBe("no_changes");
			expect(result.hasChanges).toBe(false);
			// Verify it attempted to load from Parameter Store
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("[DRY RUN] Loaded config from Parameter Store (staging)"),
			);
		});

		it("closes registry client even on error", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockRejectedValue(new Error("Registry connection failed"));

			await expect(runDryRun()).rejects.toThrow("Registry connection failed");
			expect(mockRegistryClient.close).toHaveBeenCalled();
		});
	});

	describe("formatDryRunResult", () => {
		it("formats error result correctly", () => {
			const result = formatDryRunResult({
				status: "error",
				hasChanges: false,
				ddlStatements: [],
				error: "Something went wrong",
			});

			expect(result.exitCode).toBe(EXIT_CODES.ERROR);
			expect(result.messages).toHaveLength(1);
			expect(result.messages[0]).toEqual({
				level: "error",
				message: "[DRY RUN] Error: Something went wrong",
			});
		});

		it("formats has_changes result correctly", () => {
			const result = formatDryRunResult({
				status: "has_changes",
				hasChanges: true,
				ddlStatements: [
					"ALTER TABLE users ADD COLUMN email VARCHAR(255)",
					"CREATE INDEX idx_email ON users(email)",
				],
			});

			expect(result.exitCode).toBe(EXIT_CODES.CHANGES_DETECTED);
			expect(result.messages).toHaveLength(4); // header + 2 statements + warning
			expect(result.messages[0].level).toBe("info");
			expect(result.messages[0].message).toContain("Schema changes that would be applied");
			expect(result.messages[1].message).toContain("ALTER TABLE users");
			expect(result.messages[2].message).toContain("CREATE INDEX");
			expect(result.messages[3].level).toBe("warn");
			expect(result.messages[3].message).toContain("2 schema change(s) detected");
		});

		it("formats no_changes result correctly", () => {
			const result = formatDryRunResult({
				status: "no_changes",
				hasChanges: false,
				ddlStatements: [],
			});

			expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
			expect(result.messages).toHaveLength(1);
			expect(result.messages[0]).toEqual({
				level: "info",
				message: "✓ No schema changes needed - schemas are up to date",
			});
		});
	});

	describe("runMigrationCli", () => {
		function createMockLogger(): MigrateLogger {
			return {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				debug: vi.fn(),
			};
		}

		function createMockRegistryClientForCli() {
			return {
				close: vi.fn().mockResolvedValue(undefined),
				getTenant: vi.fn(),
				getTenantBySlug: vi.fn(),
				getTenantByDomain: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
				listTenants: vi.fn(),
				listAllActiveTenants: vi.fn().mockResolvedValue([]),
				getOrg: vi.fn(),
				getOrgBySlug: vi.fn(),
				getDefaultOrg: vi.fn(),
				listOrgs: vi.fn(),
				listAllActiveOrgs: vi.fn().mockResolvedValue([]),
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
			};
		}

		let mockRegistryClient: ReturnType<typeof createMockRegistryClientForCli>;

		beforeEach(async () => {
			delete process.env.PSTORE_ENV;
			delete process.env.SKIP_SCHEMA_MIGRATIONS;

			mockRegistryClient = createMockRegistryClientForCli();
			const { createTenantRegistryClient } = await import("../tenant/TenantRegistryClient");
			vi.mocked(createTenantRegistryClient).mockReturnValue(mockRegistryClient as never);

			const { createTenantSequelize } = await import("../tenant/TenantSequelizeFactory");
			vi.mocked(createTenantSequelize).mockReturnValue({
				query: vi.fn().mockResolvedValue([]),
				sync: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
				getQueryInterface: vi.fn().mockReturnValue({
					showAllTables: vi.fn().mockResolvedValue([]),
				}),
			} as never);
		});

		it("returns error exit code for validation errors", async () => {
			const mockLogger = createMockLogger();

			// Only provide canary-tenant without canary-org (validation error)
			const result = await runMigrationCli(["--canary-tenant", "acme"], mockLogger);

			expect(result.exitCode).toBe(EXIT_CODES.ERROR);
			expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("--canary-tenant and --canary-org"));
		});

		it("returns error exit code for validation errors without logger", async () => {
			// Only provide canary-tenant without canary-org (validation error)
			// Don't provide a logger - should use default console logger
			const result = await runMigrationCli(["--canary-tenant", "acme"]);

			expect(result.exitCode).toBe(EXIT_CODES.ERROR);
			// Verify it logged to console (the default logger)
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("--canary-tenant and --canary-org"));
		});

		it("returns success exit code when skip migrations is set", async () => {
			process.env.SKIP_SCHEMA_MIGRATIONS = "true";
			const mockLogger = createMockLogger();

			const result = await runMigrationCli([], mockLogger);

			expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("SKIP_SCHEMA_MIGRATIONS=true"));
		});

		it("handles dry-run mode and returns appropriate exit code", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);
			const mockLogger = createMockLogger();

			const result = await runMigrationCli(["--dry-run"], mockLogger);

			// No tenants = no_changes = success
			expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
		});

		it("returns error exit code when migration fails", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			// Force an error by not setting up mocks properly
			mockRegistryClient.listAllActiveTenants.mockRejectedValue(new Error("Connection failed"));
			const mockLogger = createMockLogger();

			const result = await runMigrationCli([], mockLogger);

			expect(result.exitCode).toBe(EXIT_CODES.ERROR);
			expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Connection failed"));
		});

		it("prints header with correct mode for check-only", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);
			const mockLogger = createMockLogger();

			await runMigrationCli(["--check-only"], mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("CHECK ONLY"));
		});

		it("prints header with correct mode for dry-run", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);
			const mockLogger = createMockLogger();

			await runMigrationCli(["--dry-run"], mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("DRY RUN"));
		});

		it("prints header with correct mode for live migration", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);
			const mockLogger = createMockLogger();

			await runMigrationCli([], mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("LIVE"));
		});

		it("returns error exit code when migrations complete with failures", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			const mockTenant: Tenant = {
				id: "tenant-1",
				slug: "test-tenant",
				displayName: "Test Tenant",
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
			};
			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "default",
				displayName: "Default",
				schemaName: "org_default",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const mockDbConfig: TenantDatabaseConfig = {
				tenantId: "tenant-1",
				databaseHost: "localhost",
				databasePort: 5432,
				databaseName: "testdb",
				databaseUsername: "user",
				databasePasswordEncrypted: "password",
				databaseSsl: false,
				databasePoolMax: 10,
			};

			mockRegistryClient.listAllActiveTenants.mockResolvedValue([mockTenant]);
			mockRegistryClient.listAllActiveOrgs.mockResolvedValue([mockOrg]);
			mockRegistryClient.getTenantDatabaseConfig.mockResolvedValue(mockDbConfig);

			// Mock createTenantSequelize to return a sequelize that throws on authenticate
			const { createTenantSequelize } = await import("../tenant/TenantSequelizeFactory");
			vi.mocked(createTenantSequelize).mockReturnValue({
				query: vi.fn().mockResolvedValue([[]]),
				sync: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
				authenticate: vi.fn().mockRejectedValue(new Error("Database connection failed")),
				getQueryInterface: vi.fn().mockReturnValue({
					showAllTables: vi.fn().mockResolvedValue([]),
				}),
			} as never);

			const mockLogger = createMockLogger();
			const result = await runMigrationCli([], mockLogger);

			expect(result.exitCode).toBe(EXIT_CODES.ERROR);
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining("Migration completed with 1 failure(s)"),
			);
		});

		it("prints header with verbose mode ON when --verbose flag is used", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);
			const mockLogger = createMockLogger();

			await runMigrationCli(["--verbose"], mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Verbose: ON"));
		});

		it("prints header with verbose mode OFF when --verbose flag is not used", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);
			const mockLogger = createMockLogger();

			await runMigrationCli([], mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Verbose: OFF"));
		});

		it("handles non-Error thrown values in catch block", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			// Mock to throw a non-Error value (string)
			mockRegistryClient.listAllActiveTenants.mockRejectedValue("Something went wrong");
			const mockLogger = createMockLogger();

			const result = await runMigrationCli([], mockLogger);

			expect(result.exitCode).toBe(EXIT_CODES.ERROR);
			expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Something went wrong"));
		});

		it("handles Error without stack in catch block", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			// Create an Error without a stack property
			const errorWithoutStack = new Error("Test error");
			delete (errorWithoutStack as { stack?: string }).stack;
			mockRegistryClient.listAllActiveTenants.mockRejectedValue(errorWithoutStack);
			const mockLogger = createMockLogger();

			const result = await runMigrationCli([], mockLogger);

			expect(result.exitCode).toBe(EXIT_CODES.ERROR);
			expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Test error"));
			// Should not have called logger.error with stack (since there isn't one)
			const errorCalls = (mockLogger.error as ReturnType<typeof vi.fn>).mock.calls;
			expect(errorCalls.length).toBe(1); // Only the error message, not the stack
		});

		it("creates default console logger when no logger is provided", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);

			// Call without providing a logger (should use default console logger)
			const result = await runMigrationCli([]);

			expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
			// Verify it used console.log (the default logger writes to console)
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("JOLLI SCHEMA MIGRATION"));
		});

		it("prints Parameter Store config in header when pstoreEnv is set", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			process.env.PSTORE_ENV = "production";
			mockRegistryClient.listAllActiveTenants.mockResolvedValue([]);

			// Re-mock the ParameterStoreLoader
			const { ParameterStoreLoader } = await import("../config/ParameterStoreLoader");
			vi.mocked(ParameterStoreLoader).mockImplementation(
				() =>
					({
						load: vi.fn().mockResolvedValue({}),
					}) as never,
			);

			const mockLogger = createMockLogger();
			await runMigrationCli([], mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith(
				expect.stringContaining("Config: Parameter Store (production)"),
			);
		});

		it("handles Error with stack in catch block", async () => {
			process.env.MULTI_TENANT_REGISTRY_URL = "postgres://test-registry";
			// Create an Error with a stack
			const errorWithStack = new Error("Test error with stack");
			mockRegistryClient.listAllActiveTenants.mockRejectedValue(errorWithStack);
			const mockLogger = createMockLogger();

			const result = await runMigrationCli([], mockLogger);

			expect(result.exitCode).toBe(EXIT_CODES.ERROR);
			expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Test error with stack"));
			// Should have called logger.error with the stack
			const errorCalls = (mockLogger.error as ReturnType<typeof vi.fn>).mock.calls;
			expect(errorCalls.length).toBeGreaterThan(1); // Error message + stack
			expect(errorCalls[1][0]).toContain("Error: Test error with stack");
		});
	});
});
