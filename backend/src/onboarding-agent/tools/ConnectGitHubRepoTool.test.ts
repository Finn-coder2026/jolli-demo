/**
 * Tests for ConnectGitHubRepoTool.
 */

import { connectGitHubRepoTool } from "./ConnectGitHubRepoTool";
import { createMockToolContext } from "./ToolTestUtils";
import { getActiveGithubIntegration } from "./ToolUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ToolUtils
vi.mock("./ToolUtils", () => ({
	getActiveGithubIntegration: vi.fn().mockResolvedValue(undefined),
}));

describe("ConnectGitHubRepoTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(connectGitHubRepoTool.definition.name).toBe("connect_github_repo");
		});

		it("should not require any parameters", () => {
			expect(connectGitHubRepoTool.definition.parameters.required).toBeUndefined();
		});
	});

	describe("handler", () => {
		it("should return already connected message when integration exists", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);

			const ctx = createMockToolContext();
			const result = await connectGitHubRepoTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("already connected");
			expect(result.content).toContain("acme/docs");
		});

		it("should open connect dialog when no integration exists", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);

			const ctx = createMockToolContext();
			const result = await connectGitHubRepoTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Opening GitHub connection");
			expect(result.uiAction).toBeDefined();
			expect(result.uiAction?.type).toBe("open_github_connect");
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValueOnce(new Error("DB error"));

			const ctx = createMockToolContext();
			const result = await connectGitHubRepoTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed");
			expect(result.content).toContain("DB error");
		});

		it("should handle non-Error objects in catch block", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValueOnce("string error");

			const ctx = createMockToolContext();
			const result = await connectGitHubRepoTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Unknown error");
		});
	});
});
