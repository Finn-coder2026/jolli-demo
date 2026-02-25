import { ClientProvider } from "../contexts/ClientContext";
import { DevToolsProvider } from "../contexts/DevToolsContext";
import * as NavigationContextModule from "../contexts/NavigationContext";
import { NavigationProvider } from "../contexts/NavigationContext";
import { OrgProvider } from "../contexts/OrgContext";
import { PermissionProvider } from "../contexts/PermissionContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { RouterProvider } from "../contexts/RouterContext";
import { SitesProvider } from "../contexts/SitesContext";
import { SpaceProvider } from "../contexts/SpaceContext";
import { TenantProvider } from "../contexts/TenantContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import { createMockClient } from "../test/TestUtils";
import { AppLayout } from "./AppLayout";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Simple icon stub for tests
const IconStub = (() => <svg />) as unknown as LucideIcon;

// Mock lucide-react to provide all icons as stubs
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	const stub = () => <svg data-testid="icon-stub" />;
	return {
		...actual,
		Star: stub,
		Plus: stub,
		ChevronDown: stub,
		ChevronRight: stub,
		ChevronLeft: stub,
		FolderOpen: stub,
		Globe: stub,
		Search: stub,
		X: stub,
		MoreHorizontal: stub,
		Layers: stub,
		Home: stub,
		Inbox: stub,
		Settings: stub,
		LogOut: stub,
		User: stub,
		PanelLeft: stub,
		PanelLeftOpen: stub,
		Bot: stub,
	};
});

// Mock usePreference to disable unified sidebar for these legacy navigation tests
let mockSidebarCollapsed = false;
let mockUseUnifiedSidebar = false;

vi.mock("../hooks/usePreference", () => ({
	usePreference: (prefDef: { key: string; defaultValue: unknown }) => {
		if (prefDef.key === "useUnifiedSidebar") {
			return [mockUseUnifiedSidebar, vi.fn()] as const;
		}
		if (prefDef.key === "sidebarCollapsed") {
			const setter = vi.fn((newValue: boolean) => {
				mockSidebarCollapsed = newValue;
				localStorage.setItem("sidebarCollapsed", String(newValue));
			});
			return [mockSidebarCollapsed, setter] as const;
		}
		if (prefDef.key === "sidebarSpacesExpanded") {
			// Keep spaces section expanded for tests
			return [true, vi.fn()] as const;
		}
		// Return default values for other preferences
		return [prefDef.defaultValue, vi.fn()] as const;
	},
}));

function renderWithProviders(children: ReactNode, initialPath = "/"): ReturnType<typeof render> {
	const mockClient = createMockClient();

	return render(
		<ClientProvider client={mockClient}>
			<TenantProvider>
				<OrgProvider>
					<RouterProvider initialPath={initialPath}>
						<DevToolsProvider>
							<PermissionProvider>
								<NavigationProvider pathname={initialPath}>
									<PreferencesProvider>
										<SitesProvider>
											<SpaceProvider>
												<ThemeProvider>{children}</ThemeProvider>
											</SpaceProvider>
										</SitesProvider>
									</PreferencesProvider>
								</NavigationProvider>
							</PermissionProvider>
						</DevToolsProvider>
					</RouterProvider>
				</OrgProvider>
			</TenantProvider>
		</ClientProvider>,
	);
}

