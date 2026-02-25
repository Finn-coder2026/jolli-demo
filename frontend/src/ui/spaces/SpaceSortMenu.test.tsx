import { toast } from "../../components/ui/Sonner";
import { SpaceSortMenu } from "./SpaceSortMenu";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { SpaceSortOption } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the contexts with controllable values
const mockUpdateSpace = vi.fn().mockResolvedValue({});
const mockRefreshSpaces = vi.fn().mockResolvedValue(undefined);
const mockSpacesClient = vi.fn(() => ({
	updateSpace: mockUpdateSpace,
}));
const mockClient = {
	spaces: mockSpacesClient,
};

// Use a mutable object so tests can modify the return value
const mockSpaceContext = {
	currentSpace: {
		id: 1,
		name: "Test Space",
		slug: "test-space",
		defaultSort: "default" as SpaceSortOption,
	} as { id: number; name: string; slug: string; defaultSort: SpaceSortOption } | null,
	refreshSpaces: mockRefreshSpaces,
};

vi.mock("../../contexts/ClientContext", () => ({
	useClient: () => mockClient,
}));

vi.mock("../../contexts/SpaceContext", () => ({
	useSpace: () => mockSpaceContext,
}));

// Mock sonner toast
vi.mock("../../components/ui/Sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

describe("SpaceSortMenu", () => {
	const defaultProps = {
		sortMode: "default" as SpaceSortOption,
		isMatchingSpaceDefault: true,
		onSortModeChange: vi.fn(),
		onResetToDefault: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset to default currentSpace for each test
		mockSpaceContext.currentSpace = {
			id: 1,
			name: "Test Space",
			slug: "test-space",
			defaultSort: "default" as SpaceSortOption,
		};
		mockSpaceContext.refreshSpaces = mockRefreshSpaces;
	});

	it("should render sort button with ghost variant when isMatchingSpaceDefault is true", () => {
		render(<SpaceSortMenu {...defaultProps} />);

		const button = screen.getByTestId("space-sort-menu-trigger");
		expect(button).toBeDefined();
		// Ghost variant has hover:bg-accent class instead of bg-primary
		expect(button.className).toContain("hover:bg-accent");
		expect(button.className).not.toContain("bg-primary");
	});

	it("should render sort button with secondary variant when isMatchingSpaceDefault is false", () => {
		render(<SpaceSortMenu {...defaultProps} isMatchingSpaceDefault={false} />);

		const button = screen.getByTestId("space-sort-menu-trigger");
		expect(button).toBeDefined();
		// Secondary variant has bg-secondary class
		expect(button.className).toContain("bg-secondary");
	});

	it("should render all sort options", () => {
		render(<SpaceSortMenu {...defaultProps} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		// Check all sort options are rendered
		expect(screen.getByTestId("sort-option-default")).toBeDefined();
		expect(screen.getByTestId("sort-option-alphabetical_asc")).toBeDefined();
		expect(screen.getByTestId("sort-option-alphabetical_desc")).toBeDefined();
		expect(screen.getByTestId("sort-option-updatedAt_desc")).toBeDefined();
		expect(screen.getByTestId("sort-option-updatedAt_asc")).toBeDefined();
		expect(screen.getByTestId("sort-option-createdAt_desc")).toBeDefined();
		expect(screen.getByTestId("sort-option-createdAt_asc")).toBeDefined();
	});

	it("should call onSortModeChange when clicking a sort option", () => {
		const onSortModeChange = vi.fn();
		render(<SpaceSortMenu {...defaultProps} onSortModeChange={onSortModeChange} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		// Click alphabetical_asc option
		fireEvent.click(screen.getByTestId("sort-option-alphabetical_asc"));

		expect(onSortModeChange).toHaveBeenCalledWith("alphabetical_asc");
	});

	it("should not show Reset to default and Save as default when isMatchingSpaceDefault is true", () => {
		render(<SpaceSortMenu {...defaultProps} isMatchingSpaceDefault={true} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		expect(screen.queryByTestId("reset-to-default-option")).toBeNull();
		expect(screen.queryByTestId("save-as-default-option")).toBeNull();
	});

	it("should show Reset to default and Save as default when isMatchingSpaceDefault is false", () => {
		render(<SpaceSortMenu {...defaultProps} isMatchingSpaceDefault={false} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		expect(screen.getByTestId("reset-to-default-option")).toBeDefined();
		expect(screen.getByTestId("save-as-default-option")).toBeDefined();
	});

	it("should call onResetToDefault when clicking Reset to default", () => {
		const onResetToDefault = vi.fn();
		render(<SpaceSortMenu {...defaultProps} isMatchingSpaceDefault={false} onResetToDefault={onResetToDefault} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		// Click reset to default
		fireEvent.click(screen.getByTestId("reset-to-default-option"));

		expect(onResetToDefault).toHaveBeenCalled();
	});

	it("should call updateSpace and refreshSpaces when clicking Save as default", async () => {
		render(<SpaceSortMenu {...defaultProps} sortMode="alphabetical_asc" isMatchingSpaceDefault={false} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		// Click save as default
		fireEvent.click(screen.getByTestId("save-as-default-option"));

		await waitFor(() => {
			expect(mockUpdateSpace).toHaveBeenCalledWith(1, { defaultSort: "alphabetical_asc" });
		});

		await waitFor(() => {
			expect(mockRefreshSpaces).toHaveBeenCalled();
		});
	});

	it("should display correct toast message with localized sort label", async () => {
		render(<SpaceSortMenu {...defaultProps} sortMode="alphabetical_asc" isMatchingSpaceDefault={false} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		// Click save as default
		fireEvent.click(screen.getByTestId("save-as-default-option"));

		await waitFor(() => {
			expect(toast.success).toHaveBeenCalled();
		});

		// Verify toast message does not contain [object Object]
		const toastCall = (toast.success as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(typeof toastCall).toBe("string");
		expect(toastCall).not.toContain("[object Object]");
		expect(toastCall).toContain("Alphabetical A→Z");
	});

	it("should handle error when Save as default fails", async () => {
		const mockError = new Error("Failed to update space");
		mockUpdateSpace.mockRejectedValueOnce(mockError);

		render(<SpaceSortMenu {...defaultProps} sortMode="alphabetical_asc" isMatchingSpaceDefault={false} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		// Click save as default
		fireEvent.click(screen.getByTestId("save-as-default-option"));

		await waitFor(() => {
			expect(mockUpdateSpace).toHaveBeenCalledWith(1, { defaultSort: "alphabetical_asc" });
		});

		// refreshSpaces should not be called when there's an error
		expect(mockRefreshSpaces).not.toHaveBeenCalled();
	});

	it("should call onOpenChange when dropdown opens and closes", async () => {
		const onOpenChange = vi.fn();
		const props = { ...defaultProps, onOpenChange };

		render(<SpaceSortMenu {...props} />);

		// Open dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(true);
		});
	});
});

describe("SpaceSortMenu without currentSpace", () => {
	const defaultProps = {
		sortMode: "alphabetical_asc" as SpaceSortOption,
		isMatchingSpaceDefault: false,
		onSortModeChange: vi.fn(),
		onResetToDefault: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Set currentSpace to null for these tests
		mockSpaceContext.currentSpace = null;
	});

	it("should not call updateSpace when currentSpace is null", async () => {
		render(<SpaceSortMenu {...defaultProps} />);

		// Open the dropdown
		fireEvent.click(screen.getByTestId("space-sort-menu-trigger"));

		// Click save as default
		fireEvent.click(screen.getByTestId("save-as-default-option"));

		// Wait a bit to ensure no async operations happened
		await new Promise(resolve => setTimeout(resolve, 100));

		// updateSpace should not be called when currentSpace is null
		expect(mockUpdateSpace).not.toHaveBeenCalled();
	});
});
