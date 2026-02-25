import type { TabName } from "../../contexts/NavigationContext";
import type { Tab } from "../../types/Tab";
import { UnifiedSidebar } from "./UnifiedSidebar";
import { render, screen } from "@testing-library/preact";
import type { UserInfo } from "jolli-common";
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock useNavigation
const mockNavigate = vi.fn();

// Simple icon stub component typed as LucideIcon
const IconStub = ((): ReactElement => <svg data-testid="icon-stub" />) as unknown as LucideIcon;

// Default mock tabs without badges - explicitly typed to allow badge property
let mockTabs: Array<Tab<TabName>> = [
	{ name: "inbox", icon: IconStub, label: "Inbox" },
	{ name: "dashboard", icon: IconStub, label: "Dashboard" },
];
let mockActiveTab = "dashboard";

vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		activeTab: mockActiveTab,
		tabs: mockTabs,
		navigate: mockNavigate,
	}),
}));

// Mock all child components
vi.mock("./OrgTenantSelector", () => ({
	OrgTenantSelector: ({ collapsed }: { collapsed: boolean }) => (
		<div data-testid="org-tenant-selector" data-collapsed={collapsed}>
			OrgTenantSelector
		</div>
	),
}));

vi.mock("./SpacesFavoritesList", () => ({
	SpacesFavoritesList: ({ collapsed }: { collapsed: boolean }) => (
		<div data-testid="spaces-favorites-list" data-collapsed={collapsed}>
			SpacesFavoritesList
		</div>
	),
}));

vi.mock("./SitesFavoritesList", () => ({
	SitesFavoritesList: ({ collapsed }: { collapsed: boolean }) => (
		<div data-testid="sites-favorites-list" data-collapsed={collapsed}>
			SitesFavoritesList
		</div>
	),
}));

vi.mock("../../contexts/SpaceContext", () => ({
	useSpace: () => ({
		currentSpace: { id: 1, name: "Test Space", isPersonal: false },
		personalSpace: undefined,
		spaces: [],
		switchToPersonalSpace: vi.fn(),
	}),
}));

vi.mock("./BottomUtilities", () => ({
	BottomUtilities: ({ collapsed }: { collapsed: boolean }) => (
		<div data-testid="bottom-utilities" data-collapsed={collapsed}>
			BottomUtilities
		</div>
	),
}));

