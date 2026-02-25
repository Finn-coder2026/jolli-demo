import { SitesFavoritesList } from "./SitesFavoritesList";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Globe: () => <div data-testid="globe-icon" />,
		Lock: () => <div data-testid="lock-icon" />,
		Star: () => <div data-testid="star-icon" />,
		ChevronDown: () => <div data-testid="chevron-down-icon" />,
		ChevronRight: () => <div data-testid="chevron-right-icon" />,
		Search: () => <div data-testid="search-icon" />,
		ExternalLink: () => <div data-testid="external-link-icon" />,
		Plus: () => <div data-testid="plus-icon" />,
	};
});

// react-intlayer mock is provided globally by Vitest.tsx setup

// Mock usePreference hook
const mockSetSectionExpanded = vi.fn();
let mockSectionExpanded = true;

vi.mock("../../hooks/usePreference", () => ({
	usePreference: () => [mockSectionExpanded, mockSetSectionExpanded],
}));

// Mock NavigationContext
const mockNavigate = vi.fn();
let mockSiteId: number | undefined = 1;

vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
		siteId: mockSiteId,
	}),
}));

/** Helper to create a simple mock site. */
function createMockSite(id: number, displayName: string, metadata?: SiteWithUpdate["metadata"]): SiteWithUpdate {
	return {
		id,
		name: displayName.toLowerCase().replace(/ /g, "-"),
		displayName,
		userId: 1,
		visibility: "external",
		status: "active",
		metadata,
		createdAt: "2024-01-01",
		updatedAt: "2024-01-01",
		needsUpdate: false,
		lastGeneratedAt: undefined,
	};
}

// 8 mock sites to exercise the soft cap of 6
let mockSites: Array<SiteWithUpdate> = [
	createMockSite(1, "Alpha Site", {
		framework: "nextra",
		articleCount: 10,
		githubRepo: "org/repo1",
		githubUrl: "https://github.com/org/repo1",
		productionUrl: "https://alpha-site.com",
	}),
	createMockSite(2, "Bravo Site", {
		framework: "nextra",
		articleCount: 5,
		githubRepo: "org/repo2",
		githubUrl: "https://github.com/org/repo2",
		jolliSiteDomain: "bravo-site.jolli.site",
		jwtAuth: { enabled: true, mode: "full" as const, loginUrl: "", publicKey: "" },
		generatedJwtAuthEnabled: true,
	}),
	createMockSite(3, "Charlie Site"), // No metadata — no URL
	createMockSite(4, "Delta Site", {
		framework: "nextra",
		articleCount: 3,
		githubRepo: "org/repo4",
		githubUrl: "https://github.com/org/repo4",
		jolliSiteDomain: "delta-site.jolli.site",
		productionUrl: "https://delta-site-prod.com",
	}),
	createMockSite(5, "Echo Site", {
		framework: "nextra",
		articleCount: 2,
		githubRepo: "org/repo5",
		githubUrl: "https://github.com/org/repo5",
		productionUrl: "https://echo-site.com",
	}),
	createMockSite(6, "Foxtrot Site", {
		framework: "nextra",
		articleCount: 1,
		githubRepo: "org/repo6",
		githubUrl: "https://github.com/org/repo6",
		productionUrl: "https://foxtrot-site.com",
	}),
	createMockSite(7, "Golf Site", {
		framework: "nextra",
		articleCount: 4,
		githubRepo: "org/repo7",
		githubUrl: "https://github.com/org/repo7",
		productionUrl: "https://golf-site.com",
	}),
	createMockSite(8, "Hotel Site", {
		framework: "nextra",
		articleCount: 6,
		githubRepo: "org/repo8",
		githubUrl: "https://github.com/org/repo8",
		productionUrl: "https://hotel-site.com",
	}),
];

let mockFavoriteSites: Array<number> = [1, 2];
const mockToggleSiteFavorite = vi.fn();
const mockRefreshSites = vi.fn(() => Promise.resolve());

vi.mock("../../contexts/SitesContext", () => ({
	useSites: () => ({
		sites: mockSites,
		isFavorite: (siteId: number) => mockFavoriteSites.includes(siteId),
		toggleSiteFavorite: mockToggleSiteFavorite,
		refreshSites: mockRefreshSites,
	}),
}));

