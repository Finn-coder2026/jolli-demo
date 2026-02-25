import { SpacesFavoritesList } from "./SpacesFavoritesList";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Space } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Layers: () => <div data-testid="layers-icon" />,
		Plus: () => <div data-testid="plus-icon" />,
		Star: () => <div data-testid="star-icon" />,
		ChevronDown: () => <div data-testid="chevron-down-icon" />,
		ChevronRight: () => <div data-testid="chevron-right-icon" />,
		Search: () => <div data-testid="search-icon" />,
	};
});

// Helper to create intlayer-like values
function createMockIntlayerValue(str: string) {
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Need String object
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper
	const val = new String(str) as any;
	val.value = str;
	return val;
}

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		spaces: createMockIntlayerValue("Spaces"),
		createSpace: createMockIntlayerValue("Create space"),
		createSpaceButton: createMockIntlayerValue("Create space"),
		emptyStateMessage: createMockIntlayerValue("No spaces yet"),
		viewAllSpaces: createMockIntlayerValue("View all spaces"),
		noFavorites: createMockIntlayerValue("No favorite spaces yet"),
		noFavoritesHint: createMockIntlayerValue("Star spaces to add them here"),
		expandSection: createMockIntlayerValue("Expand spaces section"),
		collapseSection: createMockIntlayerValue("Collapse spaces section"),
		removeFromFavorites: createMockIntlayerValue("Remove from favorites"),
		searchSpaces: createMockIntlayerValue("Search spaces..."),
		allSpaces: createMockIntlayerValue("All Spaces"),
		noSpaces: createMockIntlayerValue("No spaces available"),
		noResults: createMockIntlayerValue("No spaces found"),
		addToFavorites: createMockIntlayerValue("Add to favorites"),
	}),
}));

// Mock usePreference hook
const mockSetSectionExpanded = vi.fn();
let mockSectionExpanded = true;

vi.mock("../../hooks/usePreference", () => ({
	usePreference: () => [mockSectionExpanded, mockSetSectionExpanded],
}));

// Mock CreateSpaceDialog
vi.mock("../spaces/CreateSpaceDialog", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: Mock component props simplified for testing
	CreateSpaceDialog: ({ open, onConfirm, onClose }: any) =>
		open ? (
			<div data-testid="create-space-dialog">
				<button
					type="button"
					onClick={() => onConfirm("New Space", "Description")}
					data-testid="dialog-confirm"
				>
					Confirm
				</button>
				<button type="button" onClick={() => onConfirm("New Space")} data-testid="dialog-confirm-no-desc">
					Confirm No Description
				</button>
				<button type="button" onClick={onClose} data-testid="dialog-close">
					Close
				</button>
			</div>
		) : null,
}));

/** Helper to create a mock space with the given id and name. */
function createMockSpace(id: number, name: string, isPersonal = false): Space {
	return {
		id,
		name,
		slug: name.toLowerCase().replace(/ /g, "-"),
		jrn: `jrn:space:${id}`,
		description: `${name} description`,
		ownerId: 1,
		isPersonal,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		createdAt: "2024-01-01",
		updatedAt: "2024-01-01",
	};
}

// Mock SpaceContext — 8 company spaces + 1 personal space to test soft cap
let mockSpaces: Array<Space> = [
	createMockSpace(1, "Alpha"),
	createMockSpace(2, "Bravo"),
	createMockSpace(3, "Charlie"),
	createMockSpace(4, "Delta"),
	createMockSpace(5, "Echo"),
	createMockSpace(6, "Foxtrot"),
	createMockSpace(7, "Golf"),
	createMockSpace(8, "Hotel"),
	createMockSpace(99, "My Space", true),
];

let mockFavoriteSpaces: Array<number> = [];
let mockCurrentSpace: Space = mockSpaces[0];
const mockToggleSpaceFavorite = vi.fn();
const mockCreateSpace = vi.fn();
const mockSwitchSpace = vi.fn();

