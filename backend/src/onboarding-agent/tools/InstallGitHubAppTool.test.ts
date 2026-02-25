/**
 * Tests for InstallGitHubAppTool.
 */

import { installGitHubAppTool } from "./InstallGitHubAppTool";
import { createMockToolContext } from "./ToolTestUtils";
import { describe, expect, it } from "vitest";

describe("InstallGitHubAppTool", () => {
	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(installGitHubAppTool.definition.name).toBe("install_github_app");
		});

		it("should not require any parameters", () => {
			expect(installGitHubAppTool.definition.parameters.required).toBeUndefined();
		});
	});

	describe("handler", () => {
		it("should return success with open_github_install UI action", async () => {
			const ctx = createMockToolContext();
			const result = await installGitHubAppTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Opening");
			expect(result.uiAction).toBeDefined();
			expect(result.uiAction?.type).toBe("open_github_install");
			expect(result.uiAction?.message).toContain("Install");
		});

		it("should not call any context methods", async () => {
			const ctx = createMockToolContext();
			await installGitHubAppTool.handler({}, ctx);

			expect(ctx.updateStepData).not.toHaveBeenCalled();
			expect(ctx.advanceStep).not.toHaveBeenCalled();
			expect(ctx.completeOnboarding).not.toHaveBeenCalled();
			expect(ctx.skipOnboarding).not.toHaveBeenCalled();
		});
	});
});
