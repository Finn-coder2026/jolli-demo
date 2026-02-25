import { EditUserDialog } from "./EditUserDialog";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { Locales } from "intlayer";
import type { ActiveUser, OrgUserRole, Role } from "jolli-common";
import { useLocale } from "react-intlayer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("EditUserDialog", () => {
	const mockOnOpenChange = vi.fn();
	const mockOnSave = vi.fn().mockResolvedValue(undefined);
	const mockRoles: Array<Role> = [
		{
			id: 1,
			name: "Owner",
			slug: "owner" as const,
			description: "",
			isBuiltIn: true,
			isDefault: false,
			priority: 100,
			clonedFrom: null,
			createdAt: "",
			updatedAt: "",
		},
		{
			id: 2,
			name: "Admin",
			slug: "admin" as const,
			description: "",
			isBuiltIn: true,
			isDefault: false,
			priority: 80,
			clonedFrom: null,
			createdAt: "",
			updatedAt: "",
		},
		{
			id: 3,
			name: "Member",
			slug: "member" as const,
			description: "",
			isBuiltIn: true,
			isDefault: true,
			priority: 50,
			clonedFrom: null,
			createdAt: "",
			updatedAt: "",
		},
	];

	const baseMockUser: ActiveUser = {
		id: 1,
		email: "test@example.com",
		name: "Test User",
		role: "member",
		roleId: 1,
		isActive: true,
		image: null,
		jobTitle: null,
		phone: null,
		language: "en",
		timezone: "UTC",
		location: null,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	};

	const mockUser: ActiveUser = { ...baseMockUser };

	const mockOwnerUser: ActiveUser = {
		...baseMockUser,
		id: 2,
		email: "owner@example.com",
		name: "Owner User",
		role: "owner",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockOnSave.mockResolvedValue(undefined);
		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should not render when closed", () => {
		render(
			<EditUserDialog
				open={false}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		expect(screen.queryByTestId("edit-user-dialog")).toBeNull();
	});

	it("should render dialog when open", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		expect(screen.getByTestId("edit-user-dialog")).toBeDefined();
		expect(screen.getByText("Edit User")).toBeDefined();
	});

	it("should populate form with user data", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const emailInput = screen.getByTestId("edit-email-input") as HTMLInputElement;
		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		const roleSelect = screen.getByTestId("edit-role-select") as HTMLSelectElement;

		expect(emailInput.value).toBe("test@example.com");
		expect(nameInput.value).toBe("Test User");
		expect(roleSelect.value).toBe("member");
	});

	it("should show email as disabled", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const emailInput = screen.getByTestId("edit-email-input") as HTMLInputElement;
		expect(emailInput.hasAttribute("disabled")).toBe(true);
	});

	it("should allow editing name", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "New Name" } });

		expect(nameInput.value).toBe("New Name");
	});

	it("should show role as select when canEditRoles is true and user is not owner", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		expect(screen.getByTestId("edit-role-select")).toBeDefined();
		expect(screen.queryByTestId("edit-role-input")).toBeNull();
	});

	it("should show role as read-only input when canEditRoles is false", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={false}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		expect(screen.getByTestId("edit-role-input")).toBeDefined();
		expect(screen.queryByTestId("edit-role-select")).toBeNull();

		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		expect(roleInput.hasAttribute("disabled")).toBe(true);
		expect(roleInput.value).toBe("Member");
	});

	it("should show role as read-only input when user is owner", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockOwnerUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		expect(screen.getByTestId("edit-role-input")).toBeDefined();
		expect(screen.queryByTestId("edit-role-select")).toBeNull();

		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		expect(roleInput.value).toBe("Owner");
	});

	it("should allow selecting role when enabled", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleSelect = screen.getByTestId("edit-role-select") as HTMLSelectElement;
		expect(roleSelect.value).toBe("member");

		fireEvent.change(roleSelect, { target: { value: "admin" } });
		expect(roleSelect.value).toBe("admin");
	});

	it("should call onSave with correct data when form is submitted", async () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		// Wait for form to be populated from useEffect
		await waitFor(() => {
			const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
			expect(nameInput.value).toBe("Test User");
		});

		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		const roleSelect = screen.getByTestId("edit-role-select") as HTMLSelectElement;

		// Change name
		await act(() => {
			fireEvent.change(nameInput, { target: { value: "Updated Name" } });
		});

		// Change role using native event dispatch (matching pattern from Users.test.tsx)
		await act(() => {
			roleSelect.value = "admin";
			roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
		});

		// Verify the select value changed
		expect(roleSelect.value).toBe("admin");

		// Submit form
		const submitButton = screen.getByTestId("edit-submit-button");
		await act(() => {
			fireEvent.click(submitButton);
		});

		await waitFor(() => {
			expect(mockOnSave).toHaveBeenCalledWith(1, "Updated Name", "admin");
		});

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should trim whitespace from name when submitting", async () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "  Trimmed Name  " } });

		const submitButton = screen.getByTestId("edit-submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(mockOnSave).toHaveBeenCalledWith(1, "Trimmed Name", "member");
		});
	});

	it("should show error when onSave fails with Error", async () => {
		mockOnSave.mockRejectedValue(new Error("Update failed"));

		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const submitButton = screen.getByTestId("edit-submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Update failed")).toBeDefined();
		});

		// Dialog should remain open
		expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("should show fallback error when onSave fails with non-Error", async () => {
		mockOnSave.mockRejectedValue("Something went wrong");

		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const submitButton = screen.getByTestId("edit-submit-button");
		fireEvent.click(submitButton);

		// Should show the localized fallback error message
		await waitFor(() => {
			expect(screen.getByText("Failed to update user")).toBeDefined();
		});
	});

	it("should show loading state while save is in progress", async () => {
		let resolveSave: () => void;
		const slowSave = vi.fn().mockImplementation(
			() =>
				new Promise<void>(resolve => {
					resolveSave = resolve;
				}),
		);

		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={slowSave}
				isSelf={false}
			/>,
		);

		const submitButton = screen.getByTestId("edit-submit-button");
		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;

		await act(async () => {
			fireEvent.click(submitButton);
			await new Promise(r => setTimeout(r, 10));
		});

		await waitFor(() => {
			const anyDisabled = nameInput.hasAttribute("disabled") || submitButton.hasAttribute("disabled");
			expect(anyDisabled).toBe(true);
		});

		await act(() => {
			resolveSave?.();
		});

		await waitFor(() => {
			expect(slowSave).toHaveBeenCalled();
		});
	});

	it("should close dialog when cancel button is clicked", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const cancelButton = screen.getByText("Cancel");
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should clear error when dialog is closed", async () => {
		mockOnSave.mockRejectedValue(new Error("Update failed"));

		const { rerender } = render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		// Trigger error
		const submitButton = screen.getByTestId("edit-submit-button");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Update failed")).toBeDefined();
		});

		// Close dialog via cancel button (which calls handleOpenChange)
		const cancelButton = screen.getByText("Cancel");
		fireEvent.click(cancelButton);

		// Reopen dialog
		mockOnSave.mockResolvedValue(undefined);
		rerender(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		// Error should be cleared
		expect(screen.queryByText("Update failed")).toBeNull();
	});

	it("should reset form when user changes", async () => {
		const { rerender } = render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Changed Name" } });
		expect(nameInput.value).toBe("Changed Name");

		// Change user
		const newUser: ActiveUser = {
			...baseMockUser,
			id: 3,
			email: "new@example.com",
			name: "New User",
			role: "admin",
		};

		rerender(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={newUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		// Form should be reset to new user's data
		await waitFor(() => {
			const updatedNameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
			expect(updatedNameInput.value).toBe("New User");
		});
	});

	it("should handle user with no name", () => {
		const userWithNoName: ActiveUser = {
			...baseMockUser,
			id: 4,
			email: "noname@example.com",
			name: null,
		};

		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={userWithNoName}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		expect(nameInput.value).toBe("");
	});

	it("should use fallback role labels when roles array is empty", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={[]}
				canEditRoles={false}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		expect(roleInput.value).toBe("Member");
	});

	it("should use fallback options in select when roles array is empty", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={[]}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleSelect = screen.getByTestId("edit-role-select") as HTMLSelectElement;
		const options = roleSelect.querySelectorAll("option");

		// Should have fallback options (member and admin)
		expect(options.length).toBe(2);
	});

	it("should filter out owner from role select options", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleSelect = screen.getByTestId("edit-role-select") as HTMLSelectElement;
		const options = roleSelect.querySelectorAll("option");
		const optionValues = Array.from(options).map(o => o.value);

		// Owner should not be in the options
		expect(optionValues).not.toContain("owner");
		expect(optionValues).toContain("admin");
		expect(optionValues).toContain("member");
	});

	it("should display owner role name in read-only input for owner user", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockOwnerUser}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		expect(roleInput.value).toBe("Owner");
	});

	it("should use localized fallback for owner role when not in roles array", () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={mockOwnerUser}
				roles={[]}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		// Should use the localized fallback "Owner"
		expect(roleInput.value).toBe("Owner");
	});

	it("should use localized fallback for admin role when not in roles array", () => {
		const adminUser: ActiveUser = {
			...baseMockUser,
			id: 5,
			email: "admin@example.com",
			name: "Admin User",
			role: "admin",
		};

		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={adminUser}
				roles={[]}
				canEditRoles={false}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		expect(roleInput.value).toBe("Admin");
	});

	it("should display raw role slug for unknown roles", () => {
		const customRoleUser: ActiveUser = {
			...baseMockUser,
			id: 6,
			email: "custom@example.com",
			name: "Custom Role User",
			role: "custom-role" as unknown as OrgUserRole,
		};

		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={customRoleUser}
				roles={[]}
				canEditRoles={false}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		// Unknown role should display the raw slug
		expect(roleInput.value).toBe("custom-role");
	});

	it("should not call onSave when user is null", async () => {
		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={null}
				roles={mockRoles}
				canEditRoles={true}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		// Submit the form - should early return
		const form = screen.getByTestId("edit-user-dialog").querySelector("form");
		if (form) {
			await act(() => {
				fireEvent.submit(form);
			});
		}

		// onSave should not be called
		expect(mockOnSave).not.toHaveBeenCalled();
	});

	it("should display empty role when user role is undefined", () => {
		const userWithNoRole: ActiveUser = {
			...baseMockUser,
			id: 7,
			email: "norole@example.com",
			name: "No Role User",
			role: undefined as unknown as OrgUserRole,
		};

		render(
			<EditUserDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				user={userWithNoRole}
				roles={[]}
				canEditRoles={false}
				onSave={mockOnSave}
				isSelf={false}
			/>,
		);

		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		// getRoleDisplayName returns "" for undefined role
		expect(roleInput.value).toBe("");
	});
});
