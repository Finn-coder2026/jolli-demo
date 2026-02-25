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

	describe("migrateSpaceSlugs", () => {
		it("should skip migration when no spaces exist", async () => {
			mockQuery.mockImplementation((sql: string) => {
				if (typeof sql === "string") {
					// Total spaces count for migrateSpaceSlugs (0 spaces)
					if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
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

			// Should call: spaces count check + JRN migration check
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("SELECT COUNT(*)::text as count FROM spaces"),
			);
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT id, jrn, slug FROM spaces"));
		});

		it("should migrate spaces with NULL slugs using timestamp-based slugs", async () => {
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
					if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
						return Promise.resolve([spacesWithNullSlug]);
					}
					if (sql.includes("UPDATE spaces SET slug")) {
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

			// Check UPDATE spaces SET slug was called for each space with timestamp-based slug
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("UPDATE spaces SET slug"),
				expect.objectContaining({
					replacements: expect.objectContaining({
						id: 1,
						slug: expect.stringMatching(/^test-space-[a-z0-9]+$/),
					}),
				}),
			);
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("UPDATE spaces SET slug"),
				expect.objectContaining({
					replacements: expect.objectContaining({
						id: 2,
						slug: expect.stringMatching(/^another-space-[a-z0-9]+$/),
					}),
				}),
			);
		});

		it("should generate unique timestamp-based slugs for each space", async () => {
			// If there are multiple spaces with NULL slug, each should get a unique timestamp-based slug
			const spacesWithNullSlug = [
				{ id: 1, name: "My Custom Space" },
				{ id: 2, name: "My Custom Space" }, // Same name, different ID
			];

			const generatedSlugs: Array<string> = [];

			mockQuery.mockImplementation((sql: string, options?: { replacements?: Record<string, unknown> }) => {
				if (typeof sql === "string") {
					if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
						return Promise.resolve([[{ count: "2" }]]);
					}
					if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
						return Promise.resolve([spacesWithNullSlug]);
					}
					if (sql.includes("UPDATE spaces SET slug") && options?.replacements) {
						const slug = options.replacements.slug as string;
						generatedSlugs.push(slug);
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

			// Both slugs should be generated with timestamp format
			expect(generatedSlugs.length).toBe(2);
			for (const slug of generatedSlugs) {
				expect(slug).toMatch(/^my-custom-space-[a-z0-9]+$/);
			}
		});

		it("should handle migration errors gracefully", async () => {
			// First call throws error
			mockQuery.mockRejectedValue(new Error("Database error"));

			// Should not throw
			await spaceDao.postSync(mockSequelize, mockDb);

			// Wait for async migrations to attempt
			await new Promise(resolve => setTimeout(resolve, 50));

			// At least one query was attempted
			expect(mockQuery).toHaveBeenCalled();
		});
	});

	describe("migrateSpaceJrns", () => {
		it("should migrate spaces with old JRN format", async () => {
			const spacesWithOldJrn = [
				{ id: 1, jrn: "default", slug: "default-space-12345" },
				{ id: 2, jrn: "space:my-space", slug: "my-space" },
			];

			mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
				if (typeof sql === "string") {
					if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
						return Promise.resolve([[{ count: "2" }]]);
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
					replacements: { newJrn: jrnParser.space("default-space-12345"), id: 1 },
				}),
			);
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("UPDATE spaces SET jrn"),
				expect.objectContaining({
					replacements: { newJrn: jrnParser.space("my-space"), id: 2 },
				}),
			);
		});

		it("should skip JRN migration when all spaces have correct JRN format", async () => {
			// Spaces with correct JRN format (start with "jrn:") won't match the query
			// "SELECT ... WHERE jrn NOT LIKE 'jrn:%'", so query returns empty array

			mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
				if (typeof sql === "string") {
					if (sql.includes("SELECT COUNT(*)::text as count FROM spaces")) {
						return Promise.resolve([[{ count: "2" }]]);
					}
					if (sql.includes("SELECT id, name FROM spaces WHERE slug IS NULL")) {
						return Promise.resolve([[]]);
					}
					if (sql.includes("SELECT id, jrn, slug FROM spaces")) {
						// Return empty array - all spaces have correct JRN format,
						// so none match "WHERE jrn NOT LIKE 'jrn:%'"
						return Promise.resolve([[]]);
					}
				}
				return Promise.resolve([[]]);
			});

			await spaceDao.postSync(mockSequelize, mockDb);

			// Wait for async migrations to complete
			await new Promise(resolve => setTimeout(resolve, 50));

			// Should NOT call UPDATE spaces SET jrn (all JRNs already correct)
			expect(mockQuery).not.toHaveBeenCalledWith(
				expect.stringContaining("UPDATE spaces SET jrn"),
				expect.anything(),
			);
		});
	});
});
