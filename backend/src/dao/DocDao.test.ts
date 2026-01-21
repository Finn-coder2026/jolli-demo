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
		it("should create a doc with version 1 and calculated path", async () => {
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
				path: "/test-slug",
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			const result = await docDao.createDoc(newDoc);

			// Empty path is falsy, so it gets calculated as /{slug}
			expect(mockDocs.create).toHaveBeenCalledWith({
				...newDoc,
				path: "/test-slug",
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
				path: "/test-slug",
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
				jrn: "jrn:/global:docs:document/test-article-12345",
				slug: "test-article-12345",
				path: "/test-article-12345",
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			await docDao.createDoc(newDoc);

			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					slug: expect.stringMatching(/^test-article-\d+$/),
					jrn: expect.stringMatching(/^jrn:\/global:docs:document\/test-article-\d+$/),
					path: expect.stringMatching(/^\/test-article-\d+$/),
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
				jrn: "jrn:/global:docs:folder/my-folder-12345",
				slug: "my-folder-12345",
				path: "/my-folder-12345",
				docType: "folder",
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			await docDao.createDoc(newDoc);

			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					slug: expect.stringMatching(/^my-folder-\d+$/),
					jrn: expect.stringMatching(/^jrn:\/global:docs:folder\/my-folder-\d+$/),
					path: expect.stringMatching(/^\/my-folder-\d+$/),
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
				jrn: "jrn:/global:docs:document/untitled-12345",
				slug: "untitled-12345",
				path: "/untitled-12345",
				version: 1,
			});

			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			await docDao.createDoc(newDoc);

			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					slug: expect.stringMatching(/^untitled-\d+$/),
					jrn: expect.stringMatching(/^jrn:\/global:docs:document\/untitled-\d+$/),
					path: expect.stringMatching(/^\/untitled-\d+$/),
				}),
			);
		});

		it("should calculate path based on parent when parentId is provided", async () => {
			const parentDoc = mockDoc({
				id: 1,
				slug: "parent-folder",
				path: "/parent-folder",
				docType: "folder",
			});

			const newDoc: NewDoc = {
				updatedBy: "user:789",
				source: undefined,
				sourceMetadata: undefined,
				content: "test content",
				contentType: "text/markdown",
				contentMetadata: { title: "Child Doc" },
				spaceId: 1,
				parentId: 1,
				docType: "document",
				sortOrder: 0,
				createdBy: "user:789",
			};

			const createdDoc = mockDoc({
				id: 2,
				jrn: "jrn:/global:docs:document/child-doc-12345",
				slug: "child-doc-12345",
				path: "/parent-folder/child-doc-12345",
				version: 1,
			});

			vi.mocked(mockDocs.findByPk).mockResolvedValue({ path: parentDoc.path } as never);
			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			await docDao.createDoc(newDoc);

			expect(mockDocs.findByPk).toHaveBeenCalledWith(1);
			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					path: expect.stringMatching(/^\/parent-folder\/child-doc-\d+$/),
				}),
			);
		});

		it("should calculate root path when parent does not exist", async () => {
			const newDoc: NewDoc = {
				updatedBy: "user:789",
				source: undefined,
				sourceMetadata: undefined,
				content: "test content",
				contentType: "text/markdown",
				contentMetadata: { title: "Orphan Doc" },
				spaceId: 1,
				parentId: 999, // Non-existent parent
				docType: "document",
				sortOrder: 0,
				createdBy: "user:789",
			};

			const createdDoc = mockDoc({
				id: 2,
				jrn: "jrn:/global:docs:document/orphan-doc-12345",
				slug: "orphan-doc-12345",
				path: "/orphan-doc-12345",
				version: 1,
			});

			vi.mocked(mockDocs.findByPk).mockResolvedValue(null);
			vi.mocked(mockDocs.create).mockResolvedValue(createdDoc as never);

			await docDao.createDoc(newDoc);

			expect(mockDocs.findByPk).toHaveBeenCalledWith(999);
			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					path: expect.stringMatching(/^\/orphan-doc-\d+$/),
				}),
			);
		});

		it("should use provided path when explicitly set", async () => {
			const newDoc: NewDoc = {
				jrn: "jrn:doc:123",
				slug: "test-slug",
				path: "/custom/path/test-slug",
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

			expect(mockDocs.create).toHaveBeenCalledWith(
				expect.objectContaining({
					path: "/custom/path/test-slug",
				}),
			);
			expect(result).toEqual(createdDoc);
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

			expect(mockDocs.findAll).toHaveBeenCalledWith({
				order: [["updatedAt", "DESC"]],
			});
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

			expect(mockDocs.findAll).toHaveBeenCalledWith({
				order: [["updatedAt", "DESC"]],
			});
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
		it("should reset explicitlyDeleted=false and update path when restoring root-level doc", async () => {
			const deletedDoc = mockDoc({
				id: 1,
				slug: "test-doc",
				path: "/test-doc",
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: undefined,
				docType: "document",
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(deletedDoc),
			};

			vi.mocked(mockDocs.findByPk).mockResolvedValue(mockDocInstance as never);

			await docDao.restore(1);

			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					path: "/test-doc",
					parentId: null,
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

		it("should update path based on parent's current path when parent exists", async () => {
			const deletedDoc = mockDoc({
				id: 2,
				slug: "child-doc",
				path: "/old-parent/child-doc", // old path
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: 1,
				docType: "document",
			});

			const parentDoc = mockDoc({
				id: 1,
				slug: "parent-folder",
				path: "/new-location/parent-folder", // parent's path has changed
				deletedAt: undefined,
				docType: "folder",
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(deletedDoc),
			};

			const mockParentInstance = {
				get: vi.fn().mockReturnValue(parentDoc),
			};

			// First call returns the doc to restore, second call returns the parent
			vi.mocked(mockDocs.findByPk)
				.mockResolvedValueOnce(mockDocInstance as never)
				.mockResolvedValueOnce(mockParentInstance as never);

			await docDao.restore(2);

			// Should update path based on parent's current path
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					path: "/new-location/parent-folder/child-doc",
					parentId: 1,
				}),
				{ where: { id: 2 } },
			);
		});

		it("should move to root and update path when parent is deleted", async () => {
			const deletedDoc = mockDoc({
				id: 2,
				slug: "child-doc",
				path: "/deleted-parent/child-doc",
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: 1,
				docType: "document",
			});

			const deletedParent = mockDoc({
				id: 1,
				slug: "deleted-parent",
				path: "/deleted-parent",
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

			await docDao.restore(2);

			// Should move to root and update path
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					path: "/child-doc",
					parentId: null,
				}),
				{ where: { id: 2 } },
			);
		});

		it("should move to root and update path when parent does not exist", async () => {
			const deletedDoc = mockDoc({
				id: 2,
				slug: "orphan-doc",
				path: "/nonexistent-parent/orphan-doc",
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: 999, // parent that doesn't exist
				docType: "document",
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(deletedDoc),
			};

			// First call returns the doc to restore, second call returns null (parent not found)
			vi.mocked(mockDocs.findByPk)
				.mockResolvedValueOnce(mockDocInstance as never)
				.mockResolvedValueOnce(null as never);

			await docDao.restore(2);

			// Should move to root and update path
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					path: "/orphan-doc",
					parentId: null,
				}),
				{ where: { id: 2 } },
			);
		});

		it("should recursively restore and update paths for folder descendants", async () => {
			const deletedFolder = mockDoc({
				id: 1,
				slug: "my-folder",
				path: "/my-folder",
				deletedAt: new Date(),
				explicitlyDeleted: true,
				parentId: undefined,
				docType: "folder",
			});

			const childDoc = mockDoc({
				id: 2,
				slug: "child-doc",
				path: "/my-folder/child-doc",
				deletedAt: new Date(),
				explicitlyDeleted: false, // cascade deleted
				parentId: 1,
				docType: "document",
			});

			const mockFolderInstance = {
				get: vi.fn().mockReturnValue(deletedFolder),
			};

			const mockChildInstance = {
				get: vi.fn().mockReturnValue(childDoc),
			};

			// First findByPk returns the folder to restore
			vi.mocked(mockDocs.findByPk).mockResolvedValue(mockFolderInstance as never);

			// findAll returns cascade-deleted children
			vi.mocked(mockDocs.findAll)
				.mockResolvedValueOnce([mockChildInstance] as never)
				.mockResolvedValue([]);

			await docDao.restore(1);

			// Should restore the folder with updated path
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					explicitlyDeleted: false,
					path: "/my-folder",
				}),
				{ where: { id: 1 } },
			);

			// Should restore and update path for child
			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					deletedAt: null,
					path: "/my-folder/child-doc",
				}),
				{ where: { id: 2 } },
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

	describe("renameDoc", () => {
		it("should update document title and increment version", async () => {
			const existingDoc = mockDoc({
				id: 1,
				version: 1,
				contentMetadata: { title: "Old Title" },
			});

			const updatedDoc = mockDoc({
				id: 1,
				version: 2,
				contentMetadata: { title: "New Title" },
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(existingDoc),
			};

			const mockUpdatedDocInstance = {
				get: vi.fn().mockReturnValue(updatedDoc),
			};

			// First call returns existing doc, second call returns updated doc
			vi.mocked(mockDocs.findByPk)
				.mockResolvedValueOnce(mockDocInstance as never)
				.mockResolvedValueOnce(mockUpdatedDocInstance as never);

			const result = await docDao.renameDoc(1, "New Title");

			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					contentMetadata: { title: "New Title" },
					version: 2,
				}),
				{ where: { id: 1 } },
			);
			expect(result).toEqual(updatedDoc);
		});

		it("should return undefined if document not found", async () => {
			vi.mocked(mockDocs.findByPk).mockResolvedValue(null);

			const result = await docDao.renameDoc(999, "New Title");

			expect(result).toBeUndefined();
			expect(mockDocs.update).not.toHaveBeenCalled();
		});

		it("should preserve existing contentMetadata fields", async () => {
			const existingDoc = mockDoc({
				id: 1,
				version: 1,
				contentMetadata: { title: "Old Title", sourceName: "existing-source" },
			});

			const mockDocInstance = {
				get: vi.fn().mockReturnValue(existingDoc),
			};

			vi.mocked(mockDocs.findByPk).mockResolvedValue(mockDocInstance as never);

			await docDao.renameDoc(1, "New Title");

			expect(mockDocs.update).toHaveBeenCalledWith(
				expect.objectContaining({
					contentMetadata: { title: "New Title", sourceName: "existing-source" },
				}),
				{ where: { id: 1 } },
			);
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
