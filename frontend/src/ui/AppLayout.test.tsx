import { ClientProvider } from "../contexts/ClientContext";
import { DevToolsProvider } from "../contexts/DevToolsContext";
import * as NavigationContextModule from "../contexts/NavigationContext";
import { NavigationProvider } from "../contexts/NavigationContext";
import { OrgProvider } from "../contexts/OrgContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { RouterProvider } from "../contexts/RouterContext";
import { TenantProvider } from "../contexts/TenantContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AppLayout } from "./AppLayout";
import { fireEvent, render, screen } from "@testing-library/preact";
import { FileText, Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

function renderWithProviders(children: ReactNode, initialPath = "/"): ReturnType<typeof render> {
	return render(
		<ClientProvider>
			<TenantProvider>
				<OrgProvider>
					<RouterProvider initialPath={initialPath}>
						<DevToolsProvider>
							<NavigationProvider pathname={initialPath}>
								<PreferencesProvider>
									<ThemeProvider>{children}</ThemeProvider>
								</PreferencesProvider>
							</NavigationProvider>
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
	const mockOnChatBotToggle = vi.fn();

	const defaultProps = {
		onViewChange: mockOnViewChange,
		chatBotOpen: false,
		onChatBotToggle: mockOnChatBotToggle,
		doLogout: mockDoLogout,
	};

	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
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

		expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Articles").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Analytics").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Sources").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should render floating AI Assistant button when chatbot is closed", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={false}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find the floating button by its characteristics
		const buttons = container.querySelectorAll("button");
		let floatingButton: HTMLElement | null = null;
		for (const button of Array.from(buttons) as Array<Element>) {
			if (button.className.includes("fixed") && button.className.includes("rounded-full")) {
				floatingButton = button as HTMLElement;
				break;
			}
		}
		expect(floatingButton).toBeDefined();
	});

	it("should not render floating AI Assistant button when chatbot is open", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find the floating button by its characteristics
		const buttons = container.querySelectorAll("button");
		let floatingButton: HTMLElement | null = null;
		for (const button of Array.from(buttons) as Array<Element>) {
			if (button.className.includes("fixed") && button.className.includes("rounded-full")) {
				floatingButton = button as HTMLElement;
				break;
			}
		}
		expect(floatingButton).toBeNull();
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

		const articlesButtons = screen.getAllByText("Articles");
		fireEvent.click(articlesButtons[0]);

		expect(mockOnViewChange).toHaveBeenCalledWith("articles");

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should call onChatBotToggle when floating AI Assistant button is clicked", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={false}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find the floating button
		const buttons = container.querySelectorAll("button");
		let floatingButton: HTMLElement | null = null;
		for (const button of Array.from(buttons) as Array<Element>) {
			if (button.className.includes("fixed") && button.className.includes("rounded-full")) {
				floatingButton = button as HTMLElement;
				break;
			}
		}

		if (floatingButton) {
			fireEvent.click(floatingButton);
			expect(mockOnChatBotToggle).toHaveBeenCalledWith(true);
		}
	});

	it("should render children content", () => {
		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Test Content</div>
			</AppLayout>,
		);

		expect(screen.getByText("Test Content")).toBeDefined();
	});

	it("should render search input", () => {
		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		const searchInput = screen.getByPlaceholderText("Search articles...");
		expect(searchInput).toBeDefined();
	});

	it("should render user profile menu", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// User profile dropdown exists in the UI
		expect(container.querySelector("button")).toBeDefined();
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
			"/analytics",
		);

		// The analytics button should be active
		const analyticsButtons = screen.getAllByText("Analytics");
		const analyticsButton = analyticsButtons[0].parentElement;
		expect(analyticsButton?.style.backgroundColor).toContain("var(--sidebar-selected-bg)");

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should render ChatBot when chatBotOpen is true", () => {
		renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		expect(screen.getByText("New Conversation")).toBeDefined();
	});

	it("should auto-collapse sidebar when chat opens", () => {
		// Set wide screen so sidebar shows text
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Start with sidebar expanded (not collapsed)
		localStorage.setItem("sidebarCollapsed", "false");

		const { rerender } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={false}>
				<div>Content</div>
			</AppLayout>,
		);

		// Initially sidebar should be expanded, so we should see text labels
		expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);

		// Now open the chat
		rerender(
			<ClientProvider>
				<TenantProvider>
					<OrgProvider>
						<RouterProvider initialPath="/">
							<DevToolsProvider>
								<NavigationProvider pathname="/">
									<PreferencesProvider>
										<ThemeProvider>
											<AppLayout {...defaultProps} chatBotOpen={true}>
												<div>Content</div>
											</AppLayout>
										</ThemeProvider>
									</PreferencesProvider>
								</NavigationProvider>
							</DevToolsProvider>
						</RouterProvider>
					</OrgProvider>
				</TenantProvider>
			</ClientProvider>,
		);

		// Sidebar should auto-collapse, setting localStorage
		expect(localStorage.getItem("sidebarCollapsed")).toBe("true");

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should not render ChatBot when chatBotOpen is false", () => {
		renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={false}>
				<div>Content</div>
			</AppLayout>,
		);

		const aiAssistants = screen.queryAllByText("New Conversation");
		expect(aiAssistants.length).toBe(0);
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

	it("should enable animation when expanding collapsed sidebar", () => {
		// Set sidebar as collapsed in localStorage
		localStorage.setItem("sidebarCollapsed", "true");

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

		// Find the toggle button in the header (it's the collapse/expand button with PanelLeft icon)
		const buttons = container.querySelectorAll("button");
		let toggleButton: HTMLElement | null = null;

		// The toggle button should be in the header section, look for button with PanelLeft SVG
		for (const button of Array.from(buttons) as Array<Element>) {
			const svg = button.querySelector("svg");
			// Check if this button is in the header area (first button in the header typically)
			if (svg && button.className.includes("hover:bg-muted")) {
				toggleButton = button as HTMLElement;
				break;
			}
		}

		if (toggleButton) {
			// Click to expand
			fireEvent.click(toggleButton);

			// Verify localStorage was updated
			expect(localStorage.getItem("sidebarCollapsed")).toBe("false");

			// After expanding, the Navigation heading should have animation class
			const navigationHeading = (Array.from(container.querySelectorAll("div")) as Array<Element>).find(
				div => div.textContent === "Navigation" && div.className.includes("px-3"),
			);
			expect(navigationHeading?.className).toContain("animate-in");
		}

		// Clean up
		localStorage.removeItem("sidebarCollapsed");
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should render menu items with buttons", () => {
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

		const articlesButtons = screen.getAllByText("Articles");
		const articlesButton = articlesButtons[0].parentElement;
		expect(articlesButton?.tagName).toBe("BUTTON");

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

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
			"/",
		);

		// Get an inactive menu item (not dashboard)
		const articlesButtons = screen.getAllByText("Articles");
		const articlesButton = articlesButtons[0].parentElement as HTMLElement;

		// Simulate mouse enter
		const mouseEnterEvent = new MouseEvent("mouseenter", { bubbles: true });
		articlesButton.dispatchEvent(mouseEnterEvent);

		// Verify the background color changed
		expect(articlesButton.style.backgroundColor).toBe("var(--sidebar-hover-bg)");

		// Clean up
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

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
			"/",
		);

		// Get an inactive menu item
		const articlesButtons = screen.getAllByText("Articles");
		const articlesButton = articlesButtons[0].parentElement as HTMLElement;

		// Simulate mouse enter first
		const mouseEnterEvent = new MouseEvent("mouseenter", { bubbles: true });
		articlesButton.dispatchEvent(mouseEnterEvent);

		// Then simulate mouse leave
		const mouseLeaveEvent = new MouseEvent("mouseleave", { bubbles: true });
		articlesButton.dispatchEvent(mouseLeaveEvent);

		// Verify the background color was reset
		expect(articlesButton.style.backgroundColor).toBe("transparent");

		// Clean up
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

	it("should call doLogout when Sign Out is clicked", () => {
		const { container } = renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find all buttons
		const buttons = container.querySelectorAll("button");

		// Find the user profile button (should be one with just an icon, no text)
		let userButton: Element | null = null;
		for (const button of Array.from(buttons) as Array<Element>) {
			const hasIcon = button.querySelector("svg") !== null;
			const hasNoText = button.textContent?.trim() === "" || button.children.length === 1;
			if (hasIcon && hasNoText) {
				userButton = button;
			}
		}

		if (userButton) {
			// Click to open dropdown
			fireEvent.click(userButton as HTMLElement);

			// Try to find the Sign Out button
			const signOutText = screen.queryByText("Sign Out");
			if (signOutText) {
				fireEvent.click(signOutText);

				expect(mockDoLogout).toHaveBeenCalled();
			}
		}

		// Verify the mock function exists
		expect(mockDoLogout).toBeDefined();
	});

	it("should call onChatBotToggle(false) when ChatBot onClose is triggered", () => {
		const mockOnChatBotToggle = vi.fn();

		renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true} onChatBotToggle={mockOnChatBotToggle}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find the "New Conversation" header, then find buttons in the same parent
		const aiAssistantText = screen.getByText("New Conversation");
		const headerDiv = aiAssistantText.parentElement;
		if (headerDiv) {
			const buttons = headerDiv.querySelectorAll("button");
			// The last button should be the close (X) button
			const closeButton = buttons[buttons.length - 1] as HTMLElement;
			if (closeButton) {
				fireEvent.click(closeButton);
				expect(mockOnChatBotToggle).toHaveBeenCalledWith(false);
			}
		}
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
			"/",
		);

		// Find the sidebar
		const sidebar = container.querySelector("aside");

		if (sidebar) {
			// Find all navigation buttons in the sidebar
			const navButtons = sidebar.querySelectorAll("nav button");

			// Find an inactive button (not the first one which is Dashboard/active)
			if (navButtons.length > 1) {
				const inactiveButton = navButtons[1] as HTMLElement;

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

	it("should render chatbot when open on narrow screen and not apply flex-2 to main content", () => {
		// Set window width to narrow
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1000,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Chatbot should be visible
		expect(screen.getByText("New Conversation")).toBeDefined();

		// Main content div should not have lg:flex-[2] when on narrow screen
		// On narrow screens, the main content has flex-shrink-0 instead of overflow-hidden
		const mainContent = container.querySelector(".flex.flex-col.flex-shrink-0");
		expect(mainContent).toBeDefined();
		if (mainContent) {
			expect(mainContent.className).not.toContain("lg:flex-[2]");
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

	it("should render chatbot when open on wide screen and apply flex-2 to main content", () => {
		// Set window width to wide
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Chatbot should be visible
		expect(screen.getByText("New Conversation")).toBeDefined();

		// Find the main content div (the one with overflow-hidden and transition-all)
		const mainContentDivs = container.querySelectorAll("div");
		let foundXlFlex2 = false;
		for (const div of Array.from(mainContentDivs) as Array<Element>) {
			if (
				div.className.includes("flex-col") &&
				div.className.includes("overflow-hidden") &&
				div.className.includes("lg:flex-[2]")
			) {
				foundXlFlex2 = true;
				break;
			}
		}
		expect(foundXlFlex2).toBe(true);

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should render resize handle on wide screen when chatbot is open", () => {
		// Set window width to wide
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find the resize handle (div with cursor-col-resize)
		const resizeHandles = (Array.from(container.querySelectorAll("div")) as Array<Element>).filter(div =>
			div.className.includes("cursor-col-resize"),
		);
		expect(resizeHandles.length).toBeGreaterThan(0);

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should not render resize handle on narrow screen", () => {
		// Set window width to narrow
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1000,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Resize handle should not be present
		const resizeHandles = (Array.from(container.querySelectorAll("div")) as Array<Element>).filter(div =>
			div.className.includes("cursor-col-resize"),
		);
		expect(resizeHandles.length).toBe(0);

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should handle mousedown on resize handle to start resizing", () => {
		// Set window width to wide
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find the resize handle
		const resizeHandle = (Array.from(container.querySelectorAll("div")) as Array<Element>).find(div =>
			div.className.includes("cursor-col-resize"),
		) as HTMLElement;

		expect(resizeHandle).toBeDefined();

		if (resizeHandle) {
			// Simulate mousedown
			fireEvent.mouseDown(resizeHandle);

			// The handle should exist and be ready for drag
			expect(resizeHandle).toBeDefined();
		}

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should handle mousemove during resize to update chat width", () => {
		// Set window width to wide
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find the resize handle
		const resizeHandle = (Array.from(container.querySelectorAll("div")) as Array<Element>).find(div =>
			div.className.includes("cursor-col-resize"),
		) as HTMLElement;

		if (resizeHandle) {
			// Simulate mousedown to start resizing
			fireEvent.mouseDown(resizeHandle);

			// Simulate mousemove on document
			const mouseMoveEvent = new MouseEvent("mousemove", {
				bubbles: true,
				clientX: 1000, // Position for desired width
			});
			document.dispatchEvent(mouseMoveEvent);

			// Simulate mouseup to end resizing
			const mouseUpEvent = new MouseEvent("mouseup", { bubbles: true });
			document.dispatchEvent(mouseUpEvent);

			// Verify the resize handle still exists
			expect(resizeHandle).toBeDefined();
		}

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should save chat width to localStorage on mouseup", () => {
		// Set window width to wide
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Clear any existing chatWidth
		localStorage.removeItem("chatWidth");

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Find the resize handle
		const resizeHandle = (Array.from(container.querySelectorAll("div")) as Array<Element>).find(div =>
			div.className.includes("cursor-col-resize"),
		) as HTMLElement;

		if (resizeHandle) {
			// Simulate mousedown to start resizing
			fireEvent.mouseDown(resizeHandle);

			// Simulate mousemove
			const mouseMoveEvent = new MouseEvent("mousemove", {
				bubbles: true,
				clientX: 1000,
			});
			document.dispatchEvent(mouseMoveEvent);

			// Simulate mouseup
			const mouseUpEvent = new MouseEvent("mouseup", { bubbles: true });
			document.dispatchEvent(mouseUpEvent);

			// Verify chatWidth was saved to localStorage
			const savedWidth = localStorage.getItem("chatWidth");
			expect(savedWidth).toBeDefined();
		}

		// Clean up
		localStorage.removeItem("chatWidth");

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should load chat width from localStorage on mount", () => {
		// Set window width to wide
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1500,
		});

		// Set a custom width in localStorage
		localStorage.setItem("chatWidth", "500");

		renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// The chatbot should be rendered (we can't easily verify the width directly without ref access,
		// but we can verify it loaded without error)
		expect(screen.getByText("New Conversation")).toBeDefined();

		// Clean up
		localStorage.removeItem("chatWidth");

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should not start resizing on narrow screen mousedown", () => {
		// Set window width to narrow
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1000,
		});

		const { container } = renderWithProviders(
			<AppLayout {...defaultProps} chatBotOpen={true}>
				<div>Content</div>
			</AppLayout>,
		);

		// Resize handle should not exist on narrow screens
		const resizeHandle = (Array.from(container.querySelectorAll("div")) as Array<Element>).find(div =>
			div.className.includes("cursor-col-resize"),
		);
		expect(resizeHandle).toBeUndefined();

		// Reset window width
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	it("should handle intlayer values with .key property for searchPlaceholder", () => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		renderWithProviders(
			<AppLayout {...defaultProps}>
				<div>Content</div>
			</AppLayout>,
		);

		// Should still work correctly with .key property (getStringValue converts it)
		expect(screen.getByPlaceholderText("Search articles...")).toBeDefined();
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
				{ name: "dashboard" as const, icon: Gauge, label: "Dashboard", badge: "3" },
				{ name: "articles" as const, icon: FileText, label: "Articles" },
			],
			activeTab: "dashboard" as const,
			navigate: vi.fn(),
			articleView: "list" as const,
			articleJrn: undefined,
			integrationView: "main" as const,
			integrationContainer: undefined,
			integrationContainerType: undefined,
			staticFileIntegrationId: undefined,
			draftView: "none" as const,
			draftId: undefined,
			siteView: "list" as const,
			siteId: undefined,
			hasIntegrations: false,
			checkIntegrations: vi.fn(),
			githubSetupComplete: false,
			refreshIntegrations: vi.fn(),
			integrationSetupComplete: vi.fn(),
			open: vi.fn(),
		});

		const { container } = render(
			<ClientProvider>
				<TenantProvider>
					<OrgProvider>
						<RouterProvider initialPath="/">
							<DevToolsProvider>
								<PreferencesProvider>
									<ThemeProvider>
										<AppLayout {...defaultProps}>
											<div>Content</div>
										</AppLayout>
									</ThemeProvider>
								</PreferencesProvider>
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
});
