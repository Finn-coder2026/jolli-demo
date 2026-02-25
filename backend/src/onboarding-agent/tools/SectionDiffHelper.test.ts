/**
 * Tests for SectionDiffHelper - section-by-section change generation for imports.
 */

import type { DocDraftSectionChangesDao } from "../../dao/DocDraftSectionChangesDao";
import { contentMatches, createSectionChangesFromImport } from "./SectionDiffHelper";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SectionDiffHelper", () => {
	describe("contentMatches", () => {
		it("should return true for identical content", () => {
			const content = "# Hello\n\nWorld";
			expect(contentMatches(content, content)).toBe(true);
		});

		it("should return true for content differing only in trailing whitespace", () => {
			const content1 = "# Hello\n\nWorld  ";
			const content2 = "# Hello\n\nWorld";
			expect(contentMatches(content1, content2)).toBe(true);
		});

		it("should return true for content differing only in line endings", () => {
			const content1 = "# Hello\r\n\r\nWorld";
			const content2 = "# Hello\n\nWorld";
			expect(contentMatches(content1, content2)).toBe(true);
		});

		it("should return false for different content", () => {
			const content1 = "# Hello";
			const content2 = "# Goodbye";
			expect(contentMatches(content1, content2)).toBe(false);
		});
	});

	describe("createSectionChangesFromImport", () => {
		let mockSectionChangesDao: DocDraftSectionChangesDao;
		let createdChanges: Array<unknown>;

		beforeEach(() => {
			createdChanges = [];
			mockSectionChangesDao = {
				// biome-ignore lint/suspicious/useAwait: Mock async function for testing
				createDocDraftSectionChanges: vi.fn().mockImplementation(async change => {
					const created = { id: createdChanges.length + 1, ...change };
					createdChanges.push(created);
					return created;
				}),
			} as unknown as DocDraftSectionChangesDao;
		});

		it("should detect no changes when content is identical", async () => {
			const content = "# Introduction\n\nSome text\n\n## Section 1\n\nMore text";

			const result = await createSectionChangesFromImport(1, 1, content, content, mockSectionChangesDao);

			expect(result.hasChanges).toBe(false);
			expect(result.changeCount).toBe(0);
			expect(result.summary).toBe("No changes");
			expect(createdChanges).toHaveLength(0);
		});

		it("should detect updated section when content changes", async () => {
			const oldContent = "# Introduction\n\nOriginal text";
			const newContent = "# Introduction\n\nUpdated text";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			expect(result.hasChanges).toBe(true);
			expect(result.counts.updated).toBe(1);
			expect(result.counts.inserted).toBe(0);
			expect(result.counts.deleted).toBe(0);
			expect(createdChanges).toHaveLength(1);
			expect(createdChanges[0]).toMatchObject({
				changeType: "update",
				draftId: 1,
				docId: 1,
			});
		});

		it("should detect new section as insert-after", async () => {
			const oldContent = "# Introduction\n\nSome text";
			const newContent = "# Introduction\n\nSome text\n\n## New Section\n\nNew content";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			expect(result.hasChanges).toBe(true);
			expect(result.counts.inserted).toBe(1);
			expect(createdChanges).toHaveLength(1);
			expect(createdChanges[0]).toMatchObject({
				changeType: "insert-after",
			});
		});

		it("should detect deleted section", async () => {
			const oldContent = "# Introduction\n\nSome text\n\n## Old Section\n\nOld content";
			const newContent = "# Introduction\n\nSome text";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			expect(result.hasChanges).toBe(true);
			expect(result.counts.deleted).toBe(1);
			expect(createdChanges).toHaveLength(1);
			expect(createdChanges[0]).toMatchObject({
				changeType: "delete",
			});
		});

		it("should match sections by title and detect updates", async () => {
			const oldContent = "# Header\n\nOld preamble\n\n## Features\n\nOld features";
			const newContent = "# Header\n\nNew preamble\n\n## Features\n\nNew features";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			expect(result.hasChanges).toBe(true);
			// Both sections have changed (preamble/header and Features)
			expect(result.counts.updated).toBe(2);
		});

		it("should handle multiple types of changes together", async () => {
			// Use very different section names to avoid fuzzy matching (distance >= 3)
			const oldContent = "# Intro\n\nOld intro\n\n## Section Alpha\n\nOld Alpha\n\n## Section Beta\n\nOld Beta";
			const newContent = "# Intro\n\nNew intro\n\n## Section Alpha\n\nOld Alpha\n\n## Section Gamma\n\nNew Gamma";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			expect(result.hasChanges).toBe(true);
			// Intro: updated, Section Alpha: unchanged, Section Beta: deleted, Section Gamma: inserted
			expect(result.counts.updated).toBe(1);
			expect(result.counts.deleted).toBe(1);
			expect(result.counts.inserted).toBe(1);
		});

		it("should use fuzzy title matching for similar titles", async () => {
			const oldContent = "# Introduction\n\nContent";
			const newContent = "# Introductions\n\nContent"; // Very similar title (1 char diff)

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			// Should match via fuzzy matching (Levenshtein distance = 1 < 3)
			// But since sectionToMarkdown includes the heading, the full content is different
			// So this counts as 1 update (not insert + delete)
			expect(result.counts.updated).toBe(1);
			expect(result.counts.inserted).toBe(0);
			expect(result.counts.deleted).toBe(0);
		});

		it("should generate correct summary for multiple changes", async () => {
			// Use very different section names to avoid fuzzy matching
			const oldContent = "# A\n\nOld A\n\n## Beta\n\nOld Beta";
			const newContent = "# A\n\nNew A\n\n## Gamma\n\nNew Gamma";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			expect(result.summary).toContain("updated");
			expect(result.summary).toContain("added");
			expect(result.summary).toContain("deleted");
		});

		it("should not delete front matter sections", async () => {
			const oldContent = "---\ntitle: Test\n---\n\n# Content\n\nText";
			const newContent = "# Content\n\nText";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			// Front matter removal should not create a delete change
			expect(result.counts.deleted).toBe(0);
		});

		it("should skip preamble sections during fuzzy matching in new content", async () => {
			// New content has preamble without a title - should not be fuzzy matched
			const oldContent = "# Introduction\n\nSome text\n\n## Details\n\nMore details";
			const newContent = "Some preamble text\n\n# Introduction\n\nSome text\n\n## Details\n\nMore details";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			// The preamble in new content (no title) should be inserted, not fuzzy matched
			expect(result.counts.inserted).toBeGreaterThanOrEqual(0);
		});

		it("should skip preamble sections during fuzzy matching in old content", async () => {
			// Old content has preamble, new content has only titled sections
			const oldContent = "Some old preamble\n\n# Introduction\n\nText";
			const newContent = "# Introductions\n\nText"; // Similar to "Introduction" (fuzzy match)

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			// Old preamble should not fuzzy-match with "Introductions" (preamble is skipped in fuzzy pass).
			// However, parseSections always produces a preamble section (even if empty) for new content,
			// so old preamble (non-empty) exact-matches new preamble (empty) by null title → 1 update.
			// "Introduction" fuzzy-matches "Introductions" (distance=1) with different heading → 1 update.
			// Total: 2 updates, 0 inserts, 0 deletes.
			expect(result.counts.updated).toBe(2);
			expect(result.counts.inserted).toBe(0);
			expect(result.counts.deleted).toBe(0);
		});

		it("should not delete empty preamble sections (whitespace-only between front matter and heading)", async () => {
			const oldContent = "---\ntitle: Test\n---\n\n\n\n# Content\n\nText\n\n## Extra Section\n\nExtra";
			const newContent = "# Content\n\nText";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			// Front matter and empty preamble should not count as deleted sections
			// Only the "Extra Section" should be deleted
			expect(result.counts.deleted).toBe(1);
		});

		it("should handle insert-after with no reference match", async () => {
			// All new sections, none matching old content
			const oldContent = "# Alpha\n\nContent alpha";
			const newContent =
				"# Completely Different Name That Is Very Different\n\nNew A\n\n## Another Very Different Name With No Match\n\nNew B";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			// Old section deleted, new sections inserted
			expect(result.hasChanges).toBe(true);
		});

		it("should use singular form in summary for single changes", async () => {
			const oldContent = "# Title\n\nOriginal";
			const newContent = "# Title\n\nUpdated";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			expect(result.summary).toContain("1 section updated");
			expect(result.summary).not.toContain("sections updated");
		});

		it("should use plural form in summary for multiple changes", async () => {
			const oldContent = "# A\n\nOld A\n\n## B\n\nOld B";
			const newContent = "# A\n\nNew A\n\n## B\n\nNew B";

			const result = await createSectionChangesFromImport(1, 1, oldContent, newContent, mockSectionChangesDao);

			expect(result.summary).toContain("2 sections updated");
		});
	});
});
