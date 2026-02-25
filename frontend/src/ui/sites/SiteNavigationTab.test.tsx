import { createMockSite } from "./__testUtils__/SiteTestFactory";
import { SiteNavigationTab } from "./SiteNavigationTab";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: (key: string) => {
		if (key === "site-navigation-tab") {
			return {
				title: "Navigation",
				description: "Manage site navigation structure",
				folderStructureBanner: "Navigation is auto-synced from your space folder structure.",
				noNavigationFile: "Connect a GitHub repository to manage navigation.",
			};
		}
		return {};
	},
}));

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		FolderTree: () => <div data-testid="folder-tree-icon" />,
		Info: () => <div data-testid="info-icon" />,
		ListTree: () => <div data-testid="list-tree-icon" />,
	};
});

// Mock RepositoryViewer
vi.mock("./RepositoryViewer", () => ({
	RepositoryViewer: (props: {
		onFileSave?: () => void;
		onDirtyStateChange?: (isDirty: boolean) => void;
		showBranchInfo: boolean;
		contentFolderOnly: boolean;
		fullHeight: boolean;
	}) => (
		<div data-testid="repository-viewer">
			<span data-testid="repo-show-branch">{String(props.showBranchInfo)}</span>
			<span data-testid="repo-content-folder-only">{String(props.contentFolderOnly)}</span>
			<span data-testid="repo-full-height">{String(props.fullHeight)}</span>
			<span data-testid="repo-has-file-save">{String(props.onFileSave !== undefined)}</span>
			<span data-testid="repo-has-dirty-change">{String(props.onDirtyStateChange !== undefined)}</span>
		</div>
	),
}));

describe("SiteNavigationTab", () => {
	const mockOnFileSave = vi.fn();
	const mockOnDirtyStateChange = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function renderTab(siteOverrides?: Parameters<typeof createMockSite>[0]) {
		const site = createMockSite(siteOverrides);
		return render(
			<SiteNavigationTab
				docsite={site}
				onFileSave={mockOnFileSave}
				onDirtyStateChange={mockOnDirtyStateChange}
			/>,
		);
	}

	it("renders the section header with title and description", () => {
		renderTab();
		const header = screen.getByTestId("navigation-header");
		expect(header.textContent).toContain("Navigation");
		expect(header.textContent).toContain("Manage site navigation structure");
	});

	it("renders the RepositoryViewer when GitHub repo is configured", () => {
		renderTab();
		expect(screen.getByTestId("repository-viewer")).toBeDefined();
	});

	it("passes correct props to RepositoryViewer", () => {
		renderTab();
		expect(screen.getByTestId("repo-show-branch").textContent).toBe("false");
		expect(screen.getByTestId("repo-content-folder-only").textContent).toBe("true");
		expect(screen.getByTestId("repo-full-height").textContent).toBe("true");
	});

	it("shows empty state when no GitHub repo is configured", () => {
		renderTab({ metadata: { githubRepo: "", githubUrl: "" } });
		expect(screen.queryByTestId("repository-viewer")).toBeNull();
		expect(screen.getByTestId("folder-tree-icon")).toBeDefined();
		expect(screen.getByTestId("navigation-empty-state")).toBeDefined();
		expect(screen.getByTestId("navigation-empty-state").textContent).toContain(
			"Connect a GitHub repository to manage navigation.",
		);
	});

	it("shows empty state when githubRepo is empty string", () => {
		renderTab({ metadata: { githubRepo: "", githubUrl: "https://github.com/owner/repo" } });
		expect(screen.queryByTestId("repository-viewer")).toBeNull();
		expect(screen.getByTestId("folder-tree-icon")).toBeDefined();
	});

	it("shows folder structure banner when useSpaceFolderStructure is enabled", () => {
		renderTab({ metadata: { useSpaceFolderStructure: true } });
		expect(screen.getByTestId("info-icon")).toBeDefined();
		expect(screen.getByTestId("folder-structure-banner")).toBeDefined();
		expect(screen.getByTestId("folder-structure-banner").textContent).toContain(
			"Navigation is auto-synced from your space folder structure.",
		);
	});

	it("does not show folder structure banner when useSpaceFolderStructure is disabled", () => {
		renderTab({ metadata: { useSpaceFolderStructure: false } });
		expect(screen.queryByTestId("folder-structure-banner")).toBeNull();
	});

	it("passes onFileSave and onDirtyStateChange to RepositoryViewer when folder structure is disabled", () => {
		renderTab({ metadata: { useSpaceFolderStructure: false } });
		expect(screen.getByTestId("repo-has-file-save").textContent).toBe("true");
		expect(screen.getByTestId("repo-has-dirty-change").textContent).toBe("true");
	});

	it("passes undefined for onFileSave and onDirtyStateChange when folder structure is enabled", () => {
		renderTab({ metadata: { useSpaceFolderStructure: true } });
		expect(screen.getByTestId("repo-has-file-save").textContent).toBe("false");
		expect(screen.getByTestId("repo-has-dirty-change").textContent).toBe("false");
	});
});
