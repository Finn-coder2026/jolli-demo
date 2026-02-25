import { createMockSite } from "./__testUtils__/SiteTestFactory";
import { SiteSwitcher } from "./SiteSwitcher";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for mock functions available in vi.mock blocks
const { mockNavigate, mockUseSites } = vi.hoisted(() => ({
	mockNavigate: vi.fn(),
	mockUseSites: vi.fn(),
}));

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: (key: string) => {
		if (key === "site-switcher") {
			return {
				addSite: "Add Site",
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
		Check: () => <div data-testid="check-icon" />,
		ChevronDown: () => <div data-testid="chevron-down-icon" />,
		Plus: () => <div data-testid="plus-icon" />,
	};
});

// Mock NavigationContext
vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({ navigate: mockNavigate }),
}));

// Mock SitesContext
vi.mock("../../contexts/SitesContext", () => ({
	useSites: () => mockUseSites(),
}));

// Mock SiteIcon
vi.mock("../../components/SiteIcon", () => ({
	SiteIcon: ({ name }: { name: string }) => <span data-testid="site-icon">{name}</span>,
}));

// Mock SiteAuthIndicator
vi.mock("../unified-sidebar/SiteAuthIndicator", () => ({
	SiteAuthIndicator: () => <span data-testid="site-auth-indicator" />,
}));

// Mock DropdownMenu components
vi.mock("../../components/ui/DropdownMenu", () => ({
	DropdownMenu: ({
		children,
		open,
		onOpenChange,
	}: {
		children: React.ReactNode;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}) => (
		<div data-testid="dropdown-menu" data-open={open}>
			{children}
			{/* Hidden button to toggle open state from tests */}
			<button type="button" data-testid="dropdown-toggle" onClick={() => onOpenChange(!open)}>
				Toggle
			</button>
		</div>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="dropdown-trigger">{children}</div>
	),
	DropdownMenuContent: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
		<div data-testid="site-switcher-content" {...props}>
			{children}
		</div>
	),
	DropdownMenuItem: ({
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
	DropdownMenuSeparator: () => <hr data-testid="dropdown-separator" />,
}));

// Mock Button - pass through
vi.mock("../../components/ui/Button", () => ({
	Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));

// Mock Skeleton
vi.mock("../../components/ui/Skeleton", () => ({
	Skeleton: (props: Record<string, unknown>) => <div data-testid="site-switcher-loading" {...props} />,
}));

describe("SiteSwitcher", () => {
	const site1 = createMockSite({ id: 1, displayName: "Site One" });
	const site2 = createMockSite({ id: 2, displayName: "Site Two" });
	const site3 = createMockSite({ id: 3, displayName: "Site Three" });

	const mockOnSiteChange = vi.fn();
	const mockOnOpenChange = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockUseSites.mockReturnValue({
			sites: [site1, site2, site3],
			isLoading: false,
		});
	});

	function renderSwitcher(currentSite: SiteWithUpdate = site1) {
		return render(
			<SiteSwitcher currentSite={currentSite} onSiteChange={mockOnSiteChange} onOpenChange={mockOnOpenChange} />,
		);
	}

	it("renders the trigger button with current site name", () => {
		renderSwitcher();
		expect(screen.getByTestId("site-switcher-trigger")).toBeDefined();
		expect(screen.getByTestId("site-switcher-trigger").textContent).toContain("Site One");
	});

	it("shows loading skeleton when sites are loading", () => {
		mockUseSites.mockReturnValue({ sites: [], isLoading: true });
		renderSwitcher();
		expect(screen.getByTestId("site-switcher-loading")).toBeDefined();
		expect(screen.queryByTestId("site-switcher-trigger")).toBeNull();
	});

	it("renders all sites in the dropdown", () => {
		renderSwitcher();
		expect(screen.getByTestId("site-option-1")).toBeDefined();
		expect(screen.getByTestId("site-option-2")).toBeDefined();
		expect(screen.getByTestId("site-option-3")).toBeDefined();
	});

	it("renders the Add Site option", () => {
		renderSwitcher();
		expect(screen.getByTestId("add-site-option")).toBeDefined();
		expect(screen.getByTestId("add-site-option").textContent).toContain("Add Site");
	});

	it("shows check icon next to the current site", () => {
		renderSwitcher(site1);
		const siteOption = screen.getByTestId("site-option-1");
		expect(siteOption.querySelector("[data-testid='check-icon']")).not.toBeNull();
	});

	it("does not show check icon next to non-current sites", () => {
		renderSwitcher(site1);
		const siteOption = screen.getByTestId("site-option-2");
		expect(siteOption.querySelector("[data-testid='check-icon']")).toBeNull();
	});

	it("calls onSiteChange when a different site is selected", () => {
		renderSwitcher(site1);
		fireEvent.click(screen.getByTestId("site-option-2"));
		expect(mockOnSiteChange).toHaveBeenCalledWith(site2);
	});

	it("does not call onSiteChange when the current site is selected", () => {
		renderSwitcher(site1);
		fireEvent.click(screen.getByTestId("site-option-1"));
		expect(mockOnSiteChange).not.toHaveBeenCalled();
	});

	it("navigates to /sites/new when Add Site is clicked", () => {
		renderSwitcher();
		fireEvent.click(screen.getByTestId("add-site-option"));
		expect(mockNavigate).toHaveBeenCalledWith("/sites/new");
	});

	it("renders site icons for each site", () => {
		renderSwitcher();
		const siteIcons = screen.getAllByTestId("site-icon");
		// One in the trigger + 3 in the dropdown
		expect(siteIcons.length).toBe(4);
	});

	it("renders auth indicator on trigger and each dropdown item", () => {
		renderSwitcher();
		const indicators = screen.getAllByTestId("site-auth-indicator");
		// 1 on the trigger + 3 in the dropdown
		expect(indicators.length).toBe(4);
	});
});
