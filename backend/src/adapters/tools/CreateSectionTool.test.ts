import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../../dao/DocDraftSectionChangesDao";
import { createCreateSectionToolDefinition, executeCreateSectionTool } from "./CreateSectionTool";
import { describe, expect, it, vi } from "vitest";

describe("CreateSectionTool", () => {
	describe("createCreateSectionToolDefinition", () => {
		it("creates a tool definition with the draft ID", () => {
			const draftId = 123;
			const tool = createCreateSectionToolDefinition(draftId);

			expect(tool.name).toBe("create_section");
			expect(tool.description).toContain(`Draft ID: ${draftId}`);
			expect(tool.parameters).toEqual({
				type: "object",
				properties: {
					sectionTitle: {
						type: "string",
						description: "The title for the new section (will become a heading)",
					},
					content: {
						type: "string",
						description:
							"The markdown content for the new section (without the heading - that's added automatically)",
					},
					insertAfter: {
						type: "string",
						description:
							"The exact title of the section to insert after (case-sensitive). To append at the end, use the title of the last section in the article. Use null to insert at the very beginning (before first heading).",
					},
				},
				required: ["sectionTitle", "content", "insertAfter"],
			});
		});
	});

	describe("executeCreateSectionTool", () => {
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
			getAllContent: vi.fn(),
		});

		it("returns error if draft not found", async () => {
			const dao = mockDocDraftDao();
			vi.mocked(dao.getDocDraft).mockResolvedValue(undefined);

			const result = await executeCreateSectionTool(
				999,
				undefined,
				{ sectionTitle: "New Section", content: "Content here", insertAfter: "Introduction" },
				dao,
				1,
			);

			expect(result).toBe("Draft 999 not found");
		});

		it("returns error if insertAfter section not found", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Article Title\n\n## Introduction\n\nIntro content here.";

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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "New Section", content: "Content here", insertAfter: "Nonexistent Section" },
				dao,
				1,
			);

			expect(result).toContain('Section "Nonexistent Section" not found');
			expect(result).toContain("Available sections:");
		});

		it("returns error if section with same title already exists", async () => {
			const dao = mockDocDraftDao();
			const originalContent =
				"# Article Title\n\n## Introduction\n\nIntro content here.\n\n## Conclusion\n\nConclusion here.";

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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "Introduction", content: "New content", insertAfter: "Article Title" },
				dao,
				1,
			);

			expect(result).toBe('Section "Introduction" already exists. Use edit_section to modify it instead.');
		});

		it("successfully creates section after named section", async () => {
			const dao = mockDocDraftDao();
			const originalContent =
				"# Article Title\n\n## Introduction\n\nIntro content here.\n\n## Conclusion\n\nConclusion here.";

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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "Usage Examples", content: "Here are some examples...", insertAfter: "Introduction" },
				dao,
				1,
			);

			expect(result).toBe(
				'Section "Usage Examples" created successfully after "Introduction". The draft has been saved.',
			);
			expect(dao.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: expect.stringContaining("## Usage Examples"),
				}),
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("## Introduction");
			expect(updatedContent).toContain("## Usage Examples");
			expect(updatedContent).toContain("## Conclusion");

			// Verify order: Introduction, then Usage Examples, then Conclusion
			const introIndex = updatedContent?.indexOf("## Introduction") ?? -1;
			const usageIndex = updatedContent?.indexOf("## Usage Examples") ?? -1;
			const conclusionIndex = updatedContent?.indexOf("## Conclusion") ?? -1;
			expect(introIndex).toBeLessThan(usageIndex);
			expect(usageIndex).toBeLessThan(conclusionIndex);
		});

		it("successfully creates section after preamble (insertAfter: null)", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "This is preamble content.\n\n## Introduction\n\nIntro content here.";

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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "Overview", content: "Overview content", insertAfter: "null" },
				dao,
				1,
			);

			expect(result).toBe('Section "Overview" created successfully after "null". The draft has been saved.');
			expect(dao.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: expect.stringContaining("## Overview"),
				}),
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("This is preamble content.");
			expect(updatedContent).toContain("## Overview");
			expect(updatedContent).toContain("## Introduction");

			// Verify order: preamble, then Overview, then Introduction
			const preambleIndex = updatedContent?.indexOf("This is preamble content.") ?? -1;
			const overviewIndex = updatedContent?.indexOf("## Overview") ?? -1;
			const introIndex = updatedContent?.indexOf("## Introduction") ?? -1;
			expect(preambleIndex).toBeLessThan(overviewIndex);
			expect(overviewIndex).toBeLessThan(introIndex);
		});

		it("preserves heading level from target section", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Article Title\n\n### Deep Section\n\nDeep content here.";

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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "Another Deep Section", content: "More deep content", insertAfter: "Deep Section" },
				dao,
				1,
			);

			expect(result).toBe(
				'Section "Another Deep Section" created successfully after "Deep Section". The draft has been saved.',
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Should use ### (same as Deep Section)
			expect(updatedContent).toContain("### Another Deep Section");
		});

		it("handles multiple sections correctly", async () => {
			const dao = mockDocDraftDao();
			const originalContent = `# Article

## Section 1

Content 1

## Section 2

Content 2

## Section 3

Content 3`;

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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "New Section", content: "New content", insertAfter: "Section 2" },
				dao,
				1,
			);

			expect(result).toBe(
				'Section "New Section" created successfully after "Section 2". The draft has been saved.',
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("## Section 1");
			expect(updatedContent).toContain("## Section 2");
			expect(updatedContent).toContain("## New Section");
			expect(updatedContent).toContain("## Section 3");

			// Verify order
			const section1Index = updatedContent?.indexOf("## Section 1") ?? -1;
			const section2Index = updatedContent?.indexOf("## Section 2") ?? -1;
			const newSectionIndex = updatedContent?.indexOf("## New Section") ?? -1;
			const section3Index = updatedContent?.indexOf("## Section 3") ?? -1;

			expect(section1Index).toBeLessThan(section2Index);
			expect(section2Index).toBeLessThan(newSectionIndex);
			expect(newSectionIndex).toBeLessThan(section3Index);
		});

		it("handles empty content", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Article\n\n## Introduction\n\nIntro here.";

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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "Empty Section", content: "", insertAfter: "Introduction" },
				dao,
				1,
			);

			expect(result).toBe(
				'Section "Empty Section" created successfully after "Introduction". The draft has been saved.',
			);
			expect(dao.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: expect.stringContaining("## Empty Section"),
				}),
			);
		});

		it("uses default heading level when section heading has special characters", async () => {
			const dao = mockDocDraftDao();
			// Content with section title containing regex special characters
			// This triggers the fallback branches at lines 118 and 132
			const originalContent = "Preamble\n\n## Section (with parens)\n\nSection content";

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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{
					sectionTitle: "New Section",
					content: "New content",
					insertAfter: "Section (with parens)",
				},
				dao,
				1,
			);

			expect(result).toContain("created successfully");

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Should use default ## heading level when regex pattern doesn't match
			expect(updatedContent).toContain("## New Section");
		});

		it("returns error when neither draftId nor articleId provided", async () => {
			const dao = mockDocDraftDao();
			const result = await executeCreateSectionTool(
				undefined,
				undefined,
				{ sectionTitle: "New Section", content: "Content", insertAfter: "Introduction" },
				dao,
				1,
			);

			expect(result).toBe("Either draftId or articleId must be provided");
		});

		it("returns error when docDao is missing for article operations", async () => {
			const dao = mockDocDraftDao();
			const result = await executeCreateSectionTool(
				undefined,
				"jrn:article:123",
				{ sectionTitle: "New Section", content: "Content", insertAfter: "Introduction" },
				dao,
				1,
			);

			expect(result).toBe("DocDao is required for article operations");
		});

		it("returns error when article not found", async () => {
			const dao = mockDocDraftDao();
			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue(undefined),
			} as unknown as DocDao;

			const result = await executeCreateSectionTool(
				undefined,
				"jrn:article:999",
				{ sectionTitle: "New Section", content: "Content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Article jrn:article:999 not found");
		});

		it("successfully creates section in article", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Conclusion\n\nConclusion content";

			const mockDocDao = {
				readDoc: vi
					.fn()
					.mockResolvedValueOnce({
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					})
					.mockResolvedValueOnce({
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					}),
				updateDoc: vi.fn().mockResolvedValue({
					jrn: articleId,
					title: "Test Article",
					content: "updated content",
					version: 2,
				}),
			} as unknown as DocDao;

			const result = await executeCreateSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage", content: "Usage content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe(
				'Section "Usage" created successfully after "Introduction". The article has been saved.',
			);
			expect(mockDocDao.updateDoc).toHaveBeenCalled();
		});

		it("returns error when article update fails", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content";

			const mockDocDao = {
				readDoc: vi
					.fn()
					.mockResolvedValueOnce({
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					})
					.mockResolvedValueOnce({
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					}),
				updateDoc: vi.fn().mockResolvedValue(undefined),
			} as unknown as DocDao;

			const result = await executeCreateSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage", content: "Usage content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Failed to update article jrn:article:123");
		});

		it("returns error when article not found on save", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content";

			const mockDocDao = {
				readDoc: vi
					.fn()
					.mockResolvedValueOnce({
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					})
					.mockResolvedValueOnce(undefined),
			} as unknown as DocDao;

			const result = await executeCreateSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage", content: "Usage content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Article jrn:article:123 not found");
		});

		it("creates suggestion when docDraftSectionChangesDao is provided and draft has docId", async () => {
			const dao = mockDocDraftDao();
			const originalContent =
				"# Article Title\n\n## Introduction\n\nIntro content here.\n\n## Conclusion\n\nConclusion here.";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 42, // Has docId - triggers suggestion mode
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

			const mockSectionChangesDao: DocDraftSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				getDocDraftSectionChanges: vi.fn(),
				listDocDraftSectionChanges: vi.fn(),
				findByDraftId: vi.fn(),
				updateDocDraftSectionChanges: vi.fn(),
				addComment: vi.fn(),
				addProposedChange: vi.fn(),
				dismissDocDraftSectionChange: vi.fn(),
				deleteDocDraftSectionChanges: vi.fn(),
				deleteByDraftId: vi.fn(),
				deleteAllDocDraftSectionChanges: vi.fn(),
			};

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "Usage Examples", content: "Here are some examples...", insertAfter: "Introduction" },
				dao,
				1,
				undefined,
				mockSectionChangesDao,
			);

			expect(result).toContain("Suggested creating section");
			expect(result).toContain("Usage Examples");
			expect(result).toContain("Review and apply in the Section Changes panel");
			expect(mockSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalledWith(
				expect.objectContaining({
					draftId: 1,
					docId: 42,
					changeType: "insert-after",
					proposed: expect.arrayContaining([
						expect.objectContaining({
							for: "content",
							description: expect.stringContaining("Insert new section"),
						}),
					]),
				}),
			);
		});

		it("returns error when section not found in suggestion mode", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Article Title\n\n## Introduction\n\nIntro content here.";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 42, // Has docId - triggers suggestion mode
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

			const mockSectionChangesDao: DocDraftSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				getDocDraftSectionChanges: vi.fn(),
				listDocDraftSectionChanges: vi.fn(),
				findByDraftId: vi.fn(),
				updateDocDraftSectionChanges: vi.fn(),
				addComment: vi.fn(),
				addProposedChange: vi.fn(),
				dismissDocDraftSectionChange: vi.fn(),
				deleteDocDraftSectionChanges: vi.fn(),
				deleteByDraftId: vi.fn(),
				deleteAllDocDraftSectionChanges: vi.fn(),
			};

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "New Section", content: "Content", insertAfter: "Nonexistent" },
				dao,
				1,
				undefined,
				mockSectionChangesDao,
			);

			expect(result).toContain('Section "Nonexistent" not found');
			expect(result).toContain("Available sections:");
		});

		it("creates suggestion after preamble (insertAfter: null) in suggestion mode", async () => {
			const dao = mockDocDraftDao();
			// Content with preamble (no heading at start)
			const originalContent = "This is preamble content.\n\n## Introduction\n\nIntro content here.";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 42, // Has docId - triggers suggestion mode
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

			const mockSectionChangesDao: DocDraftSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				getDocDraftSectionChanges: vi.fn(),
				listDocDraftSectionChanges: vi.fn(),
				findByDraftId: vi.fn(),
				updateDocDraftSectionChanges: vi.fn(),
				addComment: vi.fn(),
				addProposedChange: vi.fn(),
				dismissDocDraftSectionChange: vi.fn(),
				deleteDocDraftSectionChanges: vi.fn(),
				deleteByDraftId: vi.fn(),
				deleteAllDocDraftSectionChanges: vi.fn(),
			};

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "Overview", content: "Overview content", insertAfter: "null" },
				dao,
				1,
				undefined,
				mockSectionChangesDao,
			);

			expect(result).toContain("Suggested creating section");
			expect(result).toContain("Overview");
			expect(mockSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalledWith(
				expect.objectContaining({
					changeType: "insert-after",
					proposed: expect.arrayContaining([
						expect.objectContaining({
							value: expect.stringContaining("## Overview"),
						}),
					]),
				}),
			);
		});

		it("preserves front matter with --- delimiters when creating section", async () => {
			const dao = mockDocDraftDao();
			const originalContent = `---
article_type: jolliscript
title: Test Article
---

## Introduction

Intro content here.`;

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: undefined,
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

			const result = await executeCreateSectionTool(
				1,
				undefined,
				{ sectionTitle: "New Section", content: "New content", insertAfter: "Introduction" },
				dao,
				1,
			);

			expect(result).toBe(
				'Section "New Section" created successfully after "Introduction". The draft has been saved.',
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Verify front matter is preserved with --- delimiters
			expect(updatedContent).toContain("---\narticle_type: jolliscript");
			expect(updatedContent).toContain("title: Test Article\n---");
			expect(updatedContent).toContain("## Introduction");
			expect(updatedContent).toContain("## New Section");
		});

		it("creates suggestion for article mode with existing draft", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Conclusion\n\nConclusion content";

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					id: 42,
					jrn: articleId,
					title: "Test Article",
					content: originalContent,
					version: 1,
					updatedBy: "user@example.com",
				}),
			} as unknown as DocDao;

			// findByDocId returns an existing draft
			vi.mocked(dao.findByDocId).mockResolvedValue([
				{
					id: 99,
					docId: 42,
					title: "Existing Draft",
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
				},
			]);

			const mockDocDraftSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				getDocDraftSectionChanges: vi.fn(),
				getDocDraftSectionChangesByDraftId: vi.fn(),
				deleteDocDraftSectionChanges: vi.fn(),
				updateDocDraftSectionChanges: vi.fn(),
			} as unknown as DocDraftSectionChangesDao;

			const result = await executeCreateSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage", content: "Usage content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
			);

			expect(result).toContain("Suggested creating section");
			expect(mockDocDraftSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalled();
		});

		it("creates suggestion for article mode by creating new draft", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Conclusion\n\nConclusion content";

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					id: 42,
					jrn: articleId,
					title: "Test Article",
					content: originalContent,
					contentMetadata: { title: "Test Article" },
					version: 1,
					updatedBy: "user@example.com",
				}),
			} as unknown as DocDao;

			// findByDocId returns no existing draft
			vi.mocked(dao.findByDocId).mockResolvedValue([]);

			// createDocDraft creates a new draft
			vi.mocked(dao.createDocDraft).mockResolvedValue({
				id: 100,
				docId: 42,
				title: "Test Article",
				content: originalContent,
				contentType: "text/markdown",
				createdBy: 5,
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

			const mockUserDao = {
				findByEmail: vi.fn().mockResolvedValue({
					id: 5,
					email: "user@example.com",
					externalId: "ext-123",
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
				findById: vi.fn(),
			};

			const mockDocDraftSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				getDocDraftSectionChanges: vi.fn(),
				getDocDraftSectionChangesByDraftId: vi.fn(),
				deleteDocDraftSectionChanges: vi.fn(),
				updateDocDraftSectionChanges: vi.fn(),
			} as unknown as DocDraftSectionChangesDao;

			const result = await executeCreateSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage", content: "Usage content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
				mockUserDao as never,
			);

			expect(result).toContain("Suggested creating section");
			expect(dao.createDocDraft).toHaveBeenCalledWith({
				docId: 42,
				title: "Test Article",
				content: originalContent,
				createdBy: 5,
			});
			expect(mockDocDraftSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalled();
		});

		it("uses Untitled as draft title when contentMetadata.title is missing and articleId has no path segments", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:/";
			const originalContent = "# Introduction\n\nIntro content";

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					id: 42,
					jrn: articleId,
					title: "Test Article",
					content: originalContent,
					contentMetadata: undefined,
					version: 1,
					updatedBy: "user@example.com",
				}),
			} as unknown as DocDao;

			vi.mocked(dao.findByDocId).mockResolvedValue([]);

			vi.mocked(dao.createDocDraft).mockResolvedValue({
				id: 100,
				docId: 42,
				title: "Untitled",
				content: originalContent,
				contentType: "text/markdown",
				createdBy: 5,
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

			const mockUserDao = {
				findByEmail: vi.fn().mockResolvedValue({
					id: 5,
					email: "user@example.com",
					externalId: "ext-123",
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
				findById: vi.fn(),
			};

			const mockDocDraftSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				getDocDraftSectionChanges: vi.fn(),
				getDocDraftSectionChangesByDraftId: vi.fn(),
				deleteDocDraftSectionChanges: vi.fn(),
				updateDocDraftSectionChanges: vi.fn(),
			} as unknown as DocDraftSectionChangesDao;

			await executeCreateSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage", content: "Usage content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
				mockUserDao as never,
			);

			expect(dao.createDocDraft).toHaveBeenCalledWith({
				docId: 42,
				title: "Untitled",
				content: originalContent,
				createdBy: 5,
			});
		});

		it("creates suggestion for article mode with numeric updatedBy", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:456";
			const originalContent = "# Introduction\n\nIntro content\n\n## Conclusion\n\nConclusion content";

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					id: 42,
					jrn: articleId,
					title: "Test Article",
					content: originalContent,
					contentMetadata: { title: "Test Article" },
					version: 1,
					updatedBy: "99",
				}),
			} as unknown as DocDao;

			// findByDocId returns no existing draft
			vi.mocked(dao.findByDocId).mockResolvedValue([]);

			// createDocDraft creates a new draft
			vi.mocked(dao.createDocDraft).mockResolvedValue({
				id: 100,
				docId: 42,
				title: "Test Article",
				content: originalContent,
				contentType: "text/markdown",
				createdBy: 99,
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

			const mockUserDao = {
				findByEmail: vi.fn(),
				findById: vi.fn().mockResolvedValue({
					id: 99,
					email: "numericuser@example.com",
					externalId: "ext-99",
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
			};

			const mockDocDraftSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				getDocDraftSectionChanges: vi.fn(),
				getDocDraftSectionChangesByDraftId: vi.fn(),
				deleteDocDraftSectionChanges: vi.fn(),
				updateDocDraftSectionChanges: vi.fn(),
			} as unknown as DocDraftSectionChangesDao;

			const result = await executeCreateSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage", content: "Usage content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
				mockUserDao as never,
			);

			expect(result).toContain("Suggested creating section");
			expect(mockUserDao.findById).toHaveBeenCalledWith(99);
			expect(mockUserDao.findByEmail).not.toHaveBeenCalled();
			expect(dao.createDocDraft).toHaveBeenCalledWith({
				docId: 42,
				title: "Test Article",
				content: originalContent,
				createdBy: 99,
			});
			expect(mockDocDraftSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalled();
		});

		it("falls back to direct edit when article owner cannot be found for draft creation", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Conclusion\n\nConclusion content";

			const mockDocDao = {
				readDoc: vi
					.fn()
					.mockResolvedValueOnce({
						id: 42,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
						updatedBy: "unknown@example.com",
					})
					.mockResolvedValueOnce({
						id: 42,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
						updatedBy: "unknown@example.com",
					}),
				updateDoc: vi.fn().mockResolvedValue({
					jrn: articleId,
					title: "Test Article",
					content: "updated content",
					version: 2,
				}),
			} as unknown as DocDao;

			// findByDocId returns no existing draft
			vi.mocked(dao.findByDocId).mockResolvedValue([]);

			// User not found
			const mockUserDao = {
				findByEmail: vi.fn().mockResolvedValue(undefined),
				findById: vi.fn(),
			};

			const mockDocDraftSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn(),
				getDocDraftSectionChanges: vi.fn(),
				getDocDraftSectionChangesByDraftId: vi.fn(),
				deleteDocDraftSectionChanges: vi.fn(),
				updateDocDraftSectionChanges: vi.fn(),
			} as unknown as DocDraftSectionChangesDao;

			const result = await executeCreateSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage", content: "Usage content", insertAfter: "Introduction" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
				mockUserDao as never,
			);

			// Should fall back to direct edit since draft couldn't be created
			expect(result).toBe(
				'Section "Usage" created successfully after "Introduction". The article has been saved.',
			);
			expect(mockDocDao.updateDoc).toHaveBeenCalled();
			// Suggestion mode was not used
			expect(mockDocDraftSectionChangesDao.createDocDraftSectionChanges).not.toHaveBeenCalled();
		});
	});
});
