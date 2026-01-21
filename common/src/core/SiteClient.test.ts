import type { ClientAuth } from "./Client";
import { createSiteClient } from "./SiteClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for new SiteClient methods added for JOLLI-285 (private GitHub repo support).
 * These methods proxy GitHub API requests through the backend to access private repos.
 */

// Helper to create a mock auth object
function createMockAuth(checkUnauthorized?: (response: Response) => boolean): ClientAuth {
	const auth: ClientAuth = {
		createRequest: (method, body, additional) => {
			const headers: Record<string, string> = {};
			if (body) {
				headers["Content-Type"] = "application/json";
			}

			return {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
				...additional,
			};
		},
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

describe("SiteClient - GitHub proxy methods", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	describe("getRepositoryTree", () => {
		it("should get repository tree with default branch", async () => {
			const mockTree = {
				sha: "abc123",
				tree: [
					{ path: "content", mode: "040000", type: "tree", sha: "sha1" },
					{ path: "content/_meta.ts", mode: "100644", type: "blob", sha: "sha2", size: 100 },
				],
				truncated: false,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockTree,
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());
			const result = await client.getRepositoryTree(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/sites/1/github/tree?branch=main", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockTree);
		});

		it("should get repository tree with custom branch", async () => {
			const mockTree = {
				sha: "def456",
				tree: [],
				truncated: false,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockTree,
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());
			const result = await client.getRepositoryTree(1, "develop");

			expect(mockFetch).toHaveBeenCalledWith("/api/sites/1/github/tree?branch=develop", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockTree);
		});

		it("should URL-encode branch name with special characters", async () => {
			const mockTree = { sha: "abc", tree: [], truncated: false };

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockTree,
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());
			await client.getRepositoryTree(1, "feature/my-branch");

			expect(mockFetch).toHaveBeenCalledWith(
				"/api/sites/1/github/tree?branch=feature%2Fmy-branch",
				expect.any(Object),
			);
		});

		it("should throw error with message from response when request fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
				json: async () => ({ error: "Site not found" }),
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());

			await expect(client.getRepositoryTree(999)).rejects.toThrow("Site not found");
		});

		it("should throw error with statusText when json parsing fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Gateway",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());

			// When JSON parsing fails, the catch block returns { error: statusText }
			// so the error message is just the statusText
			await expect(client.getRepositoryTree(1)).rejects.toThrow("Bad Gateway");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ sha: "abc", tree: [], truncated: false }),
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth(checkUnauthorized));
			await client.getRepositoryTree(1);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("getFileContent", () => {
		it("should get file content with default branch", async () => {
			const mockContent = {
				name: "_meta.ts",
				path: "content/_meta.ts",
				sha: "abc123",
				type: "file",
				content: "ZXhwb3J0IGRlZmF1bHQge30=", // base64 encoded
				encoding: "base64",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockContent,
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());
			const result = await client.getFileContent(1, "content/_meta.ts");

			expect(mockFetch).toHaveBeenCalledWith("/api/sites/1/github/content?path=content%2F_meta.ts&branch=main", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockContent);
		});

		it("should get file content with custom branch", async () => {
			const mockContent = {
				name: "index.mdx",
				path: "content/index.mdx",
				sha: "def456",
				type: "file",
				content: "IyBIZWxsbw==",
				encoding: "base64",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockContent,
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());
			const result = await client.getFileContent(1, "content/index.mdx", "develop");

			expect(mockFetch).toHaveBeenCalledWith(
				"/api/sites/1/github/content?path=content%2Findex.mdx&branch=develop",
				expect.any(Object),
			);
			expect(result).toEqual(mockContent);
		});

		it("should URL-encode path with special characters", async () => {
			const mockContent = { name: "file.ts", path: "path", sha: "abc", type: "file" };

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockContent,
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());
			await client.getFileContent(1, "content/my file (1).mdx");

			expect(mockFetch).toHaveBeenCalledWith(
				"/api/sites/1/github/content?path=content%2Fmy%20file%20(1).mdx&branch=main",
				expect.any(Object),
			);
		});

		it("should throw error with message from response when request fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
				json: async () => ({ error: "File not found" }),
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());

			await expect(client.getFileContent(1, "nonexistent.ts")).rejects.toThrow("File not found");
		});

		it("should throw error with statusText when json parsing fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
				json: () => Promise.reject(new Error("Invalid JSON")),
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth());

			// When JSON parsing fails, the catch block returns { error: statusText }
			// so the error message is just the statusText
			await expect(client.getFileContent(1, "file.ts")).rejects.toThrow("Internal Server Error");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ name: "file", path: "path", sha: "abc", type: "file" }),
			});
			global.fetch = mockFetch;

			const client = createSiteClient("", createMockAuth(checkUnauthorized));
			await client.getFileContent(1, "file.ts");

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});
});
