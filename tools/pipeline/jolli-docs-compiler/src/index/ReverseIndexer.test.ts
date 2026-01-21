import { describe, expect, it } from "vitest";
import {
	buildLegacyReverseIndex,
	buildReverseIndex,
	filterDirectCoverage,
	toLegacyFormat,
} from "./ReverseIndexer.js";
import type { ContentGraph, GraphSection } from "../types.js";

function createSection(
	overrides: Partial<GraphSection> & { section_id: string },
): GraphSection {
	return {
		doc_path: "test.mdx",
		heading: "Test",
		heading_level: 2,
		content_hash: "sha256:abc",
		covers: [],
		covers_with_type: [],
		word_count: 10,
		...overrides,
	};
}

describe("ReverseIndexer", () => {
	describe("buildReverseIndex", () => {
		it("should build reverse index from content graph", () => {
			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					createSection({
						section_id: "api/users/get::overview",
						doc_path: "api/users/get.mdx",
						heading: "Overview",
						covers: ["openapi:UsersService_get"],
						covers_with_type: [
							{
								contract_ref: "openapi:UsersService_get",
								coverage_type: "direct",
							},
						],
					}),
					createSection({
						section_id: "api/users/get::request",
						doc_path: "api/users/get.mdx",
						heading: "Request",
						covers: ["openapi:UsersService_get"],
						covers_with_type: [
							{
								contract_ref: "openapi:UsersService_get",
								coverage_type: "direct",
							},
						],
					}),
				],
			};

			const result = buildReverseIndex(graph);

			expect(result["openapi:UsersService_get"]).toHaveLength(2);
			expect(result["openapi:UsersService_get"]).toContainEqual({
				section_id: "api/users/get::overview",
				coverage_type: "direct",
			});
			expect(result["openapi:UsersService_get"]).toContainEqual({
				section_id: "api/users/get::request",
				coverage_type: "direct",
			});
		});

		it("should handle multiple contract refs per section", () => {
			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					createSection({
						section_id: "guides/quickstart::overview",
						doc_path: "guides/quickstart.mdx",
						heading: "Overview",
						covers: ["openapi:Op1", "openapi:Op2"],
						covers_with_type: [
							{ contract_ref: "openapi:Op1", coverage_type: "direct" },
							{ contract_ref: "openapi:Op2", coverage_type: "mentioned" },
						],
					}),
				],
			};

			const result = buildReverseIndex(graph);

			expect(result["openapi:Op1"]).toContainEqual({
				section_id: "guides/quickstart::overview",
				coverage_type: "direct",
			});
			expect(result["openapi:Op2"]).toContainEqual({
				section_id: "guides/quickstart::overview",
				coverage_type: "mentioned",
			});
		});

		it("should handle sections with no covers", () => {
			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					createSection({
						section_id: "intro::welcome",
						doc_path: "intro.mdx",
						heading: "Welcome",
						covers: [],
						covers_with_type: [],
					}),
				],
			};

			const result = buildReverseIndex(graph);

			expect(Object.keys(result)).toHaveLength(0);
		});

		it("should sort section IDs for each contract ref", () => {
			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					createSection({
						section_id: "z-doc::section",
						covers: ["openapi:TestOp"],
						covers_with_type: [
							{ contract_ref: "openapi:TestOp", coverage_type: "listed" },
						],
					}),
					createSection({
						section_id: "a-doc::section",
						covers: ["openapi:TestOp"],
						covers_with_type: [
							{ contract_ref: "openapi:TestOp", coverage_type: "listed" },
						],
					}),
					createSection({
						section_id: "m-doc::section",
						covers: ["openapi:TestOp"],
						covers_with_type: [
							{ contract_ref: "openapi:TestOp", coverage_type: "listed" },
						],
					}),
				],
			};

			const result = buildReverseIndex(graph);

			expect(result["openapi:TestOp"].map(s => s.section_id)).toEqual([
				"a-doc::section",
				"m-doc::section",
				"z-doc::section",
			]);
		});

		it("should handle empty graph", () => {
			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [],
			};

			const result = buildReverseIndex(graph);

			expect(Object.keys(result)).toHaveLength(0);
		});
	});

	describe("buildLegacyReverseIndex", () => {
		it("should build legacy index with just section IDs", () => {
			const graph: ContentGraph = {
				version: "v1",
				generated_at: "2025-01-01T00:00:00.000Z",
				sections: [
					createSection({
						section_id: "test::section",
						covers: ["openapi:TestOp"],
						covers_with_type: [
							{ contract_ref: "openapi:TestOp", coverage_type: "direct" },
						],
					}),
				],
			};

			const result = buildLegacyReverseIndex(graph);

			expect(result["openapi:TestOp"]).toEqual(["test::section"]);
		});
	});

	describe("filterDirectCoverage", () => {
		it("should filter to only direct coverage", () => {
			const index = {
				"openapi:Op1": [
					{ section_id: "a::direct", coverage_type: "direct" as const },
					{ section_id: "b::listed", coverage_type: "listed" as const },
					{ section_id: "c::mentioned", coverage_type: "mentioned" as const },
				],
				"openapi:Op2": [
					{ section_id: "d::listed", coverage_type: "listed" as const },
				],
			};

			const result = filterDirectCoverage(index);

			expect(result["openapi:Op1"]).toEqual([
				{ section_id: "a::direct", coverage_type: "direct" },
			]);
			expect(result["openapi:Op2"]).toBeUndefined();
		});
	});

	describe("toLegacyFormat", () => {
		it("should convert to legacy format", () => {
			const index = {
				"openapi:Op1": [
					{ section_id: "a::section", coverage_type: "direct" as const },
					{ section_id: "b::section", coverage_type: "listed" as const },
				],
			};

			const result = toLegacyFormat(index);

			expect(result["openapi:Op1"]).toEqual(["a::section", "b::section"]);
		});
	});
});
