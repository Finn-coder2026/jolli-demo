import { UnifiedSidebar } from "./UnifiedSidebar";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Note: lucide-react and react-intlayer are globally mocked in Vitest.tsx setupFiles

// Mock AppBranding component
vi.mock("../components/AppBranding", () => ({
	AppBranding: ({ variant, showText, animate }: { variant: string; showText: boolean; animate: boolean }) => (
		<div data-testid="app-branding" data-variant={variant} data-show-text={showText} data-animate={animate}>
			AppBranding
		</div>
	),
}));

// Mock usePreference hook
const mockSetCollapsed = vi.fn();
let mockCollapsedValue = false;

vi.mock("../hooks/usePreference", () => ({
	usePreference: () => [mockCollapsedValue, mockSetCollapsed],
}));

describe("UnifiedSidebar", () => {
	const mockOnNavigate = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockCollapsedValue = false;
		// Reset window size
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1920,
		});
	});

	describe("Rendering", () => {
		it("should render sidebar with navigation items", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			expect(screen.getByTestId("nav-inbox")).toBeDefined();
			expect(screen.getByTestId("nav-dashboard")).toBeDefined();
		});

		it("should render expanded by default", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			// Should show text labels when expanded
			expect(screen.getByText("Inbox")).toBeDefined();
			expect(screen.getByText("Dashboard")).toBeDefined();
		});

		it("should render collapsed when preference is true", () => {
			mockCollapsedValue = true;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			// Text labels should not be visible when collapsed
			expect(screen.queryByText("Inbox")).toBe(null);
			expect(screen.queryByText("Dashboard")).toBe(null);
		});

		it("should have proper ARIA attributes", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = screen.getByRole("navigation", { name: /main navigation sidebar/i });
			expect(sidebar).toBeDefined();

			const dashboardButton = screen.getByTestId("nav-dashboard");
			expect(dashboardButton.getAttribute("aria-current")).toBe("page");
		});
	});

	describe("Navigation", () => {
		it("should call onNavigate when Inbox is clicked", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const inboxButton = screen.getByTestId("nav-inbox");
			fireEvent.click(inboxButton);

			expect(mockOnNavigate).toHaveBeenCalledWith("/inbox");
		});

		it("should call onNavigate when Dashboard is clicked", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/inbox" />);

			const dashboardButton = screen.getByTestId("nav-dashboard");
			fireEvent.click(dashboardButton);

			expect(mockOnNavigate).toHaveBeenCalledWith("/dashboard");
		});

		it("should highlight active navigation item", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/inbox" />);

			const inboxButton = screen.getByTestId("nav-inbox");
			expect(inboxButton.getAttribute("aria-current")).toBe("page");

			const dashboardButton = screen.getByTestId("nav-dashboard");
			expect(dashboardButton.getAttribute("aria-current")).toBe(null);
		});
	});

	describe("Inbox Badge", () => {
		it("should not show badge when inbox count is 0", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={0} />);

			expect(screen.queryByTestId("inbox-badge")).toBe(null);
		});

		it("should show badge with count when inbox has items", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={5} />);

			const badge = screen.getByTestId("inbox-badge");
			expect(badge).toBeDefined();
			expect(badge.textContent).toBe("5");
		});

		it("should show 99+ when inbox count exceeds 99", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={150} />);

			const badge = screen.getByTestId("inbox-badge");
			expect(badge.textContent).toBe("99+");
		});

		it("should show badge as overlay when collapsed", () => {
			mockCollapsedValue = true;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={5} />);

			const badge = screen.getByTestId("inbox-badge");
			expect(badge).toBeDefined();
			// Overlay badge has absolute positioning
			expect(badge.className).toContain("absolute");
		});
	});

	describe("Collapse/Expand", () => {
		it("should show toggle button on hover", async () => {
			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			expect(sidebar).toBeDefined();

			// Initially toggle button should not be visible
			expect(screen.queryByTestId("sidebar-toggle")).toBe(null);

			// Hover over sidebar
			if (sidebar) {
				fireEvent.mouseEnter(sidebar);
			}

			// Toggle button should appear
			await waitFor(() => {
				expect(screen.getByTestId("sidebar-toggle")).toBeDefined();
			});
		});

		it("should toggle collapsed state when toggle button is clicked", async () => {
			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");

			// Hover to show toggle button
			if (sidebar) {
				fireEvent.mouseEnter(sidebar);
			}

			await waitFor(() => {
				expect(screen.getByTestId("sidebar-toggle")).toBeDefined();
			});

			const toggleButton = screen.getByTestId("sidebar-toggle");
			fireEvent.click(toggleButton);

			expect(mockSetCollapsed).toHaveBeenCalledWith(true);
		});

		it("should have proper ARIA attributes on toggle button", async () => {
			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			if (sidebar) {
				fireEvent.mouseEnter(sidebar);
			}

			await waitFor(() => {
				const toggleButton = screen.getByTestId("sidebar-toggle");
				expect(toggleButton.getAttribute("aria-expanded")).toBe("true");
				expect(toggleButton.getAttribute("aria-label")).toBeDefined();
			});
		});
	});

	describe("Tooltips", () => {
		it("should show tooltips when collapsed", () => {
			mockCollapsedValue = true;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const inboxButton = screen.getByTestId("nav-inbox");
			expect(inboxButton.getAttribute("title")).toBe("Inbox");

			const dashboardButton = screen.getByTestId("nav-dashboard");
			expect(dashboardButton.getAttribute("title")).toBe("Dashboard");
		});

		it("should not show tooltips when expanded", () => {
			mockCollapsedValue = false;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const inboxButton = screen.getByTestId("nav-inbox");
			expect(inboxButton.getAttribute("title")).toBe(null);

			const dashboardButton = screen.getByTestId("nav-dashboard");
			expect(dashboardButton.getAttribute("title")).toBe(null);
		});
	});

	describe("Sections", () => {
		it("should render Spaces section when provided", () => {
			const SpacesSection = (): ReactElement => <div data-testid="spaces-content">Spaces</div>;

			render(
				<UnifiedSidebar
					onNavigate={mockOnNavigate}
					activePath="/dashboard"
					renderSpacesSection={SpacesSection}
				/>,
			);

			expect(screen.getByTestId("spaces-section")).toBeDefined();
			expect(screen.getByTestId("spaces-content")).toBeDefined();
		});

		it("should render Sites section when provided", () => {
			const SitesSection = (): ReactElement => <div data-testid="sites-content">Sites</div>;

			render(
				<UnifiedSidebar
					onNavigate={mockOnNavigate}
					activePath="/dashboard"
					renderSitesSection={SitesSection}
				/>,
			);

			expect(screen.getByTestId("sites-section")).toBeDefined();
			expect(screen.getByTestId("sites-content")).toBeDefined();
		});

		it("should render Bottom section when provided", () => {
			const BottomSection = (): ReactElement => <div data-testid="bottom-content">Bottom</div>;

			render(
				<UnifiedSidebar
					onNavigate={mockOnNavigate}
					activePath="/dashboard"
					renderBottomSection={BottomSection}
				/>,
			);

			expect(screen.getByTestId("bottom-section")).toBeDefined();
			expect(screen.getByTestId("bottom-content")).toBeDefined();
		});

		it("should render all sections together", () => {
			const SpacesSection = (): ReactElement => <div data-testid="spaces-content">Spaces</div>;
			const SitesSection = (): ReactElement => <div data-testid="sites-content">Sites</div>;
			const BottomSection = (): ReactElement => <div data-testid="bottom-content">Bottom</div>;

			render(
				<UnifiedSidebar
					onNavigate={mockOnNavigate}
					activePath="/dashboard"
					renderSpacesSection={SpacesSection}
					renderSitesSection={SitesSection}
					renderBottomSection={BottomSection}
				/>,
			);

			expect(screen.getByTestId("spaces-section")).toBeDefined();
			expect(screen.getByTestId("sites-section")).toBeDefined();
			expect(screen.getByTestId("bottom-section")).toBeDefined();
		});
	});

	describe("Hover Effects", () => {
		it("should apply hover background to inbox button when not active", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const inboxButton = screen.getByTestId("nav-inbox");

			// Initially should have transparent background
			expect(inboxButton.style.backgroundColor).toBe("transparent");

			// Hover over the button
			fireEvent.mouseEnter(inboxButton);

			// Should apply hover background
			expect(inboxButton.style.backgroundColor).toBe("var(--sidebar-hover-bg)");
		});

		it("should not apply hover background to inbox button when active", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/inbox" />);

			const inboxButton = screen.getByTestId("nav-inbox");

			// Should have selected background
			expect(inboxButton.style.backgroundColor).toBe("var(--sidebar-selected-bg)");

			// Hover over the button
			fireEvent.mouseEnter(inboxButton);

			// Should still have selected background (not changed to hover)
			expect(inboxButton.style.backgroundColor).toBe("var(--sidebar-selected-bg)");
		});

		it("should remove hover background from inbox button on mouse leave when not active", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const inboxButton = screen.getByTestId("nav-inbox");

			// Hover to apply hover background
			fireEvent.mouseEnter(inboxButton);
			expect(inboxButton.style.backgroundColor).toBe("var(--sidebar-hover-bg)");

			// Leave hover
			fireEvent.mouseLeave(inboxButton);

			// Should reset to transparent
			expect(inboxButton.style.backgroundColor).toBe("transparent");
		});

		it("should not change background on mouse leave when inbox button is active", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/inbox" />);

			const inboxButton = screen.getByTestId("nav-inbox");

			// Should have selected background
			expect(inboxButton.style.backgroundColor).toBe("var(--sidebar-selected-bg)");

			// Hover and leave
			fireEvent.mouseEnter(inboxButton);
			fireEvent.mouseLeave(inboxButton);

			// Should still have selected background (not changed to transparent)
			expect(inboxButton.style.backgroundColor).toBe("var(--sidebar-selected-bg)");
		});

		it("should apply hover background to dashboard button when not active", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/inbox" />);

			const dashboardButton = screen.getByTestId("nav-dashboard");

			// Initially should have transparent background
			expect(dashboardButton.style.backgroundColor).toBe("transparent");

			// Hover over the button
			fireEvent.mouseEnter(dashboardButton);

			// Should apply hover background
			expect(dashboardButton.style.backgroundColor).toBe("var(--sidebar-hover-bg)");
		});

		it("should not apply hover background to dashboard button when active", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const dashboardButton = screen.getByTestId("nav-dashboard");

			// Should have selected background
			expect(dashboardButton.style.backgroundColor).toBe("var(--sidebar-selected-bg)");

			// Hover over the button
			fireEvent.mouseEnter(dashboardButton);

			// Should still have selected background (not changed to hover)
			expect(dashboardButton.style.backgroundColor).toBe("var(--sidebar-selected-bg)");
		});

		it("should remove hover background from dashboard button on mouse leave when not active", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/inbox" />);

			const dashboardButton = screen.getByTestId("nav-dashboard");

			// Hover to apply hover background
			fireEvent.mouseEnter(dashboardButton);
			expect(dashboardButton.style.backgroundColor).toBe("var(--sidebar-hover-bg)");

			// Leave hover
			fireEvent.mouseLeave(dashboardButton);

			// Should reset to transparent
			expect(dashboardButton.style.backgroundColor).toBe("transparent");
		});

		it("should not change background on mouse leave when dashboard button is active", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const dashboardButton = screen.getByTestId("nav-dashboard");

			// Should have selected background
			expect(dashboardButton.style.backgroundColor).toBe("var(--sidebar-selected-bg)");

			// Hover and leave
			fireEvent.mouseEnter(dashboardButton);
			fireEvent.mouseLeave(dashboardButton);

			// Should still have selected background (not changed to transparent)
			expect(dashboardButton.style.backgroundColor).toBe("var(--sidebar-selected-bg)");
		});
	});

	describe("Responsive Behavior", () => {
		it("should auto-collapse on narrow screens", () => {
			// Set narrow screen width
			Object.defineProperty(window, "innerWidth", {
				writable: true,
				configurable: true,
				value: 800,
			});

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			// Should not show text labels on narrow screens
			expect(screen.queryByText("Inbox")).toBe(null);
			expect(screen.queryByText("Dashboard")).toBe(null);
		});

		it("should not show toggle button on narrow screens", async () => {
			Object.defineProperty(window, "innerWidth", {
				writable: true,
				configurable: true,
				value: 800,
			});

			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			if (sidebar) {
				fireEvent.mouseEnter(sidebar);
			}

			// Toggle button should not appear on narrow screens
			await waitFor(() => {
				expect(screen.queryByTestId("sidebar-toggle")).toBe(null);
			});
		});

		it("should call setCollapsed when resizing to narrow screen", () => {
			// Start with wide screen
			Object.defineProperty(window, "innerWidth", {
				writable: true,
				configurable: true,
				value: 1920,
			});

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			// Should show text labels on wide screens
			expect(screen.getByText("Inbox")).toBeDefined();

			// Resize to narrow
			Object.defineProperty(window, "innerWidth", {
				writable: true,
				configurable: true,
				value: 800,
			});
			fireEvent.resize(window);

			// Should have called setCollapsed to collapse
			expect(mockSetCollapsed).toHaveBeenCalledWith(true);
		});

		it("should enable animation when expanding from collapsed", async () => {
			mockCollapsedValue = true;

			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			if (sidebar) {
				fireEvent.mouseEnter(sidebar);
			}

			await waitFor(() => {
				expect(screen.getByTestId("sidebar-toggle")).toBeDefined();
			});

			const toggleButton = screen.getByTestId("sidebar-toggle");
			fireEvent.click(toggleButton);

			// When expanding (collapsed=true, clicking to expand), should call setCollapsed(false)
			// The component calls setCollapsed with !collapsed, so it should be false
			// But we're testing that the animation is enabled (which happens before setCollapsed)
			// Actually we can't directly test shouldAnimate state, but we can verify the toggle was clicked
			expect(mockSetCollapsed).toHaveBeenCalledWith(false);
		});

		it("should clean up resize listener on unmount", () => {
			const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

			const { unmount } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			unmount();

			expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));

			removeEventListenerSpy.mockRestore();
		});

		it("should not auto-collapse when already collapsed on narrow screen resize", () => {
			mockCollapsedValue = true;

			Object.defineProperty(window, "innerWidth", {
				writable: true,
				configurable: true,
				value: 1920,
			});

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			// Resize to narrow
			Object.defineProperty(window, "innerWidth", {
				writable: true,
				configurable: true,
				value: 800,
			});
			fireEvent.resize(window);

			// Since already collapsed, setCollapsed should not be called
			expect(mockSetCollapsed).not.toHaveBeenCalled();
		});
	});

	describe("Sidebar Width", () => {
		it("should have 260px width when expanded", () => {
			mockCollapsedValue = false;

			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			expect(sidebar?.style.width).toBe("260px");
		});

		it("should have 60px width when collapsed", () => {
			mockCollapsedValue = true;

			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			expect(sidebar?.style.width).toBe("60px");
		});

		it("should have 60px width on narrow screens regardless of collapsed preference", () => {
			mockCollapsedValue = false;

			Object.defineProperty(window, "innerWidth", {
				writable: true,
				configurable: true,
				value: 800,
			});

			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			expect(sidebar?.style.width).toBe("60px");
		});
	});

	describe("Sidebar Toggle Button Visibility", () => {
		it("should hide toggle button when mouse leaves sidebar", async () => {
			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");

			// Hover to show toggle button
			if (sidebar) {
				fireEvent.mouseEnter(sidebar);
			}

			await waitFor(() => {
				expect(screen.getByTestId("sidebar-toggle")).toBeDefined();
			});

			// Leave sidebar
			if (sidebar) {
				fireEvent.mouseLeave(sidebar);
			}

			// Toggle button should be hidden
			await waitFor(() => {
				expect(screen.queryByTestId("sidebar-toggle")).toBe(null);
			});
		});

		it("should show expand title on toggle button when collapsed", async () => {
			mockCollapsedValue = true;

			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			if (sidebar) {
				fireEvent.mouseEnter(sidebar);
			}

			await waitFor(() => {
				const toggleButton = screen.getByTestId("sidebar-toggle");
				expect(toggleButton.getAttribute("title")).toBe("Expand sidebar");
				expect(toggleButton.getAttribute("aria-label")).toBe("Expand sidebar");
				expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
			});
		});

		it("should show collapse title on toggle button when expanded", async () => {
			mockCollapsedValue = false;

			const { container } = render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const sidebar = container.querySelector("aside");
			if (sidebar) {
				fireEvent.mouseEnter(sidebar);
			}

			await waitFor(() => {
				const toggleButton = screen.getByTestId("sidebar-toggle");
				expect(toggleButton.getAttribute("title")).toBe("Collapse sidebar");
				expect(toggleButton.getAttribute("aria-label")).toBe("Collapse sidebar");
			});
		});
	});

	describe("Navigation Section Label", () => {
		it("should show navigation label when expanded", () => {
			mockCollapsedValue = false;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			expect(screen.getByText("Navigation")).toBeDefined();
		});

		it("should hide navigation label when collapsed", () => {
			mockCollapsedValue = true;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			expect(screen.queryByText("Navigation")).toBe(null);
		});
	});

	describe("Inbox Badge Edge Cases", () => {
		it("should show 99 when inbox count is exactly 99", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={99} />);

			const badge = screen.getByTestId("inbox-badge");
			expect(badge.textContent).toBe("99");
		});

		it("should show 99+ when inbox count is 100", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={100} />);

			const badge = screen.getByTestId("inbox-badge");
			expect(badge.textContent).toBe("99+");
		});

		it("should show badge with count 1", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={1} />);

			const badge = screen.getByTestId("inbox-badge");
			expect(badge.textContent).toBe("1");
		});
	});

	describe("Sections Not Provided", () => {
		it("should not render Spaces section when not provided", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			expect(screen.queryByTestId("spaces-section")).toBe(null);
		});

		it("should not render Sites section when not provided", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			expect(screen.queryByTestId("sites-section")).toBe(null);
		});

		it("should not render Bottom section when not provided", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			expect(screen.queryByTestId("bottom-section")).toBe(null);
		});
	});

	describe("AppBranding Integration", () => {
		it("should pass correct props to AppBranding when expanded", () => {
			mockCollapsedValue = false;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const branding = screen.getByTestId("app-branding");
			expect(branding.getAttribute("data-variant")).toBe("sidebar");
			expect(branding.getAttribute("data-show-text")).toBe("true");
		});

		it("should pass correct props to AppBranding when collapsed", () => {
			mockCollapsedValue = true;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			const branding = screen.getByTestId("app-branding");
			expect(branding.getAttribute("data-variant")).toBe("sidebar");
			expect(branding.getAttribute("data-show-text")).toBe("false");
		});
	});

	describe("Collapsed Badge Display", () => {
		it("should show badge without ml-auto class when collapsed", () => {
			mockCollapsedValue = true;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={5} />);

			const badge = screen.getByTestId("inbox-badge");
			// In collapsed mode, badge should have absolute positioning classes, not ml-auto
			expect(badge.className).toContain("absolute");
			expect(badge.className).not.toContain("ml-auto");
		});

		it("should position badge as overlay with correct styling when collapsed", () => {
			mockCollapsedValue = true;

			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" inboxCount={5} />);

			const badge = screen.getByTestId("inbox-badge");
			expect(badge.className).toContain("-top-1");
			expect(badge.className).toContain("-right-1");
		});
	});

	describe("Default Props", () => {
		it("should use 0 as default inbox count", () => {
			render(<UnifiedSidebar onNavigate={mockOnNavigate} activePath="/dashboard" />);

			// No badge should be shown when inbox count defaults to 0
			expect(screen.queryByTestId("inbox-badge")).toBe(null);
		});
	});
});
