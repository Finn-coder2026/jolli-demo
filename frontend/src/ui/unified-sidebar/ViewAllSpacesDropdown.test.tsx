import { ViewAllSpacesDropdown } from "./ViewAllSpacesDropdown";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Space } from "jolli-common";
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
		Search: () => <div data-testid="search-icon" />,
		Star: () => <div data-testid="star-icon" />,
	};
});

// Mock intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		allSpaces: createMockIntlayerValue("All Spaces"),
		searchSpaces: createMockIntlayerValue("Search spaces..."),
		addToFavorites: createMockIntlayerValue("Add to favorites"),
		removeFromFavorites: createMockIntlayerValue("Remove from favorites"),
		noResults: createMockIntlayerValue("No spaces found"),
		noSpaces: createMockIntlayerValue("No spaces available"),
	}),
}));

// Mock SpaceContext
const mockToggleSpaceFavorite = vi.fn();
const mockIsFavorite = vi.fn();

const defaultMockSpaces: Array<Space> = [
	{
		id: 1,
		name: "Engineering",
		slug: "engineering",
		jrn: "jrn:space:1",
		description: "Engineering space",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		createdAt: "2024-01-01",
		updatedAt: "2024-01-01",
	},
	{
		id: 2,
		name: "Product",
		slug: "product",
		jrn: "jrn:space:2",
		description: "Product space",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		createdAt: "2024-01-02",
		updatedAt: "2024-01-02",
	},
	{
		id: 3,
		name: "Marketing",
		slug: "marketing",
		jrn: "jrn:space:3",
		description: "Marketing space",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		createdAt: "2024-01-03",
		updatedAt: "2024-01-03",
	},
];

let mockSpaces = defaultMockSpaces;
let mockCurrentSpace: Space | undefined = defaultMockSpaces[0];

vi.mock("../../contexts/SpaceContext", () => ({
	useSpace: () => ({
		spaces: mockSpaces,
		currentSpace: mockCurrentSpace,
		isFavorite: mockIsFavorite,
		toggleSpaceFavorite: mockToggleSpaceFavorite,
	}),
}));

describe("ViewAllSpacesDropdown", () => {
	const mockOnSpaceClick = vi.fn();
	const mockTriggerRef = { current: null as HTMLButtonElement | null };

	beforeEach(() => {
		vi.clearAllMocks();
		mockIsFavorite.mockReturnValue(false);
		mockSpaces = defaultMockSpaces;
		mockCurrentSpace = defaultMockSpaces[0];

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
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByText("All Spaces")).toBeDefined();
		expect(screen.getByTestId("view-all-spaces-dropdown")).toBeDefined();
	});

	it("should render search input", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByTestId("search-spaces-input")).toBeDefined();
	});

	it("should render all spaces", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByTestId("all-spaces-item-1")).toBeDefined();
		expect(screen.getByTestId("all-spaces-item-2")).toBeDefined();
		expect(screen.getByTestId("all-spaces-item-3")).toBeDefined();
		expect(screen.getByText("Engineering")).toBeDefined();
		expect(screen.getByText("Product")).toBeDefined();
		expect(screen.getByText("Marketing")).toBeDefined();
	});

	it("should filter spaces by name", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const searchInput = screen.getByTestId("search-spaces-input");
		fireEvent.input(searchInput, { target: { value: "Product" } });

		expect(screen.getByText("Product")).toBeDefined();
		expect(screen.queryByText("Engineering")).toBeNull();
		expect(screen.queryByText("Marketing")).toBeNull();
	});

	it("should filter spaces by slug", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const searchInput = screen.getByTestId("search-spaces-input");
		fireEvent.input(searchInput, { target: { value: "marketing" } });

		expect(screen.getByText("Marketing")).toBeDefined();
		expect(screen.queryByText("Engineering")).toBeNull();
		expect(screen.queryByText("Product")).toBeNull();
	});

	it("should show no results message when search has no matches", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const searchInput = screen.getByTestId("search-spaces-input");
		fireEvent.input(searchInput, { target: { value: "nonexistent" } });

		expect(screen.getByText("No spaces found")).toBeDefined();
	});

	it("should show no spaces available message when spaces array is empty", () => {
		mockSpaces = [];
		mockCurrentSpace = undefined;

		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		expect(screen.getByText("No spaces available")).toBeDefined();
	});

	it("should call onSpaceClick when space row is clicked", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const spaceItem = screen.getByTestId("all-spaces-item-2");
		fireEvent.click(spaceItem);

		expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[1]);
	});

	it("should call onSpaceClick even when clicking current space to allow navigation", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const spaceItem = screen.getByTestId("all-spaces-item-1");
		fireEvent.click(spaceItem);

		// Should call onSpaceClick to allow navigation even when clicking current space
		expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[0]);
	});

	it("should toggle favorite when star button is clicked", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const starButton = screen.getByTestId("star-space-1");
		fireEvent.click(starButton);

		expect(mockToggleSpaceFavorite).toHaveBeenCalledWith(1);
		expect(mockOnSpaceClick).not.toHaveBeenCalled();
	});

	it("should show filled star for favorited spaces", () => {
		mockIsFavorite.mockImplementation((id: number) => id === 3);

		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const starButton = screen.getByTestId("star-space-3");
		expect(starButton.className).toContain("opacity-100");
	});

	it("should highlight active space", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const activeSpaceItem = screen.getByTestId("all-spaces-item-1");
		expect(activeSpaceItem.className).toContain("bg-accent");
	});

	it("should display first letter avatar with color", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const spaceItem = screen.getByTestId("all-spaces-item-1");
		const avatarDiv = spaceItem.querySelector(".rounded");
		expect(avatarDiv?.textContent).toBe("E");
		expect(avatarDiv?.className).toContain("bg-");
	});

	it("should handle keyboard navigation with Enter key", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const spaceItem = screen.getByTestId("all-spaces-item-2");
		fireEvent.keyDown(spaceItem, { key: "Enter" });

		expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[1]);
	});

	it("should handle keyboard navigation with Space key", () => {
		render(<ViewAllSpacesDropdown collapsed={false} onSpaceClick={mockOnSpaceClick} triggerRef={mockTriggerRef} />);

		const spaceItem = screen.getByTestId("all-spaces-item-2");
		fireEvent.keyDown(spaceItem, { key: " " });

		expect(mockOnSpaceClick).toHaveBeenCalledWith(mockSpaces[1]);
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
				<ViewAllSpacesDropdown
					collapsed={false}
					onSpaceClick={mockOnSpaceClick}
					triggerRef={aboveTriggerRef}
				/>,
			);

			const dropdown = screen.getByTestId("view-all-spaces-dropdown");
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
				<ViewAllSpacesDropdown
					collapsed={false}
					onSpaceClick={mockOnSpaceClick}
					triggerRef={smallViewportRef}
				/>,
			);

			const dropdown = screen.getByTestId("view-all-spaces-dropdown");
			const top = Number.parseInt(dropdown.style.top, 10);
			expect(top).toBe(8);
		});
	});
});
