/**
 * Tests for SkipOnboardingTool.
 */

import { skipOnboardingTool } from "./SkipOnboardingTool";
import { createMockToolContext } from "./ToolTestUtils";
import { describe, expect, it } from "vitest";

describe("SkipOnboardingTool", () => {
	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(skipOnboardingTool.definition.name).toBe("skip_onboarding");
		});

		it("should not require any parameters", () => {
			expect(skipOnboardingTool.definition.parameters.required).toBeUndefined();
		});

		it("should have a description mentioning skip", () => {
			expect(skipOnboardingTool.definition.description).toContain("Skip");
		});
	});

	describe("handler", () => {
		it("should call skipOnboarding on context", async () => {
			const ctx = createMockToolContext();
			const result = await skipOnboardingTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(ctx.skipOnboarding).toHaveBeenCalledOnce();
		});

		it("should return message about coming back later", async () => {
			const ctx = createMockToolContext();
			const result = await skipOnboardingTool.handler({}, ctx);

			expect(result.content).toContain("skipped");
			expect(result.content).toContain("Integrations");
		});
	});
});
