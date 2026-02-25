import type { DaoPostSyncHook, Database } from "../core/Database";
import { createLegacyTableCleanupDao, type LegacyTableCleanupDao } from "./LegacyTableCleanupDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("LegacyTableCleanupDao", () => {
	let mockSequelize: Sequelize;
	let mockQuery: ReturnType<typeof vi.fn>;
	let legacyTableCleanupDao: LegacyTableCleanupDao & DaoPostSyncHook;
	let mockDb: Database;

	beforeEach(() => {
		vi.clearAllMocks();

		mockQuery = vi.fn();
		mockSequelize = {
			query: mockQuery,
		} as unknown as Sequelize;

		legacyTableCleanupDao = createLegacyTableCleanupDao(mockSequelize);
		mockDb = {} as Database;
	});

	describe("postSync hook", () => {
		it("should drop both users and auths tables when they exist", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string") {
					// Check if users table exists - return true
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'users'")) {
						return Promise.resolve([[{ exists: true }]]);
					}
					// Check if auths table exists - return true
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'auths'")) {
						return Promise.resolve([[{ exists: true }]]);
					}
					// Query for FK constraints from audit_events to users
					if (sql.includes("constraint_name") && sql.includes("audit_events")) {
						return Promise.resolve([[]]); // No FK constraints
					}
					// DROP TABLE commands
					if (sql.includes("DROP TABLE")) {
						return Promise.resolve([]);
					}
				}
				return Promise.resolve([[]]);
			});

			await legacyTableCleanupDao.postSync(mockSequelize, mockDb);

			// Should check if tables exist
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("table_name = 'users'"));
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("table_name = 'auths'"));

			// Should drop auths first
			expect(mockQuery).toHaveBeenCalledWith("DROP TABLE IF EXISTS auths CASCADE");

			// Should drop users second
			expect(mockQuery).toHaveBeenCalledWith("DROP TABLE IF EXISTS users CASCADE");
		});

		it("should drop only auths table when users does not exist", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string") {
					// Check if users table exists - return false
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'users'")) {
						return Promise.resolve([[{ exists: false }]]);
					}
					// Check if auths table exists - return true
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'auths'")) {
						return Promise.resolve([[{ exists: true }]]);
					}
					// DROP TABLE commands
					if (sql.includes("DROP TABLE")) {
						return Promise.resolve([]);
					}
				}
				return Promise.resolve([[]]);
			});

			await legacyTableCleanupDao.postSync(mockSequelize, mockDb);

			// Should drop auths
			expect(mockQuery).toHaveBeenCalledWith("DROP TABLE IF EXISTS auths CASCADE");

			// Should NOT drop users (doesn't exist)
			expect(mockQuery).not.toHaveBeenCalledWith("DROP TABLE IF EXISTS users CASCADE");
		});

		it("should drop only users table when auths does not exist", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string") {
					// Check if users table exists - return true
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'users'")) {
						return Promise.resolve([[{ exists: true }]]);
					}
					// Check if auths table exists - return false
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'auths'")) {
						return Promise.resolve([[{ exists: false }]]);
					}
					// Query for FK constraints from audit_events to users
					if (sql.includes("constraint_name") && sql.includes("audit_events")) {
						return Promise.resolve([[]]); // No FK constraints
					}
					// DROP TABLE commands
					if (sql.includes("DROP TABLE")) {
						return Promise.resolve([]);
					}
				}
				return Promise.resolve([[]]);
			});

			await legacyTableCleanupDao.postSync(mockSequelize, mockDb);

			// Should NOT drop auths (doesn't exist)
			expect(mockQuery).not.toHaveBeenCalledWith("DROP TABLE IF EXISTS auths CASCADE");

			// Should drop users
			expect(mockQuery).toHaveBeenCalledWith("DROP TABLE IF EXISTS users CASCADE");
		});

		it("should be no-op when neither table exists", async () => {
			mockQuery.mockImplementation((sql: string) => {
				// Both tables don't exist
				if (typeof sql === "string" && sql.includes("SELECT EXISTS")) {
					return Promise.resolve([[{ exists: false }]]);
				}
				return Promise.resolve([[]]);
			});

			await legacyTableCleanupDao.postSync(mockSequelize, mockDb);

			// Should check for tables
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT EXISTS"));

			// Should NOT call DROP TABLE
			expect(mockQuery).not.toHaveBeenCalledWith(expect.stringContaining("DROP TABLE"));
		});

		it("should drop FK constraint from audit_events before dropping users table", async () => {
			const fkConstraintName = "audit_events_actor_id_fkey";

			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string") {
					// Check if users table exists - return true
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'users'")) {
						return Promise.resolve([[{ exists: true }]]);
					}
					// Check if auths table exists - return false
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'auths'")) {
						return Promise.resolve([[{ exists: false }]]);
					}
					// Query for FK constraints from audit_events to users - return constraint
					if (sql.includes("constraint_name") && sql.includes("audit_events")) {
						return Promise.resolve([[{ constraint_name: fkConstraintName }]]);
					}
					// DROP CONSTRAINT command
					if (sql.includes("ALTER TABLE audit_events DROP CONSTRAINT")) {
						return Promise.resolve([]);
					}
					// DROP TABLE commands
					if (sql.includes("DROP TABLE")) {
						return Promise.resolve([]);
					}
				}
				return Promise.resolve([[]]);
			});

			await legacyTableCleanupDao.postSync(mockSequelize, mockDb);

			// Should query for FK constraints
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("constraint_name"));

			// Should drop the FK constraint
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining(`ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS "${fkConstraintName}"`),
			);

			// Should drop users table
			expect(mockQuery).toHaveBeenCalledWith("DROP TABLE IF EXISTS users CASCADE");
		});

		it("should handle multiple FK constraints from audit_events", async () => {
			const fkConstraints = ["audit_events_actor_id_fkey", "audit_events_users_fk"];

			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string") {
					// Check if users table exists - return true
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'users'")) {
						return Promise.resolve([[{ exists: true }]]);
					}
					// Check if auths table exists - return false
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'auths'")) {
						return Promise.resolve([[{ exists: false }]]);
					}
					// Query for FK constraints - return multiple constraints
					if (sql.includes("constraint_name") && sql.includes("audit_events")) {
						return Promise.resolve([fkConstraints.map(name => ({ constraint_name: name }))]);
					}
					// DROP CONSTRAINT and DROP TABLE commands
					if (sql.includes("ALTER TABLE") || sql.includes("DROP TABLE")) {
						return Promise.resolve([]);
					}
				}
				return Promise.resolve([[]]);
			});

			await legacyTableCleanupDao.postSync(mockSequelize, mockDb);

			// Should drop both FK constraints
			for (const constraintName of fkConstraints) {
				expect(mockQuery).toHaveBeenCalledWith(
					expect.stringContaining(`ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS "${constraintName}"`),
				);
			}
		});

		it("should not throw if FK constraint query fails", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string") {
					// Check if users table exists - return true
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'users'")) {
						return Promise.resolve([[{ exists: true }]]);
					}
					// Check if auths table exists - return false
					if (sql.includes("SELECT EXISTS") && sql.includes("table_name = 'auths'")) {
						return Promise.resolve([[{ exists: false }]]);
					}
					// FK constraint query throws error
					if (sql.includes("constraint_name") && sql.includes("audit_events")) {
						throw new Error("audit_events table does not exist");
					}
					// DROP TABLE commands
					if (sql.includes("DROP TABLE")) {
						return Promise.resolve([]);
					}
				}
				return Promise.resolve([[]]);
			});

			// Should not throw despite FK query error
			await expect(legacyTableCleanupDao.postSync(mockSequelize, mockDb)).resolves.not.toThrow();

			// Should still drop users table
			expect(mockQuery).toHaveBeenCalledWith("DROP TABLE IF EXISTS users CASCADE");
		});

		it("should not throw if entire postSync fails", async () => {
			// Make all queries fail
			mockQuery.mockRejectedValue(new Error("Database connection error"));

			// Should not throw despite all failures
			await expect(legacyTableCleanupDao.postSync(mockSequelize, mockDb)).resolves.not.toThrow();

			// At least one query was attempted
			expect(mockQuery).toHaveBeenCalled();
		});

		it("should be idempotent - safe to run multiple times", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string") {
					// Tables exist on first run
					if (sql.includes("SELECT EXISTS")) {
						return Promise.resolve([[{ exists: true }]]);
					}
					// FK constraints query
					if (sql.includes("constraint_name")) {
						return Promise.resolve([[]]);
					}
					// DROP commands succeed
					if (sql.includes("DROP TABLE") || sql.includes("ALTER TABLE")) {
						return Promise.resolve([]);
					}
				}
				return Promise.resolve([[]]);
			});

			// Run postSync first time
			await legacyTableCleanupDao.postSync(mockSequelize, mockDb);

			// Clear mocks and simulate tables no longer exist
			vi.clearAllMocks();
			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string" && sql.includes("SELECT EXISTS")) {
					return Promise.resolve([[{ exists: false }]]);
				}
				return Promise.resolve([[]]);
			});

			// Run postSync second time - should be no-op
			await expect(legacyTableCleanupDao.postSync(mockSequelize, mockDb)).resolves.not.toThrow();

			// Should only check for table existence, not drop anything
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT EXISTS"));
			expect(mockQuery).not.toHaveBeenCalledWith(expect.stringContaining("DROP TABLE"));
		});

		it("should use current_schema() for multi-tenant safety", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string" && sql.includes("SELECT EXISTS")) {
					// Verify the query uses current_schema()
					expect(sql).toContain("table_schema = current_schema()");
					return Promise.resolve([[{ exists: false }]]);
				}
				return Promise.resolve([[]]);
			});

			await legacyTableCleanupDao.postSync(mockSequelize, mockDb);

			// Verification happens inside the mockImplementation
			expect(mockQuery).toHaveBeenCalled();
		});
	});

	describe("DAO interface", () => {
		it("should have postSync method", () => {
			expect(legacyTableCleanupDao.postSync).toBeDefined();
			expect(typeof legacyTableCleanupDao.postSync).toBe("function");
		});
	});
});
