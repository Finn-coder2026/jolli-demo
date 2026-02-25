import type { IntegrationDao } from "../../dao/IntegrationDao";
import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import { createScanRepoDocsToolDefinition, executeScanRepoDocsTool } from "./ScanRepoDocsTool";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn(),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	getAccessTokenForGitHubAppInstallation: vi.fn(),
}));

/** Creates a mock fetch Response with a JSON body. */
function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		statusText: ok ? "OK" : "Not Found",
		json: () => Promise.resolve(body),
	} as unknown as Response;
}

describe("ScanRepoDocsTool", () => {
	let deps: AgentHubToolDeps;
	let mockIntegrationDao: IntegrationDao;
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: 123, privateKey: "key" } as ReturnType<
			typeof getCoreJolliGithubApp
		>);
		vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("mock-token");
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockIntegrationDao = mocks.mockIntegrationDao;
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("createScanRepoDocsToolDefinition", () => {
		it("returns a valid tool definition with correct name and required params", () => {
			const def = createScanRepoDocsToolDefinition();
			expect(def.name).toBe("scan_repo_docs");
			expect(def.description).toBeTruthy();
			expect(def.parameters).toEqual({
				type: "object",
				properties: {
					repository: {
						type: "string",
						description: "Repository in 'owner/repo' format (e.g., 'acme/docs')",
					},
				},
				required: ["repository"],
			});
		});
	});

	describe("executeScanRepoDocsTool", () => {
		it("returns error for invalid repository format", async () => {
			const result = await executeScanRepoDocsTool(deps, { repository: "noslash" });
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain("Invalid repository format");
		});

		it("returns error when no access token is available", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);
			expect(parsed.error).toContain("Cannot access repository acme/docs");
		});

		it("returns markdown files from repo tree", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 42 },
				},
			] as never);

			vi.mocked(globalThis.fetch).mockResolvedValue(
				mockFetchResponse({
					tree: [
						{ path: "README.md", type: "blob", size: 1024 },
						{ path: "docs/guide.md", type: "blob", size: 2048 },
						{ path: "docs/api.mdx", type: "blob", size: 512 },
						{ path: "src/index.ts", type: "blob", size: 256 },
						{ path: "docs", type: "tree" },
					],
				}),
			);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.totalCount).toBe(3);
			expect(parsed.repository).toBe("acme/docs");
			expect(parsed.branch).toBe("main");
			expect(parsed.files).toEqual([
				{ path: "README.md", size: 1024 },
				{ path: "docs/guide.md", size: 2048 },
				{ path: "docs/api.mdx", size: 512 },
			]);
		});

		it("handles tree response with no tree property", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 42 },
				},
			] as never);

			vi.mocked(globalThis.fetch).mockResolvedValue(mockFetchResponse({ truncated: false }));

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.totalCount).toBe(0);
			expect(parsed.files).toEqual([]);
		});

		it("filters non-markdown files from tree", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/code",
					metadata: { repo: "acme/code", branch: "main", features: [], installationId: 10 },
				},
			] as never);

			vi.mocked(globalThis.fetch).mockResolvedValue(
				mockFetchResponse({
					tree: [
						{ path: "package.json", type: "blob", size: 300 },
						{ path: "src/App.tsx", type: "blob", size: 500 },
						{ path: "tsconfig.json", type: "blob", size: 200 },
						{ path: "node_modules", type: "tree" },
					],
				}),
			);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/code" });
			const parsed = JSON.parse(result);

			expect(parsed.totalCount).toBe(0);
			expect(parsed.files).toEqual([]);
		});

		it("uses matching integration's branch", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "develop", features: [], installationId: 42 },
				},
			] as never);

			vi.mocked(globalThis.fetch).mockResolvedValue(
				mockFetchResponse({
					tree: [{ path: "README.md", type: "blob", size: 100 }],
				}),
			);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.branch).toBe("develop");

			// Verify fetch was called with the correct branch in the URL
			const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
			expect(fetchCall[0]).toContain("/git/trees/develop");
		});

		it("defaults to main when matching integration has no branch", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: undefined, features: [], installationId: 42 },
				},
			] as never);

			vi.mocked(globalThis.fetch).mockResolvedValue(
				mockFetchResponse({
					tree: [{ path: "README.md", type: "blob", size: 100 }],
				}),
			);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.branch).toBe("main");
			const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
			expect(fetchCall[0]).toContain("/git/trees/main");
		});

		it("returns error when GitHub API tree fetch fails", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 42 },
				},
			] as never);

			vi.mocked(globalThis.fetch).mockResolvedValue(mockFetchResponse({}, false, 500));

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Failed to read repository tree");
			expect(parsed.error).toContain("acme/docs");
			expect(parsed.error).toContain("main");
		});

		it("returns error when integration has no installationId", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [] },
				},
			] as never);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Cannot access repository");
		});

		it("returns error when GitHub app is not configured", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValue(null as never);

			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 42 },
				},
			] as never);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Cannot access repository");
		});

		it("returns error when GitHub app has negative appId", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: -1 } as never);

			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 42 },
				},
			] as never);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Cannot access repository");
		});

		it("falls back to any active GitHub integration when no exact repo match", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/other-repo",
					metadata: { repo: "acme/other-repo", branch: "main", features: [], installationId: 99 },
				},
			] as never);

			vi.mocked(globalThis.fetch).mockResolvedValue(
				mockFetchResponse({
					tree: [{ path: "docs/intro.md", type: "blob", size: 800 }],
				}),
			);

			const result = await executeScanRepoDocsTool(deps, { repository: "acme/docs" });
			const parsed = JSON.parse(result);

			// Should succeed using the fallback integration's token
			expect(parsed.totalCount).toBe(1);
			expect(parsed.files).toEqual([{ path: "docs/intro.md", size: 800 }]);
			// Branch defaults to "main" since there's no matching integration
			expect(parsed.branch).toBe("main");
		});
	});
});
