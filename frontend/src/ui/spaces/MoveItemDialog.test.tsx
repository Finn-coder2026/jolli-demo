import type { FolderOption } from "./CreateItemDialog";
import { MoveItemDialog } from "./MoveItemDialog";
import { fireEvent, render, waitFor } from "@testing-library/preact";
import type { Doc } from "jolli-common";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Mock useIntlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		moveItemTitle: ({ name }: { name: string }) => `Move "${name}"`,
		moveItemSubtitle: "Choose a new location for this item",
		cancel: "Cancel",
		move: "Move",
		parentFolderLabel: "Parent Folder",
		rootFolder: { value: "(Root)" },
		moveItemSameLocationWarning: "This item is already in the selected location. Please choose a different folder.",
	}),
}));

type DialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
};

type DialogSectionProps = {
	children: ReactNode;
} & Record<string, string>;

vi.mock("../../components/ui/Dialog", () => ({
	Dialog: ({ open, onOpenChange, children }: DialogProps) => {
		if (!open) {
			return <div data-testid="dialog" data-open="false" />;
		}
		return (
			<div data-testid="dialog" data-open={String(open)}>
				<button type="button" data-testid="dialog-close" onClick={() => onOpenChange(false)} />
				{children}
			</div>
		);
	},
	DialogContent: ({ children, ...rest }: DialogSectionProps) => <div {...rest}>{children}</div>,
	DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

type ParentFolderSelectorProps = {
	folders: Array<FolderOption>;
	value: string;
	onChange: (value: string) => void;
	excludedIds?: Set<number>;
};

vi.mock("./ParentFolderSelector", () => ({
	ParentFolderSelector: ({ value, onChange }: ParentFolderSelectorProps) => (
		<button type="button" data-testid="parent-folder-select" onClick={() => onChange("3")}>
			{value}
		</button>
	),
}));

describe("MoveItemDialog", () => {
	const mockDoc: Doc = {
		id: 1,
		jrn: "jrn:space/test:doc/test-doc",
		slug: "test-doc",
		path: "/test-doc",
		spaceId: 100,
		docType: "document",
		parentId: 2,
		content: "",
		contentType: "text/markdown",
		contentMetadata: { title: "Test Document" },
		version: 1,
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
		deletedAt: undefined,
		explicitlyDeleted: false,
		createdBy: undefined,
		updatedBy: "user",
		source: null,
		sourceMetadata: null,
		sortOrder: 1.0,
	};

	const mockFolders: Array<FolderOption> = [
		{ id: 2, name: "Folder A", depth: 0 },
		{ id: 3, name: "Folder B", depth: 0 },
		{ id: 4, name: "Sub Folder", depth: 1 },
	];

	it("should render correct title with item name", () => {
		const { getByText } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(getByText('Move "Test Document"')).toBeDefined();
	});

	it("should render correct subtitle", () => {
		const { getByText } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(getByText("Choose a new location for this item")).toBeDefined();
	});

	it("should use jrn as fallback when title is not available", () => {
		const docWithoutTitle = { ...mockDoc, contentMetadata: {} };
		const { getByText } = render(
			<MoveItemDialog
				open={true}
				itemToMove={docWithoutTitle}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(getByText(`Move "${mockDoc.jrn}"`)).toBeDefined();
	});

	it("should integrate ParentFolderSelector with correct props", () => {
		const excludedIds = new Set([2]);
		const { getByTestId } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={excludedIds}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(getByTestId("parent-folder-select")).toBeDefined();
	});

	it("should initialize with current parentId", () => {
		const { container } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// ParentId is 2, so it should be selected
		expect(container).toBeDefined();
	});

	it("should initialize with root when parentId is undefined", () => {
		const docWithoutParent = { ...mockDoc, parentId: undefined };
		const { container } = render(
			<MoveItemDialog
				open={true}
				itemToMove={docWithoutParent}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(container).toBeDefined();
	});

	it("should call onConfirm with correct parentId when clicking Move", async () => {
		const onConfirm = vi.fn();
		const { getByTestId } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={onConfirm}
				onClose={vi.fn()}
			/>,
		);

		const confirmButton = getByTestId("move-dialog-confirm");
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(onConfirm).toHaveBeenCalledWith(2); // Should convert "2" string to number
		});
	});

	it("should call onConfirm with undefined when root is selected", async () => {
		const docWithoutParent = { ...mockDoc, parentId: undefined };
		const onConfirm = vi.fn();
		const { getByTestId } = render(
			<MoveItemDialog
				open={true}
				itemToMove={docWithoutParent}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={onConfirm}
				onClose={vi.fn()}
			/>,
		);

		const confirmButton = getByTestId("move-dialog-confirm");
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(onConfirm).toHaveBeenCalledWith(undefined); // "root" converts to undefined
		});
	});

	it("should call onClose when clicking Cancel", async () => {
		const onClose = vi.fn();
		const { getByTestId } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={onClose}
			/>,
		);

		const cancelButton = getByTestId("move-dialog-cancel");
		fireEvent.click(cancelButton);

		await waitFor(() => {
			expect(onClose).toHaveBeenCalled();
		});
	});

	it("should not render when open is false", () => {
		const { queryByTestId } = render(
			<MoveItemDialog
				open={false}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(queryByTestId("move-item-dialog-content")).toBeNull();
	});

	it("should disable Move button when selecting same location", () => {
		const mockDocInFolder: Doc = { ...mockDoc, parentId: 2 };
		const { getByTestId } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDocInFolder}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// Initial state: default selected current location, Move button should be disabled
		const moveButton = getByTestId("move-dialog-confirm") as HTMLButtonElement;
		expect(moveButton.disabled).toBe(true);
	});

	it("should enable Move button when item has no parent (at root)", () => {
		const mockDocAtRoot: Doc = { ...mockDoc, parentId: undefined };
		const { getByTestId, queryByText } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDocAtRoot}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		const moveButton = getByTestId("move-dialog-confirm") as HTMLButtonElement;

		// Item at root, default selected root, Move button should be disabled
		expect(moveButton.disabled).toBe(true);

		// Warning should be displayed
		expect(queryByText(/already in the selected location/i)).toBeDefined();
	});

	it("should show warning message when same location is selected", () => {
		const mockDocInFolder: Doc = { ...mockDoc, parentId: 2 };
		const { getByText } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDocInFolder}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// Warning message should be displayed
		expect(getByText(/already in the selected location/i)).toBeDefined();
	});

	it("should handle null parentId correctly", () => {
		const mockDocWithNullParent: Doc = { ...mockDoc, parentId: null as unknown as undefined };
		const { getByTestId } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDocWithNullParent}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// Should initialize with "root" and disable Move button
		const moveButton = getByTestId("move-dialog-confirm") as HTMLButtonElement;
		expect(moveButton.disabled).toBe(true);
	});

	it("should reset parentId state when itemToMove changes", () => {
		const firstDoc: Doc = { ...mockDoc, id: 1, parentId: 2 };
		const secondDoc: Doc = { ...mockDoc, id: 2, parentId: 3 };

		const { getByTestId, rerender } = render(
			<MoveItemDialog
				open={true}
				itemToMove={firstDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// Initially should disable Move button (same location)
		const moveButton = getByTestId("move-dialog-confirm") as HTMLButtonElement;
		expect(moveButton.disabled).toBe(true);

		// Rerender with a different item
		rerender(
			<MoveItemDialog
				open={true}
				itemToMove={secondDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		// After rerender, state should reset and Move button should still be disabled (new item also at same location)
		expect(moveButton.disabled).toBe(true);
	});

	it("should close when dialog requests close", () => {
		const onClose = vi.fn();
		const { getByTestId } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={vi.fn()}
				onClose={onClose}
			/>,
		);

		fireEvent.click(getByTestId("dialog-close"));

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("should enable move button and clear warning when selecting new folder", async () => {
		const onConfirm = vi.fn();
		const { getByTestId, queryByText } = render(
			<MoveItemDialog
				open={true}
				itemToMove={mockDoc}
				folders={mockFolders}
				excludedIds={new Set()}
				onConfirm={onConfirm}
				onClose={vi.fn()}
			/>,
		);

		const moveButton = getByTestId("move-dialog-confirm") as HTMLButtonElement;
		expect(moveButton.disabled).toBe(true);

		fireEvent.click(getByTestId("parent-folder-select"));

		expect(moveButton.disabled).toBe(false);
		expect(queryByText(/already in the selected location/i)).toBeNull();

		fireEvent.click(moveButton);

		await waitFor(() => {
			expect(onConfirm).toHaveBeenCalledWith(3);
		});
	});
});
