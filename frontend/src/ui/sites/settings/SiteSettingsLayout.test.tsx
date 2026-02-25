import { createMockSite } from "../__testUtils__/SiteTestFactory";
import { SiteSettingsLayout } from "./SiteSettingsLayout";
import { render, screen } from "@testing-library/preact";
import type { SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for mock functions available in vi.mock blocks
const { mockUseSites, mockUseNavigation } = vi.hoisted(() => ({
	mockUseSites: vi.fn(),
	mockUseNavigation: vi.fn(),
}));

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: (key: string) => {
		if (key === "site-settings") {
			return {
				loading: "Loading settings...",
				siteNotFound: "Site not found",
			};
		}
		return {};
	},
}));

// Mock NavigationContext
vi.mock("../../../contexts/NavigationContext", () => ({
	useNavigation: () => mockUseNavigation(),
}));

// Mock SitesContext
vi.mock("../../../contexts/SitesContext", () => ({
	useSites: () => mockUseSites(),
}));

// Mock SiteSettingsSidebar
vi.mock("./SiteSettingsSidebar", () => ({
	SiteSettingsSidebar: ({ site }: { site: SiteWithUpdate }) => (
		<div data-testid="site-settings-sidebar">
			<span data-testid="sidebar-site-name">{site.displayName}</span>
		</div>
	),
}));

describe("SiteSettingsLayout", () => {
	const site1 = createMockSite({ id: 1, displayName: "Test Site", metadata: null });
	const site2 = createMockSite({ id: 2, displayName: "Other Site", metadata: null });

	beforeEach(() => {
		vi.clearAllMocks();
		mockUseNavigation.mockReturnValue({ siteSettingsSiteId: 1 });
		mockUseSites.mockReturnValue({ sites: [site1, site2], isLoading: false });
	});

	function renderLayout(children: React.ReactNode = <div data-testid="child-content">Settings Content</div>) {
		return render(<SiteSettingsLayout>{children}</SiteSettingsLayout>);
	}

	it("renders the loading state when sites are loading", () => {
		mockUseSites.mockReturnValue({ sites: [], isLoading: true });
		renderLayout();
		expect(screen.getByTestId("settings-loading")).toBeDefined();
		expect(screen.getByTestId("settings-loading").textContent).toContain("Loading settings...");
		expect(screen.queryByTestId("site-settings-sidebar")).toBeNull();
	});

	it("renders the not found state when site is not found", () => {
		mockUseNavigation.mockReturnValue({ siteSettingsSiteId: 999 });
		renderLayout();
		expect(screen.getByTestId("settings-not-found")).toBeDefined();
		expect(screen.getByTestId("settings-not-found").textContent).toContain("Site not found");
		expect(screen.queryByTestId("site-settings-sidebar")).toBeNull();
	});

	it("renders the sidebar and content when site is found", () => {
		renderLayout();
		expect(screen.getByTestId("site-settings-sidebar")).toBeDefined();
		expect(screen.getByTestId("child-content")).toBeDefined();
	});

	it("passes the correct site to the sidebar", () => {
		renderLayout();
		expect(screen.getByTestId("sidebar-site-name").textContent).toBe("Test Site");
	});

	it("renders children in the main content area", () => {
		renderLayout(<p data-testid="custom-child">Custom Content</p>);
		expect(screen.getByTestId("custom-child")).toBeDefined();
		expect(screen.getByTestId("custom-child").textContent).toBe("Custom Content");
	});

	it("renders the main content area with correct data-testid", () => {
		renderLayout();
		expect(screen.getByTestId("site-settings-content")).toBeDefined();
	});
});
