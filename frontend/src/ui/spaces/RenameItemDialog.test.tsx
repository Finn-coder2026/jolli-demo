import { RenameItemDialog } from "./RenameItemDialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("RenameItemDialog", () => {
	const mockOnConfirm = vi.fn();
	const mockOnClose = vi.fn();

	const defaultProps = {
		open: true,
		itemName: "Test Document",
		isFolder: false,
		onConfirm: mockOnConfirm,
		onClose: mockOnClose,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render dialog when open", () => {
		render(<RenameItemDialog {...defaultProps} />);

		expect(screen.getByTestId("rename-item-dialog-content")).toBeDefined();
	});

	it("should not render dialog when closed", () => {
		render(<RenameItemDialog {...defaultProps} open={false} />);

		expect(screen.queryByTestId("rename-item-dialog-content")).toBeNull();
	});

	it("should display folder title for folders", () => {
		render(<RenameItemDialog {...defaultProps} isFolder={true} />);

		expect(screen.getByText("Rename Folder")).toBeDefined();
	});

	it("should display article title for documents", () => {
		render(<RenameItemDialog {...defaultProps} isFolder={false} />);

		expect(screen.getByText("Rename Article")).toBeDefined();
	});

	it("should pre-fill input with current item name", () => {
		render(<RenameItemDialog {...defaultProps} itemName="My Document" />);

		const input = screen.getByTestId("rename-item-name-input") as HTMLInputElement;
		expect(input.value).toBe("My Document");
	});

	it("should call onConfirm with trimmed name when Save is clicked", () => {
		render(<RenameItemDialog {...defaultProps} />);

		const input = screen.getByTestId("rename-item-name-input");
		fireEvent.input(input, { target: { value: "  New Name  " } });

		fireEvent.click(screen.getByTestId("rename-save-button"));

		expect(mockOnConfirm).toHaveBeenCalledWith("New Name");
	});

	it("should call onConfirm when Enter key is pressed", () => {
		render(<RenameItemDialog {...defaultProps} />);

		const input = screen.getByTestId("rename-item-name-input");
		fireEvent.input(input, { target: { value: "New Name" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(mockOnConfirm).toHaveBeenCalledWith("New Name");
	});

	it("should call onClose when Cancel is clicked", () => {
		render(<RenameItemDialog {...defaultProps} />);

		fireEvent.click(screen.getByTestId("rename-cancel-button"));

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should call onClose when dialog overlay is clicked", () => {
		render(<RenameItemDialog {...defaultProps} />);

		// Click the dialog overlay to trigger handleOpenChange(false)
		const overlay = screen.getByTestId("dialog-overlay");
		fireEvent.click(overlay);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should show error when name is empty", async () => {
		render(<RenameItemDialog {...defaultProps} />);

		const input = screen.getByTestId("rename-item-name-input");
		fireEvent.input(input, { target: { value: "" } });
		fireEvent.click(screen.getByTestId("rename-save-button"));

		await waitFor(() => {
			expect(screen.getByTestId("rename-error-message")).toBeDefined();
			expect(screen.getByText(/cannot be empty/i)).toBeDefined();
		});

		expect(mockOnConfirm).not.toHaveBeenCalled();
	});

	it("should show error when name contains only whitespace", async () => {
		render(<RenameItemDialog {...defaultProps} />);

		const input = screen.getByTestId("rename-item-name-input");
		fireEvent.input(input, { target: { value: "   " } });
		fireEvent.click(screen.getByTestId("rename-save-button"));

		await waitFor(() => {
			expect(screen.getByTestId("rename-error-message")).toBeDefined();
		});

		expect(mockOnConfirm).not.toHaveBeenCalled();
	});

	it("should show error when name contains invalid characters", async () => {
		render(<RenameItemDialog {...defaultProps} />);

		const input = screen.getByTestId("rename-item-name-input");
		fireEvent.input(input, { target: { value: "Invalid/Name" } });
		fireEvent.click(screen.getByTestId("rename-save-button"));

		await waitFor(() => {
			expect(screen.getByTestId("rename-error-message")).toBeDefined();
			expect(screen.getByText(/cannot contain/i)).toBeDefined();
		});

		expect(mockOnConfirm).not.toHaveBeenCalled();
	});

	it("should clear error when user starts typing", async () => {
		render(<RenameItemDialog {...defaultProps} />);

		const input = screen.getByTestId("rename-item-name-input");

		// First trigger an error
		fireEvent.input(input, { target: { value: "" } });
		fireEvent.click(screen.getByTestId("rename-save-button"));

		await waitFor(() => {
			expect(screen.getByTestId("rename-error-message")).toBeDefined();
		});

		// Then start typing
		fireEvent.input(input, { target: { value: "N" } });

		await waitFor(() => {
			expect(screen.queryByTestId("rename-error-message")).toBeNull();
		});
	});

	it("should reset name when dialog reopens", async () => {
		const { rerender } = render(<RenameItemDialog {...defaultProps} itemName="Original Name" />);

		const input = screen.getByTestId("rename-item-name-input") as HTMLInputElement;
		fireEvent.input(input, { target: { value: "Changed Name" } });
		expect(input.value).toBe("Changed Name");

		// Close and reopen dialog
		rerender(<RenameItemDialog {...defaultProps} itemName="Original Name" open={false} />);
		rerender(<RenameItemDialog {...defaultProps} itemName="Original Name" open={true} />);

		await waitFor(() => {
			const newInput = screen.getByTestId("rename-item-name-input") as HTMLInputElement;
			expect(newInput.value).toBe("Original Name");
		});
	});

	it("should validate various invalid characters", async () => {
		const invalidChars = ["/", "\\", ":", "*", "?", '"', "<", ">", "|"];

		for (const char of invalidChars) {
			vi.clearAllMocks();
			const { unmount } = render(<RenameItemDialog {...defaultProps} />);

			const input = screen.getByTestId("rename-item-name-input");
			fireEvent.input(input, { target: { value: `Name${char}Test` } });
			fireEvent.click(screen.getByTestId("rename-save-button"));

			await waitFor(() => {
				expect(screen.getByTestId("rename-error-message")).toBeDefined();
			});

			expect(mockOnConfirm).not.toHaveBeenCalled();
			unmount();
		}
	});
});
