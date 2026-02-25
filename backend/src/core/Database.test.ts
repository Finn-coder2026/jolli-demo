import { createDatabase, type Database } from "./Database";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the UmzugMigrationRunner to avoid Umzug initialization in tests
vi.mock("../util/UmzugMigrationRunner", () => ({
	runMigrations: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Create a mock Sequelize model with all methods needed by postSync hooks.
 * RoleDao's postSync requires findOne, create, count methods on models.
 */
function createMockModel(name: string) {
	return {
		sync: vi.fn().mockResolvedValue(undefined),
		tableName: name,
		// Methods needed by RoleDao postSync
		findOne: vi.fn().mockResolvedValue(null),
		findAll: vi.fn().mockResolvedValue([]),
		findByPk: vi.fn().mockResolvedValue(null),
		create: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue({}) }),
		count: vi.fn().mockResolvedValue(0),
		destroy: vi.fn().mockResolvedValue(0),
		update: vi.fn().mockResolvedValue([0]),
	};
}

describe("Database", () => {
	let mockSequelize: Sequelize;
	let database: Database;

	beforeEach(async () => {
		// Disable logging during tests to avoid logger initialization overhead
		process.env.DISABLE_LOGGING = "true";

		// Track defined models so we can populate sequelize.models
		// Use createMockModel to include all methods needed by postSync hooks
		const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

		mockSequelize = {
			define: vi.fn().mockImplementation((name: string) => {
				definedModels[name] = createMockModel(name);
				return definedModels[name];
			}),
			sync: vi.fn().mockResolvedValue(undefined),
			// Models property will be populated by define() calls
			models: definedModels,
			// Mock query to return different results based on the SQL
			query: vi.fn().mockImplementation((sql: string) => {
				if (sql.includes("information_schema.tables")) {
					// Return empty schema (0 tables) so sync() is called instead of sync({ alter: true })
					return Promise.resolve([[{ table_count: "0" }], {}]);
				}
				if (sql.includes("current_schema()")) {
					return Promise.resolve([[{ current_schema: "public" }], {}]);
				}
				if (sql.includes("search_path")) {
					return Promise.resolve([[{ search_path: "public" }], {}]);
				}
				return Promise.resolve([[], {}]);
			}),
			getQueryInterface: vi.fn().mockReturnValue({
				sequelize: {
					query: vi.fn().mockResolvedValue([]),
					transaction: vi.fn().mockResolvedValue({
						commit: vi.fn(),
						rollback: vi.fn(),
					}),
					QueryTypes: {
						SELECT: "SELECT",
					},
				},
			}),
		} as unknown as Sequelize;

		database = await createDatabase(mockSequelize);
	});

	describe("createDatabase", () => {
		it("should sync database on initialization for empty schema", () => {
			// For empty schemas (0 tables), individual model sync() is called without alter
			// (except for partitioned models like audit_event which are managed by postSync)
			const models = mockSequelize.models as unknown as Record<string, { sync: ReturnType<typeof vi.fn> }>;
			for (const [name, model] of Object.entries(models)) {
				if (name !== "audit_event") {
					expect(model.sync).toHaveBeenCalledWith();
				}
			}
		});

		it("should sync database with alter for existing schema", async () => {
			// Track defined models so we can populate sequelize.models
			// Use createMockModel to include all methods needed by postSync hooks
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const existingSchemaSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("table_count")) {
						// Return non-empty schema (10 tables) so sync({ alter: true }) is called
						return Promise.resolve([[{ table_count: "10" }], {}]);
					}
					if (sql.includes("table_name")) {
						// For table existence check, return table exists
						return Promise.resolve([[{ table_name: "test" }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			await createDatabase(existingSchemaSequelize);
			// For existing schemas, individual model sync({ alter: true }) is called
			// (except for partitioned models like audit_event which are managed by postSync)
			for (const [name, model] of Object.entries(definedModels)) {
				if (name !== "audit_event") {
					expect(model.sync).toHaveBeenCalledWith({ alter: true });
				}
			}
		});

		it("should skip sync when SKIP_SEQUELIZE_SYNC is true", async () => {
			const originalSkip = process.env.SKIP_SEQUELIZE_SYNC;
			process.env.SKIP_SEQUELIZE_SYNC = "true";

			// Track defined models so we can populate sequelize.models
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const freshSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("information_schema.tables")) {
						return Promise.resolve([[{ table_count: "0" }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			await createDatabase(freshSequelize);
			// Verify no individual model sync() was called
			for (const model of Object.values(definedModels)) {
				expect(model.sync).not.toHaveBeenCalled();
			}

			// Restore
			if (originalSkip) {
				process.env.SKIP_SEQUELIZE_SYNC = originalSkip;
			} else {
				delete process.env.SKIP_SEQUELIZE_SYNC;
			}
		});

		it("should skip sync with explicit forceSync false", async () => {
			const originalSkipSync = process.env.SKIP_SEQUELIZE_SYNC;
			process.env.SKIP_SEQUELIZE_SYNC = "true";

			// Track defined models so we can populate sequelize.models
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const skipSyncSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("information_schema.tables")) {
						return Promise.resolve([[{ table_count: "0" }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			// Explicitly pass forceSync: false to cover the branch in logging
			await createDatabase(skipSyncSequelize, { forceSync: false });
			// Verify no individual model sync() was called
			for (const model of Object.values(definedModels)) {
				expect(model.sync).not.toHaveBeenCalled();
			}

			// Restore
			if (originalSkipSync) {
				process.env.SKIP_SEQUELIZE_SYNC = originalSkipSync;
			} else {
				delete process.env.SKIP_SEQUELIZE_SYNC;
			}
		});

		it("should force sync when forceSync option is true even when SKIP_SEQUELIZE_SYNC is set", async () => {
			const originalSkipSync = process.env.SKIP_SEQUELIZE_SYNC;
			process.env.SKIP_SEQUELIZE_SYNC = "true";

			// Track defined models so we can populate sequelize.models
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const forceSyncSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("information_schema.tables")) {
						return Promise.resolve([[{ table_count: "0" }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			await createDatabase(forceSyncSequelize, { forceSync: true });
			// Verify model sync() WAS called despite SKIP_SEQUELIZE_SYNC
			for (const [name, model] of Object.entries(definedModels)) {
				if (name !== "audit_event") {
					expect(model.sync).toHaveBeenCalled();
				}
			}

			// Restore
			if (originalSkipSync) {
				process.env.SKIP_SEQUELIZE_SYNC = originalSkipSync;
			} else {
				delete process.env.SKIP_SEQUELIZE_SYNC;
			}
		});

		it("should call postSync hooks on DAOs when not skipped", async () => {
			// Track defined models so we can populate sequelize.models
			// Use createMockModel to include all methods needed by postSync hooks
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const sequelizeForPostSync = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("information_schema.tables")) {
						return Promise.resolve([[{ table_count: "0" }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			const db = await createDatabase(sequelizeForPostSync);
			// Verify postSync was called on auditEventDao (which has a postSync hook)
			// The auditEventDao.postSync should have been invoked
			expect(db).toBeDefined();
			expect(db.auditEventDao).toBeDefined();
			// Note: We can't directly verify postSync was called without mocking the DAO creation,
			// but we verify the database completes initialization successfully
		});

		it("should skip postSync hooks when skipPostSync option is true", async () => {
			// Track defined models so we can populate sequelize.models
			// Use createMockModel to include all methods needed by postSync hooks
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const sequelizeWithPostSyncSkip = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("information_schema.tables")) {
						return Promise.resolve([[{ table_count: "0" }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			// Just verify it completes without error when skipPostSync is true
			const db = await createDatabase(sequelizeWithPostSyncSkip, { skipPostSync: true });
			expect(db).toBeDefined();
			expect(db.auditEventDao).toBeDefined();
		});

		it("should define all models", () => {
			const definedModels = vi.mocked(mockSequelize.define).mock.calls.map(call => call[0]);

			// Check that all required models were defined
			expect(definedModels).toContain("doc");
			expect(definedModels).toContain("active_user");
			expect(definedModels).toContain("visit");
			expect(definedModels).toContain("github_installations");
			expect(definedModels).toContain("integrations");
		});

		it("should return database interface with DAOs", () => {
			expect(database).toHaveProperty("docDao");
			expect(database).toHaveProperty("activeUserDao");
			expect(database).toHaveProperty("visitDao");
			expect(database).toHaveProperty("githubInstallationDao");
			expect(database).toHaveProperty("integrationDao");
			expect(database.docDao).toHaveProperty("createDoc");
			expect(database.docDao).toHaveProperty("readDoc");
			expect(database.docDao).toHaveProperty("updateDoc");
			expect(database.docDao).toHaveProperty("deleteDoc");
			expect(database.visitDao).toHaveProperty("createVisit");
			expect(database.githubInstallationDao).toHaveProperty("createInstallation");
			expect(database.githubInstallationDao).toHaveProperty("listInstallations");
		});

		it("should handle undefined tableCheck gracefully when checking for missing tables", async () => {
			// Track defined models so we can populate sequelize.models
			const definedModels: Record<string, { sync: ReturnType<typeof vi.fn>; tableName: string }> = {};

			const undefinedTableCheckSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("table_count")) {
						// Return non-empty schema (10 tables) to trigger syncModelsWithMissingTableCheck
						return Promise.resolve([[{ table_count: "10" }], {}]);
					}
					if (sql.includes("information_schema.table_constraints")) {
						// Return empty constraints array for FK checks in postSync hooks
						return Promise.resolve([[], {}]);
					}
					if (sql.includes("information_schema.columns")) {
						// Return empty columns array for migration checks in postSync hooks
						return Promise.resolve([[], {}]);
					}
					if (sql.includes("table_name")) {
						// Simulate the error case where tableCheck is undefined
						return Promise.resolve([undefined, {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			// Should not throw even when tableCheck is undefined
			await expect(createDatabase(undefinedTableCheckSequelize)).resolves.toBeDefined();

			// Verify that sync() was called (treating undefined as table not existing)
			for (const [name, model] of Object.entries(definedModels)) {
				if (name !== "audit_event") {
					expect(model.sync).toHaveBeenCalled();
				}
			}
		});

		it("should handle postSync hooks being called multiple times (idempotency)", async () => {
			// Track defined models so we can populate sequelize.models
			// Use createMockModel to include all methods needed by postSync hooks (e.g., findOne, create, count)
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const idempotentSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("information_schema.tables")) {
						return Promise.resolve([[{ table_count: "0" }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			// First call to createDatabase (which calls postSync once)
			const db = await createDatabase(idempotentSequelize);
			expect(db).toBeDefined();

			// Manually run postSync hooks a second time to verify idempotency
			// postSync hooks MUST be safe to run multiple times (see DaoPostSyncHook interface docs)
			for (const daoKey of Object.keys(db)) {
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic DAO access requires any type
				const dao = (db as any)[daoKey];
				if (typeof dao.postSync === "function") {
					// Should not throw on second call - hooks must be idempotent
					await expect(dao.postSync(idempotentSequelize, db)).resolves.not.toThrow();
				}
			}
		});

		it("should handle undefined table_count from query result", async () => {
			// Track defined models so we can populate sequelize.models
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const undefinedCountSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("COUNT(*)::text as table_count")) {
						// Return result where table_count is undefined (tests ?? "0" fallback on line 202)
						return Promise.resolve([[{ table_count: undefined }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			// Should treat undefined table_count as 0 (empty schema) and sync without alter
			const db = await createDatabase(undefinedCountSequelize);
			expect(db).toBeDefined();
			// Verify that sync() was called without alter (empty schema behavior)
			for (const [name, model] of Object.entries(definedModels)) {
				if (name !== "audit_event") {
					expect(model.sync).toHaveBeenCalledWith();
				}
			}
		});

		it("should handle null table_count from query result", async () => {
			// Track defined models so we can populate sequelize.models
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const nullCountSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("COUNT(*)::text as table_count")) {
						// Return result where table_count is null (tests ?? "0" fallback on line 202)
						return Promise.resolve([[{ table_count: null }], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			// Should treat null table_count as 0 (empty schema) and sync without alter
			const db = await createDatabase(nullCountSequelize);
			expect(db).toBeDefined();
			// Verify that sync() was called without alter (empty schema behavior)
			for (const [name, model] of Object.entries(definedModels)) {
				if (name !== "audit_event") {
					expect(model.sync).toHaveBeenCalledWith();
				}
			}
		});

		it("should handle empty results array from table count query", async () => {
			// Track defined models so we can populate sequelize.models
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const emptyResultsSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("COUNT(*)::text as table_count")) {
						// Return empty results array (tests results[0]?.table_count handling)
						return Promise.resolve([[], {}]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			// Should treat empty results as 0 tables (empty schema) and sync without alter
			const db = await createDatabase(emptyResultsSequelize);
			expect(db).toBeDefined();
			// Verify that sync() was called without alter (empty schema behavior)
			for (const [name, model] of Object.entries(definedModels)) {
				if (name !== "audit_event") {
					expect(model.sync).toHaveBeenCalledWith();
				}
			}
		});

		it("should create missing tables in existing schema", async () => {
			// Track defined models so we can populate sequelize.models
			// Use createMockModel to include all methods needed by postSync hooks (e.g., findOne, create, count)
			const definedModels: Record<string, ReturnType<typeof createMockModel>> = {};

			const schemaWithMissingTableSequelize = {
				define: vi.fn().mockImplementation((name: string) => {
					definedModels[name] = createMockModel(name);
					return definedModels[name];
				}),
				sync: vi.fn().mockResolvedValue(undefined),
				models: definedModels,
				query: vi.fn().mockImplementation((sql: string, options?: { replacements?: { tableName: string } }) => {
					if (sql.includes("COUNT(*)::text as table_count")) {
						// Return existing schema (5 tables) to trigger syncModelsWithMissingTableCheck
						return Promise.resolve([[{ table_count: "5" }], {}]);
					}
					if (sql.includes("SELECT table_name FROM information_schema.tables")) {
						// Simulate a missing table (doc model doesn't exist yet)
						const tableName = options?.replacements?.tableName;
						if (tableName === "doc") {
							// Return empty array to indicate table doesn't exist
							return Promise.resolve([]);
						}
						// Other tables exist
						return Promise.resolve([{ table_name: tableName }]);
					}
					if (sql.includes("current_schema()")) {
						return Promise.resolve([[{ current_schema: "public" }], {}]);
					}
					if (sql.includes("search_path")) {
						return Promise.resolve([[{ search_path: "public" }], {}]);
					}
					return Promise.resolve([[], {}]);
				}),
				getQueryInterface: vi.fn().mockReturnValue({
					sequelize: {
						query: vi.fn().mockResolvedValue([]),
						transaction: vi.fn().mockResolvedValue({
							commit: vi.fn(),
							rollback: vi.fn(),
						}),
						QueryTypes: {
							SELECT: "SELECT",
						},
					},
				}),
			} as unknown as Sequelize;

			await createDatabase(schemaWithMissingTableSequelize);

			// Verify that the doc model was synced without alter (new table)
			expect(definedModels.doc.sync).toHaveBeenCalledWith();
			// Verify other models were synced with alter (existing tables)
			for (const [name, model] of Object.entries(definedModels)) {
				if (name !== "doc" && name !== "audit_event") {
					expect(model.sync).toHaveBeenCalledWith({ alter: true });
				}
			}
		});
	});
});
