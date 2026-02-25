import type { Doc, NewDoc } from "../model/Doc";
import { mockDoc } from "../model/Doc.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createDocDao, createDocDaoProvider, type DocDao } from "./DocDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocDao", () => {
	let mockDocs: ModelDef<Doc>;
	let docDao: DocDao;

	beforeEach(() => {
		mockDocs = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			findByPk: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
			count: vi.fn(),
		} as unknown as ModelDef<Doc>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockDocs),
		} as unknown as Sequelize;

		docDao = createDocDao(mockSequelize);
	});

	describe("createDoc", () => {
		it("should create a doc with version 1", async () => {
			const newDoc: NewDoc = {
				jrn: "jrn:doc:123",
				slug: "test-slug",
				path: "",
				updatedBy: "user:456",
				source: undefined,
				sourceMetadata: undefined,
				content: "test content",
				contentType: "text/plain",
				contentMetadata: undefined,
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				sortOrder: 0,
				createdBy: "user:456",
			};

			const createdDoc = mockDoc({
				...newDoc,
				id: 1,
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			const result = await docDao.createDoc(newDoc);

			expect(mockDocs.create).toHaveBeenCalledWith({
				...newDoc,
				path: "/test-slug", // Auto-calculated when empty
				version: 1,
			});
			expect(result).toEqual(createdDoc);
		});

		it("should create doc with all optional fields", async () => {
			const newDoc: NewDoc = {
				jrn: "jrn:doc:456",
				slug: "test-slug",
				path: "",
				updatedBy: "user:789",
				source: { url: "https://example.com" } as never,
				sourceMetadata: { timestamp: "2024-01-01" } as never,
				content: "rich content",
				contentType: "text/html",
				contentMetadata: { wordCount: 100 } as never,
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				sortOrder: 0,
				createdBy: "user:789",
			};

			const createdDoc = mockDoc({
				...newDoc,
				id: 2,
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			const result = await docDao.createDoc(newDoc);

			expect(result).toEqual(createdDoc);
		});

		it("should auto-generate slug, jrn, and path when not provided", async () => {
			const newDoc: NewDoc = {
				updatedBy: "user:789",
				source: undefined,
				sourceMetadata: undefined,
				content: "test content",
				contentType: "text/markdown",
				contentMetadata: { title: "Test Article" },
				spaceId: 1,
				parentId: undefined,
				docType: "document",
				sortOrder: 0,
				createdBy: "user:789",
			};

			const createdDoc = mockDoc({
				id: 3,
				jrn: "doc:test-article-12345",
				slug: "test-article-12345",
				path: "",
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			await docDao.createDoc(newDoc);

			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					slug: expect.stringMatching(/^test-article-[a-z0-9]+$/),
					jrn: expect.stringMatching(/^jrn:\/global:docs:document\/test-article-[a-z0-9]+$/),
					path: expect.stringMatching(/^\/test-article-[a-z0-9]+$/),
					version: 1,
				}),
			);
		});

		it("should auto-generate folder jrn prefix for folder docType", async () => {
			const newDoc: NewDoc = {
				updatedBy: "user:789",
				source: undefined,
				sourceMetadata: undefined,
				content: "",
				contentType: "folder",
				contentMetadata: { title: "My Folder" },
				spaceId: 1,
				parentId: undefined,
				docType: "folder",
				sortOrder: 0,
				createdBy: "user:789",
			};

			const createdDoc = mockDoc({
				id: 4,
				jrn: "folder:my-folder-12345",
				slug: "my-folder-12345",
				path: "",
				docType: "folder",
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			await docDao.createDoc(newDoc);

			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					slug: expect.stringMatching(/^my-folder-[a-z0-9]+$/),
					jrn: expect.stringMatching(/^jrn:\/global:docs:folder\/my-folder-[a-z0-9]+$/),
					path: expect.stringMatching(/^\/my-folder-[a-z0-9]+$/),
					version: 1,
				}),
			);
		});

		it("should use untitled when no title in contentMetadata", async () => {
			const newDoc: NewDoc = {
				updatedBy: "user:789",
				source: undefined,
				sourceMetadata: undefined,
				content: "test content",
				contentType: "text/markdown",
				contentMetadata: undefined,
				spaceId: 1,
				parentId: undefined,
				docType: "document",
				sortOrder: 0,
				createdBy: "user:789",
			};

			const createdDoc = mockDoc({
				id: 5,
				jrn: "doc:untitled-12345",
				slug: "untitled-12345",
				path: "",
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			await docDao.createDoc(newDoc);

			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					slug: expect.stringMatching(/^untitled-[a-z0-9]+$/),
					jrn: expect.stringMatching(/^jrn:\/global:docs:document\/untitled-[a-z0-9]+$/),
				}),
			);
		});
	});

	describe("readDoc", () => {
		it("should return doc when found", async () => {
			const doc = mockDoc({
				id: 1,
				jrn: "jrn:doc:123",
				slug: "test-slug",
				content: "test content",
				contentType: "text/plain",
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(doc),
			};

			vi.mocked(mockDocs.findOne).mockResolvedValue(mockDocInstance as never);

			const result = await docDao.readDoc("jrn:doc:123");

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:123" },
			});
			expect(mockDocInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(doc);
		});

		it("should return undefined when doc not found", async () => {
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			const result = await docDao.readDoc("jrn:nonexistent");

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:nonexistent" },
			});
			expect(result).toBeUndefined();
		});
	});

	describe("readDoc by JRN", () => {
		it("should return doc when found by JRN", async () => {
			const doc = mockDoc({
				id: 1,
				jrn: "jrn:doc:123",
				slug: "test-slug",
				content: "test content",
				contentType: "text/plain",
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(doc),
			};

			vi.mocked(mockDocs.findOne).mockResolvedValue(mockDocInstance as never);

			const result = await docDao.readDoc("jrn:doc:123");

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:123" },
			});
			expect(mockDocInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(doc);
		});

		it("should return undefined when doc not found by JRN", async () => {
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			const result = await docDao.readDoc("jrn:nonexistent");

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:nonexistent" },
			});
			expect(result).toBeUndefined();
		});
	});

	describe("listDocs", () => {
		it("should return all docs ordered by updatedAt DESC", async () => {
			const doc1 = mockDoc({ id: 1, jrn: "jrn:doc:1", content: "content1" });
			const doc2 = mockDoc({ id: 2, jrn: "jrn:doc:2", content: "content2" });

			const mockDocInstances = [{ get: vi.fn().mockReturnValue(doc1) }, { get: vi.fn().mockReturnValue(doc2) }];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.listDocs();

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ deletedAt: expect.anything() }),
					order: [["updatedAt", "DESC"]],
				}),
			);
			expect(result).toEqual([doc1, doc2]);
		});

		it("should return empty array when no docs exist", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValue([]);

			const result = await docDao.listDocs();

			expect(result).toEqual([]);
		});

		it("should filter out docs with JRNs starting with /root", async () => {
			const doc1 = mockDoc({ id: 1, jrn: "jrn:doc:1", content: "content1" });
			const doc2 = mockDoc({ id: 2, jrn: "/root/internal/doc", content: "internal content" });
			const doc3 = mockDoc({ id: 3, jrn: "jrn:doc:2", content: "content2" });

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(doc1) },
				{ get: vi.fn().mockReturnValue(doc2) },
				{ get: vi.fn().mockReturnValue(doc3) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.listDocs();

			expect(result).toEqual([doc1, doc3]);
		});

		it("should filter docs by JRN prefix when startsWithJrn is provided", async () => {
			const doc1 = mockDoc({ id: 1, jrn: "jrn:doc:test:1", slug: "test-slug-1", content: "content1" });
			const doc2 = mockDoc({ id: 2, jrn: "jrn:doc:test:2", slug: "test-slug-2", content: "content2" });
			const doc3 = mockDoc({ id: 3, jrn: "jrn:doc:other:3", slug: "other-slug-3", content: "content3" });

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(doc1) },
				{ get: vi.fn().mockReturnValue(doc2) },
				{ get: vi.fn().mockReturnValue(doc3) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.listDocs({ startsWithJrn: "jrn:doc:test" });

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ deletedAt: expect.anything() }),
					order: [["updatedAt", "DESC"]],
				}),
			);
			expect(result).toEqual([doc1, doc2]);
		});

		it("should filter out /root docs even when using startsWithJrn prefix", async () => {
			const doc1 = mockDoc({ id: 1, jrn: "jrn:doc:test:1", slug: "test-slug-1", content: "content1" });
			const doc2 = mockDoc({ id: 2, jrn: "/root/test/doc", slug: "/root/test/doc", content: "internal content" });
			const doc3 = mockDoc({ id: 3, jrn: "jrn:doc:test:2", slug: "test-slug-2", content: "content2" });

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(doc1) },
				{ get: vi.fn().mockReturnValue(doc2) },
				{ get: vi.fn().mockReturnValue(doc3) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.listDocs({ startsWithJrn: "jrn:doc:test" });

			expect(result).toEqual([doc1, doc3]);
		});

		it("should return empty array when no docs match the JRN prefix", async () => {
			const doc1 = mockDoc({ id: 1, jrn: "jrn:doc:other:1", slug: "other-slug-1", content: "content1" });
			const doc2 = mockDoc({ id: 2, jrn: "jrn:doc:other:2", slug: "other-slug-2", content: "content2" });

			const mockDocInstances = [{ get: vi.fn().mockReturnValue(doc1) }, { get: vi.fn().mockReturnValue(doc2) }];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.listDocs({ startsWithJrn: "jrn:doc:test" });

			expect(result).toEqual([]);
		});

		it("should include /root docs when includeRoot is true", async () => {
			const doc1 = mockDoc({ id: 1, jrn: "jrn:doc:1", slug: "doc-1", content: "content1" });
			const doc2 = mockDoc({
				id: 2,
				jrn: "/root/internal/doc",
				slug: "/root/internal/doc",
				content: "internal content",
			});
			const doc3 = mockDoc({
				id: 3,
				jrn: "/root/another/doc",
				slug: "/root/another/doc",
				content: "another internal",
			});

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(doc1) },
				{ get: vi.fn().mockReturnValue(doc2) },
				{ get: vi.fn().mockReturnValue(doc3) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.listDocs({ includeRoot: true });

			expect(result).toEqual([doc1, doc2, doc3]);
		});

		it("should filter /root docs by startsWithJrn when includeRoot is true", async () => {
			const doc1 = mockDoc({ id: 1, jrn: "/root/scripts/doc1", slug: "/root/scripts/doc1", content: "script1" });
			const doc2 = mockDoc({ id: 2, jrn: "/root/scripts/doc2", slug: "/root/scripts/doc2", content: "script2" });
			const doc3 = mockDoc({ id: 3, jrn: "/root/other/doc", slug: "/root/other/doc", content: "other" });

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(doc1) },
				{ get: vi.fn().mockReturnValue(doc2) },
				{ get: vi.fn().mockReturnValue(doc3) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.listDocs({ startsWithJrn: "/root/scripts", includeRoot: true });

			expect(result).toEqual([doc1, doc2]);
		});
	});

	describe("updateDoc", () => {
		it("should update doc when new version is greater than old version", async () => {
			const updateDoc = mockDoc({
				id: 1,
				jrn: "jrn:doc:123",
				slug: "test-slug",
				updatedBy: "user:456",
				content: "updated content",
				version: 3,
			});

			const oldDocInstance = {
				version: 2,
			};

			const updatedDocInstance = {
				get: vi.fn().mockReturnValue(updateDoc),
			};

			vi.mocked(mockDocs.findOne)
				.mockResolvedValueOnce(oldDocInstance as never)
				.mockResolvedValueOnce(updatedDocInstance as never);
			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.updateDoc(updateDoc);

			expect(mockDocs.findOne).toHaveBeenNthCalledWith(1, {
				where: { jrn: "jrn:doc:123" },
				transaction: null,
			});
			expect(mockDocs.update).toHaveBeenCalledWith(updateDoc, {
				where: { jrn: "jrn:doc:123" },
				transaction: null,
			});
			expect(mockDocs.findOne).toHaveBeenNthCalledWith(2, {
				where: { jrn: "jrn:doc:123" },
				transaction: null,
			});
			expect(result).toEqual(updateDoc);
		});

		it("should not update doc when new version is equal to old version", async () => {
			const updateDoc = mockDoc({
				jrn: "jrn:doc:123",
				slug: "test-slug",
				version: 2,
			});

			const oldDocInstance = {
				version: 2,
				get: vi.fn().mockReturnValue({ version: 2 }),
			};

			vi.mocked(mockDocs.findOne).mockResolvedValue(oldDocInstance as never);

			const result = await docDao.updateDoc(updateDoc);

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:123" },
				transaction: null,
			});
			expect(mockDocs.update).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});

		it("should not update doc when new version is less than old version", async () => {
			const updateDoc = mockDoc({
				jrn: "jrn:doc:123",
				slug: "test-slug",
				version: 2,
			});

			const oldDocInstance = {
				version: 3,
				get: vi.fn().mockReturnValue({ version: 3 }),
			};

			vi.mocked(mockDocs.findOne).mockResolvedValue(oldDocInstance as never);

			const result = await docDao.updateDoc(updateDoc);

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:123" },
				transaction: null,
			});
			expect(mockDocs.update).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});

		it("should return undefined when doc does not exist", async () => {
			const updateDoc = mockDoc({
				jrn: "jrn:doc:nonexistent",
				slug: "nonexistent-slug",
			});

			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			const result = await docDao.updateDoc(updateDoc);

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:nonexistent" },
				transaction: null,
			});
			expect(mockDocs.update).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});

		it("should return undefined when doc cannot be found after update", async () => {
			const updateDoc = mockDoc({
				id: 1,
				jrn: "jrn:doc:123",
				version: 3,
			});

			const oldDocInstance = {
				version: 2,
			};

			vi.mocked(mockDocs.findOne)
				.mockResolvedValueOnce(oldDocInstance as never)
				.mockResolvedValueOnce(null);
			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.updateDoc(updateDoc);

			expect(mockDocs.update).toHaveBeenCalledWith(updateDoc, {
				where: { jrn: "jrn:doc:123" },
				transaction: null,
			});
			expect(result).toBeUndefined();
		});
	});

	describe("updateDocIfVersion", () => {
		let mockTransaction: {
			commit: ReturnType<typeof vi.fn>;
			rollback: ReturnType<typeof vi.fn>;
			LOCK: { UPDATE: string };
		};
		let mockSequelize: Sequelize;

		beforeEach(() => {
			mockTransaction = {
				commit: vi.fn().mockResolvedValue(undefined),
				rollback: vi.fn().mockResolvedValue(undefined),
				LOCK: { UPDATE: "UPDATE" },
			};

			mockSequelize = {
				define: vi.fn().mockReturnValue(mockDocs),
				transaction: vi.fn().mockResolvedValue(mockTransaction),
			} as unknown as Sequelize;

			docDao = createDocDao(mockSequelize);
		});

		it("should update doc when version matches expected version", async () => {
			const updateDoc = mockDoc({
				id: 1,
				jrn: "jrn:doc:123",
				updatedBy: "user:456",
				content: "updated content",
				version: 3,
			});

			const oldDocInstance = {
				version: 2,
			};

			const updatedDocInstance = {
				get: vi.fn().mockReturnValue(updateDoc),
			};

			vi.mocked(mockDocs.findOne)
				.mockResolvedValueOnce(oldDocInstance as never)
				.mockResolvedValueOnce(updatedDocInstance as never);
			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.updateDocIfVersion(updateDoc, 2);

			expect(mockSequelize.transaction).toHaveBeenCalled();
			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:123" },
				transaction: mockTransaction,
				lock: "UPDATE",
			});
			expect(mockDocs.update).toHaveBeenCalledWith(updateDoc, {
				where: { jrn: "jrn:doc:123" },
				transaction: mockTransaction,
			});
			expect(mockTransaction.commit).toHaveBeenCalled();
			expect(mockTransaction.rollback).not.toHaveBeenCalled();
			expect(result).toEqual(updateDoc);
		});

		it("should return conflict when doc does not exist", async () => {
			const updateDoc = mockDoc({
				jrn: "jrn:doc:nonexistent",
				version: 2,
			});

			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			const result = await docDao.updateDocIfVersion(updateDoc, 1);

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:nonexistent" },
				transaction: mockTransaction,
				lock: "UPDATE",
			});
			expect(mockDocs.update).not.toHaveBeenCalled();
			expect(mockTransaction.rollback).toHaveBeenCalled();
			expect(mockTransaction.commit).not.toHaveBeenCalled();
			expect(result).toBe("conflict");
		});

		it("should return conflict when version does not match expected version", async () => {
			const updateDoc = mockDoc({
				jrn: "jrn:doc:123",
				version: 4,
			});

			const oldDocInstance = {
				version: 3,
			};

			vi.mocked(mockDocs.findOne).mockResolvedValue(oldDocInstance as never);

			const result = await docDao.updateDocIfVersion(updateDoc, 2);

			expect(mockDocs.findOne).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:123" },
				transaction: mockTransaction,
				lock: "UPDATE",
			});
			expect(mockDocs.update).not.toHaveBeenCalled();
			expect(mockTransaction.rollback).toHaveBeenCalled();
			expect(mockTransaction.commit).not.toHaveBeenCalled();
			expect(result).toBe("conflict");
		});

		it("should rollback and throw error when update fails", async () => {
			const updateDoc = mockDoc({
				jrn: "jrn:doc:123",
				version: 3,
			});

			const oldDocInstance = {
				version: 2,
			};

			const testError = new Error("Database error");

			vi.mocked(mockDocs.findOne).mockResolvedValue(oldDocInstance as never);
			vi.mocked(mockDocs.update).mockRejectedValue(testError);

			await expect(docDao.updateDocIfVersion(updateDoc, 2)).rejects.toThrow("Database error");

			expect(mockTransaction.rollback).toHaveBeenCalled();
			expect(mockTransaction.commit).not.toHaveBeenCalled();
		});

		it("should return conflict when updated doc cannot be read after commit", async () => {
			const updateDoc = mockDoc({
				jrn: "jrn:doc:123",
				version: 3,
			});

			const oldDocInstance = {
				version: 2,
			};

			vi.mocked(mockDocs.findOne)
				.mockResolvedValueOnce(oldDocInstance as never)
				.mockResolvedValueOnce(null);
			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.updateDocIfVersion(updateDoc, 2);

			expect(mockTransaction.commit).toHaveBeenCalled();
			expect(result).toBe("conflict");
		});
	});

	describe("deleteDoc", () => {
		it("should delete doc by jrn", async () => {
			vi.mocked(mockDocs.destroy).mockResolvedValue(1 as never);

			await docDao.deleteDoc("jrn:doc:123");

			expect(mockDocs.destroy).toHaveBeenCalledWith({
				where: { jrn: "jrn:doc:123" },
			});
		});

		it("should not throw when deleting non-existent doc", async () => {
			vi.mocked(mockDocs.destroy).mockResolvedValue(0 as never);

			await expect(docDao.deleteDoc("jrn:nonexistent")).resolves.not.toThrow();

			expect(mockDocs.destroy).toHaveBeenCalledWith({
				where: { jrn: "jrn:nonexistent" },
			});
		});
	});

	describe("deleteAllDocs", () => {
		it("should delete all docs", async () => {
			vi.mocked(mockDocs.destroy).mockResolvedValue(5 as never);

			await docDao.deleteAllDocs();

			expect(mockDocs.destroy).toHaveBeenCalledWith({
				where: {},
			});
		});

		it("should not throw when no docs exist", async () => {
			vi.mocked(mockDocs.destroy).mockResolvedValue(0 as never);

			await expect(docDao.deleteAllDocs()).resolves.not.toThrow();

			expect(mockDocs.destroy).toHaveBeenCalledWith({
				where: {},
			});
		});
	});

	describe("readDocById", () => {
		it("should return doc when found by ID", async () => {
			const doc = mockDoc({
				id: 1,
				jrn: "jrn:doc:123",
				content: "test content",
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(doc),
			};

			vi.mocked(mockDocs.findByPk).mockResolvedValue(mockDocInstance as never);

			const result = await docDao.readDocById(1);

			expect(mockDocs.findByPk).toHaveBeenCalledWith(1);
			expect(mockDocInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(doc);
		});

		it("should return undefined when doc not found by ID", async () => {
			vi.mocked(mockDocs.findByPk).mockResolvedValue(null);

			const result = await docDao.readDocById(999);

			expect(mockDocs.findByPk).toHaveBeenCalledWith(999);
			expect(result).toBeUndefined();
		});
	});

	describe("searchDocsByTitle", () => {
		it("should search docs by normalized title using new JRN format", async () => {
			// New JRN format: jrn:prod:global:docs:article/{normalized-title}
			const doc1 = mockDoc({
				id: 1,
				jrn: "jrn:prod:global:docs:article/my-test-article-123",
				content: "content1",
			});
			const doc2 = mockDoc({
				id: 2,
				jrn: "jrn:prod:global:docs:article/my-test-article-456",
				content: "content2",
			});

			const mockDocInstances = [{ get: vi.fn().mockReturnValue(doc1) }, { get: vi.fn().mockReturnValue(doc2) }];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.searchDocsByTitle("My Test Article");

			expect(mockDocs.findAll).toHaveBeenCalledWith({
				where: expect.objectContaining({
					jrn: expect.objectContaining({}),
				}),
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toEqual([doc1, doc2]);
		});

		it("should return empty array when no matches found", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValue([]);

			const result = await docDao.searchDocsByTitle("nonexistent");

			expect(result).toEqual([]);
		});

		it("should add personal space filter when userId is provided", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValue([]);

			await docDao.searchDocsByTitle("test", 42);

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						jrn: expect.objectContaining({}),
					}),
				}),
			);
			// Verify the where clause includes the personal space subquery filter
			const call = vi.mocked(mockDocs.findAll).mock.calls[0][0] as Record<string, unknown>;
			const where = call.where as Record<symbol, unknown>;
			// Op.and should be set with a literal SQL condition
			expect(where[Symbol.for("and")]).toBeDefined();
		});

		it("should not add personal space filter when userId is omitted", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValue([]);

			await docDao.searchDocsByTitle("test");

			const call = vi.mocked(mockDocs.findAll).mock.calls[0][0] as Record<string, unknown>;
			const where = call.where as Record<symbol, unknown>;
			expect(where[Symbol.for("and")]).toBeUndefined();
		});
	});

	describe("searchArticlesForLink", () => {
		it("should search articles by title with iLike and return results with parent folder name", async () => {
			const doc1 = mockDoc({
				id: 1,
				jrn: "jrn:prod:global:docs:article/test",
				slug: "test",
				path: "/test",
				parentId: 10,
				contentMetadata: { title: "Test Article" } as never,
				updatedAt: new Date("2024-01-01"),
			});

			const parentDoc = mockDoc({
				id: 10,
				slug: "parent-folder",
				contentMetadata: { title: "My Folder" } as never,
			});

			vi.mocked(mockDocs.findAll)
				.mockResolvedValueOnce([{ get: vi.fn().mockReturnValue(doc1) }] as never)
				.mockResolvedValueOnce([{ get: vi.fn().mockReturnValue(parentDoc) }] as never);

			const result = await docDao.searchArticlesForLink("Test");

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						docType: "document",
						"contentMetadata.title": expect.objectContaining({}),
					}),
					order: [["updatedAt", "DESC"]],
					limit: 10,
				}),
			);
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
			expect(result[0].parentFolderName).toBe("My Folder");
		});

		it("should return articles without title filter when title is empty", async () => {
			const doc1 = mockDoc({
				id: 1,
				jrn: "jrn:prod:global:docs:article/recent",
				slug: "recent",
				path: "/recent",
				updatedAt: new Date("2024-01-01"),
			});

			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([{ get: vi.fn().mockReturnValue(doc1) }] as never);

			const result = await docDao.searchArticlesForLink("");

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.not.objectContaining({
						"contentMetadata.title": expect.anything(),
					}),
				}),
			);
			expect(result).toHaveLength(1);
			expect(result[0].parentFolderName).toBeNull();
		});

		it("should filter by spaceId when provided", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			await docDao.searchArticlesForLink("test", 5);

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 5,
					}),
				}),
			);
		});

		it("should escape wildcard characters in title", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			await docDao.searchArticlesForLink("100% done_now");

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						"contentMetadata.title": expect.objectContaining({}),
					}),
				}),
			);
		});

		it("should use parent slug as fallback when parent has no contentMetadata title", async () => {
			const doc1 = mockDoc({
				id: 1,
				jrn: "jrn:prod:global:docs:article/child",
				slug: "child",
				path: "/child",
				parentId: 20,
				updatedAt: new Date("2024-01-01"),
			});

			const parentDoc = mockDoc({
				id: 20,
				slug: "parent-slug",
				contentMetadata: undefined,
			});

			vi.mocked(mockDocs.findAll)
				.mockResolvedValueOnce([{ get: vi.fn().mockReturnValue(doc1) }] as never)
				.mockResolvedValueOnce([{ get: vi.fn().mockReturnValue(parentDoc) }] as never);

			const result = await docDao.searchArticlesForLink("child");

			expect(result[0].parentFolderName).toBe("parent-slug");
		});

		it("should return null parentFolderName when parent is not found in map", async () => {
			const doc1 = mockDoc({
				id: 1,
				jrn: "jrn:prod:global:docs:article/orphan",
				slug: "orphan",
				path: "/orphan",
				parentId: 999,
				updatedAt: new Date("2024-01-01"),
			});

			vi.mocked(mockDocs.findAll)
				.mockResolvedValueOnce([{ get: vi.fn().mockReturnValue(doc1) }] as never)
				.mockResolvedValueOnce([] as never);

			const result = await docDao.searchArticlesForLink("orphan");

			expect(result[0].parentFolderName).toBeNull();
		});

		it("should return empty array when no articles match", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			const result = await docDao.searchArticlesForLink("nonexistent");

			expect(result).toEqual([]);
		});

		it("should not fetch parents when no docs have parentId", async () => {
			const doc1 = mockDoc({
				id: 1,
				jrn: "jrn:prod:global:docs:article/root-doc",
				slug: "root-doc",
				path: "/root-doc",
				parentId: undefined,
				updatedAt: new Date("2024-01-01"),
			});

			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([{ get: vi.fn().mockReturnValue(doc1) }] as never);

			const result = await docDao.searchArticlesForLink("root");

			// findAll should only be called once (for docs, not for parents)
			expect(mockDocs.findAll).toHaveBeenCalledTimes(1);
			expect(result[0].parentFolderName).toBeNull();
		});

		it("should add personal space filter when userId is provided", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			await docDao.searchArticlesForLink("test", undefined, 42);

			const call = vi.mocked(mockDocs.findAll).mock.calls[0][0] as Record<string, unknown>;
			const where = call.where as Record<symbol, unknown>;
			// Op.and should be set with a literal SQL condition
			expect(where[Symbol.for("and")]).toBeDefined();
		});

		it("should add personal space filter with spaceId when userId is provided", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			await docDao.searchArticlesForLink("test", 5, 42);

			const call = vi.mocked(mockDocs.findAll).mock.calls[0][0] as Record<string, unknown>;
			const where = call.where as Record<symbol, unknown>;
			expect(where[Symbol.for("and")]).toBeDefined();
		});

		it("should not add personal space filter when userId is omitted", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			await docDao.searchArticlesForLink("test");

			const call = vi.mocked(mockDocs.findAll).mock.calls[0][0] as Record<string, unknown>;
			const where = call.where as Record<symbol, unknown>;
			expect(where[Symbol.for("and")]).toBeUndefined();
		});
	});

	describe("softDelete", () => {
		it("should set explicitlyDeleted=true for target and explicitlyDeleted=false for descendants", async () => {
			// Mock finding no children for the target document
			vi.mocked(mockDocs.findAll).mockResolvedValue([]);

			await docDao.softDelete(1);

			// First call: update target with explicitlyDeleted=true
			expect(mockDocs.update).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					deletedAt: expect.any(Date),
					explicitlyDeleted: true,
				}),
				{ where: { id: 1 } },
			);
		});

		it("should soft delete target and descendants with correct explicitlyDeleted flags", async () => {
			// Mock children for the target
			const child1 = { get: vi.fn().mockReturnValue(2) };
			const child2 = { get: vi.fn().mockReturnValue(3) };

			// First call returns children of target, subsequent calls return empty
			vi.mocked(mockDocs.findAll)
				.mockResolvedValueOnce([child1, child2] as never)
				.mockResolvedValueOnce([]) // children of child1
				.mockResolvedValueOnce([]); // children of child2

			await docDao.softDelete(1);

			// Target gets explicitlyDeleted=true
			expect(mockDocs.update).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					deletedAt: expect.any(Date),
					explicitlyDeleted: true,
				}),
				{ where: { id: 1 } },
			);

			// Descendants get explicitlyDeleted=false (only if not already explicitly deleted)
			expect(mockDocs.update).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					deletedAt: expect.any(Date),
					explicitlyDeleted: false,
				}),
				{
					where: expect.objectContaining({
						id: [2, 3],
					}),
				},
			);

			// Verify the where clause includes the condition to preserve already-deleted items
			const secondCallArgs = vi.mocked(mockDocs.update).mock.calls[1];
			const whereClause = secondCallArgs[1].where as Record<string, unknown>;
			expect(whereClause.explicitlyDeleted).toBe(false);
		});
	});

	describe("restore", () => {
		it("should reset explicitlyDeleted=false when restoring", async () => {
			const deletedDoc = mockDoc({
				id: 1,
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: undefined,
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(deletedDoc),
			};

			vi.mocked(mockDocs.findByPk).mockResolvedValue(mockDocInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([]); // no children

			await docDao.restore(1);

			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					parentId: null,
					path: "/",
				}),
				{ where: { id: 1 } },
			);
		});

		it("should not restore if document is not deleted", async () => {
			const activeDoc = mockDoc({
				id: 1,
				deletedAt: undefined,
				explicitlyDeleted: false,
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(activeDoc),
			};

			vi.mocked(mockDocs.findByPk).mockResolvedValue(mockDocInstance as never);

			await docDao.restore(1);

			expect(mockDocs.update).not.toHaveBeenCalled();
		});

		it("should move to root when parent is deleted", async () => {
			const deletedDoc = mockDoc({
				id: 2,
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: 1, // has a parent
			});

			const deletedParent = mockDoc({
				id: 1,
				deletedAt: new Date(), // parent is also deleted
				explicitlyDeleted: true,
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(deletedDoc),
			};

			const mockParentInstance = {
				get: vi.fn().mockReturnValue(deletedParent),
			};

			// First call returns the doc to restore, second call returns the deleted parent
			vi.mocked(mockDocs.findByPk)
				.mockResolvedValueOnce(mockDocInstance as never)
				.mockResolvedValueOnce(mockParentInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([]); // no children

			await docDao.restore(2);

			// Should restore the document and move to root in a single update
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					parentId: null,
					path: "/",
				}),
				{ where: { id: 2 } },
			);
		});

		it("should move to root when parent does not exist", async () => {
			const deletedDoc = mockDoc({
				id: 2,
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: 999, // parent that doesn't exist
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(deletedDoc),
			};

			// First call returns the doc to restore, second call returns null (parent not found)
			vi.mocked(mockDocs.findByPk)
				.mockResolvedValueOnce(mockDocInstance as never)
				.mockResolvedValueOnce(null as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([]); // no children

			await docDao.restore(2);

			// Should restore the document and move to root in a single update
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					parentId: null,
					path: "/",
				}),
				{ where: { id: 2 } },
			);
		});

		it("should recursively restore nested folders with their children", async () => {
			const deletedFolder = mockDoc({
				id: 1,
				slug: "parent-folder",
				path: "/parent-folder",
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: undefined,
				docType: "folder",
			});

			const childFolder = mockDoc({
				id: 2,
				slug: "child-folder",
				path: "/parent-folder/child-folder",
				deletedAt: new Date(),
				explicitlyDeleted: false, // cascade deleted
				parentId: 1,
				docType: "folder",
			});

			const grandchildDoc = mockDoc({
				id: 3,
				slug: "grandchild-doc",
				path: "/parent-folder/child-folder/grandchild-doc",
				deletedAt: new Date(),
				explicitlyDeleted: false, // cascade deleted
				parentId: 2,
				docType: "document",
			});

			const mockFolderInstance = {
				get: vi.fn().mockReturnValue(deletedFolder),
			};

			const mockChildFolderInstance = {
				get: vi.fn().mockReturnValue(childFolder),
			};

			const mockGrandchildInstance = {
				get: vi.fn().mockReturnValue(grandchildDoc),
			};

			// First findByPk returns the parent folder to restore
			vi.mocked(mockDocs.findByPk).mockResolvedValue(mockFolderInstance as never);

			// findAll returns cascade-deleted children at each level
			vi.mocked(mockDocs.findAll)
				.mockResolvedValueOnce([mockChildFolderInstance] as never) // children of parent-folder
				.mockResolvedValueOnce([mockGrandchildInstance] as never) // children of child-folder
				.mockResolvedValueOnce([] as never); // grandchild-doc has no children

			await docDao.restore(1);

			// Should restore the parent folder with updated path
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					path: "/parent-folder",
				}),
				{ where: { id: 1 } },
			);

			// Should restore child folder
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					path: "/parent-folder/child-folder",
				}),
				{ where: { id: 2 } },
			);

			// Should restore grandchild doc
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					path: "/parent-folder/child-folder/grandchild-doc",
				}),
				{ where: { id: 3 } },
			);
		});
	});

	describe("getTrashContent", () => {
		it("should only return docs with explicitlyDeleted=true", async () => {
			const trashedDoc = mockDoc({
				id: 1,
				spaceId: 1,
				deletedAt: new Date(),
				explicitlyDeleted: true,
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(trashedDoc),
			};

			vi.mocked(mockDocs.findAll).mockResolvedValue([mockDocInstance] as never);

			const result = await docDao.getTrashContent(1);

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						explicitlyDeleted: true,
					}),
				}),
			);
			expect(result).toEqual([trashedDoc]);
		});
	});

	describe("hasDeletedDocs", () => {
		it("should check for explicitlyDeleted=true docs", async () => {
			vi.mocked(mockDocs.count).mockResolvedValue(1 as never);

			const result = await docDao.hasDeletedDocs(1);

			expect(mockDocs.count).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						explicitlyDeleted: true,
					}),
				}),
			);
			expect(result).toBe(true);
		});

		it("should return false when no explicitly deleted docs exist", async () => {
			vi.mocked(mockDocs.count).mockResolvedValue(0 as never);

			const result = await docDao.hasDeletedDocs(1);

			expect(result).toBe(false);
		});
	});

	describe("getTreeContent", () => {
		it("should return ALL non-deleted docs when parentId is undefined", async () => {
			const rootDoc = mockDoc({ id: 1, spaceId: 1, parentId: undefined, sortOrder: 0 });
			const childDoc = mockDoc({ id: 2, spaceId: 1, parentId: 1, sortOrder: 0 });
			const grandchildDoc = mockDoc({ id: 3, spaceId: 1, parentId: 2, sortOrder: 0 });

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(rootDoc) },
				{ get: vi.fn().mockReturnValue(childDoc) },
				{ get: vi.fn().mockReturnValue(grandchildDoc) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.getTreeContent(1);

			// When parentId is undefined, should NOT filter by parentId - returns ALL docs
			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
					}),
					order: [["sortOrder", "ASC"]],
				}),
			);
			// Verify parentId is NOT in the where clause
			const callArgs = vi.mocked(mockDocs.findAll).mock.calls[0][0] as { where: Record<string, unknown> };
			expect(callArgs.where).not.toHaveProperty("parentId");
			expect(result).toEqual([rootDoc, childDoc, grandchildDoc]);
		});

		it("should return only root-level docs when parentId is null", async () => {
			const rootDoc1 = mockDoc({ id: 1, spaceId: 1, parentId: undefined, sortOrder: 0 });
			const rootDoc2 = mockDoc({ id: 2, spaceId: 1, parentId: undefined, sortOrder: 1 });

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(rootDoc1) },
				{ get: vi.fn().mockReturnValue(rootDoc2) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.getTreeContent(1, null);

			// When parentId is null, should filter for root-level docs (parentId IS NULL)
			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						parentId: expect.objectContaining({}), // Op.is null
					}),
					order: [["sortOrder", "ASC"]],
				}),
			);
			expect(result).toEqual([rootDoc1, rootDoc2]);
		});

		it("should return children of specific parent when parentId is a number", async () => {
			const childDoc1 = mockDoc({ id: 2, spaceId: 1, parentId: 1, sortOrder: 0 });
			const childDoc2 = mockDoc({ id: 3, spaceId: 1, parentId: 1, sortOrder: 1 });

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(childDoc1) },
				{ get: vi.fn().mockReturnValue(childDoc2) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.getTreeContent(1, 1);

			// When parentId is a number, should filter for that specific parent
			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						parentId: 1,
					}),
					order: [["sortOrder", "ASC"]],
				}),
			);
			expect(result).toEqual([childDoc1, childDoc2]);
		});

		it("should exclude deleted docs from results", async () => {
			const activeDoc = mockDoc({ id: 1, spaceId: 1, deletedAt: undefined });

			const mockDocInstances = [{ get: vi.fn().mockReturnValue(activeDoc) }];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			await docDao.getTreeContent(1);

			// Should include deletedAt filter (Op.is null)
			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						deletedAt: expect.objectContaining({}), // Op.is null
					}),
				}),
			);
		});

		it("should return empty array when no docs match", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValue([]);

			const result = await docDao.getTreeContent(1);

			expect(result).toEqual([]);
		});
	});

	describe("getMaxSortOrder", () => {
		it("should return max sortOrder for root-level docs when parentId is undefined", async () => {
			const mockResult = { maxSortOrder: 5 };
			vi.mocked(mockDocs.findOne).mockResolvedValue(mockResult as never);

			const result = await docDao.getMaxSortOrder(1);

			expect(mockDocs.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						parentId: expect.objectContaining({}), // Op.is null
					}),
					raw: true,
				}),
			);
			expect(result).toBe(5);
		});

		it("should return max sortOrder for root-level docs when parentId is null", async () => {
			const mockResult = { maxSortOrder: 3 };
			vi.mocked(mockDocs.findOne).mockResolvedValue(mockResult as never);

			const result = await docDao.getMaxSortOrder(1, null);

			expect(mockDocs.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						parentId: expect.objectContaining({}), // Op.is null
					}),
				}),
			);
			expect(result).toBe(3);
		});

		it("should return max sortOrder for children of specific parent", async () => {
			const mockResult = { maxSortOrder: 10 };
			vi.mocked(mockDocs.findOne).mockResolvedValue(mockResult as never);

			const result = await docDao.getMaxSortOrder(1, 5);

			expect(mockDocs.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						parentId: 5,
					}),
				}),
			);
			expect(result).toBe(10);
		});

		it("should return 0 when no docs exist", async () => {
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			const result = await docDao.getMaxSortOrder(1);

			expect(result).toBe(0);
		});

		it("should return 0 when maxSortOrder is null", async () => {
			const mockResult = { maxSortOrder: null };
			vi.mocked(mockDocs.findOne).mockResolvedValue(mockResult as never);

			const result = await docDao.getMaxSortOrder(1);

			expect(result).toBe(0);
		});

		it("should exclude deleted docs from calculation", async () => {
			const mockResult = { maxSortOrder: 7 };
			vi.mocked(mockDocs.findOne).mockResolvedValue(mockResult as never);

			await docDao.getMaxSortOrder(1);

			expect(mockDocs.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						deletedAt: expect.objectContaining({}), // Op.is null
					}),
				}),
			);
		});
	});

	describe("findFolderByName", () => {
		it("should find folder by name at root level when parentId is null", async () => {
			const folder = mockDoc({
				id: 1,
				spaceId: 1,
				docType: "folder",
				parentId: undefined,
				contentMetadata: { title: "My Folder" },
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(folder),
			};

			vi.mocked(mockDocs.findAll).mockResolvedValue([mockDocInstance] as never);

			const result = await docDao.findFolderByName(1, null, "My Folder");

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						docType: "folder",
						parentId: expect.objectContaining({}), // Op.is null
					}),
				}),
			);
			expect(result).toEqual(folder);
		});

		it("should find folder by name under specific parent", async () => {
			const folder = mockDoc({
				id: 2,
				spaceId: 1,
				docType: "folder",
				parentId: 1,
				contentMetadata: { title: "Subfolder" },
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(folder),
			};

			vi.mocked(mockDocs.findAll).mockResolvedValue([mockDocInstance] as never);

			const result = await docDao.findFolderByName(1, 1, "Subfolder");

			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						docType: "folder",
						parentId: 1,
					}),
				}),
			);
			expect(result).toEqual(folder);
		});

		it("should return undefined when folder is not found", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValue([]);

			const result = await docDao.findFolderByName(1, null, "Nonexistent");

			expect(result).toBeUndefined();
		});

		it("should return undefined when name does not match any folder", async () => {
			const folder = mockDoc({
				id: 1,
				spaceId: 1,
				docType: "folder",
				parentId: undefined,
				contentMetadata: { title: "Different Name" },
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(folder),
			};

			vi.mocked(mockDocs.findAll).mockResolvedValue([mockDocInstance] as never);

			const result = await docDao.findFolderByName(1, null, "My Folder");

			expect(result).toBeUndefined();
		});

		it("should match exact folder name among multiple folders", async () => {
			const folder1 = mockDoc({
				id: 1,
				spaceId: 1,
				docType: "folder",
				parentId: undefined,
				contentMetadata: { title: "Folder A" },
			});
			const folder2 = mockDoc({
				id: 2,
				spaceId: 1,
				docType: "folder",
				parentId: undefined,
				contentMetadata: { title: "Folder B" },
			});

			const mockDocInstances = [
				{ get: vi.fn().mockReturnValue(folder1) },
				{ get: vi.fn().mockReturnValue(folder2) },
			];

			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await docDao.findFolderByName(1, null, "Folder B");

			expect(result).toEqual(folder2);
		});

		it("should handle folder with undefined contentMetadata", async () => {
			const folder = mockDoc({
				id: 1,
				spaceId: 1,
				docType: "folder",
				parentId: undefined,
				contentMetadata: undefined,
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(folder),
			};

			vi.mocked(mockDocs.findAll).mockResolvedValue([mockDocInstance] as never);

			const result = await docDao.findFolderByName(1, null, "My Folder");

			expect(result).toBeUndefined();
		});
	});

	describe("moveDoc", () => {
		let mockTransaction: {
			commit: ReturnType<typeof vi.fn>;
			rollback: ReturnType<typeof vi.fn>;
		};
		let mockSequelize: Sequelize;

		beforeEach(() => {
			mockTransaction = {
				commit: vi.fn().mockResolvedValue(undefined),
				rollback: vi.fn().mockResolvedValue(undefined),
			};

			mockSequelize = {
				define: vi.fn().mockReturnValue(mockDocs),
				transaction: vi.fn().mockResolvedValue(mockTransaction),
			} as unknown as Sequelize;

			docDao = createDocDao(mockSequelize);
		});

		it("should move document to root level", async () => {
			const parentDoc = mockDoc({ id: 1, docType: "folder", path: "/parent", slug: "parent" });
			const doc = mockDoc({ id: 2, docType: "document", parentId: 1, path: "/parent/doc", slug: "doc" });

			const _parentDocInstance = { get: vi.fn().mockReturnValue(parentDoc) };
			const docInstance = { get: vi.fn().mockReturnValue(doc) };

			// readDocById for doc to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);

			// findAll for siblings in root (empty - this will be the first item at root)
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			// readDocById after update
			const movedDoc = mockDoc({
				...doc,
				parentId: undefined,
				path: "/doc",
				sortOrder: 1.0,
				version: doc.version + 1,
			});
			const movedDocInstance = { get: vi.fn().mockReturnValue(movedDoc) };
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(movedDocInstance as never);

			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.moveDoc(2, undefined);

			expect(mockSequelize.transaction).toHaveBeenCalled();
			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.anything(),
					order: [["sortOrder", "DESC"]],
					limit: 1,
				}),
			);
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					parentId: null,
					path: "/doc",
					sortOrder: 1.0,
					version: doc.version + 1,
				}),
				expect.objectContaining({ where: { id: 2 } }),
			);
			expect(mockTransaction.commit).toHaveBeenCalled();
			expect(result).toEqual(movedDoc);
		});

		it("should move document to another folder", async () => {
			const _folderA = mockDoc({ id: 1, docType: "folder", path: "/folder-a", slug: "folder-a" });
			const folderB = mockDoc({ id: 3, docType: "folder", path: "/folder-b", slug: "folder-b" });
			const doc = mockDoc({ id: 2, docType: "document", parentId: 1, path: "/folder-a/doc", slug: "doc" });
			const existingSibling = mockDoc({
				id: 4,
				docType: "document",
				parentId: 3,
				path: "/folder-b/existing",
				sortOrder: 5.0,
			});

			const docInstance = { get: vi.fn().mockReturnValue(doc) };
			const folderBInstance = { get: vi.fn().mockReturnValue(folderB) };
			const existingSiblingInstance = { get: vi.fn().mockReturnValue(existingSibling) };

			// readDocById for doc to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);
			// readDocById for new parent
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderBInstance as never);

			// findAll for siblings in folder B (has existing sibling with sortOrder 5.0)
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([existingSiblingInstance] as never);

			// readDocById after update
			const movedDoc = mockDoc({
				...doc,
				parentId: 3,
				path: "/folder-b/doc",
				sortOrder: 6.0,
				version: doc.version + 1,
			});
			const movedDocInstance = { get: vi.fn().mockReturnValue(movedDoc) };
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(movedDocInstance as never);

			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.moveDoc(2, 3);

			expect(mockSequelize.transaction).toHaveBeenCalled();
			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.anything(),
					order: [["sortOrder", "DESC"]],
					limit: 1,
				}),
			);
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					parentId: 3,
					path: "/folder-b/doc",
					sortOrder: 6.0,
					version: doc.version + 1,
				}),
				expect.objectContaining({ where: { id: 2 } }),
			);
			expect(mockTransaction.commit).toHaveBeenCalled();
			expect(result).toEqual(movedDoc);
		});

		it("should move folder and update descendant paths", async () => {
			const folderA = mockDoc({
				id: 1,
				docType: "folder",
				path: "/folder-a",
				slug: "folder-a",
				parentId: undefined,
			});
			const childDoc = mockDoc({
				id: 3,
				docType: "document",
				path: "/folder-a/child",
				slug: "child",
				parentId: 1,
			});
			const folderB = mockDoc({
				id: 2,
				docType: "folder",
				path: "/folder-b",
				slug: "folder-b",
				parentId: undefined,
			});

			const folderAInstance = { get: vi.fn().mockReturnValue(folderA) };
			const folderBInstance = { get: vi.fn().mockReturnValue(folderB) };
			const childDocInstance = { get: vi.fn().mockReturnValue(childDoc) };

			// readDocById for folder to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderAInstance as never);
			// isDescendantOf calls Promise.all([readDocById(newParentId=2), readDocById(id=1)])
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderBInstance as never); // newParentId
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderAInstance as never); // id
			// readDocById for new parent validation
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderBInstance as never);

			// findAll for siblings in folder B (empty - folderA will be the first child)
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			// findAll for children of folderA
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([childDocInstance] as never);

			// readDocById after update
			const movedFolder = mockDoc({
				...folderA,
				parentId: 2,
				path: "/folder-b/folder-a",
				sortOrder: 1.0,
				version: folderA.version + 1,
			});
			const movedFolderInstance = { get: vi.fn().mockReturnValue(movedFolder) };
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(movedFolderInstance as never);

			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.moveDoc(1, 2);

			expect(mockSequelize.transaction).toHaveBeenCalled();
			// Should update folder itself
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					parentId: 2,
					path: "/folder-b/folder-a",
					sortOrder: 1.0,
				}),
				expect.objectContaining({ where: { id: 1 } }),
			);
			// Should update child path
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					path: "/folder-b/folder-a/child",
				}),
				expect.objectContaining({ where: { id: 3 } }),
			);
			expect(mockTransaction.commit).toHaveBeenCalled();
			expect(result).toEqual(movedFolder);
		});

		it("should move folder with nested subfolders and update all descendant paths", async () => {
			const folderA = mockDoc({
				id: 1,
				docType: "folder",
				path: "/folder-a",
				slug: "folder-a",
				parentId: undefined,
			});
			const subFolder = mockDoc({
				id: 3,
				docType: "folder",
				path: "/folder-a/sub-folder",
				slug: "sub-folder",
				parentId: 1,
			});
			const nestedDoc = mockDoc({
				id: 4,
				docType: "document",
				path: "/folder-a/sub-folder/nested-doc",
				slug: "nested-doc",
				parentId: 3,
			});
			const folderB = mockDoc({
				id: 2,
				docType: "folder",
				path: "/folder-b",
				slug: "folder-b",
				parentId: undefined,
			});

			const folderAInstance = { get: vi.fn().mockReturnValue(folderA) };
			const folderBInstance = { get: vi.fn().mockReturnValue(folderB) };
			const subFolderInstance = { get: vi.fn().mockReturnValue(subFolder) };
			const nestedDocInstance = { get: vi.fn().mockReturnValue(nestedDoc) };

			// readDocById for folder to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderAInstance as never);
			// isDescendantOf calls Promise.all([readDocById(newParentId=2), readDocById(id=1)])
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderBInstance as never); // newParentId
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderAInstance as never); // id
			// readDocById for new parent validation
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folderBInstance as never);

			// findAll for siblings in folder B (empty)
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			// findAll for children of folderA - contains subFolder
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([subFolderInstance] as never);

			// findAll for children of subFolder - contains nestedDoc
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([nestedDocInstance] as never);

			// readDocById after update
			const movedFolder = mockDoc({
				...folderA,
				parentId: 2,
				path: "/folder-b/folder-a",
				sortOrder: 1.0,
				version: folderA.version + 1,
			});
			const movedFolderInstance = { get: vi.fn().mockReturnValue(movedFolder) };
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(movedFolderInstance as never);

			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.moveDoc(1, 2);

			expect(mockSequelize.transaction).toHaveBeenCalled();
			// Should update folder itself
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					parentId: 2,
					path: "/folder-b/folder-a",
				}),
				expect.objectContaining({ where: { id: 1 } }),
			);
			// Should update subFolder path
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					path: "/folder-b/folder-a/sub-folder",
				}),
				expect.objectContaining({ where: { id: 3 } }),
			);
			// Should update nested doc path
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					path: "/folder-b/folder-a/sub-folder/nested-doc",
				}),
				expect.objectContaining({ where: { id: 4 } }),
			);
			expect(mockTransaction.commit).toHaveBeenCalled();
			expect(result).toEqual(movedFolder);
		});

		it("should reject moving folder to itself", async () => {
			const folder = mockDoc({ id: 1, docType: "folder", path: "/folder", slug: "folder" });
			const folderInstance = { get: vi.fn().mockReturnValue(folder) };

			vi.mocked(mockDocs.findByPk).mockResolvedValue(folderInstance as never);

			await expect(docDao.moveDoc(1, 1)).rejects.toThrow("Cannot move item to itself");
			expect(mockSequelize.transaction).not.toHaveBeenCalled();
		});

		it("should reject moving folder to its descendant", async () => {
			const folder1 = mockDoc({
				id: 1,
				docType: "folder",
				path: "/folder1",
				slug: "folder1",
				parentId: undefined,
			});
			const folder2 = mockDoc({
				id: 2,
				docType: "folder",
				path: "/folder1/folder2",
				slug: "folder2",
				parentId: 1,
			});

			const folder1Instance = { get: vi.fn().mockReturnValue(folder1) };
			const folder2Instance = { get: vi.fn().mockReturnValue(folder2) };

			// readDocById for folder to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folder1Instance as never);
			// readDocById for checking parent chain (folder2 -> folder1)
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folder2Instance as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(folder1Instance as never);

			await expect(docDao.moveDoc(1, 2)).rejects.toThrow("Cannot move folder to its descendant");
			expect(mockSequelize.transaction).not.toHaveBeenCalled();
		});

		it("should reject moving to non-existent parent", async () => {
			const doc = mockDoc({ id: 1, docType: "document", path: "/doc", slug: "doc" });
			const docInstance = { get: vi.fn().mockReturnValue(doc) };

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(null);

			await expect(docDao.moveDoc(1, 999)).rejects.toThrow("Target folder not found or has been deleted");
			expect(mockSequelize.transaction).not.toHaveBeenCalled();
		});

		it("should reject moving to deleted parent", async () => {
			const doc = mockDoc({ id: 1, docType: "document", path: "/doc", slug: "doc" });
			const deletedFolder = mockDoc({ id: 2, docType: "folder", deletedAt: new Date() });

			const docInstance = { get: vi.fn().mockReturnValue(doc) };
			const deletedFolderInstance = { get: vi.fn().mockReturnValue(deletedFolder) };

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(deletedFolderInstance as never);

			await expect(docDao.moveDoc(1, 2)).rejects.toThrow("Target folder not found or has been deleted");
			expect(mockSequelize.transaction).not.toHaveBeenCalled();
		});

		it("should reject moving to non-folder parent", async () => {
			const doc = mockDoc({ id: 1, docType: "document", path: "/doc", slug: "doc" });
			const documentParent = mockDoc({ id: 2, docType: "document", path: "/other-doc", slug: "other-doc" });

			const docInstance = { get: vi.fn().mockReturnValue(doc) };
			const documentParentInstance = { get: vi.fn().mockReturnValue(documentParent) };

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(documentParentInstance as never);

			await expect(docDao.moveDoc(1, 2)).rejects.toThrow("Target must be a folder");
			expect(mockSequelize.transaction).not.toHaveBeenCalled();
		});

		it("should return undefined when document is not found", async () => {
			vi.mocked(mockDocs.findByPk).mockResolvedValue(null);

			const result = await docDao.moveDoc(999, 1);

			expect(result).toBeUndefined();
			expect(mockSequelize.transaction).not.toHaveBeenCalled();
		});

		it("should return unchanged document when already in target location", async () => {
			// Document is already at root (parentId: undefined)
			const doc = mockDoc({ id: 1, docType: "document", path: "/doc", slug: "doc", parentId: undefined });
			const docInstance = { get: vi.fn().mockReturnValue(doc) };

			vi.mocked(mockDocs.findByPk).mockResolvedValue(docInstance as never);

			// Try to move to root (same location)
			const result = await docDao.moveDoc(1, undefined);

			// Should return the original document without any database operations
			expect(result).toEqual(doc);
			expect(mockSequelize.transaction).not.toHaveBeenCalled();
			expect(mockDocs.update).not.toHaveBeenCalled();
		});

		it("should return unchanged document when already in target parent folder", async () => {
			// Document is already in folder 5
			const doc = mockDoc({ id: 1, docType: "document", path: "/folder/doc", slug: "doc", parentId: 5 });
			const docInstance = { get: vi.fn().mockReturnValue(doc) };

			vi.mocked(mockDocs.findByPk).mockResolvedValue(docInstance as never);

			// Try to move to folder 5 (same location)
			const result = await docDao.moveDoc(1, 5);

			// Should return the original document without any database operations
			expect(result).toEqual(doc);
			expect(mockSequelize.transaction).not.toHaveBeenCalled();
			expect(mockDocs.update).not.toHaveBeenCalled();
		});

		it("should rollback transaction when update fails", async () => {
			// Document is in folder 2, trying to move to folder 3
			const doc = mockDoc({ id: 1, docType: "document", path: "/folder2/doc", slug: "doc", parentId: 2 });
			const docInstance = { get: vi.fn().mockReturnValue(doc) };
			const targetFolder = mockDoc({ id: 3, docType: "folder", path: "/folder3", slug: "folder3" });
			const targetFolderInstance = { get: vi.fn().mockReturnValue(targetFolder) };

			// readDocById for doc to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);
			// readDocById for target parent folder
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(targetFolderInstance as never);

			// findAll for siblings in target folder
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			const testError = new Error("Database error");
			vi.mocked(mockDocs.update).mockRejectedValue(testError);

			await expect(docDao.moveDoc(1, 3)).rejects.toThrow("Database error");
			expect(mockTransaction.rollback).toHaveBeenCalled();
			expect(mockTransaction.commit).not.toHaveBeenCalled();
		});

		it("should move document before a reference document", async () => {
			const doc = mockDoc({ id: 1, docType: "document", path: "/folder/doc1", slug: "doc1", parentId: 2 });
			const existingDoc = mockDoc({
				id: 4,
				docType: "document",
				path: "/folder/doc3",
				slug: "doc3",
				parentId: 2,
				sortOrder: 2.0,
			});
			const referenceDoc = mockDoc({
				id: 3,
				docType: "document",
				path: "/folder/doc2",
				slug: "doc2",
				parentId: 2,
				sortOrder: 5.0,
			});
			const targetFolder = mockDoc({ id: 2, docType: "folder", path: "/folder", slug: "folder" });

			const docInstance = { get: vi.fn().mockReturnValue(doc) };
			const existingDocInstance = { get: vi.fn().mockReturnValue(existingDoc) };
			const referenceDocInstance = { get: vi.fn().mockReturnValue(referenceDoc) };
			const targetFolderInstance = { get: vi.fn().mockReturnValue(targetFolder) };

			// readDocById for doc to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);
			// readDocById for target parent folder
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(targetFolderInstance as never);

			// findAll for siblings (for calculateSortOrderBeforeDoc) - multiple siblings with reference doc NOT first
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([existingDocInstance, referenceDocInstance] as never);

			// readDocById after update
			const movedDoc = mockDoc({
				...doc,
				parentId: 2,
				path: "/folder/doc1",
				sortOrder: 3.5, // Between existingDoc (2.0) and referenceDoc (5.0)
				version: doc.version + 1,
			});
			const movedDocInstance = { get: vi.fn().mockReturnValue(movedDoc) };
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(movedDocInstance as never);

			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.moveDoc(1, 2, 3, "before");

			expect(result).toEqual(movedDoc);
			expect(mockTransaction.commit).toHaveBeenCalled();
		});

		it("should move document after a reference document", async () => {
			const doc = mockDoc({ id: 1, docType: "document", path: "/folder/doc1", slug: "doc1", parentId: 2 });
			const referenceDoc = mockDoc({
				id: 3,
				docType: "document",
				path: "/folder/doc2",
				slug: "doc2",
				parentId: 2,
				sortOrder: 5.0,
			});
			const afterDoc = mockDoc({
				id: 5,
				docType: "document",
				path: "/folder/doc4",
				slug: "doc4",
				parentId: 2,
				sortOrder: 8.0,
			});
			const targetFolder = mockDoc({ id: 2, docType: "folder", path: "/folder", slug: "folder" });

			const docInstance = { get: vi.fn().mockReturnValue(doc) };
			const referenceDocInstance = { get: vi.fn().mockReturnValue(referenceDoc) };
			const afterDocInstance = { get: vi.fn().mockReturnValue(afterDoc) };
			const targetFolderInstance = { get: vi.fn().mockReturnValue(targetFolder) };

			// readDocById for doc to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);
			// readDocById for target parent folder
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(targetFolderInstance as never);

			// findAll for siblings (for calculateSortOrderAfterDoc) - reference doc has another doc after it
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([referenceDocInstance, afterDocInstance] as never);

			// readDocById after update
			const movedDoc = mockDoc({
				...doc,
				parentId: 2,
				path: "/folder/doc1",
				sortOrder: 6.5, // Between referenceDoc (5.0) and afterDoc (8.0)
				version: doc.version + 1,
			});
			const movedDocInstance = { get: vi.fn().mockReturnValue(movedDoc) };
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(movedDocInstance as never);

			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);

			const result = await docDao.moveDoc(1, 2, 3, "after");

			expect(result).toEqual(movedDoc);
			expect(mockTransaction.commit).toHaveBeenCalled();
		});

		it("should throw error when referenceDocId is not in target folder for moveDoc", async () => {
			const doc = mockDoc({ id: 1, docType: "document", path: "/folder-a/doc1", slug: "doc1", parentId: 2 });
			const targetFolder = mockDoc({ id: 3, docType: "folder", path: "/folder-b", slug: "folder-b" });
			const existingDoc = mockDoc({
				id: 4,
				docType: "document",
				path: "/folder-b/doc2",
				slug: "doc2",
				parentId: 3,
				sortOrder: 1.0,
			});

			const docInstance = { get: vi.fn().mockReturnValue(doc) };
			const targetFolderInstance = { get: vi.fn().mockReturnValue(targetFolder) };
			const existingDocInstance = { get: vi.fn().mockReturnValue(existingDoc) };

			// readDocById for doc to move
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);
			// readDocById for target parent folder
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(targetFolderInstance as never);

			// findAll for siblings - only existingDoc (id=4) is in folder-b, but we're trying to place relative to doc 999
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([existingDocInstance] as never);

			await expect(docDao.moveDoc(1, 3, 999, "before")).rejects.toThrow(
				"referenceDocId must be in the target folder",
			);
			expect(mockTransaction.rollback).toHaveBeenCalled();
		});
	});

	describe("reorderAt", () => {
		let mockTransaction: {
			commit: ReturnType<typeof vi.fn>;
			rollback: ReturnType<typeof vi.fn>;
		};
		let mockSequelize: Sequelize;

		beforeEach(() => {
			mockTransaction = {
				commit: vi.fn().mockResolvedValue(undefined),
				rollback: vi.fn().mockResolvedValue(undefined),
			};

			mockSequelize = {
				define: vi.fn().mockReturnValue(mockDocs),
				transaction: vi.fn().mockResolvedValue(mockTransaction),
			} as unknown as Sequelize;

			docDao = createDocDao(mockSequelize);
		});

		it("should reorder document to end when referenceDocId is null", async () => {
			const doc1 = mockDoc({ id: 1, parentId: undefined, spaceId: 1, sortOrder: 1.0 });
			const doc2 = mockDoc({ id: 2, parentId: undefined, spaceId: 1, sortOrder: 2.0 });
			const docInstance1 = { get: vi.fn().mockReturnValue(doc1) };
			const docInstance2 = { get: vi.fn().mockReturnValue(doc2) };

			// doc1 is first, moving to end (after doc2)
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance1 as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance1, docInstance2] as never); // siblings
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never); // No docs after end
			vi.mocked(mockDocs.update).mockResolvedValueOnce([1] as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance1 as never); // readDocById after update

			const result = await docDao.reorderAt(1, null);

			expect(result).toEqual(doc1);
			expect(mockTransaction.commit).toHaveBeenCalled();
		});

		it("should reorder document before another document", async () => {
			const doc1 = mockDoc({ id: 1, parentId: undefined, spaceId: 1, sortOrder: 1.0 });
			const doc2 = mockDoc({ id: 2, parentId: undefined, spaceId: 1, sortOrder: 2.0 });
			const doc3 = mockDoc({ id: 3, parentId: undefined, spaceId: 1, sortOrder: 3.0 });
			const docInstance1 = { get: vi.fn().mockReturnValue(doc1) };
			const docInstance2 = { get: vi.fn().mockReturnValue(doc2) };
			const docInstance3 = { get: vi.fn().mockReturnValue(doc3) };

			// Moving doc3 before doc2: [doc1, doc2, doc3] -> [doc1, doc3, doc2]
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance3 as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance1, docInstance2, docInstance3] as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance2] as never); // reference doc
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance1] as never); // before reference
			vi.mocked(mockDocs.update).mockResolvedValueOnce([1] as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance3 as never);

			const result = await docDao.reorderAt(3, 2, "before");

			expect(result).toEqual(doc3);
			expect(mockTransaction.commit).toHaveBeenCalled();
		});

		it("should reorder document after another document", async () => {
			const doc1 = mockDoc({ id: 1, parentId: undefined, spaceId: 1, sortOrder: 1.0 });
			const doc2 = mockDoc({ id: 2, parentId: undefined, spaceId: 1, sortOrder: 2.0 });
			const docInstance1 = { get: vi.fn().mockReturnValue(doc1) };
			const docInstance2 = { get: vi.fn().mockReturnValue(doc2) };

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance1 as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance1, docInstance2] as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance2] as never); // reference doc
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never); // after reference
			vi.mocked(mockDocs.update).mockResolvedValueOnce([1] as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance1 as never);

			const result = await docDao.reorderAt(1, 2, "after");

			expect(result).toEqual(doc1);
			expect(mockTransaction.commit).toHaveBeenCalled();
		});

		it("should return undefined when document not found", async () => {
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(null);

			const result = await docDao.reorderAt(999, 1);

			expect(result).toBeUndefined();
		});

		it("should return document when already at target position", async () => {
			const doc1 = mockDoc({ id: 1, parentId: undefined, spaceId: 1, sortOrder: 1.0 });
			const doc2 = mockDoc({ id: 2, parentId: undefined, spaceId: 1, sortOrder: 2.0 });
			const docInstance1 = { get: vi.fn().mockReturnValue(doc1) };
			const docInstance2 = { get: vi.fn().mockReturnValue(doc2) };

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance1 as never);
			// Already immediately after doc2
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance2, docInstance1] as never);

			const result = await docDao.reorderAt(1, 2, "after");

			expect(result).toEqual(doc1);
			expect(mockTransaction.commit).not.toHaveBeenCalled(); // No update needed
		});

		it("should return document when trying to reorder relative to itself", async () => {
			const doc = mockDoc({ id: 1, parentId: undefined, spaceId: 1, sortOrder: 1.0 });
			const docInstance = { get: vi.fn().mockReturnValue(doc) };

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance as never);

			const result = await docDao.reorderAt(1, 1);

			expect(result).toEqual(doc);
		});

		it("should rollback transaction on error", async () => {
			const doc1 = mockDoc({ id: 1, parentId: undefined, spaceId: 1, sortOrder: 1.0 });
			const doc2 = mockDoc({ id: 2, parentId: undefined, spaceId: 1, sortOrder: 2.0 });
			const docInstance1 = { get: vi.fn().mockReturnValue(doc1) };
			const docInstance2 = { get: vi.fn().mockReturnValue(doc2) };

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance1 as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance1, docInstance2] as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			const testError = new Error("Database error");
			vi.mocked(mockDocs.update).mockRejectedValue(testError);

			await expect(docDao.reorderAt(1, null)).rejects.toThrow("Database error");
			expect(mockTransaction.rollback).toHaveBeenCalled();
			expect(mockTransaction.commit).not.toHaveBeenCalled();
		});

		it("should throw error when referenceDocId is not a sibling", async () => {
			const doc1 = mockDoc({ id: 1, parentId: undefined, spaceId: 1, sortOrder: 1.0 });
			const doc2 = mockDoc({ id: 2, parentId: undefined, spaceId: 1, sortOrder: 2.0 });
			const docInstance1 = { get: vi.fn().mockReturnValue(doc1) };
			const docInstance2 = { get: vi.fn().mockReturnValue(doc2) };

			// doc1 is trying to reorder relative to doc 999 which is not in siblings
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance1 as never);
			// Siblings only contain doc1 and doc2
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance1, docInstance2] as never);
			// When calculating sortOrder, it will query siblings again
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance1, docInstance2] as never);

			await expect(docDao.reorderAt(1, 999, "after")).rejects.toThrow(
				"referenceDocId must be a sibling of the document",
			);
		});

		it("should handle when document is already at end position", async () => {
			const doc1 = mockDoc({ id: 1, parentId: undefined, spaceId: 1, sortOrder: 1.0 });
			const doc2 = mockDoc({ id: 2, parentId: undefined, spaceId: 1, sortOrder: 2.0 });
			const docInstance1 = { get: vi.fn().mockReturnValue(doc1) };
			const docInstance2 = { get: vi.fn().mockReturnValue(doc2) };

			// doc2 is already at the end
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(docInstance2 as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([docInstance1, docInstance2] as never);

			const result = await docDao.reorderAt(2, null);

			expect(result).toEqual(doc2);
			expect(mockTransaction.commit).not.toHaveBeenCalled(); // No update needed
		});
	});

	describe("findFolderByName", () => {
		it("should find folder by name at root level", async () => {
			const folder = mockDoc({ id: 1, docType: "folder", contentMetadata: { title: "Test Folder" } });
			const folderInstance = { get: vi.fn().mockReturnValue(folder) };

			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([folderInstance] as never);

			const result = await docDao.findFolderByName(1, null, "Test Folder");

			expect(result).toEqual(folder);
			expect(vi.mocked(mockDocs.findAll)).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						docType: "folder",
					}),
				}),
			);
		});

		it("should find folder by name under a parent", async () => {
			const folder = mockDoc({ id: 2, docType: "folder", parentId: 1, contentMetadata: { title: "Sub Folder" } });
			const folderInstance = { get: vi.fn().mockReturnValue(folder) };

			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([folderInstance] as never);

			const result = await docDao.findFolderByName(1, 1, "Sub Folder");

			expect(result).toEqual(folder);
			expect(vi.mocked(mockDocs.findAll)).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						spaceId: 1,
						docType: "folder",
						parentId: 1,
					}),
				}),
			);
		});

		it("should return undefined when folder not found", async () => {
			const folder = mockDoc({ id: 1, docType: "folder", contentMetadata: { title: "Other Folder" } });
			const folderInstance = { get: vi.fn().mockReturnValue(folder) };

			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([folderInstance] as never);

			const result = await docDao.findFolderByName(1, null, "Test Folder");

			expect(result).toBeUndefined();
		});

		it("should return undefined when no folders exist", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			const result = await docDao.findFolderByName(1, null, "Test Folder");

			expect(result).toBeUndefined();
		});
	});

	describe("renameDoc", () => {
		it("should rename document and update version", async () => {
			const existingDoc = mockDoc({
				id: 1,
				contentMetadata: { title: "Old Title" },
				version: 1,
			});
			const renamedDoc = mockDoc({
				id: 1,
				contentMetadata: { title: "New Title" },
				version: 2,
			});

			vi.mocked(mockDocs.findByPk)
				.mockResolvedValueOnce({ get: () => existingDoc } as never)
				.mockResolvedValueOnce({ get: () => renamedDoc } as never);
			vi.mocked(mockDocs.update).mockResolvedValueOnce([1] as never);

			const result = await docDao.renameDoc(1, "New Title");

			expect(mockDocs.update).toHaveBeenCalledWith(
				{ contentMetadata: { title: "New Title" }, version: 2 },
				{ where: { id: 1 } },
			);
			expect(result).toEqual(renamedDoc);
		});

		it("should preserve other contentMetadata fields when renaming", async () => {
			const existingDoc = mockDoc({
				id: 1,
				contentMetadata: { title: "Old Title", sourceName: "source", sourceUrl: "http://example.com" },
				version: 1,
			});
			const renamedDoc = mockDoc({
				id: 1,
				contentMetadata: { title: "New Title", sourceName: "source", sourceUrl: "http://example.com" },
				version: 2,
			});

			vi.mocked(mockDocs.findByPk)
				.mockResolvedValueOnce({ get: () => existingDoc } as never)
				.mockResolvedValueOnce({ get: () => renamedDoc } as never);
			vi.mocked(mockDocs.update).mockResolvedValueOnce([1] as never);

			const result = await docDao.renameDoc(1, "New Title");

			expect(mockDocs.update).toHaveBeenCalledWith(
				{
					contentMetadata: { title: "New Title", sourceName: "source", sourceUrl: "http://example.com" },
					version: 2,
				},
				{ where: { id: 1 } },
			);
			expect(result).toEqual(renamedDoc);
		});

		it("should return undefined when document not found", async () => {
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(null as never);

			const result = await docDao.renameDoc(999, "New Title");

			expect(result).toBeUndefined();
			expect(mockDocs.update).not.toHaveBeenCalled();
		});
	});

	describe("getAllContent", () => {
		it("should return content array excluding root and deleted docs", async () => {
			const docs = [
				{ get: (field: string) => (field === "content" ? "Content 1" : undefined) },
				{ get: (field: string) => (field === "content" ? "Content 2" : undefined) },
			];
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce(docs as never);

			const result = await docDao.getAllContent();

			expect(mockDocs.findAll).toHaveBeenCalledWith({
				where: expect.objectContaining({
					jrn: expect.anything(),
					deletedAt: expect.anything(),
				}),
				attributes: ["content"],
			});
			expect(result).toEqual([{ content: "Content 1" }, { content: "Content 2" }]);
		});

		it("should return empty array when no docs exist", async () => {
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([] as never);

			const result = await docDao.getAllContent();

			expect(result).toEqual([]);
		});
	});

	describe("reorderDoc", () => {
		let mockTransaction: {
			commit: ReturnType<typeof vi.fn>;
			rollback: ReturnType<typeof vi.fn>;
		};
		let mockSequelizeWithTransaction: Sequelize;

		beforeEach(() => {
			mockTransaction = {
				commit: vi.fn().mockResolvedValue(undefined),
				rollback: vi.fn().mockResolvedValue(undefined),
			};

			mockSequelizeWithTransaction = {
				define: vi.fn().mockReturnValue(mockDocs),
				transaction: vi.fn().mockResolvedValue(mockTransaction),
			} as unknown as Sequelize;

			docDao = createDocDao(mockSequelizeWithTransaction);
		});

		it("should swap sortOrder when moving down", async () => {
			const doc = mockDoc({ id: 1, sortOrder: 0, spaceId: 1, parentId: undefined, deletedAt: undefined });
			const sibling = mockDoc({ id: 2, sortOrder: 1, spaceId: 1, parentId: undefined, deletedAt: undefined });
			const updatedDoc = mockDoc({ id: 1, sortOrder: 1, spaceId: 1 });

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce({ get: () => doc } as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([{ get: () => doc }, { get: () => sibling }] as never);
			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce({ get: () => updatedDoc } as never);

			const result = await docDao.reorderDoc(1, "down");

			expect(mockDocs.update).toHaveBeenCalled();
			expect(mockTransaction.commit).toHaveBeenCalled();
			expect(result).toEqual(updatedDoc);
		});

		it("should swap sortOrder when moving up", async () => {
			const sibling = mockDoc({ id: 1, sortOrder: 0, spaceId: 1, parentId: undefined, deletedAt: undefined });
			const doc = mockDoc({ id: 2, sortOrder: 1, spaceId: 1, parentId: undefined, deletedAt: undefined });
			const updatedDoc = mockDoc({ id: 2, sortOrder: 0, spaceId: 1 });

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce({ get: () => doc } as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([{ get: () => sibling }, { get: () => doc }] as never);
			vi.mocked(mockDocs.update).mockResolvedValue([1] as never);
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce({ get: () => updatedDoc } as never);

			const result = await docDao.reorderDoc(2, "up");

			expect(mockDocs.update).toHaveBeenCalled();
			expect(mockTransaction.commit).toHaveBeenCalled();
			expect(result).toEqual(updatedDoc);
		});

		it("should return undefined when document not found", async () => {
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce(null as never);

			const result = await docDao.reorderDoc(999, "down");

			expect(result).toBeUndefined();
		});

		it("should return undefined when document is deleted", async () => {
			const deletedDoc = mockDoc({ id: 1, deletedAt: new Date("2024-01-01T00:00:00Z") });
			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce({ get: () => deletedDoc } as never);

			const result = await docDao.reorderDoc(1, "down");

			expect(result).toBeUndefined();
		});

		it("should return undefined when at top boundary moving up", async () => {
			const doc = mockDoc({ id: 1, sortOrder: 0, spaceId: 1, parentId: undefined, deletedAt: undefined });

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce({ get: () => doc } as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([{ get: () => doc }] as never);

			const result = await docDao.reorderDoc(1, "up");

			expect(result).toBeUndefined();
			expect(mockDocs.update).not.toHaveBeenCalled();
		});

		it("should return undefined when at bottom boundary moving down", async () => {
			const doc = mockDoc({ id: 1, sortOrder: 0, spaceId: 1, parentId: undefined, deletedAt: undefined });

			vi.mocked(mockDocs.findByPk).mockResolvedValueOnce({ get: () => doc } as never);
			vi.mocked(mockDocs.findAll).mockResolvedValueOnce([{ get: () => doc }] as never);

			const result = await docDao.reorderDoc(1, "down");

			expect(result).toBeUndefined();
			expect(mockDocs.update).not.toHaveBeenCalled();
		});
	});

	describe("findDocBySourcePath", () => {
		it("should find doc by source metadata path within a space", async () => {
			const doc = mockDoc({
				id: 1,
				spaceId: 1,
				sourceMetadata: { path: "docs/getting-started.md" },
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(doc),
			};

			vi.mocked(mockDocs.findOne).mockResolvedValue(mockDocInstance as never);

			const result = await docDao.findDocBySourcePath(1, "docs/getting-started.md");

			expect(mockDocs.findOne).toHaveBeenCalled();
			expect(result).toEqual(doc);
		});

		it("should return undefined when no doc found", async () => {
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			const result = await docDao.findDocBySourcePath(1, "nonexistent.md");

			expect(result).toBeUndefined();
		});

		it("should escape single quotes in source path", async () => {
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			await docDao.findDocBySourcePath(1, "doc's-name.md");

			// The path should be escaped to prevent SQL injection
			expect(mockDocs.findOne).toHaveBeenCalled();
		});
	});

	describe("findDocBySourcePathAnySpace", () => {
		it("should find doc by source metadata path across all spaces", async () => {
			const doc = mockDoc({
				id: 1,
				spaceId: 2,
				sourceMetadata: { path: "docs/readme.md" },
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(doc),
			};

			vi.mocked(mockDocs.findOne).mockResolvedValue(mockDocInstance as never);

			const result = await docDao.findDocBySourcePathAnySpace("docs/readme.md");

			expect(mockDocs.findOne).toHaveBeenCalled();
			expect(result).toEqual(doc);
		});

		it("should return undefined when no doc found", async () => {
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			const result = await docDao.findDocBySourcePathAnySpace("nonexistent.md");

			expect(result).toBeUndefined();
		});

		it("should include integration scope when integrationId is provided", async () => {
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			await docDao.findDocBySourcePathAnySpace("docs/readme.md", 42);

			expect(mockDocs.findOne).toHaveBeenCalled();
			const callArgs = vi.mocked(mockDocs.findOne).mock.calls[0][0] as Record<string, unknown>;
			const where = callArgs.where as Record<string, unknown>;
			expect(where).toHaveProperty("sourceMetadata.path", "docs/readme.md");
			expect(where).toHaveProperty("source.integrationId", 42);
		});

		it("should not include integration scope when integrationId is omitted", async () => {
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			await docDao.findDocBySourcePathAnySpace("docs/readme.md");

			expect(mockDocs.findOne).toHaveBeenCalled();
			const callArgs = vi.mocked(mockDocs.findOne).mock.calls[0][0] as Record<string, unknown>;
			const where = callArgs.where as Record<string, unknown>;
			expect(where).toHaveProperty("sourceMetadata.path", "docs/readme.md");
			expect(where).not.toHaveProperty("source.integrationId");
		});

		it("should include integration scope in filename fallback query", async () => {
			// First query returns no result to trigger filename fallback
			vi.mocked(mockDocs.findOne).mockResolvedValue(null);

			await docDao.findDocBySourcePathAnySpace("docs/readme.md", 7);

			// Should be called twice: once for full path, once for filename fallback
			expect(mockDocs.findOne).toHaveBeenCalledTimes(2);
			const callArgs = vi.mocked(mockDocs.findOne).mock.calls[1][0] as Record<string, unknown>;
			const where = callArgs.where as Record<string, unknown>;
			// Filename fallback uses just "readme.md"
			expect(where).toHaveProperty("sourceMetadata.path", "readme.md");
			expect(where).toHaveProperty("source.integrationId", 7);
		});
	});
});

describe("createDocDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as DocDao;
		const provider = createDocDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context docDao when context has database", () => {
		const defaultDao = {} as DocDao;
		const contextDocDao = {} as DocDao;
		const context = {
			database: {
				docDao: contextDocDao,
			},
		} as TenantOrgContext;

		const provider = createDocDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextDocDao);
	});
});