describe("SitesFavoritesList", () => {
	const mockWindowOpen = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockSectionExpanded = true;
		mockFavoriteSites = [1, 2];
		mockSiteId = 1;

		// Mock window.open
		Object.defineProperty(window, "open", {
			value: mockWindowOpen,
			writable: true,
			configurable: true,
		});

		// Reset to default 8 sites
		mockSites = [
			createMockSite(1, "Alpha Site", {
				framework: "nextra",
				articleCount: 10,
				githubRepo: "org/repo1",
				githubUrl: "https://github.com/org/repo1",
				productionUrl: "https://alpha-site.com",
			}),
			createMockSite(2, "Bravo Site", {
				framework: "nextra",
				articleCount: 5,
				githubRepo: "org/repo2",
				githubUrl: "https://github.com/org/repo2",
				jolliSiteDomain: "bravo-site.jolli.site",
				jwtAuth: { enabled: true, mode: "full" as const, loginUrl: "", publicKey: "" },
				generatedJwtAuthEnabled: true,
			}),
			createMockSite(3, "Charlie Site"),
			createMockSite(4, "Delta Site", {
				framework: "nextra",
				articleCount: 3,
				githubRepo: "org/repo4",
				githubUrl: "https://github.com/org/repo4",
				jolliSiteDomain: "delta-site.jolli.site",
				productionUrl: "https://delta-site-prod.com",
			}),
			createMockSite(5, "Echo Site", {
				framework: "nextra",
				articleCount: 2,
				githubRepo: "org/repo5",
				githubUrl: "https://github.com/org/repo5",
				productionUrl: "https://echo-site.com",
			}),
			createMockSite(6, "Foxtrot Site", {
				framework: "nextra",
				articleCount: 1,
				githubRepo: "org/repo6",
				githubUrl: "https://github.com/org/repo6",
				productionUrl: "https://foxtrot-site.com",
			}),
			createMockSite(7, "Golf Site", {
				framework: "nextra",
				articleCount: 4,
				githubRepo: "org/repo7",
				githubUrl: "https://github.com/org/repo7",
				productionUrl: "https://golf-site.com",
			}),
			createMockSite(8, "Hotel Site", {
				framework: "nextra",
				articleCount: 6,
				githubRepo: "org/repo8",
				githubUrl: "https://github.com/org/repo8",
				productionUrl: "https://hotel-site.com",
			}),
		];
	});

	describe("Expanded Sidebar Mode", () => {
		it("should render section header with sites label", () => {
			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.getByText("Sites")).toBeDefined();
		});

		it("should show chevron down when section is expanded", () => {
			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.getByTestId("chevron-down-icon")).toBeDefined();
		});

		it("should show chevron right when section is collapsed", () => {
			mockSectionExpanded = false;

			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.getByTestId("chevron-right-icon")).toBeDefined();
		});

		it("should toggle section expansion when header is clicked", () => {
			render(<SitesFavoritesList collapsed={false} />);

			const toggle = screen.getByTestId("sites-section-toggle");
			fireEvent.click(toggle);

			expect(mockSetSectionExpanded).toHaveBeenCalledWith(false);
		});
	});

	describe("Soft Cap Display Logic", () => {
		it("should show first 6 sites alphabetically when no favorites", () => {
			mockFavoriteSites = [];

			render(<SitesFavoritesList collapsed={false} />);

			// First 6 alphabetically: Alpha, Bravo, Charlie, Delta, Echo, Foxtrot
			expect(screen.getByTestId("site-1")).toBeDefined();
			expect(screen.getByTestId("site-2")).toBeDefined();
			expect(screen.getByTestId("site-3")).toBeDefined();
			expect(screen.getByTestId("site-4")).toBeDefined();
			expect(screen.getByTestId("site-5")).toBeDefined();
			expect(screen.getByTestId("site-6")).toBeDefined();
			// Golf and Hotel should be hidden
			expect(screen.queryByTestId("site-7")).toBe(null);
			expect(screen.queryByTestId("site-8")).toBe(null);
		});

		it("should show 2 favorites + 4 non-favorites when 2 are favorited", () => {
			// Favorite Golf and Hotel (last alphabetically)
			mockFavoriteSites = [7, 8];

			render(<SitesFavoritesList collapsed={false} />);

			// Favorites first: Golf, Hotel
			expect(screen.getByTestId("site-7")).toBeDefined();
			expect(screen.getByTestId("site-8")).toBeDefined();
			// Then 4 non-favorites alphabetically: Alpha, Bravo, Charlie, Delta
			expect(screen.getByTestId("site-1")).toBeDefined();
			expect(screen.getByTestId("site-2")).toBeDefined();
			expect(screen.getByTestId("site-3")).toBeDefined();
			expect(screen.getByTestId("site-4")).toBeDefined();
			// Echo and Foxtrot should be hidden
			expect(screen.queryByTestId("site-5")).toBe(null);
			expect(screen.queryByTestId("site-6")).toBe(null);
		});

		it("should show exactly 6 favorites and no non-favorites when 6 are favorited", () => {
			mockFavoriteSites = [1, 2, 3, 4, 5, 6];

			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.getByTestId("site-1")).toBeDefined();
			expect(screen.getByTestId("site-2")).toBeDefined();
			expect(screen.getByTestId("site-3")).toBeDefined();
			expect(screen.getByTestId("site-4")).toBeDefined();
			expect(screen.getByTestId("site-5")).toBeDefined();
			expect(screen.getByTestId("site-6")).toBeDefined();
			// Non-favorites hidden
			expect(screen.queryByTestId("site-7")).toBe(null);
			expect(screen.queryByTestId("site-8")).toBe(null);
		});

		it("should show all favorites when more than 6 are favorited (soft cap exceeded)", () => {
			mockFavoriteSites = [1, 2, 3, 4, 5, 6, 7];

			render(<SitesFavoritesList collapsed={false} />);

			// All 7 favorites shown
			expect(screen.getByTestId("site-1")).toBeDefined();
			expect(screen.getByTestId("site-2")).toBeDefined();
			expect(screen.getByTestId("site-3")).toBeDefined();
			expect(screen.getByTestId("site-4")).toBeDefined();
			expect(screen.getByTestId("site-5")).toBeDefined();
			expect(screen.getByTestId("site-6")).toBeDefined();
			expect(screen.getByTestId("site-7")).toBeDefined();
			// Non-favorite still hidden
			expect(screen.queryByTestId("site-8")).toBe(null);
		});

		it("should show all sites when total count is within soft cap", () => {
			mockSites = [
				createMockSite(1, "Alpha Site"),
				createMockSite(2, "Bravo Site"),
				createMockSite(3, "Charlie Site"),
			];
			mockFavoriteSites = [];

			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.getByTestId("site-1")).toBeDefined();
			expect(screen.getByTestId("site-2")).toBeDefined();
			expect(screen.getByTestId("site-3")).toBeDefined();
		});
	});

	describe("Sites Interaction", () => {
		it("should show visible sites with favorites first", () => {
			// With default: favorites [1, 2], 8 total sites
			// Visible: favorites (Alpha, Bravo) + non-favorites (Charlie, Delta, Echo, Foxtrot)
			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.getByTestId("site-1")).toBeDefined();
			expect(screen.getByTestId("site-2")).toBeDefined();
			expect(screen.getByTestId("site-3")).toBeDefined();
			expect(screen.getByTestId("site-4")).toBeDefined();
			expect(screen.getByTestId("site-5")).toBeDefined();
			expect(screen.getByTestId("site-6")).toBeDefined();
		});

		it("should highlight active site", () => {
			mockSiteId = 2;

			render(<SitesFavoritesList collapsed={false} />);

			const activeSite = screen.getByTestId("site-2");
			expect(activeSite.className).toMatch(/selected/);
		});

		it("should navigate to site detail page when site is clicked", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Click the navigation button inside the site row
			const siteRow = screen.getByTestId("site-2");
			const navButton = siteRow.querySelector("button") as HTMLElement;
			fireEvent.click(navButton);

			expect(mockNavigate).toHaveBeenCalledWith("/sites/2");
		});

		it("should toggle favorite when star is clicked", () => {
			render(<SitesFavoritesList collapsed={false} />);

			const starButton = screen.getByTestId("star-site-1");
			fireEvent.click(starButton);

			expect(mockToggleSiteFavorite).toHaveBeenCalledWith(1);
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("should open site in new tab when external link is clicked", () => {
			render(<SitesFavoritesList collapsed={false} />);

			const openButton = screen.getByTestId("open-site-1");
			fireEvent.click(openButton);

			expect(mockWindowOpen).toHaveBeenCalledWith("https://alpha-site.com", "_blank");
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("should use jolliSiteDomain when available", () => {
			render(<SitesFavoritesList collapsed={false} />);

			const openButton = screen.getByTestId("open-site-2");
			fireEvent.click(openButton);

			expect(mockWindowOpen).toHaveBeenCalledWith("https://bravo-site.jolli.site", "_blank");
		});

		it("should prefer jolliSiteDomain over productionUrl", () => {
			// Delta Site (id=4) has both jolliSiteDomain and productionUrl
			mockFavoriteSites = [4];

			render(<SitesFavoritesList collapsed={false} />);

			const openButton = screen.getByTestId("open-site-4");
			fireEvent.click(openButton);

			expect(mockWindowOpen).toHaveBeenCalledWith("https://delta-site.jolli.site", "_blank");
		});

		it("should not show external link button for sites without URL", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Charlie Site (id=3) has no URL metadata
			expect(screen.queryByTestId("open-site-3")).toBe(null);
		});
	});

	describe("View All Sites", () => {
		it("should show view all button when there are hidden sites", () => {
			// 8 sites, soft cap = 6, so 2 are hidden
			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.getByTestId("view-all-sites-button")).toBeDefined();
		});

		it("should hide view all button when all sites are visible", () => {
			mockSites = [
				createMockSite(1, "Alpha Site"),
				createMockSite(2, "Bravo Site"),
				createMockSite(3, "Charlie Site"),
			];
			mockFavoriteSites = [];

			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.queryByTestId("view-all-sites-button")).toBe(null);
		});

		it("should hide view all button when all 8 favorites are shown (soft cap exceeded)", () => {
			mockFavoriteSites = [1, 2, 3, 4, 5, 6, 7, 8];

			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.queryByTestId("view-all-sites-button")).toBe(null);
		});

		it("should open dropdown when view all is clicked", () => {
			render(<SitesFavoritesList collapsed={false} />);

			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			expect(screen.getByTestId("view-all-sites-dropdown")).toBeDefined();
		});

		it("should show backdrop when dropdown is open", () => {
			render(<SitesFavoritesList collapsed={false} />);

			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			expect(screen.getByTestId("view-all-backdrop")).toBeDefined();
		});

		it("should close dropdown when backdrop is clicked", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			// Click backdrop
			const backdrop = screen.getByTestId("view-all-backdrop");
			fireEvent.click(backdrop);

			expect(screen.queryByTestId("view-all-sites-dropdown")).toBe(null);
		});

		it("should hide sites list when section is collapsed", () => {
			mockSectionExpanded = false;

			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.queryByTestId("site-1")).toBe(null);
			expect(screen.queryByTestId("view-all-sites-button")).toBe(null);
		});
	});

	describe("Collapsed Sidebar Mode", () => {
		it("should show icon button in collapsed mode", () => {
			render(<SitesFavoritesList collapsed={true} />);

			expect(screen.getByTestId("sites-collapsed-trigger")).toBeDefined();
			expect(screen.getByTestId("globe-icon")).toBeDefined();
		});

		it("should not show section header in collapsed mode", () => {
			render(<SitesFavoritesList collapsed={true} />);

			expect(screen.queryByTestId("sites-section-toggle")).toBe(null);
		});

		it("should open dropdown when icon is clicked in collapsed mode", () => {
			render(<SitesFavoritesList collapsed={true} />);

			const trigger = screen.getByTestId("sites-collapsed-trigger");
			fireEvent.click(trigger);

			expect(screen.getByTestId("view-all-sites-dropdown")).toBeDefined();
		});

		it("should close dropdown when backdrop is clicked in collapsed mode", () => {
			render(<SitesFavoritesList collapsed={true} />);

			// Open dropdown
			const trigger = screen.getByTestId("sites-collapsed-trigger");
			fireEvent.click(trigger);
			expect(screen.getByTestId("view-all-backdrop")).toBeDefined();

			// Click backdrop to close
			const backdrop = screen.getByTestId("view-all-backdrop");
			fireEvent.click(backdrop);

			expect(screen.queryByTestId("view-all-sites-dropdown")).toBe(null);
		});
	});

	describe("ViewAllSitesDropdown Integration", () => {
		it("should display all sites in dropdown", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			// All 8 sites should appear in the dropdown
			expect(screen.getByTestId("all-sites-item-1")).toBeDefined();
			expect(screen.getByTestId("all-sites-item-2")).toBeDefined();
			expect(screen.getByTestId("all-sites-item-3")).toBeDefined();
			expect(screen.getByTestId("all-sites-item-4")).toBeDefined();
			expect(screen.getByTestId("all-sites-item-5")).toBeDefined();
			expect(screen.getByTestId("all-sites-item-6")).toBeDefined();
			expect(screen.getByTestId("all-sites-item-7")).toBeDefined();
			expect(screen.getByTestId("all-sites-item-8")).toBeDefined();
		});

		it("should show search input in dropdown", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			expect(screen.getByTestId("search-sites-input")).toBeDefined();
		});

		it("should filter sites when searching", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			// Search for "Golf"
			const searchInput = screen.getByTestId("search-sites-input");
			fireEvent.change(searchInput, { target: { value: "Golf" } });

			expect(screen.getByTestId("all-sites-item-7")).toBeDefined();
			expect(screen.queryByTestId("all-sites-item-1")).toBe(null);
		});

		it("should show no results message when search has no matches", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			// Search for non-existent site
			const searchInput = screen.getByTestId("search-sites-input");
			fireEvent.change(searchInput, { target: { value: "NonExistent" } });

			expect(screen.getByText("No sites found")).toBeDefined();
		});

		it("should toggle favorite in dropdown", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			// Click star on site 7 in the dropdown
			const starButtons = screen.getAllByTestId("star-site-7");
			fireEvent.click(starButtons[starButtons.length - 1]);

			expect(mockToggleSiteFavorite).toHaveBeenCalledWith(7);
		});

		it("should open site in new tab when external link is clicked in dropdown", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			// Click external link on site 1 (get the one in dropdown, not sidebar)
			const openButtons = screen.getAllByTestId("open-site-1");
			expect(openButtons.length).toBe(2); // One in sidebar, one in dropdown
			fireEvent.click(openButtons[1]);

			expect(mockWindowOpen).toHaveBeenCalledWith("https://alpha-site.com", "_blank");
		});

		it("should close dropdown and navigate to site when site is clicked in dropdown", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-sites-button");
			fireEvent.click(viewAllButton);

			// Click site 7 (hidden in sidebar, visible in dropdown)
			const siteItem = screen.getByTestId("all-sites-item-7");
			fireEvent.click(siteItem);

			expect(mockNavigate).toHaveBeenCalledWith("/sites/7");
			expect(screen.queryByTestId("view-all-sites-dropdown")).toBe(null);
		});
	});

	describe("Create Site", () => {
		it("should show create button in expanded mode", () => {
			render(<SitesFavoritesList collapsed={false} />);

			expect(screen.getByTestId("create-site-button")).toBeDefined();
		});

		it("should navigate to create wizard when create button is clicked", () => {
			render(<SitesFavoritesList collapsed={false} />);

			const createButton = screen.getByTestId("create-site-button");
			fireEvent.click(createButton);

			expect(mockNavigate).toHaveBeenCalledWith("/sites/new");
		});
	});

	describe("Auth Status Indicator", () => {
		it("should show public indicator for sites without auth", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Alpha Site (id=1) has no jwtAuth — should show public indicator
			const site1 = screen.getByTestId("site-1");
			expect(site1.querySelector('[data-testid="site-auth-public"]')).not.toBeNull();
		});

		it("should show protected indicator for sites with auth enabled", () => {
			render(<SitesFavoritesList collapsed={false} />);

			// Bravo Site (id=2) has generatedJwtAuthEnabled = true — should show protected indicator
			const site2 = screen.getByTestId("site-2");
			expect(site2.querySelector('[data-testid="site-auth-protected"]')).not.toBeNull();
		});
	});
});
