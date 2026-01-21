import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileDocumentation, findMdxFiles } from "./Compiler.js";

describe("Compiler", () => {
	describe("findMdxFiles", () => {
		let tempDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "find-mdx-test-"));
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should find MDX files in directory", () => {
			writeFileSync(join(tempDir, "doc1.mdx"), "content", "utf-8");
			writeFileSync(join(tempDir, "doc2.mdx"), "content", "utf-8");

			const result = findMdxFiles(tempDir);

			expect(result).toHaveLength(2);
			expect(result).toContain("doc1.mdx");
			expect(result).toContain("doc2.mdx");
		});

		it("should find MDX files in subdirectories", () => {
			mkdirSync(join(tempDir, "api"), { recursive: true });
			mkdirSync(join(tempDir, "guides"), { recursive: true });
			writeFileSync(join(tempDir, "api", "users.mdx"), "content", "utf-8");
			writeFileSync(join(tempDir, "guides", "intro.mdx"), "content", "utf-8");

			const result = findMdxFiles(tempDir);

			expect(result).toHaveLength(2);
			expect(result).toContain("api/users.mdx");
			expect(result).toContain("guides/intro.mdx");
		});

		it("should ignore non-MDX files", () => {
			writeFileSync(join(tempDir, "doc.mdx"), "content", "utf-8");
			writeFileSync(join(tempDir, "readme.md"), "content", "utf-8");
			writeFileSync(join(tempDir, "config.json"), "{}", "utf-8");

			const result = findMdxFiles(tempDir);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe("doc.mdx");
		});

		it("should return sorted results", () => {
			writeFileSync(join(tempDir, "z.mdx"), "content", "utf-8");
			writeFileSync(join(tempDir, "a.mdx"), "content", "utf-8");
			writeFileSync(join(tempDir, "m.mdx"), "content", "utf-8");

			const result = findMdxFiles(tempDir);

			expect(result).toEqual(["a.mdx", "m.mdx", "z.mdx"]);
		});

		it("should handle empty directory", () => {
			const result = findMdxFiles(tempDir);

			expect(result).toHaveLength(0);
		});
	});

	describe("compileDocumentation", () => {
		let tempDir: string;
		let docsDir: string;
		let outputDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "compile-test-"));
			docsDir = join(tempDir, "docs");
			outputDir = join(tempDir, "artifacts");
			mkdirSync(docsDir, { recursive: true });
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should compile MDX documents to content graph", () => {
			// Create sample MDX files
			const mdxContent = `---
title: Get Users
covers:
  - openapi:UsersService_get
---

## Overview
This endpoint retrieves users.

## Request
Send a GET request.`;

			writeFileSync(join(docsDir, "users.mdx"), mdxContent, "utf-8");

			const result = compileDocumentation({
				source: "test-api",
				docsDir,
				version: "v1",
				outputDir,
			});

			expect(result.source).toBe("test-api");
			expect(result.version).toBe("v1");
			expect(result.documentsProcessed).toBe(1);
			expect(result.sectionsCreated).toBe(2);

			// Check output files exist
			expect(existsSync(result.outputFiles.graph)).toBe(true);
			expect(existsSync(result.outputFiles.reverseIndex)).toBe(true);
			expect(existsSync(result.outputFiles.sections)).toBe(true);
		});

		it("should create output directory if it does not exist", () => {
			const mdxContent = `## Test\nContent`;
			writeFileSync(join(docsDir, "test.mdx"), mdxContent, "utf-8");

			compileDocumentation({
				source: "test",
				docsDir,
				version: "v1",
				outputDir,
			});

			expect(existsSync(join(outputDir, "test", "v1"))).toBe(true);
		});

		it("should write valid JSON to graph.json", () => {
			const mdxContent = `---
covers:
  - openapi:TestOp
---

## Section
Content`;
			writeFileSync(join(docsDir, "test.mdx"), mdxContent, "utf-8");

			const result = compileDocumentation({
				source: "test",
				docsDir,
				version: "v1",
				outputDir,
			});

			const graphContent = readFileSync(result.outputFiles.graph, "utf-8");
			const graph = JSON.parse(graphContent);

			expect(graph.version).toBe("v1");
			expect(graph.sections).toHaveLength(1);
			expect(graph.sections[0].section_id).toBe("test::section");
		});

		it("should write valid JSON to reverse_index.json", () => {
			const mdxContent = `---
covers:
  - openapi:TestOp
---

## Section
Content`;
			writeFileSync(join(docsDir, "test.mdx"), mdxContent, "utf-8");

			const result = compileDocumentation({
				source: "test",
				docsDir,
				version: "v1",
				outputDir,
			});

			const indexContent = readFileSync(
				result.outputFiles.reverseIndex,
				"utf-8",
			);
			const index = JSON.parse(indexContent);

			// Reverse index now contains SectionCoverage objects with section_id and coverage_type
			expect(index["openapi:TestOp"]).toContainEqual(
				expect.objectContaining({ section_id: "test::section" }),
			);
		});

		it("should write JSONL to sections.jsonl", () => {
			const mdxContent = `## Section 1
Content 1

## Section 2
Content 2`;
			writeFileSync(join(docsDir, "test.mdx"), mdxContent, "utf-8");

			const result = compileDocumentation({
				source: "test",
				docsDir,
				version: "v1",
				outputDir,
			});

			const sectionsContent = readFileSync(
				result.outputFiles.sections,
				"utf-8",
			);
			const lines = sectionsContent.split("\n").filter(line => line.length > 0);

			expect(lines).toHaveLength(2);
			const firstLine = JSON.parse(lines[0]);
			expect(firstLine.section_id).toBeDefined();
			expect(firstLine.content_hash).toBeDefined();
		});

		it("should throw error if docs directory does not exist", () => {
			expect(() => {
				compileDocumentation({
					source: "test",
					docsDir: "/nonexistent/path",
					version: "v1",
					outputDir,
				});
			}).toThrow("does not exist");
		});

		it("should throw error if no MDX files found", () => {
			expect(() => {
				compileDocumentation({
					source: "test",
					docsDir,
					version: "v1",
					outputDir,
				});
			}).toThrow("No MDX files found");
		});

		it("should handle multiple documents", () => {
			writeFileSync(
				join(docsDir, "doc1.mdx"),
				"## Section 1\nContent",
				"utf-8",
			);
			writeFileSync(
				join(docsDir, "doc2.mdx"),
				"## Section 2\nContent",
				"utf-8",
			);

			const result = compileDocumentation({
				source: "test",
				docsDir,
				version: "v1",
				outputDir,
			});

			expect(result.documentsProcessed).toBe(2);
			expect(result.sectionsCreated).toBe(2);
		});
	});
});
