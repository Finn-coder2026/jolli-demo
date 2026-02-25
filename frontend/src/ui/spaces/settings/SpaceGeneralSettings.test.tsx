import type { SpaceContextType } from "../../../contexts/SpaceContext";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { DEFAULT_SPACE_FILTERS, type Space } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock sonner toast - use vi.hoisted to ensure mock is available at module load time
const { mockToast } = vi.hoisted(() => ({
	mockToast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("sonner", () => ({
	toast: mockToast,
}));

// Mock NavigationContext
const mockNavigate = vi.fn();
let mockSpaceSettingsSpaceId: number | undefined = 1;

vi.mock("../../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
		spaceSettingsSpaceId: mockSpaceSettingsSpaceId,
		spaceSettingsView: "general",
	}),
}));

// Mock SpaceContext
const mockSpaces: Array<Space> = [
	{
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: "space:test",
		description: "Test description",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: DEFAULT_SPACE_FILTERS,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
	{
		id: 2,
		name: "Another Space",
		slug: "another-space",
		jrn: "space:another",
		description: "",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: DEFAULT_SPACE_FILTERS,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
];

const mockUpdateSpace = vi.fn();
const mockDeleteSpace = vi.fn();
const mockMigrateSpaceContent = vi.fn();

let mockCurrentSpaces = [...mockSpaces];

vi.mock("../../../contexts/SpaceContext", () => ({
	useSpace: () =>
		({
			currentSpace: mockCurrentSpaces[0],
			personalSpace: mockCurrentSpaces.find(s => s.isPersonal),
			spaces: mockCurrentSpaces,
			favoriteSpaces: [],
			isLoading: false,
			error: undefined,
			switchSpace: vi.fn(),
			switchToPersonalSpace: vi.fn(),
			createSpace: vi.fn(),
			updateSpace: mockUpdateSpace,
			deleteSpace: mockDeleteSpace,
			migrateSpaceContent: mockMigrateSpaceContent,
			refreshSpaces: vi.fn(),
			toggleSpaceFavorite: vi.fn(),
			isFavorite: vi.fn(),
		}) as SpaceContextType,
}));

// Capture onDeleted callback for testing
let capturedOnDeleted: (() => void) | undefined;

// Mock DeleteSpaceDialog to capture onDeleted callback
vi.mock("./DeleteSpaceDialog", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: Mock component needs flexible props
	DeleteSpaceDialog: ({ open, onDeleted }: any) => {
		// Store the callback for tests to trigger
		capturedOnDeleted = onDeleted;
		if (!open) {
			return null;
		}
		return <div data-testid="mocked-delete-dialog">Delete Dialog</div>;
	},
}));

// Import after mocks
import { SpaceGeneralSettings } from "./SpaceGeneralSettings";

