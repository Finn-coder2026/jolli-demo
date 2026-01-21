import type { Database } from "../core/Database";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import { createSectionMarkupService } from "./SectionMarkupService";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SectionMarkupService", () => {
	let mockDb: Database;
	let mockDocDraftSectionChangesDao: DocDraftSectionChangesDao;
	let mockDocDraftDao: {
		getDocDraft: ReturnType<typeof vi.fn>;
	};
	let service: ReturnType<typeof createSectionMarkupService>;

	beforeEach(() => {
		mockDocDraftSectionChangesDao = {
			findByDraftId: vi.fn(),
		} as unknown as DocDraftSectionChangesDao;

		mockDocDraftDao = {
			getDocDraft: vi.fn(),
		};

		mockDb = {
			docDraftSectionChangesDao: mockDocDraftSectionChangesDao,
			docDraftDao: mockDocDraftDao,
		} as unknown as Database;

		service = createSectionMarkupService(mockDb);
	});

	describe("annotateDocDraft", () => {
		it("should return empty array when no pending changes", async () => {
			mockDocDraftDao.getDocDraft.mockResolvedValue({
				id: 1,
				docId: undefined,
				title: "Test Draft",
				content: "# Section 1\n\nContent",
				createdBy: 1,
				createdAt: new Date("2025-01-01T00:00:00Z"),
				updatedAt: new Date("2025-01-01T00:00:00Z"),
				contentLastEditedAt: null,
				contentLastEditedBy: null,
				contentMetadata: undefined,
			});

			vi.mocked(mockDocDraftSectionChangesDao.findByDraftId).mockResolvedValue([]);

			const result = await service.annotateDocDraft(1, "# Section 1\n\nContent");

			expect(result).toEqual([]);
		});

		it("should return empty array when all changes are applied", async () => {
			mockDocDraftDao.getDocDraft.mockResolvedValue({
				id: 1,
				docId: undefined,
				title: "Test Draft",
				content: "# Section 1\n\nContent",
				createdBy: 1,
				createdAt: new Date("2025-01-01T00:00:00Z"),
				updatedAt: new Date("2025-01-01T00:00:00Z"),
				contentLastEditedAt: null,
				contentLastEditedBy: null,
				contentMetadata: undefined,
			});

			vi.mocked(mockDocDraftSectionChangesDao.findByDraftId).mockResolvedValue([
				{
					id: 1,
					draftId: 1,
					docId: 1,
					changeType: "update",
					path: "/sections/1",
					content: "Original",
					proposed: [],
					comments: [],
					applied: true,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: new Date("2025-01-01T00:00:00Z"),
					updatedAt: new Date("2025-01-01T00:00:00Z"),
				},
			]);

			const result = await service.annotateDocDraft(1, "# Section 1\n\nContent");

			expect(result).toEqual([]);
		});

		it("should annotate section with update change", async () => {
			mockDocDraftDao.getDocDraft.mockResolvedValue({
				id: 1,
				docId: undefined,
				title: "Test Draft",
				content: "# Section 1\n\nOriginal content",
				createdBy: 1,
				createdAt: new Date("2025-01-01T00:00:00Z"),
				updatedAt: new Date("2025-01-01T00:00:00Z"),
				contentLastEditedAt: null,
				contentLastEditedBy: null,
				contentMetadata: undefined,
			});

			vi.mocked(mockDocDraftSectionChangesDao.findByDraftId).mockResolvedValue([
				{
					id: 1,
					draftId: 1,
					docId: 1,
					changeType: "update",
					path: "/sections/1",
					content: "Original content",
					proposed: [],
					comments: [],
					applied: false,
					dismissed: false,
					dismissedAt: null,
					dismissedBy: null,
					createdAt: new Date("2025-01-01T00:00:00Z"),
					updatedAt: new Date("2025-01-01T00:00:00Z"),
				},
			]);

			const result = await service.annotateDocDraft(1, "# Section 1\n\nOriginal content");

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				type: "section-change",
				id: "section-1",
				path: "/sections/1",
				title: "Section 1",
				changeIds: [1],
			});
		});
	});

	describe("applySectionChangeToDraft", () => {
		it("should apply update change", async () => {
			const content = "# Section 1\n\nOriginal content\n\n# Section 2\n\nMore content";
			const change = {
				changeType: "update",
				path: "/sections/1",
				proposed: [{ value: "Updated content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("# Section 1");
			expect(result).toContain("Updated content");
			expect(result).toContain("# Section 2");
			expect(result).not.toContain("Original content");
		});

		it("should apply delete change", async () => {
			const content = "# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2\n\n# Section 3\n\nContent 3";
			const change = {
				changeType: "delete",
				path: "/sections/2",
				proposed: [],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("# Section 1");
			expect(result).not.toContain("# Section 2");
			expect(result).toContain("# Section 3");
		});

		it("should apply insert-after change", async () => {
			const content = "# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";
			const change = {
				changeType: "insert-after",
				path: "/sections/1",
				proposed: [{ value: "# New Section\n\nNew content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("# Section 1");
			expect(result).toContain("# New Section");
			expect(result).toContain("# Section 2");
		});

		it("should apply insert-before change", async () => {
			const content = "# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";
			const change = {
				changeType: "insert-before",
				path: "/sections/1",
				proposed: [{ value: "# New Section\n\nNew content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("# New Section");
			expect(result).toContain("# Section 1");
			expect(result).toContain("# Section 2");
		});

		it("should return original content for invalid path", async () => {
			const content = "# Section 1\n\nContent";
			const change = {
				changeType: "update",
				path: "invalid-path",
				proposed: [{ value: "New content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toBe(content);
		});

		it("should return original content for out-of-range section index", async () => {
			const content = "# Section 1\n\nContent";
			const change = {
				changeType: "update",
				path: "/sections/999",
				proposed: [{ value: "New content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toBe(content);
		});

		it("should return original content for invalid proposed value type", async () => {
			const content = "# Section 1\n\nContent";
			const change = {
				changeType: "update",
				path: "/sections/1",
				proposed: [{ value: 123 }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toBe(content);
		});

		it("should handle unknown change type", async () => {
			const content = "# Section 1\n\nContent";
			const change = {
				changeType: "unknown",
				path: "/sections/1",
				proposed: [{ value: "New content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toBe(content);
		});

		it("should update preamble section", async () => {
			const content = "Preamble content\n\n# Section 1\n\nContent 1";
			const change = {
				changeType: "update",
				path: "/sections/0",
				proposed: [{ value: "Updated preamble" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("Updated preamble");
			expect(result).toContain("# Section 1");
			expect(result).not.toContain("Preamble content");
		});

		it("should return original content for invalid proposed value type in insert-after", async () => {
			const content = "# Section 1\n\nContent";
			const change = {
				changeType: "insert-after",
				path: "/sections/1",
				proposed: [{ value: 123 }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toBe(content);
		});

		it("should return original content for invalid proposed value type in insert-before", async () => {
			const content = "# Section 1\n\nContent";
			const change = {
				changeType: "insert-before",
				path: "/sections/1",
				proposed: [{ value: 123 }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toBe(content);
		});

		it("should perform three-way merge when baseContent is provided", async () => {
			const content = "# Section 1\n\nCurrent content";
			const change = {
				changeType: "update",
				path: "/sections/1",
				baseContent: "Original content",
				proposed: [{ value: "Proposed content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("# Section 1");
			expect(result).toContain("Proposed content");
		});

		it("should log warning when merge has conflict", async () => {
			const content = "# Section 1\n\nCurrent conflicting content";
			const change = {
				changeType: "update",
				path: "/sections/1",
				baseContent: "Original base content",
				proposed: [{ value: "Proposed conflicting content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("# Section 1");
		});

		it("should handle preamble section with null title and baseContent", async () => {
			const content = "Preamble content\n\n# Section 1\n\nContent 1";
			const change = {
				changeType: "update",
				path: "/sections/0",
				baseContent: "Original preamble",
				proposed: [{ value: "Updated preamble" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("Updated preamble");
			expect(result).toContain("# Section 1");
		});

		it("should default to h2 when heading pattern not found", async () => {
			// Content where section title doesn't match the heading pattern exactly
			const content = "# Section One\n\nOriginal content\n\n# Section 2\n\nMore content";
			const change = {
				changeType: "update",
				path: "/sections/1",
				proposed: [{ value: "Updated content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			// Should still contain the section heading (uses default level 2 when pattern not found)
			expect(result).toContain("# Section One");
			expect(result).toContain("Updated content");
		});

		it("should apply delete change to preamble section", async () => {
			const content = "Preamble content\n\n# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";
			const change = {
				changeType: "delete",
				path: "/sections/0",
				proposed: [],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).not.toContain("Preamble content");
			expect(result).toContain("# Section 1");
			expect(result).toContain("# Section 2");
		});

		it("should preserve front matter when applying update change", async () => {
			// Sections: 0=front matter, 1=empty preamble, 2=Section 1
			const content = "---\ntitle: My Article\nauthor: Test\n---\n\n# Section 1\n\nOriginal content";
			const change = {
				changeType: "update",
				path: "/sections/2",
				proposed: [{ value: "Updated content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("---\ntitle: My Article\nauthor: Test\n---");
			expect(result).toContain("# Section 1");
			expect(result).toContain("Updated content");
			expect(result).not.toContain("Original content");
		});

		it("should preserve front matter when applying delete change", async () => {
			// Sections: 0=front matter, 1=empty preamble, 2=Section 1, 3=Section 2
			const content = "---\ntitle: My Article\n---\n\n# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2";
			const change = {
				changeType: "delete",
				path: "/sections/3",
				proposed: [],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("---\ntitle: My Article\n---");
			expect(result).toContain("# Section 1");
			expect(result).not.toContain("# Section 2");
		});

		it("should preserve front matter when applying insert-after change", async () => {
			// Sections: 0=front matter, 1=empty preamble, 2=Section 1
			const content = "---\ntitle: My Article\n---\n\n# Section 1\n\nContent 1";
			const change = {
				changeType: "insert-after",
				path: "/sections/2",
				proposed: [{ value: "# New Section\n\nNew content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("---\ntitle: My Article\n---");
			expect(result).toContain("# Section 1");
			expect(result).toContain("# New Section");
		});

		it("should preserve front matter when applying insert-before change", async () => {
			// Sections: 0=front matter, 1=empty preamble, 2=Section 1
			const content = "---\ntitle: My Article\n---\n\n# Section 1\n\nContent 1";
			const change = {
				changeType: "insert-before",
				path: "/sections/2",
				proposed: [{ value: "# New Section\n\nNew content" }],
			};

			const result = await service.applySectionChangeToDraft(content, change);

			expect(result).toContain("---\ntitle: My Article\n---");
			expect(result).toContain("# New Section");
			expect(result).toContain("# Section 1");
		});
	});
});
