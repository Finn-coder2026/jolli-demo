import { describe, expect, it } from "vitest";
import { buildOutput } from "./shared.js";

describe("shared detectors utilities", () => {
	describe("buildOutput", () => {
		it("should build output with all three categories for env source", () => {
			const added = new Set(["NEW_VAR"]);
			const removed = new Set(["OLD_VAR"]);
			const changed = new Set(["CHANGED_VAR"]);

			const result = buildOutput("env", "config", added, removed, changed);

			expect(result.source).toBe("env");
			expect(result.changed_contract_refs).toEqual([
				{ type: "config", key: "CHANGED_VAR" },
				{ type: "config", key: "NEW_VAR" },
				{ type: "config", key: "OLD_VAR" },
			]);
			expect(result.summary).toEqual({
				added: ["NEW_VAR"],
				removed: ["OLD_VAR"],
				changed: ["CHANGED_VAR"],
			});
		});

		it("should build output for openapi source", () => {
			const added = new Set<string>();
			const removed = new Set<string>();
			const changed = new Set(["TestService_get", "UserService_post"]);

			const result = buildOutput("openapi", "openapi", added, removed, changed);

			expect(result.source).toBe("openapi");
			expect(result.changed_contract_refs).toEqual([
				{ type: "openapi", key: "TestService_get" },
				{ type: "openapi", key: "UserService_post" },
			]);
			expect(result.summary).toEqual({
				added: [],
				removed: [],
				changed: ["TestService_get", "UserService_post"],
			});
		});

		it("should sort keys alphabetically", () => {
			const added = new Set(["ZEBRA", "APPLE", "MANGO"]);
			const removed = new Set<string>();
			const changed = new Set<string>();

			const result = buildOutput("env", "config", added, removed, changed);

			expect(result.changed_contract_refs.map(r => r.key)).toEqual(["APPLE", "MANGO", "ZEBRA"]);
			expect(result.summary.added).toEqual(["APPLE", "MANGO", "ZEBRA"]);
		});

		it("should handle empty sets", () => {
			const added = new Set<string>();
			const removed = new Set<string>();
			const changed = new Set<string>();

			const result = buildOutput("env", "config", added, removed, changed);

			expect(result.source).toBe("env");
			expect(result.changed_contract_refs).toEqual([]);
			expect(result.summary).toEqual({
				added: [],
				removed: [],
				changed: [],
			});
		});

		it("should deduplicate across categories", () => {
			const added = new Set(["VAR1", "VAR2"]);
			const removed = new Set(["VAR3"]);
			const changed = new Set(["VAR4"]);

			const result = buildOutput("env", "config", added, removed, changed);

			expect(result.changed_contract_refs.length).toBe(4);
		});

		it("should set correct contract type for all refs", () => {
			const added = new Set(["VAR1", "VAR2"]);
			const removed = new Set<string>();
			const changed = new Set<string>();

			const result = buildOutput("env", "config", added, removed, changed);

			for (const ref of result.changed_contract_refs) {
				expect(ref.type).toBe("config");
			}
		});

		it("should produce valid JSON-serializable output", () => {
			const added = new Set(["A", "B"]);
			const removed = new Set(["C"]);
			const changed = new Set(["D"]);

			const result = buildOutput("env", "config", added, removed, changed);

			const json = JSON.stringify(result);
			const parsed = JSON.parse(json);

			expect(parsed).toEqual(result);
		});
	});
});
