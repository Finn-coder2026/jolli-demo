import { getModeDefinition, inferDefaultMode, isValidMode } from "./ModeDefinitions";
import { describe, expect, it } from "vitest";

describe("ModeDefinitions", () => {
	describe("getModeDefinition", () => {
		it("returns plan mode definition", () => {
			const def = getModeDefinition("plan");
			expect(def.mode).toBe("plan");
			expect(def.mutationPolicy).toBe("blocked");
			expect(def.forcePlanFirst).toBe(true);
			expect(def.planReminderEnabled).toBe(true);
			expect(def.mutationAllowedPhases.has("executing")).toBe(true);
			expect(def.mutationAllowedPhases.has("complete")).toBe(true);
			expect(def.mutationAllowedPhases.has("planning")).toBe(false);
		});

		it("returns exec mode definition", () => {
			const def = getModeDefinition("exec");
			expect(def.mode).toBe("exec");
			expect(def.mutationPolicy).toBe("confirm");
			expect(def.forcePlanFirst).toBe(false);
			expect(def.planReminderEnabled).toBe(false);
			expect(def.mutationAllowedPhases.size).toBe(0);
		});

		it("returns exec-accept-all mode definition", () => {
			const def = getModeDefinition("exec-accept-all");
			expect(def.mode).toBe("exec-accept-all");
			expect(def.mutationPolicy).toBe("confirm-destructive");
			expect(def.forcePlanFirst).toBe(false);
			expect(def.planReminderEnabled).toBe(false);
		});

		it("throws for unknown mode", () => {
			expect(() => getModeDefinition("invalid" as "plan")).toThrow("Unknown agent hub mode: invalid");
		});

		it("includes systemPromptSection for each mode", () => {
			expect(getModeDefinition("plan").systemPromptSection).toContain("Planning Workflow");
			expect(getModeDefinition("exec").systemPromptSection).toContain("user confirmation");
			expect(getModeDefinition("exec-accept-all").systemPromptSection).toContain("directly");
		});
	});

	describe("inferDefaultMode", () => {
		it("returns explicit mode when present", () => {
			expect(inferDefaultMode({ mode: "exec" })).toBe("exec");
			expect(inferDefaultMode({ mode: "plan" })).toBe("plan");
			expect(inferDefaultMode({ mode: "exec-accept-all" })).toBe("exec-accept-all");
		});

		it("returns plan for metadata with convoKind", () => {
			expect(inferDefaultMode({ convoKind: "getting_started" })).toBe("plan");
		});

		it("returns plan for metadata with planPhase (backward compat)", () => {
			expect(inferDefaultMode({ planPhase: "planning" })).toBe("plan");
			expect(inferDefaultMode({ planPhase: "executing" })).toBe("plan");
		});

		it("returns exec for empty metadata", () => {
			expect(inferDefaultMode({})).toBe("exec");
		});

		it("returns exec for undefined metadata", () => {
			expect(inferDefaultMode(undefined)).toBe("exec");
		});

		it("returns exec for null metadata", () => {
			expect(inferDefaultMode(null)).toBe("exec");
		});

		it("prefers explicit mode over convoKind or planPhase", () => {
			expect(inferDefaultMode({ mode: "exec", convoKind: "getting_started", planPhase: "planning" })).toBe(
				"exec",
			);
		});
	});

	describe("isValidMode", () => {
		it("returns true for valid modes", () => {
			expect(isValidMode("plan")).toBe(true);
			expect(isValidMode("exec")).toBe(true);
			expect(isValidMode("exec-accept-all")).toBe(true);
		});

		it("returns false for invalid strings", () => {
			expect(isValidMode("invalid")).toBe(false);
			expect(isValidMode("")).toBe(false);
		});

		it("returns false for non-string values", () => {
			expect(isValidMode(42)).toBe(false);
			expect(isValidMode(null)).toBe(false);
			expect(isValidMode(undefined)).toBe(false);
		});
	});
});
