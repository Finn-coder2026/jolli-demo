import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import { mockDocDao } from "../dao/DocDao.mock";
import type { DocHistoryDao, DocHistoryPaginatedResult } from "../dao/DocHistoryDao";
import { mockDocHistoryDao } from "../dao/DocHistoryDao.mock";
import type { Doc } from "../model/Doc";
import type { DocHistory, DocHistorySummary } from "../model/DocHistory";
import { DocHistoryService } from "../services/DocHistoryService";
import { createDocHistoryRouter } from "./DocHistoryRouter";
import express, { type Express } from "express";
import type { Sequelize } from "sequelize";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("DocHistoryRouter", () => {
	let app: Express;
	let mockDao: DocHistoryDao;
	const docHistoryService = new DocHistoryService();

	const mockDoc = (partial?: Partial<Doc>): Doc => ({
		id: 100,
		jrn: "test-doc-jrn",
		slug: "test-doc-jrn",
		path: "",
		createdAt: new Date("2024-01-01T00:00:00Z"),
		updatedAt: new Date("2024-01-01T00:00:00Z"),
		updatedBy: "test-user",
		source: undefined,
		sourceMetadata: undefined,
		content: "# Test Document\n\nThis is test content.",
		contentType: "text/markdown",
		contentMetadata: { title: "Test Document" },
		version: 1,
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "test-user",
		deletedAt: undefined,
		explicitlyDeleted: false,
		...partial,
	});

	const mockHistorySummary = (partial?: Partial<DocHistorySummary>): DocHistorySummary => ({
		id: 1,
		docId: 100,
		userId: 1,
		version: 1,
		createdAt: new Date("2024-01-01T00:00:00Z"),
		...partial,
	});

	const mockDocHistory = (partial?: Partial<DocHistory>): DocHistory => {
		const doc = mockDoc(partial?.docId ? { id: partial.docId } : {});
		return {
			id: 1,
			docId: 100,
			userId: 1,
			version: 1,
			createdAt: new Date("2024-01-01T00:00:00Z"),
			docSnapshot: docHistoryService.compressDocSnapshot(doc),
			...partial,
		};
	};

	const mockPaginatedResult = (partial?: Partial<DocHistoryPaginatedResult>): DocHistoryPaginatedResult => ({
		items: [mockHistorySummary()],
		total: 1,
		page: 1,
		pageSize: 20,
		totalPages: 1,
		...partial,
	});

	beforeEach(() => {
		mockDao = mockDocHistoryDao({
			listDocHistoryPaginated: vi.fn().mockResolvedValue(mockPaginatedResult()),
			getDocHistory: vi.fn().mockResolvedValue(mockDocHistory()),
		});
		app = express();
		app.use("/api/doc-histories", createDocHistoryRouter(mockDaoProvider(mockDao)));
	});

	describe("GET /api/doc-histories", () => {
		it("should return paginated results for a docId", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100");

			expect(response.status).toBe(200);
			expect(response.body).toEqual(
				expect.objectContaining({
					items: expect.any(Array),
					total: 1,
					page: 1,
					pageSize: 20,
					totalPages: 1,
				}),
			);
			expect(mockDao.listDocHistoryPaginated).toHaveBeenCalledWith({
				docId: 100,
				userId: undefined,
				page: 1,
				pageSize: 20,
			});
		});

		it("should filter by userId when provided", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100&userId=5");

			expect(response.status).toBe(200);
			expect(mockDao.listDocHistoryPaginated).toHaveBeenCalledWith({
				docId: 100,
				userId: 5,
				page: 1,
				pageSize: 20,
			});
		});

		it("should support pagination parameters", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100&page=2&pageSize=10");

			expect(response.status).toBe(200);
			expect(mockDao.listDocHistoryPaginated).toHaveBeenCalledWith({
				docId: 100,
				userId: undefined,
				page: 2,
				pageSize: 10,
			});
		});

		it("should cap pageSize at 100", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100&pageSize=200");

			expect(response.status).toBe(200);
			expect(mockDao.listDocHistoryPaginated).toHaveBeenCalledWith({
				docId: 100,
				userId: undefined,
				page: 1,
				pageSize: 100,
			});
		});

		it("should return 400 when docId is missing", async () => {
			const response = await request(app).get("/api/doc-histories");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "docId is required" });
		});

		it("should return 400 when docId is not a number", async () => {
			const response = await request(app).get("/api/doc-histories?docId=abc");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "docId must be a valid number" });
		});

		it("should return 400 when userId is not a number", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100&userId=abc");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "userId must be a valid number" });
		});

		it("should return 400 when page is not a positive number", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100&page=0");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "page must be a positive number" });
		});

		it("should return 400 when page is not a number", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100&page=abc");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "page must be a positive number" });
		});

		it("should return 400 when pageSize is not a positive number", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100&pageSize=0");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "pageSize must be a positive number" });
		});

		it("should return 400 when pageSize is not a number", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100&pageSize=abc");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "pageSize must be a positive number" });
		});

		it("should return empty results when no histories exist", async () => {
			mockDao.listDocHistoryPaginated = vi.fn().mockResolvedValue(
				mockPaginatedResult({
					items: [],
					total: 0,
					totalPages: 0,
				}),
			);

			const response = await request(app).get("/api/doc-histories?docId=999");

			expect(response.status).toBe(200);
			expect(response.body).toEqual(
				expect.objectContaining({
					items: [],
					total: 0,
					totalPages: 0,
				}),
			);
		});

		it("should return multiple pages of results", async () => {
			const items = [mockHistorySummary({ id: 3, version: 3 }), mockHistorySummary({ id: 2, version: 2 })];
			mockDao.listDocHistoryPaginated = vi.fn().mockResolvedValue(
				mockPaginatedResult({
					items,
					total: 5,
					page: 1,
					pageSize: 2,
					totalPages: 3,
				}),
			);

			const response = await request(app).get("/api/doc-histories?docId=100&pageSize=2");

			expect(response.status).toBe(200);
			expect(response.body.items).toHaveLength(2);
			expect(response.body.totalPages).toBe(3);
		});

		it("should handle database errors gracefully", async () => {
			mockDao.listDocHistoryPaginated = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/doc-histories?docId=100");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to query doc histories" });
		});

		it("should not include docSnapshot in response items", async () => {
			const response = await request(app).get("/api/doc-histories?docId=100");

			expect(response.status).toBe(200);
			for (const item of response.body.items) {
				expect(item).not.toHaveProperty("docSnapshot");
			}
		});
	});

	describe("GET /api/doc-histories/:id", () => {
		it("should return doc history detail with decompressed snapshot", async () => {
			const response = await request(app).get("/api/doc-histories/1");

			expect(response.status).toBe(200);
			expect(response.body).toEqual(
				expect.objectContaining({
					id: 1,
					docId: 100,
					userId: 1,
					version: 1,
					docSnapshot: expect.objectContaining({
						id: 100,
						content: "# Test Document\n\nThis is test content.",
						contentType: "text/markdown",
						contentMetadata: { title: "Test Document" },
					}),
				}),
			);
			expect(mockDao.getDocHistory).toHaveBeenCalledWith(1);
		});

		it("should return 400 when id is not a number", async () => {
			const response = await request(app).get("/api/doc-histories/abc");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "id must be a valid number" });
		});

		it("should return 404 when doc history not found", async () => {
			mockDao.getDocHistory = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).get("/api/doc-histories/999");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Doc history not found" });
		});

		it("should handle database errors gracefully", async () => {
			mockDao.getDocHistory = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/doc-histories/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get doc history detail" });
		});

		it("should return different versions correctly", async () => {
			const v2Doc = mockDoc({ version: 2, content: "# Updated Content" });
			mockDao.getDocHistory = vi.fn().mockResolvedValue(
				mockDocHistory({
					id: 2,
					version: 2,
					docSnapshot: docHistoryService.compressDocSnapshot(v2Doc),
				}),
			);

			const response = await request(app).get("/api/doc-histories/2");

			expect(response.status).toBe(200);
			expect(response.body.version).toBe(2);
			expect(response.body.docSnapshot.content).toBe("# Updated Content");
		});
	});

	describe("POST /api/doc-histories/:id/restore", () => {
		let mockDocDaoInstance: DocDao;
		let mockSequelize: Sequelize;
		let restoreApp: Express;

		beforeEach(() => {
			mockDocDaoInstance = mockDocDao({
				readDocById: vi.fn().mockResolvedValue(mockDoc()),
				updateDoc: vi.fn().mockImplementation(async doc => doc),
			});

			// Mock sequelize with transaction support
			mockSequelize = {
				transaction: vi.fn().mockImplementation(callback => {
					return callback({} as never);
				}),
			} as unknown as Sequelize;

			restoreApp = express();
			restoreApp.use(
				"/api/doc-histories",
				createDocHistoryRouter(mockDaoProvider(mockDao), mockDaoProvider(mockDocDaoInstance), mockSequelize),
			);
		});

		it("should restore a document without referVersion (saves current to history)", async () => {
			const currentDoc = mockDoc({ version: 3, contentMetadata: { title: "Current Doc" } });
			mockDocDaoInstance.readDocById = vi.fn().mockResolvedValue(currentDoc);

			let capturedDoc: Doc | undefined;
			mockDocDaoInstance.updateDoc = vi.fn().mockImplementation((doc: Doc) => {
				capturedDoc = doc;
				return { ...doc, version: doc.version };
			});

			// Historical version with different content
			const historicalDoc = mockDoc({
				version: 2,
				content: "# Historical Content",
				contentType: "text/markdown",
				source: { type: "historical" },
				sourceMetadata: { old: true },
				contentMetadata: { title: "Historical Doc" },
			});
			mockDao.getDocHistory = vi.fn().mockResolvedValue(
				mockDocHistory({
					version: 2,
					docSnapshot: docHistoryService.compressDocSnapshot(historicalDoc),
				}),
			);
			mockDao.createDocHistory = vi.fn().mockResolvedValue({});

			const response = await request(restoreApp).post("/api/doc-histories/1/restore");

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.savedHistory).toBe(true);
			expect(response.body.doc.version).toBe(4);
			expect(mockDao.createDocHistory).toHaveBeenCalled();

			// Verify content was restored from historical snapshot
			expect(capturedDoc?.content).toBe("# Historical Content");
			expect(capturedDoc?.contentType).toBe("text/markdown");
			// source and sourceMetadata should keep current doc values (not restored from history)
			expect(capturedDoc?.source).toBeUndefined();
			expect(capturedDoc?.sourceMetadata).toBeUndefined();
			// Verify contentMetadata keeps current fields, only title and referVersion updated
			expect(capturedDoc?.contentMetadata).toEqual({ title: "Historical Doc", referVersion: 2 });
		});

		it("should restore a document with existing referVersion (skips saving to history)", async () => {
			const currentDoc = mockDoc({
				version: 3,
				contentMetadata: { title: "Current Doc", referVersion: 1 } as never,
			});
			mockDocDaoInstance.readDocById = vi.fn().mockResolvedValue(currentDoc);

			let capturedDoc: Doc | undefined;
			mockDocDaoInstance.updateDoc = vi.fn().mockImplementation((doc: Doc) => {
				capturedDoc = doc;
				return { ...doc, version: doc.version };
			});

			// Historical version with different content
			const historicalDoc = mockDoc({
				version: 2,
				content: "# Historical Content v2",
				contentType: "text/plain",
				contentMetadata: { title: "Historical Doc v2" },
			});
			mockDao.getDocHistory = vi.fn().mockResolvedValue(
				mockDocHistory({
					version: 2,
					docSnapshot: docHistoryService.compressDocSnapshot(historicalDoc),
				}),
			);
			mockDao.createDocHistory = vi.fn().mockResolvedValue({});

			const response = await request(restoreApp).post("/api/doc-histories/1/restore");

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.savedHistory).toBe(false);
			expect(response.body.doc.version).toBe(4);
			expect(mockDao.createDocHistory).not.toHaveBeenCalled();

			// Verify content was restored from historical snapshot
			expect(capturedDoc?.content).toBe("# Historical Content v2");
			expect(capturedDoc?.contentType).toBe("text/plain");
			// Verify contentMetadata is from historical doc with referVersion added
			expect(capturedDoc?.contentMetadata).toEqual({ title: "Historical Doc v2", referVersion: 2 });
		});

		it("should return 400 when id is not a number", async () => {
			const response = await request(restoreApp).post("/api/doc-histories/abc/restore");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "id must be a valid number" });
		});

		it("should return 404 when history record not found", async () => {
			mockDao.getDocHistory = vi.fn().mockResolvedValue(undefined);

			const response = await request(restoreApp).post("/api/doc-histories/999/restore");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Doc history not found" });
		});

		it("should return 404 when document not found", async () => {
			mockDocDaoInstance.readDocById = vi.fn().mockResolvedValue(undefined);

			const response = await request(restoreApp).post("/api/doc-histories/1/restore");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should return 500 when docDao is not available", async () => {
			const noDocDaoApp = express();
			noDocDaoApp.use("/api/doc-histories", createDocHistoryRouter(mockDaoProvider(mockDao)));

			const response = await request(noDocDaoApp).post("/api/doc-histories/1/restore");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Restore feature is not configured" });
		});

		it("should return 500 when sequelize is not available", async () => {
			const noSequelizeApp = express();
			noSequelizeApp.use(
				"/api/doc-histories",
				createDocHistoryRouter(mockDaoProvider(mockDao), mockDaoProvider(mockDocDaoInstance)),
			);

			const response = await request(noSequelizeApp).post("/api/doc-histories/1/restore");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Restore feature is not configured" });
		});

		it("should handle database errors gracefully", async () => {
			mockSequelize.transaction = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(restoreApp).post("/api/doc-histories/1/restore");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to restore doc history" });
		});

		it("should return 500 when updateDoc fails", async () => {
			mockDocDaoInstance.updateDoc = vi.fn().mockResolvedValue(undefined);

			const response = await request(restoreApp).post("/api/doc-histories/1/restore");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to restore doc history" });
		});

		it("should set referVersion to the historical version number", async () => {
			const currentDoc = mockDoc({ id: 100, version: 5, contentMetadata: { title: "Test" } });
			mockDocDaoInstance.readDocById = vi.fn().mockResolvedValue(currentDoc);

			let capturedDoc: Doc | undefined;
			mockDocDaoInstance.updateDoc = vi.fn().mockImplementation((doc: Doc) => {
				capturedDoc = doc;
				return doc;
			});

			// Historical version with its own contentMetadata
			const historicalDoc = mockDoc({
				version: 3,
				content: "# Version 3 content",
				contentMetadata: { title: "Historical Title" },
			});
			mockDao.getDocHistory = vi.fn().mockResolvedValue(
				mockDocHistory({
					version: 3,
					docSnapshot: docHistoryService.compressDocSnapshot(historicalDoc),
				}),
			);

			const response = await request(restoreApp).post("/api/doc-histories/1/restore");

			expect(response.status).toBe(200);
			// contentMetadata should be from historical doc with referVersion added
			expect(capturedDoc?.contentMetadata).toEqual({ title: "Historical Title", referVersion: 3 });
			expect(capturedDoc?.version).toBe(6);
			expect(capturedDoc?.content).toBe("# Version 3 content");
		});
	});
});
