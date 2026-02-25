import { getConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import { mockDocDao } from "../dao/DocDao.mock";
import type { DocDraftDao } from "../dao/DocDraftDao";
import { mockDocDraftDao } from "../dao/DocDraftDao.mock";
import { mockSyncArticleDao } from "../dao/SyncArticleDao.mock";
import type { AuthenticatedRequest, PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import { mockDoc } from "../model/Doc.mock";
import { createAuthHandler } from "../util/AuthHandler";
import { createTokenUtil } from "../util/TokenUtil";
import { createDocRouter } from "./DocRouter";
import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Response } from "express";
import { jrnParser, ROOT_WORKSPACE, type UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("DocRouter", () => {
	let app: Express;
	let mockDao: DocDao;
	let mockDocDraftDaoInstance: DocDraftDao;
	let mockSyncArticleDaoInstance: ReturnType<typeof mockSyncArticleDao>;
	let mockPermissionMiddleware: PermissionMiddlewareFactory;
	let authToken: string;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	beforeEach(() => {
		mockDao = mockDocDao();
		mockDocDraftDaoInstance = mockDocDraftDao();
		mockSyncArticleDaoInstance = mockSyncArticleDao();
		mockPermissionMiddleware = {
			requireAuth: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			requirePermission: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			requireAllPermissions: vi.fn(
				() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next(),
			),
			requireRole: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			loadPermissions: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
		};
		app = express();
		app.use(cookieParser());
		app.use(express.json());
		app.use(
			"/docs",
			createAuthHandler(tokenUtil),
			createDocRouter(
				mockDaoProvider(mockDao),
				mockDaoProvider(mockDocDraftDaoInstance),
				tokenUtil,
				mockPermissionMiddleware,
				mockDaoProvider(mockSyncArticleDaoInstance),
			),
		);

		// Generate valid auth token for tests
		authToken = tokenUtil.generateToken({
			userId: 1,
			name: "Test User",
			email: "test@jolli.ai",
			picture: "https://example.com/pic.jpg",
		});
	});

	describe("POST /", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docs").send({
				jrn: "test-arn",
				content: "test",
				contentType: "text/plain",
			});

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should create a doc and return 201 with createdBy and updatedBy set from userId", async () => {
			const newDoc = {
				jrn: "test-arn",
				slug: "test-slug",
				path: "",
				source: undefined,
				sourceMetadata: undefined,
				content: "test content",
				contentType: "text/plain",
				contentMetadata: undefined,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				// createdBy and updatedBy are not sent by frontend - they are set by backend from userId
			};

			const createdDoc = mockDoc({ ...newDoc, id: 1, version: 1, createdBy: "1", updatedBy: "1" });
			mockDao.createDoc = vi.fn().mockResolvedValue(createdDoc);

			const response = await request(app).post("/docs").set("Cookie", `authToken=${authToken}`).send(newDoc);

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({
				id: 1,
				jrn: "test-arn",
				updatedBy: "1",
				content: "test content",
				contentType: "text/plain",
				version: 1,
			});
			// Verify backend sets createdBy and updatedBy from userId
			expect(mockDao.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					jrn: "test-arn",
					content: "test content",
					docType: "document",
					createdBy: "1",
					updatedBy: "1",
				}),
			);
		});

		it("should return 400 on creation error", async () => {
			mockDao.createDoc = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/docs").set("Cookie", `authToken=${authToken}`).send({
				jrn: "test-arn",
				content: "test",
				contentType: "text/plain",
			});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to create document" });
		});

		it("should have correct content-type header", async () => {
			mockDao.createDoc = vi.fn().mockResolvedValue(mockDoc());

			const response = await request(app).post("/docs").set("Cookie", `authToken=${authToken}`).send({
				jrn: "test",
				content: "test",
				contentType: "text/plain",
			});

			expect(response.headers["content-type"]).toMatch(/json/);
		});
	});

	describe("GET /", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).get("/docs");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return all docs", async () => {
			const docs = [
				mockDoc({ id: 1, jrn: "jrn:doc:1", content: "content1" }),
				mockDoc({ id: 2, jrn: "jrn:doc:2", content: "content2" }),
			];
			mockDao.listDocs = vi.fn().mockResolvedValue(docs);

			const response = await request(app).get("/docs").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(response.body[0]).toMatchObject({ id: 1, jrn: "jrn:doc:1" });
			expect(response.body[1]).toMatchObject({ id: 2, jrn: "jrn:doc:2" });
			expect(mockDao.listDocs).toHaveBeenCalled();
		});

		it("should filter by startsWithJrn when provided", async () => {
			const docs = [mockDoc({ id: 3, jrn: "jrn:doc:prefix-1", slug: "prefix-1", content: "content3" })];
			mockDao.listDocs = vi.fn().mockResolvedValue(docs);

			const response = await request(app)
				.get("/docs?startsWithJrn=prefix")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(response.body[0]).toMatchObject({ id: 3, jrn: "jrn:doc:prefix-1" });
			expect(mockDao.listDocs).toHaveBeenCalledWith({ startsWithJrn: "prefix", includeRoot: false });
		});

		it("should include /root docs when includeRoot=true query param is provided", async () => {
			const docs = [
				mockDoc({ id: 1, jrn: "/root/internal/doc", content: "internal content" }),
				mockDoc({ id: 2, jrn: "jrn:doc:1", content: "content1" }),
			];
			mockDao.listDocs = vi.fn().mockResolvedValue(docs);

			const response = await request(app).get("/docs?includeRoot=true").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(mockDao.listDocs).toHaveBeenCalledWith({ startsWithJrn: undefined, includeRoot: true });
		});

		it("should pass both startsWithJrn and includeRoot when both are provided", async () => {
			const docs = [mockDoc({ id: 1, jrn: "/root/scripts/doc", slug: "scripts-doc", content: "script content" })];
			mockDao.listDocs = vi.fn().mockResolvedValue(docs);

			const response = await request(app)
				.get("/docs?startsWithJrn=scripts&includeRoot=true")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(mockDao.listDocs).toHaveBeenCalledWith({ startsWithJrn: "scripts", includeRoot: true });
		});

		it("should return empty array when no docs exist", async () => {
			mockDao.listDocs = vi.fn().mockResolvedValue([]);

			const response = await request(app).get("/docs").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it("should have correct content-type header", async () => {
			mockDao.listDocs = vi.fn().mockResolvedValue([]);

			const response = await request(app).get("/docs").set("Cookie", `authToken=${authToken}`);

			expect(response.headers["content-type"]).toMatch(/json/);
		});
	});

	describe("GET /id/:id", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).get("/docs/id/1");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return doc when found", async () => {
			const doc = mockDoc({ id: 1, jrn: "test-jrn", content: "test content" });
			mockDao.readDocById = vi.fn().mockResolvedValue(doc);

			const response = await request(app).get("/docs/id/1").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 1,
				jrn: "test-jrn",
				content: "test content",
			});
			expect(mockDao.readDocById).toHaveBeenCalledWith(1);
		});

		it("should return 404 when doc not found", async () => {
			mockDao.readDocById = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).get("/docs/id/999").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app).get("/docs/id/invalid").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid document ID" });
		});
	});

	describe("GET /:jrn", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).get("/docs/test-arn");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return doc when found", async () => {
			const doc = mockDoc({ jrn: "test-arn", content: "test content" });
			mockDao.readDoc = vi.fn().mockResolvedValue(doc);

			const response = await request(app).get("/docs/test-arn").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				jrn: "test-arn",
				content: "test content",
			});
			expect(mockDao.readDoc).toHaveBeenCalledWith("test-arn");
		});

		it("should return 404 when doc not found", async () => {
			mockDao.readDoc = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).get("/docs/nonexistent").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should handle null response from database", async () => {
			mockDao.readDoc = vi.fn().mockResolvedValue(null);

			const response = await request(app).get("/docs/test-arn").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should have correct content-type header", async () => {
			mockDao.readDoc = vi.fn().mockResolvedValue(mockDoc());

			const response = await request(app).get("/docs/test-arn").set("Cookie", `authToken=${authToken}`);

			expect(response.headers["content-type"]).toMatch(/json/);
		});
	});

	describe("PUT /:jrn", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).put("/docs/test-arn").send({
				jrn: "test-arn",
				content: "test",
			});

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should update doc and return 200", async () => {
			const updateData = {
				jrn: "test-arn",
				content: "updated content",
				version: 2,
			};
			const updatedDoc = mockDoc(updateData);
			mockDao.updateDoc = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.put("/docs/test-arn")
				.set("Cookie", `authToken=${authToken}`)
				.send(updateData);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				jrn: "test-arn",
				content: "updated content",
				version: 2,
			});
			expect(mockDao.updateDoc).toHaveBeenCalledWith(updateData);
		});

		it("should return 404 when doc not found", async () => {
			mockDao.updateDoc = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).put("/docs/test-arn").set("Cookie", `authToken=${authToken}`).send({
				jrn: "test-arn",
				content: "test",
			});

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found or version conflict" });
		});

		it("should return 404 when version conflict occurs", async () => {
			mockDao.updateDoc = vi.fn().mockResolvedValue(null);

			const response = await request(app).put("/docs/test-arn").set("Cookie", `authToken=${authToken}`).send({
				jrn: "test-arn",
				content: "test",
				version: 1,
			});

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found or version conflict" });
		});

		it("should return 400 on update error", async () => {
			mockDao.updateDoc = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/docs/test-arn").set("Cookie", `authToken=${authToken}`).send({
				jrn: "test-arn",
				content: "test",
			});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to update document" });
		});

		it("should have correct content-type header", async () => {
			mockDao.updateDoc = vi.fn().mockResolvedValue(mockDoc());

			const response = await request(app).put("/docs/test-arn").set("Cookie", `authToken=${authToken}`).send({
				jrn: "test-arn",
				content: "test",
			});

			expect(response.headers["content-type"]).toMatch(/json/);
		});

		it("should advance sync cursor when updating a sync article", async () => {
			// Create a mock sync article DAO
			const mockSyncArticleDaoInstance = mockSyncArticleDao();
			const advanceCursorSpy = vi.spyOn(mockSyncArticleDaoInstance, "advanceCursor").mockResolvedValue(1);

			// Create a new app with syncArticleDaoProvider
			const appWithSyncDao = express();
			appWithSyncDao.use(cookieParser());
			appWithSyncDao.use(express.json());
			appWithSyncDao.use(
				"/docs",
				createAuthHandler(tokenUtil),
				createDocRouter(
					mockDaoProvider(mockDao),
					mockDaoProvider(mockDocDraftDaoInstance),
					tokenUtil,
					mockPermissionMiddleware,
					mockDaoProvider(mockSyncArticleDaoInstance),
				),
			);

			// Update a doc with a sync article JRN
			const syncArticleJrn = "jrn:/global:docs:article/sync-test-article";
			const updateData = {
				jrn: syncArticleJrn,
				content: "updated sync article content",
				version: 2,
			};
			const updatedDoc = mockDoc(updateData);
			mockDao.updateDoc = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(appWithSyncDao)
				.put(`/docs/${encodeURIComponent(syncArticleJrn)}`)
				.set("Cookie", `authToken=${authToken}`)
				.send(updateData);

			expect(response.status).toBe(200);
			expect(advanceCursorSpy).toHaveBeenCalledWith(syncArticleJrn);
		});

		it("should update serverPath when parentId changes for a sync article", async () => {
			// Create mock DAOs
			const mockSyncArticleDaoInstance = mockSyncArticleDao();
			vi.spyOn(mockSyncArticleDaoInstance, "advanceCursor").mockResolvedValue(1);

			// Create a new app with syncArticleDaoProvider
			const appWithSyncDao = express();
			appWithSyncDao.use(cookieParser());
			appWithSyncDao.use(express.json());
			appWithSyncDao.use(
				"/docs",
				createAuthHandler(tokenUtil),
				createDocRouter(
					mockDaoProvider(mockDao),
					mockDaoProvider(mockDocDraftDaoInstance),
					tokenUtil,
					mockPermissionMiddleware,
					mockDaoProvider(mockSyncArticleDaoInstance),
				),
			);

			const syncArticleJrn = "jrn:/global:docs:article/sync-test-article";

			// Existing doc in "notes" folder (parentId: 10)
			const existingDoc = mockDoc({
				id: 1,
				jrn: syncArticleJrn,
				content: "# Test",
				parentId: 10,
				contentMetadata: {
					sync: {
						fileId: "test-article",
						serverPath: "notes/test.md",
					},
				},
			});

			// New folder "docs" (parentId: 20)
			const docsFolder = mockDoc({
				id: 20,
				docType: "folder",
				parentId: undefined,
				contentMetadata: { title: "docs" },
			});

			mockDao.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDao.readDocById = vi.fn().mockResolvedValue(docsFolder);
			mockDao.updateDoc = vi.fn().mockImplementation(data => {
				return mockDoc({ ...existingDoc, ...data });
			});

			// Update with new parentId
			const response = await request(appWithSyncDao)
				.put(`/docs/${encodeURIComponent(syncArticleJrn)}`)
				.set("Cookie", `authToken=${authToken}`)
				.send({
					jrn: syncArticleJrn,
					content: "# Test",
					parentId: 20, // Moving to "docs" folder
					version: 2,
				});

			expect(response.status).toBe(200);

			// Verify updateDoc was called with updated serverPath
			expect(mockDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					contentMetadata: expect.objectContaining({
						sync: expect.objectContaining({
							fileId: "test-article",
							serverPath: "docs/test.md", // New path
						}),
					}),
				}),
			);
		});

		it("should update serverPath to root when moving sync article to root", async () => {
			// Create mock DAOs
			const mockSyncArticleDaoInstance = mockSyncArticleDao();
			vi.spyOn(mockSyncArticleDaoInstance, "advanceCursor").mockResolvedValue(1);

			// Create a new app with syncArticleDaoProvider
			const appWithSyncDao = express();
			appWithSyncDao.use(cookieParser());
			appWithSyncDao.use(express.json());
			appWithSyncDao.use(
				"/docs",
				createAuthHandler(tokenUtil),
				createDocRouter(
					mockDaoProvider(mockDao),
					mockDaoProvider(mockDocDraftDaoInstance),
					tokenUtil,
					mockPermissionMiddleware,
					mockDaoProvider(mockSyncArticleDaoInstance),
				),
			);

			const syncArticleJrn = "jrn:/global:docs:article/sync-test-article";

			// Existing doc in "notes" folder (parentId: 10)
			const existingDoc = mockDoc({
				id: 1,
				jrn: syncArticleJrn,
				content: "# Test",
				parentId: 10,
				contentMetadata: {
					sync: {
						fileId: "test-article",
						serverPath: "notes/test.md",
					},
				},
			});

			mockDao.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDao.updateDoc = vi.fn().mockImplementation(data => {
				return mockDoc({ ...existingDoc, ...data });
			});

			// Update with undefined parentId (move to root)
			const response = await request(appWithSyncDao)
				.put(`/docs/${encodeURIComponent(syncArticleJrn)}`)
				.set("Cookie", `authToken=${authToken}`)
				.send({
					jrn: syncArticleJrn,
					content: "# Test",
					parentId: undefined, // Moving to root
					version: 2,
				});

			expect(response.status).toBe(200);

			// Verify updateDoc was called with updated serverPath (root level)
			expect(mockDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					contentMetadata: expect.objectContaining({
						sync: expect.objectContaining({
							fileId: "test-article",
							serverPath: "test.md", // Root level path
						}),
					}),
				}),
			);
		});

		it("should not update serverPath for non-sync articles", async () => {
			const regularDocJrn = "jrn:docs:article/regular-article";

			const existingDoc = mockDoc({
				id: 1,
				jrn: regularDocJrn,
				content: "# Test",
				parentId: 10,
			});

			mockDao.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDao.updateDoc = vi.fn().mockImplementation(data => {
				return mockDoc({ ...existingDoc, ...data });
			});

			// Update with new parentId
			const response = await request(app)
				.put(`/docs/${encodeURIComponent(regularDocJrn)}`)
				.set("Cookie", `authToken=${authToken}`)
				.send({
					jrn: regularDocJrn,
					content: "# Test",
					parentId: 20, // Moving to different folder
					version: 2,
				});

			expect(response.status).toBe(200);

			// Verify updateDoc was called without contentMetadata.sync changes
			expect(mockDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					parentId: 20,
				}),
			);
			// readDocById should not be called for non-sync articles
			expect(mockDao.readDocById).not.toHaveBeenCalled();
		});

		it("should not update serverPath when parentId does not change", async () => {
			const mockSyncArticleDaoInstance = mockSyncArticleDao();
			vi.spyOn(mockSyncArticleDaoInstance, "advanceCursor").mockResolvedValue(1);

			const appWithSyncDao = express();
			appWithSyncDao.use(cookieParser());
			appWithSyncDao.use(express.json());
			appWithSyncDao.use(
				"/docs",
				createAuthHandler(tokenUtil),
				createDocRouter(
					mockDaoProvider(mockDao),
					mockDaoProvider(mockDocDraftDaoInstance),
					tokenUtil,
					mockPermissionMiddleware,
					mockDaoProvider(mockSyncArticleDaoInstance),
				),
			);

			const syncArticleJrn = "jrn:/global:docs:article/sync-test-article";

			const existingDoc = mockDoc({
				id: 1,
				jrn: syncArticleJrn,
				content: "# Test",
				parentId: 10,
				contentMetadata: {
					sync: {
						fileId: "test-article",
						serverPath: "notes/test.md",
					},
				},
			});

			mockDao.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDao.updateDoc = vi.fn().mockImplementation(data => {
				return mockDoc({ ...existingDoc, ...data });
			});

			// Update content only, same parentId
			const response = await request(appWithSyncDao)
				.put(`/docs/${encodeURIComponent(syncArticleJrn)}`)
				.set("Cookie", `authToken=${authToken}`)
				.send({
					jrn: syncArticleJrn,
					content: "# Updated",
					parentId: 10, // Same parentId
					version: 2,
				});

			expect(response.status).toBe(200);

			// readDocById should not be called since parentId didn't change
			expect(mockDao.readDocById).not.toHaveBeenCalled();
		});
	});

	describe("DELETE /clearAll", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).delete("/docs/clearAll");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should delete all docs and return 204", async () => {
			const deleteAllDocsSpy = vi.spyOn(mockDao, "deleteAllDocs").mockResolvedValue(undefined);

			const response = await request(app).delete("/docs/clearAll").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(204);
			expect(response.body).toEqual({});
			expect(deleteAllDocsSpy).toHaveBeenCalled();
		});

		it("should return 400 on deletion error", async () => {
			vi.spyOn(mockDao, "deleteAllDocs").mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/docs/clearAll").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to clear all documents" });
		});

		it("should have correct content-type header on error", async () => {
			vi.spyOn(mockDao, "deleteAllDocs").mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/docs/clearAll").set("Cookie", `authToken=${authToken}`);

			expect(response.headers["content-type"]).toMatch(/json/);
		});
	});

	describe("DELETE /:jrn", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).delete("/docs/test-arn");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should delete doc and return 204", async () => {
			mockDao.readDoc = vi.fn().mockResolvedValue(mockDoc());
			mockDao.deleteDoc = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).delete("/docs/test-arn").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(204);
			expect(response.body).toEqual({});
			expect(mockDao.deleteDoc).toHaveBeenCalledWith("test-arn");
		});

		it("should soft delete sync doc and advance cursor", async () => {
			const syncJrnPrefix = getConfig().SYNC_JRN_PREFIX;
			const syncDoc = mockDoc({
				id: 1,
				jrn: `${syncJrnPrefix}test-file-id`,
				version: 1,
				contentMetadata: {
					sync: {
						fileId: "test-file-id",
						serverPath: "notes/test.md",
					},
				},
			});
			mockDao.readDoc = vi.fn().mockResolvedValue(syncDoc);
			mockDao.softDelete = vi.fn().mockResolvedValue(undefined);
			mockDao.updateDoc = vi.fn().mockResolvedValue(
				mockDoc({
					...syncDoc,
					version: 2,
					deletedAt: new Date(),
					explicitlyDeleted: true,
					contentMetadata: {
						sync: {
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							deleted: true,
							deletedAt: Date.now(),
						},
					},
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(2);

			const response = await request(app)
				.delete(`/docs/${encodeURIComponent(syncDoc.jrn)}`)
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(204);
			expect(mockDao.softDelete).toHaveBeenCalledWith(1);
			expect(mockDao.deleteDoc).not.toHaveBeenCalled();
			expect(mockDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					version: 2,
					deletedAt: expect.any(Date),
					explicitlyDeleted: true,
					contentMetadata: expect.objectContaining({
						sync: expect.objectContaining({
							deleted: true,
						}),
					}),
				}),
			);
			expect(mockSyncArticleDaoInstance.advanceCursor).toHaveBeenCalledWith(syncDoc.jrn);
		});

		it("should return 400 on deletion error", async () => {
			mockDao.deleteDoc = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/docs/test-arn").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Failed to delete document" });
		});

		it("should have correct content-type header on error", async () => {
			mockDao.deleteDoc = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/docs/test-arn").set("Cookie", `authToken=${authToken}`);

			expect(response.headers["content-type"]).toMatch(/json/);
		});
	});

	describe("POST /docs/search-by-title", () => {
		it("should search docs by title", async () => {
			mockDao.searchDocsByTitle = vi.fn().mockResolvedValue([mockDoc()]);

			const response = await request(app)
				.post("/docs/search-by-title")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					title: "test",
				});

			expect(response.status).toBe(200);
			expect(mockDao.searchDocsByTitle).toHaveBeenCalledWith("test", 1);
			expect(response.body).toHaveLength(1);
		});

		it("should return 400 when title is missing", async () => {
			const response = await request(app)
				.post("/docs/search-by-title")
				.set("Cookie", `authToken=${authToken}`)
				.send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Title is required and must be a string" });
		});

		it("should return 400 when title is not a string", async () => {
			const response = await request(app)
				.post("/docs/search-by-title")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					title: 123,
				});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Title is required and must be a string" });
		});

		it("should return 500 on search error", async () => {
			mockDao.searchDocsByTitle = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/docs/search-by-title")
				.set("Cookie", `authToken=${authToken}`)
				.send({
					title: "test",
				});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to search by title" });
		});
	});

	describe("POST /:jrn/create-draft", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docs/test-arn/create-draft");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return 401 when token decode fails in endpoint", async () => {
			// Create a temporary app without auth middleware to test the endpoint's own auth check
			const tempApp = express();
			tempApp.use(cookieParser());
			tempApp.use(express.json());

			// Create a mock tokenUtil that returns undefined
			const mockTokenUtil = {
				decodePayload: vi.fn().mockReturnValue(undefined),
				generateToken: vi.fn(),
			};

			tempApp.use(
				"/docs",
				createDocRouter(
					mockDaoProvider(mockDao),
					mockDaoProvider(mockDocDraftDaoInstance),
					mockTokenUtil as unknown as typeof tokenUtil,
					mockPermissionMiddleware,
				),
			);

			const response = await request(tempApp).post("/docs/test-arn/create-draft");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Unauthorized" });
		});

		it("should create a draft from an article", async () => {
			const doc = mockDoc({ jrn: "test-arn", content: "test content" });
			const draft = {
				id: 1,
				docId: doc.id,
				title: "Test Article",
				content: "test content",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([]);
			mockDocDraftDaoInstance.createDocDraft = vi.fn().mockResolvedValue(draft);

			const response = await request(app)
				.post("/docs/test-arn/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(201);
			expect(response.body).toMatchObject({
				id: 1,
				docId: doc.id,
				title: "Test Article",
				content: "test content",
			});
			expect(mockDao.readDoc).toHaveBeenCalledWith("test-arn");
			expect(mockDocDraftDaoInstance.findByDocId).toHaveBeenCalledWith(doc.id);
			expect(mockDocDraftDaoInstance.createDocDraft).toHaveBeenCalled();
		});

		it("should use doc slug as title when contentMetadata.title is missing", async () => {
			const doc = mockDoc({
				jrn: "test-arn-123",
				slug: "test-arn-123",
				content: "test content",
				contentMetadata: undefined,
			});
			const draft = {
				id: 1,
				docId: doc.id,
				title: "test-arn-123",
				content: "test content",
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([]);
			mockDocDraftDaoInstance.createDocDraft = vi.fn().mockResolvedValue(draft);

			const response = await request(app)
				.post("/docs/test-arn-123/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(201);
			expect(mockDocDraftDaoInstance.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					docId: doc.id,
					title: "test-arn-123",
					content: "test content",
					contentType: "text/markdown",
					createdBy: 1,
				}),
			);
		});

		it("should use doc slug as title when contentMetadata.title is empty string", async () => {
			const doc = mockDoc({
				jrn: "test-arn-456",
				slug: "test-arn-456",
				content: "test content",
				contentMetadata: { title: "" },
			});
			const draft = {
				id: 1,
				docId: doc.id,
				title: "test-arn-456",
				content: "test content",
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([]);
			mockDocDraftDaoInstance.createDocDraft = vi.fn().mockResolvedValue(draft);

			const response = await request(app)
				.post("/docs/test-arn-456/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(201);
			expect(mockDocDraftDaoInstance.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					docId: doc.id,
					title: "test-arn-456",
					content: "test content",
					contentType: "text/markdown",
					createdBy: 1,
				}),
			);
		});

		it("should set space from JRN workspace when using new format", async () => {
			// New JRN format with "root" workspace: jrn:prod:root:docs:article/test-script
			const jrn = jrnParser.article("test-script", { workspace: ROOT_WORKSPACE });
			const expectedSpace = `/${ROOT_WORKSPACE}`;
			const doc = mockDoc({
				jrn,
				content: "test content",
				contentMetadata: { title: "Test Script" },
			});
			const draft = {
				id: 1,
				docId: doc.id,
				title: "Test Script",
				content: "test content",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([]);
			mockDocDraftDaoInstance.createDocDraft = vi.fn().mockResolvedValue(draft);

			const response = await request(app)
				.post(`/docs/${encodeURIComponent(jrn)}/create-draft`)
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(201);
			expect(mockDocDraftDaoInstance.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					contentMetadata: expect.objectContaining({ space: expectedSpace }),
				}),
			);
		});

		it("should set space from legacy /root prefix format", async () => {
			const legacyRootPath = `/${ROOT_WORKSPACE}`;
			const doc = mockDoc({
				jrn: `${legacyRootPath}/scripts/test-doc`,
				content: "test content",
				contentMetadata: { title: "Legacy Root Doc" },
			});
			const draft = {
				id: 1,
				docId: doc.id,
				title: "Legacy Root Doc",
				content: "test content",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([]);
			mockDocDraftDaoInstance.createDocDraft = vi.fn().mockResolvedValue(draft);

			const response = await request(app)
				.post(`/docs/${encodeURIComponent(`${legacyRootPath}/scripts/test-doc`)}/create-draft`)
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(201);
			expect(mockDocDraftDaoInstance.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					contentMetadata: expect.objectContaining({ space: legacyRootPath }),
				}),
			);
		});

		it("should not set space for default workspace (global)", async () => {
			// Default workspace "global" should not set a space
			const jrn = jrnParser.article("regular-article");
			const doc = mockDoc({
				jrn,
				content: "test content",
				contentMetadata: { title: "Regular Article" },
			});
			const draft = {
				id: 1,
				docId: doc.id,
				title: "Regular Article",
				content: "test content",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([]);
			mockDocDraftDaoInstance.createDocDraft = vi.fn().mockResolvedValue(draft);

			const response = await request(app)
				.post(`/docs/${encodeURIComponent(jrn)}/create-draft`)
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(201);
			expect(mockDocDraftDaoInstance.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					contentMetadata: expect.objectContaining({ space: undefined }),
				}),
			);
		});

		it("should preserve contentType when creating draft from JSON article", async () => {
			const doc = mockDoc({
				jrn: "test-api-spec",
				content: '{"openapi": "3.0.0"}',
				contentType: "application/json",
				contentMetadata: { title: "API Spec" },
			});
			const draft = {
				id: 1,
				docId: doc.id,
				title: "API Spec",
				content: '{"openapi": "3.0.0"}',
				contentType: "application/json",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([]);
			mockDocDraftDaoInstance.createDocDraft = vi.fn().mockResolvedValue(draft);

			const response = await request(app)
				.post("/docs/test-api-spec/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(201);
			expect(response.body.contentType).toBe("application/json");
			expect(mockDocDraftDaoInstance.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					docId: doc.id,
					title: "API Spec",
					content: '{"openapi": "3.0.0"}',
					contentType: "application/json",
					createdBy: 1,
				}),
			);
		});

		it("should preserve contentType when creating draft from YAML article", async () => {
			const doc = mockDoc({
				jrn: "test-yaml-spec",
				content: "openapi: '3.0.0'",
				contentType: "application/yaml",
				contentMetadata: { title: "YAML Spec" },
			});
			const draft = {
				id: 1,
				docId: doc.id,
				title: "YAML Spec",
				content: "openapi: '3.0.0'",
				contentType: "application/yaml",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([]);
			mockDocDraftDaoInstance.createDocDraft = vi.fn().mockResolvedValue(draft);

			const response = await request(app)
				.post("/docs/test-yaml-spec/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(201);
			expect(response.body.contentType).toBe("application/yaml");
			expect(mockDocDraftDaoInstance.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					docId: doc.id,
					title: "YAML Spec",
					content: "openapi: '3.0.0'",
					contentType: "application/yaml",
					createdBy: 1,
				}),
			);
		});

		it("should return existing draft if one already exists for the user", async () => {
			const doc = mockDoc({ jrn: "test-arn", id: 5 });
			const existingDraft = {
				id: 10,
				docId: doc.id,
				title: "Existing Draft",
				content: "existing content",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: new Date(), // User has made edits
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([existingDraft]);
			const createDraftSpy = vi.spyOn(mockDocDraftDaoInstance, "createDocDraft");

			const response = await request(app)
				.post("/docs/test-arn/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 10,
				docId: doc.id,
				title: "Existing Draft",
			});
			expect(createDraftSpy).not.toHaveBeenCalled();
		});

		it("should sync draft content when article was updated after unedited draft was created", async () => {
			const draftCreatedAt = new Date("2024-01-01T00:00:00Z");
			const articleUpdatedAt = new Date("2024-01-02T00:00:00Z"); // Article updated after draft

			const doc = mockDoc({
				jrn: "test-arn",
				id: 5,
				content: "updated article content",
				contentMetadata: { title: "Updated Title" },
				updatedAt: articleUpdatedAt,
			});

			const existingDraft = {
				id: 10,
				docId: doc.id,
				title: "Old Draft Title",
				content: "old draft content",
				createdBy: 1,
				createdAt: draftCreatedAt,
				updatedAt: draftCreatedAt,
				contentLastEditedAt: null, // User has NOT made edits
				contentMetadata: { sectionIds: {} },
			};

			const updatedDraft = {
				...existingDraft,
				title: "Updated Title",
				content: "updated article content",
				updatedAt: new Date(),
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([existingDraft]);
			mockDocDraftDaoInstance.updateDocDraft = vi.fn().mockResolvedValue(updatedDraft);
			const createDraftSpy = vi.spyOn(mockDocDraftDaoInstance, "createDocDraft");

			const response = await request(app)
				.post("/docs/test-arn/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 10,
				title: "Updated Title",
				content: "updated article content",
			});
			expect(createDraftSpy).not.toHaveBeenCalled();
			expect(mockDocDraftDaoInstance.updateDocDraft).toHaveBeenCalledWith(10, {
				content: "updated article content",
				title: "Updated Title",
				contentMetadata: expect.objectContaining({ sectionIds: expect.any(Object) }),
			});
		});

		it("should NOT sync draft content when user has made edits", async () => {
			const draftCreatedAt = new Date("2024-01-01T00:00:00Z");
			const userEditedAt = new Date("2024-01-01T12:00:00Z"); // User edited draft
			const articleUpdatedAt = new Date("2024-01-02T00:00:00Z"); // Article updated after user edit

			const doc = mockDoc({
				jrn: "test-arn",
				id: 5,
				content: "updated article content",
				contentMetadata: { title: "Updated Title" },
				updatedAt: articleUpdatedAt,
			});

			const existingDraft = {
				id: 10,
				docId: doc.id,
				title: "User's Draft Title",
				content: "user's draft content",
				createdBy: 1,
				createdAt: draftCreatedAt,
				updatedAt: userEditedAt,
				contentLastEditedAt: userEditedAt, // User HAS made edits
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([existingDraft]);
			const updateDraftSpy = vi.spyOn(mockDocDraftDaoInstance, "updateDocDraft");

			const response = await request(app)
				.post("/docs/test-arn/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 10,
				title: "User's Draft Title",
				content: "user's draft content",
			});
			expect(updateDraftSpy).not.toHaveBeenCalled();
		});

		it("should NOT sync draft when article was NOT updated after draft creation", async () => {
			const articleUpdatedAt = new Date("2024-01-01T00:00:00Z");
			const draftCreatedAt = new Date("2024-01-02T00:00:00Z"); // Draft created after article

			const doc = mockDoc({
				jrn: "test-arn",
				id: 5,
				content: "article content",
				updatedAt: articleUpdatedAt,
			});

			const existingDraft = {
				id: 10,
				docId: doc.id,
				title: "Draft Title",
				content: "draft content",
				createdBy: 1,
				createdAt: draftCreatedAt,
				updatedAt: draftCreatedAt,
				contentLastEditedAt: null, // User has NOT made edits
			};

			mockDao.readDoc = vi.fn().mockResolvedValue(doc);
			mockDocDraftDaoInstance.findByDocId = vi.fn().mockResolvedValue([existingDraft]);
			const updateDraftSpy = vi.spyOn(mockDocDraftDaoInstance, "updateDocDraft");

			const response = await request(app)
				.post("/docs/test-arn/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 10,
				title: "Draft Title",
				content: "draft content",
			});
			expect(updateDraftSpy).not.toHaveBeenCalled();
		});

		it("should return 404 when article not found", async () => {
			mockDao.readDoc = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/nonexistent-arn/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should return 500 on error", async () => {
			mockDao.readDoc = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/docs/test-arn/create-draft")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to create draft from article" });
		});
	});

	describe("POST /by-id/:id/soft-delete", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docs/by-id/1/soft-delete");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should soft delete document and return 204", async () => {
			const doc = mockDoc({ id: 1, jrn: "test-arn" });
			mockDao.readDocById = vi.fn().mockResolvedValue(doc);
			mockDao.softDelete = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/by-id/1/soft-delete")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(204);
			expect(mockDao.readDocById).toHaveBeenCalledWith(1);
			expect(mockDao.softDelete).toHaveBeenCalledWith(1);
		});

		it("should mark sync doc deleted and advance cursor", async () => {
			const syncJrnPrefix = getConfig().SYNC_JRN_PREFIX;
			const doc = mockDoc({
				id: 1,
				jrn: `${syncJrnPrefix}sync-soft-delete`,
				version: 3,
				contentMetadata: {
					sync: {
						fileId: "sync-soft-delete",
						serverPath: "notes/sync-soft-delete.md",
					},
				},
			});
			mockDao.readDocById = vi.fn().mockResolvedValue(doc);
			mockDao.softDelete = vi.fn().mockResolvedValue(undefined);
			mockDao.updateDoc = vi.fn().mockResolvedValue(
				mockDoc({
					...doc,
					version: 4,
					deletedAt: new Date(),
					explicitlyDeleted: true,
					contentMetadata: {
						sync: {
							fileId: "sync-soft-delete",
							serverPath: "notes/sync-soft-delete.md",
							deleted: true,
							deletedAt: Date.now(),
						},
					},
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(4);

			const response = await request(app)
				.post("/docs/by-id/1/soft-delete")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(204);
			expect(mockDao.softDelete).toHaveBeenCalledWith(1);
			expect(mockDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					version: 4,
					deletedAt: expect.any(Date),
					explicitlyDeleted: true,
					contentMetadata: expect.objectContaining({
						sync: expect.objectContaining({
							deleted: true,
						}),
					}),
				}),
			);
			expect(mockSyncArticleDaoInstance.advanceCursor).toHaveBeenCalledWith(doc.jrn);
		});

		it("should return 400 when id is not a valid number", async () => {
			const response = await request(app)
				.post("/docs/by-id/invalid/soft-delete")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid document ID" });
		});

		it("should return 404 when document not found", async () => {
			mockDao.readDocById = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/by-id/999/soft-delete")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should return 500 on soft delete error", async () => {
			const doc = mockDoc({ id: 1, jrn: "test-arn" });
			mockDao.readDocById = vi.fn().mockResolvedValue(doc);
			mockDao.softDelete = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/docs/by-id/1/soft-delete")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to soft delete document" });
		});
	});

	describe("POST /by-id/:id/restore", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docs/by-id/1/restore");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should restore document and return 204", async () => {
			const doc = mockDoc({ id: 1, jrn: "test-arn", deletedAt: new Date() });
			mockDao.readDocById = vi.fn().mockResolvedValue(doc);
			mockDao.restore = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).post("/docs/by-id/1/restore").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(204);
			expect(mockDao.readDocById).toHaveBeenCalledWith(1);
			expect(mockDao.restore).toHaveBeenCalledWith(1);
		});

		it("should return 400 when id is not a valid number", async () => {
			const response = await request(app)
				.post("/docs/by-id/invalid/restore")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid document ID" });
		});

		it("should return 404 when document not found", async () => {
			mockDao.readDocById = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).post("/docs/by-id/999/restore").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should return 400 when document is not deleted", async () => {
			const doc = mockDoc({ id: 1, jrn: "test-arn", deletedAt: undefined });
			mockDao.readDocById = vi.fn().mockResolvedValue(doc);

			const response = await request(app).post("/docs/by-id/1/restore").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Document is not deleted" });
		});

		it("should return 500 on restore error", async () => {
			const doc = mockDoc({ id: 1, jrn: "test-arn", deletedAt: new Date() });
			mockDao.readDocById = vi.fn().mockResolvedValue(doc);
			mockDao.restore = vi.fn().mockRejectedValue(new Error("Database error"));

			// Use a local app without auth middleware to isolate restore error handling.
			const tempApp = express();
			tempApp.use(cookieParser());
			tempApp.use(express.json());
			tempApp.use(
				"/docs",
				createDocRouter(
					mockDaoProvider(mockDao),
					mockDaoProvider(mockDocDraftDaoInstance),
					tokenUtil,
					mockPermissionMiddleware,
					mockDaoProvider(mockSyncArticleDaoInstance),
				),
			);

			const response = await request(tempApp).post("/docs/by-id/1/restore");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to restore document" });
		});
	});

	describe("POST /by-id/:id/rename", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docs/by-id/1/rename").send({ title: "New Title" });

			expect(response.status).toBe(401);
		});

		it("should rename document and return updated doc", async () => {
			const existingDoc = mockDoc({ id: 1, jrn: "test-arn", contentMetadata: { title: "Old Title" } });
			const updatedDoc = mockDoc({ id: 1, jrn: "test-arn", contentMetadata: { title: "New Title" } });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.renameDoc = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/rename")
				.set("Cookie", `authToken=${authToken}`)
				.send({ title: "New Title" });

			expect(response.status).toBe(200);
			// JSON serialization converts Date objects to ISO strings and removes undefined properties
			expect(response.body).toEqual(JSON.parse(JSON.stringify(updatedDoc)));
			expect(mockDao.renameDoc).toHaveBeenCalledWith(1, "New Title");
		});

		it("should return 400 when id is not a valid number", async () => {
			const response = await request(app)
				.post("/docs/by-id/invalid/rename")
				.set("Cookie", `authToken=${authToken}`)
				.send({ title: "New Title" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid document ID" });
		});

		it("should return 400 when title is missing", async () => {
			const response = await request(app)
				.post("/docs/by-id/1/rename")
				.set("Cookie", `authToken=${authToken}`)
				.send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Title is required and cannot be empty" });
		});

		it("should return 400 when title is empty", async () => {
			const response = await request(app)
				.post("/docs/by-id/1/rename")
				.set("Cookie", `authToken=${authToken}`)
				.send({ title: "   " });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Title is required and cannot be empty" });
		});

		it("should return 404 when document not found", async () => {
			mockDao.readDocById = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/by-id/999/rename")
				.set("Cookie", `authToken=${authToken}`)
				.send({ title: "New Title" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should return 500 when renameDoc fails", async () => {
			const existingDoc = mockDoc({ id: 1, jrn: "test-arn" });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.renameDoc = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/by-id/1/rename")
				.set("Cookie", `authToken=${authToken}`)
				.send({ title: "New Title" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to rename document" });
		});

		it("should return 500 on rename error", async () => {
			const existingDoc = mockDoc({ id: 1, jrn: "test-arn" });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.renameDoc = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/docs/by-id/1/rename")
				.set("Cookie", `authToken=${authToken}`)
				.send({ title: "New Title" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to rename document" });
		});

		it("should trim whitespace from title", async () => {
			const existingDoc = mockDoc({ id: 1, jrn: "test-arn" });
			const updatedDoc = mockDoc({ id: 1, jrn: "test-arn", contentMetadata: { title: "New Title" } });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.renameDoc = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/rename")
				.set("Cookie", `authToken=${authToken}`)
				.send({ title: "  New Title  " });

			expect(response.status).toBe(200);
			expect(mockDao.renameDoc).toHaveBeenCalledWith(1, "New Title");
		});
	});

	describe("POST /by-id/:id/reorder", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docs/by-id/1/reorder").send({ direction: "up" });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should reorder document up successfully", async () => {
			const updatedDoc = mockDoc({ id: 1, sortOrder: 0 });
			mockDao.reorderDoc = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/reorder")
				.set("Cookie", `authToken=${authToken}`)
				.send({ direction: "up" });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, sortOrder: 0 });
			expect(mockDao.reorderDoc).toHaveBeenCalledWith(1, "up");
		});

		it("should reorder document down successfully", async () => {
			const updatedDoc = mockDoc({ id: 1, sortOrder: 2 });
			mockDao.reorderDoc = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/reorder")
				.set("Cookie", `authToken=${authToken}`)
				.send({ direction: "down" });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, sortOrder: 2 });
			expect(mockDao.reorderDoc).toHaveBeenCalledWith(1, "down");
		});

		it("should return 400 for invalid document ID", async () => {
			const response = await request(app)
				.post("/docs/by-id/invalid/reorder")
				.set("Cookie", `authToken=${authToken}`)
				.send({ direction: "up" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid document ID" });
		});

		it("should return 400 when direction is not provided", async () => {
			const response = await request(app)
				.post("/docs/by-id/1/reorder")
				.set("Cookie", `authToken=${authToken}`)
				.send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Direction must be 'up' or 'down'" });
		});

		it("should return 400 when direction is invalid", async () => {
			const response = await request(app)
				.post("/docs/by-id/1/reorder")
				.set("Cookie", `authToken=${authToken}`)
				.send({ direction: "left" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Direction must be 'up' or 'down'" });
		});

		it("should return 400 when document is not found or at boundary", async () => {
			mockDao.reorderDoc = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/by-id/999/reorder")
				.set("Cookie", `authToken=${authToken}`)
				.send({ direction: "up" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Cannot reorder: document not found or at boundary" });
		});

		it("should return 500 on reorder error", async () => {
			mockDao.reorderDoc = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/docs/by-id/1/reorder")
				.set("Cookie", `authToken=${authToken}`)
				.send({ direction: "up" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to reorder document" });
		});
	});

	describe("POST /by-id/:id/reorder-at", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.send({ referenceDocId: 2, position: "after" });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should reorder document after another document", async () => {
			const updatedDoc = mockDoc({ id: 1, sortOrder: 1.5 });
			mockDao.reorderAt = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: 2, position: "after" });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, sortOrder: 1.5 });
			expect(mockDao.reorderAt).toHaveBeenCalledWith(1, 2, "after");
		});

		it("should reorder document before another document", async () => {
			const updatedDoc = mockDoc({ id: 1, sortOrder: 0.5 });
			mockDao.reorderAt = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: 2, position: "before" });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, sortOrder: 0.5 });
			expect(mockDao.reorderAt).toHaveBeenCalledWith(1, 2, "before");
		});

		it("should move to end of folder (referenceDocId null)", async () => {
			const updatedDoc = mockDoc({ id: 1, sortOrder: 10 });
			mockDao.reorderAt = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: null, position: "after" });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, sortOrder: 10 });
			expect(mockDao.reorderAt).toHaveBeenCalledWith(1, null, "after");
		});

		it("should return 400 for invalid document ID", async () => {
			const response = await request(app)
				.post("/docs/by-id/invalid/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: 2, position: "after" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid document ID" });
		});

		it("should use default position (after) when position is not provided", async () => {
			const updatedDoc = mockDoc({ id: 1, sortOrder: 1.5 });
			mockDao.reorderAt = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: 2 });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, sortOrder: 1.5 });
			expect(mockDao.reorderAt).toHaveBeenCalledWith(1, 2, undefined);
		});

		it("should move to end when no referenceDocId provided", async () => {
			const updatedDoc = mockDoc({ id: 1, sortOrder: 10 });
			mockDao.reorderAt = vi.fn().mockResolvedValue(updatedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({});

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, sortOrder: 10 });
			expect(mockDao.reorderAt).toHaveBeenCalledWith(1, undefined, undefined);
		});

		it("should return 400 when position is invalid", async () => {
			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: 2, position: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid position: must be 'before' or 'after'" });
		});

		it("should return 400 when referenceDocId is invalid type", async () => {
			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: "invalid", position: "after" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid referenceDocId: must be a number or null" });
		});

		it("should return 400 when referenceDocId is not a positive integer", async () => {
			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: -1, position: "after" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid referenceDocId: must be a positive integer" });
		});

		it("should return 400 when document not found", async () => {
			mockDao.reorderAt = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/by-id/999/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: 2, position: "after" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Cannot reorder: document not found" });
		});

		it("should return 400 when referenceDocId is not a sibling", async () => {
			mockDao.reorderAt = vi.fn().mockRejectedValue(new Error("referenceDocId must be in the target folder"));

			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: 2, position: "after" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "referenceDocId must be in the target folder" });
		});

		it("should return 500 on database error", async () => {
			mockDao.reorderAt = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/docs/by-id/1/reorder-at")
				.set("Cookie", `authToken=${authToken}`)
				.send({ referenceDocId: 2, position: "after" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to reorder document" });
		});
	});

	describe("POST /by-id/:id/move", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/docs/by-id/1/move").send({ parentId: 2 });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should move document successfully to another folder", async () => {
			const existingDoc = mockDoc({ id: 1, parentId: 1, path: "/folder-a/doc" });
			const movedDoc = mockDoc({ id: 1, parentId: 2, path: "/folder-b/doc", version: existingDoc.version + 1 });

			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockResolvedValue(movedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2 });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, parentId: 2, path: "/folder-b/doc" });
			expect(mockDao.moveDoc).toHaveBeenCalledWith(1, 2, undefined, undefined);
		});

		it("should move document to root level (parentId null)", async () => {
			const existingDoc = mockDoc({ id: 1, parentId: 1, path: "/folder/doc" });
			const movedDoc = mockDoc({ id: 1, parentId: undefined, path: "/doc", version: existingDoc.version + 1 });

			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockResolvedValue(movedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: null });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, path: "/doc" });
			expect(mockDao.moveDoc).toHaveBeenCalledWith(1, undefined, undefined, undefined);
		});

		it("should move document to specific position with referenceDocId and position=after", async () => {
			const existingDoc = mockDoc({ id: 1, parentId: 1, path: "/folder-a/doc" });
			const movedDoc = mockDoc({ id: 1, parentId: 2, path: "/folder-b/doc", sortOrder: 1.5 });

			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockResolvedValue(movedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2, referenceDocId: 3, position: "after" });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, parentId: 2, sortOrder: 1.5 });
			expect(mockDao.moveDoc).toHaveBeenCalledWith(1, 2, 3, "after");
		});

		it("should move document to specific position with referenceDocId and position=before", async () => {
			const existingDoc = mockDoc({ id: 1, parentId: 1, path: "/folder-a/doc" });
			const movedDoc = mockDoc({ id: 1, parentId: 2, path: "/folder-b/doc", sortOrder: 0.5 });

			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockResolvedValue(movedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2, referenceDocId: 3, position: "before" });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, parentId: 2, sortOrder: 0.5 });
			expect(mockDao.moveDoc).toHaveBeenCalledWith(1, 2, 3, "before");
		});

		it("should move document to end with referenceDocId null", async () => {
			const existingDoc = mockDoc({ id: 1, parentId: 1, path: "/folder-a/doc" });
			const movedDoc = mockDoc({ id: 1, parentId: 2, path: "/folder-b/doc", sortOrder: 2.0 });

			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockResolvedValue(movedDoc);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2, referenceDocId: null });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ id: 1, parentId: 2, sortOrder: 2.0 });
			expect(mockDao.moveDoc).toHaveBeenCalledWith(1, 2, null, undefined);
		});

		it("should return 400 for invalid referenceDocId type", async () => {
			const existingDoc = mockDoc({ id: 1 });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2, referenceDocId: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid referenceDocId: must be a number or null" });
		});

		it("should return 400 for negative referenceDocId", async () => {
			const existingDoc = mockDoc({ id: 1 });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2, referenceDocId: -1 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid referenceDocId: must be a positive integer" });
		});

		it("should return 400 for invalid position value", async () => {
			const existingDoc = mockDoc({ id: 1 });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2, referenceDocId: 3, position: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid position: must be 'before' or 'after'" });
		});

		it("should return 400 for invalid document ID", async () => {
			const response = await request(app)
				.post("/docs/by-id/invalid/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid document ID" });
		});

		it("should return 404 when document not found", async () => {
			mockDao.readDocById = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/by-id/999/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2 });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Document not found" });
		});

		it("should return 400 for circular reference error", async () => {
			const existingDoc = mockDoc({ id: 1, docType: "folder" });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockRejectedValue(new Error("Cannot move folder to its descendant"));

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Cannot move folder to its descendant" });
		});

		it("should return 400 for moving to itself error", async () => {
			const existingDoc = mockDoc({ id: 1 });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockRejectedValue(new Error("Cannot move item to itself"));

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 1 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Cannot move item to itself" });
		});

		it("should return 400 for deleted parent error", async () => {
			const existingDoc = mockDoc({ id: 1 });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockRejectedValue(new Error("Target folder not found or has been deleted"));

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Target folder not found or has been deleted" });
		});

		it("should return 400 for non-folder parent error", async () => {
			const existingDoc = mockDoc({ id: 1 });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockRejectedValue(new Error("Target must be a folder"));

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Target must be a folder" });
		});

		it("should return 500 when moveDoc returns undefined", async () => {
			const existingDoc = mockDoc({ id: 1 });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2 });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to move document" });
		});

		it("should return 500 on database error", async () => {
			const existingDoc = mockDoc({ id: 1 });
			mockDao.readDocById = vi.fn().mockResolvedValue(existingDoc);
			mockDao.moveDoc = vi.fn().mockRejectedValue(new Error("Database connection failed"));

			const response = await request(app)
				.post("/docs/by-id/1/move")
				.set("Cookie", `authToken=${authToken}`)
				.send({ parentId: 2 });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to move document" });
		});
	});
});
