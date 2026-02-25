/**
 * Tests for ImportAllMarkdownTool - GIT_PUSH trigger injection during import.
 */

import type { GithubRepoIntegration } from "../../model/Integration";
import type { Space } from "../../model/Space";
import type { OnboardingToolContext } from "../types";
import { importAllMarkdownTool } from "./ImportAllMarkdownTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the GitHub utilities
vi.mock("./ToolUtils", () => ({
	getActiveGithubIntegration: vi.fn(),
	getAccessTokenForIntegration: vi.fn(),
	fetchFileContent: vi.fn(),
	extractTitleFromContent: vi.fn(),
	getOrCreateRepoSpace: vi.fn(),
}));

vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn().mockReturnValue({ appId: 123 }),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	getAccessTokenForGitHubAppInstallation: vi.fn(),
}));

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import {
	extractTitleFromContent,
	fetchFileContent,
	getAccessTokenForIntegration,
	getActiveGithubIntegration,
	getOrCreateRepoSpace,
} from "./ToolUtils";

describe("ImportAllMarkdownTool", () => {
	let mockContext: OnboardingToolContext;
	let mockIntegration: GithubRepoIntegration;
	let mockSpace: Space;

	beforeEach(() => {
		vi.clearAllMocks();

		mockIntegration = {
			id: 1,
			type: "github",
			name: "my-org/my-repo",
			status: "active",
			metadata: {
				repo: "my-org/my-repo",
				branch: "main",
				features: [],
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		} as GithubRepoIntegration;

		mockSpace = {
			id: 1,
			name: "Default Space",
		} as Space;

		mockContext = {
			userId: 1,
			stepData: {
				discoveredFiles: ["docs/readme.md"],
				spaceId: 1,
			},
			updateStepData: vi.fn().mockResolvedValue(undefined),
			advanceStep: vi.fn().mockResolvedValue(undefined),
			completeOnboarding: vi.fn().mockResolvedValue(undefined),
			skipOnboarding: vi.fn().mockResolvedValue(undefined),
			integrationDao: {
				listIntegrations: vi.fn().mockResolvedValue([mockIntegration]),
			} as never,
			docDao: {
				createDoc: vi.fn().mockImplementation(async (args: Record<string, unknown>) => ({
					id: 1,
					jrn: "jrn::path:/home/global/docs/document/test-abc123",
					content: args.content,
					contentMetadata: args.contentMetadata,
					spaceId: args.spaceId,
				})),
				findDocBySourcePathAnySpace: vi.fn().mockResolvedValue(undefined),
			} as never,
			githubInstallationDao: {
				listInstallations: vi.fn().mockResolvedValue([]),
			} as never,
			spaceDao: {
				getDefaultSpace: vi.fn().mockResolvedValue(mockSpace),
				createDefaultSpaceIfNeeded: vi.fn().mockResolvedValue(mockSpace),
			} as never,
			docDraftDao: {} as never,
			docDraftSectionChangesDao: {} as never,
			userPreferenceDao: {
				getPreference: vi.fn().mockResolvedValue(undefined),
				getHash: vi.fn().mockResolvedValue("0000000000000000"),
				upsertPreference: vi.fn().mockResolvedValue({}),
			} as never,
		};

		// Default mock implementations
		vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: 123 } as never);
		vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("mock-install-token");
		vi.mocked(getActiveGithubIntegration).mockResolvedValue(mockIntegration);
		vi.mocked(getAccessTokenForIntegration).mockResolvedValue("test-token");
		vi.mocked(getOrCreateRepoSpace).mockResolvedValue(1);
		vi.mocked(extractTitleFromContent).mockImplementation((content: string) => {
			const match = content.match(/^#\s+(.+)/m);
			return match?.[1] ?? "Untitled";
		});
	});

	describe("GIT_PUSH trigger injection", () => {
		it("should inject on: trigger frontmatter into imported .md files", async () => {
			const rawContent = "# Hello World\n\nSome content.";
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: rawContent,
				sha: "abc123",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall).toBeDefined();
			const storedContent = createDocCall?.content as string;
			expect(storedContent).toContain("jrn:*:path:/home/*/sources/github/my-org/my-repo/main");
			expect(storedContent).toContain("verb: GIT_PUSH");
			expect(storedContent).toContain("# Hello World");
		});

		it("should NOT inject trigger frontmatter into non-markdown files", async () => {
			mockContext.stepData.discoveredFiles = ["config/settings.json"];
			const rawContent = '{"key": "value"}';
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: rawContent,
				sha: "def456",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall).toBeDefined();
			expect(createDocCall?.content).toBe(rawContent);
		});

		it("should inject trigger into .mdx files", async () => {
			mockContext.stepData.discoveredFiles = ["docs/component.mdx"];
			const rawContent = "# Component\n\n<Component />";
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: rawContent,
				sha: "ghi789",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall).toBeDefined();
			const storedContent = createDocCall?.content as string;
			expect(storedContent).toContain("verb: GIT_PUSH");
			expect(storedContent).toContain("my-org/my-repo/main");
		});

		it("should preserve existing frontmatter fields when injecting trigger", async () => {
			const rawContent = `---
title: Existing Title
author: Jane
---
# Hello World`;
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: rawContent,
				sha: "jkl012",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall).toBeDefined();
			const storedContent = createDocCall?.content as string;
			expect(storedContent).toContain("title: Existing Title");
			expect(storedContent).toContain("author: Jane");
			expect(storedContent).toContain("verb: GIT_PUSH");
		});

		it("should extract title correctly after trigger injection", async () => {
			const rawContent = "# My Article\n\nBody text.";
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: rawContent,
				sha: "mno345",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall).toBeDefined();
			const metadata = createDocCall?.contentMetadata as Record<string, unknown>;
			// extractTitleFromContent is called on the injected content, which still has the heading
			expect(metadata?.title).toBe("My Article");
		});

		it("should use correct repo/branch from integration metadata", async () => {
			mockIntegration.metadata.repo = "acme/docs-site";
			mockIntegration.metadata.branch = "develop";

			const rawContent = "# Guide\n\nSteps here.";
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: rawContent,
				sha: "pqr678",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			const storedContent = createDocCall?.content as string;
			expect(storedContent).toContain("jrn:*:path:/home/*/sources/github/acme/docs-site/develop");
		});
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(importAllMarkdownTool.definition.name).toBe("import_all_markdown");
		});

		it("should not require any parameters", () => {
			expect(importAllMarkdownTool.definition.parameters.required).toEqual([]);
		});
	});

	describe("handler - file paths and space", () => {
		it("should parse comma-separated file_paths argument", async () => {
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# File\n\nContent",
				sha: "abc",
			});

			const result = await importAllMarkdownTool.handler(
				{ file_paths: "docs/a.md, docs/b.md, docs/c.md" },
				mockContext,
			);

			expect(result.success).toBe(true);
			expect(vi.mocked(fetchFileContent)).toHaveBeenCalledTimes(3);
		});

		it("should use discoveredFiles from stepData when file_paths not provided", async () => {
			mockContext.stepData.discoveredFiles = ["file1.md", "file2.md"];
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Doc\n\nContent",
				sha: "abc",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			expect(vi.mocked(fetchFileContent)).toHaveBeenCalledTimes(2);
		});

		it("should fail when no files to import", async () => {
			mockContext.stepData.discoveredFiles = [];

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("No files to import");
		});

		it("should use space_id argument when provided", async () => {
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Doc\n\nContent",
				sha: "abc",
			});

			await importAllMarkdownTool.handler({ space_id: "5" }, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall?.spaceId).toBe(5);
		});

		it("should call getOrCreateRepoSpace when no spaceId available", async () => {
			mockContext.stepData.spaceId = undefined;
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Doc\n\nContent",
				sha: "abc",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			expect(getOrCreateRepoSpace).toHaveBeenCalledWith(mockContext);
		});
	});

	describe("handler - repo info fallback", () => {
		it("should fail when no integration and no connected repo", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);
			mockContext.stepData.connectedRepo = undefined;

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("No repository connected");
		});

		it("should fail when integration access token is unavailable", async () => {
			vi.mocked(getAccessTokenForIntegration).mockResolvedValue(undefined);

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Could not get access");
		});

		it("should use connected repo with installation fallback", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);
			mockContext.stepData.connectedRepo = "acme/docs";

			vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("install-token");

			vi.mocked(mockContext.githubInstallationDao.listInstallations).mockResolvedValue([
				{ name: "acme", installationId: 42 },
			] as never);

			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Content\n\nBody",
				sha: "abc",
			});

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(true);
		});

		it("should fail when connected repo installation has no access", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);
			mockContext.stepData.connectedRepo = "acme/docs";

			// No matching installations
			vi.mocked(mockContext.githubInstallationDao.listInstallations).mockResolvedValue([] as never);

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Could not get access");
		});

		it("should use default branch for connected repo", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);
			mockContext.stepData.connectedRepo = "acme/docs";
			mockIntegration.metadata.branch = undefined as never;

			vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("install-token");

			vi.mocked(mockContext.githubInstallationDao.listInstallations).mockResolvedValue([
				{ name: "acme", installationId: 42 },
			] as never);

			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Content",
				sha: "abc",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			expect(vi.mocked(fetchFileContent)).toHaveBeenCalledWith(
				"install-token",
				"acme",
				"docs",
				"docs/readme.md",
				"main",
			);
		});
	});

	describe("handler - deduplication", () => {
		it("should pass integrationId to findDocBySourcePathAnySpace for cross-repo scoping", async () => {
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Article\n\nContent",
				sha: "abc123",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			// mockIntegration.id is 1
			expect(mockContext.docDao.findDocBySourcePathAnySpace).toHaveBeenCalledWith("docs/readme.md", 1);
		});

		it("should skip file with identical content (skipped_same)", async () => {
			const existingContent = "# Existing\n\nSame content";
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue({
				id: 10,
				jrn: "jrn:existing",
				content: existingContent,
				spaceId: 1,
			} as never);
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: existingContent,
				sha: "abc",
			});

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Skipped (identical content)");
			expect(vi.mocked(mockContext.docDao.createDoc)).not.toHaveBeenCalled();
		});

		it("should skip file with changed content (skipped_exists)", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue({
				id: 10,
				jrn: "jrn:existing",
				content: "# Old\n\nOld content",
				spaceId: 1,
			} as never);
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# New\n\nNew content",
				sha: "abc",
			});

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Skipped (content changed");
			expect(result.content).toContain("review needed");
		});

		it("should use existing doc's space for import", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue({
				id: 10,
				jrn: "jrn:existing",
				content: "# Different\n\nOther content",
				spaceId: 5,
			} as never);
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Different\n\nOther content  ",
				sha: "abc",
			});

			const result = await importAllMarkdownTool.handler({}, mockContext);

			// Content matches after normalization, so it's skipped_same
			expect(result.success).toBe(true);
		});
	});

	describe("handler - processFile", () => {
		it("should handle file fetch failure", async () => {
			vi.mocked(fetchFileContent).mockResolvedValue(undefined);

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed");
			expect(result.content).toContain("Could not fetch file");
		});

		it("should include source info with integration id", async () => {
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Article\n\nContent",
				sha: "abc123",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall?.source).toEqual(expect.objectContaining({ integrationId: 1, type: "github" }));
		});

		it("should normalize file path (remove leading ./)", async () => {
			mockContext.stepData.discoveredFiles = ["./docs/readme.md"];
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Doc\n\nContent",
				sha: "abc",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			const sourceMetadata = createDocCall?.sourceMetadata as Record<string, unknown> | undefined;
			expect(sourceMetadata?.path).toBe("docs/readme.md");
		});
	});

	describe("handler - summary and results", () => {
		it("should build summary with imported, skipped, and failed files", async () => {
			mockContext.stepData.discoveredFiles = ["a.md", "b.md", "c.md"];

			// a.md - imported successfully
			vi.mocked(fetchFileContent)
				.mockResolvedValueOnce({ content: "# A\n\nContent A", sha: "a" })
				// b.md - fetch fails
				.mockResolvedValueOnce(undefined)
				// c.md - imported successfully
				.mockResolvedValueOnce({ content: "# C\n\nContent C", sha: "c" });

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Imported: 2");
			expect(result.content).toContain("Failed: 1");
			expect(result.uiAction?.type).toBe("import_completed");
		});

		it("should append to existing imported articles in step data", async () => {
			mockContext.stepData.importedArticles = ["jrn:old"];
			vi.mocked(fetchFileContent).mockResolvedValue({
				content: "# Doc\n\nContent",
				sha: "abc",
			});

			await importAllMarkdownTool.handler({}, mockContext);

			expect(mockContext.updateStepData).toHaveBeenCalledWith(
				expect.objectContaining({
					importedArticles: expect.arrayContaining(["jrn:old"]),
				}),
			);
		});

		it("should not include uiAction when no files imported", async () => {
			vi.mocked(fetchFileContent).mockResolvedValue(undefined);

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.uiAction).toBeUndefined();
		});

		it("should handle per-file exception gracefully", async () => {
			vi.mocked(fetchFileContent).mockRejectedValue(new Error("Network error"));

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed: 1");
			expect(result.content).toContain("Network error");
		});
	});

	describe("handler - error handling", () => {
		it("should handle top-level errors gracefully", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValue(new Error("Connection lost"));

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed to import files");
			expect(result.content).toContain("Connection lost");
		});

		it("should handle non-Error objects in catch block", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValue("string error");

			const result = await importAllMarkdownTool.handler({}, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Unknown error");
		});
	});
});
