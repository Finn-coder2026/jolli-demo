/**
 * Tests for CompleteOnboardingTool.
 */

import { completeOnboardingTool } from "./CompleteOnboardingTool";
import { createMockToolContext } from "./ToolTestUtils";
import { describe, expect, it } from "vitest";

describe("CompleteOnboardingTool", () => {
	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(completeOnboardingTool.definition.name).toBe("complete_onboarding");
		});

		it("should not require any parameters", () => {
			expect(completeOnboardingTool.definition.parameters.required).toBeUndefined();
		});
	});

	describe("handler", () => {
		it("should complete when imported articles exist", async () => {
			const ctx = createMockToolContext({ importedArticles: ["jrn://doc/test"] });
			const result = await completeOnboardingTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Onboarding completed");
			expect(ctx.completeOnboarding).toHaveBeenCalledOnce();
		});

		it("should complete when generated articles exist", async () => {
			const ctx = createMockToolContext({ generatedCount: 2 });
			const result = await completeOnboardingTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Articles created: 2");
			expect(ctx.completeOnboarding).toHaveBeenCalledOnce();
		});

		it("should complete when both imported and generated articles exist", async () => {
			const ctx = createMockToolContext({ importedArticles: ["jrn://doc/a"], generatedCount: 1 });
			const result = await completeOnboardingTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Articles created: 2");
		});

		it("should fail when no articles exist and no integration", async () => {
			const ctx = createMockToolContext();
			const result = await completeOnboardingTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("import at least one article");
			expect(ctx.completeOnboarding).not.toHaveBeenCalled();
		});

		it("should fail with specific message when integration exists but no articles", async () => {
			const ctx = createMockToolContext({ connectedIntegration: 1 });
			const result = await completeOnboardingTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("connected GitHub");
			expect(result.content).toContain("haven't imported");
			expect(ctx.completeOnboarding).not.toHaveBeenCalled();
		});

		it("should report GitHub connected status", async () => {
			const ctx = createMockToolContext({
				importedArticles: ["jrn://doc/a"],
				connectedIntegration: 42,
			});
			const result = await completeOnboardingTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("GitHub connected: Yes");
		});

		it("should report GitHub not connected status", async () => {
			const ctx = createMockToolContext({
				importedArticles: ["jrn://doc/a"],
			});
			const result = await completeOnboardingTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("GitHub connected: No");
		});
	});
});
