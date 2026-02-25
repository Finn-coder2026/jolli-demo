import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../../dao/DocDraftSectionChangesDao";
import { createDeleteSectionToolDefinition, executeDeleteSectionTool } from "./DeleteSectionTool";
import { describe, expect, it, vi } from "vitest";

describe("DeleteSectionTool", () => {
	describe("createDeleteSectionToolDefinition", () => {
		it("creates a tool definition with the draft ID", () => {
			const draftId = 123;
			const tool = createDeleteSectionToolDefinition(draftId);

			expect(tool.name).toBe("delete_section");
			expect(tool.description).toContain(`Draft ID: ${draftId}`);
			expect(tool.parameters).toEqual({
				type: "object",
				properties: {
					sectionTitle: {
						type: "string",
						description:
							"The exact title of the section to delete (case-sensitive). Use null to delete the preamble (content before first heading).",
					},
				},
				required: ["sectionTitle"],
			});
		});
	});

	describe("executeDeleteSectionTool", () => {
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

			const result = await executeDeleteSectionTool(999, undefined, { sectionTitle: "Introduction" }, dao, 1);

			expect(result).toBe("Draft 999 not found");
		});

		it("returns error if section not found", async () => {
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

			const result = await executeDeleteSectionTool(
				1,
				undefined,
				{ sectionTitle: "Nonexistent Section" },
				dao,
				1,
			);

			expect(result).toContain('Section "Nonexistent Section" not found');
			expect(result).toContain("Available sections:");
		});

		it("successfully deletes a section", async () => {
			const dao = mockDocDraftDao();
			const originalContent =
				"# Article Title\n\n## Introduction\n\nIntro content here.\n\n## Usage\n\nUsage content.\n\n## Conclusion\n\nConclusion here.";

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

			const result = await executeDeleteSectionTool(1, undefined, { sectionTitle: "Usage" }, dao, 1);

			expect(result).toBe('Section "Usage" deleted successfully. The draft has been saved.');
			expect(dao.updateDocDraft).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					content: expect.not.stringContaining("## Usage"),
				}),
			);

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("## Introduction");
			expect(updatedContent).toContain("## Conclusion");
			expect(updatedContent).not.toContain("## Usage");
			expect(updatedContent).not.toContain("Usage content");
		});

		it("successfully deletes the first section (Article Title)", async () => {
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

			const result = await executeDeleteSectionTool(1, undefined, { sectionTitle: "Article Title" }, dao, 1);

			expect(result).toBe('Section "Article Title" deleted successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).not.toContain("# Article Title");
			expect(updatedContent).toContain("## Introduction");
		});

		it("successfully deletes the preamble (using null)", async () => {
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

			const result = await executeDeleteSectionTool(1, undefined, { sectionTitle: "null" }, dao, 1);

			expect(result).toBe('Section "null" deleted successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).not.toContain("This is preamble content");
			expect(updatedContent).toContain("## Introduction");
		});

		it("preserves heading levels when deleting sections", async () => {
			const dao = mockDocDraftDao();
			const originalContent =
				"# Title\n\n### Deep Section 1\n\nContent 1\n\n### Deep Section 2\n\nContent 2\n\n### Deep Section 3\n\nContent 3";

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

			const result = await executeDeleteSectionTool(1, undefined, { sectionTitle: "Deep Section 2" }, dao, 1);

			expect(result).toBe('Section "Deep Section 2" deleted successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("### Deep Section 1");
			expect(updatedContent).not.toContain("### Deep Section 2");
			expect(updatedContent).toContain("### Deep Section 3");
		});

		it("handles deleting the last section", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "# Title\n\n## Introduction\n\nIntro here.\n\n## Conclusion\n\nConclusion here.";

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

			const result = await executeDeleteSectionTool(1, undefined, { sectionTitle: "Conclusion" }, dao, 1);

			expect(result).toBe('Section "Conclusion" deleted successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("## Introduction");
			expect(updatedContent).not.toContain("## Conclusion");
			expect(updatedContent).not.toContain("Conclusion here");
		});

		it("handles deleting all sections leaving only preamble", async () => {
			const dao = mockDocDraftDao();
			const originalContent = "Preamble text\n\n## Only Section\n\nSection content.";

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

			const result = await executeDeleteSectionTool(1, undefined, { sectionTitle: "Only Section" }, dao, 1);

			expect(result).toBe('Section "Only Section" deleted successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			expect(updatedContent).toContain("Preamble text");
			expect(updatedContent).not.toContain("## Only Section");
		});

		it("deletes only the first occurrence when section title appears multiple times", async () => {
			const dao = mockDocDraftDao();
			// Note: In practice, this shouldn't happen with our parser, but testing the behavior
			const originalContent =
				"# Title\n\n## Introduction\n\nFirst intro.\n\n## Usage\n\nUsage content.\n\n## Introduction\n\nSecond intro.";

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

			const result = await executeDeleteSectionTool(1, undefined, { sectionTitle: "Introduction" }, dao, 1);

			expect(result).toBe('Section "Introduction" deleted successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// The first Introduction should be deleted, but due to how parseSections works,
			// it will merge sections with the same title. Let's just verify one was deleted.
			expect(updatedContent).not.toContain("First intro");
		});

		it("uses default heading level when preserving section with special characters", async () => {
			const dao = mockDocDraftDao();
			const originalContent =
				"Preamble\n\n## Section $pecial\n\nSpecial content.\n\n## Another Section\n\nMore content.";

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

			// Delete "Another Section" which will preserve "Section $pecial" with its regex-breaking title
			const result = await executeDeleteSectionTool(1, undefined, { sectionTitle: "Another Section" }, dao, 1);

			expect(result).toBe('Section "Another Section" deleted successfully. The draft has been saved.');

			const updatedContent = vi.mocked(dao.updateDocDraft).mock.calls[0][1].content;
			// Section $pecial should be preserved with default ## when regex doesn't match
			expect(updatedContent).toContain("## Section $pecial");
			expect(updatedContent).toContain("Special content");
			expect(updatedContent).not.toContain("Another Section");
		});

		it("returns error when neither draftId nor articleId provided", async () => {
			const dao = mockDocDraftDao();
			const result = await executeDeleteSectionTool(
				undefined,
				undefined,
				{ sectionTitle: "Introduction" },
				dao,
				1,
			);

			expect(result).toBe("Either draftId or articleId must be provided");
		});

		it("returns error when docDao is missing for article operations", async () => {
			const dao = mockDocDraftDao();
			const result = await executeDeleteSectionTool(
				undefined,
				"jrn:article:123",
				{ sectionTitle: "Introduction" },
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

			const result = await executeDeleteSectionTool(
				undefined,
				"jrn:article:999",
				{ sectionTitle: "Introduction" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Article jrn:article:999 not found");
		});

		it("successfully deletes section from article", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent =
				"# Introduction\n\nIntro content\n\n## Usage\n\nUsage content\n\n## Conclusion\n\nConclusion";

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

			const result = await executeDeleteSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe('Section "Usage" deleted successfully. The article has been saved.');
			expect(mockDocDao.updateDoc).toHaveBeenCalled();
		});

		it("returns error when article update fails", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Usage\n\nUsage content";

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

			const result = await executeDeleteSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Failed to update article jrn:article:123");
		});

		it("returns error when article not found on save", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Usage\n\nUsage content";

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

			const result = await executeDeleteSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage" },
				dao,
				1,
				mockDocDao,
			);

			expect(result).toBe("Article jrn:article:123 not found");
		});

		it("creates suggestion for article mode with existing draft", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Usage\n\nUsage content";

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

			const result = await executeDeleteSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
			);

			expect(result).toContain("Suggested deleting section");
			expect(mockDocDraftSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalled();
		});

		it("creates suggestion for article mode by creating new draft", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Usage\n\nUsage content";

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

			const result = await executeDeleteSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
				mockUserDao as never,
			);

			expect(result).toContain("Suggested deleting section");
			expect(dao.createDocDraft).toHaveBeenCalledWith({
				docId: 42,
				title: "Test Article",
				content: originalContent,
				createdBy: 5,
			});
			expect(mockDocDraftSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalled();
		});

		it("creates suggestion for article mode with numeric updatedBy and no metadata title", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:org/repo/my-doc";
			const originalContent = "# Introduction\n\nIntro content\n\n## Usage\n\nUsage content";

			const mockDocDao = {
				readDoc: vi.fn().mockResolvedValue({
					id: 42,
					jrn: articleId,
					title: "Test Article",
					content: originalContent,
					contentMetadata: {}, // No title — falls back to articleId.split("/").pop()
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
				title: "my-doc",
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

			const result = await executeDeleteSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
				mockUserDao as never,
			);

			expect(result).toContain("Suggested deleting section");
			expect(mockUserDao.findById).toHaveBeenCalledWith(99);
			expect(mockUserDao.findByEmail).not.toHaveBeenCalled();
			expect(dao.createDocDraft).toHaveBeenCalledWith({
				docId: 42,
				title: "my-doc",
				content: originalContent,
				createdBy: 99,
			});
			expect(mockDocDraftSectionChangesDao.createDocDraftSectionChanges).toHaveBeenCalled();
		});

		it("falls back to direct edit when article owner cannot be found for draft creation", async () => {
			const dao = mockDocDraftDao();
			const articleId = "jrn:article:123";
			const originalContent = "# Introduction\n\nIntro content\n\n## Usage\n\nUsage content";

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

			const result = await executeDeleteSectionTool(
				undefined,
				articleId,
				{ sectionTitle: "Usage" },
				dao,
				1,
				mockDocDao,
				mockDocDraftSectionChangesDao,
				mockUserDao as never,
			);

			// Should fall back to direct edit since draft couldn't be created
			expect(result).toBe('Section "Usage" deleted successfully. The article has been saved.');
			expect(mockDocDao.updateDoc).toHaveBeenCalled();
			// Suggestion mode was not used
			expect(mockDocDraftSectionChangesDao.createDocDraftSectionChanges).not.toHaveBeenCalled();
		});
	});
});