describe("UnifiedSidebar", () => {
	const mockUserInfo: UserInfo = {
		userId: 1,
		name: "John Doe",
		email: "john@example.com",
		picture: undefined,
	};

	const mockOnSpaceClick = vi.fn();
	const mockOnLogout = vi.fn();
	const mockOnToggle = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock values
		mockTabs = [
			{ name: "inbox", icon: IconStub, label: "Inbox" },
			{ name: "dashboard", icon: IconStub, label: "Dashboard" },
		];
		mockActiveTab = "dashboard";
	});

	it("should render all sections", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		expect(screen.getByTestId("unified-sidebar")).toBeDefined();
		expect(screen.getByTestId("org-tenant-selector")).toBeDefined();
		expect(screen.getByTestId("spaces-favorites-list")).toBeDefined();
		expect(screen.getByTestId("sites-favorites-list")).toBeDefined();
		expect(screen.getByTestId("bottom-utilities")).toBeDefined();
	});

	it("should pass collapsed=false to all child components when expanded", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		expect(screen.getByTestId("org-tenant-selector").getAttribute("data-collapsed")).toBe("false");
		expect(screen.getByTestId("spaces-favorites-list").getAttribute("data-collapsed")).toBe("false");
		expect(screen.getByTestId("sites-favorites-list").getAttribute("data-collapsed")).toBe("false");
		expect(screen.getByTestId("bottom-utilities").getAttribute("data-collapsed")).toBe("false");
	});

	it("should pass collapsed=true to all child components when collapsed", () => {
		render(
			<UnifiedSidebar
				collapsed={true}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		expect(screen.getByTestId("org-tenant-selector").getAttribute("data-collapsed")).toBe("true");
		expect(screen.getByTestId("spaces-favorites-list").getAttribute("data-collapsed")).toBe("true");
		expect(screen.getByTestId("sites-favorites-list").getAttribute("data-collapsed")).toBe("true");
		expect(screen.getByTestId("bottom-utilities").getAttribute("data-collapsed")).toBe("true");
	});

	it("should have expanded width when not collapsed", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const sidebar = screen.getByTestId("unified-sidebar");
		// Expanded width is 272px (17rem)
		expect(sidebar.style.width).toBe("272px");
	});

	it("should have collapsed width when collapsed", () => {
		render(
			<UnifiedSidebar
				collapsed={true}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const sidebar = screen.getByTestId("unified-sidebar");
		// Collapsed width is 48px (3rem)
		expect(sidebar.style.width).toBe("48px");
	});

	it("should have correct layout structure", () => {
		const { container } = render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const sidebar = container.querySelector("aside");
		expect(sidebar).toBeDefined();
		expect(sidebar?.className).toContain("flex");
		expect(sidebar?.className).toContain("flex-col");
		expect(sidebar?.className).toContain("h-full");
		expect(sidebar?.className).toContain("bg-sidebar");
		expect(sidebar?.className).toContain("transition-");
	});

	it("should have scrollable middle section", () => {
		const { container } = render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const scrollableSection = container.querySelector(".overflow-y-auto");
		expect(scrollableSection).toBeDefined();
		expect(scrollableSection?.className).toContain("flex-1");
		expect(scrollableSection?.className).toContain("overflow-y-auto");
		expect(scrollableSection?.className).toContain("overflow-x-hidden");
	});

	it("should render navigation tabs", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		// Inbox and dashboard tabs are visible in sidebar now
		expect(screen.getByTestId("nav-inbox")).toBeDefined();
		expect(screen.getByTestId("nav-dashboard")).toBeDefined();
	});

	it("should call navigate when tab is clicked", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const inboxTab = screen.getByTestId("nav-inbox");
		inboxTab.click();

		expect(mockNavigate).toHaveBeenCalledWith("/inbox");
	});

	it("should highlight active tab", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const dashboardTab = screen.getByTestId("nav-dashboard");
		// CSS Module class name contains "selected" with hash suffix
		expect(dashboardTab.className).toMatch(/selected/);
	});

	it("should show title attribute in collapsed mode", () => {
		render(
			<UnifiedSidebar
				collapsed={true}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const dashboardTab = screen.getByTestId("nav-dashboard");
		expect(dashboardTab.getAttribute("title")).toBe("Dashboard");
	});

	it("should not show title attribute in expanded mode", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const dashboardTab = screen.getByTestId("nav-dashboard");
		expect(dashboardTab.getAttribute("title")).toBeNull();
	});

	it("should hide tab labels when collapsed", () => {
		render(
			<UnifiedSidebar
				collapsed={true}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const dashboardTab = screen.getByTestId("nav-dashboard");
		// In collapsed mode, label should not be visible (className has justify-center)
		expect(dashboardTab.className).toContain("justify-center");
	});

	it("should show tab labels when expanded", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		const dashboardTab = screen.getByTestId("nav-dashboard");
		expect(dashboardTab.textContent).toContain("Dashboard");
	});

	it("should render collapse button in header", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		expect(screen.getByTestId("sidebar-collapse-button")).toBeDefined();
	});

	it("should call onToggle when collapse button is clicked", () => {
		render(
			<UnifiedSidebar
				collapsed={false}
				userInfo={mockUserInfo}
				onSpaceClick={mockOnSpaceClick}
				onLogout={mockOnLogout}
				onToggle={mockOnToggle}
			/>,
		);

		screen.getByTestId("sidebar-collapse-button").click();

		expect(mockOnToggle).toHaveBeenCalledTimes(1);
	});

	describe("Badge Display", () => {
		it("should show badge when tab has badge count > 0", () => {
			mockTabs = [
				{ name: "inbox", icon: IconStub, label: "Inbox", badge: 5 },
				{ name: "dashboard", icon: IconStub, label: "Dashboard" },
			];

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const inboxTab = screen.getByTestId("nav-inbox");
			expect(inboxTab.textContent).toContain("5");
		});

		it("should show 99+ when badge count exceeds 99", () => {
			mockTabs = [
				{ name: "inbox", icon: IconStub, label: "Inbox", badge: 150 },
				{ name: "dashboard", icon: IconStub, label: "Dashboard" },
			];

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const inboxTab = screen.getByTestId("nav-inbox");
			expect(inboxTab.textContent).toContain("99+");
		});

		it("should show exact count when badge is 99", () => {
			mockTabs = [
				{ name: "inbox", icon: IconStub, label: "Inbox", badge: 99 },
				{ name: "dashboard", icon: IconStub, label: "Dashboard" },
			];

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const inboxTab = screen.getByTestId("nav-inbox");
			expect(inboxTab.textContent).toContain("99");
			expect(inboxTab.textContent).not.toContain("99+");
		});

		it("should not show badge when badge count is 0", () => {
			mockTabs = [
				{ name: "inbox", icon: IconStub, label: "Inbox", badge: 0 },
				{ name: "dashboard", icon: IconStub, label: "Dashboard" },
			];

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const inboxTab = screen.getByTestId("nav-inbox");
			// Badge should not be rendered for count 0
			expect(inboxTab.textContent).toBe("Inbox");
		});

		it("should not show badge when badge is undefined", () => {
			mockTabs = [
				{ name: "inbox", icon: IconStub, label: "Inbox" },
				{ name: "dashboard", icon: IconStub, label: "Dashboard" },
			];

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const inboxTab = screen.getByTestId("nav-inbox");
			expect(inboxTab.textContent).toBe("Inbox");
		});

		it("should not show badge when collapsed even with count", () => {
			mockTabs = [
				{ name: "inbox", icon: IconStub, label: "Inbox", badge: 5 },
				{ name: "dashboard", icon: IconStub, label: "Dashboard" },
			];

			render(
				<UnifiedSidebar
					collapsed={true}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const inboxTab = screen.getByTestId("nav-inbox");
			// When collapsed, neither label nor badge should be visible
			expect(inboxTab.textContent).not.toContain("5");
		});
	});

	describe("Tab Active State", () => {
		it("should apply text-sidebar-foreground class to inactive tabs", () => {
			mockActiveTab = "dashboard";

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const inboxTab = screen.getByTestId("nav-inbox");
			// Inactive tab should have text-sidebar-foreground class
			expect(inboxTab.className).toContain("text-sidebar-foreground");
		});

		it("should not apply text-sidebar-foreground to active tab", () => {
			mockActiveTab = "inbox";

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const inboxTab = screen.getByTestId("nav-inbox");
			// Active tab should have selected class instead of text-sidebar-foreground
			expect(inboxTab.className).toMatch(/selected/);
			expect(inboxTab.className).not.toContain("text-sidebar-foreground");
		});

		it("should navigate when clicking dashboard tab", () => {
			mockActiveTab = "inbox";

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const dashboardTab = screen.getByTestId("nav-dashboard");
			dashboardTab.click();

			expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
		});
	});

	describe("Agent Button", () => {
		it("should render agent button", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			expect(screen.getByTestId("nav-agent")).toBeDefined();
		});

		it("should navigate to /agent when agent button is clicked", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const agentButton = screen.getByTestId("nav-agent");
			agentButton.click();

			expect(mockNavigate).toHaveBeenCalledWith("/agent");
		});

		it("should show agent label when expanded", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const agentButton = screen.getByTestId("nav-agent");
			expect(agentButton.textContent).toContain("Jolli Agent");
		});

		it("should show title tooltip when collapsed", () => {
			render(
				<UnifiedSidebar
					collapsed={true}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const agentButton = screen.getByTestId("nav-agent");
			expect(agentButton.getAttribute("title")).toBe("Jolli Agent");
		});

		it("should highlight agent button when active", () => {
			mockActiveTab = "agent";

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const agentButton = screen.getByTestId("nav-agent");
			expect(agentButton.className).toMatch(/selected/);
		});

		it("should not highlight agent button when inactive", () => {
			mockActiveTab = "dashboard";

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const agentButton = screen.getByTestId("nav-agent");
			expect(agentButton.className).toContain("text-sidebar-foreground");
		});
	});

	describe("Divider", () => {
		it("should render divider between navigation and favorites", () => {
			const { container } = render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const divider = container.querySelector(".border-t");
			expect(divider).toBeDefined();
		});
	});

	describe("Transition Animation", () => {
		it("should have transition class for smooth width changes", () => {
			const { container } = render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const sidebar = container.querySelector("aside");
			expect(sidebar?.className).toContain("transition-[width]");
			expect(sidebar?.className).toContain("duration-200");
		});
	});

	describe("With undefined userInfo", () => {
		it("should render correctly with undefined userInfo", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={undefined}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			expect(screen.getByTestId("unified-sidebar")).toBeDefined();
			expect(screen.getByTestId("bottom-utilities")).toBeDefined();
		});
	});

	describe("Settings Button", () => {
		it("should navigate to /settings/preferences when settings button is clicked", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const settingsButton = screen.getByTestId("nav-settings");
			settingsButton.click();

			expect(mockNavigate).toHaveBeenCalledWith("/settings/preferences");
		});

		it("should highlight settings button when settings tab is active", () => {
			mockActiveTab = "settings";

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const settingsButton = screen.getByTestId("nav-settings");
			expect(settingsButton.className).toMatch(/selected/);
			expect(settingsButton.className).not.toContain("text-sidebar-foreground");
		});

		it("should not highlight settings button when another tab is active", () => {
			mockActiveTab = "dashboard";

			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const settingsButton = screen.getByTestId("nav-settings");
			expect(settingsButton.className).toContain("text-sidebar-foreground");
			expect(settingsButton.className).not.toMatch(/selected/);
		});

		it("should show title tooltip on settings button when collapsed", () => {
			render(
				<UnifiedSidebar
					collapsed={true}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const settingsButton = screen.getByTestId("nav-settings");
			expect(settingsButton.getAttribute("title")).toBe("Settings");
		});

		it("should not show title on settings button when expanded", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const settingsButton = screen.getByTestId("nav-settings");
			expect(settingsButton.getAttribute("title")).toBeNull();
		});

		it("should show settings label when expanded", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const settingsButton = screen.getByTestId("nav-settings");
			expect(settingsButton.textContent).toContain("Settings");
		});

		it("should hide settings label when collapsed", () => {
			render(
				<UnifiedSidebar
					collapsed={true}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const settingsButton = screen.getByTestId("nav-settings");
			expect(settingsButton.className).toContain("justify-center");
		});
	});

	describe("Keyboard Shortcut", () => {
		it("should toggle sidebar when Cmd+B is pressed", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const event = new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true });
			document.dispatchEvent(event);

			expect(mockOnToggle).toHaveBeenCalledTimes(1);
		});

		it("should toggle sidebar when Ctrl+B is pressed", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const event = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true });
			document.dispatchEvent(event);

			expect(mockOnToggle).toHaveBeenCalledTimes(1);
		});

		it("should not toggle sidebar when Cmd+B is pressed inside an editor", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			// Create a mock ProseMirror editor element and focus it
			const editorDiv = document.createElement("div");
			editorDiv.classList.add("ProseMirror");
			const innerInput = document.createElement("input");
			editorDiv.appendChild(innerInput);
			document.body.appendChild(editorDiv);
			innerInput.focus();

			const event = new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true });
			document.dispatchEvent(event);

			expect(mockOnToggle).not.toHaveBeenCalled();

			document.body.removeChild(editorDiv);
		});

		it("should not toggle sidebar when a non-modifier B key is pressed", () => {
			render(
				<UnifiedSidebar
					collapsed={false}
					userInfo={mockUserInfo}
					onSpaceClick={mockOnSpaceClick}
					onLogout={mockOnLogout}
					onToggle={mockOnToggle}
				/>,
			);

			const event = new KeyboardEvent("keydown", { key: "b", bubbles: true });
			document.dispatchEvent(event);

			expect(mockOnToggle).not.toHaveBeenCalled();
		});
	});
});
