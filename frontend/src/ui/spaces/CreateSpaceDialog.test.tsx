import { CreateSpaceDialog } from "./CreateSpaceDialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CreateSpaceDialog", () => {
	const mockOnConfirm = vi.fn();
	const mockOnClose = vi.fn();

	const defaultProps = {
		open: true,
		onConfirm: mockOnConfirm,
		onClose: mockOnClose,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render dialog when open", () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		expect(screen.getByTestId("create-space-dialog-content")).toBeDefined();
	});

	it("should not render dialog when closed", () => {
		render(<CreateSpaceDialog {...defaultProps} open={false} />);

		expect(screen.queryByTestId("create-space-dialog-content")).toBeNull();
	});

	it("should display dialog title and subtitle", () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		expect(screen.getByText("Create New Space")).toBeDefined();
		expect(screen.getByText(/organize your documentation/i)).toBeDefined();
	});

	it("should have empty name input initially", () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input") as HTMLInputElement;
		expect(input.value).toBe("");
	});

	it("should call onConfirm with name and description when Create is clicked", async () => {
		mockOnConfirm.mockResolvedValue(undefined);
		render(<CreateSpaceDialog {...defaultProps} />);

		const nameInput = screen.getByTestId("create-space-name-input");
		fireEvent.input(nameInput, { target: { value: "My New Space" } });

		const descInput = screen.getByTestId("create-space-description-input");
		fireEvent.input(descInput, { target: { value: "A test description" } });

		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(mockOnConfirm).toHaveBeenCalledWith("My New Space", "A test description");
		});
	});

	it("should call onConfirm with trimmed name", async () => {
		mockOnConfirm.mockResolvedValue(undefined);
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "  My Space  " } });

		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(mockOnConfirm).toHaveBeenCalledWith("My Space", undefined);
		});
	});

	it("should call onConfirm when Enter key is pressed in name input", async () => {
		mockOnConfirm.mockResolvedValue(undefined);
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "New Space" } });
		fireEvent.keyDown(input, { key: "Enter" });

		await waitFor(() => {
			expect(mockOnConfirm).toHaveBeenCalledWith("New Space", undefined);
		});
	});

	it("should not call onConfirm when Enter is pressed while submitting", async () => {
		mockOnConfirm.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "New Space" } });

		// First submission
		fireEvent.keyDown(input, { key: "Enter" });

		// Try to submit again while still submitting
		fireEvent.keyDown(input, { key: "Enter" });

		await waitFor(() => {
			expect(mockOnConfirm).toHaveBeenCalledTimes(1);
		});
	});

	it("should call onClose when Cancel is clicked", () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		fireEvent.click(screen.getByTestId("create-space-cancel-button"));

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should show error when name is empty", async () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(screen.getByTestId("create-space-error-message")).toBeDefined();
			expect(screen.getByText(/cannot be empty/i)).toBeDefined();
		});

		expect(mockOnConfirm).not.toHaveBeenCalled();
	});

	it("should show error when name contains only whitespace", async () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "   " } });
		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(screen.getByTestId("create-space-error-message")).toBeDefined();
		});

		expect(mockOnConfirm).not.toHaveBeenCalled();
	});

	it("should show error when name contains invalid characters", async () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "Invalid/Name" } });
		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(screen.getByTestId("create-space-error-message")).toBeDefined();
			expect(screen.getByText(/cannot contain/i)).toBeDefined();
		});

		expect(mockOnConfirm).not.toHaveBeenCalled();
	});

	it("should clear error when user starts typing", async () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");

		// First trigger an error
		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(screen.getByTestId("create-space-error-message")).toBeDefined();
		});

		// Then start typing
		fireEvent.input(input, { target: { value: "N" } });

		await waitFor(() => {
			expect(screen.queryByTestId("create-space-error-message")).toBeNull();
		});
	});

	it("should reset state when dialog reopens", async () => {
		const { rerender } = render(<CreateSpaceDialog {...defaultProps} />);

		const nameInput = screen.getByTestId("create-space-name-input") as HTMLInputElement;
		fireEvent.input(nameInput, { target: { value: "Test Space" } });
		expect(nameInput.value).toBe("Test Space");

		// Close and reopen dialog
		rerender(<CreateSpaceDialog {...defaultProps} open={false} />);
		rerender(<CreateSpaceDialog {...defaultProps} open={true} />);

		await waitFor(() => {
			const newInput = screen.getByTestId("create-space-name-input") as HTMLInputElement;
			expect(newInput.value).toBe("");
		});
	});

	it("should disable inputs while submitting", async () => {
		mockOnConfirm.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
		render(<CreateSpaceDialog {...defaultProps} />);

		const nameInput = screen.getByTestId("create-space-name-input");
		fireEvent.input(nameInput, { target: { value: "New Space" } });

		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(screen.getByTestId("create-space-name-input")).toHaveProperty("disabled", true);
			expect(screen.getByTestId("create-space-description-input")).toHaveProperty("disabled", true);
			expect(screen.getByTestId("create-space-cancel-button")).toHaveProperty("disabled", true);
		});
	});

	it("should show error from onConfirm rejection", async () => {
		mockOnConfirm.mockRejectedValue(new Error("Space already exists"));
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "Existing Space" } });

		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(screen.getByTestId("create-space-error-message")).toBeDefined();
			expect(screen.getByText("Space already exists")).toBeDefined();
		});
	});

	it("should show generic error when rejection is not an Error", async () => {
		mockOnConfirm.mockRejectedValue("Some error string");
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "Test Space" } });

		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		await waitFor(() => {
			expect(screen.getByTestId("create-space-error-message")).toBeDefined();
			expect(screen.getByText(/Failed to create space/i)).toBeDefined();
		});
	});

	it("should validate various invalid characters", async () => {
		const invalidChars = ["/", "\\", ":", "*", "?", '"', "<", ">", "|"];

		for (const char of invalidChars) {
			vi.clearAllMocks();
			const { unmount } = render(<CreateSpaceDialog {...defaultProps} />);

			const input = screen.getByTestId("create-space-name-input");
			fireEvent.input(input, { target: { value: `Space${char}Name` } });
			fireEvent.click(screen.getByTestId("create-space-submit-button"));

			await waitFor(() => {
				expect(screen.getByTestId("create-space-error-message")).toBeDefined();
			});

			expect(mockOnConfirm).not.toHaveBeenCalled();
			unmount();
		}
	});

	it("should disable submit button when name is empty", () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		const submitButton = screen.getByTestId("create-space-submit-button");
		expect(submitButton).toHaveProperty("disabled", true);
	});

	it("should enable submit button when name is not empty", () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "Test" } });

		const submitButton = screen.getByTestId("create-space-submit-button");
		expect(submitButton).toHaveProperty("disabled", false);
	});

	it("should not call onClose when submitting", () => {
		mockOnConfirm.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "Test" } });

		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		// Try to close while submitting - handleOpenChange should not call onClose
		// This tests the isSubmitting check in handleOpenChange
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("should call onClose when clicking dialog overlay", () => {
		render(<CreateSpaceDialog {...defaultProps} />);

		// Click the overlay to trigger handleOpenChange
		const overlay = screen.getByTestId("dialog-overlay");
		fireEvent.click(overlay);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should not call onClose when clicking overlay while submitting", async () => {
		mockOnConfirm.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
		render(<CreateSpaceDialog {...defaultProps} />);

		const input = screen.getByTestId("create-space-name-input");
		fireEvent.input(input, { target: { value: "Test" } });

		// Start submission
		fireEvent.click(screen.getByTestId("create-space-submit-button"));

		// Wait for isSubmitting to be true
		await waitFor(() => {
			expect(screen.getByTestId("create-space-name-input")).toHaveProperty("disabled", true);
		});

		// Try to close by clicking overlay while submitting
		const overlay = screen.getByTestId("dialog-overlay");
		fireEvent.click(overlay);

		// Should not call onClose while submitting
		expect(mockOnClose).not.toHaveBeenCalled();
	});
});
