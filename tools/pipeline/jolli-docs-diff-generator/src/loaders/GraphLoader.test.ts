import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadContentGraph } from "./GraphLoader.js";
import type { ContentGraph } from "../types.js";

describe("GraphLoader", () => {
	describe("loadContentGraph", () => {
		let tempDir: string;
		let artifactsDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "graph-loader-test-"));
			artifactsDir = tempDir;
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should load content graph from file", () => {
			const versionDir = join(artifactsDir, "test-api", "v1");
			mkdirSync(versionDir, { recursive: true });

			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					{
						section_id: "api/users/get::overview",
						doc_path: "api/users/get.mdx",
						heading: "Overview",
						heading_level: 2,
						content_hash: "sha256:abc123",
						covers: ["openapi:UsersService_get"],
						word_count: 100,
					},
				],
			};

			writeFileSync(
				join(versionDir, "graph.json"),
				JSON.stringify(graph),
				"utf-8",
			);

			const result = loadContentGraph(artifactsDir, "test-api", "v1");

			expect(result.version).toBe("v1");
			expect(result.sections).toHaveLength(1);
			expect(result.sections[0].section_id).toBe("api/users/get::overview");
		});

		it("should throw error if file does not exist", () => {
			expect(() => {
				loadContentGraph(artifactsDir, "nonexistent", "v1");
			}).toThrow("not found");
		});

		it("should load different versions", () => {
			const v1Dir = join(artifactsDir, "api", "v1");
			const v2Dir = join(artifactsDir, "api", "v2");
			mkdirSync(v1Dir, { recursive: true });
			mkdirSync(v2Dir, { recursive: true });

			const graphV1: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					{
						section_id: "doc1::sec1",
						doc_path: "doc1.mdx",
						heading: "Section 1",
						heading_level: 2,
						content_hash: "sha256:v1",
						covers: [],
						word_count: 50,
					},
				],
			};

			const graphV2: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-02T00:00:00.000Z",
				sections: [
					{
						section_id: "doc1::sec1",
						doc_path: "doc1.mdx",
						heading: "Section 1",
						heading_level: 2,
						content_hash: "sha256:v2",
						covers: [],
						word_count: 60,
					},
				],
			};

			writeFileSync(
				join(v1Dir, "graph.json"),
				JSON.stringify(graphV1),
				"utf-8",
			);
			writeFileSync(
				join(v2Dir, "graph.json"),
				JSON.stringify(graphV2),
				"utf-8",
			);

			const resultV1 = loadContentGraph(artifactsDir, "api", "v1");
			const resultV2 = loadContentGraph(artifactsDir, "api", "v2");

			expect(resultV1.version).toBe("v1");
			expect(resultV2.version).toBe("v2");
			expect(resultV1.sections[0].content_hash).toBe("sha256:v1");
			expect(resultV2.sections[0].content_hash).toBe("sha256:v2");
		});

		it("should handle empty graph", () => {
			const versionDir = join(artifactsDir, "empty", "v1");
			mkdirSync(versionDir, { recursive: true });

			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			writeFileSync(
				join(versionDir, "graph.json"),
				JSON.stringify(graph),
				"utf-8",
			);

			const result = loadContentGraph(artifactsDir, "empty", "v1");

			expect(result.sections).toHaveLength(0);
		});
	});
});
