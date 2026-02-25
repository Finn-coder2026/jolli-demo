import type { SpaceContextType } from "../../contexts/SpaceContext";
import { SpaceSwitcher } from "./SpaceSwitcher";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Space } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Mock CreateSpaceDialog
vi.mock("./CreateSpaceDialog", () => ({
	CreateSpaceDialog: ({
		open,
		onConfirm,
		onClose,
	}: {
		open: boolean;
		onConfirm: (name: string, desc?: string) => void;
		onClose: () => void;
	}) => (
		<div data-testid="create-space-dialog" data-open={open}>
			{open && (
				<>
					<button data-testid="mock-create-confirm" onClick={() => onConfirm("New Space", "Description")}>
						Create
					</button>
					<button data-testid="mock-create-cancel" onClick={onClose}>
						Cancel
					</button>
				</>
			)}
		</div>
	),
}));

// Create mock space context
function createMockSpace(overrides: Partial<Space> = {}): Space {
	return {
		id: 1,
		name: "Default Space",
		slug: "default-space",
		jrn: "space:default-space",
		description: undefined,
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

const mockSwitchSpace = vi.fn();
const mockCreateSpace = vi.fn();
const mockRefreshSpaces = vi.fn();
const mockUpdateSpace = vi.fn();
const mockDeleteSpace = vi.fn();
const mockMigrateSpaceContent = vi.fn();

const defaultMockContext: SpaceContextType = {
	currentSpace: createMockSpace(),
	personalSpace: undefined,
	spaces: [createMockSpace(), createMockSpace({ id: 2, name: "Second Space", slug: "second-space" })],
	favoriteSpaces: [],
	isLoading: false,
	error: undefined,
	switchSpace: mockSwitchSpace,
	switchToPersonalSpace: vi.fn(),
	createSpace: mockCreateSpace,
	updateSpace: mockUpdateSpace,
	deleteSpace: mockDeleteSpace,
	migrateSpaceContent: mockMigrateSpaceContent,
	refreshSpaces: mockRefreshSpaces,
	toggleSpaceFavorite: vi.fn(),
	isFavorite: vi.fn(),
};

vi.mock("../../contexts/SpaceContext", () => ({
	useSpace: () => defaultMockContext,
}));

describe("SpaceSwitcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock context to default
		Object.assign(defaultMockContext, {
			currentSpace: createMockSpace(),
			spaces: [createMockSpace(), createMockSpace({ id: 2, name: "Second Space", slug: "second-space" })],
			isLoading: false,
			error: undefined,
		});
	});

	it("should render loading skeleton when isLoading is true", () => {
		defaultMockContext.isLoading = true;

		render(<SpaceSwitcher />);

		expect(screen.getByTestId("space-switcher-loading")).toBeDefined();
	});

	it("should render loading skeleton when currentSpace is undefined", () => {
		defaultMockContext.isLoading = false;
		defaultMockContext.currentSpace = undefined;

		render(<SpaceSwitcher />);

		expect(screen.getByTestId("space-switcher-loading")).toBeDefined();
	});

	it("should render current space name in trigger button", () => {
		render(<SpaceSwitcher />);

		const trigger = screen.getByTestId("space-switcher-trigger");
		expect(trigger).toBeDefined();
		expect(trigger.textContent).toContain("Default Space");
	});

	it("should open dropdown when trigger is clicked", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		expect(screen.getByTestId("space-switcher-content")).toBeDefined();
	});

	it("should show all spaces in dropdown", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		const option1 = screen.getByTestId("space-option-1");
		const option2 = screen.getByTestId("space-option-2");
		expect(option1).toBeDefined();
		expect(option2).toBeDefined();
		expect(option1.textContent).toContain("Default Space");
		expect(option2.textContent).toContain("Second Space");
	});

	it("should show check mark on current space", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		const currentOption = screen.getByTestId("space-option-1");
		// Current space should have a Check icon child
		expect(currentOption.querySelector("svg")).toBeDefined();
	});

	it("should show Add Space option", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		expect(screen.getByTestId("add-space-option")).toBeDefined();
		expect(screen.getByText("Add Space")).toBeDefined();
	});

	it("should call switchSpace when selecting a different space", async () => {
		const onSpaceChange = vi.fn();
		render(<SpaceSwitcher onSpaceChange={onSpaceChange} />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("space-option-2"));

		await waitFor(() => {
			expect(mockSwitchSpace).toHaveBeenCalledWith(2);
		});
	});

	it("should call onSpaceChange when switching to a different space", async () => {
		const onSpaceChange = vi.fn();
		const secondSpace = createMockSpace({ id: 2, name: "Second Space", slug: "second-space" });
		defaultMockContext.spaces = [createMockSpace(), secondSpace];

		render(<SpaceSwitcher onSpaceChange={onSpaceChange} />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("space-option-2"));

		await waitFor(() => {
			expect(onSpaceChange).toHaveBeenCalledWith(secondSpace);
		});
	});

	it("should not call switchSpace when selecting current space", async () => {
		const onSpaceChange = vi.fn();
		render(<SpaceSwitcher onSpaceChange={onSpaceChange} />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("space-option-1"));

		await waitFor(() => {
			expect(mockSwitchSpace).not.toHaveBeenCalled();
		});
	});

	it("should open create dialog when Add Space is clicked", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("add-space-option"));

		const dialog = screen.getByTestId("create-space-dialog");
		expect(dialog.getAttribute("data-open")).toBe("true");
	});

	it("should call createSpace when confirming new space creation", async () => {
		const newSpace = createMockSpace({ id: 3, name: "New Space", slug: "new-space" });
		mockCreateSpace.mockResolvedValue(newSpace);

		render(<SpaceSwitcher />);

		// Open dropdown and click Add Space
		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("add-space-option"));

		// Click confirm in mock dialog
		fireEvent.click(screen.getByTestId("mock-create-confirm"));

		await waitFor(() => {
			expect(mockCreateSpace).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "New Space",
					description: "Description",
				}),
				true,
			);
		});
	});

	it("should call onSpaceChange after creating new space", async () => {
		const onSpaceChange = vi.fn();
		const newSpace = createMockSpace({ id: 3, name: "New Space", slug: "new-space" });
		mockCreateSpace.mockResolvedValue(newSpace);

		render(<SpaceSwitcher onSpaceChange={onSpaceChange} />);

		// Open dropdown and click Add Space
		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("add-space-option"));

		// Click confirm in mock dialog
		fireEvent.click(screen.getByTestId("mock-create-confirm"));

		await waitFor(() => {
			expect(onSpaceChange).toHaveBeenCalledWith(newSpace);
		});
	});

	it("should close create dialog when cancel is clicked", () => {
		render(<SpaceSwitcher />);

		// Open dropdown and click Add Space
		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("add-space-option"));

		// Verify dialog is open
		expect(screen.getByTestId("create-space-dialog").getAttribute("data-open")).toBe("true");

		// Click cancel
		fireEvent.click(screen.getByTestId("mock-create-cancel"));

		// Verify dialog is closed
		expect(screen.getByTestId("create-space-dialog").getAttribute("data-open")).toBe("false");
	});

	it("should handle selecting current space (no switchSpace call)", async () => {
		const onSpaceChange = vi.fn();
		render(<SpaceSwitcher onSpaceChange={onSpaceChange} />);

		// Open dropdown
		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		// Select current space (won't call switchSpace)
		fireEvent.click(screen.getByTestId("space-option-1"));

		await waitFor(() => {
			// Should not call switchSpace when selecting current space
			expect(mockSwitchSpace).not.toHaveBeenCalled();
			// Should not call onSpaceChange when selecting current space
			expect(onSpaceChange).not.toHaveBeenCalled();
		});
	});

	it("should pass only name and description to createSpace", async () => {
		const newSpace = createMockSpace({ id: 3, name: "New Space", slug: "new-space" });
		mockCreateSpace.mockResolvedValue(newSpace);

		render(<SpaceSwitcher />);

		// Open dropdown and click Add Space
		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("add-space-option"));

		// Click confirm in mock dialog (mock sends name="New Space", description="Description")
		fireEvent.click(screen.getByTestId("mock-create-confirm"));

		await waitFor(() => {
			// Should only pass name and description, not slug or other fields
			expect(mockCreateSpace).toHaveBeenCalledWith({ name: "New Space", description: "Description" }, true);
		});
	});

	it("should render without onSpaceChange callback", async () => {
		// Test that component works without callback
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));
		fireEvent.click(screen.getByTestId("space-option-2"));

		await waitFor(() => {
			expect(mockSwitchSpace).toHaveBeenCalledWith(2);
		});

		// Should not throw
	});

	it("should render space icons in dropdown menu", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		const dropdown = screen.getByTestId("space-switcher-content");
		expect(dropdown).toBeDefined();

		// Each space should have an icon div with rounded and flex classes
		const icons = dropdown.querySelectorAll(".rounded.flex.items-center.justify-center");
		expect(icons.length).toBe(2); // Two spaces in mock data
	});

	it("should render correct icon initial for each space", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		const dropdown = screen.getByTestId("space-switcher-content");
		const icons = dropdown.querySelectorAll(".rounded.flex.items-center.justify-center");

		// First space: "Default Space" -> "D"
		expect(icons[0].textContent).toBe("D");
		// Second space: "Second Space" -> "S"
		expect(icons[1].textContent).toBe("S");
	});

	it("should render icons with color classes", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		const dropdown = screen.getByTestId("space-switcher-content");
		const icons = dropdown.querySelectorAll(".rounded.flex.items-center.justify-center");

		// Each icon should have a bg-* color class
		expect(icons[0].className).toMatch(/bg-\w+-500/);
		expect(icons[1].className).toMatch(/bg-\w+-500/);
	});

	it("should render icons with white text", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		const dropdown = screen.getByTestId("space-switcher-content");
		const icons = dropdown.querySelectorAll(".rounded.flex.items-center.justify-center");

		// Icons should have white text
		expect(icons[0].className).toContain("text-white");
		expect(icons[1].className).toContain("text-white");
	});

	it("should render icons with correct size", () => {
		render(<SpaceSwitcher />);

		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		const dropdown = screen.getByTestId("space-switcher-content");
		const icons = dropdown.querySelectorAll(".rounded.flex.items-center.justify-center");

		// Icons should be size 5 (h-5 w-5)
		expect(icons[0].className).toContain("h-5");
		expect(icons[0].className).toContain("w-5");
		expect(icons[1].className).toContain("h-5");
		expect(icons[1].className).toContain("w-5");
	});

	it("should call onOpenChange when dropdown opens and closes", async () => {
		const onOpenChange = vi.fn();
		render(<SpaceSwitcher onOpenChange={onOpenChange} />);

		// Open dropdown
		fireEvent.click(screen.getByTestId("space-switcher-trigger"));

		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(true);
		});

		// Click outside to close (simulate by clicking the trigger again or selecting a space)
		fireEvent.click(screen.getByTestId("space-option-1"));

		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});
});