describe("SpaceGeneralSettings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSpaceSettingsSpaceId = 1;
		mockCurrentSpaces = [...mockSpaces];
		mockUpdateSpace.mockResolvedValue(mockSpaces[0]);
	});

	it("should render page header", () => {
		render(<SpaceGeneralSettings />);

		expect(screen.getByText("General")).toBeDefined();
	});

	it("should render space not found when space does not exist", () => {
		mockSpaceSettingsSpaceId = 999;

		render(<SpaceGeneralSettings />);

		expect(screen.getByText("Space not found")).toBeDefined();
	});

	it("should display space name", () => {
		render(<SpaceGeneralSettings />);

		expect(screen.getByText("Test Space")).toBeDefined();
	});

	it("should show name editing form when edit button is clicked", () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-name-button"));

		expect(screen.getByTestId("space-name-input")).toBeDefined();
		expect(screen.getByTestId("save-name-button")).toBeDefined();
		expect(screen.getByTestId("cancel-name-button")).toBeDefined();
	});

	it("should save space name when save is clicked", async () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-name-button"));

		const input = screen.getByTestId("space-name-input");
		fireEvent.input(input, { target: { value: "New Name" } });
		fireEvent.click(screen.getByTestId("save-name-button"));

		await waitFor(() => {
			expect(mockUpdateSpace).toHaveBeenCalledWith(1, { name: "New Name" });
			expect(mockToast.success).toHaveBeenCalled();
		});
	});

	it("should show error when trying to save empty name", async () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-name-button"));

		const input = screen.getByTestId("space-name-input");
		fireEvent.input(input, { target: { value: "   " } });
		fireEvent.click(screen.getByTestId("save-name-button"));

		await waitFor(() => {
			expect(mockToast.error).toHaveBeenCalled();
		});
		expect(mockUpdateSpace).not.toHaveBeenCalled();
	});

	it("should cancel name editing when cancel is clicked", () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-name-button"));
		fireEvent.click(screen.getByTestId("cancel-name-button"));

		expect(screen.queryByTestId("space-name-input")).toBeNull();
	});

	it("should save name on Enter key", async () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-name-button"));

		const input = screen.getByTestId("space-name-input");
		fireEvent.input(input, { target: { value: "New Name" } });
		fireEvent.keyDown(input, { key: "Enter" });

		await waitFor(() => {
			expect(mockUpdateSpace).toHaveBeenCalledWith(1, { name: "New Name" });
		});
	});

	it("should cancel name editing on Escape key", () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-name-button"));

		const input = screen.getByTestId("space-name-input");
		fireEvent.keyDown(input, { key: "Escape" });

		expect(screen.queryByTestId("space-name-input")).toBeNull();
	});

	it("should show description editing form when edit button is clicked", () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-description-button"));

		expect(screen.getByTestId("space-description-input")).toBeDefined();
		expect(screen.getByTestId("save-description-button")).toBeDefined();
		expect(screen.getByTestId("cancel-description-button")).toBeDefined();
	});

	it("should save description when save is clicked", async () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-description-button"));

		const input = screen.getByTestId("space-description-input");
		fireEvent.input(input, { target: { value: "New Description" } });
		fireEvent.click(screen.getByTestId("save-description-button"));

		await waitFor(() => {
			expect(mockUpdateSpace).toHaveBeenCalledWith(1, { description: "New Description" });
		});
	});

	it("should cancel description editing when cancel is clicked", () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-description-button"));
		fireEvent.click(screen.getByTestId("cancel-description-button"));

		expect(screen.queryByTestId("space-description-input")).toBeNull();
	});

	it("should cancel description editing on Escape key", () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-description-button"));

		const input = screen.getByTestId("space-description-input");
		fireEvent.keyDown(input, { key: "Escape" });

		expect(screen.queryByTestId("space-description-input")).toBeNull();
	});

	it("should show delete button in danger zone", () => {
		render(<SpaceGeneralSettings />);

		expect(screen.getByTestId("delete-space-button")).toBeDefined();
	});

	it("should disable delete button when only one space exists", () => {
		mockCurrentSpaces = [mockSpaces[0]];

		render(<SpaceGeneralSettings />);

		const deleteButton = screen.getByTestId("delete-space-button");
		expect(deleteButton.hasAttribute("disabled")).toBe(true);
	});

	it("should enable delete button when multiple spaces exist", () => {
		render(<SpaceGeneralSettings />);

		const deleteButton = screen.getByTestId("delete-space-button");
		expect(deleteButton.hasAttribute("disabled")).toBe(false);
	});

	it("should show error toast when update fails", async () => {
		mockUpdateSpace.mockRejectedValue(new Error("Update failed"));

		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-name-button"));

		const input = screen.getByTestId("space-name-input");
		fireEvent.input(input, { target: { value: "New Name" } });
		fireEvent.click(screen.getByTestId("save-name-button"));

		await waitFor(() => {
			expect(mockToast.error).toHaveBeenCalled();
		});
	});

	it("should show error toast when description update fails", async () => {
		mockUpdateSpace.mockRejectedValue(new Error("Update failed"));

		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-description-button"));

		const input = screen.getByTestId("space-description-input");
		fireEvent.input(input, { target: { value: "New Description" } });
		fireEvent.click(screen.getByTestId("save-description-button"));

		await waitFor(() => {
			expect(mockToast.error).toHaveBeenCalled();
		});
	});

	it("should navigate to articles when space is deleted", () => {
		render(<SpaceGeneralSettings />);

		// Open delete dialog
		fireEvent.click(screen.getByTestId("delete-space-button"));

		// Trigger the onDeleted callback
		capturedOnDeleted?.();

		// Should navigate to articles
		expect(mockNavigate).toHaveBeenCalledWith("/articles");
	});

	it("should display 'No description' when space has no description", () => {
		// Update mock space to have no description
		mockCurrentSpaces = [
			{
				...mockSpaces[0],
				description: "",
			},
			mockSpaces[1],
		];

		render(<SpaceGeneralSettings />);

		// Should show "No description" placeholder
		expect(screen.getByText("No description")).toBeDefined();
	});

	it("should save empty description as undefined", async () => {
		render(<SpaceGeneralSettings />);

		fireEvent.click(screen.getByTestId("edit-description-button"));

		const input = screen.getByTestId("space-description-input");
		fireEvent.input(input, { target: { value: "   " } }); // Just whitespace
		fireEvent.click(screen.getByTestId("save-description-button"));

		await waitFor(() => {
			// Should save with null when description is empty/whitespace (null tells backend to clear)
			expect(mockUpdateSpace).toHaveBeenCalledWith(1, { description: null });
		});
	});

	it("should handle edit description when space.description is undefined", () => {
		// Set up space with undefined description (not empty string)
		mockCurrentSpaces = [
			{
				...mockSpaces[0],
				description: undefined,
			},
			mockSpaces[1],
		];

		render(<SpaceGeneralSettings />);

		// Click edit button - this triggers line 192: setSpaceDescription(space.description ?? "")
		fireEvent.click(screen.getByTestId("edit-description-button"));

		// Verify editing mode is active
		const input = screen.getByTestId("space-description-input") as HTMLTextAreaElement;
		expect(input).toBeDefined();
		// Should have empty string from the ?? "" fallback
		expect(input.value).toBe("");
	});

	it("should handle cancel description when space.description is undefined", () => {
		// Set up space with undefined description (not empty string)
		mockCurrentSpaces = [
			{
				...mockSpaces[0],
				description: undefined,
			},
			mockSpaces[1],
		];

		render(<SpaceGeneralSettings />);

		// Click edit button first
		fireEvent.click(screen.getByTestId("edit-description-button"));

		// Type something in the input
		const input = screen.getByTestId("space-description-input");
		fireEvent.input(input, { target: { value: "Some text" } });

		// Click cancel - this triggers line 85: setSpaceDescription(space.description ?? "")
		fireEvent.click(screen.getByTestId("cancel-description-button"));

		// Editing mode should be closed
		expect(screen.queryByTestId("space-description-input")).toBeNull();

		// Open again and verify it's reset to empty (from ?? "")
		fireEvent.click(screen.getByTestId("edit-description-button"));
		const newInput = screen.getByTestId("space-description-input") as HTMLTextAreaElement;
		expect(newInput.value).toBe("");
	});

	describe("personal space restrictions", () => {
		beforeEach(() => {
			mockCurrentSpaces = [
				{
					...mockSpaces[0],
					isPersonal: true,
				},
				mockSpaces[1],
			];
		});

		it("should disable edit name button for personal spaces", () => {
			render(<SpaceGeneralSettings />);

			const editButton = screen.getByTestId("edit-name-button");
			expect(editButton.hasAttribute("disabled")).toBe(true);
		});

		it("should disable edit description button for personal spaces", () => {
			render(<SpaceGeneralSettings />);

			const editButton = screen.getByTestId("edit-description-button");
			expect(editButton.hasAttribute("disabled")).toBe(true);
		});

		it("should disable delete button for personal spaces", () => {
			render(<SpaceGeneralSettings />);

			const deleteButton = screen.getByTestId("delete-space-button");
			expect(deleteButton.hasAttribute("disabled")).toBe(true);
		});

		it("should show personal space hint messages", () => {
			render(<SpaceGeneralSettings />);

			expect(screen.getByText("Personal space names cannot be changed.")).toBeDefined();
			expect(screen.getByText("Personal space descriptions cannot be changed.")).toBeDefined();
			expect(screen.getByText("Personal spaces cannot be deleted.")).toBeDefined();
		});
	});
});
