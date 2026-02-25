import { ViewAllSitesDropdown } from "./ViewAllSitesDropdown";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create intlayer-style mock values
function createMockIntlayerValue(value: string) {
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Need String object for .value property
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper returns any to match Intlayer's flexible types
	const str = new String(value) as any;
	str.value = value;
	return str;
}

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Globe: () => <div data-testid="globe-icon" />,
		Lock: () => <div data-testid="lock-icon" />,
		Search: () => <div data-testid="search-icon" />,
		Star: () => <div data-testid="star-icon" />,
		ExternalLink: () => <div data-testid="external-link-icon" />,
	};
});

// Mock intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		allSites: createMockIntlayerValue("All Sites"),
		searchSites: createMockIntlayerValue("Search sites..."),
		addToFavorites: createMockIntlayerValue("Add to favorites"),
		removeFromFavorites: createMockIntlayerValue("Remove from favorites"),
		openInNewTab: createMockIntlayerValue("Open in new tab"),
		noResults: createMockIntlayerValue("No sites found"),
		noSites: createMockIntlayerValue("No sites available"),
		authPublic: createMockIntlayerValue("Public"),
		authProtected: createMockIntlayerValue("Protected"),
	}),
}));

// Mock NavigationContext
let mockSiteId: number | undefined = 1;

vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		siteId: mockSiteId,
	}),
}));

// Mock SitesContext
const mockToggleSiteFavorite = vi.fn();
const mockIsFavorite = vi.fn();
let currentMockSites: Array<SiteWithUpdate> = [];

const mockSites: Array<SiteWithUpdate> = [
	{
		id: 1,
		name: "site-one",
		displayName: "Site One",
		userId: 1,
		visibility: "external",
		status: "active",
		metadata: {
			framework: "nextra",
			articleCount: 10,
			githubRepo: "org/site-one",
			githubUrl: "https://github.com/org/site-one",
			productionUrl: "https://site-one.com",
		},
		createdAt: "2024-01-01",
		updatedAt: "2024-01-01",
		needsUpdate: false,
		lastGeneratedAt: undefined,
	},
	{
		id: 2,
		name: "site-two",
		displayName: "Site Two",
		userId: 1,
		visibility: "external",
		status: "active",
		metadata: {
			framework: "docusaurus",
			articleCount: 5,
			githubRepo: "org/site-two",
			githubUrl: "https://github.com/org/site-two",
			jolliSiteDomain: "site-two.jolli.site",
			jwtAuth: { enabled: true, mode: "full" as const, loginUrl: "", publicKey: "" },
			generatedJwtAuthEnabled: true,
		},
		createdAt: "2024-01-02",
		updatedAt: "2024-01-02",
		needsUpdate: false,
		lastGeneratedAt: undefined,
	},
	{
		id: 3,
		name: "favorite-site",
		displayName: "Favorite Site",
		userId: 1,
		visibility: "external",
		status: "active",
		metadata: {
			framework: "nextra",
			articleCount: 20,
			githubRepo: "org/favorite-site",
			githubUrl: "https://github.com/org/favorite-site",
			productionUrl: "https://favorite-site.com",
		},
		createdAt: "2024-01-03",
		updatedAt: "2024-01-03",
		needsUpdate: false,
		lastGeneratedAt: undefined,
	},
	{
		id: 4,
		name: "site-four",
		displayName: "Site Four",
		userId: 1,
		visibility: "external",
		status: "active",
		metadata: {
			framework: "nextra",
			articleCount: 3,
			githubRepo: "org/site-four",
			githubUrl: "https://github.com/org/site-four",
			// Has both jolliSiteDomain and productionUrl - should prefer jolliSiteDomain
			jolliSiteDomain: "site-four.jolli.site",
			productionUrl: "https://site-four-prod.com",
		},
		createdAt: "2024-01-04",
		updatedAt: "2024-01-04",
		needsUpdate: false,
		lastGeneratedAt: undefined,
	},
];

vi.mock("../../contexts/SitesContext", () => ({
	useSites: () => ({
		sites: currentMockSites,
		isFavorite: mockIsFavorite,
		toggleSiteFavorite: mockToggleSiteFavorite,
	}),
}));

