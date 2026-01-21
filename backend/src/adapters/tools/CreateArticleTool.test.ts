import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import { createCreateArticleToolDefinition, executeCreateArticleTool } from "./CreateArticleTool";
import { describe, expect, it, vi } from "vitest";

describe("CreateArticleTool", () => {
	describe("createCreateArticleToolDefinition", () => {
		it("creates a tool definition with the draft ID", () => {
			const draftId = 123;
			const tool = createCreateArticleToolDefinition(draftId);

			expect(tool.name).toBe("create_article");
			expect(tool.description).toContain(`Draft ID: ${draftId}`);
			expect(tool.parameters).toEqual({
				type: "object",
				properties: {
					content: {
						type: "string",
						description:
							"The complete markdown content for the entire article, including all headings, sections, and text",
					},
				},
				required: ["content"],
			});
		});

		it("creates a tool definition with the article ID", () => {
			const articleId = "jrn:article:123";
			const tool = createCreateArticleToolDefinition(undefined, articleId);

			expect(tool.name).toBe("create_article");
			expect(tool.description).toContain(`Article ID: ${articleId}`);
		});

		it("creates a tool definition with no ID bound", () => {
			const tool = createCreateArticleToolDefinition();

			expect(tool.name).toBe("create_article");
			expect(tool.description).toContain("No ID bound");
		});
	});

	describe("executeCreateArticleTool", () => {
		const mockDocDraftDao = (): DocDraftDao => ({
			getDocDraft: vi.fn(),
			updateDocDraft: vi.fn(),
			createDocDraft: vi.fn(),
			deleteDocDraft: vi.fn(),
			deleteAllDocDrafts: vi.fn(),
			listDocDrafts: vi.fn(),
			listDocDraftsByUser: vi.fn(),
			findByDocId: vi.fn(),
			searchDocDraftsByTitle: vi.fn(),
			getDraftsWithPendingChanges: vi.fn(),
			listAccessibleDrafts: vi.fn(),
			findDraftsByExactTitle: vi.fn(),
			findDraftByDocId: vi.fn(),
			shareDraft: vi.fn(),
			listSharedDrafts: vi.fn(),
			countMyNewDrafts: vi.fn(),
			countMySharedNewDrafts: vi.fn(),
			countSharedWithMeDrafts: vi.fn(),
			countArticlesWithAgentSuggestions: vi.fn(),
		});

		it("returns error if draft not found", async () => {
			const dao = mockDocDraftDao();
			vi.mocked(dao.getDocDraft).mockResolvedValue(undefined);

			const result = await executeCreateArticleTool(999, undefined, { content: "New article content" }, dao, 1);

			expect(result).toBe("Draft 999 not found");
		});

		it("creates article successfully", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "Old article content";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 1,
				title: "Test Draft",
				content: originalContent,
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: null,
				contentLastEditedBy: null,
				contentMetadata: undefined,
				isShared: false,
				sharedAt: null,
				sharedBy: null,
				createdByAgent: false,
			});

			const newContent = "# New Article\n\nThis is a completely new article.";
			const result = await executeCreateArticleTool(1, undefined, { content: newContent }, dao, 1);

			expect(result).toBe("Article created successfully. The draft has been saved.");
			expect(dao.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: newContent,
				}),
			);
		});

		it("replaces entire article content", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Old Title\n\n## Section 1\n\nOld content here.";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 1,
				title: "Test Draft",
				content: originalContent,
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: null,
				contentLastEditedBy: null,
				contentMetadata: undefined,
				isShared: false,
				sharedAt: null,
				sharedBy: null,
				createdByAgent: false,
			});

			const newContent =
				"# Brand New Article\n\n## Introduction\n\nNew intro.\n\n## Conclusion\n\nNew conclusion.";
			await executeCreateArticleTool(1, undefined, { content: newContent }, dao, 1);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toBe(newContent);
			expect(updatedContent).not.toContain("Old Title");
			expect(updatedContent).not.toContain("Old content here");
		});

		it("handles empty content", async () => {
			const dao = mockDocDraftDao();

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 1,
				title: "Test Draft",
				content: "Some old content",
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: null,
				contentLastEditedBy: null,
				contentMetadata: undefined,
				isShared: false,
				sharedAt: null,
				sharedBy: null,
				createdByAgent: false,
			});

			const result = await executeCreateArticleTool(1, undefined, { content: "" }, dao, 1);

			expect(result).toBe("Article created successfully. The draft has been saved.");
			expect(dao.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: "",
				}),
			);
		});

		it("handles very long content", async () => {
			const dao = mockDocDraftDao();

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 1,
				title: "Test Draft",
				content: "Short content",
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: null,
				contentLastEditedBy: null,
				contentMetadata: undefined,
				isShared: false,
				sharedAt: null,
				sharedBy: null,
				createdByAgent: false,
			});

			const longContent = `# Long Article\n\n${"Lorem ipsum dolor sit amet. ".repeat(1000)}`;
			const result = await executeCreateArticleTool(1, undefined, { content: longContent }, dao, 1);

			expect(result).toBe("Article created successfully. The draft has been saved.");
			expect(dao.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: longContent,
				}),
			);
		});

		it("returns error when neither draftId nor articleId provided", async () => {
			const dao = mockDocDraftDao();
			const result = await executeCreateArticleTool(undefined, undefined, { content: "test" }, dao, 1);

			expect(result).toBe("Either draftId or articleId must be provided");
		});

		it("returns error when docDao is missing for article operations", async () => {
			const dao = mockDocDraftDao();
			const result = await executeCreateArticleTool(undefined, "jrn:article:123", { content: "test" }, dao, 1);

			expect(result).toBe("DocDao is required for article operations");
		});

		it("returns error when article not found", async () => {
			const dao = mockDocDraftDao();
			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue(undefined),
			} as unknown as DocDao;

			const result = await executeCreateArticleTool(
				undefined,
				"jrn:article:999",
				{ content: "test" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Article jrn:article:999 not found");
		});

		it("successfully creates article for articleId", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					jrn: articleId,
					title: "Test Article",
					content: "Old content",
					version: 1,
				}),
				updateDoc: vi.fn().mockResolvedValue({
					jrn: articleId,
					title: "Test Article",
					content: "New content",
					version: 2,
				}),
			} as unknown as DocDao;

			const result = await executeCreateArticleTool(
				undefined,
				articleId,
				{ content: "New content" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Article created successfully. The article has been saved.");
			expect(mockDocDao.updateDoc).toHaveBeenCalledWith({
				jrn: articleId,
				title: "Test Article",
				content: "New content",
				version: 2,
			});
		});

		it("returns error when article update fails", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					jrn: articleId,
					title: "Test Article",
					content: "Old content",
					version: 1,
				}),
				updateDoc: vi.fn().mockResolvedValue(undefined),
			} as unknown as DocDao;

			const result = await executeCreateArticleTool(
				undefined,
				articleId,
				{ content: "New content" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Failed to update article jrn:article:123");
		});
	});
});