vi.mock("../../contexts/SpaceContext", () => ({
	useSpace: () => ({
		spaces: mockSpaces,
		favoriteSpaces: mockFavoriteSpaces,
		currentSpace: mockCurrentSpace,
		isFavorite: (spaceId: number) => mockFavoriteSpaces.includes(spaceId),
		toggleSpaceFavorite: mockToggleSpaceFavorite,
		createSpace: mockCreateSpace,
		switchSpace: mockSwitchSpace,
	}),
}));

const mockNavigate = vi.fn();

vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
	}),
}));

describe("SpacesFavoritesList", () => {
	const mockOnSpaceClick = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockSectionExpanded = true;
		mockFavoriteSpaces = [];
		mockCurrentSpace = mockSpaces[0];
		mockCreateSpace.mockResolvedValue(mockSpaces[2]);
		mockSwitchSpace.mockResolvedValue(undefined);
		// Reset to all 8 company + 1 personal
		mockSpaces = [
			createMockSpace(1, "Alpha"),
			createMockSpace(2, "Bravo"),
			createMockSpace(3, "Charlie"),
			createMockSpace(4, "Delta"),
			createMockSpace(5, "Echo"),
			createMockSpace(6, "Foxtrot"),
			createMockSpace(7, "Golf"),
			createMockSpace(8, "Hotel"),
			createMockSpace(99, "My Space", true),
		];
	});

	describe("Expanded Sidebar Mode", () => {
		it("should render section header with spaces label", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.getByText("Spaces")).toBeDefined();
		});

		it("should show chevron down when section is expanded", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.getByTestId("chevron-down-icon")).toBeDefined();
		});

		it("should show chevron right when section is collapsed", () => {
			mockSectionExpanded = false;

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.getByTestId("chevron-right-icon")).toBeDefined();
		});

		it("should toggle section expansion when header is clicked", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			const toggle = screen.getByTestId("spaces-section-toggle");
			fireEvent.click(toggle);

			expect(mockSetSectionExpanded).toHaveBeenCalledWith(false);
		});

		it("should show create space button", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.getByTestId("create-space-button")).toBeDefined();
		});

		it("should open create dialog when create button is clicked", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			const createButton = screen.getByTestId("create-space-button");
			fireEvent.click(createButton);

			expect(screen.getByTestId("create-space-dialog")).toBeDefined();
		});

		it("should create space and navigate when dialog confirmed", async () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dialog
			const createButton = screen.getByTestId("create-space-button");
			fireEvent.click(createButton);

			// Confirm dialog
			const confirmButton = screen.getByTestId("dialog-confirm");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(mockCreateSpace).toHaveBeenCalledWith({ name: "New Space", description: "Description" }, true);
				expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[2]);
			});
		});

		it("should create space without description when description is not provided", async () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dialog
			const createButton = screen.getByTestId("create-space-button");
			fireEvent.click(createButton);

			// Confirm dialog without description
			const confirmButton = screen.getByTestId("dialog-confirm-no-desc");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(mockCreateSpace).toHaveBeenCalledWith({ name: "New Space" }, true);
				expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[2]);
			});
		});

		it("should close create dialog when cancel is clicked", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dialog
			const createButton = screen.getByTestId("create-space-button");
			fireEvent.click(createButton);

			expect(screen.getByTestId("create-space-dialog")).toBeDefined();

			// Close dialog
			const closeButton = screen.getByTestId("dialog-close");
			fireEvent.click(closeButton);

			expect(screen.queryByTestId("create-space-dialog")).toBe(null);
		});
	});

	describe("Soft Cap Display Logic", () => {
		it("should show first 6 spaces alphabetically when no favorites", () => {
			mockFavoriteSpaces = [];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// First 6 alphabetically: Alpha, Bravo, Charlie, Delta, Echo, Foxtrot
			expect(screen.getByTestId("space-1")).toBeDefined(); // Alpha
			expect(screen.getByTestId("space-2")).toBeDefined(); // Bravo
			expect(screen.getByTestId("space-3")).toBeDefined(); // Charlie
			expect(screen.getByTestId("space-4")).toBeDefined(); // Delta
			expect(screen.getByTestId("space-5")).toBeDefined(); // Echo
			expect(screen.getByTestId("space-6")).toBeDefined(); // Foxtrot
			// Golf and Hotel should be hidden
			expect(screen.queryByTestId("space-7")).toBe(null);
			expect(screen.queryByTestId("space-8")).toBe(null);
			// Personal space is excluded from the sidebar list
			expect(screen.queryByTestId("space-99")).toBe(null);
		});

		it("should show 2 favorites + 4 non-favorites when 2 are favorited", () => {
			// Favorite Golf and Hotel (which would be last alphabetically)
			mockFavoriteSpaces = [7, 8];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Favorites first: Golf, Hotel
			expect(screen.getByTestId("space-7")).toBeDefined();
			expect(screen.getByTestId("space-8")).toBeDefined();
			// Then 4 non-favorites alphabetically: Alpha, Bravo, Charlie, Delta
			expect(screen.getByTestId("space-1")).toBeDefined();
			expect(screen.getByTestId("space-2")).toBeDefined();
			expect(screen.getByTestId("space-3")).toBeDefined();
			expect(screen.getByTestId("space-4")).toBeDefined();
			// Echo and Foxtrot should be hidden
			expect(screen.queryByTestId("space-5")).toBe(null);
			expect(screen.queryByTestId("space-6")).toBe(null);
		});

		it("should show exactly 6 favorites and no non-favorites when 6 are favorited", () => {
			mockFavoriteSpaces = [1, 2, 3, 4, 5, 6];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// All 6 favorites shown
			expect(screen.getByTestId("space-1")).toBeDefined();
			expect(screen.getByTestId("space-2")).toBeDefined();
			expect(screen.getByTestId("space-3")).toBeDefined();
			expect(screen.getByTestId("space-4")).toBeDefined();
			expect(screen.getByTestId("space-5")).toBeDefined();
			expect(screen.getByTestId("space-6")).toBeDefined();
			// Non-favorites hidden
			expect(screen.queryByTestId("space-7")).toBe(null);
			expect(screen.queryByTestId("space-8")).toBe(null);
		});

		it("should show all favorites when more than 6 are favorited (soft cap exceeded)", () => {
			mockFavoriteSpaces = [1, 2, 3, 4, 5, 6, 7];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// All 7 favorites shown — soft cap exceeded
			expect(screen.getByTestId("space-1")).toBeDefined();
			expect(screen.getByTestId("space-2")).toBeDefined();
			expect(screen.getByTestId("space-3")).toBeDefined();
			expect(screen.getByTestId("space-4")).toBeDefined();
			expect(screen.getByTestId("space-5")).toBeDefined();
			expect(screen.getByTestId("space-6")).toBeDefined();
			expect(screen.getByTestId("space-7")).toBeDefined();
			// Non-favorite still hidden
			expect(screen.queryByTestId("space-8")).toBe(null);
		});

		it("should show all spaces when total non-personal count is within soft cap", () => {
			// Only 4 company spaces — all fit within soft cap
			mockSpaces = [
				createMockSpace(1, "Alpha"),
				createMockSpace(2, "Bravo"),
				createMockSpace(3, "Charlie"),
				createMockSpace(4, "Delta"),
			];
			mockFavoriteSpaces = [];
			mockCurrentSpace = mockSpaces[0];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.getByTestId("space-1")).toBeDefined();
			expect(screen.getByTestId("space-2")).toBeDefined();
			expect(screen.getByTestId("space-3")).toBeDefined();
			expect(screen.getByTestId("space-4")).toBeDefined();
		});

		it("should exclude personal spaces from the sidebar list", () => {
			mockSpaces = [createMockSpace(1, "Alpha"), createMockSpace(99, "My Space", true)];
			mockFavoriteSpaces = [];
			mockCurrentSpace = mockSpaces[0];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.getByTestId("space-1")).toBeDefined();
			expect(screen.queryByTestId("space-99")).toBe(null);
		});
	});

	describe("Spaces Interaction", () => {
		it("should highlight active space", () => {
			mockFavoriteSpaces = [1, 2];
			mockCurrentSpace = mockSpaces[1]; // Bravo

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			const activeSpace = screen.getByTestId("space-2");
			expect(activeSpace.className).toMatch(/selected/);
		});

		it("should call switchSpace and onSpaceClick when space is clicked", async () => {
			mockFavoriteSpaces = [1, 2];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Click the navigation button inside the space row
			const spaceRow = screen.getByTestId("space-2");
			const navButton = spaceRow.querySelector("button") as HTMLElement;
			fireEvent.click(navButton);

			await waitFor(() => {
				expect(mockSwitchSpace).toHaveBeenCalledWith(2);
				expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[1]);
			});
		});

		it("should call onSpaceClick even for current space to allow navigation", () => {
			mockCurrentSpace = mockSpaces[0];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Click the navigation button inside the space row
			const spaceRow = screen.getByTestId("space-1");
			const navButton = spaceRow.querySelector("button") as HTMLElement;
			fireEvent.click(navButton);

			expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[0]);
			expect(mockSwitchSpace).not.toHaveBeenCalled();
		});

		it("should toggle favorite when star is clicked", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			const starButton = screen.getByTestId("star-space-1");
			fireEvent.click(starButton);

			expect(mockToggleSpaceFavorite).toHaveBeenCalledWith(1);
			expect(mockOnSpaceClick).not.toHaveBeenCalled();
		});

		it("should handle keyboard activation on space button", async () => {
			// Native <button> elements handle Enter/Space keyboard activation
			// automatically in browsers. jsdom doesn't simulate this, so we verify
			// the button is a real <button> element (guaranteeing keyboard accessibility)
			// and that click triggers the expected behavior.
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			const spaceRow = screen.getByTestId("space-2");
			const navButton = spaceRow.querySelector("button") as HTMLElement;

			// Verify it's a real button (keyboard-accessible by default)
			expect(navButton.tagName).toBe("BUTTON");

			// Verify click triggers the expected behavior
			fireEvent.click(navButton);

			await waitFor(() => {
				expect(mockSwitchSpace).toHaveBeenCalledWith(2);
				expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[1]);
			});
		});
	});

	describe("View All Spaces", () => {
		it("should show view all button when there are hidden spaces", () => {
			// 8 company spaces, soft cap = 6, so 2 are hidden
			mockFavoriteSpaces = [];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.getByTestId("view-all-spaces-button")).toBeDefined();
		});

		it("should hide view all button when all spaces are visible", () => {
			// Only 4 company spaces — all fit within soft cap
			mockSpaces = [
				createMockSpace(1, "Alpha"),
				createMockSpace(2, "Bravo"),
				createMockSpace(3, "Charlie"),
				createMockSpace(4, "Delta"),
			];
			mockFavoriteSpaces = [];
			mockCurrentSpace = mockSpaces[0];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.queryByTestId("view-all-spaces-button")).toBe(null);
		});

		it("should hide view all button when all 8 favorites are shown (soft cap exceeded)", () => {
			mockFavoriteSpaces = [1, 2, 3, 4, 5, 6, 7, 8];

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// All 8 are favorited and all shown — no hidden spaces
			expect(screen.queryByTestId("view-all-spaces-button")).toBe(null);
		});

		it("should open dropdown when view all is clicked", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			expect(screen.getByTestId("view-all-spaces-dropdown")).toBeDefined();
		});

		it("should show backdrop when dropdown is open", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			expect(screen.getByTestId("view-all-backdrop")).toBeDefined();
		});

		it("should close dropdown when backdrop is clicked", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			// Click backdrop
			const backdrop = screen.getByTestId("view-all-backdrop");
			fireEvent.click(backdrop);

			expect(screen.queryByTestId("view-all-spaces-dropdown")).toBe(null);
		});

		it("should hide spaces list when section is collapsed", () => {
			mockSectionExpanded = false;

			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.queryByTestId("space-1")).toBe(null);
			expect(screen.queryByTestId("view-all-spaces-button")).toBe(null);
		});
	});

	describe("Collapsed Sidebar Mode", () => {
		it("should show icon button in collapsed mode", () => {
			render(<SpacesFavoritesList collapsed={true} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.getByTestId("spaces-collapsed-trigger")).toBeDefined();
			expect(screen.getByTestId("layers-icon")).toBeDefined();
		});

		it("should not show section header in collapsed mode", () => {
			render(<SpacesFavoritesList collapsed={true} onSpaceClick={mockOnSpaceClick} />);

			expect(screen.queryByTestId("spaces-section-toggle")).toBe(null);
		});

		it("should open dropdown when icon is clicked in collapsed mode", () => {
			render(<SpacesFavoritesList collapsed={true} onSpaceClick={mockOnSpaceClick} />);

			const trigger = screen.getByTestId("spaces-collapsed-trigger");
			fireEvent.click(trigger);

			expect(screen.getByTestId("view-all-spaces-dropdown")).toBeDefined();
		});

		it("should close dropdown when backdrop is clicked in collapsed mode", () => {
			render(<SpacesFavoritesList collapsed={true} onSpaceClick={mockOnSpaceClick} />);

			// Open dropdown
			const trigger = screen.getByTestId("spaces-collapsed-trigger");
			fireEvent.click(trigger);

			expect(screen.getByTestId("view-all-spaces-dropdown")).toBeDefined();

			// Click backdrop to close
			const backdrop = screen.getByTestId("view-all-backdrop");
			fireEvent.click(backdrop);

			expect(screen.queryByTestId("view-all-spaces-dropdown")).toBe(null);
		});
	});

	describe("ViewAllSpacesDropdown Integration", () => {
		it("should display all spaces in dropdown", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			// All 8 company spaces + personal space should be in the dropdown
			expect(screen.getByTestId("all-spaces-item-1")).toBeDefined();
			expect(screen.getByTestId("all-spaces-item-2")).toBeDefined();
			expect(screen.getByTestId("all-spaces-item-3")).toBeDefined();
			expect(screen.getByTestId("all-spaces-item-4")).toBeDefined();
			expect(screen.getByTestId("all-spaces-item-5")).toBeDefined();
			expect(screen.getByTestId("all-spaces-item-6")).toBeDefined();
			expect(screen.getByTestId("all-spaces-item-7")).toBeDefined();
			expect(screen.getByTestId("all-spaces-item-8")).toBeDefined();
		});

		it("should show search input in dropdown", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			expect(screen.getByTestId("search-spaces-input")).toBeDefined();
		});

		it("should filter spaces when searching", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			// Search for "Golf"
			const searchInput = screen.getByTestId("search-spaces-input");
			fireEvent.change(searchInput, { target: { value: "Golf" } });

			expect(screen.getByTestId("all-spaces-item-7")).toBeDefined();
			expect(screen.queryByTestId("all-spaces-item-1")).toBe(null);
		});

		it("should show no results message when search has no matches", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			// Search for non-existent space
			const searchInput = screen.getByTestId("search-spaces-input");
			fireEvent.change(searchInput, { target: { value: "NonExistent" } });

			expect(screen.getByText("No spaces found")).toBeDefined();
		});

		it("should toggle favorite in dropdown", () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			// Click star on space 7 in the dropdown
			const starButtons = screen.getAllByTestId("star-space-7");
			fireEvent.click(starButtons[starButtons.length - 1]);

			expect(mockToggleSpaceFavorite).toHaveBeenCalledWith(7);
		});

		it("should close dropdown and navigate when space is clicked in dropdown", async () => {
			render(<SpacesFavoritesList collapsed={false} onSpaceClick={mockOnSpaceClick} />);

			// Open dropdown
			const viewAllButton = screen.getByTestId("view-all-spaces-button");
			fireEvent.click(viewAllButton);

			// Click space 7 (Golf) which is hidden in the sidebar list
			const spaceItem = screen.getByTestId("all-spaces-item-7");
			fireEvent.click(spaceItem);

			await waitFor(() => {
				expect(mockSwitchSpace).toHaveBeenCalledWith(7);
				expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[6]);
				expect(screen.queryByTestId("view-all-spaces-dropdown")).toBe(null);
			});
		});
	});
});
