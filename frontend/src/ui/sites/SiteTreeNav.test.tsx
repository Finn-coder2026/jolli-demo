import { createMockSite } from "./__testUtils__/SiteTestFactory";
import type { SiteDetailView } from "./SiteTreeNav";
import { SiteTreeNav } from "./SiteTreeNav";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for mock functions available in vi.mock blocks
const { mockNavigate, mockRefreshSites } = vi.hoisted(() => ({
	mockNavigate: vi.fn(),
	mockRefreshSites: vi.fn().mockResolvedValue(undefined),
}));

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: (key: string) => {
		if (key === "site-tree-nav") {
			return {
				siteSettingsLabel: { value: "Site" },
				contentTab: { value: "Content" },
				contentTooltip: { value: "Manage content" },
				navigationTab: { value: "Navigation" },
				navigationTooltip: { value: "Manage navigation" },
				brandingTab: { value: "Branding" },
				brandingTooltip: { value: "Manage branding" },
				settingsTab: { value: "Settings" },
				settingsTooltip: { value: "Site settings" },
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
		Layers: (props: Record<string, unknown>) => <div data-testid="layers-icon" {...props} />,
		ListTree: (props: Record<string, unknown>) => <div data-testid="list-tree-icon" {...props} />,
		Palette: (props: Record<string, unknown>) => <div data-testid="palette-icon" {...props} />,
		Settings: (props: Record<string, unknown>) => <div data-testid="settings-icon" {...props} />,
	};
});

// Mock NavigationContext
vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({ navigate: mockNavigate }),
}));

// Mock SitesContext
vi.mock("../../contexts/SitesContext", () => ({
	useSites: () => ({ refreshSites: mockRefreshSites }),
}));

// Mock SiteSwitcher
vi.mock("./SiteSwitcher", () => ({
	SiteSwitcher: ({
		currentSite,
		onSiteChange,
	}: {
		currentSite: SiteWithUpdate;
		onSiteChange: (site: SiteWithUpdate) => void;
	}) => (
		<div data-testid="site-switcher">
			<span data-testid="switcher-site-name">{currentSite.displayName}</span>
			<button
				type="button"
				data-testid="switcher-change"
				onClick={() => onSiteChange({ ...currentSite, id: 2, displayName: "Other Site" })}
			>
				Switch
			</button>
		</div>
	),
}));

// Mock Tooltip - pass through children
vi.mock("../../components/ui/Tooltip", () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe("SiteTreeNav", () => {
	const mockOnViewChange = vi.fn();
	const mockOnSiteChange = vi.fn();
	const defaultSite = createMockSite();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function renderTreeNav(activeView: SiteDetailView = "content", site: SiteWithUpdate = defaultSite) {
		return render(
			<SiteTreeNav
				site={site}
				activeView={activeView}
				onViewChange={mockOnViewChange}
				onSiteChange={mockOnSiteChange}
			/>,
		);
	}

	it("renders the tree nav container", () => {
		renderTreeNav();
		expect(screen.getByTestId("site-tree-nav")).toBeDefined();
	});

	it("renders the site switcher with the current site", () => {
		renderTreeNav();
		expect(screen.getByTestId("site-switcher")).toBeDefined();
		expect(screen.getByTestId("switcher-site-name").textContent).toBe("Test Site");
	});

	it("renders the section label", () => {
		renderTreeNav();
		expect(screen.getByTestId("section-label")).toBeDefined();
		expect(screen.getByTestId("section-label").textContent).toContain("Site");
	});

	it("renders all three main nav items", () => {
		renderTreeNav();
		expect(screen.getByTestId("nav-content")).toBeDefined();
		expect(screen.getByTestId("nav-navigation")).toBeDefined();
		expect(screen.getByTestId("nav-branding")).toBeDefined();
	});

	it("renders the settings button", () => {
		renderTreeNav();
		expect(screen.getByTestId("nav-settings")).toBeDefined();
		expect(screen.getByTestId("nav-settings").textContent).toContain("Settings");
	});

	it("displays nav item labels", () => {
		renderTreeNav();
		expect(screen.getByTestId("nav-content").textContent).toContain("Content");
		expect(screen.getByTestId("nav-navigation").textContent).toContain("Navigation");
		expect(screen.getByTestId("nav-branding").textContent).toContain("Branding");
	});

	it("highlights the active nav item", () => {
		renderTreeNav("navigation");
		const navButton = screen.getByTestId("nav-navigation");
		expect(navButton.className).toContain("bg-accent");
	});

	it("does not highlight inactive nav items", () => {
		renderTreeNav("content");
		const navButton = screen.getByTestId("nav-navigation");
		expect(navButton.className).not.toContain("font-medium");
	});

	it("calls onViewChange when a nav item is clicked", () => {
		renderTreeNav();
		fireEvent.click(screen.getByTestId("nav-branding"));
		expect(mockOnViewChange).toHaveBeenCalledWith("branding");
	});

	it("navigates to settings when settings button is clicked", () => {
		renderTreeNav();
		fireEvent.click(screen.getByTestId("nav-settings"));
		expect(mockNavigate).toHaveBeenCalledWith("/sites/1/settings");
	});

	it("calls onSiteChange when site is switched", async () => {
		renderTreeNav();
		fireEvent.click(screen.getByTestId("switcher-change"));

		await waitFor(() => {
			expect(mockOnSiteChange).toHaveBeenCalledWith(
				expect.objectContaining({ id: 2, displayName: "Other Site" }),
			);
		});
	});

	it("renders the active indicator for the active view", () => {
		renderTreeNav("content");
		const contentButton = screen.getByTestId("nav-content");
		// The active button should contain the indicator span
		const indicator = contentButton.querySelector("span.bg-primary");
		expect(indicator).not.toBeNull();
	});

	it("uses correct site id in settings navigation path", () => {
		const customSite = createMockSite({ id: 42 });
		renderTreeNav("content", customSite);
		fireEvent.click(screen.getByTestId("nav-settings"));
		expect(mockNavigate).toHaveBeenCalledWith("/sites/42/settings");
	});
});
