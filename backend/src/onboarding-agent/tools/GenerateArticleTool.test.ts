/**
 * Tests for GenerateArticleTool.
 */

import { generateArticleTool } from "./GenerateArticleTool";
import { createMockToolContext } from "./ToolTestUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GenerateArticleTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(generateArticleTool.definition.name).toBe("generate_article");
		});

		it("should require article_type and title parameters", () => {
			expect(generateArticleTool.definition.parameters.required).toContain("article_type");
			expect(generateArticleTool.definition.parameters.required).toContain("title");
		});

		it("should have enum for article_type", () => {
			const prop = generateArticleTool.definition.parameters.properties.article_type;
			expect(prop.enum).toContain("readme");
			expect(prop.enum).toContain("architecture");
			expect(prop.enum).toContain("getting-started");
			expect(prop.enum).toContain("api-reference");
		});
	});

	describe("handler", () => {
		it("should create a placeholder article with default space", async () => {
			const ctx = createMockToolContext();

			const result = await generateArticleTool.handler({ article_type: "readme", title: "My README" }, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("My README");
			expect(result.content).toContain("readme");
			expect(ctx.docDao.createDoc).toHaveBeenCalled();
		});

		it("should create default space if none exists", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.spaceDao.getDefaultSpace).mockResolvedValueOnce(null as never);

			const result = await generateArticleTool.handler(
				{ article_type: "architecture", title: "Architecture" },
				ctx,
			);

			expect(result.success).toBe(true);
			expect(ctx.spaceDao.createDefaultSpaceIfNeeded).toHaveBeenCalled();
		});

		it("should increment generated count in step data", async () => {
			const ctx = createMockToolContext({ generatedCount: 2 });

			await generateArticleTool.handler({ article_type: "getting-started", title: "Getting Started" }, ctx);

			expect(ctx.updateStepData).toHaveBeenCalledWith(expect.objectContaining({ generatedCount: 3 }));
		});

		it("should start generated count at 1 when none exists", async () => {
			const ctx = createMockToolContext();

			await generateArticleTool.handler({ article_type: "api-reference", title: "API Ref" }, ctx);

			expect(ctx.updateStepData).toHaveBeenCalledWith(expect.objectContaining({ generatedCount: 1 }));
		});

		it("should handle errors gracefully", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.docDao.createDoc).mockRejectedValueOnce(new Error("DB error"));

			const result = await generateArticleTool.handler({ article_type: "readme", title: "Test" }, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed");
			expect(result.content).toContain("DB error");
		});

		it("should use doc jrn from created document", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.docDao.createDoc).mockResolvedValueOnce({
				id: 5,
				jrn: "jrn:prod:doc/my-readme",
			} as never);

			const result = await generateArticleTool.handler({ article_type: "readme", title: "My README" }, ctx);

			expect(result.content).toContain("jrn:prod:doc/my-readme");
		});

		it("should fall back to generated jrn when doc.jrn is empty", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.docDao.createDoc).mockResolvedValueOnce({
				id: 5,
				jrn: "",
			} as never);

			const result = await generateArticleTool.handler({ article_type: "readme", title: "My README" }, ctx);

			expect(result.success).toBe(true);
			// Should use jrnParser.document(slug) fallback
			expect(result.content).toContain("Article JRN:");
		});

		it("should handle space with no name", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.spaceDao.getDefaultSpace).mockResolvedValueOnce({
				id: 1,
				name: "",
			} as never);

			const result = await generateArticleTool.handler({ article_type: "readme", title: "Test" }, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Default Space");
		});

		it("should handle non-Error objects in catch block", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.docDao.createDoc).mockRejectedValueOnce("string error");

			const result = await generateArticleTool.handler({ article_type: "readme", title: "Test" }, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Unknown error");
		});
	});
});
