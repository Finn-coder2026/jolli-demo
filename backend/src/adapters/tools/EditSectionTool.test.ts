import type { ActiveUserDao } from "../../dao/ActiveUserDao";
import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../../dao/DocDraftSectionChangesDao";
import { createEditSectionToolDefinition, executeEditSectionTool } from "./EditSectionTool";
import { describe, expect, it, vi } from "vitest";

describe("EditSectionTool", () => {
	describe("createEditSectionToolDefinition", () => {
		it("creates a tool definition with the draft ID", () => {
			const draftId = 123;
			const tool = createEditSectionToolDefinition(draftId);

			expect(tool.name).toBe("edit_section");
			expect(tool.description).toContain(`Draft ID: ${draftId}`);
			expect(tool.parameters).toEqual({
				type: "object",
				properties: {
					sectionTitle: {
						type: "string",
						description:
							"The exact title of the section to edit (case-sensitive). Use null for the preamble (content before first heading).",
					},
					newContent: {
						type: "string",
						description:
							"The new markdown content for this section (without the heading - that's preserved automatically)",
					},
				},
				required: ["sectionTitle", "newContent"],
			});
		});
	});

	describe("executeEditSectionTool", () => {
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

			const result = await executeEditSectionTool(
				999,
				undefined,
				{ sectionTitle: "Introduction", newContent: "New intro" },
				dao,
				1,
			);

			expect(result).toBe("Draft 999 not found");
		});

		it("returns error if section not found", async () => {
			const dao = mockDocDraftDao();
			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 1,
				title: "Test Draft",
				content: "# Introduction\n\nSome intro text\n\n## Background\n\nSome background",
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

			const result = await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Nonexistent Section", newContent: "New content" },
				dao,
				1,
			);

			expect(result).toContain('Section "Nonexistent Section" not found');
			expect(result).toContain("Available sections:");
		});

		it("edits a section successfully", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Introduction\n\nOld intro text\n\n## Background\n\nSome background";

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

			const result = await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Introduction", newContent: "New intro text with more detail" },
				dao,
				1,
			);

			expect(result).toBe('Section "Introduction" updated successfully. The draft has been saved.');
			expect(dao.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: expect.stringContaining("New intro text with more detail"),
				}),
			);

			// Verify the full content structure is preserved
			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("# Introduction");
			expect(updatedContent).toContain("New intro text with more detail");
			expect(updatedContent).toContain("## Background");
			expect(updatedContent).toContain("Some background");
		});

		it("edits preamble (content before first heading)", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "Old preamble text\n\n# Introduction\n\nIntro text";

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

			const result = await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "null", newContent: "New preamble text" },
				dao,
				1,
			);

			expect(result).toBe('Section "null" updated successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("New preamble text");
			expect(updatedContent).toContain("# Introduction");
			expect(updatedContent).toContain("Intro text");
			expect(updatedContent).not.toContain("Old preamble text");
		});

		it("preserves heading levels when editing", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "### Deep Section\n\nOriginal content\n\n## Higher Section\n\nOther content";

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

			await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Deep Section", newContent: "New content" },
				dao,
				1,
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Should preserve ### heading level
			expect(updatedContent).toContain("### Deep Section");
			expect(updatedContent).toContain("New content");
			expect(updatedContent).toContain("## Higher Section");
		});

		it("handles multiple sections correctly", async () => {
			const dao = mockDocDraftDao();
			const originalContent =
				"# Introduction\n\nFirst intro\n\n## Section A\n\nOriginal section A content\n\n## Section B\n\nContent B";

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

			await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Section A", newContent: "Updated section A content" },
				dao,
				1,
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Should only update Section A, not Section B
			expect(updatedContent).toContain("Updated section A content");
			expect(updatedContent).toContain("Content B");
			expect(updatedContent).not.toContain("Original section A content");
		});

		it("uses default heading level when section heading has special characters", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "## Section $pecial\n\nOriginal content\n\n## Normal Section\n\nNormal content";

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

			await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Section $pecial", newContent: "Updated content" },
				dao,
				1,
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Should use default ## heading level when regex pattern doesn't match
			expect(updatedContent).toContain("## Section $pecial");
			expect(updatedContent).toContain("Updated content");
			expect(updatedContent).toContain("## Normal Section");
		});

		it("preserves sections with special characters when editing other sections", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "## Section (special)\n\nSpecial content\n\n## Normal Section\n\nNormal content";

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

			// Edit Normal Section, which should preserve Section (special) with default heading
			await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Normal Section", newContent: "Updated normal" },
				dao,
				1,
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Section (special) should be preserved with default ## when regex doesn't match
			expect(updatedContent).toContain("## Section (special)");
			expect(updatedContent).toContain("Special content");
			expect(updatedContent).toContain("## Normal Section");
			expect(updatedContent).toContain("Updated normal");
		});

		it("returns error when neither draftId nor articleId provided", async () => {
			const dao = mockDocDraftDao();
			const result = await executeEditSectionTool(
				undefined,
				undefined,
				{ sectionTitle: "Introduction", newContent: "New content" },
				dao,
				1,
			);

			expect(result).toBe("Either draftId or articleId must be provided");
		});

		it("returns error when docDao is missing for article operations", async () => {
			const dao = mockDocDraftDao();
			const result = await executeEditSectionTool(
				undefined,
				"jrn:article:123",
				{ sectionTitle: "Introduction", newContent: "New content" },
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

			const result = await executeEditSectionTool(
				undefined,
				"jrn:article:999",
				{ sectionTitle: "Introduction", newContent: "New content" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Article jrn:article:999 not found");
		});

		it("successfully edits section in article", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nOld intro\n\n## Conclusion\n\nConclusion content";

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
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

			const result = await executeEditSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Introduction", newContent: "New intro content" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe('Section "Introduction" updated successfully. The article has been saved.');
			expect(mockDocDao.updateDoc).toHaveBeenCalled();
		});

		it("returns error when article update fails", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nOld intro";

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					jrn: articleId,
					title: "Test Article",
					content: originalContent,
					version: 1,
				}),
				updateDoc: vi.fn().mockResolvedValue(undefined),
			} as unknown as DocDao;

			const result = await executeEditSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Introduction", newContent: "New intro" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Failed to update article jrn:article:123");
		});

		it("edits section with joi blocks in article", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = '## Section\n\n```joi\n{"test": "data"}\n```\n\nSection content';

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
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

			const result = await executeEditSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Section", newContent: "New section content" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe('Section "Section" updated successfully. The article has been saved.');
		});

		it("edits preamble with joi blocks", async () => {
			const dao = mockDocDraftDao();
			const originalContent = '```joi\n{"config": "value"}\n```\n\nOld preamble\n\n## Section\n\nSection content';

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

			const result = await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "null", newContent: "New preamble content" },
				dao,
				1,
			);

			expect(result).toBe('Section "null" updated successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("```joi");
			expect(updatedContent).toContain("New preamble content");
		});

		it("returns error when section not found in article", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content";

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					jrn: articleId,
					title: "Test Article",
					content: originalContent,
					version: 1,
				}),
			} as unknown as DocDao;

			const result = await executeEditSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Nonexistent", newContent: "New content" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toContain('Section "Nonexistent" not found');
		});

		it("creates section change record as suggestion when docDraftSectionChangesDao is provided", async () => {
			const dao = mockDocDraftDao();
			// Content starts with heading (no preamble), so Introduction is at index 0
			const originalContent = "# Introduction\n\nOld intro text\n\n## Background\n\nSome background";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 100, // Draft has docId - editing existing article
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

			const mockSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
			} as unknown as DocDraftSectionChangesDao;

			const result = await executeEditSectionTool(
				1,
				undefined,
				{
					sectionTitle: "Introduction",
					newContent: "New intro text",
					newContentDescription: "Custom description",
				},
				dao,
				1,
				undefined,
				mockSectionChangesDao,
			);

			// Should create suggestion instead of applying directly
			expect(result).toBe(
				'Suggested edit for section "Introduction" has been created. The user can review and apply the change.',
			);
			// Draft should NOT be updated when suggestion is created
			expect(dao.updateDocDraft).not.toHaveBeenCalled();
			// Section change record should have applied=false
			expect(mockSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalledWith(
				expect.objectContaining({
					draftId: 1,
					docId: 100,
					changeType: "update",
					applied: false,
					dismissed: false,
					proposed: expect.arrayContaining([
						expect.objectContaining({
							for: "content",
							description: "Custom description",
							value: "New intro text",
							appliedAt: undefined,
						}),
					]),
				}),
			);
		});

		it("falls back to direct edit for new draft without docId", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Introduction\n\nOld intro text";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: undefined, // Draft without docId - new article
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

			const mockSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn(),
			} as unknown as DocDraftSectionChangesDao;

			const result = await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Introduction", newContent: "New intro text" },
				dao,
				1,
				undefined,
				mockSectionChangesDao,
			);

			// Should fall back to direct edit for new articles (no suggestion created)
			expect(result).toBe('Section "Introduction" updated successfully. The draft has been saved.');
			expect(mockSectionChangesDao.createDocDraftSectionChanges).not.toHaveBeenCalled();
			expect(dao.updateDocDraft).toHaveBeenCalled();
		});

		it("continues editing even when section change record creation fails", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Introduction\n\nOld intro text\n\n## Background\n\nSome background";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 100,
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

			const mockSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn().mockRejectedValue(new Error("Database error")),
			} as unknown as DocDraftSectionChangesDao;

			const result = await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Introduction", newContent: "New intro text" },
				dao,
				1,
				undefined,
				mockSectionChangesDao,
			);

			// Should still succeed with edit even though section change record failed
			expect(result).toBe('Section "Introduction" updated successfully. The draft has been saved.');
			expect(dao.updateDocDraft).toHaveBeenCalled();
		});

		it("returns error when section not found in suggestion mode", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Introduction\n\nOld intro text\n\n## Background\n\nSome background";

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: 100, // Draft has docId - suggestion mode enabled
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

			const mockSectionChangesDao = {
				createDocDraftSectionChanges: vi.fn(),
			} as unknown as DocDraftSectionChangesDao;

			const result = await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Nonexistent Section", newContent: "New content" },
				dao,
				1,
				undefined,
				mockSectionChangesDao,
			);

			expect(result).toContain('Section "Nonexistent Section" not found');
			expect(result).toContain("Available sections:");
			// Section change should not be created
			expect(mockSectionChangesDao.createDocDraftSectionChanges).not.toHaveBeenCalled();
		});

		it("preserves front matter with --- delimiters when editing section", async () => {
			const dao = mockDocDraftDao();
			const originalContent = `---
article_type: jolliscript
title: Test Article
---

# Introduction

Intro content here.

## Details

Details content here.`;

			vi.mocked(dao.getDocDraft).mockResolvedValue({
				id: 1,
				docId: undefined, // No docId - direct edit mode
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

			const result = await executeEditSectionTool(
				1,
				undefined,
				{ sectionTitle: "Introduction", newContent: "Updated intro content." },
				dao,
				1,
			);

			expect(result).toBe('Section "Introduction" updated successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Verify front matter is preserved with --- delimiters
			expect(updatedContent).toContain("---\narticle_type: jolliscript");
			expect(updatedContent).toContain("title: Test Article\n---");
			expect(updatedContent).toContain("# Introduction");
			expect(updatedContent).toContain("Updated intro content.");
			expect(updatedContent).toContain("## Details");
		});

		describe("article suggestion mode (createArticleEditSuggestion)", () => {
			const mockUserDao = (): ActiveUserDao =>
				({
					findByEmail: vi.fn(),
					findById: vi.fn(),
				}) as unknown as ActiveUserDao;

			it("returns error when section not found in article suggestion mode", async () => {
				const dao = mockDocDraftDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content\n\n## Background\n\nBackground content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 1,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					}),
				} as unknown as DocDao;

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn(),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Nonexistent Section", newContent: "New content" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
				);

				expect(result).toContain('Section "Nonexistent Section" not found');
				expect(result).toContain("Available sections:");
				expect(mockSectionChangesDao.createDocDraftSectionChanges).not.toHaveBeenCalled();
			});

			it("uses existing draft and creates suggestion successfully", async () => {
				const dao = mockDocDraftDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					}),
				} as unknown as DocDao;

				// Existing draft found
				vi.mocked(dao.findByDocId).mockResolvedValue([
					{
						id: 5,
						docId: 100,
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

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
				);

				expect(result).toBe(
					'Suggested edit for section "Introduction" has been created on draft 5. The user can review and apply the change.',
				);
				expect(dao.createDocDraft).not.toHaveBeenCalled();
				expect(mockSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalledWith(
					expect.objectContaining({
						draftId: 5,
						docId: 100,
						changeType: "update",
						applied: false,
					}),
				);
			});

			it("falls back to direct edit when existing draft suggestion creation fails", async () => {
				const dao = mockDocDraftDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					}),
					updateDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						content: "updated",
						version: 2,
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([
					{
						id: 5,
						docId: 100,
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

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn().mockRejectedValue(new Error("Database error")),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
				);

				// Falls back to direct edit
				expect(result).toBe('Section "Introduction" updated successfully. The article has been saved.');
				expect(mockDocDao.updateDoc).toHaveBeenCalled();
			});

			it("falls back to direct edit when no userDao provided and no existing draft", async () => {
				const dao = mockDocDraftDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
						updatedBy: "user@example.com",
					}),
					updateDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						content: "updated",
						version: 2,
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([]);

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn(),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
					undefined, // No userDao
				);

				// Falls back to direct edit because can't create draft without userDao
				expect(result).toBe('Section "Introduction" updated successfully. The article has been saved.');
				expect(dao.createDocDraft).not.toHaveBeenCalled();
				expect(mockSectionChangesDao.createDocDraftSectionChanges).not.toHaveBeenCalled();
			});

			it("falls back to direct edit when article has no updatedBy", async () => {
				const dao = mockDocDraftDao();
				const userDao = mockUserDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
						updatedBy: undefined, // No updatedBy
					}),
					updateDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						content: "updated",
						version: 2,
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([]);

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn(),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
					userDao,
				);

				// Falls back to direct edit because no updatedBy to look up owner
				expect(result).toBe('Section "Introduction" updated successfully. The article has been saved.');
				expect(userDao.findByEmail).not.toHaveBeenCalled();
				expect(userDao.findById).not.toHaveBeenCalled();
			});

			it("creates draft with numeric updatedBy and user found by ID", async () => {
				const dao = mockDocDraftDao();
				const userDao = mockUserDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						contentMetadata: { title: "Article Title From Metadata" },
						version: 1,
						updatedBy: "42", // Numeric string
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([]);
				vi.mocked(userDao.findById).mockResolvedValue({ id: 42, email: "user@example.com" } as never);
				vi.mocked(dao.createDocDraft).mockResolvedValue({
					id: 10,
					docId: 100,
					title: "Article Title From Metadata",
					content: originalContent,
					contentType: "text/markdown",
					createdBy: 42,
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

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
					userDao,
				);

				expect(result).toBe(
					'Suggested edit for section "Introduction" has been created on draft 10. The user can review and apply the change.',
				);
				expect(userDao.findById).toHaveBeenCalledWith(42);
				expect(userDao.findByEmail).not.toHaveBeenCalled();
				expect(dao.createDocDraft).toHaveBeenCalledWith(
					expect.objectContaining({
						docId: 100,
						title: "Article Title From Metadata",
						createdBy: 42,
					}),
				);
			});

			it("falls back to direct edit when numeric updatedBy user not found", async () => {
				const dao = mockDocDraftDao();
				const userDao = mockUserDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
						updatedBy: "999", // Numeric string but user doesn't exist
					}),
					updateDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						content: "updated",
						version: 2,
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([]);
				vi.mocked(userDao.findById).mockResolvedValue(undefined as never);

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn(),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
					userDao,
				);

				// Falls back to direct edit because user not found
				expect(result).toBe('Section "Introduction" updated successfully. The article has been saved.');
				expect(userDao.findById).toHaveBeenCalledWith(999);
				expect(dao.createDocDraft).not.toHaveBeenCalled();
			});

			it("creates draft with email updatedBy and user found by email", async () => {
				const dao = mockDocDraftDao();
				const userDao = mockUserDao();
				const articleId = "jrn:article:org/repo/path/to/doc";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						contentMetadata: {}, // No title in metadata
						version: 1,
						updatedBy: "user@example.com", // Email string
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([]);
				vi.mocked(userDao.findByEmail).mockResolvedValue({ id: 55, email: "user@example.com" } as never);
				vi.mocked(dao.createDocDraft).mockResolvedValue({
					id: 11,
					docId: 100,
					title: "doc", // Falls back to last segment of articleId
					content: originalContent,
					contentType: "text/markdown",
					createdBy: 55,
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

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
					userDao,
				);

				expect(result).toBe(
					'Suggested edit for section "Introduction" has been created on draft 11. The user can review and apply the change.',
				);
				expect(userDao.findByEmail).toHaveBeenCalledWith("user@example.com");
				expect(userDao.findById).not.toHaveBeenCalled();
				expect(dao.createDocDraft).toHaveBeenCalledWith(
					expect.objectContaining({
						docId: 100,
						title: "doc", // Last segment of articleId path
						createdBy: 55,
					}),
				);
			});

			it("falls back to direct edit when email updatedBy user not found", async () => {
				const dao = mockDocDraftDao();
				const userDao = mockUserDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
						updatedBy: "unknown@example.com",
					}),
					updateDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						content: "updated",
						version: 2,
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([]);
				vi.mocked(userDao.findByEmail).mockResolvedValue(undefined as never);

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn(),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
					userDao,
				);

				// Falls back to direct edit because user not found
				expect(result).toBe('Section "Introduction" updated successfully. The article has been saved.');
				expect(userDao.findByEmail).toHaveBeenCalledWith("unknown@example.com");
				expect(dao.createDocDraft).not.toHaveBeenCalled();
			});

			it("uses last path segment as draft title when no metadata title", async () => {
				const dao = mockDocDraftDao();
				const userDao = mockUserDao();
				const articleId = "jrn:article:org/repo/path/to/my-document";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						contentMetadata: undefined, // No metadata
						version: 1,
						updatedBy: "42",
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([]);
				vi.mocked(userDao.findById).mockResolvedValue({ id: 42, email: "user@example.com" } as never);
				vi.mocked(dao.createDocDraft).mockResolvedValue({
					id: 12,
					docId: 100,
					title: "my-document",
					content: originalContent,
					contentType: "text/markdown",
					createdBy: 42,
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

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				} as unknown as DocDraftSectionChangesDao;

				await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "Introduction", newContent: "Updated intro" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
					userDao,
				);

				expect(dao.createDocDraft).toHaveBeenCalledWith(
					expect.objectContaining({
						title: "my-document",
					}),
				);
			});

			it("edits preamble (null section) in article suggestion mode", async () => {
				const dao = mockDocDraftDao();
				const articleId = "jrn:article:123";
				const originalContent = "Preamble text\n\n# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([
					{
						id: 5,
						docId: 100,
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

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				} as unknown as DocDraftSectionChangesDao;

				const result = await executeEditSectionTool(
					undefined,
					articleId,
					{ sectionTitle: "null", newContent: "Updated preamble" },
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
				);

				expect(result).toBe(
					'Suggested edit for section "null" has been created on draft 5. The user can review and apply the change.',
				);
				expect(mockSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalledWith(
					expect.objectContaining({
						draftId: 5,
						docId: 100,
						changeType: "update",
					}),
				);
			});

			it("uses custom newContentDescription in suggestion", async () => {
				const dao = mockDocDraftDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([
					{
						id: 5,
						docId: 100,
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

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				} as unknown as DocDraftSectionChangesDao;

				await executeEditSectionTool(
					undefined,
					articleId,
					{
						sectionTitle: "Introduction",
						newContent: "Updated intro",
						newContentDescription: "Custom change description",
					},
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
				);

				expect(mockSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalledWith(
					expect.objectContaining({
						proposed: expect.arrayContaining([
							expect.objectContaining({
								description: "Custom change description",
							}),
						]),
					}),
				);
			});

			it("uses default description when newContentDescription is undefined", async () => {
				const dao = mockDocDraftDao();
				const articleId = "jrn:article:123";
				const originalContent = "# Introduction\n\nIntro content";

				const mockDocDao = {
					readDoc: vi.fn().mockResolvedValue({
						id: 100,
						jrn: articleId,
						title: "Test Article",
						content: originalContent,
						version: 1,
					}),
				} as unknown as DocDao;

				vi.mocked(dao.findByDocId).mockResolvedValue([
					{
						id: 5,
						docId: 100,
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

				const mockSectionChangesDao = {
					createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
				} as unknown as DocDraftSectionChangesDao;

				await executeEditSectionTool(
					undefined,
					articleId,
					{
						sectionTitle: "Introduction",
						newContent: "Updated intro",
						// No newContentDescription
					},
					dao,
					1,
					mockDocDao,
					mockSectionChangesDao,
				);

				expect(mockSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalledWith(
					expect.objectContaining({
						proposed: expect.arrayContaining([
							expect.objectContaining({
								description: "Updated section content",
							}),
						]),
					}),
				);
			});
		});
	});
});
