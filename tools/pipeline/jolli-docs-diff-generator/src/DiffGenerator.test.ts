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
import { generateDiff } from "./DiffGenerator.js";
import type { ContentGraph } from "./types.js";

describe("DiffGenerator", () => {
	describe("generateDiff", () => {
		let tempDir: string;
		let artifactsDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "diff-gen-test-"));
			artifactsDir = tempDir;
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should generate diff and create output file", () => {
			const v1Dir = join(artifactsDir, "test-api", "v1");
			const v2Dir = join(artifactsDir, "test-api", "v2");
			mkdirSync(v1Dir, { recursive: true });
			mkdirSync(v2Dir, { recursive: true });

			const graphV1: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					{
						section_id: "doc::sec1",
						doc_path: "doc.mdx",
						heading: "Section 1",
						heading_level: 2,
						content_hash: "sha256:old",
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
						section_id: "doc::sec1",
						doc_path: "doc.mdx",
						heading: "Section 1",
						heading_level: 2,
						content_hash: "sha256:new",
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

			const result = generateDiff({
				source: "test-api",
				fromVersion: "v1",
				toVersion: "v2",
				artifactsDir,
			});

			expect(result.source).toBe("test-api");
			expect(result.fromVersion).toBe("v1");
			expect(result.toVersion).toBe("v2");
			expect(result.modifiedCount).toBe(1);
			expect(existsSync(result.outputFile)).toBe(true);
		});

		it("should create diffs directory if it does not exist", () => {
			const v1Dir = join(artifactsDir, "api", "v1");
			const v2Dir = join(artifactsDir, "api", "v2");
			mkdirSync(v1Dir, { recursive: true });
			mkdirSync(v2Dir, { recursive: true });

			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			writeFileSync(join(v1Dir, "graph.json"), JSON.stringify(graph), "utf-8");
			writeFileSync(join(v2Dir, "graph.json"), JSON.stringify(graph), "utf-8");

			generateDiff({
				source: "api",
				fromVersion: "v1",
				toVersion: "v2",
				artifactsDir,
			});

			expect(existsSync(join(artifactsDir, "api", "diffs"))).toBe(true);
		});

		it("should write valid JSON to output file", () => {
			const v1Dir = join(artifactsDir, "api", "v1");
			const v2Dir = join(artifactsDir, "api", "v2");
			mkdirSync(v1Dir, { recursive: true });
			mkdirSync(v2Dir, { recursive: true });

			const graphV1: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			const graphV2: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-02T00:00:00.000Z",
				sections: [
					{
						section_id: "new::sec",
						doc_path: "new.mdx",
						heading: "New",
						heading_level: 2,
						content_hash: "sha256:abc",
						covers: ["openapi:NewOp"],
						word_count: 100,
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

			const result = generateDiff({
				source: "api",
				fromVersion: "v1",
				toVersion: "v2",
				artifactsDir,
			});

			const content = readFileSync(result.outputFile, "utf-8");
			const diff = JSON.parse(content);

			expect(diff.from_version).toBe("v1");
			expect(diff.to_version).toBe("v2");
			expect(diff.added).toHaveLength(1);
			expect(diff.summary.added_count).toBe(1);
		});

		it("should name output file correctly", () => {
			const v1Dir = join(artifactsDir, "api", "v1");
			const v2Dir = join(artifactsDir, "api", "v2");
			mkdirSync(v1Dir, { recursive: true });
			mkdirSync(v2Dir, { recursive: true });

			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			writeFileSync(join(v1Dir, "graph.json"), JSON.stringify(graph), "utf-8");
			writeFileSync(join(v2Dir, "graph.json"), JSON.stringify(graph), "utf-8");

			const result = generateDiff({
				source: "api",
				fromVersion: "v1",
				toVersion: "v2",
				artifactsDir,
			});

			expect(result.outputFile).toContain("v1__v2.json");
		});

		it("should throw error if from graph not found", () => {
			const v2Dir = join(artifactsDir, "api", "v2");
			mkdirSync(v2Dir, { recursive: true });

			const graph: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			writeFileSync(join(v2Dir, "graph.json"), JSON.stringify(graph), "utf-8");

			expect(() => {
				generateDiff({
					source: "api",
					fromVersion: "v1",
					toVersion: "v2",
					artifactsDir,
				});
			}).toThrow();
		});

		it("should throw error if to graph not found", () => {
			const v1Dir = join(artifactsDir, "api", "v1");
			mkdirSync(v1Dir, { recursive: true });

			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			writeFileSync(join(v1Dir, "graph.json"), JSON.stringify(graph), "utf-8");

			expect(() => {
				generateDiff({
					source: "api",
					fromVersion: "v1",
					toVersion: "v2",
					artifactsDir,
				});
			}).toThrow();
		});
	});
});
