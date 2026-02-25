import type { DaoPostSyncHook, Database } from "../core/Database";
import type { Space } from "../model/Space";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createSpaceDao, createSpaceDaoProvider, type SpaceDao } from "./SpaceDao";
import { jrnParser } from "jolli-common";
import { Op, type Sequelize } from "sequelize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockSpace(partial?: Partial<Space>): Space {
	return {
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: jrnParser.space("test-space"),
		description: "Test description",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		deletedAt: undefined,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}

describe("SpaceDao", () => {
	let mockSpaces: ModelDef<Space>;
	let mockSequelize: Sequelize;
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

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockSpaces),
			query: vi.fn(),
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
				isPersonal: false,
				defaultSort: "default" as const,
				defaultFilters: { updated: "any_time", creator: "" },
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

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(space),
			} as never);

			const result = await spaceDao.getSpace(1);

			// Now uses findOne with deletedAt filter
			expect(mockSpaces.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ id: 1 }),
				}),
			);
			expect(result).toEqual(space);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);

			const result = await spaceDao.getSpace(999);

			expect(result).toBeUndefined();
		});

		it("should return personal space when userId matches owner", async () => {
			const personalSpace = mockSpace({ id: 5, isPersonal: true, ownerId: 1 });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(personalSpace),
			} as never);

			const result = await spaceDao.getSpace(5, 1);

			expect(result).toEqual(personalSpace);
		});

		it("should return undefined for personal space when userId does not match owner", async () => {
			const personalSpace = mockSpace({ id: 5, isPersonal: true, ownerId: 1 });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(personalSpace),
			} as never);

			const result = await spaceDao.getSpace(5, 999);

			expect(result).toBeUndefined();
		});

		it("should return non-personal space regardless of userId", async () => {
			const sharedSpace = mockSpace({ id: 1, isPersonal: false, ownerId: 1 });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(sharedSpace),
			} as never);

			const result = await spaceDao.getSpace(1, 999);

			expect(result).toEqual(sharedSpace);
		});

		it("should return any space when userId is not provided", async () => {
			const personalSpace = mockSpace({ id: 5, isPersonal: true, ownerId: 1 });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(personalSpace),
			} as never);

			const result = await spaceDao.getSpace(5);

			expect(result).toEqual(personalSpace);
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

			// Now includes deletedAt filter
			expect(mockSpaces.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ jrn: testJrn }),
				}),
			);
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

			// Now includes deletedAt filter
			expect(mockSpaces.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ slug: "test-slug" }),
				}),
			);
			expect(result).toEqual(space);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);

			const result = await spaceDao.getSpaceBySlug("nonexistent");

			expect(result).toBeUndefined();
		});

		it("should return personal space when userId matches owner", async () => {
			const personalSpace = mockSpace({ slug: "personal-space", isPersonal: true, ownerId: 1 });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(personalSpace),
			} as never);

			const result = await spaceDao.getSpaceBySlug("personal-space", 1);

			expect(result).toEqual(personalSpace);
		});

		it("should return undefined for personal space when userId does not match owner", async () => {
			const personalSpace = mockSpace({ slug: "personal-space", isPersonal: true, ownerId: 1 });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(personalSpace),
			} as never);

			const result = await spaceDao.getSpaceBySlug("personal-space", 999);

			expect(result).toBeUndefined();
		});
	});

	describe("listSpaces", () => {
		it("should list all spaces in the org", async () => {
			const spaces = [mockSpace({ id: 1 }), mockSpace({ id: 2 })];

			vi.mocked(mockSpaces.findAll).mockResolvedValue(
				spaces.map(space => ({
					get: vi.fn().mockReturnValue(space),
				})) as never,
			);

			const result = await spaceDao.listSpaces();

			// Now includes deletedAt filter and order
			expect(mockSpaces.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					order: [["createdAt", "ASC"]],
				}),
			);
			expect(result).toEqual(spaces);
		});

		it("should return empty array when no spaces", async () => {
			vi.mocked(mockSpaces.findAll).mockResolvedValue([]);

			const result = await spaceDao.listSpaces();

			expect(result).toEqual([]);
		});

		it("should filter personal spaces when userId is provided", async () => {
			const spaces = [
				mockSpace({ id: 1, isPersonal: false }),
				mockSpace({ id: 2, isPersonal: true, ownerId: 1 }),
			];

			vi.mocked(mockSpaces.findAll).mockResolvedValue(
				spaces.map(space => ({
					get: vi.fn().mockReturnValue(space),
				})) as never,
			);

			await spaceDao.listSpaces(1);

			// Should include an Op.or condition for personal space filtering
			expect(mockSpaces.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						[Op.or]: [{ isPersonal: false }, { isPersonal: true, ownerId: 1 }],
					}),
				}),
			);
		});

		it("should not filter personal spaces when userId is omitted", async () => {
			vi.mocked(mockSpaces.findAll).mockResolvedValue([]);

			await spaceDao.listSpaces();

			// Should NOT include Op.or condition
			const callArg = vi.mocked(mockSpaces.findAll).mock.calls[0][0] as { where: Record<symbol, unknown> };
			expect(callArg.where[Op.or]).toBeUndefined();
		});
	});

	describe("updateSpace", () => {
		it("should update space and return updated version", async () => {
			const updatedSpace = mockSpace({ id: 1, name: "Updated Name" });

			vi.mocked(mockSpaces.update).mockResolvedValue([1] as never);
			// getSpace now uses findOne with deletedAt filter
			vi.mocked(mockSpaces.findOne).mockResolvedValue({
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

	describe("deleteAllSpaces", () => {
		it("should hard delete all spaces", async () => {
			vi.mocked(mockSpaces.destroy).mockResolvedValue(5 as never);

			await spaceDao.deleteAllSpaces();

			expect(mockSpaces.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("deleteSpace", () => {
		it("should soft delete space by setting deletedAt", async () => {
			vi.mocked(mockSpaces.update).mockResolvedValue([1] as never);

			await spaceDao.deleteSpace(1);

			// Should use update instead of destroy for soft delete
			expect(mockSpaces.update).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }), {
				where: { id: 1 },
			});
		});

		it("should soft delete space with cascade delete when deleteContent is true", async () => {
			vi.mocked(mockSpaces.update).mockResolvedValue([1] as never);
			vi.mocked(mockSequelize.query).mockResolvedValue([[], undefined] as never);

			await spaceDao.deleteSpace(1, true);

			// Should call raw SQL to cascade soft delete docs first
			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("UPDATE docs SET deleted_at"),
				expect.objectContaining({ replacements: expect.objectContaining({ id: 1 }) }),
			);
			// Then soft delete the space
			expect(mockSpaces.update).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }), {
				where: { id: 1 },
			});
		});
	});

	describe("getDefaultSpace", () => {
		it("should return first space (oldest by creation time)", async () => {
			const firstSpace = mockSpace({
				id: 1,
				slug: "first-space",
			});

			vi.mocked(mockSpaces.findAll).mockResolvedValue([
				{
					get: vi.fn().mockReturnValue(firstSpace),
				},
			] as never);

			const result = await spaceDao.getDefaultSpace();

			// getDefaultSpace calls listSpaces which filters out deleted spaces
			expect(mockSpaces.findAll).toHaveBeenCalledWith({
				where: expect.objectContaining({
					deletedAt: expect.anything(),
				}),
				order: [["createdAt", "ASC"]],
			});
			expect(result).toEqual(firstSpace);
			expect(mockSpaces.create).not.toHaveBeenCalled();
		});

		it("should return undefined if no spaces exist", async () => {
			vi.mocked(mockSpaces.findAll).mockResolvedValue([]);

			const result = await spaceDao.getDefaultSpace();

			expect(result).toBeUndefined();
			expect(mockSpaces.create).not.toHaveBeenCalled();
		});
	});

	describe("createDefaultSpaceIfNeeded", () => {
		it("should create default space with unique slug if none exists", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

			vi.mocked(mockSpaces.findAll).mockResolvedValue([]); // No spaces at all

			const newSpace = mockSpace({ slug: "default-space-1705312800000" });
			vi.mocked(mockSpaces.create).mockResolvedValue({
				get: vi.fn().mockReturnValue(newSpace),
			} as never);

			const result = await spaceDao.createDefaultSpaceIfNeeded(1);

			expect(mockSpaces.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Default Space",
					slug: expect.stringMatching(/^default-space-[a-z0-9]+$/),
					ownerId: 1,
					isPersonal: false,
				}),
			);
			expect(result).toEqual(newSpace);

			vi.useRealTimers();
		});

		it("should return first existing space if any spaces exist", async () => {
			const firstSpace = mockSpace({ id: 1, slug: "existing-space" });
			vi.mocked(mockSpaces.findAll).mockResolvedValue([
				{
					get: vi.fn().mockReturnValue(firstSpace),
				},
			] as never);

			const result = await spaceDao.createDefaultSpaceIfNeeded(1);

			expect(mockSpaces.create).not.toHaveBeenCalled();
			expect(result).toEqual(firstSpace);
		});
	});

	describe("getPersonalSpace", () => {
		it("should return personal space when found", async () => {
			const personalSpace = mockSpace({ id: 5, isPersonal: true, ownerId: 1, name: "Personal Space" });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(personalSpace),
			} as never);

			const result = await spaceDao.getPersonalSpace(1);

			expect(mockSpaces.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ ownerId: 1, isPersonal: true }),
				}),
			);
			expect(result).toEqual(personalSpace);
		});

		it("should return undefined when no personal space exists", async () => {
			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);

			const result = await spaceDao.getPersonalSpace(1);

			expect(result).toBeUndefined();
		});
	});

	describe("createPersonalSpaceIfNeeded", () => {
		it("should return existing personal space if user already has one", async () => {
			const existingSpace = mockSpace({ id: 5, isPersonal: true, ownerId: 1, name: "Personal Space" });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(existingSpace),
			} as never);

			const result = await spaceDao.createPersonalSpaceIfNeeded(1);

			expect(mockSpaces.create).not.toHaveBeenCalled();
			expect(result).toEqual(existingSpace);
		});

		it("should create a new personal space if none exists", async () => {
			// getPersonalSpace returns null (no existing personal space)
			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);

			const createdSpace = mockSpace({
				id: 10,
				isPersonal: true,
				ownerId: 1,
				name: "Personal Space",
			});
			vi.mocked(mockSpaces.create).mockResolvedValue({
				get: vi.fn().mockReturnValue(createdSpace),
			} as never);

			const result = await spaceDao.createPersonalSpaceIfNeeded(1);

			expect(mockSpaces.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Personal Space",
					slug: expect.stringMatching(/^personal-space-[a-z0-9]+$/),
					ownerId: 1,
					isPersonal: true,
					description: "Your personal space for private notes, drafts, and ideas. Only you can see this.",
				}),
			);
			expect(result).toEqual(createdSpace);
		});

		it("should handle concurrent creation by re-fetching on unique constraint violation", async () => {
			const concurrentSpace = mockSpace({
				id: 10,
				isPersonal: true,
				ownerId: 1,
				name: "Personal Space",
			});

			// First getPersonalSpace returns null (no existing space)
			// Then create throws unique constraint error
			// Then re-fetch returns the concurrently created space
			vi.mocked(mockSpaces.findOne)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({
					get: vi.fn().mockReturnValue(concurrentSpace),
				} as never);

			const uniqueConstraintError = new Error("Unique constraint violated") as Error & {
				name: string;
				parent?: { code?: string };
			};
			uniqueConstraintError.name = "SequelizeUniqueConstraintError";
			vi.mocked(mockSpaces.create).mockRejectedValue(uniqueConstraintError);

			const result = await spaceDao.createPersonalSpaceIfNeeded(1);

			expect(mockSpaces.create).toHaveBeenCalled();
			expect(mockSpaces.findOne).toHaveBeenCalledTimes(2);
			expect(result).toEqual(concurrentSpace);
		});

		it("should rethrow non-unique-constraint errors", async () => {
			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);
			vi.mocked(mockSpaces.create).mockRejectedValue(new Error("Connection timeout"));

			await expect(spaceDao.createPersonalSpaceIfNeeded(1)).rejects.toThrow("Connection timeout");
		});
	});

	describe("orphanPersonalSpace", () => {
		it("should soft-delete the personal space when it exists", async () => {
			const personalSpace = mockSpace({ id: 5, isPersonal: true, ownerId: 1 });

			vi.mocked(mockSpaces.findOne).mockResolvedValue({
				get: vi.fn().mockReturnValue(personalSpace),
			} as never);
			vi.mocked(mockSpaces.update).mockResolvedValue([1] as never);

			await spaceDao.orphanPersonalSpace(1);

			expect(mockSpaces.update).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }), {
				where: { id: 5 },
			});
		});

		it("should be a no-op when no personal space exists", async () => {
			vi.mocked(mockSpaces.findOne).mockResolvedValue(null);

			await spaceDao.orphanPersonalSpace(1);

			expect(mockSpaces.update).not.toHaveBeenCalled();
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
		it("should call slug and JRN migrations and create personal space unique index", async () => {
			// Order: slugs -> JRNs -> index (migrateOrphanedDocs is not called in postSync)
			mockQuery
				.mockResolvedValueOnce([[{ count: "0" }]]) // spaces count
				.mockResolvedValueOnce([[]]) // spaces with old JRN format
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

			const mockDatabase = {} as Database;
			const mockSequelize = {} as Sequelize;

			await spaceDao.postSync(mockSequelize, mockDatabase);

			// Give time for async migrations to complete
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("CREATE UNIQUE INDEX IF NOT EXISTS idx_spaces_personal_owner"),
			);
		});

		it("should catch and log errors from migrateSpaceSlugs", async () => {
			// Order: slugs (fails) -> JRNs -> index
			mockQuery
				.mockRejectedValueOnce(new Error("Database error")) // space slugs query fails
				.mockResolvedValueOnce([[]]) // spaces with old JRN format
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

			const mockDatabase = {} as Database;
			const mockSequelize = {} as Sequelize;

			// Should not throw
			await spaceDao.postSync(mockSequelize, mockDatabase);

			// Give time for async migrations to attempt
			await vi.runAllTimersAsync();
		});

		it("should catch and log errors from migrateSpaceJrns", async () => {
			// Order: slugs -> JRNs (fails) -> index
			mockQuery
				.mockResolvedValueOnce([[{ count: "0" }]]) // spaces count
				.mockRejectedValueOnce(new Error("Database error")) // space JRNs query fails
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

			const mockDatabase = {} as Database;
			const mockSequelize = {} as Sequelize;

			// Should not throw
			await spaceDao.postSync(mockSequelize, mockDatabase);

			// Give time for async migrations to attempt
			await vi.runAllTimersAsync();
		});

		it("should catch and log errors from creating personal space unique index", async () => {
			// Order: slugs -> JRNs -> index (fails)
			mockQuery
				.mockResolvedValueOnce([[{ count: "0" }]]) // spaces count
				.mockResolvedValueOnce([[]]) // spaces with old JRN format
				.mockRejectedValueOnce(new Error("Index creation error")); // CREATE UNIQUE INDEX fails

			const mockDatabase = {} as Database;
			const mockSequelize = {} as Sequelize;

			// Should not throw
			await spaceDao.postSync(mockSequelize, mockDatabase);

			// Give time for async migrations to attempt
			await vi.runAllTimersAsync();
		});
	});

	describe("migrateOrphanedDocs", () => {
		it("should skip migration when no orphaned docs exist", async () => {
			mockQuery.mockResolvedValueOnce([[{ count: "0" }]]); // orphaned docs count

			await spaceDao.migrateOrphanedDocs(42);

			expect(mockQuery).toHaveBeenCalledTimes(1);
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT COUNT(*)::text as count FROM docs"));
		});

		it("should migrate orphaned docs to provided space ID", async () => {
			mockQuery
				.mockResolvedValueOnce([[{ count: "5" }]]) // orphaned docs count
				.mockResolvedValueOnce([{ rowCount: 5 }]); // UPDATE docs result

			await spaceDao.migrateOrphanedDocs(42);

			expect(mockQuery).toHaveBeenCalledTimes(2);
			expect(mockQuery).toHaveBeenNthCalledWith(
				2,
				expect.stringContaining("UPDATE docs SET space_id = :spaceId WHERE space_id IS NULL"),
				expect.objectContaining({
					replacements: { spaceId: 42 },
				}),
			);
		});

		it("should handle missing count in orphaned docs result", async () => {
			mockQuery.mockResolvedValueOnce([[{}]]); // Missing count field

			await spaceDao.migrateOrphanedDocs(42);

			// Should treat missing count as 0 and not call UPDATE
			expect(mockQuery).toHaveBeenCalledTimes(1);
		});
	});

	describe("migrateSpaceSlugs (via postSync)", () => {
		it("should skip migration when no spaces exist", async () => {
			// Order: slugs (count=0) -> JRNs -> index
			mockQuery
				.mockResolvedValueOnce([[{ count: "0" }]]) // total spaces count = 0
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(3);
			expect(mockQuery).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining("SELECT COUNT(*)::text as count FROM spaces"),
			);
		});

		it("should generate slugs for spaces with NULL slugs", async () => {
			// Order: slugs (count=2) -> JRNs -> index
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
				.mockResolvedValueOnce([[]]) // duplicate slugs query
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(7);
			// Check slug updates (3rd and 4th calls)
			expect(mockQuery).toHaveBeenNthCalledWith(
				3,
				expect.stringContaining("UPDATE spaces SET slug = :slug WHERE id = :id"),
				expect.objectContaining({
					replacements: expect.objectContaining({
						slug: expect.stringMatching(/^my-test-space-[a-z0-9]+$/),
						id: 1,
					}),
				}),
			);
			expect(mockQuery).toHaveBeenNthCalledWith(
				4,
				expect.stringContaining("UPDATE spaces SET slug = :slug WHERE id = :id"),
				expect.objectContaining({
					replacements: expect.objectContaining({
						slug: expect.stringMatching(/^another-space-[a-z0-9]+$/),
						id: 2,
					}),
				}),
			);
		});

		it("should handle duplicate slugs by keeping first and renaming others", async () => {
			// Order: slugs (multiple spaces with duplicate slugs) -> JRNs -> index
			mockQuery
				.mockResolvedValueOnce([[{ count: "3" }]]) // total spaces count = 3
				.mockResolvedValueOnce([[]]) // spaces with null slugs = empty
				.mockResolvedValueOnce([
					[{ slug: "my-space", count: "2" }], // 2 spaces have slug "my-space"
				]) // duplicate slugs query
				.mockResolvedValueOnce([
					[
						{ id: 1, name: "First Space" },
						{ id: 3, name: "Third Space" },
					],
				]) // spaces with slug "my-space", ordered by id
				.mockResolvedValueOnce([]) // update slug for space 3 (rename duplicate)
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(7);
			// Check that space 3 (duplicate) gets renamed with timestamp
			expect(mockQuery).toHaveBeenNthCalledWith(
				5,
				expect.stringContaining("UPDATE spaces SET slug = :newSlug WHERE id = :id"),
				expect.objectContaining({
					replacements: expect.objectContaining({
						newSlug: expect.stringMatching(/^third-space-[a-z0-9]+$/),
						id: 3,
					}),
				}),
			);
		});

		it("should skip duplicate resolution when no duplicate slugs exist", async () => {
			// Order: slugs (multiple spaces, no duplicates) -> JRNs -> index
			mockQuery
				.mockResolvedValueOnce([[{ count: "3" }]]) // total spaces count = 3
				.mockResolvedValueOnce([[]]) // spaces with null slugs = empty
				.mockResolvedValueOnce([[]]) // duplicate slugs query = empty (no duplicates)
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(5);
			// Check that duplicate slugs query was called
			expect(mockQuery).toHaveBeenNthCalledWith(
				3,
				expect.stringContaining("SELECT slug, COUNT(*)::text as count"),
			);
			// Should proceed directly to JRN migration without rename operations
			expect(mockQuery).toHaveBeenNthCalledWith(4, expect.stringContaining("SELECT id, jrn, slug FROM spaces"));
		});
	});

	describe("migrateSpaceJrns (via postSync)", () => {
		it("should skip migration when no spaces have old JRN format", async () => {
			// Order: slugs (count=0) -> JRNs (no migration needed) -> index
			mockQuery
				.mockResolvedValueOnce([[{ count: "0" }]]) // total spaces count = 0
				.mockResolvedValueOnce([[]]) // spaces with old JRN format = empty
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

			await spaceDao.postSync({} as Sequelize, {} as Database);
			await vi.runAllTimersAsync();

			expect(mockQuery).toHaveBeenCalledTimes(3);
			expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining("SELECT id, jrn, slug FROM spaces"));
		});

		it("should migrate spaces with old JRN format to new format", async () => {
			// Order: slugs (count=0) -> JRNs (with updates) -> index
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
				.mockResolvedValueOnce([]); // CREATE UNIQUE INDEX

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

describe("migrateContent", () => {
	let mockSpaces: ModelDef<Space>;
	let mockSequelize: Sequelize;
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

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockSpaces),
			query: vi.fn(),
		} as unknown as Sequelize;

		spaceDao = createSpaceDao(mockSequelize);
	});

	it("should move all docs from source to target space", async () => {
		const sourceSpace = mockSpace({ id: 1 });
		const targetSpace = mockSpace({ id: 2, name: "Target Space", slug: "target-space" });

		vi.mocked(mockSpaces.findOne)
			.mockResolvedValueOnce({ get: vi.fn().mockReturnValue(sourceSpace) } as never)
			.mockResolvedValueOnce({ get: vi.fn().mockReturnValue(targetSpace) } as never);

		await spaceDao.migrateContent(1, 2);

		expect(mockSequelize.query).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE docs SET space_id"),
			expect.objectContaining({ replacements: { sourceSpaceId: 1, targetSpaceId: 2 } }),
		);
	});

	it("should throw error when source space not found", async () => {
		vi.mocked(mockSpaces.findOne).mockResolvedValueOnce(null);

		await expect(spaceDao.migrateContent(999, 2)).rejects.toThrow("Source space 999 not found");
	});

	it("should throw error when target space not found", async () => {
		const sourceSpace = mockSpace({ id: 1 });
		vi.mocked(mockSpaces.findOne)
			.mockResolvedValueOnce({ get: vi.fn().mockReturnValue(sourceSpace) } as never)
			.mockResolvedValueOnce(null);

		await expect(spaceDao.migrateContent(1, 999)).rejects.toThrow("Target space 999 not found");
	});
});

describe("getSpaceStats", () => {
	let mockSpaces: ModelDef<Space>;
	let mockSequelize: Sequelize;
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

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockSpaces),
			query: vi.fn(),
		} as unknown as Sequelize;

		spaceDao = createSpaceDao(mockSequelize);
	});

	it("should return document and folder counts", async () => {
		vi.mocked(mockSequelize.query).mockResolvedValue([[{ doc_count: "5", folder_count: "3" }]] as never);

		const stats = await spaceDao.getSpaceStats(1);

		expect(stats).toEqual({ docCount: 5, folderCount: 3 });
		expect(mockSequelize.query).toHaveBeenCalledWith(
			expect.stringContaining("COUNT(*)"),
			expect.objectContaining({ replacements: { spaceId: 1 } }),
		);
	});

	it("should return zero counts when no results", async () => {
		vi.mocked(mockSequelize.query).mockResolvedValue([[undefined]] as never);

		const stats = await spaceDao.getSpaceStats(1);

		expect(stats).toEqual({ docCount: 0, folderCount: 0 });
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
