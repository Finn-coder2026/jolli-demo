import { describe, expect, it } from "vitest";
import {
	buildContentGraph,
	computeContentHash,
	countWords,
} from "./GraphBuilder.js";
import type { ParsedMdxDocument } from "../types.js";

describe("GraphBuilder", () => {
	describe("computeContentHash", () => {
		it("should compute SHA256 hash of content", () => {
			const result = computeContentHash("test content");

			expect(result).toMatch(/^sha256:[a-f0-9]{64}$/);
		});

		it("should produce consistent hashes for same content", () => {
			const content = "consistent content";
			const hash1 = computeContentHash(content);
			const hash2 = computeContentHash(content);

			expect(hash1).toBe(hash2);
		});

		it("should produce different hashes for different content", () => {
			const hash1 = computeContentHash("content one");
			const hash2 = computeContentHash("content two");

			expect(hash1).not.toBe(hash2);
		});
	});

	describe("countWords", () => {
		it("should count words in content", () => {
			const result = countWords("This is a test");

			expect(result).toBe(4);
		});

		it("should handle multiple spaces", () => {
			const result = countWords("Words   with   spaces");

			expect(result).toBe(3);
		});

		it("should handle empty content", () => {
			const result = countWords("");

			expect(result).toBe(0);
		});

		it("should handle content with newlines", () => {
			const result = countWords("Line one\nLine two\nLine three");

			expect(result).toBe(6);
		});
	});

	describe("buildContentGraph", () => {
		it("should build content graph from parsed documents", () => {
			const documents: Array<ParsedMdxDocument> = [
				{
					filePath: "api/users/get.mdx",
					frontmatter: {
						title: "Get Users",
						covers: ["openapi:UsersService_get"],
					},
					content: "## Overview\nContent here",
					sections: [
						{
							heading: "Overview",
							headingLevel: 2,
							content: "Content here",
						},
					],
				},
			];

			const result = buildContentGraph(documents, "v1");

			expect(result.version).toBe("v1");
			expect(result.generated_at).toBeDefined();
			expect(result.sections).toHaveLength(1);
			expect(result.sections[0].section_id).toBe("api/users/get::overview");
			expect(result.sections[0].doc_path).toBe("api/users/get.mdx");
			expect(result.sections[0].heading).toBe("Overview");
			expect(result.sections[0].heading_level).toBe(2);
			expect(result.sections[0].covers).toContain("openapi:UsersService_get");
		});

		it("should merge page-level and section-level covers", () => {
			const documents: Array<ParsedMdxDocument> = [
				{
					filePath: "api/test.mdx",
					frontmatter: {
						covers: ["openapi:Op1"],
					},
					content: "",
					sections: [
						{
							heading: "Section",
							headingLevel: 2,
							content: "Content",
							frontmatter: {
								covers: ["openapi:Op2"],
							},
						},
					],
				},
			];

			const result = buildContentGraph(documents, "v1");

			expect(result.sections[0].covers).toHaveLength(2);
			expect(result.sections[0].covers).toContain("openapi:Op1");
			expect(result.sections[0].covers).toContain("openapi:Op2");
		});

		it("should handle documents without covers", () => {
			const documents: Array<ParsedMdxDocument> = [
				{
					filePath: "guides/intro.mdx",
					frontmatter: {},
					content: "",
					sections: [
						{
							heading: "Introduction",
							headingLevel: 2,
							content: "Welcome",
						},
					],
				},
			];

			const result = buildContentGraph(documents, "v1");

			expect(result.sections[0].covers).toHaveLength(0);
		});

		it("should handle multiple documents", () => {
			const documents: Array<ParsedMdxDocument> = [
				{
					filePath: "doc1.mdx",
					frontmatter: {},
					content: "",
					sections: [
						{
							heading: "Section 1",
							headingLevel: 2,
							content: "Content 1",
						},
					],
				},
				{
					filePath: "doc2.mdx",
					frontmatter: {},
					content: "",
					sections: [
						{
							heading: "Section 2",
							headingLevel: 2,
							content: "Content 2",
						},
					],
				},
			];

			const result = buildContentGraph(documents, "v1");

			expect(result.sections).toHaveLength(2);
			expect(result.sections[0].section_id).toBe("doc1::section-1");
			expect(result.sections[1].section_id).toBe("doc2::section-2");
		});

		it("should compute word count for each section", () => {
			const documents: Array<ParsedMdxDocument> = [
				{
					filePath: "test.mdx",
					frontmatter: {},
					content: "",
					sections: [
						{
							heading: "Test",
							headingLevel: 2,
							content: "One two three four five",
						},
					],
				},
			];

			const result = buildContentGraph(documents, "v1");

			expect(result.sections[0].word_count).toBe(5);
		});
	});
});
