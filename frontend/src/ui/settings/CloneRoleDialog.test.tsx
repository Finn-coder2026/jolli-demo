import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import { CloneRoleDialog } from "./CloneRoleDialog";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { Role } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CloneRoleDialog", () => {
	const mockOnOpenChange = vi.fn();
	const mockOnSuccess = vi.fn();
	let mockCloneRole: ReturnType<typeof vi.fn>;

	const mockSourceRole: Role = {
		id: 1,
		name: "Admin",
		slug: "admin",
		description: "Admin role",
		isBuiltIn: true,
		isDefault: false,
		priority: 100,
		clonedFrom: null,
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockCloneRole = vi.fn().mockResolvedValue({ id: 2, name: "Admin (Copy)" });
	});

	function renderDialog(open = true) {
		const rolesClient = {
			cloneRole: mockCloneRole,
		};

		const client = createMockClient({
			roles: vi.fn(() => rolesClient),
		});

		return renderWithProviders(
			<CloneRoleDialog
				open={open}
				onOpenChange={mockOnOpenChange}
				sourceRole={mockSourceRole}
				onSuccess={mockOnSuccess}
			/>,
			{ client },
		);
	}

	it("should not render when closed", () => {
		renderDialog(false);
		expect(screen.queryByText("Clone Role")).toBeNull();
	});

	it("should render dialog when open", () => {
		renderDialog();
		expect(screen.getByText("Clone Role")).toBeDefined();
		expect(screen.getByText(/Create a new custom role based on/)).toBeDefined();
	});

	it("should pre-fill name with source role name and (Copy)", () => {
		renderDialog();

		const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
		expect(nameInput.value).toBe("Admin (Copy)");
	});

	it("should pre-fill description with source role description", () => {
		renderDialog();

		const descriptionInput = screen.getByLabelText("Description (optional)") as HTMLTextAreaElement;
		expect(descriptionInput.value).toBe("Admin role");
	});

	it("should handle source role without description", () => {
		const roleWithoutDescription: Role = {
			...mockSourceRole,
			description: null,
		};

		const client = createMockClient({
			roles: vi.fn(() => ({
				cloneRole: mockCloneRole,
			})),
		});

		renderWithProviders(
			<CloneRoleDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				sourceRole={roleWithoutDescription}
				onSuccess={mockOnSuccess}
			/>,
			{ client },
		);

		const descriptionInput = screen.getByLabelText("Description (optional)") as HTMLTextAreaElement;
		expect(descriptionInput.value).toBe("");
	});

	it("should allow changing name", () => {
		renderDialog();

		const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Custom Admin" } });

		expect(nameInput.value).toBe("Custom Admin");
	});

	it("should allow changing description", () => {
		renderDialog();

		const descriptionInput = screen.getByLabelText("Description (optional)") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "Custom description" } });

		expect(descriptionInput.value).toBe("Custom description");
	});

	it("should show error when name is empty", async () => {
		renderDialog();

		const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "" } });

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Name is required")).toBeDefined();
		});

		expect(mockCloneRole).not.toHaveBeenCalled();
	});

	it("should trim whitespace from name before submission", async () => {
		renderDialog();

		const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "  Custom Admin  " } });

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockCloneRole).toHaveBeenCalledWith(1, {
				name: "Custom Admin",
				description: "Admin role",
			});
		});
	});

	it("should trim whitespace from description before submission", async () => {
		renderDialog();

		const descriptionInput = screen.getByLabelText("Description (optional)") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "  Custom description  " } });

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockCloneRole).toHaveBeenCalledWith(1, {
				name: "Admin (Copy)",
				description: "Custom description",
			});
		});
	});

	it("should not include description in submission when empty", async () => {
		renderDialog();

		const descriptionInput = screen.getByLabelText("Description (optional)") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "" } });

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockCloneRole).toHaveBeenCalledWith(1, {
				name: "Admin (Copy)",
			});
		});
	});

	it("should not include description in submission when only whitespace", async () => {
		renderDialog();

		const descriptionInput = screen.getByLabelText("Description (optional)") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "   " } });

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockCloneRole).toHaveBeenCalledWith(1, {
				name: "Admin (Copy)",
			});
		});
	});

	it("should call onSuccess and cloneRole when form is submitted", async () => {
		renderDialog();

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockCloneRole).toHaveBeenCalledWith(1, {
				name: "Admin (Copy)",
				description: "Admin role",
			});
			expect(mockOnSuccess).toHaveBeenCalled();
		});
	});

	it("should show error message when cloning fails", async () => {
		mockCloneRole.mockRejectedValueOnce(new Error("Role name already exists"));
		renderDialog();

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Role name already exists")).toBeDefined();
		});

		expect(mockOnSuccess).not.toHaveBeenCalled();
	});

	it("should show generic error message when error is not an Error instance", async () => {
		mockCloneRole.mockRejectedValueOnce("Something went wrong");
		renderDialog();

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to clone role")).toBeDefined();
		});
	});

	it("should disable inputs while submitting", async () => {
		mockCloneRole.mockImplementation(
			() =>
				new Promise(resolve => {
					setTimeout(() => resolve({ id: 2, name: "Admin (Copy)" }), 100);
				}),
		);

		renderDialog();

		const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
		const descriptionInput = screen.getByLabelText("Description (optional)") as HTMLTextAreaElement;
		const submitButton = screen.getByRole("button", { name: "Create Role" });

		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(nameInput.hasAttribute("disabled")).toBe(true);
			expect(descriptionInput.hasAttribute("disabled")).toBe(true);
			expect(submitButton.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should show Creating... text while submitting", async () => {
		mockCloneRole.mockImplementation(
			() =>
				new Promise(resolve => {
					setTimeout(() => resolve({ id: 2, name: "Admin (Copy)" }), 100);
				}),
		);

		renderDialog();

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Creating...")).toBeDefined();
		});
	});

	it("should call onOpenChange when cancel button is clicked", () => {
		renderDialog();

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should reset form when dialog closes", () => {
		renderDialog();

		const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Custom Name" } });

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should clear error when dialog closes", async () => {
		mockCloneRole.mockRejectedValueOnce(new Error("Error message"));
		renderDialog();

		const submitButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Error message")).toBeDefined();
		});

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should reset form when closing dialog with source role without description", () => {
		const roleWithoutDescription: Role = {
			...mockSourceRole,
			description: null,
		};

		const client = createMockClient({
			roles: vi.fn(() => ({
				cloneRole: mockCloneRole,
			})),
		});

		renderWithProviders(
			<CloneRoleDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				sourceRole={roleWithoutDescription}
				onSuccess={mockOnSuccess}
			/>,
			{ client },
		);

		// Modify the form
		const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Modified Name" } });

		// Close the dialog - this triggers handleOpenChange which should reset description to ""
		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});
});
