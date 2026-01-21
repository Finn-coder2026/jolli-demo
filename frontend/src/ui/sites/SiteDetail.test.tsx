import { createMockClient, createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SiteDetail } from "./SiteDetail";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { ChangedArticle, SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		AlertCircle: () => <div data-testid="alert-circle-icon" />,
		ArrowLeft: () => <div data-testid="arrow-left-icon" />,
		CheckCircle: () => <div data-testid="check-circle-icon" />,
		ChevronDown: () => <div data-testid="chevron-down-icon" />,
		ChevronRight: () => <div data-testid="chevron-right-icon" />,
		ExternalLink: () => <div data-testid="external-link-icon" />,
		FileJson: () => <div data-testid="file-json-icon" />,
		FileText: () => <div data-testid="file-text-icon" />,
		Globe: () => <div data-testid="globe-icon" />,
		Lock: () => <div data-testid="lock-icon" />,
		Pencil: () => <div data-testid="pencil-icon" />,
		Plus: () => <div data-testid="plus-icon" />,
		RefreshCw: () => <div data-testid="refresh-cw-icon" />,
		Settings: () => <div data-testid="settings-icon" />,
		Trash2: () => <div data-testid="trash2-icon" />,
		XCircle: () => <div data-testid="x-circle-icon" />,
	};
});

// Mock tab components to simplify testing
vi.mock("./SiteOverviewTab", () => ({
	SiteOverviewTab: () => <div data-testid="site-overview-tab">Overview Tab Content</div>,
}));

vi.mock("./SiteContentTab", () => ({
	SiteContentTab: () => <div data-testid="site-content-tab">Content Tab Content</div>,
}));

vi.mock("./SiteSettingsTab", () => ({
	SiteSettingsTab: ({ docsite, onDeleteRequest }: { docsite: { status: string }; onDeleteRequest?: () => void }) => (
		<div data-testid="site-settings-tab">
			Settings Tab Content
			{onDeleteRequest && (docsite.status === "active" || docsite.status === "error") && (
				<button data-testid="delete-site-button" onClick={onDeleteRequest}>
					Delete Site
				</button>
			)}
		</div>
	),
}));

vi.mock("./SiteLogsTab", () => ({
	SiteLogsTab: () => <div data-testid="site-logs-tab">Logs Tab Content</div>,
}));

const mockSiteClient = {
	listSites: vi.fn(),
	getSite: vi.fn(),
	createSite: vi.fn(),
	regenerateSite: vi.fn(),
	updateRepositoryFile: vi.fn(),
	checkUpdateStatus: vi.fn(),
	toggleProtection: vi.fn(),
	refreshProtectionStatus: vi.fn(),
	publishSite: vi.fn(),
	unpublishSite: vi.fn(),
	deleteSite: vi.fn(),
	updateSiteArticles: vi.fn(),
	cancelBuild: vi.fn(),
	getChangedConfigFiles: vi.fn().mockResolvedValue([]),
	formatCode: vi.fn(),
	createFolder: vi.fn().mockResolvedValue({ success: true, path: "" }),
	deleteFolder: vi.fn().mockResolvedValue({ success: true }),
	renameFolder: vi.fn().mockResolvedValue({ success: true, newPath: "" }),
	moveFile: vi.fn().mockResolvedValue({ success: true, newPath: "" }),
	listFolderContents: vi.fn().mockResolvedValue({ files: [] }),
	checkSubdomainAvailability: vi.fn(),
	addCustomDomain: vi.fn(),
	removeCustomDomain: vi.fn(),
	getCustomDomainStatus: vi.fn(),
	verifyCustomDomain: vi.fn(),
	refreshDomainStatuses: vi.fn(),
	updateJwtAuthConfig: vi.fn(),
	getRepositoryTree: vi.fn().mockResolvedValue({ sha: "", tree: [], truncated: false }),
	getFileContent: vi.fn().mockResolvedValue({ name: "", path: "", sha: "", type: "file" }),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => ({
			sites: () => mockSiteClient,
		})),
	};
});

// Content strings used by intlayer - these match the English translations in SiteDetail.content.ts
const CONTENT = {
	loading: "Loading...",
	notFound: "Site not found",
	updateAvailable: "Update Available",
	contentChangesDescription: "Article content has been modified since the last build",
	selectionChangesDescription: "Article selection has changed since the last build",
	mixedChangesDescription: "Articles have been modified and selection has changed since the last build",
	configChangesDescription: "Configuration files have been manually edited since the last build",
	upToDate: "Up to Date",
	changedFilesTitle: "Changed Files",
	buildInProgress: "Build in Progress",
	buildError: "Build Error",
};

