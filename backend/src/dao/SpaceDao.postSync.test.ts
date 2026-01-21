import type { DaoPostSyncHook, Database } from "../core/Database";
import { createSpaceDao, type SpaceDao } from "./SpaceDao";
import { jrnParser } from "jolli-common";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Space model
vi.mock("../model/Space", () => ({
	defineSpaces: vi.fn(() => ({
		findAll: vi.fn(),
		findByPk: vi.fn(),
		findOne: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		destroy: vi.fn(),
	})),
}));

describe("SpaceDao.postSync", () => {
	let mockSequelize: Sequelize;
	let mockQuery: ReturnType<typeof vi.fn>;
	let spaceDao: SpaceDao & DaoPostSyncHook;
	let mockDb: Database;

	beforeEach(() => {
		vi.clearAllMocks();

		mockQuery = vi.fn();
		mockSequelize = {
			define: vi.fn(),
			query: mockQuery,
		} as unknown as Sequelize;

		spaceDao = createSpaceDao(mockSequelize);
		mockDb = {} as Database;
	});

	// Helper to set up mock for slug migration (no NULL slugs)
	function _mockSlugMigrationNoNullSlugs(): void {
		mockQuery.mockImplementation((sql: string) => {
			if (typeof sql === "string" && sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
				return Promise.resolve([[]]);
			}
			return Promise.resolve([[]]);
		});
	}

	it("should skip migration when no orphaned docs exist", async () => {
		// Mock: no spaces, no orphaned docs, no old JRN format
		mockQuery.mockImplementation((sql: string) => {
			if (typeof sql === "string") {
				// Total spaces count for migrateSpaceSlugs (0 spaces)
				if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
					return Promise.resolve([[{ count: "0" }]]);
				}
				// Orphaned docs count
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "0" }]]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should call: spaces count check + JRN migration check + orphaned docs count check
		expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT COUNT(*)::text as count FROM spaces"));
		expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT id, jrn, slug FROM spaces"));
		expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT COUNT(*)::text as count FROM docs"));
	});

	it("should skip migration when no users exist", async () => {
		mockQuery.mockImplementation((sql: string) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "5" }]]);
				}
				if (sql.includes("SELECT id FROM users")) {
					return Promise.resolve([[]]);
				}
				if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
					return Promise.resolve([[]]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Verify key queries were called
		expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT COUNT(*)"));
		expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT id FROM users"));
	});

	it("should create default space and migrate orphaned docs when no default space exists", async () => {
		const defaultJrn = jrnParser.space("default");
		mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "5" }]]);
				}
				if (sql.includes("SELECT id FROM users")) {
					return Promise.resolve([[{ id: 1 }]]);
				}
				if (sql.includes("SELECT id FROM spaces WHERE slug")) {
					return Promise.resolve([[]]); // No existing space with default slug
				}
				if (sql.includes("INSERT INTO spaces")) {
					return Promise.resolve([]);
				}
				if (sql.includes("UPDATE docs")) {
					return Promise.resolve([{ rowCount: 5 }]);
				}
				if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
					return Promise.resolve([[]]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Check INSERT INTO spaces was called with slug and JRN
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("INSERT INTO spaces"),
			expect.objectContaining({
				replacements: expect.objectContaining({
					jrn: defaultJrn,
					slug: "default",
					name: "Default Space",
					ownerId: 1,
				}),
			}),
		);

		// Check UPDATE docs was called with slug lookup
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE docs"),
			expect.objectContaining({
				replacements: { slug: "default" },
			}),
		);
	});

	it("should skip creating space if default space already exists by slug", async () => {
		mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "5" }]]);
				}
				if (sql.includes("SELECT id FROM users")) {
					return Promise.resolve([[{ id: 1 }]]);
				}
				if (sql.includes("SELECT id FROM spaces WHERE slug")) {
					return Promise.resolve([[{ id: 42 }]]); // Existing space with default slug
				}
				if (sql.includes("UPDATE docs")) {
					return Promise.resolve([{ rowCount: 5 }]);
				}
				if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
					return Promise.resolve([[]]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should NOT call INSERT INTO spaces (space already exists)
		expect(mockQuery).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO spaces"), expect.anything());

		// Should still call UPDATE docs to migrate orphaned docs (using slug)
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE docs"),
			expect.objectContaining({
				replacements: { slug: "default" },
			}),
		);
	});

	it("should handle migration errors gracefully", async () => {
		// First call (orphaned docs or slug migration) throws error
		mockQuery.mockRejectedValue(new Error("Database error"));

		// Should not throw
		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to attempt
		await new Promise(resolve => setTimeout(resolve, 50));

		// At least one query was attempted (either orphaned docs or slug migration)
		expect(mockQuery).toHaveBeenCalled();
	});

	it("should migrate spaces with NULL slugs", async () => {
		const spacesWithNullSlug = [
			{ id: 1, name: "Test Space" },
			{ id: 2, name: "Another Space" },
		];

		mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				// Total spaces count for migrateSpaceSlugs
				if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
					return Promise.resolve([[{ count: "2" }]]);
				}
				// Orphaned docs count
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "0" }]]);
				}
				if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
					return Promise.resolve([spacesWithNullSlug]);
				}
				if (sql.includes("UPDATE spaces SET slug")) {
					return Promise.resolve([]);
				}
				if (sql.includes("ALTER TABLE spaces ALTER COLUMN slug SET NOT NULL")) {
					return Promise.resolve([]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Check UPDATE spaces SET slug was called for each space
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE spaces SET slug"),
			expect.objectContaining({
				replacements: expect.objectContaining({ id: 1 }),
			}),
		);
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE spaces SET slug"),
			expect.objectContaining({
				replacements: expect.objectContaining({ id: 2 }),
			}),
		);

		// Check ALTER TABLE was called to add NOT NULL constraint
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("ALTER TABLE spaces ALTER COLUMN slug SET NOT NULL"),
		);
	});

	it("should use default slug for single space with NULL slug", async () => {
		// If there's only ONE space with NULL slug, it should get slug "default"
		mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
					return Promise.resolve([[{ count: "1" }]]);
				}
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "0" }]]);
				}
				if (sql.includes("SELECT id, name, slug FROM spaces LIMIT 1")) {
					return Promise.resolve([[{ id: 1, name: "My Custom Space", slug: null }]]);
				}
				if (sql.includes("UPDATE spaces SET slug")) {
					return Promise.resolve([]);
				}
				if (sql.includes("ALTER TABLE spaces ALTER COLUMN slug SET NOT NULL")) {
					return Promise.resolve([]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Single space should get slug "default" (regardless of its name)
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE spaces SET slug"),
			expect.objectContaining({
				replacements: { slug: "default", id: 1 },
			}),
		);
	});

	it("should update single space with non-default slug to default", async () => {
		// If there's only ONE space with a non-default slug (e.g., "abcdefgh"), update to "default"
		mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
					return Promise.resolve([[{ count: "1" }]]);
				}
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "0" }]]);
				}
				if (sql.includes("SELECT id, name, slug FROM spaces LIMIT 1")) {
					return Promise.resolve([[{ id: 1, name: "My Space", slug: "abcdefgh" }]]);
				}
				if (sql.includes("UPDATE spaces SET slug")) {
					return Promise.resolve([]);
				}
				if (sql.includes("ALTER TABLE spaces ALTER COLUMN slug SET NOT NULL")) {
					return Promise.resolve([]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Single space with non-default slug should be updated to "default"
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE spaces SET slug"),
			expect.objectContaining({
				replacements: { slug: "default", id: 1 },
			}),
		);
	});

	it("should skip update when single space already has default slug", async () => {
		// If there's only ONE space and it already has slug "default", no update needed
		mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
					return Promise.resolve([[{ count: "1" }]]);
				}
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "0" }]]);
				}
				if (sql.includes("SELECT id, name, slug FROM spaces LIMIT 1")) {
					return Promise.resolve([[{ id: 1, name: "Default Space", slug: "default" }]]);
				}
				if (sql.includes("ALTER TABLE spaces ALTER COLUMN slug SET NOT NULL")) {
					return Promise.resolve([]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should NOT update slug (already "default")
		expect(mockQuery).not.toHaveBeenCalledWith(
			expect.stringContaining("UPDATE spaces SET slug"),
			expect.anything(),
		);
	});

	it("should migrate spaces with old JRN format", async () => {
		const spacesWithOldJrn = [
			{ id: 1, jrn: "default", slug: "default" },
			{ id: 2, jrn: "space:my-space", slug: "my-space" },
		];

		mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT COUNT(*)")) {
					return Promise.resolve([[{ count: "0" }]]);
				}
				if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
					return Promise.resolve([[]]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([spacesWithOldJrn]);
				}
				if (sql.includes("UPDATE spaces SET jrn")) {
					return Promise.resolve([]);
				}
			}
			return Promise.resolve([[]]);
		});

		await spaceDao.postSync(mockSequelize, mockDb);

		// Wait for async migrations to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Check UPDATE spaces SET jrn was called for each space with new JRN format
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE spaces SET jrn"),
			expect.objectContaining({
				replacements: { newJrn: jrnParser.space("default"), id: 1 },
			}),
		);
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE spaces SET jrn"),
			expect.objectContaining({
				replacements: { newJrn: jrnParser.space("my-space"), id: 2 },
			}),
		);
	});
});