describe("ViewAllSitesDropdown", () => {
	const mockOnSiteClick = vi.fn();
	const mockTriggerRef = { current: null as HTMLButtonElement | null };

	beforeEach(() => {
		vi.clearAllMocks();
		mockIsFavorite.mockReturnValue(false);
		mockSiteId = 1;
		currentMockSites = mockSites;

		// Create a mock trigger element with getBoundingClientRect for position calculation
		const mockTriggerElement = document.createElement("button");
		mockTriggerElement.getBoundingClientRect = vi.fn(() => ({
			top: 100,
			right: 240,
			bottom: 140,
			left: 0,
			width: 240,
			height: 40,
			x: 0,
			y: 100,
			toJSON: () => ({}),
		}));
		mockTriggerRef.current = mockTriggerElement;
	});

	it("should render dropdown with header", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByTestId("view-all-sites-title")).toBeDefined();
		expect(screen.getByTestId("view-all-sites-dropdown")).toBeDefined();
	});

	it("should render search input", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByTestId("search-sites-input")).toBeDefined();
	});

	it("should render all sites", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByTestId("all-sites-item-1")).toBeDefined();
		expect(screen.getByTestId("all-sites-item-2")).toBeDefined();
		expect(screen.getByTestId("all-sites-item-3")).toBeDefined();
		expect(screen.getByTestId("all-sites-name-1")).toBeDefined();
		expect(screen.getByTestId("all-sites-name-2")).toBeDefined();
		expect(screen.getByTestId("all-sites-name-3")).toBeDefined();
	});

	it("should filter sites by search query", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const searchInput = screen.getByTestId("search-sites-input");
		fireEvent.input(searchInput, { target: { value: "Favorite" } });

		expect(screen.getByTestId("all-sites-name-3")).toBeDefined();
		expect(screen.queryByTestId("all-sites-name-1")).toBeNull();
		expect(screen.queryByTestId("all-sites-name-2")).toBeNull();
	});

	it("should show no results message when search has no matches", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const searchInput = screen.getByTestId("search-sites-input");
		fireEvent.input(searchInput, { target: { value: "nonexistent" } });

		expect(screen.getByTestId("view-all-sites-no-results")).toBeDefined();
	});

	it("should show no sites message when sites list is empty", () => {
		currentMockSites = [];

		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByTestId("view-all-sites-no-sites")).toBeDefined();
	});

	it("should call onSiteClick when site row is clicked", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const siteItem = screen.getByTestId("all-sites-item-2");
		fireEvent.click(siteItem);

		expect(mockOnSiteClick).toHaveBeenCalledWith(mockSites[1]);
	});

	it("should not call onSiteClick when clicking current site", () => {
		mockSiteId = 1; // Site 1 is active

		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const siteItem = screen.getByTestId("all-sites-item-1");
		fireEvent.click(siteItem);

		expect(mockOnSiteClick).not.toHaveBeenCalled();
	});

	it("should toggle favorite when star button is clicked", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const starButton = screen.getByTestId("star-site-1");
		fireEvent.click(starButton);

		expect(mockToggleSiteFavorite).toHaveBeenCalledWith(1);
		expect(mockOnSiteClick).not.toHaveBeenCalled();
	});

	it("should show filled star for favorited sites", () => {
		mockIsFavorite.mockImplementation((id: number) => id === 3);

		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const starButton = screen.getByTestId("star-site-3");
		expect(starButton.className).toContain("opacity-100");
	});

	it("should show external link button for sites with URL", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByTestId("open-site-1")).toBeDefined();
		expect(screen.getByTestId("open-site-2")).toBeDefined();
	});

	it("should open site URL in new tab when external link clicked", () => {
		const mockWindowOpen = vi.fn();
		Object.defineProperty(window, "open", {
			value: mockWindowOpen,
			writable: true,
			configurable: true,
		});

		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const externalLinkButton = screen.getByTestId("open-site-1");
		fireEvent.click(externalLinkButton);

		expect(mockWindowOpen).toHaveBeenCalledWith("https://site-one.com", "_blank");
		expect(mockOnSiteClick).not.toHaveBeenCalled();
	});

	it("should use jolliSiteDomain when available", () => {
		const mockWindowOpen = vi.fn();
		Object.defineProperty(window, "open", {
			value: mockWindowOpen,
			writable: true,
			configurable: true,
		});

		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const externalLinkButton = screen.getByTestId("open-site-2");
		fireEvent.click(externalLinkButton);

		expect(mockWindowOpen).toHaveBeenCalledWith("https://site-two.jolli.site", "_blank");
	});

	it("should prefer jolliSiteDomain over productionUrl", () => {
		const mockWindowOpen = vi.fn();
		Object.defineProperty(window, "open", {
			value: mockWindowOpen,
			writable: true,
			configurable: true,
		});

		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		// Site 4 has both jolliSiteDomain and productionUrl - should use jolliSiteDomain
		const externalLinkButton = screen.getByTestId("open-site-4");
		fireEvent.click(externalLinkButton);

		expect(mockWindowOpen).toHaveBeenCalledWith("https://site-four.jolli.site", "_blank");
	});

	it("should highlight active site", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const activeSiteItem = screen.getByTestId("all-sites-item-1");
		expect(activeSiteItem.className).toContain("bg-accent");
	});

	it("should display first letter avatar with color", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const siteItem = screen.getByTestId("all-sites-item-1");
		const avatarDiv = siteItem.querySelector(".rounded");
		expect(avatarDiv?.textContent).toBe("S");
		expect(avatarDiv?.className).toContain("bg-");
	});

	it("should handle keyboard navigation with Enter key", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const siteItem = screen.getByTestId("all-sites-item-2");
		fireEvent.keyDown(siteItem, { key: "Enter" });

		expect(mockOnSiteClick).toHaveBeenCalledWith(mockSites[1]);
	});

	it("should handle keyboard navigation with Space key", () => {
		render(<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />);

		const siteItem = screen.getByTestId("all-sites-item-2");
		fireEvent.keyDown(siteItem, { key: " " });

		expect(mockOnSiteClick).toHaveBeenCalledWith(mockSites[1]);
	});

	describe("Position Calculation", () => {
		it("should position above trigger when not enough space below but enough above", () => {
			const triggerElement = document.createElement("button");
			triggerElement.getBoundingClientRect = vi.fn(() => ({
				top: 500,
				right: 240,
				bottom: 560,
				left: 0,
				width: 240,
				height: 60,
				x: 0,
				y: 500,
				toJSON: () => ({}),
			}));
			Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
			const aboveTriggerRef = { current: triggerElement };

			render(
				<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={aboveTriggerRef} />,
			);

			const dropdown = screen.getByTestId("view-all-sites-dropdown");
			expect(dropdown.style.top).toBe("160px");
		});

		it("should fit to viewport with padding when not enough space above or below", () => {
			const triggerElement = document.createElement("button");
			triggerElement.getBoundingClientRect = vi.fn(() => ({
				top: 200,
				right: 240,
				bottom: 260,
				left: 0,
				width: 240,
				height: 60,
				x: 0,
				y: 200,
				toJSON: () => ({}),
			}));
			Object.defineProperty(window, "innerHeight", { value: 300, configurable: true });
			const smallViewportRef = { current: triggerElement };

			render(
				<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={smallViewportRef} />,
			);

			const dropdown = screen.getByTestId("view-all-sites-dropdown");
			const top = Number.parseInt(dropdown.style.top, 10);
			expect(top).toBe(8);
		});
	});

	describe("Auth Status Indicator", () => {
		it("should show public indicator for sites without auth", () => {
			render(
				<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />,
			);

			// Site 1 has no jwtAuth — should show public indicator
			const site1 = screen.getByTestId("all-sites-item-1");
			expect(site1.querySelector('[data-testid="site-auth-public"]')).not.toBeNull();
		});

		it("should show protected indicator for sites with auth enabled", () => {
			render(
				<ViewAllSitesDropdown collapsed={false} onSiteClick={mockOnSiteClick} triggerRef={mockTriggerRef} />,
			);

			// Site 2 has generatedJwtAuthEnabled = true — should show protected indicator
			const site2 = screen.getByTestId("all-sites-item-2");
			expect(site2.querySelector('[data-testid="site-auth-protected"]')).not.toBeNull();
		});
	});
});
