/**
 * Tests for ScanRepositoryTool.
 */

import { scanRepositoryTool } from "./ScanRepositoryTool";
import { createMockToolContext } from "./ToolTestUtils";
import { fetchRepoTree, getAccessTokenForIntegration, getActiveGithubIntegration } from "./ToolUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock external dependencies
vi.mock("./ToolUtils", () => ({
	getActiveGithubIntegration: vi.fn().mockResolvedValue(undefined),
	getAccessTokenForIntegration: vi.fn().mockResolvedValue(undefined),
	fetchRepoTree: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn().mockReturnValue({ appId: 123, slug: "test" }),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	getAccessTokenForGitHubAppInstallation: vi.fn().mockResolvedValue("mock-token"),
}));

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";

describe("ScanRepositoryTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Re-set factory mocks after clearAllMocks to ensure they survive across tests
		vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: 123, slug: "test" } as never);
		vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("mock-token");
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(scanRepositoryTool.definition.name).toBe("scan_repository");
		});

		it("should require repository parameter", () => {
			expect(scanRepositoryTool.definition.parameters.required).toContain("repository");
		});
	});

	describe("handler", () => {
		it("should fail for invalid repository format", async () => {
			const ctx = createMockToolContext();
			const result = await scanRepositoryTool.handler({ repository: "invalid" }, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Invalid repository format");
		});

		it("should use active integration when repo matches", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				metadata: { repo: "acme/docs", branch: "develop" },
			} as never);
			vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("test-token");
			vi.mocked(fetchRepoTree).mockResolvedValueOnce([{ path: "readme.md", type: "blob", sha: "abc" }]);

			const ctx = createMockToolContext();
			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("1 markdown");
			expect(fetchRepoTree).toHaveBeenCalledWith("test-token", "acme", "docs", "develop");
		});

		it("should fall back to installation when no matching integration", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);
			vi.mocked(fetchRepoTree).mockResolvedValueOnce([{ path: "docs/guide.md", type: "blob", sha: "abc" }]);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "acme", installationId: 42 },
			] as never);

			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("1 markdown");
		});

		it("should fail when no access token available", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);

			const ctx = createMockToolContext();
			// No installations match
			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Cannot access");
		});

		it("should filter only markdown files", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);
			vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("token");
			vi.mocked(fetchRepoTree).mockResolvedValueOnce([
				{ path: "readme.md", type: "blob", sha: "a" },
				{ path: "guide.mdx", type: "blob", sha: "b" },
				{ path: "src/index.ts", type: "blob", sha: "c" },
				{ path: "docs", type: "tree", sha: "d" },
				{ path: "config.json", type: "blob", sha: "e" },
			]);

			const ctx = createMockToolContext();
			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("2 markdown");
			expect(result.content).toContain("readme.md");
			expect(result.content).toContain("guide.mdx");
			expect(result.content).not.toContain("index.ts");
		});

		it("should report no markdown files found", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);
			vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("token");
			vi.mocked(fetchRepoTree).mockResolvedValueOnce([{ path: "src/index.ts", type: "blob", sha: "c" }]);

			const ctx = createMockToolContext();
			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("No markdown files");
		});

		it("should store discovered files in step data", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);
			vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("token");
			vi.mocked(fetchRepoTree).mockResolvedValueOnce([{ path: "readme.md", type: "blob", sha: "a" }]);

			const ctx = createMockToolContext();
			await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(ctx.updateStepData).toHaveBeenCalledWith(
				expect.objectContaining({
					discoveredFiles: ["readme.md"],
					connectedRepo: "acme/docs",
				}),
			);
		});

		it("should truncate display to 20 files", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);
			vi.mocked(getAccessTokenForIntegration).mockResolvedValueOnce("token");

			const files = Array.from({ length: 25 }, (_, i) => ({
				path: `doc-${i}.md`,
				type: "blob",
				sha: `sha-${i}`,
			}));
			vi.mocked(fetchRepoTree).mockResolvedValueOnce(files);

			const ctx = createMockToolContext();
			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.content).toContain("25 markdown");
			expect(result.content).toContain("5 more");
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValueOnce(new Error("API error"));

			const ctx = createMockToolContext();
			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed");
			expect(result.content).toContain("API error");
		});

		it("should fall back to installation when integration repo does not match", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				metadata: { repo: "acme/other-repo", branch: "main" },
			} as never);
			vi.mocked(fetchRepoTree).mockResolvedValueOnce([{ path: "readme.md", type: "blob", sha: "a" }]);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "acme", installationId: 42 },
			] as never);

			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(true);
		});

		it("should fail when installation has no valid app", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);
			vi.mocked(getCoreJolliGithubApp).mockReturnValueOnce({ appId: -1 } as never);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "acme", installationId: 42 },
			] as never);

			const result = await scanRepositoryTool.handler({ repository: "acme/docs" }, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Cannot access");
		});
	});
});
