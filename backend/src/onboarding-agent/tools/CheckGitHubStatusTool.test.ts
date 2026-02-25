/**
 * Tests for CheckGitHubStatusTool.
 */

import { checkGitHubStatusTool } from "./CheckGitHubStatusTool";
import { createMockToolContext } from "./ToolTestUtils";
import { getActiveGithubIntegration } from "./ToolUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ToolUtils
vi.mock("./ToolUtils", () => ({
	getActiveGithubIntegration: vi.fn().mockResolvedValue(undefined),
}));

describe("CheckGitHubStatusTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(checkGitHubStatusTool.definition.name).toBe("check_github_status");
		});

		it("should not require any parameters", () => {
			expect(checkGitHubStatusTool.definition.parameters.required).toBeUndefined();
		});
	});

	describe("handler", () => {
		it("should return 'connected' status when active integration exists", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 5,
				metadata: { repo: "acme/docs", branch: "main", installationId: 42 },
			} as never);

			const ctx = createMockToolContext();
			const result = await checkGitHubStatusTool.handler({}, ctx);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.content);
			expect(parsed.status).toBe("connected");
			expect(parsed.repo).toBe("acme/docs");
			expect(parsed.branch).toBe("main");
			expect(parsed.integrationId).toBe(5);
			expect(parsed.installationId).toBe(42);
		});

		it("should return 'installed' status when installations exist but no integration", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "acme", installationId: 42, repos: ["acme/docs", "acme/api"] },
			] as never);

			const result = await checkGitHubStatusTool.handler({}, ctx);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.content);
			expect(parsed.status).toBe("installed");
			expect(parsed.installations).toHaveLength(1);
			expect(parsed.installations[0].name).toBe("acme");
			expect(parsed.installations[0].repos).toContain("acme/docs");
		});

		it("should return 'not_installed' when no installations found", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);

			const ctx = createMockToolContext();
			const result = await checkGitHubStatusTool.handler({}, ctx);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.content);
			expect(parsed.status).toBe("not_installed");
		});

		it("should handle installation with no repos array", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "acme", installationId: 42 },
			] as never);

			const result = await checkGitHubStatusTool.handler({}, ctx);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.content);
			expect(parsed.status).toBe("installed");
			expect(parsed.installations[0].repos).toEqual([]);
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValueOnce(new Error("DB error"));

			const ctx = createMockToolContext();
			const result = await checkGitHubStatusTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed");
			expect(result.content).toContain("DB error");
		});

		it("should handle non-Error objects in catch block", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValueOnce("string error");

			const ctx = createMockToolContext();
			const result = await checkGitHubStatusTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Unknown error");
		});
	});
});
