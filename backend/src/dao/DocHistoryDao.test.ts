import type { DocHistory } from "../model/DocHistory";
import { mockDocHistory, mockNewDocHistory } from "../model/DocHistory.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createDocHistoryDao, createDocHistoryDaoProvider, type DocHistoryDao } from "./DocHistoryDao";
import { Sequelize } from "sequelize";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("DocHistoryDao", () => {
	let mockDocHistories: ModelDef<DocHistory>;
	let docHistoryDao: DocHistoryDao;

	beforeEach(() => {
		mockDocHistories = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			findAndCountAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<DocHistory>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockDocHistories),
			models: {},
		} as unknown as Sequelize;

		docHistoryDao = createDocHistoryDao(mockSequelize);
	});

	describe("createDocHistory", () => {
		it("should create a history record", async () => {
			const newHistory = mockNewDocHistory({
				docId: 1,
				docSnapshot: Buffer.from('{"content": "test"}'),
				version: 1,
			});

			const createdHistory = mockDocHistory({
				...newHistory,
				id: 1,
			});

			vi.mocked(mockDocHistories.create).mockResolvedValue(createdHistory as never);

			const result = await docHistoryDao.createDocHistory(newHistory);

			expect(mockDocHistories.create).toHaveBeenCalledWith(newHistory, { transaction: null });
			expect(result).toEqual(createdHistory);
		});
	});

	describe("getDocHistory", () => {
		it("should return a history record by ID", async () => {
			const history = mockDocHistory({ id: 1, docId: 1, version: 1 });
			const mockGet = vi.fn().mockReturnValue(history);

			vi.mocked(mockDocHistories.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await docHistoryDao.getDocHistory(1);

			expect(mockDocHistories.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(mockGet).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(history);
		});

		it("should return undefined if history not found", async () => {
			vi.mocked(mockDocHistories.findOne).mockResolvedValue(null);

			const result = await docHistoryDao.getDocHistory(999);

			expect(result).toBeUndefined();
		});
	});

	describe("getDocHistoryByVersion", () => {
		it("should return a history record by docId and version", async () => {
			const history = mockDocHistory({ id: 1, docId: 5, version: 3 });
			const mockGet = vi.fn().mockReturnValue(history);

			vi.mocked(mockDocHistories.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await docHistoryDao.getDocHistoryByVersion(5, 3);

			expect(mockDocHistories.findOne).toHaveBeenCalledWith({ where: { docId: 5, version: 3 } });
			expect(result).toEqual(history);
		});

		it("should return undefined if version not found", async () => {
			vi.mocked(mockDocHistories.findOne).mockResolvedValue(null);

			const result = await docHistoryDao.getDocHistoryByVersion(5, 999);

			expect(result).toBeUndefined();
		});
	});

	describe("listDocHistoryByDocId", () => {
		it("should list all history records for a document ordered by version DESC", async () => {
			const histories = [
				mockDocHistory({ id: 2, docId: 1, version: 2 }),
				mockDocHistory({ id: 1, docId: 1, version: 1 }),
			];

			vi.mocked(mockDocHistories.findAll).mockResolvedValue([
				{ get: () => histories[0] },
				{ get: () => histories[1] },
			] as never);

			const result = await docHistoryDao.listDocHistoryByDocId(1);

			expect(mockDocHistories.findAll).toHaveBeenCalledWith({
				where: { docId: 1 },
				order: [["version", "DESC"]],
			});
			expect(result).toHaveLength(2);
			expect(result[0].version).toBe(2);
			expect(result[1].version).toBe(1);
		});

		it("should return empty array when no history exists", async () => {
			vi.mocked(mockDocHistories.findAll).mockResolvedValue([]);

			const result = await docHistoryDao.listDocHistoryByDocId(999);

			expect(result).toEqual([]);
		});
	});

	describe("getLatestDocHistory", () => {
		it("should return the latest history record for a document", async () => {
			const history = mockDocHistory({ id: 3, docId: 1, version: 3 });
			const mockGet = vi.fn().mockReturnValue(history);

			vi.mocked(mockDocHistories.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await docHistoryDao.getLatestDocHistory(1);

			expect(mockDocHistories.findOne).toHaveBeenCalledWith({
				where: { docId: 1 },
				order: [["version", "DESC"]],
			});
			expect(result).toEqual(history);
		});

		it("should return undefined if no history exists", async () => {
			vi.mocked(mockDocHistories.findOne).mockResolvedValue(null);

			const result = await docHistoryDao.getLatestDocHistory(999);

			expect(result).toBeUndefined();
		});
	});

	describe("updateDocHistory", () => {
		it("should update a history record", async () => {
			const history = mockDocHistory({ id: 1, docId: 1, version: 1 });
			const updatedHistory = mockDocHistory({
				id: 1,
				docId: 1,
				version: 1,
				docSnapshot: Buffer.from('{"content": "updated"}'),
			});
			const mockGet = vi.fn().mockReturnValue(history);

			vi.mocked(mockDocHistories.findOne).mockResolvedValueOnce({
				get: mockGet,
			} as never);

			vi.mocked(mockDocHistories.update).mockResolvedValue([1] as never);

			vi.mocked(mockDocHistories.findOne).mockResolvedValueOnce({
				get: () => updatedHistory,
			} as never);

			const result = await docHistoryDao.updateDocHistory(1, {
				docSnapshot: Buffer.from('{"content": "updated"}'),
			});

			expect(mockDocHistories.update).toHaveBeenCalledWith(
				{ docSnapshot: Buffer.from('{"content": "updated"}') },
				{ where: { id: 1 } },
			);
			expect(result).toEqual(updatedHistory);
		});

		it("should return undefined if history not found", async () => {
			vi.mocked(mockDocHistories.findOne).mockResolvedValue(null);

			const result = await docHistoryDao.updateDocHistory(999, { version: 2 });

			expect(result).toBeUndefined();
			expect(mockDocHistories.update).not.toHaveBeenCalled();
		});
	});

	describe("deleteDocHistory", () => {
		it("should delete a history record", async () => {
			vi.mocked(mockDocHistories.destroy).mockResolvedValue(1);

			const result = await docHistoryDao.deleteDocHistory(1);

			expect(mockDocHistories.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false if history not found", async () => {
			vi.mocked(mockDocHistories.destroy).mockResolvedValue(0);

			const result = await docHistoryDao.deleteDocHistory(999);

			expect(result).toBe(false);
		});
	});

	describe("deleteDocHistoryByDocId", () => {
		it("should delete all history records for a document", async () => {
			vi.mocked(mockDocHistories.destroy).mockResolvedValue(3);

			const result = await docHistoryDao.deleteDocHistoryByDocId(1);

			expect(mockDocHistories.destroy).toHaveBeenCalledWith({ where: { docId: 1 } });
			expect(result).toBe(3);
		});

		it("should return 0 if no history exists", async () => {
			vi.mocked(mockDocHistories.destroy).mockResolvedValue(0);

			const result = await docHistoryDao.deleteDocHistoryByDocId(999);

			expect(result).toBe(0);
		});
	});

	describe("deleteAllDocHistories", () => {
		it("should delete all history records", async () => {
			vi.mocked(mockDocHistories.destroy).mockResolvedValue(10);

			await docHistoryDao.deleteAllDocHistories();

			expect(mockDocHistories.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("listDocHistoryPaginated", () => {
		it("should return paginated results with default pagination", async () => {
			const mockRows = [
				{
					get: () => ({
						id: 2,
						docId: 1,
						userId: 1,
						version: 2,
						createdAt: new Date(),
						docSnapshot: Buffer.from("test"),
					}),
				},
				{
					get: () => ({
						id: 1,
						docId: 1,
						userId: 1,
						version: 1,
						createdAt: new Date(),
						docSnapshot: Buffer.from("test"),
					}),
				},
			];

			vi.mocked(mockDocHistories.findAndCountAll).mockResolvedValue({
				count: 2,
				rows: mockRows,
			} as never);

			const result = await docHistoryDao.listDocHistoryPaginated({ docId: 1 });

			expect(mockDocHistories.findAndCountAll).toHaveBeenCalledWith({
				where: { docId: 1 },
				attributes: ["id", "docId", "userId", "version", "createdAt"],
				order: [["version", "DESC"]],
				limit: 20,
				offset: 0,
			});
			expect(result.items).toHaveLength(2);
			expect(result.total).toBe(2);
			expect(result.page).toBe(1);
			expect(result.pageSize).toBe(20);
			expect(result.totalPages).toBe(1);
			// Ensure docSnapshot is not in items
			for (const item of result.items) {
				expect(item).not.toHaveProperty("docSnapshot");
			}
		});

		it("should filter by userId when provided", async () => {
			vi.mocked(mockDocHistories.findAndCountAll).mockResolvedValue({
				count: 0,
				rows: [],
			} as never);

			await docHistoryDao.listDocHistoryPaginated({ docId: 1, userId: 5 });

			expect(mockDocHistories.findAndCountAll).toHaveBeenCalledWith({
				where: { docId: 1, userId: 5 },
				attributes: ["id", "docId", "userId", "version", "createdAt"],
				order: [["version", "DESC"]],
				limit: 20,
				offset: 0,
			});
		});

		it("should apply custom pagination", async () => {
			vi.mocked(mockDocHistories.findAndCountAll).mockResolvedValue({
				count: 100,
				rows: [],
			} as never);

			const result = await docHistoryDao.listDocHistoryPaginated({
				docId: 1,
				page: 3,
				pageSize: 10,
			});

			expect(mockDocHistories.findAndCountAll).toHaveBeenCalledWith({
				where: { docId: 1 },
				attributes: ["id", "docId", "userId", "version", "createdAt"],
				order: [["version", "DESC"]],
				limit: 10,
				offset: 20,
			});
			expect(result.totalPages).toBe(10);
		});

		it("should return empty results when no records exist", async () => {
			vi.mocked(mockDocHistories.findAndCountAll).mockResolvedValue({
				count: 0,
				rows: [],
			} as never);

			const result = await docHistoryDao.listDocHistoryPaginated({ docId: 999 });

			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
			expect(result.totalPages).toBe(0);
		});

		it("should calculate totalPages correctly", async () => {
			vi.mocked(mockDocHistories.findAndCountAll).mockResolvedValue({
				count: 25,
				rows: [],
			} as never);

			const result = await docHistoryDao.listDocHistoryPaginated({
				docId: 1,
				pageSize: 10,
			});

			expect(result.totalPages).toBe(3);
		});
	});
});

describe("createDocHistoryDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as DocHistoryDao;
		const provider = createDocHistoryDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context docHistoryDao when context has database", () => {
		const defaultDao = {} as DocHistoryDao;
		const contextDocHistoryDao = {} as DocHistoryDao;
		const context = {
			database: {
				docHistoryDao: contextDocHistoryDao,
			},
		} as TenantOrgContext;

		const provider = createDocHistoryDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextDocHistoryDao);
	});
});

/**
 * Integration tests with real PostgreSQL database connection.
 * These tests require a running PostgreSQL instance with the connection
 * details specified in .env.local.
 * Set RUN_INTEGRATION_TESTS=true to run these tests.
 */
describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)("DocHistoryDao Integration Tests", () => {
	let sequelize: Sequelize;
	let docHistoryDao: DocHistoryDao;
	let testDocId: number;
	let testUserId: number;

	beforeAll(async () => {
		// Load environment variables from .env.local
		const dotenv = await import("dotenv");
		dotenv.config({ path: ".env.local" });

		const host = process.env.POSTGRES_HOST ?? "localhost";
		const port = Number.parseInt(process.env.POSTGRES_PORT ?? "5432", 10);
		const database = process.env.POSTGRES_DATABASE ?? "jolli";
		const username = process.env.POSTGRES_USERNAME ?? "postgres";
		const password = process.env.POSTGRES_PASSWORD ?? "";

		sequelize = new Sequelize(database, username, password, {
			host,
			port,
			dialect: "postgres",
			logging: false,
		});

		// Test connection
		await sequelize.authenticate();

		// Create users table first (doc_histories has foreign key to users)
		const { defineUsers } = await import("../model/User");
		defineUsers(sequelize);

		// Create docs table (doc_histories has foreign key to docs)
		const { defineDocs } = await import("../model/Doc");
		defineDocs(sequelize);

		// Create doc_histories table
		const { defineDocHistories } = await import("../model/DocHistory");
		defineDocHistories(sequelize);

		// Sync tables
		await sequelize.sync({ alter: true });

		// Create test user to reference
		const { createUserDao } = await import("./UserDao");
		const userDao = createUserDao(sequelize);
		const testUser = await userDao.createUser({
			email: `test-history-${Date.now()}@test.com`,
			name: "Test User",
			picture: undefined,
		});
		testUserId = testUser.id;

		// Create test doc to reference
		const { createDocDao } = await import("./DocDao");
		const docDao = createDocDao(sequelize);
		const testDoc = await docDao.createDoc({
			jrn: `test:doc:history:${Date.now()}`,
			updatedBy: "test-user",
			source: undefined,
			sourceMetadata: undefined,
			content: "Test document for history",
			contentType: "text/plain",
			contentMetadata: undefined,
			spaceId: undefined,
			parentId: undefined,
			docType: "document",
			sortOrder: 0,
			createdBy: "test-user",
		});
		testDocId = testDoc.id;

		// Create DAO
		docHistoryDao = createDocHistoryDao(sequelize);
	});

	afterAll(async () => {
		// Clean up test data
		if (docHistoryDao) {
			await docHistoryDao.deleteDocHistoryByDocId(testDocId);
		}

		// Delete test doc
		if (sequelize && testDocId) {
			const { createDocDao } = await import("./DocDao");
			const docDao = createDocDao(sequelize);
			await docDao.deleteDoc(`test:doc:history:${testDocId}`);
		}

		// Close connection
		if (sequelize) {
			await sequelize.close();
		}
	});

	beforeEach(async () => {
		// Clean up history for test doc before each test
		if (docHistoryDao && testDocId) {
			await docHistoryDao.deleteDocHistoryByDocId(testDocId);
		}
	});

	it("should create and retrieve a history record", async () => {
		const snapshot = Buffer.from(JSON.stringify({ content: "version 1 content" }));
		const created = await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: snapshot,
			version: 1,
		});

		expect(created.id).toBeGreaterThan(0);
		expect(created.docId).toBe(testDocId);
		expect(created.version).toBe(1);
		expect(created.docSnapshot).toEqual(snapshot);
		expect(created.createdAt).toBeInstanceOf(Date);

		const retrieved = await docHistoryDao.getDocHistory(created.id);
		expect(retrieved).toBeDefined();
		expect(retrieved?.id).toBe(created.id);
	});

	it("should get history by version", async () => {
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v1"),
			version: 1,
		});
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v2"),
			version: 2,
		});

		const v1 = await docHistoryDao.getDocHistoryByVersion(testDocId, 1);
		const v2 = await docHistoryDao.getDocHistoryByVersion(testDocId, 2);
		const v3 = await docHistoryDao.getDocHistoryByVersion(testDocId, 3);

		expect(v1).toBeDefined();
		expect(v1?.version).toBe(1);
		expect(v2).toBeDefined();
		expect(v2?.version).toBe(2);
		expect(v3).toBeUndefined();
	});

	it("should list history records ordered by version DESC", async () => {
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v1"),
			version: 1,
		});
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v3"),
			version: 3,
		});
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v2"),
			version: 2,
		});

		const histories = await docHistoryDao.listDocHistoryByDocId(testDocId);

		expect(histories).toHaveLength(3);
		expect(histories[0].version).toBe(3);
		expect(histories[1].version).toBe(2);
		expect(histories[2].version).toBe(1);
	});

	it("should get the latest history record", async () => {
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v1"),
			version: 1,
		});
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v5"),
			version: 5,
		});
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v3"),
			version: 3,
		});

		const latest = await docHistoryDao.getLatestDocHistory(testDocId);

		expect(latest).toBeDefined();
		expect(latest?.version).toBe(5);
	});

	it("should update a history record", async () => {
		const created = await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("original"),
			version: 1,
		});

		const newSnapshot = Buffer.from("updated");
		const updated = await docHistoryDao.updateDocHistory(created.id, {
			docSnapshot: newSnapshot,
		});

		expect(updated).toBeDefined();
		expect(updated?.docSnapshot).toEqual(newSnapshot);
	});

	it("should delete a history record", async () => {
		const created = await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("to delete"),
			version: 1,
		});

		const deleted = await docHistoryDao.deleteDocHistory(created.id);
		expect(deleted).toBe(true);

		const retrieved = await docHistoryDao.getDocHistory(created.id);
		expect(retrieved).toBeUndefined();
	});

	it("should delete all history records for a document", async () => {
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v1"),
			version: 1,
		});
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v2"),
			version: 2,
		});
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v3"),
			version: 3,
		});

		const deletedCount = await docHistoryDao.deleteDocHistoryByDocId(testDocId);
		expect(deletedCount).toBe(3);

		const remaining = await docHistoryDao.listDocHistoryByDocId(testDocId);
		expect(remaining).toHaveLength(0);
	});

	it("should enforce unique constraint on docId + version", async () => {
		await docHistoryDao.createDocHistory({
			docId: testDocId,
			userId: testUserId,
			docSnapshot: Buffer.from("v1"),
			version: 1,
		});

		await expect(
			docHistoryDao.createDocHistory({
				docId: testDocId,
				userId: testUserId,
				docSnapshot: Buffer.from("v1 duplicate"),
				version: 1,
			}),
		).rejects.toThrow();
	});
});
