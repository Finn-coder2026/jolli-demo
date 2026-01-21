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
import { analyzeImpact } from "./Analyzer.js";

describe("Analyzer", () => {
	describe("analyzeImpact", () => {
		let tempDir: string;
		let artifactsDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "analyzer-test-"));
			artifactsDir = tempDir;
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should analyze impact and create output file", () => {
			// Setup test data
			const sourceDir = join(artifactsDir, "test-api");
			const versionDir = join(sourceDir, "v1");
			mkdirSync(versionDir, { recursive: true });

			const changes = {
				source: "test-api",
				changed_contract_refs: [
					{ type: "openapi", key: "UsersService_get" },
				],
				summary: {
					added: [],
					removed: [],
					changed: ["UsersService_get"],
				},
			};

			// New format: reverse index with SectionCoverage objects
			const reverseIndex = {
				"openapi:UsersService_get": [
					{ section_id: "api/users/get::overview", coverage_type: "direct" },
					{ section_id: "api/users/get::request", coverage_type: "direct" },
				],
			};

			writeFileSync(
				join(sourceDir, "changed_contract_refs.json"),
				JSON.stringify(changes),
				"utf-8",
			);
			writeFileSync(
				join(versionDir, "reverse_index.json"),
				JSON.stringify(reverseIndex),
				"utf-8",
			);

			const result = analyzeImpact({
				source: "test-api",
				version: "v1",
				artifactsDir,
			});

			expect(result.source).toBe("test-api");
			expect(result.version).toBe("v1");
			expect(result.contractsChanged).toBe(1);
			expect(result.sectionsImpacted).toBe(2);
			expect(existsSync(result.outputFile)).toBe(true);
		});

		it("should write valid JSON to output file", () => {
			const sourceDir = join(artifactsDir, "api");
			const versionDir = join(sourceDir, "v1");
			mkdirSync(versionDir, { recursive: true });

			const changes = {
				source: "api",
				changed_contract_refs: [{ type: "openapi", key: "TestOp" }],
			};

			// New format: reverse index with SectionCoverage objects
			const reverseIndex = {
				"openapi:TestOp": [
					{ section_id: "docs::section", coverage_type: "direct" },
				],
			};

			writeFileSync(
				join(sourceDir, "changed_contract_refs.json"),
				JSON.stringify(changes),
				"utf-8",
			);
			writeFileSync(
				join(versionDir, "reverse_index.json"),
				JSON.stringify(reverseIndex),
				"utf-8",
			);

			const result = analyzeImpact({
				source: "api",
				version: "v1",
				artifactsDir,
			});

			const content = readFileSync(result.outputFile, "utf-8");
			const analysis = JSON.parse(content);

			expect(analysis.source).toBe("api");
			expect(analysis.base_version).toBe("v1");
			expect(analysis.impacted_sections).toHaveLength(1);
			expect(analysis.summary.total_contracts_changed).toBe(1);
			expect(analysis.summary.total_sections_impacted).toBe(1);
		});

		it("should handle contracts with no documentation", () => {
			const sourceDir = join(artifactsDir, "api");
			const versionDir = join(sourceDir, "v1");
			mkdirSync(versionDir, { recursive: true });

			const changes = {
				source: "api",
				changed_contract_refs: [{ type: "openapi", key: "UndocumentedOp" }],
			};

			const reverseIndex = {};

			writeFileSync(
				join(sourceDir, "changed_contract_refs.json"),
				JSON.stringify(changes),
				"utf-8",
			);
			writeFileSync(
				join(versionDir, "reverse_index.json"),
				JSON.stringify(reverseIndex),
				"utf-8",
			);

			const result = analyzeImpact({
				source: "api",
				version: "v1",
				artifactsDir,
			});

			expect(result.contractsChanged).toBe(1);
			expect(result.sectionsImpacted).toBe(0);
		});

		it("should handle multiple contracts impacting same sections", () => {
			const sourceDir = join(artifactsDir, "api");
			const versionDir = join(sourceDir, "v1");
			mkdirSync(versionDir, { recursive: true });

			const changes = {
				source: "api",
				changed_contract_refs: [
					{ type: "openapi", key: "Op1" },
					{ type: "openapi", key: "Op2" },
				],
			};

			// New format: reverse index with SectionCoverage objects
			const reverseIndex = {
				"openapi:Op1": [
					{ section_id: "docs::shared", coverage_type: "direct" },
					{ section_id: "docs::op1", coverage_type: "direct" },
				],
				"openapi:Op2": [
					{ section_id: "docs::shared", coverage_type: "direct" },
					{ section_id: "docs::op2", coverage_type: "direct" },
				],
			};

			writeFileSync(
				join(sourceDir, "changed_contract_refs.json"),
				JSON.stringify(changes),
				"utf-8",
			);
			writeFileSync(
				join(versionDir, "reverse_index.json"),
				JSON.stringify(reverseIndex),
				"utf-8",
			);

			const result = analyzeImpact({
				source: "api",
				version: "v1",
				artifactsDir,
			});

			// 2 contracts changed, but only 3 unique sections impacted
			expect(result.contractsChanged).toBe(2);
			expect(result.sectionsImpacted).toBe(3);
		});

		it("should throw error if changes file not found", () => {
			expect(() => {
				analyzeImpact({
					source: "nonexistent",
					version: "v1",
					artifactsDir,
				});
			}).toThrow();
		});

		it("should throw error if reverse index not found", () => {
			const sourceDir = join(artifactsDir, "api");
			mkdirSync(sourceDir, { recursive: true });

			const changes = {
				source: "api",
				changed_contract_refs: [],
			};

			writeFileSync(
				join(sourceDir, "changed_contract_refs.json"),
				JSON.stringify(changes),
				"utf-8",
			);

			expect(() => {
				analyzeImpact({
					source: "api",
					version: "v1",
					artifactsDir,
				});
			}).toThrow();
		});
	});
});
