/**
 * Tests for ImportMarkdownTool - smart import with update detection.
 */

import type { Doc } from "../../model/Doc";
import type { DocDraft } from "../../model/DocDraft";
import type { GithubRepoIntegration } from "../../model/Integration";
import type { Space } from "../../model/Space";
import type { OnboardingToolContext } from "../types";
import { importMarkdownTool } from "./ImportMarkdownTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the GitHub utilities
vi.mock("./ToolUtils", () => ({
	getActiveGithubIntegration: vi.fn(),
	getAccessTokenForIntegration: vi.fn(),
	fetchFileContent: vi.fn(),
	extractTitleFromContent: vi.fn(),
}));

vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn().mockReturnValue({ appId: 123 }),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	getAccessTokenForGitHubAppInstallation: vi.fn(),
}));

vi.mock("./SectionDiffHelper", () => ({
	contentMatches: vi.fn(),
	createSectionChangesFromImport: vi.fn(),
}));

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import { contentMatches, createSectionChangesFromImport } from "./SectionDiffHelper";
import {
	extractTitleFromContent,
	fetchFileContent,
	getAccessTokenForIntegration,
	getActiveGithubIntegration,
} from "./ToolUtils";

describe("ImportMarkdownTool", () => {
	let mockContext: OnboardingToolContext;
	let mockIntegration: GithubRepoIntegration;
	let mockSpace: Space;
	let mockDoc: Doc;
	let mockDraft: DocDraft;

	beforeEach(() => {
		vi.clearAllMocks();

		mockIntegration = {
			id: 1,
			type: "github",
			name: "owner/repo",
			status: "active",
			metadata: {
				repo: "owner/repo",
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

		mockDoc = {
			id: 1,
			jrn: "jrn:prod:global:docs:document/test-article-abc123",
			content: "# Old Content\n\nOriginal text",
			contentMetadata: { title: "Test Article" },
			contentType: "text/markdown",
			spaceId: 1,
		} as Doc;

		mockDraft = {
			id: 42,
			docId: 1,
			title: "Test Article",
			content: "# Old Content\n\nOriginal text",
			contentType: "text/markdown",
			createdBy: 1,
		} as DocDraft;

		mockContext = {
			userId: 1,
			stepData: {},
			updateStepData: vi.fn().mockResolvedValue(undefined),
			advanceStep: vi.fn().mockResolvedValue(undefined),
			completeOnboarding: vi.fn().mockResolvedValue(undefined),
			skipOnboarding: vi.fn().mockResolvedValue(undefined),
			integrationDao: {
				listIntegrations: vi.fn().mockResolvedValue([mockIntegration]),
			} as never,
			docDao: {
				createDoc: vi.fn().mockResolvedValue(mockDoc),
				findDocBySourcePathAnySpace: vi.fn().mockResolvedValue(undefined),
			} as never,
			githubInstallationDao: {
				listInstallations: vi.fn().mockResolvedValue([]),
			} as never,
			spaceDao: {
				getDefaultSpace: vi.fn().mockResolvedValue(mockSpace),
				createDefaultSpaceIfNeeded: vi.fn().mockResolvedValue(mockSpace),
			} as never,
			docDraftDao: {
				findDraftByDocId: vi.fn().mockResolvedValue(undefined),
				createDocDraft: vi.fn().mockResolvedValue(mockDraft),
			} as never,
			docDraftSectionChangesDao: {
				createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
			} as never,
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
		vi.mocked(fetchFileContent).mockResolvedValue({
			content: "# New Content\n\nUpdated text",
			sha: "abc123",
		});
		vi.mocked(extractTitleFromContent).mockReturnValue("Test Article");
	});

	describe("handler", () => {
		it("should create new article when no existing doc with same source path", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Successfully imported");
			expect(result.uiAction?.type).toBe("import_completed");
			expect(mockContext.docDao.createDoc).toHaveBeenCalled();
		});

		it("should return 'already up to date' when content is identical", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(mockDoc);
			vi.mocked(contentMatches).mockReturnValue(true);

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			expect(result.content).toContain("already up to date");
			expect(mockContext.docDao.createDoc).not.toHaveBeenCalled();
		});

		it("should create draft with section changes when content differs", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(mockDoc);
			vi.mocked(contentMatches).mockReturnValue(false);
			vi.mocked(createSectionChangesFromImport).mockResolvedValue({
				hasChanges: true,
				changeCount: 3,
				summary: "2 sections updated, 1 added",
				counts: { updated: 2, inserted: 1, deleted: 0 },
			});

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Changes detected");
			expect(result.uiAction?.type).toBe("review_import_changes");
			expect(result.uiAction?.draftId).toBe(42);
			expect(result.uiAction?.articleJrn).toBe(mockDoc.jrn);
			expect(mockContext.docDraftDao.createDocDraft).toHaveBeenCalled();
			expect(createSectionChangesFromImport).toHaveBeenCalled();
		});

		it("should reuse existing draft when one exists for the article", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(mockDoc);
			vi.mocked(mockContext.docDraftDao.findDraftByDocId).mockResolvedValue(mockDraft);
			vi.mocked(contentMatches).mockReturnValue(false);
			vi.mocked(createSectionChangesFromImport).mockResolvedValue({
				hasChanges: true,
				changeCount: 1,
				summary: "1 section updated",
				counts: { updated: 1, inserted: 0, deleted: 0 },
			});

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			expect(result.uiAction?.draftId).toBe(42);
			// Should not create a new draft since one exists
			expect(mockContext.docDraftDao.createDocDraft).not.toHaveBeenCalled();
		});

		it("should return error when no GitHub integration connected", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);
			mockContext.stepData.connectedRepo = undefined;

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("No GitHub integration connected");
		});

		it("should return error when file cannot be fetched", async () => {
			vi.mocked(fetchFileContent).mockResolvedValue(undefined);

			const result = await importMarkdownTool.handler({ file_path: "nonexistent.md" }, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Could not fetch file");
		});

		it("should return import_failed action on error", async () => {
			vi.mocked(fetchFileContent).mockRejectedValue(new Error("Network error"));

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(false);
			expect(result.uiAction?.type).toBe("import_failed");
		});

		it("should use connected repo with installation fallback when no integration", async () => {
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

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			expect(result.content).toContain("Successfully imported");
		});

		it("should fail when connected repo installation has no access", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);
			mockContext.stepData.connectedRepo = "acme/docs";
			vi.mocked(mockContext.githubInstallationDao.listInstallations).mockResolvedValue([] as never);

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Could not get access");
		});

		it("should fail when integration has no access token", async () => {
			vi.mocked(getAccessTokenForIntegration).mockResolvedValue(undefined);

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Could not get access");
		});

		it("should use spaceId from stepData for new articles", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);
			mockContext.stepData.spaceId = 5;
			mockContext.stepData.spaceName = "My Custom Space";

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall?.spaceId).toBe(5);
			expect(result.content).toContain("My Custom Space");
		});

		it("should get default space when no spaceId in stepData", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);
			mockContext.stepData.spaceId = undefined;
			mockContext.stepData.spaceName = undefined;

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			expect(mockContext.spaceDao.getDefaultSpace).toHaveBeenCalled();
		});

		it("should create default space when getDefaultSpace returns null", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);
			mockContext.stepData.spaceId = undefined;
			vi.mocked(mockContext.spaceDao.getDefaultSpace).mockResolvedValue(null as never);

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			expect(mockContext.spaceDao.createDefaultSpaceIfNeeded).toHaveBeenCalled();
		});

		it("should fail when no space can be created", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);
			mockContext.stepData.spaceId = undefined;
			vi.mocked(mockContext.spaceDao.getDefaultSpace).mockResolvedValue(null as never);
			vi.mocked(mockContext.spaceDao.createDefaultSpaceIfNeeded).mockResolvedValue(null as never);

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Could not get or create a space");
		});

		it("should include source info with integration id", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);

			await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall?.source).toEqual(expect.objectContaining({ integrationId: 1, type: "github" }));
		});

		it("should omit source info when no integration id", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);
			// Use connected repo path (no integrationId)
			vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);
			mockContext.stepData.connectedRepo = "acme/docs";

			vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("install-token");
			vi.mocked(mockContext.githubInstallationDao.listInstallations).mockResolvedValue([
				{ name: "acme", installationId: 42 },
			] as never);

			await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(createDocCall?.source).toBeUndefined();
			expect(createDocCall?.sourceMetadata).toBeUndefined();
		});

		it("should use doc jrn from created doc or fallback to generated jrn", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);
			vi.mocked(mockContext.docDao.createDoc).mockResolvedValueOnce({
				id: 1,
				// No jrn property → triggers fallback
			} as never);

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(true);
			// Should still have a valid JRN (fallback to jrnParser.document)
			expect(result.content).toContain("Article JRN:");
		});

		it("should normalize file path (remove leading ./)", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);

			await importMarkdownTool.handler({ file_path: "./docs/readme.md" }, mockContext);

			const createDocCall = vi.mocked(mockContext.docDao.createDoc).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			const contentMetadata = createDocCall?.contentMetadata as Record<string, unknown> | undefined;
			// sourceUrl should not have "./" prefix
			expect(contentMetadata?.sourceUrl).toContain("/blob/main/docs/readme.md");
		});

		it("should advance step after successful import", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);

			await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(mockContext.advanceStep).toHaveBeenCalledWith("import_docs");
		});

		it("should pass integrationId to findDocBySourcePathAnySpace for cross-repo scoping", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);

			await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			// mockIntegration.id is 1
			expect(mockContext.docDao.findDocBySourcePathAnySpace).toHaveBeenCalledWith("docs/readme.md", 1);
		});

		it("should pass undefined integrationId when no integration exists", async () => {
			vi.mocked(mockContext.docDao.findDocBySourcePathAnySpace).mockResolvedValue(undefined);
			// Use connected repo path (no integrationId)
			vi.mocked(getActiveGithubIntegration).mockResolvedValue(undefined);
			mockContext.stepData.connectedRepo = "acme/docs";
			vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("install-token");
			vi.mocked(mockContext.githubInstallationDao.listInstallations).mockResolvedValue([
				{ name: "acme", installationId: 42 },
			] as never);

			await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(mockContext.docDao.findDocBySourcePathAnySpace).toHaveBeenCalledWith("docs/readme.md", undefined);
		});

		it("should handle non-Error objects in error catch block", async () => {
			vi.mocked(fetchFileContent).mockRejectedValue("string error");

			const result = await importMarkdownTool.handler({ file_path: "docs/readme.md" }, mockContext);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Unknown error");
		});
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(importMarkdownTool.definition.name).toBe("import_markdown");
		});

		it("should require file_path parameter", () => {
			expect(importMarkdownTool.definition.parameters.required).toContain("file_path");
		});

		it("should have updated description mentioning update detection", () => {
			expect(importMarkdownTool.definition.description).toContain("previously imported");
		});
	});
});
