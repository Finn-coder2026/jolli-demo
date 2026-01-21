import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadChangedContractRefs } from "./ChangeLoader.js";

describe("ChangeLoader", () => {
	describe("loadChangedContractRefs", () => {
		let tempDir: string;
		let artifactsDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "change-loader-test-"));
			artifactsDir = tempDir;
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should load changed contract refs from file", () => {
			const sourceDir = join(artifactsDir, "test-api");
			mkdirSync(sourceDir, { recursive: true });

			const changes = {
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

			writeFileSync(
				join(sourceDir, "changed_contract_refs.json"),
				JSON.stringify(changes),
				"utf-8",
			);

			const result = loadChangedContractRefs(artifactsDir, "test-api");

			expect(result.source).toBe("test-api");
			expect(result.changed_contract_refs).toHaveLength(2);
			expect(result.changed_contract_refs[0].key).toBe("UsersService_get");
		});

		it("should throw error if file does not exist", () => {
			expect(() => {
				loadChangedContractRefs(artifactsDir, "nonexistent");
			}).toThrow("not found");
		});

		it("should load changes with summary", () => {
			const sourceDir = join(artifactsDir, "api");
			mkdirSync(sourceDir, { recursive: true });

			const changes = {
				source: "api",
				changed_contract_refs: [{ type: "openapi", key: "NewOp" }],
				summary: {
					added: ["NewOp"],
					removed: [],
					changed: [],
				},
			};

			writeFileSync(
				join(sourceDir, "changed_contract_refs.json"),
				JSON.stringify(changes),
				"utf-8",
			);

			const result = loadChangedContractRefs(artifactsDir, "api");

			expect(result.summary?.added).toContain("NewOp");
		});

		it("should handle empty changes", () => {
			const sourceDir = join(artifactsDir, "empty");
			mkdirSync(sourceDir, { recursive: true });

			const changes = {
				source: "empty",
				changed_contract_refs: [],
			};

			writeFileSync(
				join(sourceDir, "changed_contract_refs.json"),
				JSON.stringify(changes),
				"utf-8",
			);

			const result = loadChangedContractRefs(artifactsDir, "empty");

			expect(result.changed_contract_refs).toHaveLength(0);
		});
	});
});
