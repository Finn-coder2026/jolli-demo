import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SettingsLayout } from "./SettingsLayout";
import { fireEvent, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		ArrowLeft: () => <div data-testid="arrow-left-icon" />,
		ChevronLeft: () => <div data-testid="chevron-left-icon" />,
		ChevronRight: () => <div data-testid="chevron-right-icon" />,
		FolderGit2: () => <div data-testid="folder-git-icon" />,
		Settings: () => <div data-testid="settings-icon" />,
		User: () => <div data-testid="user-icon" />,
		Users: () => <div data-testid="users-icon" />,
	};
});

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		backToApp: createMockIntlayerValue("Back to App"),
		personalSection: createMockIntlayerValue("Personal"),
		profileNav: createMockIntlayerValue("Profile"),
		preferencesNav: createMockIntlayerValue("Preferences"),
		accountSection: createMockIntlayerValue("Account"),
		usersNav: createMockIntlayerValue("Users"),
		sourcesNav: createMockIntlayerValue("Sources"),
		collapseSidebar: createMockIntlayerValue("Collapse sidebar"),
		expandSidebar: createMockIntlayerValue("Expand sidebar"),
	}),
}));

// Mock NavigationContext
const mockNavigate = vi.fn();
vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
		activeTab: "settings",
		tabs: [],
	}),
}));

// Mock preferences
let mockCollapsed = false;
const mockSetCollapsed = vi.fn((value: boolean) => {
	mockCollapsed = value;
});

vi.mock("../../hooks/usePreference", () => ({
	usePreference: () => [mockCollapsed, mockSetCollapsed],
}));

vi.mock("../../services/preferences/PreferencesRegistry", () => ({
	PREFERENCES: {
		sidebarCollapsed: "sidebarCollapsed",
	},
}));

describe("SettingsLayout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCollapsed = false;
	});

	it("should render the sidebar and content area", () => {
		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div data-testid="content">Test Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		expect(screen.getByTestId("settings-sidebar")).toBeDefined();
		expect(screen.getByTestId("settings-content")).toBeDefined();
		expect(screen.getByTestId("content")).toBeDefined();
	});

	it("should render all navigation items", () => {
		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		expect(screen.getByTestId("nav-profile")).toBeDefined();
		expect(screen.getByTestId("nav-preferences")).toBeDefined();
		expect(screen.getByTestId("nav-users")).toBeDefined();
		expect(screen.getByTestId("nav-sources")).toBeDefined();
	});

	it("should highlight the active page", () => {
		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		const profileNav = screen.getByTestId("nav-profile");
		const preferencesNav = screen.getByTestId("nav-preferences");

		// Active page should have accent background
		expect(profileNav.className).toContain("bg-accent");
		// Inactive pages should not
		expect(preferencesNav.className).not.toContain("bg-accent text-accent-foreground");
	});

	it("should navigate when clicking nav items", () => {
		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		fireEvent.click(screen.getByTestId("nav-preferences"));
		expect(mockNavigate).toHaveBeenCalledWith("/settings/preferences");

		fireEvent.click(screen.getByTestId("nav-users"));
		expect(mockNavigate).toHaveBeenCalledWith("/settings/users");

		fireEvent.click(screen.getByTestId("nav-sources"));
		expect(mockNavigate).toHaveBeenCalledWith("/integrations");
	});

	it("should navigate to home when clicking Back to App", () => {
		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		fireEvent.click(screen.getByTestId("back-to-app-button"));
		expect(mockNavigate).toHaveBeenCalledWith("/");
	});

	it("should toggle sidebar collapse when clicking collapse button", () => {
		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		fireEvent.click(screen.getByTestId("sidebar-collapse-button"));
		expect(mockSetCollapsed).toHaveBeenCalledWith(true);
	});

	it("should render in collapsed mode when preference is set", () => {
		mockCollapsed = true;

		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		const sidebar = screen.getByTestId("settings-sidebar");
		expect(sidebar.style.width).toBe("60px");

		// Section headers should be hidden in collapsed mode
		expect(screen.queryByTestId("section-header-personal")).toBeNull();
		expect(screen.queryByTestId("section-header-account")).toBeNull();
	});

	it("should show section headers in expanded mode", () => {
		mockCollapsed = false;

		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		const sidebar = screen.getByTestId("settings-sidebar");
		expect(sidebar.style.width).toBe("240px");

		// Section headers should be visible in expanded mode
		expect(screen.getByTestId("section-header-personal")).toBeDefined();
		expect(screen.getByTestId("section-header-account")).toBeDefined();
	});

	it("should expand sidebar when clicking collapse button in collapsed mode", () => {
		mockCollapsed = true;

		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		fireEvent.click(screen.getByTestId("sidebar-collapse-button"));
		expect(mockSetCollapsed).toHaveBeenCalledWith(false);
	});

	it("should show nav item labels in expanded mode", () => {
		mockCollapsed = false;

		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		expect(screen.getByText("Profile")).toBeDefined();
		expect(screen.getByText("Preferences")).toBeDefined();
		expect(screen.getByText("Users")).toBeDefined();
		expect(screen.getByText("Sources")).toBeDefined();
	});

	it("should use title attribute for nav items in collapsed mode", () => {
		mockCollapsed = true;

		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		const profileNav = screen.getByTestId("nav-profile");
		expect(profileNav.getAttribute("title")).toBe("Profile");
	});

	it("should render collapse button in header", () => {
		renderWithProviders(
			<SettingsLayout activePage="profile">
				<div>Content</div>
			</SettingsLayout>,
			{ withNavigation: false },
		);

		expect(screen.getByTestId("sidebar-collapse-button")).toBeDefined();
	});
});