describe("DocDao postSync migrations", () => {
	let mockDocs: ModelDef<Doc>;
	let mockSequelize: Sequelize & { query: ReturnType<typeof vi.fn> };
	let docDaoWithPostSync: DocDao & { postSync: (sequelize: Sequelize, db: unknown) => Promise<void> };

	beforeEach(() => {
		mockDocs = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			findByPk: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
			count: vi.fn(),
		} as unknown as ModelDef<Doc>;

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockDocs),
			query: vi.fn(),
		} as unknown as Sequelize & { query: ReturnType<typeof vi.fn> };

		docDaoWithPostSync = createDocDao(mockSequelize) as DocDao & {
			postSync: (sequelize: Sequelize, db: unknown) => Promise<void>;
		};
	});

	describe("migrateSortOrder", () => {
		it("should skip migration when no groups exist", async () => {
			mockSequelize.query
				.mockResolvedValueOnce([[]]) // no null slugs
				.mockResolvedValueOnce([[]]) // no empty paths
				.mockResolvedValueOnce([[]]) // no old jrns
				.mockResolvedValueOnce([[]]); // no groups for sortOrder migration

			await docDaoWithPostSync.postSync(mockSequelize, {});

			// Query was called to find groups
			expect(mockSequelize.query).toHaveBeenCalled();
		});

		it("should not update sortOrder when no duplicates exist", async () => {
			// First three queries for slug, path, and jrn migrations (no docs to migrate)
			mockSequelize.query
				.mockResolvedValueOnce([[]]) // slug migration - no null slugs
				.mockResolvedValueOnce([[]]) // path migration - no empty paths
				.mockResolvedValueOnce([[]]) // jrn migration - no old format jrns
				// sortOrder migration
				.mockResolvedValueOnce([[{ space_id: 1, parent_id: null }]]) // groups query
				.mockResolvedValueOnce([
					// docs in group with unique sortOrders
					{ id: 1, sort_order: 0 },
					{ id: 2, sort_order: 1 },
					{ id: 3, sort_order: 2 },
				]);

			await docDaoWithPostSync.postSync(mockSequelize, {});

			// Verify no UPDATE queries were made for sortOrder
			const updateCalls = mockSequelize.query.mock.calls.filter(
				call => typeof call[0] === "string" && call[0].includes("UPDATE docs SET sort_order"),
			);
			expect(updateCalls).toHaveLength(0);
		});

		it("should fix duplicate sortOrder values", async () => {
			// First three queries for slug, path, and jrn migrations (no docs to migrate)
			mockSequelize.query
				.mockResolvedValueOnce([[]]) // slug migration - no null slugs
				.mockResolvedValueOnce([[]]) // path migration - no empty paths
				.mockResolvedValueOnce([[]]) // jrn migration - no old format jrns
				// sortOrder migration
				.mockResolvedValueOnce([[{ space_id: 1, parent_id: null }]]) // groups query
				.mockResolvedValueOnce([
					// docs with duplicate sortOrders (both have sortOrder 1)
					{ id: 1, sort_order: 1 },
					{ id: 2, sort_order: 1 },
				])
				.mockResolvedValue(undefined); // UPDATE queries

			await docDaoWithPostSync.postSync(mockSequelize, {});

			// Verify UPDATE queries were made to fix sortOrder
			const updateCalls = mockSequelize.query.mock.calls.filter(
				call => typeof call[0] === "string" && call[0].includes("UPDATE docs SET sort_order"),
			);
			expect(updateCalls.length).toBeGreaterThan(0);
		});

		it("should skip empty groups", async () => {
			// First three queries for slug, path, and jrn migrations (no docs to migrate)
			mockSequelize.query
				.mockResolvedValueOnce([[]]) // slug migration - no null slugs
				.mockResolvedValueOnce([[]]) // path migration - no empty paths
				.mockResolvedValueOnce([[]]) // jrn migration - no old format jrns
				// sortOrder migration
				.mockResolvedValueOnce([
					[
						{ space_id: 1, parent_id: null },
						{ space_id: 2, parent_id: null },
					],
				]) // groups
				.mockResolvedValueOnce([]) // first group has no docs
				.mockResolvedValueOnce([{ id: 1, sort_order: 0 }]); // second group has one doc

			await docDaoWithPostSync.postSync(mockSequelize, {});

			// No errors should be thrown, migration should handle empty groups
			expect(mockSequelize.query).toHaveBeenCalled();
		});
	});

	describe("migrateDocSlugs", () => {
		it("should generate slugs for docs with NULL slugs", async () => {
			mockSequelize.query
				.mockResolvedValueOnce([
					[{ id: 1, jrn: "doc:old-format", content_metadata: { title: "Test Doc" }, doc_type: "document" }],
				]) // docs with NULL slugs
				.mockResolvedValue(undefined); // UPDATE queries

			await docDaoWithPostSync.postSync(mockSequelize, {});

			// Verify UPDATE query was made with generated slug
			const updateCalls = mockSequelize.query.mock.calls.filter(
				call => typeof call[0] === "string" && call[0].includes("UPDATE docs SET slug"),
			);
			expect(updateCalls.length).toBeGreaterThan(0);
		});

		it("should use jrn segment when no title in contentMetadata", async () => {
			mockSequelize.query
				.mockResolvedValueOnce([
					[{ id: 1, jrn: "doc:my-document", content_metadata: null, doc_type: "document" }],
				])
				.mockResolvedValue(undefined);

			await docDaoWithPostSync.postSync(mockSequelize, {});

			const updateCalls = mockSequelize.query.mock.calls.filter(
				call => typeof call[0] === "string" && call[0].includes("UPDATE docs SET slug"),
			);
			expect(updateCalls.length).toBeGreaterThan(0);
		});
	});

	describe("migrateDocPaths", () => {
		it("should calculate paths for docs with empty paths", async () => {
			mockSequelize.query
				.mockResolvedValueOnce([[]]) // no null slugs
				.mockResolvedValueOnce([[{ id: 1, slug: "test-doc", parent_id: null }]]) // docs with empty paths
				.mockResolvedValue(undefined); // UPDATE queries

			await docDaoWithPostSync.postSync(mockSequelize, {});

			const updateCalls = mockSequelize.query.mock.calls.filter(
				call => typeof call[0] === "string" && call[0].includes("UPDATE docs SET path"),
			);
			expect(updateCalls.length).toBeGreaterThan(0);
		});

		it("should calculate path based on parent", async () => {
			mockSequelize.query
				.mockResolvedValueOnce([[]]) // no null slugs
				.mockResolvedValueOnce([[{ id: 2, slug: "child-doc", parent_id: 1 }]]) // docs with empty paths
				.mockResolvedValueOnce([[{ path: "/parent" }]]) // parent path lookup
				.mockResolvedValue(undefined); // UPDATE queries

			await docDaoWithPostSync.postSync(mockSequelize, {});

			const updateCalls = mockSequelize.query.mock.calls.filter(
				call => typeof call[0] === "string" && call[0].includes("UPDATE docs SET path"),
			);
			expect(updateCalls.length).toBeGreaterThan(0);
		});
	});

	describe("migrateDocJrns", () => {
		it("should migrate old JRN format to new format", async () => {
			mockSequelize.query
				.mockResolvedValueOnce([[]]) // no null slugs
				.mockResolvedValueOnce([[]]) // no empty paths
				.mockResolvedValueOnce([[{ id: 1, jrn: "doc:old-format", slug: "test-doc", doc_type: "document" }]])
				.mockResolvedValue(undefined);

			await docDaoWithPostSync.postSync(mockSequelize, {});

			const updateCalls = mockSequelize.query.mock.calls.filter(
				call => typeof call[0] === "string" && call[0].includes("UPDATE docs SET jrn"),
			);
			expect(updateCalls.length).toBeGreaterThan(0);
		});

		it("should use folder JRN format for folder docType", async () => {
			mockSequelize.query
				.mockResolvedValueOnce([[]]) // no null slugs
				.mockResolvedValueOnce([[]]) // no empty paths
				.mockResolvedValueOnce([[{ id: 1, jrn: "folder:old-format", slug: "test-folder", doc_type: "folder" }]])
				.mockResolvedValue(undefined);

			await docDaoWithPostSync.postSync(mockSequelize, {});

			const updateCalls = mockSequelize.query.mock.calls.filter(
				call => typeof call[0] === "string" && call[0].includes("UPDATE docs SET jrn"),
			);
			expect(updateCalls.length).toBeGreaterThan(0);
		});
	});

	describe("postSync error handling", () => {
		it("should continue migrations even if one fails", async () => {
			mockSequelize.query
				.mockRejectedValueOnce(new Error("Slug migration failed")) // slug migration fails
				.mockRejectedValueOnce(new Error("Path migration failed")) // path migration fails
				.mockRejectedValueOnce(new Error("JRN migration failed")) // jrn migration fails
				.mockRejectedValueOnce(new Error("SortOrder migration failed")); // sortOrder migration fails

			// Should not throw - errors are logged but execution continues
			await expect(docDaoWithPostSync.postSync(mockSequelize, {})).resolves.toBeUndefined();
		});
	});
});
