import type { DaoPostSyncHook, Database } from "../core/Database";
import type { Space } from "../model/Space";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createSpaceDao, createSpaceDaoProvider, type SpaceDao } from "./SpaceDao";
import { jrnParser } from "jolli-common";
import type { Sequelize } from "sequelize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockSpace(partial?: Partial<Space>): Space {
	return {
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: jrnParser.space("test-space"),
		description: "Test description",
		ownerId: 1,
		defaultSort: "default",
		defaultFilters: {},
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}

describe("SpaceDao", () => {
	let mockSpaces: ModelDef<Space>;
	let spaceDao: SpaceDao;

	beforeEach(() => {
		mockSpaces = {
			create: vi.fn(),
			findByPk: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Space>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockSpaces),
		} as unknown as Sequelize;

		spaceDao = createSpaceDao(mockSequelize);
	});

	describe("createSpace", () => {
		it("should create a space with auto-generated JRN", async () => {
			const newSpace = {
				name: "My Space",
				slug: "my-space",
				description: "My description",
				ownerId: 1,
				defaultSort: "default" as const,
				defaultFilters: {},
			};

			const expectedJrn = jrnParser.space("my-space");
			const createdSpace = mockSpace({
				...newSpace,
				jrn: expectedJrn,
				id: 1,
			});

			vi.mocked(mockSpaces.create).mockResolvedValue({
				get: vi.fn().mockReturnValue(createdSpace),
			} as never);

			const result = await spaceDao.createSpace(newSpace);

			// createSpace should auto-generate JRN from slug
			expect(mockSpaces.create).toHaveBeenCalledWith({ ...newSpace, jrn: expectedJrn });
			expect(result).toEqual(createdSpace);
		});
	});

	describe("getSpace", () => {
		it("should return space when found", async () => {
			const space = mockSpace({ id: 1 });

			vi.mocked(mockSpaces.findByPk).mockResolvedValue({
				get: vi.fn().mockReturnValue(space),
			} as never);

			const result = await spaceDao.getSpace(1);

			expect(mockSpaces.findByPk).toHaveBeenCalledWith(1);
			expect(result).toEqual(space);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockSpaces.findByPk).mockResolvedValue(null);

			const result = await spaceDao.getSpace(999);

			expect(result).toBeUndefined();
		});
	});

	describe("getSpaceByJrn", () => {
		it("should return space when found", async () => {
			const testJrn = jrnParser.space("test");
			const space = mockSpace({ jrn: testJrn });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(space),
			} as never);

			const result = await spaceDao.getSpaceByJrn(testJrn);

			expect(mockSpaces.findOne).toHaveBeenCalledWith({ where: { jrn: testJrn } });
			expect(result).toEqual(space);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);

			const result = await spaceDao.getSpaceByJrn(jrnParser.space("nonexistent"));

			expect(result).toBeUndefined();
		});
	});

	describe("getSpaceBySlug", () => {
		it("should return space when found", async () => {
			const space = mockSpace({ slug: "test-slug" });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(space),
			} as never);

			const result = await spaceDao.getSpaceBySlug("test-slug");

			expect(mockSpaces.findOne).toHaveBeenCalledWith({ where: { slug: "test-slug" } });
			expect(result).toEqual(space);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);

			const result = await spaceDao.getSpaceBySlug("nonexistent");

			expect(result).toBeUndefined();
		});
	});

	describe("listSpaces", () => {
		it("should list spaces for user", async () => {
			const spaces = [mockSpace({ id: 1 }), mockSpace({ id: 2 })];

			vi.mocked(mockSpaces.findAll).mockResolvedValue(
				spaces.map(space => ({
					get: vi.fn().mockReturnValue(space),
				})) as never,
			);

			const result = await spaceDao.listSpaces(1);

			expect(mockSpaces.findAll).toHaveBeenCalledWith({
				where: { ownerId: 1 },
				order: [["createdAt", "ASC"]],
			});
			expect(result).toEqual(spaces);
		});

		it("should return empty array when no spaces", async () => {
			vi.mocked(mockSpaces.findAll).mockResolvedValue([]);

			const result = await spaceDao.listSpaces(999);

			expect(result).toEqual([]);
		});
	});

	describe("updateSpace", () => {
		it("should update space and return updated version", async () => {
			const updatedSpace = mockSpace({ id: 1, name: "Updated Name" });

			vi.mocked(mockSpaces.update).mockResolvedValue([1] as never);
			vi.mocked(mockSpaces.findByPk).mockResolvedValue({
				get: vi.fn().mockReturnValue(updatedSpace),
			} as never);

			const result = await spaceDao.updateSpace(1, { name: "Updated Name" });

			expect(mockSpaces.update).toHaveBeenCalledWith({ name: "Updated Name" }, { where: { id: 1 } });
			expect(result).toEqual(updatedSpace);
		});

		it("should return undefined when space not found", async () => {
			vi.mocked(mockSpaces.update).mockResolvedValue([0] as never);

			const result = await spaceDao.updateSpace(999, { name: "Updated Name" });

			expect(result).toBeUndefined();
		});
	});

	describe("deleteSpace", () => {
		it("should delete space", async () => {
			vi.mocked(mockSpaces.destroy).mockResolvedValue(1 as never);

			await spaceDao.deleteSpace(1);

			expect(mockSpaces.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
		});
	});

	describe("getOrCreateDefaultSpace", () => {
		it("should return existing default space found by slug", async () => {
			const defaultJrn = jrnParser.space("default");
			const defaultSpace = mockSpace({ jrn: defaultJrn, name: "Default Space", slug: "default" });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(defaultSpace),
			} as never);

			const result = await spaceDao.getOrCreateDefaultSpace(1);

			// Should search by slug (more stable than JRN)
			expect(mockSpaces.findOne).toHaveBeenCalledWith({ where: { slug: "default" } });
			expect(result).toEqual(defaultSpace);
		});

		it("should create default space when not exists", async () => {
			const defaultJrn = jrnParser.space("default");
			const createdSpace = mockSpace({
				jrn: defaultJrn,
				name: "Default Space",
				slug: "default",
				description: "Default workspace for documents",
				ownerId: 1,
			});

			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);
			vi.mocked(mockSpaces.create).mockResolvedValue({
				get: vi.fn().mockReturnValue(createdSpace),
			} as never);

			const result = await spaceDao.getOrCreateDefaultSpace(1);

			// JRN is auto-generated from slug in createSpace
			expect(mockSpaces.create).toHaveBeenCalledWith({
				name: "Default Space",
				slug: "default",
				jrn: defaultJrn,
				description: "Default workspace for documents",
				ownerId: 1,
				defaultSort: "default",
				defaultFilters: {},
			});
			expect(result).toEqual(createdSpace);
		});
	});
});

