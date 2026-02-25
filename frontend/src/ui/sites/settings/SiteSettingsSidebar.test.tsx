import { createMockSite } from "../__testUtils__/SiteTestFactory";
import { SiteSettingsSidebar } from "./SiteSettingsSidebar";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for mock functions available in vi.mock blocks
const { mockNavigate, mockUseNavigation } = vi.hoisted(() => ({
	mockNavigate: vi.fn(),
	mockUseNavigation: vi.fn(),
}));

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: (key: string) => {
		if (key === "site-settings") {
			return {
				siteSettingsTitle: "Settings",
				generalTab: { value: "General" },
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
		ArrowLeft: () => <div data-testid="arrow-left-icon" />,
		Settings2: () => <div data-testid="settings2-icon" />,
	};
});

// Mock NavigationContext
vi.mock("../../../contexts/NavigationContext", () => ({
	useNavigation: () => mockUseNavigation(),
}));

// Mock SiteIcon
vi.mock("../../../components/SiteIcon", () => ({
	SiteIcon: ({ name }: { name: string }) => <span data-testid="site-icon">{name}</span>,
}));

// Mock Button - pass through
vi.mock("../../../components/ui/Button", () => ({
	Button: ({
		children,
		onClick,
		...props
	}: {
		children: React.ReactNode;
		onClick?: () => void;
		[key: string]: unknown;
	}) => (
		<button type="button" onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

describe("SiteSettingsSidebar", () => {
	const defaultSite = createMockSite({ metadata: null });

	beforeEach(() => {
		vi.clearAllMocks();
		mockUseNavigation.mockReturnValue({
			navigate: mockNavigate,
			siteSettingsView: "general",
		});
	});

	function renderSidebar(site: SiteWithUpdate = defaultSite) {
		return render(<SiteSettingsSidebar site={site} />);
	}

	it("renders the sidebar container", () => {
		renderSidebar();
		expect(screen.getByTestId("site-settings-sidebar")).toBeDefined();
	});

	it("renders the back button with site name", () => {
		renderSidebar();
		const backButton = screen.getByTestId("back-to-site-button");
		expect(backButton).toBeDefined();
		expect(backButton.textContent).toContain("Test Site");
	});

	it("renders the site icon in the back button", () => {
		renderSidebar();
		const backButton = screen.getByTestId("back-to-site-button");
		const siteIcon = backButton.querySelector("[data-testid='site-icon']");
		expect(siteIcon).not.toBeNull();
		expect(siteIcon?.textContent).toBe("Test Site");
	});

	it("navigates back to site detail when back button is clicked", () => {
		renderSidebar();
		fireEvent.click(screen.getByTestId("back-to-site-button"));
		expect(mockNavigate).toHaveBeenCalledWith("/sites/1");
	});

	it("uses correct site id in back navigation path", () => {
		const customSite = createMockSite({ id: 42, displayName: "Custom Site", metadata: null });
		renderSidebar(customSite);
		fireEvent.click(screen.getByTestId("back-to-site-button"));
		expect(mockNavigate).toHaveBeenCalledWith("/sites/42");
	});

	it("renders the general settings nav item", () => {
		renderSidebar();
		expect(screen.getByTestId("settings-nav-general")).toBeDefined();
		expect(screen.getByTestId("settings-nav-general").textContent).toContain("General");
	});

	it("highlights the active nav item", () => {
		renderSidebar();
		const generalNav = screen.getByTestId("settings-nav-general");
		expect(generalNav.className).toContain("bg-sidebar-accent");
	});

	it("does not highlight inactive nav items", () => {
		mockUseNavigation.mockReturnValue({
			navigate: mockNavigate,
			siteSettingsView: "none",
		});
		renderSidebar();
		const generalNav = screen.getByTestId("settings-nav-general");
		expect(generalNav.className).not.toContain("bg-accent text-accent-foreground");
	});

	it("navigates to settings path when nav item is clicked", () => {
		renderSidebar();
		fireEvent.click(screen.getByTestId("settings-nav-general"));
		expect(mockNavigate).toHaveBeenCalledWith("/sites/1/settings/general");
	});

	it("renders the settings section title", () => {
		renderSidebar();
		expect(screen.getByTestId("settings-section-title")).toBeDefined();
		expect(screen.getByTestId("settings-section-title").textContent).toContain("Settings");
	});
});
