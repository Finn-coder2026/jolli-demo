import type { DocDao } from "../dao/DocDao";
import { mockDocDao } from "../dao/DocDao.mock";
import { mockDoc } from "../model/Doc.mock";
import {
	computeServerPathFromParent,
	createFolderResolutionService,
	FolderResolutionService,
} from "./FolderResolutionService";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the logger
vi.mock("../util/Logger", () => ({
	getLog: () => ({
		debug: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	}),
}));

describe("FolderResolutionService", () => {
	let service: FolderResolutionService;
	let docDao: DocDao;

	beforeEach(() => {
		service = new FolderResolutionService();
		docDao = mockDocDao();
	});

	describe("extractFolderPath", () => {
		it("should extract folder path from nested file path", () => {
			const result = service.extractFolderPath("docs/guide/intro.md");
			expect(result).toBe("docs/guide");
		});

		it("should extract folder path from single level path", () => {
			const result = service.extractFolderPath("docs/intro.md");
			expect(result).toBe("docs");
		});

		it("should return empty string for root level file", () => {
			const result = service.extractFolderPath("intro.md");
			expect(result).toBe("");
		});

		it("should handle deeply nested paths", () => {
			const result = service.extractFolderPath("a/b/c/d/file.md");
			expect(result).toBe("a/b/c/d");
		});

		it("should handle empty string", () => {
			const result = service.extractFolderPath("");
			expect(result).toBe("");
		});
	});

	describe("resolveFolderHierarchy", () => {
		it("should return root level for file without folder path", async () => {
			const result = await service.resolveFolderHierarchy("intro.md", 1, docDao);

			expect(result).toEqual({
				spaceId: 1,
				parentId: undefined,
				folderPath: "",
			});
			expect(docDao.findFolderByName).not.toHaveBeenCalled();
		});

		it("should create single folder for single-level path", async () => {
			const folder = mockDoc({
				id: 10,
				spaceId: 1,
				docType: "folder",
				contentMetadata: { title: "docs" },
			});

			vi.mocked(docDao.findFolderByName).mockResolvedValue(undefined);
			vi.mocked(docDao.getMaxSortOrder).mockResolvedValue(0);
			vi.mocked(docDao.createDoc).mockResolvedValue(folder);

			const result = await service.resolveFolderHierarchy("docs/intro.md", 1, docDao);

			expect(result).toEqual({
				spaceId: 1,
				parentId: 10,
				folderPath: "docs",
			});
			expect(docDao.findFolderByName).toHaveBeenCalledWith(1, null, "docs");
			expect(docDao.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					docType: "folder",
					spaceId: 1,
					parentId: undefined,
					contentMetadata: { title: "docs" },
				}),
			);
		});

		it("should create nested folder hierarchy", async () => {
			const docsFolder = mockDoc({
				id: 10,
				spaceId: 1,
				docType: "folder",
				contentMetadata: { title: "docs" },
			});
			const guideFolder = mockDoc({
				id: 20,
				spaceId: 1,
				docType: "folder",
				parentId: 10,
				contentMetadata: { title: "guide" },
			});

			vi.mocked(docDao.findFolderByName).mockResolvedValue(undefined);
			vi.mocked(docDao.getMaxSortOrder).mockResolvedValue(0);
			vi.mocked(docDao.createDoc).mockResolvedValueOnce(docsFolder).mockResolvedValueOnce(guideFolder);

			const result = await service.resolveFolderHierarchy("docs/guide/intro.md", 1, docDao);

			expect(result).toEqual({
				spaceId: 1,
				parentId: 20,
				folderPath: "docs/guide",
			});

			// First folder (docs) at root level
			expect(docDao.findFolderByName).toHaveBeenNthCalledWith(1, 1, null, "docs");
			expect(docDao.createDoc).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					docType: "folder",
					spaceId: 1,
					parentId: undefined,
					contentMetadata: { title: "docs" },
				}),
			);

			// Second folder (guide) under docs
			expect(docDao.findFolderByName).toHaveBeenNthCalledWith(2, 1, 10, "guide");
			expect(docDao.createDoc).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					docType: "folder",
					spaceId: 1,
					parentId: 10,
					contentMetadata: { title: "guide" },
				}),
			);
		});

		it("should reuse existing folders", async () => {
			const existingFolder = mockDoc({
				id: 10,
				spaceId: 1,
				docType: "folder",
				contentMetadata: { title: "docs" },
			});

			vi.mocked(docDao.findFolderByName).mockResolvedValue(existingFolder);

			const result = await service.resolveFolderHierarchy("docs/intro.md", 1, docDao);

			expect(result).toEqual({
				spaceId: 1,
				parentId: 10,
				folderPath: "docs",
			});
			expect(docDao.findFolderByName).toHaveBeenCalledWith(1, null, "docs");
			expect(docDao.createDoc).not.toHaveBeenCalled();
		});

		it("should use cache for repeated folder lookups", async () => {
			const folder = mockDoc({
				id: 10,
				spaceId: 1,
				docType: "folder",
				contentMetadata: { title: "docs" },
			});

			vi.mocked(docDao.findFolderByName).mockResolvedValue(folder);

			// First call
			await service.resolveFolderHierarchy("docs/file1.md", 1, docDao);
			// Second call with same folder
			await service.resolveFolderHierarchy("docs/file2.md", 1, docDao);

			// findFolderByName should only be called once due to caching
			expect(docDao.findFolderByName).toHaveBeenCalledTimes(1);
		});

		it("should calculate correct sortOrder for new folders", async () => {
			const folder = mockDoc({
				id: 10,
				spaceId: 1,
				docType: "folder",
				contentMetadata: { title: "docs" },
				sortOrder: 3,
			});

			vi.mocked(docDao.findFolderByName).mockResolvedValue(undefined);
			vi.mocked(docDao.getMaxSortOrder).mockResolvedValue(2);
			vi.mocked(docDao.createDoc).mockResolvedValue(folder);

			await service.resolveFolderHierarchy("docs/intro.md", 1, docDao);

			expect(docDao.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					sortOrder: 3, // maxSortOrder (2) + 1
				}),
			);
		});
	});

	describe("clearCache", () => {
		it("should clear folder cache", async () => {
			const folder = mockDoc({
				id: 10,
				spaceId: 1,
				docType: "folder",
				contentMetadata: { title: "docs" },
			});

			vi.mocked(docDao.findFolderByName).mockResolvedValue(folder);

			// First call - populates cache
			await service.resolveFolderHierarchy("docs/file1.md", 1, docDao);
			expect(docDao.findFolderByName).toHaveBeenCalledTimes(1);

			// Clear cache
			service.clearCache();

			// Second call - should hit DB again
			await service.resolveFolderHierarchy("docs/file2.md", 1, docDao);
			expect(docDao.findFolderByName).toHaveBeenCalledTimes(2);
		});
	});

	describe("createFolderResolutionService", () => {
		it("should create a new FolderResolutionService instance", () => {
			const newService = createFolderResolutionService();
			expect(newService).toBeInstanceOf(FolderResolutionService);
		});
	});
});

