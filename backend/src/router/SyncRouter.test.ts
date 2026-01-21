import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import { mockDocDao } from "../dao/DocDao.mock";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import { mockSyncArticleDao } from "../dao/SyncArticleDao.mock";
import { mockDoc } from "../model/Doc.mock";
import { integrityHashFromContent } from "../util/SyncHelpers";
import { createSyncRouter } from "./SyncRouter";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("SyncRouter", () => {
	let app: Express;
	let mockDocDaoInstance: DocDao;
	let mockSyncArticleDaoInstance: SyncArticleDao;

	beforeEach(() => {
		mockDocDaoInstance = mockDocDao();
		mockSyncArticleDaoInstance = mockSyncArticleDao();
		app = express();
		app.use(express.json());
		app.use(
			"/v1/sync",
			createSyncRouter(mockDaoProvider(mockDocDaoInstance), mockDaoProvider(mockSyncArticleDaoInstance)),
		);
	});

	describe("POST /v1/sync/push", () => {
		it("should create new sync article on push", async () => {
			// Setup: no existing doc
			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(undefined);
			mockDocDaoInstance.createDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "jrn:/global:docs:article/sync-test-file-id",
					content: "# Test",
					version: 1,
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(1);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(1);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 0,
							content: "# Test",
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results).toHaveLength(1);
			expect(response.body.results[0].status).toBe("ok");
			expect(response.body.results[0].newVersion).toBe(1);
			expect(response.body.newCursor).toBe(1);

			expect(mockDocDaoInstance.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					jrn: "jrn:/global:docs:article/sync-test-file-id",
					content: "# Test",
					contentType: "text/markdown",
					updatedBy: "sync-server",
					contentMetadata: expect.objectContaining({
						sync: expect.objectContaining({
							fileId: "test-file-id",
							serverPath: "notes/test.md",
						}),
					}),
				}),
			);
			expect(mockSyncArticleDaoInstance.advanceCursor).toHaveBeenCalledWith(
				"jrn:/global:docs:article/sync-test-file-id",
			);
		});

		it("should update existing sync article on push", async () => {
			const existingDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Original",
				version: 1,
				contentMetadata: {
					sync: {
						fileId: "test-file-id",
						serverPath: "notes/test.md",
					},
				},
			});

			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDocDaoInstance.updateDocIfVersion = vi.fn().mockResolvedValue(
				mockDoc({
					...existingDoc,
					content: "# Updated",
					version: 2,
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(2);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(2);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 1,
							content: "# Updated",
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("ok");
			expect(response.body.results[0].newVersion).toBe(2);
			expect(mockDocDaoInstance.updateDocIfVersion).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "# Updated",
					version: 2,
				}),
				1,
			);
		});

		it("should return conflict when baseVersion does not match", async () => {
			const existingDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Original",
				version: 2,
			});

			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(1);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 1, // Wrong version
							content: "# Updated",
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("conflict");
			expect(response.body.results[0].serverVersion).toBe(2);
		});

		it("should return bad_hash when content hash does not match", async () => {
			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(undefined);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(0);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 0,
							content: "# Test",
							contentHash: "invalid-hash",
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("bad_hash");
		});

		it("should handle delete operation", async () => {
			const existingDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Original",
				version: 1,
			});

			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDocDaoInstance.updateDocIfVersion = vi.fn().mockResolvedValue(
				mockDoc({
					...existingDoc,
					version: 2,
					contentMetadata: {
						sync: {
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							deleted: true,
							deletedAt: expect.any(Number),
						},
					},
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(2);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(2);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "delete",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 1,
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("ok");
			expect(mockDocDaoInstance.updateDocIfVersion).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "# Original", // Content preserved on delete
					contentMetadata: expect.objectContaining({
						sync: expect.objectContaining({
							deleted: true,
						}),
					}),
				}),
				1,
			);
		});
	});

	describe("POST /v1/sync/pull", () => {
		it("should return all sync articles on initial pull (sinceCursor=0)", async () => {
			const syncDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Test Content",
				version: 1,
				contentMetadata: {
					sync: {
						fileId: "test-file-id",
						serverPath: "notes/test.md",
					},
				},
			});

			mockDocDaoInstance.listDocs = vi.fn().mockResolvedValue([syncDoc]);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(5);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 0 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(1);
			expect(response.body.changes[0].fileId).toBe("test-file-id");
			expect(response.body.changes[0].serverPath).toBe("notes/test.md");
			expect(response.body.changes[0].version).toBe(1);
			expect(response.body.changes[0].content).toBe("# Test Content");
			expect(response.body.changes[0].contentHash).toBe(integrityHashFromContent("# Test Content"));
			expect(response.body.newCursor).toBe(5);

			expect(mockDocDaoInstance.listDocs).toHaveBeenCalledWith({
				startsWithJrn: "jrn:/global:docs:article/sync-",
			});
		});

		it("should filter out deleted articles on initial pull", async () => {
			const activeDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-active-id",
				content: "# Active",
				version: 1,
				contentMetadata: {
					sync: {
						fileId: "active-id",
						serverPath: "notes/active.md",
					},
				},
			});

			const deletedDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-deleted-id",
				content: "# Deleted",
				version: 2,
				contentMetadata: {
					sync: {
						fileId: "deleted-id",
						serverPath: "notes/deleted.md",
						deleted: true,
						deletedAt: Date.now(),
					},
				},
			});

			mockDocDaoInstance.listDocs = vi.fn().mockResolvedValue([activeDoc, deletedDoc]);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(5);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 0 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(1);
			expect(response.body.changes[0].fileId).toBe("active-id");
		});

		it("should return incremental changes since cursor", async () => {
			const syncArticle = { docJrn: "jrn:/global:docs:article/sync-test-file-id", lastSeq: 3 };
			const doc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Updated Content",
				version: 2,
				contentMetadata: {
					sync: {
						fileId: "test-file-id",
						serverPath: "notes/test.md",
					},
				},
			});

			mockSyncArticleDaoInstance.getSyncArticlesSince = vi.fn().mockResolvedValue([syncArticle]);
			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(doc);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(3);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 2 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(1);
			expect(response.body.changes[0].fileId).toBe("test-file-id");
			expect(response.body.changes[0].version).toBe(2);
			expect(response.body.newCursor).toBe(3);

			expect(mockSyncArticleDaoInstance.getSyncArticlesSince).toHaveBeenCalledWith(2);
		});

		it("should return deleted article info in incremental pull", async () => {
			const syncArticle = { docJrn: "jrn:/global:docs:article/sync-deleted-id", lastSeq: 4 };
			const deletedDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-deleted-id",
				content: "# Was here",
				version: 3,
				contentMetadata: {
					sync: {
						fileId: "deleted-id",
						serverPath: "notes/deleted.md",
						deleted: true,
						deletedAt: Date.now(),
					},
				},
			});

			mockSyncArticleDaoInstance.getSyncArticlesSince = vi.fn().mockResolvedValue([syncArticle]);
			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(deletedDoc);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(4);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 3 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(1);
			expect(response.body.changes[0].fileId).toBe("deleted-id");
			expect(response.body.changes[0].deleted).toBe(true);
			expect(response.body.changes[0].content).toBeUndefined();
			expect(response.body.changes[0].contentHash).toBeUndefined();
		});

		it("should use default cursor of 0 when not provided", async () => {
			mockDocDaoInstance.listDocs = vi.fn().mockResolvedValue([]);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(0);

			const response = await request(app).post("/v1/sync/pull").send({});

			expect(response.status).toBe(200);
			expect(response.body.changes).toEqual([]);
			expect(response.body.newCursor).toBe(0);
			expect(mockDocDaoInstance.listDocs).toHaveBeenCalled();
		});
	});

	describe("GET /v1/sync/status", () => {
		it("should return sync status with cursor and file count", async () => {
			const syncArticles = [
				{ docJrn: "jrn:/global:docs:article/sync-file1", lastSeq: 1 },
				{ docJrn: "jrn:/global:docs:article/sync-file2", lastSeq: 2 },
			];

			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(5);
			mockSyncArticleDaoInstance.getSyncArticlesSince = vi.fn().mockResolvedValue(syncArticles);

			const response = await request(app).get("/v1/sync/status");

			expect(response.status).toBe(200);
			expect(response.body.cursor).toBe(5);
			expect(response.body.fileCount).toBe(2);
			expect(response.body.files).toEqual(syncArticles);
		});
	});

	describe("bi-directional sync", () => {
		it("should handle multiple operations in single push", async () => {
			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(undefined);
			mockDocDaoInstance.createDoc = vi.fn().mockImplementation(doc =>
				Promise.resolve(
					mockDoc({
						...doc,
						version: 1,
					}),
				),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(1);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(2);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "file1",
							serverPath: "notes/file1.md",
							baseVersion: 0,
							content: "# File 1",
						},
						{
							type: "upsert",
							fileId: "file2",
							serverPath: "notes/file2.md",
							baseVersion: 0,
							content: "# File 2",
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results).toHaveLength(2);
			expect(response.body.results[0].status).toBe("ok");
			expect(response.body.results[1].status).toBe("ok");
			expect(mockDocDaoInstance.createDoc).toHaveBeenCalledTimes(2);
		});
	});

	describe("error handling", () => {
		it("should return 500 on pull endpoint error", async () => {
			mockDocDaoInstance.listDocs = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 0 });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to pull changes");
		});

		it("should return 500 on push endpoint error", async () => {
			mockDocDaoInstance.readDoc = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [{ type: "upsert", fileId: "test", serverPath: "test.md", baseVersion: 0, content: "# Test" }],
				});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to push changes");
		});

		it("should return 500 on status endpoint error", async () => {
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/v1/sync/status");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get status");
		});
	});

	describe("edge cases", () => {
		it("should return conflict when updateDocIfVersion returns conflict", async () => {
			const existingDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Original",
				version: 1,
			});

			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDocDaoInstance.updateDocIfVersion = vi.fn().mockResolvedValue("conflict");
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(1);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 1,
							content: "# Updated",
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("conflict");
			expect(response.body.results[0].serverVersion).toBe(1);
		});

		it("should filter out null entries when doc not found in incremental pull", async () => {
			const syncArticles = [
				{ docJrn: "jrn:/global:docs:article/sync-exists", lastSeq: 1 },
				{ docJrn: "jrn:/global:docs:article/sync-missing", lastSeq: 2 },
			];
			const existingDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-exists",
				content: "# Exists",
				version: 1,
				contentMetadata: {
					sync: { fileId: "exists", serverPath: "exists.md" },
				},
			});

			mockSyncArticleDaoInstance.getSyncArticlesSince = vi.fn().mockResolvedValue(syncArticles);
			mockDocDaoInstance.readDoc = vi.fn().mockImplementation(jrn => {
				if (jrn === "jrn:/global:docs:article/sync-exists") {
					return Promise.resolve(existingDoc);
				}
				return Promise.resolve(undefined);
			});
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(2);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 1 });

			expect(response.status).toBe(200);
			// Only one change returned (the other was filtered out)
			expect(response.body.changes).toHaveLength(1);
			expect(response.body.changes[0].fileId).toBe("exists");
		});

		it("should include contentHash when provided on push", async () => {
			const content = "# Test with hash";
			const hash = integrityHashFromContent(content);

			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(undefined);
			mockDocDaoInstance.createDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "jrn:/global:docs:article/sync-test-file-id",
					content,
					version: 1,
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(1);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(1);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 0,
							content,
							contentHash: hash,
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("ok");
			expect(mockDocDaoInstance.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					contentMetadata: expect.objectContaining({
						sync: expect.objectContaining({
							contentHash: hash,
						}),
					}),
				}),
			);
		});

		it("should use existing content when op.content is undefined on update", async () => {
			const existingDoc = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Original Content",
				version: 1,
				contentMetadata: {
					sync: { fileId: "test-file-id", serverPath: "notes/test.md" },
				},
			});

			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDocDaoInstance.updateDocIfVersion = vi.fn().mockResolvedValue(
				mockDoc({
					...existingDoc,
					version: 2,
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(2);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(2);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 1,
							// content is undefined
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("ok");
			expect(mockDocDaoInstance.updateDocIfVersion).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "# Original Content", // Uses existing content
				}),
				1,
			);
		});

		it("should create doc with empty content when content is undefined", async () => {
			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(undefined);
			mockDocDaoInstance.createDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "jrn:/global:docs:article/sync-test-file-id",
					content: "",
					version: 1,
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(1);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(1);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 0,
							// content is undefined - should default to empty string
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("ok");
			expect(mockDocDaoInstance.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "", // Empty string when content is undefined
				}),
			);
		});

		it("should not include contentHash in syncInfo when not provided", async () => {
			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(undefined);
			mockDocDaoInstance.createDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "jrn:/global:docs:article/sync-test-file-id",
					content: "# Test",
					version: 1,
				}),
			);
			mockSyncArticleDaoInstance.advanceCursor = vi.fn().mockResolvedValue(1);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(1);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					ops: [
						{
							type: "upsert",
							fileId: "test-file-id",
							serverPath: "notes/test.md",
							baseVersion: 0,
							content: "# Test",
							// contentHash is not provided
						},
					],
				});

			expect(response.status).toBe(200);
			expect(response.body.results[0].status).toBe("ok");
			// Verify contentHash is not in syncInfo
			const createDocCall = vi.mocked(mockDocDaoInstance.createDoc).mock.calls[0][0];
			expect(createDocCall.contentMetadata?.sync).not.toHaveProperty("contentHash");
		});

		it("should handle doc without contentMetadata.sync gracefully in incremental pull", async () => {
			const syncArticle = { docJrn: "jrn:/global:docs:article/sync-test-file-id", lastSeq: 3 };
			const docWithoutSync = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Content",
				version: 2,
				contentMetadata: {}, // No sync property
			});

			mockSyncArticleDaoInstance.getSyncArticlesSince = vi.fn().mockResolvedValue([syncArticle]);
			mockDocDaoInstance.readDoc = vi.fn().mockResolvedValue(docWithoutSync);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(3);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 2 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(1);
			expect(response.body.changes[0].fileId).toBeUndefined();
			expect(response.body.changes[0].serverPath).toBeUndefined();
			expect(response.body.changes[0].deleted).toBe(false);
		});

		it("should handle doc without contentMetadata gracefully in initial pull", async () => {
			const docWithoutMetadata = mockDoc({
				jrn: "jrn:/global:docs:article/sync-test-file-id",
				content: "# Content",
				version: 1,
				contentMetadata: undefined,
			});

			mockDocDaoInstance.listDocs = vi.fn().mockResolvedValue([docWithoutMetadata]);
			mockSyncArticleDaoInstance.getCurrentCursor = vi.fn().mockResolvedValue(1);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 0 });

			expect(response.status).toBe(200);
			// Doc without sync metadata should be included (not filtered as deleted)
			expect(response.body.changes).toHaveLength(1);
		});
	});
});
