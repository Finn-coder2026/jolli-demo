import type { Doc } from "../model/Doc";
import { createDocGenerator, type DocFramework, getSupportedFrameworks, isValidFramework } from "./DocGeneratorFactory";
import type { ChangedArticle } from "jolli-common";
import { describe, expect, test } from "vitest";

describe("DocGeneratorFactory", () => {
	const mockArticles: Array<Doc> = [];
	const siteName = "test-site";
	const displayName = "Test Site";

	describe("createDocGenerator", () => {
		test("creates Docusaurus generator", () => {
			const generator = createDocGenerator("docusaurus-2");
			expect(generator.getFrameworkIdentifier()).toBe("docusaurus-2");

			const result = generator.generateFromArticles(mockArticles, siteName, displayName);
			expect(result).toBeDefined();
			expect(Array.isArray(result.files)).toBe(true);
			expect(Array.isArray(result.removedNavEntries)).toBe(true);
		});

		test("creates Nextra generator", () => {
			const generator = createDocGenerator("nextra");
			expect(generator.getFrameworkIdentifier()).toBe("nextra");

			const result = generator.generateFromArticles(mockArticles, siteName, displayName);
			expect(result).toBeDefined();
			expect(Array.isArray(result.files)).toBe(true);
			expect(Array.isArray(result.removedNavEntries)).toBe(true);
		});

		test("throws error for unsupported framework", () => {
			expect(() => createDocGenerator("invalid" as DocFramework)).toThrow("Unsupported framework: invalid");
		});

		test("generates files with options", () => {
			const generator = createDocGenerator("docusaurus-2");
			const result = generator.generateFromArticles(mockArticles, siteName, displayName, {
				allowedDomain: "example.com",
			});
			expect(result.files).toBeDefined();
		});
	});

	describe("getSupportedFrameworks", () => {
		test("returns all supported frameworks", () => {
			const frameworks = getSupportedFrameworks();
			expect(frameworks).toEqual(["docusaurus-2", "nextra"]);
		});

		test("returns array with correct length", () => {
			const frameworks = getSupportedFrameworks();
			expect(frameworks.length).toBe(2);
		});
	});

	describe("isValidFramework", () => {
		test("validates docusaurus-2", () => {
			expect(isValidFramework("docusaurus-2")).toBe(true);
		});

		test("validates nextra", () => {
			expect(isValidFramework("nextra")).toBe(true);
		});

		test("rejects invalid framework", () => {
			expect(isValidFramework("invalid")).toBe(false);
		});

		test("rejects empty string", () => {
			expect(isValidFramework("")).toBe(false);
		});

		test("rejects undefined", () => {
			expect(isValidFramework(undefined as unknown as string)).toBe(false);
		});
	});

	describe("getDeletedFilePaths", () => {
		const mockChangedArticles: Array<ChangedArticle> = [
			{
				id: 1,
				jrn: "jrn:test:article:1",
				title: "Deleted Article",
				contentType: "text/markdown",
				changeType: "deleted",
				updatedAt: "2024-01-10T10:00:00Z",
			},
			{
				id: 2,
				jrn: "jrn:test:article:2",
				title: "Updated Article",
				contentType: "text/markdown",
				changeType: "updated",
				updatedAt: "2024-01-10T10:00:00Z",
			},
		];

		test("Docusaurus generator returns empty array for deleted articles", () => {
			const generator = createDocGenerator("docusaurus-2");
			const paths = generator.getDeletedFilePaths(mockChangedArticles);

			// Docusaurus doesn't support JSON/YAML article deletion via this method
			expect(paths).toEqual([]);
		});

		test("Nextra generator returns file paths for deleted articles", () => {
			const generator = createDocGenerator("nextra");
			const paths = generator.getDeletedFilePaths(mockChangedArticles);

			// Nextra 4.x uses content/ folder
			// Only the deleted article should have a path
			expect(paths).toContain("content/deleted-article.mdx");
			// Updated article should not be in the delete list
			expect(paths).not.toContain("content/updated-article.mdx");
		});

		test("Nextra generator handles JSON articles", () => {
			const jsonArticles: Array<ChangedArticle> = [
				{
					id: 1,
					jrn: "jrn:test:article:1",
					title: "API Spec",
					contentType: "application/json",
					changeType: "deleted",
					updatedAt: "2024-01-10T10:00:00Z",
				},
			];
			const generator = createDocGenerator("nextra");
			const paths = generator.getDeletedFilePaths(jsonArticles);

			// Nextra 4.x: should return all possible paths for JSON articles
			expect(paths).toContain("public/api-spec.json");
			expect(paths).toContain("public/api-docs-api-spec.html");
			expect(paths).toContain("content/api-spec.json");
		});
	});
});