describe("computeServerPathFromParent", () => {
	let docDao: DocDao;

	beforeEach(() => {
		docDao = mockDocDao();
	});

	it("should return filename for root level file (undefined parentId)", async () => {
		const result = await computeServerPathFromParent(undefined, "intro.md", docDao);

		expect(result).toBe("intro.md");
		expect(docDao.readDocById).not.toHaveBeenCalled();
	});

	it("should compute path for single folder level", async () => {
		const docsFolder = mockDoc({
			id: 10,
			docType: "folder",
			parentId: undefined,
			contentMetadata: { title: "docs" },
		});

		vi.mocked(docDao.readDocById).mockResolvedValue(docsFolder);

		const result = await computeServerPathFromParent(10, "intro.md", docDao);

		expect(result).toBe("docs/intro.md");
		expect(docDao.readDocById).toHaveBeenCalledWith(10);
	});

	it("should compute path for nested folder hierarchy", async () => {
		const docsFolder = mockDoc({
			id: 10,
			docType: "folder",
			parentId: undefined,
			contentMetadata: { title: "docs" },
		});
		const guideFolder = mockDoc({
			id: 20,
			docType: "folder",
			parentId: 10,
			contentMetadata: { title: "guide" },
		});

		vi.mocked(docDao.readDocById).mockImplementation((id: number) => {
			if (id === 20) {
				return Promise.resolve(guideFolder);
			}
			if (id === 10) {
				return Promise.resolve(docsFolder);
			}
			return Promise.resolve(undefined);
		});

		const result = await computeServerPathFromParent(20, "intro.md", docDao);

		expect(result).toBe("docs/guide/intro.md");
		expect(docDao.readDocById).toHaveBeenCalledTimes(2);
	});

	it("should compute path for deeply nested hierarchy", async () => {
		const aFolder = mockDoc({
			id: 1,
			docType: "folder",
			parentId: undefined,
			contentMetadata: { title: "a" },
		});
		const bFolder = mockDoc({
			id: 2,
			docType: "folder",
			parentId: 1,
			contentMetadata: { title: "b" },
		});
		const cFolder = mockDoc({
			id: 3,
			docType: "folder",
			parentId: 2,
			contentMetadata: { title: "c" },
		});

		vi.mocked(docDao.readDocById).mockImplementation((id: number) => {
			if (id === 3) {
				return Promise.resolve(cFolder);
			}
			if (id === 2) {
				return Promise.resolve(bFolder);
			}
			if (id === 1) {
				return Promise.resolve(aFolder);
			}
			return Promise.resolve(undefined);
		});

		const result = await computeServerPathFromParent(3, "file.md", docDao);

		expect(result).toBe("a/b/c/file.md");
	});

	it("should stop walking when parent is not found", async () => {
		vi.mocked(docDao.readDocById).mockResolvedValue(undefined);

		const result = await computeServerPathFromParent(999, "intro.md", docDao);

		expect(result).toBe("intro.md");
	});

	it("should stop walking when parent is not a folder", async () => {
		const document = mockDoc({
			id: 10,
			docType: "document", // Not a folder
			parentId: undefined,
			contentMetadata: { title: "Some Doc" },
		});

		vi.mocked(docDao.readDocById).mockResolvedValue(document);

		const result = await computeServerPathFromParent(10, "intro.md", docDao);

		expect(result).toBe("intro.md");
	});

	it("should handle folder without title in contentMetadata", async () => {
		const folderWithoutTitle = mockDoc({
			id: 10,
			docType: "folder",
			parentId: undefined,
			contentMetadata: {}, // No title
		});

		vi.mocked(docDao.readDocById).mockResolvedValue(folderWithoutTitle);

		const result = await computeServerPathFromParent(10, "intro.md", docDao);

		// Should still return filename since no folder names collected
		expect(result).toBe("intro.md");
	});
});
