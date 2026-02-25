import { createMockClient, createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { createMockChangedArticle, createMockSite } from "./__testUtils__/SiteTestFactory";
import { SiteDetail } from "./SiteDetail";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { ChangedArticle } from "jolli-common";
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
vi.mock("./SiteContentTab", () => ({
	SiteContentTab: () => <div data-testid="site-content-tab">Content Tab Content</div>,
}));

vi.mock("./branding", () => ({
	SiteBrandingTab: () => <div data-testid="site-branding-tab">Branding Tab Content</div>,
}));

vi.mock("./SiteTreeNav", () => ({
	SiteTreeNav: ({
		onViewChange,
		activeView,
	}: {
		site: unknown;
		activeView: string;
		onViewChange: (view: string) => void;
		onSiteChange: (site: unknown) => void;
	}) => (
		<div data-testid="site-tree-nav">
			<button data-testid="nav-navigation" onClick={() => onViewChange("navigation")}>
				Navigation
			</button>
			<button data-testid="nav-content" onClick={() => onViewChange("content")}>
				Content
			</button>
			<button data-testid="nav-branding" onClick={() => onViewChange("branding")}>
				Branding
			</button>
			<span data-testid="active-view">{activeView}</span>
		</div>
	),
}));

vi.mock("./SiteNavigationTab", () => ({
	SiteNavigationTab: () => <div data-testid="site-navigation-tab">Navigation Tab Content</div>,
}));

vi.mock("./SiteRebuildIndicator", () => ({
	SiteRebuildIndicator: ({
		site,
		rebuilding,
		onRebuild,
	}: {
		site: { status: string; needsUpdate?: boolean };
		rebuilding: boolean;
		hasUnsavedChanges: boolean;
		onRebuild: () => void;
		onReviewChanges?: () => void;
		buildProgress?: number;
	}) => (
		<div data-testid="site-rebuild-indicator">
			{site.status === "building" || site.status === "pending" ? (
				<span>Building...</span>
			) : site.status === "error" ? (
				<span>Build Error</span>
			) : site.needsUpdate ? (
				<span>Changes Available</span>
			) : (
				<span>Up to Date</span>
			)}
			{/* Only show rebuild button when not building/pending */}
			{site.status !== "building" && site.status !== "pending" && (
				<button data-testid="rebuild-button" onClick={onRebuild} disabled={rebuilding}>
					Rebuild
				</button>
			)}
		</div>
	),
}));

vi.mock("./SitePendingChangesTab", () => ({
	SitePendingChangesTab: () => <div data-testid="site-pending-changes-tab">Pending Changes Tab Content</div>,
}));

vi.mock("./SiteBuildLogsPanel", () => ({
	SiteBuildLogsPanel: () => <div data-testid="site-build-logs-panel">Build Logs Panel</div>,
}));

const mockSiteClient = {
	listSites: vi.fn(),
	getSite: vi.fn(),
	createSite: vi.fn(),
	regenerateSite: vi.fn(),
	deleteSite: vi.fn(),
	updateSiteArticles: vi.fn(),
	cancelBuild: vi.fn(),
	getChangedConfigFiles: vi.fn().mockResolvedValue([]),
	formatCode: vi.fn(),
	listFolderContents: vi.fn().mockResolvedValue({ files: [] }),
	checkSubdomainAvailability: vi.fn(),
	addCustomDomain: vi.fn(),
	removeCustomDomain: vi.fn(),
	getCustomDomainStatus: vi.fn(),
	verifyCustomDomain: vi.fn(),
	refreshDomainStatuses: vi.fn(),
	updateJwtAuthConfig: vi.fn(),
	updateBranding: vi.fn(),
	getRepositoryTree: vi.fn().mockResolvedValue({ sha: "", tree: [], truncated: false }),
	getFileContent: vi.fn().mockResolvedValue({ name: "", path: "", sha: "", type: "file" }),
	updateFolderStructure: vi.fn(),
	syncTree: vi.fn().mockResolvedValue({ success: true, commitSha: "mock-commit-sha" }),
	getSitesForArticle: vi.fn().mockResolvedValue([]),
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
};

describe("SiteDetail", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Re-setup mock implementations after clearAllMocks
		mockSiteClient.getSite.mockResolvedValue(createMockSite());
		mockSiteClient.getChangedConfigFiles.mockResolvedValue([]);
		mockSiteClient.getRepositoryTree.mockResolvedValue({ sha: "", tree: [], truncated: false });
		mockSiteClient.getFileContent.mockResolvedValue({ name: "", path: "", sha: "", type: "file" });
	});

	function renderSiteDetail(docsiteId = 1) {
		const mockClient = createMockClient();
		// Override the sites method to use our mockSiteClient
		mockClient.sites = vi.fn(() => mockSiteClient);

		return renderWithProviders(<SiteDetail docsiteId={docsiteId} />, {
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

		it("should show site tree nav for navigation", async () => {
			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("site-tree-nav")).toBeDefined();
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
	});

	describe("update indicator", () => {
		it("should show changes available when needsUpdate is true", async () => {
			const site = createMockSite({ needsUpdate: true });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("site-rebuild-indicator")).toBeDefined();
				expect(screen.getByText("Changes Available")).toBeDefined();
			});
		});

		it("should show up to date when needsUpdate is false", async () => {
			const site = createMockSite({ needsUpdate: false, status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByText("Up to Date")).toBeDefined();
			});
		});
	});

	describe("changed files display", () => {
		it("should show changes available when site has changed articles", async () => {
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

			// The rebuild indicator should show changes available
			await waitFor(() => {
				expect(screen.getByTestId("site-rebuild-indicator")).toBeDefined();
				expect(screen.getByText("Changes Available")).toBeDefined();
			});
		});

		it("should show changes available when changedArticles is empty but needsUpdate is true", async () => {
			const site = createMockSite({
				needsUpdate: true,
				changedArticles: [],
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			// The rebuild indicator should show changes available
			await waitFor(() => {
				expect(screen.getByTestId("site-rebuild-indicator")).toBeDefined();
				expect(screen.getByText("Changes Available")).toBeDefined();
			});
		});

		it("should show changes available when changedArticles is not provided but needsUpdate is true", async () => {
			const site = createMockSite({
				needsUpdate: true,
				// Don't include changedArticles to test the undefined case
			});
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			// The rebuild indicator should show changes available
			await waitFor(() => {
				expect(screen.getByTestId("site-rebuild-indicator")).toBeDefined();
				expect(screen.getByText("Changes Available")).toBeDefined();
			});
		});
	});

	describe("build status", () => {
		it("should show building status in rebuild indicator", async () => {
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
				expect(screen.getByTestId("site-rebuild-indicator")).toBeDefined();
				expect(screen.getByText("Building...")).toBeDefined();
			});
		});

		it("should show build error in rebuild indicator for error status", async () => {
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
				expect(screen.getByTestId("site-rebuild-indicator")).toBeDefined();
				expect(screen.getByText("Build Error")).toBeDefined();
			});
		});
	});

	describe("tabs", () => {
		it("should show tabs for active sites", async () => {
			const site = createMockSite({ status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("nav-navigation")).toBeDefined();
				expect(screen.getByTestId("nav-content")).toBeDefined();
				expect(screen.getByTestId("nav-branding")).toBeDefined();
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
				expect(screen.getByTestId("nav-navigation")).toBeDefined();
			});
		});

		it("should show content tab by default", async () => {
			const site = createMockSite({ status: "active" });
			mockSiteClient.getSite.mockResolvedValue(site);

			renderSiteDetail();

			await waitFor(() => {
				expect(screen.getByTestId("site-content-tab")).toBeDefined();
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
				expect(screen.getByText("Build Error")).toBeDefined();
			});

			// Tabs should be present for error status so user can access full interface
			expect(screen.getByTestId("nav-navigation")).toBeDefined();
			expect(screen.getByTestId("nav-content")).toBeDefined();
			expect(screen.getByTestId("nav-branding")).toBeDefined();
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

		it("should show cancel button and hide delete button for building status", async () => {
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
