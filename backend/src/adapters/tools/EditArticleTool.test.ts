import type { DocDraftDao } from "../../dao/DocDraftDao";
import { createEditArticleToolDefinition, executeEditArticleTool } from "./EditArticleTool";
import { describe, expect, it, vi } from "vitest";

function createMockDocDraftDao(content: string): DocDraftDao {
	return {
		getDocDraft: vi.fn().mockResolvedValue({ id: 1, content }),
		updateDocDraft: vi.fn().mockResolvedValue(undefined),
	} as unknown as DocDraftDao;
}

function createMockDocDraftDaoNotFound(): DocDraftDao {
	return {
		getDocDraft: vi.fn().mockResolvedValue(null),
		updateDocDraft: vi.fn().mockResolvedValue(undefined),
	} as unknown as DocDraftDao;
}

function getUpdatedContent(dao: DocDraftDao): string {
	return (vi.mocked(dao.updateDocDraft).mock.calls[0]?.[1]?.content as string | undefined) ?? "";
}

describe("EditArticleTool", () => {
	describe("createEditArticleToolDefinition", () => {
		it("includes draft id in description when provided", () => {
			const tool = createEditArticleToolDefinition(42);
			expect(tool.name).toBe("edit_article");
			expect(tool.description).toContain("Draft ID: 42");
		});

		it("omits draft id from description when not provided", () => {
			const tool = createEditArticleToolDefinition();
			expect(tool.name).toBe("edit_article");
			expect(tool.description).not.toContain("Draft ID:");
		});
	});

	describe("executeEditArticleTool", () => {
		const baseContent = "# Getting Started\n\nWelcome to the guide.\n\n## Setup\n\nInstall dependencies.\n";

		it("applies a single edit", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(
				1,
				{
					edits: [
						{ old_string: "Welcome to the guide.", new_string: "Welcome aboard.", reason: "friendlier" },
					],
				},
				dao,
				42,
			);
			expect(result).toBe("Applied 1 targeted edit to the article.");
			expect(getUpdatedContent(dao)).toContain("Welcome aboard.");
		});

		it("applies multiple edits sequentially", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(
				1,
				{
					edits: [
						{ old_string: "Getting Started", new_string: "Quick Start", reason: "rename" },
						{ old_string: "Install dependencies.", new_string: "Run npm install.", reason: "be specific" },
					],
				},
				dao,
				42,
			);
			expect(result).toBe("Applied 2 targeted edits to the article.");
			const updated = getUpdatedContent(dao);
			expect(updated).toContain("Quick Start");
			expect(updated).toContain("Run npm install.");
		});

		it("returns error when draftId is undefined", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(
				undefined,
				{ edits: [{ old_string: "a", new_string: "b", reason: "test" }] },
				dao,
				42,
			);
			expect(result).toBe("Draft ID is required for edit_article");
		});

		it("returns error when edits array is empty", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(1, { edits: [] }, dao, 42);
			expect(result).toBe("Missing or invalid 'edits' argument - must be a non-empty array");
		});

		it("returns error when edits is not an array", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(
				1,
				{ edits: "bad" as unknown as Array<{ old_string: string; new_string: string; reason: string }> },
				dao,
				42,
			);
			expect(result).toBe("Missing or invalid 'edits' argument - must be a non-empty array");
		});

		it("returns error for invalid edit entry missing fields", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(
				1,
				{
					edits: [
						{ old_string: "a", new_string: "b" } as {
							old_string: string;
							new_string: string;
							reason: string;
						},
					],
				},
				dao,
				42,
			);
			expect(result).toContain("Edit 0: Missing or invalid fields");
		});

		it("returns error for non-object edit entry", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(
				1,
				{ edits: [null as unknown as { old_string: string; new_string: string; reason: string }] },
				dao,
				42,
			);
			expect(result).toContain("Edit 0: Missing or invalid fields");
		});

		it("returns error when draft is not found", async () => {
			const dao = createMockDocDraftDaoNotFound();
			const result = await executeEditArticleTool(
				999,
				{ edits: [{ old_string: "a", new_string: "b", reason: "test" }] },
				dao,
				42,
			);
			expect(result).toBe("Draft 999 not found");
		});

		it("returns error when old_string is not found in content", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(
				1,
				{ edits: [{ old_string: "nonexistent text", new_string: "new", reason: "test" }] },
				dao,
				42,
			);
			expect(result).toContain("Edit 0: Text not found in article content.");
			expect(result).toContain("Actual article content preview:");
		});

		it("truncates long content in not-found error preview", async () => {
			const longContent = "x".repeat(1000);
			const dao = createMockDocDraftDao(longContent);
			const result = await executeEditArticleTool(
				1,
				{ edits: [{ old_string: "not here", new_string: "new", reason: "test" }] },
				dao,
				42,
			);
			expect(result).toContain("[File truncated");
		});

		it("returns error when old_string appears multiple times", async () => {
			const dupContent = "hello world hello world";
			const dao = createMockDocDraftDao(dupContent);
			const result = await executeEditArticleTool(
				1,
				{ edits: [{ old_string: "hello", new_string: "hi", reason: "test" }] },
				dao,
				42,
			);
			expect(result).toContain("Edit 0: old_string appears 2 times");
		});

		it("returns no changes when edit results in same content", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeEditArticleTool(
				1,
				{
					edits: [
						{ old_string: "Welcome to the guide.", new_string: "Welcome to the guide.", reason: "no-op" },
					],
				},
				dao,
				42,
			);
			expect(result).toBe("No article changes applied.");
			expect(dao.updateDocDraft).not.toHaveBeenCalled();
		});
	});
});