describe("postSync and migrations", () => {
	let mockSpaces: ModelDef<Space>;
	let spaceDao: SpaceDao & DaoPostSyncHook;
	let mockQuery: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

		mockSpaces = {
			create: vi.fn(),
			findByPk: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Space>;

		mockQuery = vi.fn();

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockSpaces),
			query: mockQuery,
		} as unknown as Sequelize;

		spaceDao = createSpaceDao(mockSequelize);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("postSync", () => {
		it("should call migrations asynchronously and resolve immediately", async () => {
			// Set up query to return no null slugs, no old JRN formats, and no orphaned docs
			// Order: slugs -> JRNs -> orphaned docs
			mockQuery
				.mockResolvedValueOnce([[]]) // spaces with null slugs
				.mockResolvedValueOnce([[]]) // spaces with old JRN format
				.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs count

			const mockDatabase = {} as Database;
			const mockSequelize = {} as Sequelize;

			await spaceDao.postSync(mockSequelize, mockDatabase);

			// Give time for async migrations to complete
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalled();
		});

		it("should catch and log errors from migrateSpaceSlugs", async () => {
			// Order: slugs (fails) -> JRNs -> orphaned docs
			mockQuery
				.mockRejectedValueOnce(new Error("Database error")) // space slugs query fails
				.mockResolvedValueOnce([[]]) // spaces with old JRN format
				.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs count

			const mockDatabase = {} as Database;
			const mockSequelize = {} as Sequelize;

			// Should not throw
			await spaceDao.postSync(mockSequelize, mockDatabase);

			// Give time for async migrations to attempt
			await vi.runAllTimersAsync();
		});

		it("should catch and log errors from migrateSpaceJrns", async () => {
			// Order: slugs -> JRNs (fails) -> orphaned docs
			mockQuery
				.mockResolvedValueOnce([[]]) // spaces with null slugs
				.mockRejectedValueOnce(new Error("Database error")) // space JRNs query fails
				.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs count

			const mockDatabase = {} as Database;
			const mockSequelize = {} as Sequelize;

			// Should not throw
			await spaceDao.postSync(mockSequelize, mockDatabase);

			// Give time for async migrations to attempt
			await vi.runAllTimersAsync();
		});

		it("should catch and log errors from migrateOrphanedDocs", async () => {
			// Order: slugs -> JRNs -> orphaned docs (fails)
			mockQuery
				.mockResolvedValueOnce([[]]) // spaces with null slugs
				.mockResolvedValueOnce([[]]) // spaces with old JRN format
				.mockRejectedValueOnce(new Error("Database error")); // orphaned docs query fails

			const mockDatabase = {} as Database;
			const mockSequelize = {} as Sequelize;

			// Should not throw
			await spaceDao.postSync(mockSequelize, mockDatabase);

			// Give time for async migrations to attempt
			await vi.runAllTimersAsync();
		});
	});

	describe("migrateOrphanedDocs (via postSync)", () => {
		it("should skip migration when no orphaned docs exist", async () => {
			// Use mockImplementation to handle queries based on content
			mockQuery.mockImplementation((sql: string) => {
				if (sql.includes("SELECT COUNT(*)::text as count FROM docs")) {
					return Promise.resolve([[{ count: "0" }]]);
				}
				if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
					return Promise.resolve([[]]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
				return Promise.resolve([]);
			});

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			// Should call orphaned docs count and slugs check
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT COUNT(*)::text as count FROM docs"));
		});

		it("should skip migration when orphaned docs exist but no users found", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (sql.includes("SELECT COUNT(*)::text as count FROM docs")) {
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
				return Promise.resolve([]);
			});

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			// Should call users query
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT id FROM users"));
		});

		it("should migrate orphaned docs when users exist and no default space", async () => {
			const defaultJrn = jrnParser.space("default");
			mockQuery.mockImplementation((sql: string) => {
				if (sql.includes("SELECT COUNT(*)::text as count FROM docs")) {
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
				return Promise.resolve([]);
			});

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			// Should call insert with slug and JRN
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
			// Should call update using slug lookup
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("UPDATE docs"),
				expect.objectContaining({
					replacements: { slug: "default" },
				}),
			);
		});

		it("should skip creating space if default space already exists", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (sql.includes("SELECT COUNT(*)::text as count FROM docs")) {
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
				return Promise.resolve([]);
			});

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			// Should NOT call INSERT INTO spaces (space already exists)
			expect(mockQuery).not.toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO spaces"),
				expect.anything(),
			);
			// Should still call UPDATE docs to migrate orphaned docs
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("UPDATE docs"),
				expect.objectContaining({
					replacements: { slug: "default" },
				}),
			);
		});

		it("should handle missing count in orphaned docs result", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (sql.includes("SELECT COUNT(*)::text as count FROM docs")) {
					return Promise.resolve([[{}]]); // Missing count field
				}
				if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
					return Promise.resolve([[]]);
				}
				if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
					return Promise.resolve([[]]);
				}
				return Promise.resolve([]);
			});

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			// Should treat missing count as 0 and not call users query
			expect(mockQuery).not.toHaveBeenCalledWith(expect.stringContaining("SELECT id FROM users"));
		});
	});

	describe("migrateSpaceSlugs (via postSync)", () => {
		it("should skip migration when no spaces exist", async () => {
			// Order: slugs (count=0) -> JRNs -> orphaned docs
			mockQuery
				.mockResolvedValueOnce([[{ count: "0" }]]) // total spaces count = 0
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(3);
			expect(mockQuery).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining("SELECT COUNT(*)::text as count FROM spaces"),
			);
		});

		it("should generate slugs for multiple spaces with NULL slugs", async () => {
			// Order: slugs (count=2, multiple spaces) -> JRNs -> orphaned docs
			mockQuery
				.mockResolvedValueOnce([[{ count: "2" }]]) // total spaces count = 2
				.mockResolvedValueOnce([
					[
						{ id: 1, name: "My Test Space" },
						{ id: 2, name: "Another Space" },
					],
				]) // spaces with null slugs
				.mockResolvedValueOnce([]) // update slug for space 1
				.mockResolvedValueOnce([]) // update slug for space 2
				.mockResolvedValueOnce([]) // add NOT NULL constraint
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(7);
			// Check slug updates (3rd and 4th calls)
			expect(mockQuery).toHaveBeenNthCalledWith(
				3,
				expect.stringContaining("UPDATE spaces SET slug = :slug WHERE id = :id"),
				expect.objectContaining({
					replacements: expect.objectContaining({
						slug: expect.stringMatching(/^my-test-space-\d+$/),
						id: 1,
					}),
				}),
			);
			expect(mockQuery).toHaveBeenNthCalledWith(
				4,
				expect.stringContaining("UPDATE spaces SET slug = :slug WHERE id = :id"),
				expect.objectContaining({
					replacements: expect.objectContaining({
						slug: expect.stringMatching(/^another-space-\d+$/),
						id: 2,
					}),
				}),
			);
		});

		it("should handle failure when adding NOT NULL constraint (constraint already exists)", async () => {
			// Order: slugs (count=1, single space) -> JRNs -> orphaned docs
			mockQuery
				.mockResolvedValueOnce([[{ count: "1" }]]) // total spaces count = 1
				.mockResolvedValueOnce([[{ id: 1, name: "Test Space", slug: null }]]) // single space with null slug
				.mockResolvedValueOnce([]) // update slug
				.mockRejectedValueOnce(new Error("constraint already exists")) // NOT NULL constraint fails
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			// Should not throw, just log debug message
			expect(mockQuery).toHaveBeenCalledTimes(6);
			expect(mockQuery).toHaveBeenNthCalledWith(
				4,
				expect.stringContaining("ALTER TABLE spaces ALTER COLUMN slug SET NOT NULL"),
			);
		});
	});

	describe("migrateSpaceJrns (via postSync)", () => {
		it("should skip migration when no spaces have old JRN format", async () => {
			// Order: slugs (count=0) -> JRNs -> orphaned docs
			mockQuery
				.mockResolvedValueOnce([[{ count: "0" }]]) // total spaces count = 0
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(3);
			expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining("SELECT id, jrn, slug FROM spaces"));
		});

		it("should migrate spaces with old JRN format to new format", async () => {
			// Order: slugs (count=0) -> JRNs (with updates) -> orphaned docs
			mockQuery
				.mockResolvedValueOnce([[{ count: "0" }]]) // total spaces count = 0 (skip slug migration)
				.mockResolvedValueOnce([
					[
						{ id: 1, jrn: "default", slug: "default" },
						{ id: 2, jrn: "space:my-space", slug: "my-space" },
					],
				]) // spaces with old JRN format
				.mockResolvedValueOnce([]) // update JRN for space 1
				.mockResolvedValueOnce([]) // update JRN for space 2
				.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs (returns 0, no further queries)

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(5);
			// Check JRN updates
			expect(mockQuery).toHaveBeenNthCalledWith(
				3,
				expect.stringContaining("UPDATE spaces SET jrn = :newJrn WHERE id = :id"),
				expect.objectContaining({
					replacements: {
						newJrn: jrnParser.space("default"),
						id: 1,
					},
				}),
			);
			expect(mockQuery).toHaveBeenNthCalledWith(
				4,
				expect.stringContaining("UPDATE spaces SET jrn = :newJrn WHERE id = :id"),
				expect.objectContaining({
					replacements: {
						newJrn: jrnParser.space("my-space"),
						id: 2,
					},
				}),
			);
		});
	});
});

describe("SpaceDaoProvider", () => {
	it("should return default dao when context is undefined", () => {
		const defaultDao = {} as SpaceDao;
		const provider = createSpaceDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context dao when available", () => {
		const defaultDao = {} as SpaceDao;
		const contextDao = {} as SpaceDao;
		const provider = createSpaceDaoProvider(defaultDao);

		const context = {
			database: {
				spaceDao: contextDao,
			},
		} as unknown as TenantOrgContext;

		const result = provider.getDao(context);

		expect(result).toBe(contextDao);
	});

	it("should return default dao when context has no spaceDao", () => {
		const defaultDao = {} as SpaceDao;
		const provider = createSpaceDaoProvider(defaultDao);

		const context = {
			database: {},
		} as unknown as TenantOrgContext;

		const result = provider.getDao(context);

		expect(result).toBe(defaultDao);
	});
});
