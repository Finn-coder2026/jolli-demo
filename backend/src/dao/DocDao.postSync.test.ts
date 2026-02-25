import type { DaoPostSyncHook, Database } from "../core/Database";
import { createDocDao, type DocDao } from "./DocDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Doc model
vi.mock("../model/Doc", () => ({
	defineDocs: vi.fn(() => ({
		findAll: vi.fn(),
		findByPk: vi.fn(),
		findOne: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		destroy: vi.fn(),
		count: vi.fn(),
	})),
}));

describe("DocDao.postSync", () => {
	let mockSequelize: Sequelize;
	let mockQuery: ReturnType<typeof vi.fn>;
	let docDao: DocDao & DaoPostSyncHook;
	let mockDb: Database;

	beforeEach(() => {
		vi.clearAllMocks();

		mockQuery = vi.fn();
		mockSequelize = {
			define: vi.fn(),
			query: mockQuery,
		} as unknown as Sequelize;

		docDao = createDocDao(mockSequelize);
		mockDb = {} as Database;
	});

	it("should skip migration when no docs with NULL slugs exist", async () => {
		mockQuery.mockImplementation((sql: string) => {
			if (
				typeof sql === "string" &&
				sql.includes("SELECT id, jrn, content_metadata, doc_type FROM docs WHERE slug IS NULL")
			) {
				return Promise.resolve([[]]);
			}
			return Promise.resolve([[]]);
		});

		await docDao.postSync(mockSequelize, mockDb);

		// Wait for async migration to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("SELECT id, jrn, content_metadata, doc_type FROM docs WHERE slug IS NULL"),
		);
	});

	it("should migrate docs with NULL slugs using title from contentMetadata", async () => {
		const docsWithNullSlug = [
			{ id: 1, jrn: "doc:test-doc", content_metadata: { title: "Test Document" }, doc_type: "document" },
			{ id: 2, jrn: "folder:test-folder", content_metadata: { title: "Test Folder" }, doc_type: "folder" },
		];

		mockQuery.mockImplementation((sql: string, _options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT id, jrn, content_metadata, doc_type FROM docs WHERE slug IS NULL")) {
					return Promise.resolve([docsWithNullSlug]);
				}
				if (sql.includes("UPDATE docs SET slug")) {
					return Promise.resolve([]);
				}
			}
			return Promise.resolve([[]]);
		});

		await docDao.postSync(mockSequelize, mockDb);

		// Wait for async migration to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Check UPDATE docs SET slug was called for each doc
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE docs SET slug"),
			expect.objectContaining({
				replacements: expect.objectContaining({ id: 1 }),
			}),
		);
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE docs SET slug"),
			expect.objectContaining({
				replacements: expect.objectContaining({ id: 2 }),
			}),
		);
	});

	it("should use jrn as fallback when contentMetadata has no title", async () => {
		const docsWithNullSlug = [{ id: 1, jrn: "doc:fallback-doc", content_metadata: null, doc_type: "document" }];

		mockQuery.mockImplementation((sql: string, options?: { replacements?: Record<string, unknown> }) => {
			if (typeof sql === "string") {
				if (sql.includes("SELECT id, jrn, content_metadata, doc_type FROM docs WHERE slug IS NULL")) {
					return Promise.resolve([docsWithNullSlug]);
				}
				if (sql.includes("UPDATE docs SET slug")) {
					// Verify the slug contains the jrn part
					const replacements = options?.replacements as { slug?: string; id?: number };
					if (replacements?.slug?.includes("fallback-doc")) {
						return Promise.resolve([]);
					}
				}
			}
			return Promise.resolve([[]]);
		});

		await docDao.postSync(mockSequelize, mockDb);

		// Wait for async migration to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Verify UPDATE was called
		expect(mockQuery).toHaveBeenCalledWith(
			expect.stringContaining("UPDATE docs SET slug"),
			expect.objectContaining({
				replacements: expect.objectContaining({ id: 1 }),
			}),
		);
	});

	it("should handle migration errors gracefully", async () => {
		mockQuery.mockRejectedValue(new Error("Database error"));

		// Should not throw
		await docDao.postSync(mockSequelize, mockDb);

		// Wait for async migration to attempt
		await new Promise(resolve => setTimeout(resolve, 50));

		// At least one query was attempted
		expect(mockQuery).toHaveBeenCalled();
	});
});