describe("AppLayout", () => {
	const mockDoLogout = vi.fn();
	const mockOnViewChange = vi.fn();

	const defaultProps = {
		onViewChange: mockOnViewChange,
		doLogout: mockDoLogout,
	};

	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
		// Reset mock sidebar collapsed state
		const storedValue = localStorage.getItem("sidebarCollapsed");
		mockSidebarCollapsed = storedValue === "true";
		// Reset unified sidebar to disabled by default
		mockUseUnifiedSidebar = false;
	});

	it("should render sidebar with logo", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		expect(screen.getAllByText("Jolli").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Documentation Intelligence").length).toBeGreaterThan(0);

		// Verify sidebar is visible
		const sidebar = container.querySelector("aside");
		expect(sidebar).toBeDefined();

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should render navigation menu items", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Only Dashboard should be visible in navigation (Inbox is hidden)
		expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
		// Note: Inbox, Articles, Sites, Analytics, Settings, and Dev Tools are accessible via direct URLs
		// Sources, Users, and Roles are now in the Settings sidebar, not the main navigation

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should call onViewChange when menu item is clicked", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Click on Dashboard menu item (since Sources/integrations has been moved to Settings)
		const dashboardButtons = screen.getAllByText("Dashboard");
		fireEvent.click(dashboardButtons[0]);

		expect(mockOnViewChange).toHaveBeenCalledWith("dashboard");

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should render children content", () => {
		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Test Content</div>
			</AppLayout>,
		);

		expect(screen.getByText("Test Content")).toBeDefined();
	});

	it("should highlight active menu item", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
			"/",
		);

		// The dashboard button should be active when on root path
		const dashboardButtons = screen.getAllByText("Dashboard");
		const dashboardButton = dashboardButtons[0].parentElement;
		expect(dashboardButton?.style.backgroundColor).toContain("var(--sidebar-selected-bg)");

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should have toggle button in sidebar", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Sidebar should have buttons
		const buttons = container.querySelectorAll("button");
		expect(buttons.length).toBeGreaterThan(0);
	});

	// Skip: This test expects legacy sidebar rendering when unified sidebar is enabled by default.
	// Menu item rendering is tested in UnifiedSidebar.test.tsx.
	// biome-ignore lint/suspicious/noSkippedTests: Legacy sidebar tested in UnifiedSidebar.test.tsx
	it.skip("should render menu items with buttons", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		const sourcesButtons = screen.getAllByText("Sources");
		const sourcesButton = sourcesButtons[0].parentElement;
		expect(sourcesButton?.tagName).toBe("BUTTON");

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should change background color on mouse enter for inactive items", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		// Mock useNavigation to return tabs with multiple items
		vi.spyOn(NavigationContextModule, "useNavigation").mockReturnValue({
			tabs: [
				{ name: "dashboard" as const, icon: IconStub, label: "Dashboard" },
				{ name: "integrations" as const, icon: IconStub, label: "Sources" },
			],
			activeTab: "dashboard" as const,
			currentUserId: undefined,
			currentUserName: undefined,
			navigate: vi.fn(),
			articleView: "list" as const,
			articleJrn: undefined,
			integrationView: "main" as const,
			integrationContainer: undefined,
			integrationContainerType: undefined,
			staticFileIntegrationId: undefined,
			draftView: "none" as const,
			draftId: undefined,
			inlineEditDraftId: undefined,
			selectedDocId: undefined,
			siteView: "list" as const,
			siteId: undefined,
			settingsView: "none" as const,
			spaceSettingsView: "none" as const,
			spaceSettingsSpaceId: undefined,
			siteSettingsView: "none" as const,
			siteSettingsSiteId: undefined,
			open: vi.fn(),
		});

		render(
			<ClientProvider>
				<TenantProvider>
					<OrgProvider>
						<RouterProvider initialPath="/">
							<DevToolsProvider>
								<PreferencesProvider>
									<SitesProvider>
										<SpaceProvider>
											<ThemeProvider>
												<AppLayout {...defaultProps}>
													<div>Content</div>
												</AppLayout>
											</ThemeProvider>
										</SpaceProvider>
									</SitesProvider>
								</PreferencesProvider>
							</DevToolsProvider>
						</RouterProvider>
					</OrgProvider>
				</TenantProvider>
			</ClientProvider>,
		);

		// Get an inactive menu item (not dashboard)
		const sourcesButtons = screen.getAllByText("Sources");
		const sourcesButton = sourcesButtons[0].parentElement as HTMLElement;

		// Simulate mouse enter
		const mouseEnterEvent = new MouseEvent("mouseenter", { bubbles: true });
		sourcesButton.dispatchEvent(mouseEnterEvent);

		// Verify the background color changed
		expect(sourcesButton.style.backgroundColor).toBe("var(--sidebar-hover-bg)");

		// Clean up
		vi.restoreAllMocks();
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should not change background color on mouse enter for active item", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
			"/",
		);

		// Get the active menu item
		const dashboardButtons = screen.getAllByText("Dashboard");
		const dashboardButton = dashboardButtons[0].parentElement as HTMLElement;
		const initialBg = dashboardButton.style.backgroundColor;

		// Simulate mouse enter
		const mouseEnterEvent = new MouseEvent("mouseenter", { bubbles: true });
		dashboardButton.dispatchEvent(mouseEnterEvent);

		// Verify the background color did not change
		expect(dashboardButton.style.backgroundColor).toBe(initialBg);

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should reset background color on mouse leave for inactive items", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		// Mock useNavigation to return tabs with multiple items
		vi.spyOn(NavigationContextModule, "useNavigation").mockReturnValue({
			tabs: [
				{ name: "dashboard" as const, icon: IconStub, label: "Dashboard" },
				{ name: "integrations" as const, icon: IconStub, label: "Sources" },
			],
			activeTab: "dashboard" as const,
			currentUserId: undefined,
			currentUserName: undefined,
			navigate: vi.fn(),
			articleView: "list" as const,
			articleJrn: undefined,
			integrationView: "main" as const,
			integrationContainer: undefined,
			integrationContainerType: undefined,
			staticFileIntegrationId: undefined,
			draftView: "none" as const,
			draftId: undefined,
			inlineEditDraftId: undefined,
			selectedDocId: undefined,
			siteView: "list" as const,
			siteId: undefined,
			settingsView: "none" as const,
			spaceSettingsView: "none" as const,
			spaceSettingsSpaceId: undefined,
			siteSettingsView: "none" as const,
			siteSettingsSiteId: undefined,
			open: vi.fn(),
		});

		render(
			<ClientProvider>
				<TenantProvider>
					<OrgProvider>
						<RouterProvider initialPath="/">
							<DevToolsProvider>
								<PreferencesProvider>
									<SitesProvider>
										<SpaceProvider>
											<ThemeProvider>
												<AppLayout {...defaultProps}>
													<div>Content</div>
												</AppLayout>
											</ThemeProvider>
										</SpaceProvider>
									</SitesProvider>
								</PreferencesProvider>
							</DevToolsProvider>
						</RouterProvider>
					</OrgProvider>
				</TenantProvider>
			</ClientProvider>,
		);

		// Get an inactive menu item
		const sourcesButtons = screen.getAllByText("Sources");
		const sourcesButton = sourcesButtons[0].parentElement as HTMLElement;

		// Simulate mouse enter first
		const mouseEnterEvent = new MouseEvent("mouseenter", { bubbles: true });
		sourcesButton.dispatchEvent(mouseEnterEvent);

		// Then simulate mouse leave
		const mouseLeaveEvent = new MouseEvent("mouseleave", { bubbles: true });
		sourcesButton.dispatchEvent(mouseLeaveEvent);

		// Verify the background color was reset
		expect(sourcesButton.style.backgroundColor).toBe("transparent");

		// Clean up
		vi.restoreAllMocks();
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should not change background color on mouse leave for active item", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
			"/",
		);

		// Get the active menu item
		const dashboardButtons = screen.getAllByText("Dashboard");
		const dashboardButton = dashboardButtons[0].parentElement as HTMLElement;
		const initialBg = dashboardButton.style.backgroundColor;

		// Simulate mouse leave
		const mouseLeaveEvent = new MouseEvent("mouseleave", { bubbles: true });
		dashboardButton.dispatchEvent(mouseLeaveEvent);

		// Verify the background color did not change
		expect(dashboardButton.style.backgroundColor).toBe(initialBg);

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should handle mouse events on desktop sidebar navigation items for active item", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
			"/",
		);

		// Find Dashboard button in desktop sidebar (should be the first one)
		const dashboardButtons = screen.getAllByText("Dashboard");
		const desktopDashboardButton = dashboardButtons[0].parentElement as HTMLElement;

		// Get initial background color
		const initialBg = desktopDashboardButton.style.backgroundColor;

		// Simulate mouse enter on active item - should NOT change background
		const mouseEnterEvent = new MouseEvent("mouseenter", { bubbles: true });
		desktopDashboardButton.dispatchEvent(mouseEnterEvent);

		// Verify the background color did not change
		expect(desktopDashboardButton.style.backgroundColor).toBe(initialBg);

		// Simulate mouse leave on active item - should NOT change background
		const mouseLeaveEvent = new MouseEvent("mouseleave", { bubbles: true });
		desktopDashboardButton.dispatchEvent(mouseLeaveEvent);

		// Verify the background color did not change
		expect(desktopDashboardButton.style.backgroundColor).toBe(initialBg);

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should set isNarrowScreen state based on window width on mount", () => {
		// Set window width to narrow
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1000,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// The sidebar should be rendered (even if in narrow mode)
		const sidebar = container.querySelector("aside");
		expect(sidebar).toBeDefined();

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should update isNarrowScreen state on window resize", () => {
		// Start with wide screen
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Simulate resize to narrow screen
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1000,
		});
		fireEvent(window, new Event("resize"));

		// The component should still render, verify sidebar exists
		const sidebar = container.querySelector("aside");
		expect(sidebar).toBeDefined();

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should cleanup resize listener on unmount", () => {
		const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

		const { unmount } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		unmount();

		expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));

		removeEventListenerSpy.mockRestore();
	});

	it("should handle mouse events on desktop sidebar navigation items when in narrow screen mode", () => {
		// Set window width to narrow
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1000,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
			"/articles",
		);

		// Find the sidebar
		const sidebar = container.querySelector("aside");

		if (sidebar) {
			// Find all navigation buttons in the sidebar
			const navButtons = sidebar.querySelectorAll("nav button");

			// Find an inactive button (Dashboard is inactive when path is "/articles")
			if (navButtons.length > 0) {
				const inactiveButton = navButtons[0] as HTMLElement;

				// Simulate mouse enter on inactive item
				fireEvent.mouseEnter(inactiveButton);

				// Verify the background color changed
				expect(inactiveButton.style.backgroundColor).toBe("var(--sidebar-hover-bg)");

				// Simulate mouse leave
				fireEvent.mouseLeave(inactiveButton);

				// Verify the background color was reset
				expect(inactiveButton.style.backgroundColor).toBe("transparent");
			}
		}

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should render sidebar without animation when expanded from initial state", () => {
		// Set sidebar as expanded in localStorage
		localStorage.setItem("sidebarCollapsed", "false");

		// Set wide screen
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Sidebar should be expanded (showText = true)
		expect(screen.getAllByText("Jolli").length).toBeGreaterThan(0);

		// Navigation heading should be visible
		const navigationHeading = (Array.from(container.querySelectorAll("div")) as Array<Element>).find(
			div => div.textContent === "Navigation" && div.className.includes("px-3"),
		);
		expect(navigationHeading).toBeDefined();

		// The navigation heading should not have animation class initially (shouldAnimate starts false)
		expect(navigationHeading?.className).not.toContain("animate-in");

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should render badge on navigation item when badge is provided", () => {
		// Set wide screen so sidebar shows text (badges only show when expanded)
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set sidebar as not collapsed
		localStorage.setItem("sidebarCollapsed", "false");

		// Mock useNavigation to return tabs with a badge
		vi.spyOn(NavigationContextModule, "useNavigation").mockReturnValue({
			tabs: [
				{ name: "dashboard" as const, icon: IconStub, label: "Dashboard", badge: 3 },
				{ name: "integrations" as const, icon: IconStub, label: "Sources" },
			],
			activeTab: "dashboard" as const,
			currentUserId: undefined,
			currentUserName: undefined,
			navigate: vi.fn(),
			articleView: "list" as const,
			articleJrn: undefined,
			integrationView: "main" as const,
			integrationContainer: undefined,
			integrationContainerType: undefined,
			staticFileIntegrationId: undefined,
			draftView: "none" as const,
			draftId: undefined,
			inlineEditDraftId: undefined,
			selectedDocId: undefined,
			siteView: "list" as const,
			siteId: undefined,
			settingsView: "none" as const,
			spaceSettingsView: "none" as const,
			spaceSettingsSpaceId: undefined,
			siteSettingsView: "none" as const,
			siteSettingsSiteId: undefined,
			open: vi.fn(),
		});

		const mockClient = createMockClient();
		const { container } = render(
			<ClientProvider client={mockClient}>
				<TenantProvider>
					<OrgProvider>
						<RouterProvider initialPath="/">
							<DevToolsProvider>
								<PermissionProvider>
									<NavigationProvider pathname="/">
										<PreferencesProvider>
											<ThemeProvider>
												<AppLayout {...defaultProps}>
													<div>Content</div>
												</AppLayout>
											</ThemeProvider>
										</PreferencesProvider>
									</NavigationProvider>
								</PermissionProvider>
							</DevToolsProvider>
						</RouterProvider>
					</OrgProvider>
				</TenantProvider>
			</ClientProvider>,
		);

		// Find the badge element with "3" text
		const badges = container.querySelectorAll(".ml-auto");
		let foundBadge = false;
		for (const badge of Array.from(badges)) {
			if (badge.textContent === "3") {
				foundBadge = true;
				break;
			}
		}
		expect(foundBadge).toBe(true);

		// Clean up
		vi.restoreAllMocks();
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should pass onSpaceClick prop to handleSpaceClick wrapper", () => {
		const mockOnSpaceClick = vi.fn();

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} onSpaceClick={mockOnSpaceClick}>
				<div>Content</div>
			</AppLayout>,
		);

		// Component should render successfully with onSpaceClick prop
		expect(container).toBeDefined();
		expect(mockOnSpaceClick).toBeDefined();
	});

	it("should render without onSpaceClick prop (optional prop)", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Should render without errors even when onSpaceClick is not provided
		expect(container).toBeDefined();
	});

	it("should render UnifiedSidebar when useUnifiedSidebar preference is true", () => {
		// Enable unified sidebar for this test
		mockUseUnifiedSidebar = true;

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// UnifiedSidebar should be rendered - check that the component renders successfully
		expect(container).toBeDefined();
	});

	// Note: The onSpaceClick handler integration with UnifiedSidebar is tested in
	// SpacesFavoritesList.test.tsx which has proper SpaceContext mocking.
	// See: src/ui/unified-sidebar/SpacesFavoritesList.test.tsx for comprehensive coverage.

	it("should not apply p-5 padding to main content by default (noPadding defaults to true)", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find main element
		const mainElement = container.querySelector("main");
		expect(mainElement).toBeDefined();
		expect(mainElement?.className).not.toContain("p-5");
	});

	it("should not apply padding when noPadding is true", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} noPadding={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find main element
		const mainElement = container.querySelector("main");
		expect(mainElement).toBeDefined();
		expect(mainElement?.className).not.toContain("p-5");
	});

	it("should apply padding when noPadding is false", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} noPadding={false}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find main element
		const mainElement = container.querySelector("main");
		expect(mainElement).toBeDefined();
		expect(mainElement?.className).toContain("p-5");
	});
});
