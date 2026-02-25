/**
 * Tests for ToolUtils shared utilities.
 */

import { createMockToolContext } from "./ToolTestUtils";
import {
	connectRepoDirectly,
	extractTitleFromContent,
	fetchFileContent,
	fetchLatestCommitSha,
	fetchRepoTree,
	GITHUB_API_BASE,
	getAccessTokenForIntegration,
	getActiveGithubIntegration,
	getOrCreateRepoSpace,
	matchRepoName,
} from "./ToolUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock external dependencies
vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn(),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	getAccessTokenForGitHubAppInstallation: vi.fn(),
}));

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ToolUtils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockReset();
		// Restore default mock implementations after clearAllMocks
		vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: 123, slug: "test" } as never);
		vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("mock-install-token");
	});

	describe("GITHUB_API_BASE", () => {
		it("should be the GitHub API URL", () => {
			expect(GITHUB_API_BASE).toBe("https://api.github.com");
		});
	});

	describe("getActiveGithubIntegration", () => {
		it("should return active github integration", async () => {
			const ctx = createMockToolContext();
			const mockIntegration = { id: 1, type: "github", status: "active", metadata: {} };
			vi.mocked(ctx.integrationDao.listIntegrations).mockResolvedValueOnce([mockIntegration] as never);

			const result = await getActiveGithubIntegration(ctx);

			expect(result).toEqual(mockIntegration);
		});

		it("should return undefined when no active github integration", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.integrationDao.listIntegrations).mockResolvedValueOnce([
				{ id: 1, type: "github", status: "inactive", metadata: {} },
			] as never);

			const result = await getActiveGithubIntegration(ctx);

			expect(result).toBeUndefined();
		});

		it("should return undefined when no integrations exist", async () => {
			const ctx = createMockToolContext();

			const result = await getActiveGithubIntegration(ctx);

			expect(result).toBeUndefined();
		});

		it("should ignore non-github integrations", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.integrationDao.listIntegrations).mockResolvedValueOnce([
				{ id: 1, type: "slack", status: "active", metadata: {} },
			] as never);

			const result = await getActiveGithubIntegration(ctx);

			expect(result).toBeUndefined();
		});
	});

	describe("getAccessTokenForIntegration", () => {
		it("should return token when installationId is present", async () => {
			const result = await getAccessTokenForIntegration({
				installationId: 42,
				repo: "acme/docs",
				branch: "main",
				features: [],
			});

			expect(result).toBe("mock-install-token");
			expect(getAccessTokenForGitHubAppInstallation).toHaveBeenCalled();
		});

		it("should return undefined when no installationId", async () => {
			const result = await getAccessTokenForIntegration({
				repo: "acme/docs",
				branch: "main",
				features: [],
			} as never);

			expect(result).toBeUndefined();
		});

		it("should return undefined when app is not configured", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValueOnce({ appId: -1 } as never);

			const result = await getAccessTokenForIntegration({
				installationId: 42,
				repo: "acme/docs",
				branch: "main",
				features: [],
			});

			expect(result).toBeUndefined();
		});

		it("should return undefined when app is null", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValueOnce(null as never);

			const result = await getAccessTokenForIntegration({
				installationId: 42,
				repo: "acme/docs",
				branch: "main",
				features: [],
			});

			expect(result).toBeUndefined();
		});
	});

	describe("fetchRepoTree", () => {
		it("should return tree items on success", async () => {
			const mockTree = [
				{ path: "readme.md", type: "blob", sha: "abc" },
				{ path: "src", type: "tree", sha: "def" },
			];
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tree: mockTree }),
			});

			const result = await fetchRepoTree("token", "owner", "repo", "main");

			expect(result).toEqual(mockTree);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/repos/owner/repo/git/trees/main"),
				expect.objectContaining({
					headers: expect.objectContaining({ Authorization: "Bearer token" }),
				}),
			);
		});

		it("should return empty array on API error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const result = await fetchRepoTree("token", "owner", "repo", "main");

			expect(result).toEqual([]);
		});

		it("should return empty array when tree is undefined", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({}),
			});

			const result = await fetchRepoTree("token", "owner", "repo", "main");

			expect(result).toEqual([]);
		});
	});

	describe("fetchFileContent", () => {
		it("should return decoded content on success", async () => {
			const base64Content = Buffer.from("# Hello World").toString("base64");
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ content: base64Content, encoding: "base64", sha: "abc123" }),
			});

			const result = await fetchFileContent("token", "owner", "repo", "readme.md", "main");

			expect(result).toEqual({ content: "# Hello World", sha: "abc123" });
		});

		it("should return undefined on API error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const result = await fetchFileContent("token", "owner", "repo", "nonexistent.md", "main");

			expect(result).toBeUndefined();
		});

		it("should return undefined when encoding is not base64", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ content: "raw content", encoding: "utf-8", sha: "abc" }),
			});

			const result = await fetchFileContent("token", "owner", "repo", "file.md", "main");

			expect(result).toBeUndefined();
		});

		it("should return undefined when content is empty", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ content: "", encoding: "base64", sha: "abc" }),
			});

			const result = await fetchFileContent("token", "owner", "repo", "file.md", "main");

			expect(result).toBeUndefined();
		});
	});

	describe("extractTitleFromContent", () => {
		it("should extract title from YAML frontmatter", () => {
			const content = '---\ntitle: "My Article"\n---\n# Content';
			expect(extractTitleFromContent(content)).toBe("My Article");
		});

		it("should extract title from frontmatter with single quotes", () => {
			const content = "---\ntitle: 'My Article'\n---\n# Content";
			expect(extractTitleFromContent(content)).toBe("My Article");
		});

		it("should extract title from frontmatter without quotes", () => {
			const content = "---\ntitle: My Article\n---\n# Content";
			expect(extractTitleFromContent(content)).toBe("My Article");
		});

		it("should extract title from H1 heading when no frontmatter", () => {
			const content = "# Hello World\n\nSome text.";
			expect(extractTitleFromContent(content)).toBe("Hello World");
		});

		it("should return Untitled when no title found", () => {
			const content = "Some plain text without a heading.";
			expect(extractTitleFromContent(content)).toBe("Untitled");
		});

		it("should prefer frontmatter title over H1", () => {
			const content = '---\ntitle: "Frontmatter Title"\n---\n# Heading Title';
			expect(extractTitleFromContent(content)).toBe("Frontmatter Title");
		});
	});

	describe("matchRepoName", () => {
		const repos = ["acme/docs", "acme/api", "myorg/web-app"];

		it("should match exact full name (case-insensitive)", () => {
			expect(matchRepoName("acme/docs", repos)).toBe("acme/docs");
			expect(matchRepoName("ACME/DOCS", repos)).toBe("acme/docs");
		});

		it("should match by repo name only when unambiguous", () => {
			expect(matchRepoName("docs", repos)).toBe("acme/docs");
			expect(matchRepoName("web-app", repos)).toBe("myorg/web-app");
		});

		it("should return undefined for ambiguous repo name", () => {
			const ambiguous = ["org1/docs", "org2/docs"];
			expect(matchRepoName("docs", ambiguous)).toBeUndefined();
		});

		it("should match by substring when unambiguous", () => {
			expect(matchRepoName("doc", repos)).toBe("acme/docs");
		});

		it("should return undefined for empty input", () => {
			expect(matchRepoName("", repos)).toBeUndefined();
			expect(matchRepoName("  ", repos)).toBeUndefined();
		});

		it("should strip markdown bold formatting", () => {
			expect(matchRepoName("**acme/docs**", repos)).toBe("acme/docs");
			expect(matchRepoName("*docs*", repos)).toBe("acme/docs");
		});

		it("should return undefined for no match", () => {
			expect(matchRepoName("nonexistent", repos)).toBeUndefined();
		});
	});

	describe("connectRepoDirectly", () => {
		it("should create integration when installation found", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "acme", installationId: 42, repos: ["acme/docs"] },
			] as never);
			vi.mocked(ctx.integrationDao.createIntegration).mockResolvedValueOnce({ id: 99 } as never);

			const result = await connectRepoDirectly("acme/docs", ctx);

			expect(result).toEqual({ integrationId: 99, installationId: 42 });
			expect(ctx.integrationDao.createIntegration).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "github",
					name: "acme/docs",
					status: "active",
				}),
			);
		});

		it("should return undefined when no matching installation", async () => {
			const ctx = createMockToolContext();

			const result = await connectRepoDirectly("acme/docs", ctx);

			expect(result).toBeUndefined();
		});

		it("should match repo case-insensitively", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "Acme", installationId: 42, repos: ["Acme/Docs"] },
			] as never);
			vi.mocked(ctx.integrationDao.createIntegration).mockResolvedValueOnce({ id: 99 } as never);

			const result = await connectRepoDirectly("acme/docs", ctx);

			expect(result).toBeDefined();
		});

		it("should omit githubAppId when appId is not positive", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "acme", installationId: 42, repos: ["acme/docs"] },
			] as never);
			vi.mocked(ctx.integrationDao.createIntegration).mockResolvedValueOnce({ id: 99 } as never);
			vi.mocked(getCoreJolliGithubApp).mockReturnValueOnce({ appId: -1 } as never);

			const result = await connectRepoDirectly("acme/docs", ctx);

			expect(result).toEqual({ integrationId: 99, installationId: 42 });
			const createCall = vi.mocked(ctx.integrationDao.createIntegration).mock.calls[0][0] as unknown as {
				metadata: Record<string, unknown>;
			};
			expect(createCall.metadata.githubAppId).toBeUndefined();
		});
	});

	describe("fetchLatestCommitSha", () => {
		it("should return SHA on success", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve([{ sha: "abc123" }]),
			});

			const result = await fetchLatestCommitSha("token", "owner", "repo", "main");

			expect(result).toBe("abc123");
		});

		it("should return undefined on API error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			const result = await fetchLatestCommitSha("token", "owner", "repo", "main");

			expect(result).toBeUndefined();
		});

		it("should return undefined when response is empty array", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve([]),
			});

			const result = await fetchLatestCommitSha("token", "owner", "repo", "main");

			expect(result).toBeUndefined();
		});

		it("should return undefined when fetch throws", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			const result = await fetchLatestCommitSha("token", "owner", "repo", "main");

			expect(result).toBeUndefined();
		});

		it("should return undefined when data is not an array", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ sha: "abc" }),
			});

			const result = await fetchLatestCommitSha("token", "owner", "repo", "main");

			expect(result).toBeUndefined();
		});
	});

	describe("getOrCreateRepoSpace", () => {
		it("should find existing space by repo slug", async () => {
			const ctx = createMockToolContext({ connectedRepo: "acme/docs" });
			vi.mocked(ctx.spaceDao.getSpaceBySlug).mockResolvedValueOnce({
				id: 5,
				name: "docs",
				slug: "docs",
			} as never);

			const result = await getOrCreateRepoSpace(ctx);

			expect(result).toBe(5);
			expect(ctx.updateStepData).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 5 }));
		});

		it("should create new space when no existing space", async () => {
			const ctx = createMockToolContext({ connectedRepo: "acme/docs" });

			const result = await getOrCreateRepoSpace(ctx);

			expect(result).toBe(2); // Default mock returns id: 2
			expect(ctx.spaceDao.createSpace).toHaveBeenCalled();
		});

		it("should fall back to default space when no connected repo", async () => {
			const ctx = createMockToolContext();

			const result = await getOrCreateRepoSpace(ctx);

			expect(result).toBe(1); // Default space id
			expect(ctx.spaceDao.getDefaultSpace).toHaveBeenCalled();
		});

		it("should create default space when it does not exist", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.spaceDao.getDefaultSpace).mockResolvedValueOnce(null as never);

			const result = await getOrCreateRepoSpace(ctx);

			expect(result).toBe(1);
			expect(ctx.spaceDao.createDefaultSpaceIfNeeded).toHaveBeenCalled();
		});
	});
});
