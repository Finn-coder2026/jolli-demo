import { describe, expect, it } from "vitest";
import {
	matchImpactedSections,
	countUniqueSections,
	countSectionsByCoverage,
	isSectionRelevantToFields,
	filterSectionsByFieldRelevance,
} from "./ImpactMatcher.js";
import type { ChangedContractRefs, ReverseIndex, SectionCoverage } from "../types.js";

describe("ImpactMatcher", () => {
	describe("isSectionRelevantToFields", () => {
		it("should return true when no changed fields", () => {
			const result = isSectionRelevantToFields("docs::rate-limits", []);
			expect(result).toBe(true);
		});

		it("should match rate limit field to rate limit section", () => {
			const fields = [{ field: "limitPerMinute", newValue: "200" }];
			expect(isSectionRelevantToFields("api::rate-limits", fields)).toBe(true);
			expect(isSectionRelevantToFields("api::rate_limit", fields)).toBe(true);
		});

		it("should match rate limit field to response section", () => {
			const fields = [{ field: "limitPerMinute" }];
			expect(isSectionRelevantToFields("api::response", fields)).toBe(true);
		});

		it("should not match rate limit field to request section", () => {
			const fields = [{ field: "limitPerMinute" }];
			expect(isSectionRelevantToFields("api::request", fields)).toBe(false);
		});

		it("should match request fields to request section", () => {
			const fields = [{ field: "requestBody" }];
			expect(isSectionRelevantToFields("api::request", fields)).toBe(true);
			expect(isSectionRelevantToFields("api::parameters", fields)).toBe(true);
		});

		it("should match authentication fields to auth section", () => {
			const fields = [{ field: "authentication" }];
			expect(isSectionRelevantToFields("api::authentication", fields)).toBe(true);
			expect(isSectionRelevantToFields("api::security", fields)).toBe(true);
		});

		it("should match unknown fields by name in heading", () => {
			const fields = [{ field: "customSetting" }];
			expect(isSectionRelevantToFields("api::customsetting", fields)).toBe(true);
			expect(isSectionRelevantToFields("api::overview", fields)).toBe(false);
		});
	});

	describe("filterSectionsByFieldRelevance", () => {
		it("should return all sections when no changed fields", () => {
			const sections: Array<SectionCoverage> = [
				{ section_id: "api::overview", coverage_type: "direct" },
				{ section_id: "api::request", coverage_type: "direct" },
			];
			const result = filterSectionsByFieldRelevance(sections, undefined);
			expect(result).toHaveLength(2);
		});

		it("should filter sections by field relevance", () => {
			const sections: Array<SectionCoverage> = [
				{ section_id: "api::overview", coverage_type: "direct" },
				{ section_id: "api::request", coverage_type: "direct" },
				{ section_id: "api::response", coverage_type: "direct" },
				{ section_id: "api::rate-limits", coverage_type: "direct" },
			];
			const fields = [{ field: "limitPerMinute", newValue: "200" }];
			const result = filterSectionsByFieldRelevance(sections, fields);

			expect(result).toHaveLength(2);
			expect(result.map(s => s.section_id)).toContain("api::response");
			expect(result.map(s => s.section_id)).toContain("api::rate-limits");
		});
	});

	describe("matchImpactedSections", () => {
		it("should match changed contracts to impacted sections", () => {
			const changes: ChangedContractRefs = {
				source: "test-api",
				changed_contract_refs: [
					{ type: "openapi", key: "UsersService_get" },
					{ type: "openapi", key: "PostsService_post" },
				],
				summary: {
					added: [],
					removed: [],
					changed: ["UsersService_get", "PostsService_post"],
				},
			};

			const reverseIndex: ReverseIndex = {
				"openapi:UsersService_get": [
					{ section_id: "api/users/get::overview", coverage_type: "direct" },
					{ section_id: "api/users/get::request", coverage_type: "direct" },
				],
				"openapi:PostsService_post": [
					{ section_id: "api/posts/post::overview", coverage_type: "direct" },
				],
			};

			const result = matchImpactedSections(changes, reverseIndex);

			expect(result).toHaveLength(2);
			expect(result[0].contract_ref).toBe("openapi:UsersService_get");
			expect(result[0].section_ids).toHaveLength(2);
			expect(result[0].reason).toBe("changed");
			expect(result[1].contract_ref).toBe("openapi:PostsService_post");
			expect(result[1].section_ids).toHaveLength(1);
		});

		it("should handle added contracts", () => {
			const changes: ChangedContractRefs = {
				source: "test",
				changed_contract_refs: [{ type: "openapi", key: "NewOp" }],
				summary: {
					added: ["NewOp"],
					removed: [],
					changed: [],
				},
			};

			const reverseIndex: ReverseIndex = {
				"openapi:NewOp": [{ section_id: "docs/new::section", coverage_type: "direct" }],
			};

			const result = matchImpactedSections(changes, reverseIndex);

			expect(result[0].reason).toBe("added");
		});

		it("should handle removed contracts", () => {
			const changes: ChangedContractRefs = {
				source: "test",
				changed_contract_refs: [{ type: "openapi", key: "OldOp" }],
				summary: {
					added: [],
					removed: ["OldOp"],
					changed: [],
				},
			};

			const reverseIndex: ReverseIndex = {
				"openapi:OldOp": [{ section_id: "docs/old::section", coverage_type: "direct" }],
			};

			const result = matchImpactedSections(changes, reverseIndex);

			expect(result[0].reason).toBe("removed");
		});

		it("should skip contracts not in reverse index", () => {
			const changes: ChangedContractRefs = {
				source: "test",
				changed_contract_refs: [{ type: "openapi", key: "UndocumentedOp" }],
			};

			const reverseIndex: ReverseIndex = {
				"openapi:OtherOp": [{ section_id: "docs::section", coverage_type: "direct" }],
			};

			const result = matchImpactedSections(changes, reverseIndex);

			expect(result).toHaveLength(0);
		});

		it("should handle contracts with no summary", () => {
			const changes: ChangedContractRefs = {
				source: "test",
				changed_contract_refs: [{ type: "openapi", key: "Op1" }],
			};

			const reverseIndex: ReverseIndex = {
				"openapi:Op1": [{ section_id: "docs::sec1", coverage_type: "direct" }],
			};

			const result = matchImpactedSections(changes, reverseIndex);

			expect(result[0].reason).toBe("changed");
		});

		it("should handle multiple contract types", () => {
			const changes: ChangedContractRefs = {
				source: "test",
				changed_contract_refs: [
					{ type: "openapi", key: "ApiOp" },
					{ type: "config", key: "API_KEY" },
				],
			};

			const reverseIndex: ReverseIndex = {
				"openapi:ApiOp": [{ section_id: "api::section", coverage_type: "direct" }],
				"config:API_KEY": [{ section_id: "config::section", coverage_type: "direct" }],
			};

			const result = matchImpactedSections(changes, reverseIndex);

			expect(result).toHaveLength(2);
			expect(result[0].contract_ref).toBe("openapi:ApiOp");
			expect(result[1].contract_ref).toBe("config:API_KEY");
		});

		it("should filter sections by field relevance when enabled", () => {
			const changes: ChangedContractRefs = {
				source: "test",
				changed_contract_refs: [
					{
						type: "openapi",
						key: "RateLimitService_get",
						changedFields: [{ field: "limitPerMinute", newValue: "200" }],
					},
				],
				summary: {
					added: [],
					removed: [],
					changed: ["RateLimitService_get"],
				},
			};

			const reverseIndex: ReverseIndex = {
				"openapi:RateLimitService_get": [
					{ section_id: "api::overview", coverage_type: "direct" },
					{ section_id: "api::request", coverage_type: "direct" },
					{ section_id: "api::response", coverage_type: "direct" },
					{ section_id: "api::rate-limits", coverage_type: "direct" },
				],
			};

			// Without field filtering
			const withoutFiltering = matchImpactedSections(changes, reverseIndex);
			expect(withoutFiltering[0].section_ids).toHaveLength(4);

			// With field filtering
			const withFiltering = matchImpactedSections(changes, reverseIndex, {
				fieldFiltering: true,
			});
			expect(withFiltering[0].section_ids).toHaveLength(2);
			expect(withFiltering[0].section_ids).toContain("api::response");
			expect(withFiltering[0].section_ids).toContain("api::rate-limits");
		});

		it("should not filter when contract has no changed fields", () => {
			const changes: ChangedContractRefs = {
				source: "test",
				changed_contract_refs: [{ type: "openapi", key: "TestOp" }],
			};

			const reverseIndex: ReverseIndex = {
				"openapi:TestOp": [
					{ section_id: "api::overview", coverage_type: "direct" },
					{ section_id: "api::request", coverage_type: "direct" },
				],
			};

			const result = matchImpactedSections(changes, reverseIndex, {
				fieldFiltering: true,
			});
			expect(result[0].section_ids).toHaveLength(2);
		});
	});

	describe("countUniqueSections", () => {
		it("should count unique sections across impacts", () => {
			const impacted = [
				{
					contract_ref: "openapi:Op1",
					section_ids: ["doc1::sec1", "doc1::sec2"],
					sections: [
						{ section_id: "doc1::sec1", coverage_type: "direct" as const },
						{ section_id: "doc1::sec2", coverage_type: "direct" as const },
					],
					reason: "changed" as const,
				},
				{
					contract_ref: "openapi:Op2",
					section_ids: ["doc1::sec2", "doc2::sec1"],
					sections: [
						{ section_id: "doc1::sec2", coverage_type: "direct" as const },
						{ section_id: "doc2::sec1", coverage_type: "direct" as const },
					],
					reason: "changed" as const,
				},
			];

			const result = countUniqueSections(impacted);

			// Unique sections: doc1::sec1, doc1::sec2, doc2::sec1
			expect(result).toBe(3);
		});

		it("should handle empty impacts", () => {
			const result = countUniqueSections([]);

			expect(result).toBe(0);
		});

		it("should handle single impact", () => {
			const impacted = [
				{
					contract_ref: "openapi:Op1",
					section_ids: ["doc::sec1", "doc::sec2", "doc::sec3"],
					sections: [
						{ section_id: "doc::sec1", coverage_type: "direct" as const },
						{ section_id: "doc::sec2", coverage_type: "direct" as const },
						{ section_id: "doc::sec3", coverage_type: "direct" as const },
					],
					reason: "changed" as const,
				},
			];

			const result = countUniqueSections(impacted);

			expect(result).toBe(3);
		});
	});

	describe("countSectionsByCoverage", () => {
		it("should count sections by coverage type", () => {
			const impacted = [
				{
					contract_ref: "openapi:Op1",
					section_ids: ["a::1", "a::2", "a::3"],
					sections: [
						{ section_id: "a::1", coverage_type: "direct" as const },
						{ section_id: "a::2", coverage_type: "mentioned" as const },
						{ section_id: "a::3", coverage_type: "listed" as const },
					],
					reason: "changed" as const,
				},
			];

			const result = countSectionsByCoverage(impacted);

			expect(result.direct).toBe(1);
			expect(result.mentioned).toBe(1);
			expect(result.listed).toBe(1);
		});

		it("should handle multiple impacts with same sections", () => {
			const impacted = [
				{
					contract_ref: "openapi:Op1",
					section_ids: ["a::1", "a::2"],
					sections: [
						{ section_id: "a::1", coverage_type: "direct" as const },
						{ section_id: "a::2", coverage_type: "direct" as const },
					],
					reason: "changed" as const,
				},
				{
					contract_ref: "openapi:Op2",
					section_ids: ["a::1", "a::3"],
					sections: [
						{ section_id: "a::1", coverage_type: "direct" as const },
						{ section_id: "a::3", coverage_type: "mentioned" as const },
					],
					reason: "changed" as const,
				},
			];

			const result = countSectionsByCoverage(impacted);

			// a::1 appears twice but counted once (direct)
			expect(result.direct).toBe(2); // a::1, a::2
			expect(result.mentioned).toBe(1); // a::3
			expect(result.listed).toBe(0);
		});

		it("should handle empty impacts", () => {
			const result = countSectionsByCoverage([]);

			expect(result.direct).toBe(0);
			expect(result.mentioned).toBe(0);
			expect(result.listed).toBe(0);
		});
	});
});
