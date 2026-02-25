import type { DocDraftDao } from "../../dao/DocDraftDao";
import { createUpsertFrontmatterToolDefinition, executeUpsertFrontmatterTool } from "./UpsertFrontmatterTool";
import { describe, expect, it, vi } from "vitest";

function createMockDocDraftDao(content: string): DocDraftDao {
	return {
		getDocDraft: vi.fn().mockResolvedValue({
			id: 1,
			content,
		}),
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

function getTopLevelFrontmatterKeys(content: string): Array<string> {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return [];
	}
	return match[1]
		.split(/\r?\n/)
		.filter(line => /^[^\s][^:]*:/.test(line))
		.map(line =>
			line
				.split(":")[0]
				.trim()
				.replace(/^['"]|['"]$/g, ""),
		);
}

describe("UpsertFrontmatterTool", () => {
	describe("createUpsertFrontmatterToolDefinition", () => {
		it("includes draft id in description when provided", () => {
			const tool = createUpsertFrontmatterToolDefinition(123);
			expect(tool.name).toBe("upsert_frontmatter");
			expect(tool.description).toContain("Draft ID: 123");
		});

		it("omits draft id from description when not provided", () => {
			const tool = createUpsertFrontmatterToolDefinition();
			expect(tool.name).toBe("upsert_frontmatter");
			expect(tool.description).not.toContain("Draft ID:");
		});
	});

	describe("executeUpsertFrontmatterTool", () => {
		const baseContent = `---
title: API Auth
owner: platform
jrn: doc-api-auth
attention:
  - op: file
    source: backend
    path: backend/src/auth.ts
---

# Auth
`;

		it("preserves top-level key order when updating an existing key", async () => {
			const dao = createMockDocDraftDao(baseContent);

			const result = await executeUpsertFrontmatterTool(1, { set: { jrn: "doc-api-auth-v2" } }, dao, 42);

			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			expect(getTopLevelFrontmatterKeys(updated)).toEqual(["title", "owner", "jrn", "attention"]);
			expect(updated).toContain("jrn: doc-api-auth-v2");
		});

		it("appends new top-level keys at the end without reordering existing keys", async () => {
			const dao = createMockDocDraftDao(baseContent);

			const result = await executeUpsertFrontmatterTool(1, { set: { category: "security" } }, dao, 42);

			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			expect(getTopLevelFrontmatterKeys(updated)).toEqual(["title", "owner", "jrn", "attention", "category"]);
			expect(updated).toContain("category: security");
		});

		it("preserves remaining key order when removing a key", async () => {
			const dao = createMockDocDraftDao(baseContent);

			const result = await executeUpsertFrontmatterTool(1, { remove: ["owner"] }, dao, 42);

			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			expect(getTopLevelFrontmatterKeys(updated)).toEqual(["title", "jrn", "attention"]);
			expect(updated).not.toContain("owner: platform");
		});

		it("returns error when draftId is undefined", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeUpsertFrontmatterTool(undefined, { set: { title: "x" } }, dao, 42);
			expect(result).toBe("Draft ID is required for upsert_frontmatter");
		});

		it("returns error when 'set' is not an object", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: "bad" as unknown as Record<string, unknown> },
				dao,
				42,
			);
			expect(result).toBe("Invalid 'set' argument (must be an object when provided)");
		});

		it("returns error when 'set' is an array", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: [1, 2] as unknown as Record<string, unknown> },
				dao,
				42,
			);
			expect(result).toBe("Invalid 'set' argument (must be an object when provided)");
		});

		it("returns error when 'remove' is not an array", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeUpsertFrontmatterTool(
				1,
				{ remove: "bad" as unknown as Array<string> },
				dao,
				42,
			);
			expect(result).toBe("Invalid 'remove' argument (must be an array of strings when provided)");
		});

		it("returns error when 'remove' contains non-strings", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeUpsertFrontmatterTool(1, { remove: [123 as unknown as string] }, dao, 42);
			expect(result).toBe("Invalid 'remove' argument (must be an array of strings when provided)");
		});

		it("returns error when neither set nor remove is provided", async () => {
			const dao = createMockDocDraftDao(baseContent);
			const result = await executeUpsertFrontmatterTool(1, {}, dao, 42);
			expect(result).toBe("Provide at least one of 'set' or 'remove'");
		});

		it("returns error when draft is not found", async () => {
			const dao = createMockDocDraftDaoNotFound();
			const result = await executeUpsertFrontmatterTool(999, { set: { title: "x" } }, dao, 42);
			expect(result).toBe("Draft 999 not found");
		});

		it("handles content with BOM prefix", async () => {
			const bomContent = `\ufeff---\ntitle: Test\n---\n\n# Hello\n`;
			const dao = createMockDocDraftDao(bomContent);

			const result = await executeUpsertFrontmatterTool(1, { set: { author: "me" } }, dao, 42);
			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			expect(updated.startsWith("\ufeff")).toBe(true);
			expect(updated).toContain("author: me");
		});

		it("creates frontmatter when none exists", async () => {
			const noFrontmatter = "# Just a heading\n\nSome content.\n";
			const dao = createMockDocDraftDao(noFrontmatter);

			const result = await executeUpsertFrontmatterTool(1, { set: { title: "New" } }, dao, 42);
			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			expect(updated).toContain("---\ntitle: New\n---");
		});

		it("returns error for invalid YAML frontmatter", async () => {
			const invalidYaml = "---\n: :\n  bad: [yaml\n---\n\nContent\n";
			const dao = createMockDocDraftDao(invalidYaml);

			const result = await executeUpsertFrontmatterTool(1, { set: { title: "x" } }, dao, 42);
			expect(result).toContain("Existing frontmatter YAML is invalid:");
		});

		it("returns error when frontmatter is not a YAML map", async () => {
			// YAML scalar (just a string) as frontmatter
			const scalarFrontmatter = "---\njust a string\n---\n\n# Content\n";
			const dao = createMockDocDraftDao(scalarFrontmatter);

			const result = await executeUpsertFrontmatterTool(1, { set: { title: "x" } }, dao, 42);
			expect(result).toBe("Existing frontmatter must be a YAML object for upsert operations");
		});

		it("returns no changes needed when content is unchanged", async () => {
			const dao = createMockDocDraftDao(baseContent);
			// Setting jrn to the same value it already has
			const result = await executeUpsertFrontmatterTool(1, { set: { jrn: "doc-api-auth" } }, dao, 42);
			expect(result).toBe("No frontmatter changes needed.");
			expect(dao.updateDocDraft).not.toHaveBeenCalled();
		});

		it("removes all frontmatter keys and strips frontmatter block", async () => {
			const simple = "---\ntitle: Only\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(simple);

			const result = await executeUpsertFrontmatterTool(1, { remove: ["title"] }, dao, 42);
			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			expect(updated).not.toContain("---");
		});

		it("handles BOM content with all frontmatter removed", async () => {
			const bomSimple = "\ufeff---\ntitle: Only\n---\n\nContent\n";
			const dao = createMockDocDraftDao(bomSimple);

			const result = await executeUpsertFrontmatterTool(1, { remove: ["title"] }, dao, 42);
			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			expect(updated.startsWith("\ufeff")).toBe(true);
			expect(updated).not.toContain("---");
		});

		it("preserves trailing newline after frontmatter delimiter", async () => {
			const withTrailingNewline = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(withTrailingNewline);

			const result = await executeUpsertFrontmatterTool(1, { set: { author: "me" } }, dao, 42);
			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			// Trailing newline after --- should be preserved
			expect(updated).toMatch(/---\n\n# Body/);
		});

		it("handles set and remove together", async () => {
			const dao = createMockDocDraftDao(baseContent);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { category: "api" }, remove: ["owner"] },
				dao,
				42,
			);

			expect(result).toBe("Frontmatter updated successfully.");
			const updated = getUpdatedContent(dao);
			expect(updated).toContain("category: api");
			expect(updated).not.toContain("owner: platform");
		});
	});

	describe("validation", () => {
		it("rejects empty jrn string", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(1, { set: { jrn: "" } }, dao, 42);
			expect(result).toContain("Frontmatter validation failed:");
			expect(result).toContain("jrn must be a non-empty string");
		});

		it("rejects non-string jrn", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(1, { set: { jrn: 123 } }, dao, 42);
			expect(result).toContain("jrn must be a non-empty string");
		});

		it("accepts non-jrn-prefixed string for jrn field", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(1, { set: { jrn: "my-slug" } }, dao, 42);
			expect(result).toBe("Frontmatter updated successfully.");
		});

		it("accepts valid v3 JRN", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { jrn: "jrn::path:/home/org_01/docs/article/art_01" } },
				dao,
				42,
			);
			expect(result).toBe("Frontmatter updated successfully.");
		});

		it("rejects invalid v3 JRN", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(1, { set: { jrn: "jrn::path:" } }, dao, 42);
			expect(result).toContain("Frontmatter validation failed:");
		});

		it("rejects invalid v2 JRN", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			// v2 JRN format: jrn:<resource>:<id> — invalid if malformed
			const result = await executeUpsertFrontmatterTool(1, { set: { jrn: "jrn:" } }, dao, 42);
			expect(result).toContain("Frontmatter validation failed:");
		});

		it("rejects attention that is not an array", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(1, { set: { attention: "not-array" } }, dao, 42);
			expect(result).toContain("attention must be an array");
		});

		it("rejects attention rule that is not an object", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(1, { set: { attention: ["not-object"] } }, dao, 42);
			expect(result).toContain("attention[0] must be an object");
		});

		it("rejects attention rule with wrong op", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "dir", path: "/some/path" }] } },
				dao,
				42,
			);
			expect(result).toContain('attention[0].op must be "file"');
		});

		it("rejects attention rule with missing path", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(1, { set: { attention: [{ op: "file" }] } }, dao, 42);
			expect(result).toContain("attention[0].path must be a non-empty string");
		});

		it("rejects workspace-prefixed attention path", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{
					set: {
						attention: [
							{ op: "file", source: "backend", path: "workspace/example-express-js/main/server.js" },
						],
					},
				},
				dao,
				42,
			);
			expect(result).toContain("path must be repo-relative");
		});

		it("rejects Windows-style absolute attention path", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{
					set: {
						attention: [{ op: "file", source: "backend", path: "C:\\Users\\project\\server.js" }],
					},
				},
				dao,
				42,
			);
			expect(result).toContain("path must be repo-relative");
		});

		it("rejects absolute attention path", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{
					set: {
						attention: [
							{
								op: "file",
								source: "backend",
								path: "/home/user/workspace/example-express-js/main/server.js",
							},
						],
					},
				},
				dao,
				42,
			);
			expect(result).toContain("path must be repo-relative");
		});

		it("rejects attention keywords that is an empty string", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", source: "backend", path: "src/a.ts", keywords: "  " }] } },
				dao,
				42,
			);
			expect(result).toContain("attention[0].keywords must not be empty when provided as a string");
		});

		it("rejects attention keywords that is not a string or array", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", source: "backend", path: "src/a.ts", keywords: 42 }] } },
				dao,
				42,
			);
			expect(result).toContain("attention[0].keywords must be a string or an array of strings");
		});

		it("rejects attention keywords array with empty string items", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", source: "backend", path: "src/a.ts", keywords: ["valid", ""] }] } },
				dao,
				42,
			);
			expect(result).toContain("attention[0].keywords[1] must be a non-empty string");
		});

		it("rejects attention keywords array with non-string items", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", source: "backend", path: "src/a.ts", keywords: [99] }] } },
				dao,
				42,
			);
			expect(result).toContain("attention[0].keywords[0] must be a non-empty string");
		});

		it("accepts valid attention with keywords as string", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", source: "backend", path: "src/a.ts", keywords: "auth" }] } },
				dao,
				42,
			);
			expect(result).toBe("Frontmatter updated successfully.");
		});

		it("accepts valid attention with keywords as array", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{
					set: {
						attention: [{ op: "file", source: "backend", path: "src/a.ts", keywords: ["auth", "login"] }],
					},
				},
				dao,
				42,
			);
			expect(result).toBe("Frontmatter updated successfully.");
		});

		it("accepts valid attention without keywords", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", source: "backend", path: "src/a.ts" }] } },
				dao,
				42,
			);
			expect(result).toBe("Frontmatter updated successfully.");
		});

		it("fills missing attention source from configured default source", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", path: "src/a.ts" }] } },
				dao,
				42,
				{ defaultAttentionSource: "backend", requireAttentionSource: true },
			);
			expect(result).toBe("Frontmatter updated successfully.");
			expect(getUpdatedContent(dao)).toContain("source: backend");
		});

		it("allows missing attention source when source is not required", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", path: "src/a.ts" }] } },
				dao,
				42,
				{ requireAttentionSource: false },
			);
			expect(result).toBe("Frontmatter updated successfully.");
			expect(getUpdatedContent(dao)).toContain("path: src/a.ts");
		});

		it("rejects missing attention source when required and no default source exists", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(
				1,
				{ set: { attention: [{ op: "file", path: "src/a.ts" }] } },
				dao,
				42,
				{ requireAttentionSource: true },
			);
			expect(result).toContain("Frontmatter validation failed:");
			expect(result).toContain("attention[0].source must be a non-empty string");
			expect(dao.updateDocDraft).not.toHaveBeenCalled();
		});

		it("includes expected schema in validation error message", async () => {
			const content = "---\ntitle: Test\n---\n\n# Body\n";
			const dao = createMockDocDraftDao(content);

			const result = await executeUpsertFrontmatterTool(1, { set: { jrn: "" } }, dao, 42);
			expect(result).toContain("Expected managed schema:");
			expect(result).toContain("jrn: non-empty string");
			expect(result).toContain('attention: array of { op: "file", source: non-empty string');
		});
	});
});
