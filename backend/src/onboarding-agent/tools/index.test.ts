/**
 * Tests for onboarding tools index — getToolDefinitions and getToolByName.
 */

import { getToolByName, getToolDefinitions, onboardingTools } from "./index";
import { describe, expect, it } from "vitest";

describe("onboarding tools index", () => {
	describe("onboardingTools", () => {
		it("should export an array of tools", () => {
			expect(Array.isArray(onboardingTools)).toBe(true);
			expect(onboardingTools.length).toBeGreaterThan(0);
		});

		it("should have unique tool names", () => {
			const names = onboardingTools.map(t => t.definition.name);
			expect(new Set(names).size).toBe(names.length);
		});

		it("should include expected tools", () => {
			const names = onboardingTools.map(t => t.definition.name);
			expect(names).toContain("check_github_status");
			expect(names).toContain("install_github_app");
			expect(names).toContain("connect_github_repo");
			expect(names).toContain("get_or_create_space");
			expect(names).toContain("list_repos");
			expect(names).toContain("scan_repository");
			expect(names).toContain("import_markdown");
			expect(names).toContain("import_all_markdown");
			expect(names).toContain("generate_article");
			expect(names).toContain("check_sync_triggered");
			expect(names).toContain("advance_step");
			expect(names).toContain("skip_onboarding");
			expect(names).toContain("complete_onboarding");
		});
	});

	describe("getToolDefinitions", () => {
		it("should return definitions for all tools", () => {
			const defs = getToolDefinitions();
			expect(defs.length).toBe(onboardingTools.length);
		});

		it("should return definitions with name, description, and parameters", () => {
			const defs = getToolDefinitions();
			for (const def of defs) {
				expect(def.name).toBeTruthy();
				expect(def.description).toBeTruthy();
				expect(def.parameters).toBeDefined();
				expect(def.parameters.type).toBe("object");
			}
		});
	});

	describe("getToolByName", () => {
		it("should return the correct tool by name", () => {
			const tool = getToolByName("advance_step");
			expect(tool).toBeDefined();
			expect(tool?.definition.name).toBe("advance_step");
		});

		it("should return undefined for unknown tool name", () => {
			expect(getToolByName("nonexistent_tool")).toBeUndefined();
		});

		it("should return a tool with a handler function", () => {
			const tool = getToolByName("skip_onboarding");
			expect(tool).toBeDefined();
			expect(typeof tool?.handler).toBe("function");
		});
	});
});
