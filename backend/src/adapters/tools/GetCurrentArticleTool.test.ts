import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { DocDraft } from "../../model/DocDraft";
import { createGetCurrentArticleToolDefinition, executeGetCurrentArticleTool } from "./GetCurrentArticleTool";
import { describe, expect, it } from "vitest";

describe("GetCurrentArticleTool", () => {
	describe("createGetCurrentArticleToolDefinition", () => {
		it("should create tool definition with correct structure", () => {
			const draftId = 123;
			const toolDef = createGetCurrentArticleToolDefinition(draftId);

			expect(toolDef.name).toBe("get_current_article");
			expect(toolDef.description).toContain("Retrieves the current full content");
			expect(toolDef.description).toContain(`Draft ID: ${draftId}`);
			expect(toolDef.parameters.type).toBe("object");
			expect(toolDef.parameters.properties).toEqual({});
			expect(toolDef.parameters.required).toEqual([]);
		});

		it("should create tool definition with article ID", () => {
			const articleId = "jrn:article:123";
			const toolDef = createGetCurrentArticleToolDefinition(undefined, articleId);

			expect(toolDef.name).toBe("get_current_article");
			expect(toolDef.description).toContain(`Article ID: ${articleId}`);
		});

		it("should create tool definition with no ID bound", () => {
			const toolDef = createGetCurrentArticleToolDefinition();

			expect(toolDef.name).toBe("get_current_article");
			expect(toolDef.description).toContain("No ID bound");
		});
	});

	describe("executeGetCurrentArticleTool", () => {
		it("should retrieve current article content", async () => {
			const draftId = 456;
			const mockContent = `# Introduction

This is the introduction section.

## Section 1

Content of section 1.

## Section 2

Content of section 2.`;

			const mockDraft: DocDraft = {
				id: draftId,
				docId: 1,
				title: "Test Article",
				content: mockContent,
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: new Date(),
				contentLastEditedBy: 1,
				contentMetadata: {},
				isShared: false,
				sharedAt: null,
				sharedBy: null,
				createdByAgent: false,
			};

			const mockDocDraftDao: DocDraftDao = {
				getDocDraft: (id: number) => {
					if (id === draftId) {
						return Promise.resolve(mockDraft);
					}
					return Promise.resolve(undefined);
				},
			} as unknown as DocDraftDao;

			const result = await executeGetCurrentArticleTool(draftId, undefined, mockDocDraftDao);

			expect(result).toContain("CURRENT ARTICLE CONTENT:");
			expect(result).toContain(mockContent);
			expect(result).toContain(`${mockContent.length} characters`);
		});

		it("should handle non-existent draft", async () => {
			const draftId = 999;

			const mockDocDraftDao: DocDraftDao = {
				getDocDraft: () => Promise.resolve(undefined),
			} as unknown as DocDraftDao;

			const result = await executeGetCurrentArticleTool(draftId, undefined, mockDocDraftDao);

			expect(result).toContain(`Draft ${draftId} not found`);
		});

		it("should handle empty article content", async () => {
			const draftId = 789;
			const mockContent = "";

			const mockDraft: DocDraft = {
				id: draftId,
				docId: 1,
				title: "Empty Article",
				content: mockContent,
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: new Date(),
				contentLastEditedBy: 1,
				contentMetadata: {},
				isShared: false,
				sharedAt: null,
				sharedBy: null,
				createdByAgent: false,
			};

			const mockDocDraftDao: DocDraftDao = {
				getDocDraft: (id: number) => {
					if (id === draftId) {
						return Promise.resolve(mockDraft);
					}
					return Promise.resolve(undefined);
				},
			} as unknown as DocDraftDao;

			const result = await executeGetCurrentArticleTool(draftId, undefined, mockDocDraftDao);

			expect(result).toContain("CURRENT ARTICLE CONTENT:");
			expect(result).toContain("0 characters");
		});

		it("should handle large article content", async () => {
			const draftId = 555;
			const mockContent = `# Long Article\n\n${"Lorem ipsum ".repeat(1000)}`;

			const mockDraft: DocDraft = {
				id: draftId,
				docId: 1,
				title: "Large Article",
				content: mockContent,
				contentType: "text/markdown",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: new Date(),
				contentLastEditedBy: 1,
				contentMetadata: {},
				isShared: false,
				sharedAt: null,
				sharedBy: null,
				createdByAgent: false,
			};

			const mockDocDraftDao: DocDraftDao = {
				getDocDraft: (id: number) => {
					if (id === draftId) {
						return Promise.resolve(mockDraft);
					}
					return Promise.resolve(undefined);
				},
			} as unknown as DocDraftDao;

			const result = await executeGetCurrentArticleTool(draftId, undefined, mockDocDraftDao);

			expect(result).toContain("CURRENT ARTICLE CONTENT:");
			expect(result).toContain(mockContent);
			expect(result).toContain(`${mockContent.length} characters`);
		});

		it("returns error when neither draftId nor articleId provided", async () => {
			const mockDocDraftDao: DocDraftDao = {} as unknown as DocDraftDao;

			const result = await executeGetCurrentArticleTool(undefined, undefined, mockDocDraftDao);

			expect(result).toBe("Either draftId or articleId must be provided");
		});

		it("returns error when docDao is missing for article operations", async () => {
			const mockDocDraftDao: DocDraftDao = {} as unknown as DocDraftDao;

			const result = await executeGetCurrentArticleTool(undefined, "jrn:article:123", mockDocDraftDao);

			expect(result).toBe("DocDao is required for article operations");
		});

		it("returns error when article not found", async () => {
			const mockDocDraftDao: DocDraftDao = {} as unknown as DocDraftDao;
			const mockDocDao: DocDao = {
				readDoc: () => Promise.resolve(undefined),
			} as unknown as DocDao;

			const result = await executeGetCurrentArticleTool(
				undefined,
				"jrn:article:999",
				mockDocDraftDao,
				mockDocDao,
			);

			expect(result).toBe("Article jrn:article:999 not found");
		});

		it("successfully retrieves article content", async () => {
			const articleId = "jrn:article:123";
			const mockContent = "# Article Title\n\nArticle content here.";

			const mockDocDraftDao: DocDraftDao = {} as unknown as DocDraftDao;
			const mockDocDao: DocDao = {
				readDoc: (jrn: string) => {
					if (jrn === articleId) {
						return Promise.resolve({
							jrn: articleId,
							title: "Test Article",
							content: mockContent,
							version: 1,
						});
					}
					return Promise.resolve(undefined);
				},
			} as unknown as DocDao;

			const result = await executeGetCurrentArticleTool(undefined, articleId, mockDocDraftDao, mockDocDao);

			expect(result).toContain("CURRENT ARTICLE CONTENT:");
			expect(result).toContain(mockContent);
			expect(result).toContain(`${mockContent.length} characters`);
		});
	});
});
