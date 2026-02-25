import type { DocDao } from "../../dao/DocDao";
import type { IntegrationDao } from "../../dao/IntegrationDao";
import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps, wrapInProvider } from "./AgentHubToolTestUtils";
import {
	createImportRepoDocsToolDefinition,
	executeImportRepoDocsTool,
	extractTitleFromContent,
} from "./ImportRepoDocsTool";
import { injectGitPushTriggerFrontmatter } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn(),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	getAccessTokenForGitHubAppInstallation: vi.fn(),
}));

vi.mock("jolli-common", async importOriginal => {
	const actual = await importOriginal<typeof import("jolli-common")>();
	return {
		...actual,
		injectGitPushTriggerFrontmatter: vi.fn(),
	};
});

describe("ImportRepoDocsTool", () => {
	let deps: AgentHubToolDeps;
	let mockDocDao: DocDao;
	let mockIntegrationDao: IntegrationDao;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();

		const mocks = createMockDeps();
		mockDocDao = mocks.mockDocDao;
		mockIntegrationDao = mocks.mockIntegrationDao;
		deps = {
			...mocks.deps,
			docDaoProvider: wrapInProvider(mockDocDao),
			integrationDaoProvider: wrapInProvider(mockIntegrationDao),
		};

		// Re-establish default mock implementations after clearAllMocks
		vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: 123, privateKey: "key" } as never);
		vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("mock-token");
		vi.mocked(injectGitPushTriggerFrontmatter).mockImplementation((content: string) => content);
	});

	describe("createImportRepoDocsToolDefinition", () => {
		it("returns correct name and required params", () => {
			const def = createImportRepoDocsToolDefinition();

			expect(def.name).toBe("import_repo_docs");
			expect(def.description).toBeTruthy();
			expect(def.parameters.required).toEqual(["repository", "filePaths", "spaceId"]);
			expect(def.parameters.properties).toHaveProperty("repository");
			expect(def.parameters.properties).toHaveProperty("filePaths");
			expect(def.parameters.properties).toHaveProperty("spaceId");
		});
	});

	describe("executeImportRepoDocsTool", () => {
		it("returns error for invalid repository format", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "invalid-format",
				filePaths: ["docs/readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Invalid repository format");
		});

		it("returns error when no access token available", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Cannot access repository acme/docs");
		});

		it("successfully imports a markdown file", async () => {
			const mdContent = "# My Doc\nContent here";
			const base64Content = Buffer.from(mdContent).toString("base64");

			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: {
						repo: "acme/docs",
						branch: "main",
						features: [],
						installationId: 42,
					},
				},
			] as never);

			vi.mocked(mockDocDao.createDoc).mockResolvedValue({ id: 1, jrn: "jrn:test" } as never);

			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: vi.fn().mockResolvedValue({
						encoding: "base64",
						content: base64Content,
						sha: "abc123",
					}),
				}),
			);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/readme.md"],
				spaceId: 5,
			});
			const parsed = JSON.parse(result);

			expect(parsed.imported).toBe(1);
			expect(parsed.articles).toHaveLength(1);
			expect(parsed.articles[0].id).toBe(1);
			expect(parsed.articles[0].title).toBe("My Doc");
			expect(parsed.articles[0].path).toBe("docs/readme.md");
			expect(parsed.failed).toHaveLength(0);

			expect(mockDocDao.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					content: mdContent,
					contentType: "text/markdown",
					spaceId: 5,
					docType: "document",
					updatedBy: "1",
					createdBy: "1",
				}),
			);
		});

		it("handles failed file fetch gracefully", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: {
						repo: "acme/docs",
						branch: "main",
						features: [],
						installationId: 42,
					},
				},
			] as never);

			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: false,
					status: 404,
					statusText: "Not Found",
				}),
			);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/missing.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.imported).toBe(0);
			expect(parsed.failed).toHaveLength(1);
			expect(parsed.failed[0].path).toBe("docs/missing.md");
			expect(parsed.failed[0].error).toBe("Could not fetch file");
		});

		it("uses fallback GitHub integration when no matching repo integration exists", async () => {
			const mdContent = "# Fallback Doc\nSome content";
			const base64Content = Buffer.from(mdContent).toString("base64");

			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 20,
					type: "github",
					status: "active",
					name: "acme/other-repo",
					metadata: {
						repo: "acme/other-repo",
						branch: "develop",
						features: [],
						installationId: 99,
					},
				},
			] as never);

			vi.mocked(mockDocDao.createDoc).mockResolvedValue({ id: 2, jrn: "jrn:test2" } as never);

			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: vi.fn().mockResolvedValue({
						encoding: "base64",
						content: base64Content,
						sha: "def456",
					}),
				}),
			);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.imported).toBe(1);
			expect(parsed.articles[0].title).toBe("Fallback Doc");
		});

		it("returns error when integration has no installationId", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: {
						repo: "acme/docs",
						branch: "main",
						features: [],
						// No installationId
					},
				},
			] as never);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Cannot access repository");
		});

		it("returns error when GitHub app is null", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValue(null as never);

			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: {
						repo: "acme/docs",
						branch: "main",
						features: [],
						installationId: 42,
					},
				},
			] as never);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Cannot access repository");
		});

		it("returns error when GitHub app is not configured", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: -1 } as never);

			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: {
						repo: "acme/docs",
						branch: "main",
						features: [],
						installationId: 42,
					},
				},
			] as never);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.error).toContain("Cannot access repository");
		});

		it("handles base64 response with empty content field", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: {
						repo: "acme/docs",
						branch: "main",
						features: [],
						installationId: 42,
					},
				},
			] as never);

			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: vi.fn().mockResolvedValue({
						encoding: "base64",
						content: "",
						sha: "abc123",
					}),
				}),
			);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.imported).toBe(0);
			expect(parsed.failed).toHaveLength(1);
			expect(parsed.failed[0].error).toBe("Could not fetch file");
		});

		it("handles non-base64 encoded file response", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: {
						repo: "acme/docs",
						branch: "main",
						features: [],
						installationId: 42,
					},
				},
			] as never);

			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: vi.fn().mockResolvedValue({
						encoding: "utf-8",
						content: "plain text",
						sha: "abc123",
					}),
				}),
			);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.imported).toBe(0);
			expect(parsed.failed).toHaveLength(1);
			expect(parsed.failed[0].error).toBe("Could not fetch file");
		});

		it("rejects file paths with path traversal sequences", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 42 },
				},
			] as never);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["../etc/passwd", "/absolute/path.md", "docs/valid.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			// The two invalid paths should fail, the valid one still fetches
			expect(parsed.failed).toEqual(
				expect.arrayContaining([
					{ path: "../etc/passwd", error: "Invalid file path" },
					{ path: "/absolute/path.md", error: "Invalid file path" },
				]),
			);
		});

		it("handles createDoc error gracefully", async () => {
			const mdContent = "# Error Doc\nContent";
			const base64Content = Buffer.from(mdContent).toString("base64");

			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: {
						repo: "acme/docs",
						branch: "main",
						features: [],
						installationId: 42,
					},
				},
			] as never);

			vi.mocked(mockDocDao.createDoc).mockRejectedValue(new Error("DB error"));

			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: vi.fn().mockResolvedValue({
						encoding: "base64",
						content: base64Content,
						sha: "abc123",
					}),
				}),
			);

			const result = await executeImportRepoDocsTool(deps, 1, {
				repository: "acme/docs",
				filePaths: ["docs/readme.md"],
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(parsed.imported).toBe(0);
			expect(parsed.failed).toHaveLength(1);
			expect(parsed.failed[0].error).toBe("DB error");
		});
	});

	describe("extractTitleFromContent", () => {
		it("extracts title from frontmatter", () => {
			const content = '---\ntitle: "My Great Article"\ndate: 2024-01-01\n---\n\n# Heading\n\nBody text';
			expect(extractTitleFromContent(content)).toBe("My Great Article");
		});

		it("extracts title from frontmatter without quotes", () => {
			const content = "---\ntitle: My Great Article\ndate: 2024-01-01\n---\n\nBody text";
			expect(extractTitleFromContent(content)).toBe("My Great Article");
		});

		it("extracts title from H1 heading", () => {
			const content = "# My Heading\n\nSome paragraph text here.";
			expect(extractTitleFromContent(content)).toBe("My Heading");
		});

		it("falls back to Untitled when no title found", () => {
			const content = "Just some text without any heading or frontmatter.";
			expect(extractTitleFromContent(content)).toBe("Untitled");
		});

		it("prefers frontmatter title over H1 heading", () => {
			const content = '---\ntitle: "Frontmatter Title"\n---\n\n# Heading Title\n\nBody';
			expect(extractTitleFromContent(content)).toBe("Frontmatter Title");
		});
	});
});
