import { describe, expect, it } from "vitest";
import { generateVersionDiff } from "./SectionComparer.js";
import type { ContentGraph } from "../types.js";

describe("SectionComparer", () => {
	describe("generateVersionDiff", () => {
		it("should detect added sections", () => {
			const fromGraph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			const toGraph: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-02T00:00:00.000Z",
				sections: [
					{
						section_id: "new::section",
						doc_path: "new.mdx",
						heading: "New Section",
						heading_level: 2,
						content_hash: "sha256:new",
						covers: ["openapi:NewOp"],
						word_count: 100,
					},
				],
			};

			const result = generateVersionDiff(fromGraph, toGraph);

			expect(result.from_version).toBe("v1");
			expect(result.to_version).toBe("v2");
			expect(result.added).toHaveLength(1);
			expect(result.added[0].section_id).toBe("new::section");
			expect(result.added[0].covers).toContain("openapi:NewOp");
			expect(result.removed).toHaveLength(0);
			expect(result.modified).toHaveLength(0);
			expect(result.summary.added_count).toBe(1);
		});

		it("should detect removed sections", () => {
			const fromGraph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					{
						section_id: "old::section",
						doc_path: "old.mdx",
						heading: "Old Section",
						heading_level: 2,
						content_hash: "sha256:old",
						covers: [],
						word_count: 50,
					},
				],
			};

			const toGraph: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-02T00:00:00.000Z",
				sections: [],
			};

			const result = generateVersionDiff(fromGraph, toGraph);

			expect(result.removed).toHaveLength(1);
			expect(result.removed[0].section_id).toBe("old::section");
			expect(result.removed[0].content_hash).toBe("sha256:old");
			expect(result.added).toHaveLength(0);
			expect(result.modified).toHaveLength(0);
			expect(result.summary.removed_count).toBe(1);
		});

		it("should detect modified sections", () => {
			const fromGraph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					{
						section_id: "doc::section",
						doc_path: "doc.mdx",
						heading: "Section",
						heading_level: 2,
						content_hash: "sha256:old",
						covers: [],
						word_count: 50,
					},
				],
			};

			const toGraph: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-02T00:00:00.000Z",
				sections: [
					{
						section_id: "doc::section",
						doc_path: "doc.mdx",
						heading: "Section",
						heading_level: 2,
						content_hash: "sha256:new",
						covers: [],
						word_count: 60,
					},
				],
			};

			const result = generateVersionDiff(fromGraph, toGraph);

			expect(result.modified).toHaveLength(1);
			expect(result.modified[0].section_id).toBe("doc::section");
			expect(result.modified[0].old_hash).toBe("sha256:old");
			expect(result.modified[0].new_hash).toBe("sha256:new");
			expect(result.added).toHaveLength(0);
			expect(result.removed).toHaveLength(0);
			expect(result.summary.modified_count).toBe(1);
		});

		it("should detect unchanged sections", () => {
			const fromGraph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					{
						section_id: "doc::section",
						doc_path: "doc.mdx",
						heading: "Section",
						heading_level: 2,
						content_hash: "sha256:same",
						covers: [],
						word_count: 50,
					},
				],
			};

			const toGraph: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-02T00:00:00.000Z",
				sections: [
					{
						section_id: "doc::section",
						doc_path: "doc.mdx",
						heading: "Section",
						heading_level: 2,
						content_hash: "sha256:same",
						covers: [],
						word_count: 50,
					},
				],
			};

			const result = generateVersionDiff(fromGraph, toGraph);

			expect(result.added).toHaveLength(0);
			expect(result.removed).toHaveLength(0);
			expect(result.modified).toHaveLength(0);
			expect(result.summary.unchanged_count).toBe(1);
		});

		it("should handle multiple changes", () => {
			const fromGraph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					{
						section_id: "doc1::sec1",
						doc_path: "doc1.mdx",
						heading: "Sec1",
						heading_level: 2,
						content_hash: "sha256:1",
						covers: [],
						word_count: 10,
					},
					{
						section_id: "doc2::sec2",
						doc_path: "doc2.mdx",
						heading: "Sec2",
						heading_level: 2,
						content_hash: "sha256:2old",
						covers: [],
						word_count: 20,
					},
					{
						section_id: "doc3::sec3",
						doc_path: "doc3.mdx",
						heading: "Sec3",
						heading_level: 2,
						content_hash: "sha256:3",
						covers: [],
						word_count: 30,
					},
				],
			};

			const toGraph: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-02T00:00:00.000Z",
				sections: [
					{
						section_id: "doc2::sec2",
						doc_path: "doc2.mdx",
						heading: "Sec2",
						heading_level: 2,
						content_hash: "sha256:2new",
						covers: [],
						word_count: 25,
					},
					{
						section_id: "doc3::sec3",
						doc_path: "doc3.mdx",
						heading: "Sec3",
						heading_level: 2,
						content_hash: "sha256:3",
						covers: [],
						word_count: 30,
					},
					{
						section_id: "doc4::sec4",
						doc_path: "doc4.mdx",
						heading: "Sec4",
						heading_level: 2,
						content_hash: "sha256:4",
						covers: [],
						word_count: 40,
					},
				],
			};

			const result = generateVersionDiff(fromGraph, toGraph);

			// doc1::sec1 removed
			// doc2::sec2 modified
			// doc3::sec3 unchanged
			// doc4::sec4 added
			expect(result.removed).toHaveLength(1);
			expect(result.modified).toHaveLength(1);
			expect(result.added).toHaveLength(1);
			expect(result.summary.unchanged_count).toBe(1);
		});

		it("should handle empty graphs", () => {
			const fromGraph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			const toGraph: ContentGraph = {
				version: "v2",
				generated_at: "2025-01-02T00:00:00.000Z",
				sections: [],
			};

			const result = generateVersionDiff(fromGraph, toGraph);

			expect(result.added).toHaveLength(0);
			expect(result.removed).toHaveLength(0);
			expect(result.modified).toHaveLength(0);
			expect(result.summary.unchanged_count).toBe(0);
		});
	});
});
