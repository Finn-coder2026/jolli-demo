import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import { EditRoleDialog } from "./EditRoleDialog";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { Role } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("EditRoleDialog", () => {
	const mockOnOpenChange = vi.fn();
	const mockOnSuccess = vi.fn();
	let mockUpdateRole: ReturnType<typeof vi.fn>;

	const mockRole: Role = {
		id: 2,
		name: "Custom Editor",
		slug: "custom-editor",
		description: "A custom editor role",
		isBuiltIn: false,
		isDefault: false,
		priority: 50,
		clonedFrom: 1,
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateRole = vi.fn().mockResolvedValue({ id: 2, name: "Updated Role" });
	});

	function renderDialog(open = true, role: Role = mockRole) {
		const rolesClient = {
			updateRole: mockUpdateRole,
		};

		const client = createMockClient({
			roles: vi.fn(() => rolesClient),
		});

		return renderWithProviders(
			<EditRoleDialog open={open} onOpenChange={mockOnOpenChange} role={role} onSuccess={mockOnSuccess} />,
			{ client },
		);
	}

	it("should not render when closed", () => {
		renderDialog(false);
		expect(screen.queryByText("Edit Role")).toBeNull();
	});

	it("should render dialog when open", () => {
		renderDialog();
		expect(screen.getByText("Edit Role")).toBeDefined();
		expect(screen.getByText("Update the name and description for this custom role.")).toBeDefined();
	});

	it("should pre-fill name with current role name", () => {
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		expect(nameInput.value).toBe("Custom Editor");
	});

	it("should pre-fill description with current role description", () => {
		renderDialog();

		const descriptionInput = screen.getByTestId("edit-role-description-input") as HTMLTextAreaElement;
		expect(descriptionInput.value).toBe("A custom editor role");
	});

	it("should handle role without description", () => {
		const roleWithoutDescription: Role = {
			...mockRole,
			description: null,
		};

		renderDialog(true, roleWithoutDescription);

		const descriptionInput = screen.getByTestId("edit-role-description-input") as HTMLTextAreaElement;
		expect(descriptionInput.value).toBe("");
	});

	it("should allow changing name", () => {
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "New Role Name" } });

		expect(nameInput.value).toBe("New Role Name");
	});

	it("should allow changing description", () => {
		renderDialog();

		const descriptionInput = screen.getByTestId("edit-role-description-input") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "New description" } });

		expect(descriptionInput.value).toBe("New description");
	});

	it("should show error when name is empty", async () => {
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("edit-role-error")).toBeDefined();
			expect(screen.getByTestId("edit-role-error").textContent).toBe("Name is required");
		});

		expect(mockUpdateRole).not.toHaveBeenCalled();
	});

	it("should show error when name is only whitespace", async () => {
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "   " } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("edit-role-error").textContent).toBe("Name is required");
		});

		expect(mockUpdateRole).not.toHaveBeenCalled();
	});

	it("should trim whitespace from name before submission", async () => {
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "  Updated Name  " } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdateRole).toHaveBeenCalledWith(2, {
				name: "Updated Name",
				description: "A custom editor role",
			});
		});
	});

	it("should trim whitespace from description before submission", async () => {
		renderDialog();

		const descriptionInput = screen.getByTestId("edit-role-description-input") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "  New description  " } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdateRole).toHaveBeenCalledWith(2, {
				name: "Custom Editor",
				description: "New description",
			});
		});
	});

	it("should close dialog without calling updateRole when nothing changed", () => {
		renderDialog();

		// Don't change anything
		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		// Should close without API call
		expect(mockUpdateRole).not.toHaveBeenCalled();
		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should call updateRole when only name is changed", async () => {
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "New Name" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdateRole).toHaveBeenCalledWith(2, {
				name: "New Name",
				description: "A custom editor role",
			});
		});
	});

	it("should call updateRole when only description is changed", async () => {
		renderDialog();

		const descriptionInput = screen.getByTestId("edit-role-description-input") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "New description" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdateRole).toHaveBeenCalledWith(2, {
				name: "Custom Editor",
				description: "New description",
			});
		});
	});

	it("should call onSuccess after successful update", async () => {
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Updated Role Name" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockOnSuccess).toHaveBeenCalled();
		});
	});

	it("should show error message when update fails", async () => {
		mockUpdateRole.mockRejectedValueOnce(new Error("Role name already exists"));
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Existing Role" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("edit-role-error").textContent).toBe("Role name already exists");
		});

		expect(mockOnSuccess).not.toHaveBeenCalled();
	});

	it("should show generic error message when error is not an Error instance", async () => {
		mockUpdateRole.mockRejectedValueOnce("Something went wrong");
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "New Name" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("edit-role-error").textContent).toBe("Failed to update role");
		});
	});

	it("should disable inputs while submitting", async () => {
		mockUpdateRole.mockImplementation(
			() =>
				new Promise(resolve => {
					setTimeout(() => resolve({ id: 2, name: "Updated" }), 100);
				}),
		);

		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "New Name" } });

		const descriptionInput = screen.getByTestId("edit-role-description-input") as HTMLTextAreaElement;
		const submitButton = screen.getByTestId("edit-role-save-button");
		const cancelButton = screen.getByTestId("edit-role-cancel-button");

		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(nameInput.hasAttribute("disabled")).toBe(true);
			expect(descriptionInput.hasAttribute("disabled")).toBe(true);
			expect(submitButton.hasAttribute("disabled")).toBe(true);
			expect(cancelButton.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should show Saving... text while submitting", async () => {
		mockUpdateRole.mockImplementation(
			() =>
				new Promise(resolve => {
					setTimeout(() => resolve({ id: 2, name: "Updated" }), 100);
				}),
		);

		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "New Name" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Saving...")).toBeDefined();
		});
	});

	it("should call onOpenChange when cancel button is clicked", () => {
		renderDialog();

		const cancelButton = screen.getByTestId("edit-role-cancel-button");
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should reset form when dialog closes", () => {
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Changed Name" } });

		const cancelButton = screen.getByTestId("edit-role-cancel-button");
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should clear error when dialog closes", async () => {
		mockUpdateRole.mockRejectedValueOnce(new Error("Error message"));
		renderDialog();

		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "New Name" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("edit-role-error")).toBeDefined();
		});

		const cancelButton = screen.getByTestId("edit-role-cancel-button");
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should clear description when setting it to empty string", async () => {
		renderDialog();

		const descriptionInput = screen.getByTestId("edit-role-description-input") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdateRole).toHaveBeenCalledWith(2, {
				name: "Custom Editor",
				description: "",
			});
		});
	});

	it("should reset form when closing dialog with role without description", () => {
		const roleWithoutDescription: Role = {
			...mockRole,
			description: null,
		};

		renderDialog(true, roleWithoutDescription);

		// Modify the form
		const nameInput = screen.getByTestId("edit-role-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Modified Name" } });

		// Close the dialog - this triggers handleOpenChange which resets description
		const cancelButton = screen.getByTestId("edit-role-cancel-button");
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should detect changes correctly when role has null description", async () => {
		const roleWithoutDescription: Role = {
			...mockRole,
			description: null,
		};

		renderDialog(true, roleWithoutDescription);

		// Add a description (was null, now has value)
		const descriptionInput = screen.getByTestId("edit-role-description-input") as HTMLTextAreaElement;
		fireEvent.change(descriptionInput, { target: { value: "New description" } });

		const submitButton = screen.getByTestId("edit-role-save-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockUpdateRole).toHaveBeenCalledWith(2, {
				name: "Custom Editor",
				description: "New description",
			});
		});
	});
});
