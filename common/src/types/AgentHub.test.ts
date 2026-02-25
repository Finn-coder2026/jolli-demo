import { isAgentHubMetadata } from "./AgentHub";
import { describe, expect, it } from "vitest";

describe("isAgentHubMetadata", () => {
	it("should return false for null", () => {
		expect(isAgentHubMetadata(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isAgentHubMetadata(undefined)).toBe(false);
	});

	it("should return false for a non-object", () => {
		expect(isAgentHubMetadata("hello")).toBe(false);
		expect(isAgentHubMetadata(42)).toBe(false);
	});

	it("should return false for an empty object (no discriminator)", () => {
		expect(isAgentHubMetadata({})).toBe(false);
	});

	it("should return true for valid metadata with plan and planPhase", () => {
		expect(isAgentHubMetadata({ plan: "# Plan", planPhase: "planning" })).toBe(true);
		expect(isAgentHubMetadata({ plan: "# Plan", planPhase: "executing" })).toBe(true);
		expect(isAgentHubMetadata({ plan: "# Plan", planPhase: "complete" })).toBe(true);
	});

	it("should return false for metadata with only plan (no discriminator)", () => {
		expect(isAgentHubMetadata({ plan: "# Plan" })).toBe(false);
	});

	it("should return true for metadata with only planPhase", () => {
		expect(isAgentHubMetadata({ planPhase: "executing" })).toBe(true);
	});

	it("should return false for other metadata shapes without a discriminator", () => {
		expect(isAgentHubMetadata({ workspaceRoot: "/foo" })).toBe(false);
		expect(isAgentHubMetadata({ sandboxId: "abc" })).toBe(false);
	});

	it("should return false when plan is not a string", () => {
		expect(isAgentHubMetadata({ plan: 42 })).toBe(false);
	});

	it("should return false when planPhase is not a valid phase", () => {
		expect(isAgentHubMetadata({ planPhase: "invalid" })).toBe(false);
	});

	it("should return false when planPhase is a number", () => {
		expect(isAgentHubMetadata({ planPhase: 1 })).toBe(false);
	});

	it("should return true for metadata with convoKind", () => {
		expect(isAgentHubMetadata({ convoKind: "getting_started" })).toBe(true);
	});

	it("should return false for metadata with only createdForUserId (no discriminator)", () => {
		expect(isAgentHubMetadata({ createdForUserId: 42 })).toBe(false);
	});

	it("should return true for metadata with all fields", () => {
		expect(
			isAgentHubMetadata({
				plan: "# Plan",
				planPhase: "planning",
				convoKind: "getting_started",
				createdForUserId: 42,
			}),
		).toBe(true);
	});

	it("should return false when convoKind is not a valid kind", () => {
		expect(isAgentHubMetadata({ convoKind: "invalid" })).toBe(false);
	});

	it("should return false when convoKind is a number", () => {
		expect(isAgentHubMetadata({ convoKind: 42 })).toBe(false);
	});

	it("should return false when createdForUserId is a string", () => {
		expect(isAgentHubMetadata({ createdForUserId: "42" })).toBe(false);
	});

	// ─── mode discriminator tests ───────────────────────────────────

	it("should return true for metadata with only mode", () => {
		expect(isAgentHubMetadata({ mode: "exec" })).toBe(true);
		expect(isAgentHubMetadata({ mode: "plan" })).toBe(true);
		expect(isAgentHubMetadata({ mode: "exec-accept-all" })).toBe(true);
	});

	it("should return false when mode is not a valid value", () => {
		expect(isAgentHubMetadata({ mode: "invalid" })).toBe(false);
	});

	it("should return false when mode is a number", () => {
		expect(isAgentHubMetadata({ mode: 42 })).toBe(false);
	});

	it("should return true for metadata with mode and planPhase", () => {
		expect(isAgentHubMetadata({ mode: "plan", planPhase: "executing" })).toBe(true);
	});

	it("should return true for metadata with all fields including mode", () => {
		expect(
			isAgentHubMetadata({
				plan: "# Plan",
				planPhase: "planning",
				mode: "plan",
				convoKind: "getting_started",
				createdForUserId: 42,
			}),
		).toBe(true);
	});
});