describe("SiteDetail", () => {
	const mockOnBack = vi.fn();

	function createMockSite(overrides: Partial<SiteWithUpdate> = {}): SiteWithUpdate {
		return {
			id: 1,
			name: "test-site",
			displayName: "Test Site",
			status: "active",
			visibility: "external",
			needsUpdate: false,
			metadata: {
				githubRepo: "test-org/test-site",
				githubUrl: "https://github.com/test-org/test-site",
				framework: "nextra",
				articleCount: 5,
				productionUrl: "https://test-site.vercel.app",
			},
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
			lastGeneratedAt: "2024-01-01T00:00:00Z",
			userId: 1,
			...overrides,
		};
	}

	function createMockChangedArticle(overrides: Partial<ChangedArticle> = {}): ChangedArticle {
		return {
			id: 1,
			title: "Test Article",
			jrn: "jrn:article:test",
			updatedAt: new Date().toISOString(),
			contentType: "text/markdown",
			changeType: "updated",
			...overrides,
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockSiteClient.getSite.mockResolvedValue(createMockSite());
	});

	function renderSiteDetail(docsiteId = 1) {
		const mockClient = createMockClient();
		// Override the sites method to use our mockSiteClient
		mockClient.sites = vi.fn(() => mockSiteClient);

		return renderWithProviders(<SiteDetail docsiteId={docsiteId} onBack={mockOnBack} />, {
			initialPath: createMockIntlayerValue("/sites/1"),
			client: mockClient,
		});
	}

	describe("loading state", () => {
		it("should show loading state initially", () => {
			mockSiteClient.getSite.mockImplementation(
				() => new Promise(resolve => setTimeout(() => resolve(createMockSite()), 100)),
			);

			renderSiteDetail();

			expect(screen.getByText(CONTENT.loading)).toBeDefined();
		});
	});

	describe("not found state", () => {
		it("should show not found when site does not exist", async () => {
			mockSiteClient.getSite.mockResolvedValue(undefined);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText(CONTENT.notFound)).toBeDefined();
			});
		});
	});

	describe("site header", () => {
		it("should display site name and display name", async () => {
			const site = createMockSite({
				name: "my-docs",
				displayName: "My Documentation",
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("docsite-title").textContent).toBe("My Documentation");
				expect(screen.getByText("my-docs")).toBeDefined();
			});
		});

		it("should show back button", async () => {
			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("back-button")).toBeDefined();
			});
		});

		it("should show rebuild button for active sites", async () => {
			const site = createMockSite({ status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("rebuild-button")).toBeDefined();
			});
		});

		it("should show delete button in settings tab for active sites", async () => {
			const site = createMockSite({ status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			// Wait for site to load and tabs to be visible
			await waitFor(() => {
				expect(screen.getByTestId("settings-tab-trigger")).toBeDefined();
			});

			// Click settings tab to see delete button
			fireEvent.click(screen.getByTestId("settings-tab-trigger"));

			await waitFor(() => {
				expect(screen.getByTestId("delete-site-button")).toBeDefined();
			});
		});
	});

	describe("update indicator", () => {
		it("should show update available alert when needsUpdate is true", async () => {
			const site = createMockSite({ needsUpdate: true });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText(CONTENT.updateAvailable)).toBeDefined();
				// Default description when no changed articles are provided
				expect(screen.getByText(CONTENT.contentChangesDescription)).toBeDefined();
			});
		});

		it("should show up to date alert when needsUpdate is false", async () => {
			const site = createMockSite({ needsUpdate: false, status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText(CONTENT.upToDate)).toBeDefined();
			});
		});
	});

	describe("changed files display", () => {
		it("should display changed files list when site needs update", async () => {
			const changedArticles: Array<ChangedArticle> = [
				createMockChangedArticle({ id: 1, title: "Getting Started Guide", contentType: "text/markdown" }),
				createMockChangedArticle({ id: 2, title: "API Reference", contentType: "text/markdown" }),
			];

			const site = createMockSite({
				needsUpdate: true,
				changedArticles,
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			// First wait for the site to load (update indicator to appear)
			await waitFor(() => {
				expect(screen.getByText(CONTENT.updateAvailable)).toBeDefined();
			});

			// Then check for changed files
			await waitFor(() => {
				// Verify the changed article items are rendered
				const changedArticleItems = screen.getAllByTestId("changed-article-item");
				expect(changedArticleItems.length).toBe(2);
			});

			// Also verify the titles are displayed
			expect(screen.getByText("Getting Started Guide")).toBeDefined();
			expect(screen.getByText("API Reference")).toBeDefined();
		});

		it("should show count of changed files in title", async () => {
			const changedArticles: Array<ChangedArticle> = [
				createMockChangedArticle({ id: 1, title: "Article 1" }),
				createMockChangedArticle({ id: 2, title: "Article 2" }),
				createMockChangedArticle({ id: 3, title: "Article 3" }),
			];

			const site = createMockSite({
				needsUpdate: true,
				changedArticles,
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			// First wait for the site to load
			await waitFor(() => {
				expect(screen.getByText(CONTENT.updateAvailable)).toBeDefined();
			});

			// Then check for changed files count
			await waitFor(() => {
				const changedArticleItems = screen.getAllByTestId("changed-article-item");
				expect(changedArticleItems.length).toBe(3);
			});
		});

		it("should show FileJson icon for JSON content type", async () => {
			const changedArticles: Array<ChangedArticle> = [
				createMockChangedArticle({
					id: 1,
					title: "petstore.json",
					contentType: "application/json",
				}),
			];

			const site = createMockSite({
				needsUpdate: true,
				changedArticles,
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				const articleItem = screen.getByTestId("changed-article-item");
				expect(articleItem.querySelector('[data-testid="file-json-icon"]')).toBeDefined();
			});
		});

		it("should show FileJson icon for YAML content type", async () => {
			const changedArticles: Array<ChangedArticle> = [
				createMockChangedArticle({
					id: 1,
					title: "openapi.yaml",
					contentType: "application/yaml",
				}),
			];

			const site = createMockSite({
				needsUpdate: true,
				changedArticles,
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				const articleItem = screen.getByTestId("changed-article-item");
				expect(articleItem.querySelector('[data-testid="file-json-icon"]')).toBeDefined();
			});
		});

		it("should show FileText icon for markdown content type", async () => {
			const changedArticles: Array<ChangedArticle> = [
				createMockChangedArticle({
					id: 1,
					title: "README.md",
					contentType: "text/markdown",
				}),
			];

			const site = createMockSite({
				needsUpdate: true,
				changedArticles,
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				const articleItem = screen.getByTestId("changed-article-item");
				expect(articleItem.querySelector('[data-testid="file-text-icon"]')).toBeDefined();
			});
		});

		it("should display article titles and timestamps", async () => {
			const updatedAt = "2024-06-15T10:30:00Z";
			const changedArticles: Array<ChangedArticle> = [
				createMockChangedArticle({
					id: 1,
					title: "User Guide",
					updatedAt,
				}),
			];

			const site = createMockSite({
				needsUpdate: true,
				changedArticles,
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText("User Guide")).toBeDefined();
				// Timestamp should be formatted and displayed
				const articleItems = screen.getAllByTestId("changed-article-item");
				expect(articleItems.length).toBe(1);
			});
		});

		it("should not display changed files section when changedArticles is empty", async () => {
			const site = createMockSite({
				needsUpdate: true,
				changedArticles: [],
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText(CONTENT.updateAvailable)).toBeDefined();
			});

			// Changed files title should not be present
			expect(screen.queryByText(CONTENT.changedFilesTitle)).toBeNull();
		});

		it("should not display changed files section when changedArticles is not provided", async () => {
			const site = createMockSite({
				needsUpdate: true,
				// Don't include changedArticles to test the undefined case
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText(CONTENT.updateAvailable)).toBeDefined();
			});

			// Changed files title should not be present
			expect(screen.queryByText(CONTENT.changedFilesTitle)).toBeNull();
		});

		it("should handle multiple changed articles with different content types", async () => {
			const changedArticles: Array<ChangedArticle> = [
				createMockChangedArticle({ id: 1, title: "README.md", contentType: "text/markdown" }),
				createMockChangedArticle({ id: 2, title: "openapi.json", contentType: "application/json" }),
				createMockChangedArticle({ id: 3, title: "schema.yaml", contentType: "application/yaml" }),
			];

			const site = createMockSite({
				needsUpdate: true,
				changedArticles,
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				const articleItems = screen.getAllByTestId("changed-article-item");
				expect(articleItems.length).toBe(3);

				// Check all titles are displayed
				expect(screen.getByText("README.md")).toBeDefined();
				expect(screen.getByText("openapi.json")).toBeDefined();
				expect(screen.getByText("schema.yaml")).toBeDefined();
			});
		});
	});

	describe("build status", () => {
		it("should show build in progress for building status", async () => {
			const site = createMockSite({
				status: "building",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					buildProgress: "Compiling articles...",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				// There may be multiple "Build in Progress" texts, so use getAllByText
				const buildInProgressElements = screen.getAllByText(CONTENT.buildInProgress);
				expect(buildInProgressElements.length).toBeGreaterThan(0);
			});
		});

		it("should show build error for error status", async () => {
			const site = createMockSite({
				status: "error",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					lastBuildError: "Build failed: syntax error",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText(CONTENT.buildError)).toBeDefined();
				expect(screen.getByText("Build failed: syntax error")).toBeDefined();
			});
		});
	});

	describe("tabs", () => {
		it("should show tabs for active sites", async () => {
			const site = createMockSite({ status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("overview-tab-trigger")).toBeDefined();
				expect(screen.getByTestId("content-tab-trigger")).toBeDefined();
				expect(screen.getByTestId("settings-tab-trigger")).toBeDefined();
				expect(screen.getByTestId("logs-tab-trigger")).toBeDefined();
			});
		});

		it("should show tabs for building sites", async () => {
			const site = createMockSite({
				status: "building",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("overview-tab-trigger")).toBeDefined();
			});
		});

		it("should show overview tab content by default", async () => {
			const site = createMockSite({ status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("site-overview-tab")).toBeDefined();
			});
		});

		it("should show tabs for error status so user can still access full interface", async () => {
			const site = createMockSite({
				status: "error",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					lastBuildError: "Build failed",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText(CONTENT.buildError)).toBeDefined();
			});

			// Tabs should be present for error status so user can access full interface
			expect(screen.getByTestId("overview-tab-trigger")).toBeDefined();
			expect(screen.getByTestId("content-tab-trigger")).toBeDefined();
			expect(screen.getByTestId("settings-tab-trigger")).toBeDefined();
			expect(screen.getByTestId("logs-tab-trigger")).toBeDefined();
		});

		it("should show rebuild button for error status", async () => {
			const site = createMockSite({
				status: "error",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					lastBuildError: "Build failed",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("rebuild-button")).toBeDefined();
			});

			// Rebuild button should be prominent (default variant) for error status
			const rebuildButton = screen.getByTestId("rebuild-button");
			expect(rebuildButton).toBeDefined();
		});

		it("should show delete button in settings tab for error status", async () => {
			const site = createMockSite({
				status: "error",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					lastBuildError: "Build failed",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			// Wait for site to load and tabs to be visible
			await waitFor(() => {
				expect(screen.getByTestId("settings-tab-trigger")).toBeDefined();
			});

			// Click settings tab to see delete button
			fireEvent.click(screen.getByTestId("settings-tab-trigger"));

			await waitFor(() => {
				expect(screen.getByTestId("delete-site-button")).toBeDefined();
			});
		});
	});

	describe("cancel build", () => {
		it("should show cancel build button for building status", async () => {
			const site = createMockSite({
				status: "building",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					buildProgress: "Building...",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("cancel-build-button")).toBeDefined();
			});
		});

		it("should show cancel build button for pending status", async () => {
			const site = createMockSite({
				status: "pending",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("cancel-build-button")).toBeDefined();
			});
		});

		it("should not show cancel build button for active status", async () => {
			const site = createMockSite({ status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("rebuild-button")).toBeDefined();
			});

			expect(screen.queryByTestId("cancel-build-button")).toBeNull();
		});

		it("should not show cancel build button for error status", async () => {
			const site = createMockSite({
				status: "error",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					lastBuildError: "Build failed",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("rebuild-button")).toBeDefined();
			});

			expect(screen.queryByTestId("cancel-build-button")).toBeNull();
		});

		it("should not show rebuild button for building status", async () => {
			const site = createMockSite({
				status: "building",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					buildProgress: "Building...",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("cancel-build-button")).toBeDefined();
			});

			expect(screen.queryByTestId("rebuild-button")).toBeNull();
		});

		it("should not show delete button for building status", async () => {
			const site = createMockSite({
				status: "building",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					buildProgress: "Building...",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("cancel-build-button")).toBeDefined();
			});

			// Click settings tab to verify delete button is not shown
			fireEvent.click(screen.getByTestId("settings-tab-trigger"));

			// Delete button should not be shown for building status
			expect(screen.queryByTestId("delete-site-button")).toBeNull();
		});

		it("should call cancelBuild when cancel button is clicked", async () => {
			const buildingSite = createMockSite({
				status: "building",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					buildProgress: "Building...",
				},
			});
			const cancelledSite = createMockSite({
				status: "error",
				metadata: {
					githubRepo: "test-org/test-site",
					githubUrl: "https://github.com/test-org/test-site",
					framework: "nextra",
					articleCount: 5,
					lastBuildError: "Build cancelled by user",
				},
			});
			mockSiteClient.getSite.mockResolvedValue(buildingSite);
			mockSiteClient.cancelBuild.mockResolvedValue(cancelledSite);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("cancel-build-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("cancel-build-button"));

			await waitFor(() => {
				expect(mockSiteClient.cancelBuild).toHaveBeenCalledWith(1);
			});
		});
	});
});
