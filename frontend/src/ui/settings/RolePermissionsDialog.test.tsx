import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import { RolePermissionsDialog } from "./RolePermissionsDialog";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { Permission, PermissionsByCategory, RoleWithPermissions } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Radix UI Checkbox to avoid rendering issues in tests
vi.mock("@radix-ui/react-checkbox", () => ({
	Root: vi.fn(({ children, className, checked, onCheckedChange, disabled, ...props }) => (
		<button
			type="button"
			role="checkbox"
			className={className}
			onClick={() => !disabled && onCheckedChange?.(!checked)}
			disabled={disabled}
			{...(checked && { checked: "true" })}
			{...props}
		>
			{children}
		</button>
	)),
	Indicator: vi.fn(({ children, className }) => <span className={className}>{children}</span>),
}));

describe("RolePermissionsDialog", () => {
	const mockOnOpenChange = vi.fn();
	const mockOnSaved = vi.fn();
	let mockListPermissionsGrouped: ReturnType<typeof vi.fn>;
	let mockSetRolePermissions: ReturnType<typeof vi.fn>;

	const mockPermissions: Array<Permission> = [
		{
			id: 1,
			name: "View Users",
			slug: "users.view",
			description: "View user list",
			category: "users",
			createdAt: "2024-01-01T00:00:00.000Z",
		},
		{
			id: 2,
			name: "Edit Users",
			slug: "users.edit",
			description: "Edit user details",
			category: "users",
			createdAt: "2024-01-01T00:00:00.000Z",
		},
		{
			id: 3,
			name: "View Sites",
			slug: "sites.view",
			description: null,
			category: "sites",
			createdAt: "2024-01-01T00:00:00.000Z",
		},
	];

	const mockPermissionsByCategory: PermissionsByCategory = {
		users: [mockPermissions[0], mockPermissions[1]],
		spaces: [],
		integrations: [],
		sites: [mockPermissions[2]],
		roles: [],
		dashboard: [],
		articles: [],
	};

	const mockCustomRole: RoleWithPermissions = {
		id: 2,
		name: "Custom Role",
		slug: "custom-role",
		description: "A custom role",
		isBuiltIn: false,
		isDefault: false,
		priority: 50,
		clonedFrom: 1,
		permissions: [mockPermissions[0]],
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	};

	const mockBuiltInRole: RoleWithPermissions = {
		id: 1,
		name: "Admin",
		slug: "admin",
		description: "Admin role",
		isBuiltIn: true,
		isDefault: false,
		priority: 100,
		clonedFrom: null,
		permissions: [mockPermissions[0], mockPermissions[1]],
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockListPermissionsGrouped = vi.fn().mockResolvedValue(mockPermissionsByCategory);
		mockSetRolePermissions = vi.fn().mockResolvedValue(null);
	});

	function renderDialog(role: RoleWithPermissions = mockCustomRole, open = true) {
		const rolesClient = {
			listPermissionsGrouped: mockListPermissionsGrouped,
			setRolePermissions: mockSetRolePermissions,
		};

		const client = createMockClient({
			roles: vi.fn(() => rolesClient),
		});

		return renderWithProviders(
			<RolePermissionsDialog open={open} onOpenChange={mockOnOpenChange} role={role} onSaved={mockOnSaved} />,
			{ client },
		);
	}

	it("should not render when closed", () => {
		renderDialog(mockCustomRole, false);
		expect(screen.queryByText(/Permissions/)).toBeNull();
	});

	it("should render dialog when open", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText(/Edit Permissions - Custom Role/)).toBeDefined();
		});
	});

	it("should show loading state initially", () => {
		renderDialog();
		expect(screen.getByText("Loading permissions...")).toBeDefined();
	});

	it("should load permissions when dialog opens", async () => {
		renderDialog();

		await waitFor(() => {
			expect(mockListPermissionsGrouped).toHaveBeenCalled();
		});
	});

	it("should display permissions grouped by category", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Users")).toBeDefined();
			expect(screen.getByText("Sites")).toBeDefined();
			expect(screen.getByText("View Users")).toBeDefined();
			expect(screen.getByText("Edit Users")).toBeDefined();
			expect(screen.getByText("View Sites")).toBeDefined();
		});
	});

	it("should show permission descriptions when available", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("View user list")).toBeDefined();
			expect(screen.getByText("Edit user details")).toBeDefined();
		});
	});

	it("should not show permission descriptions when null", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.queryByText("null")).toBeNull();
		});
	});

	it("should check permissions that role has", async () => {
		renderDialog();

		await waitFor(() => {
			const viewUsersCheckbox = screen.getByLabelText("View Users");
			expect(viewUsersCheckbox.hasAttribute("checked")).toBe(true);
		});
	});

	it("should not check permissions that role does not have", async () => {
		renderDialog();

		await waitFor(() => {
			const editUsersCheckbox = screen.getByLabelText("Edit Users");
			expect(editUsersCheckbox.hasAttribute("checked")).toBe(false);
		});
	});

	it("should allow toggling permissions for custom roles", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Edit Users")).toBeDefined();
		});

		let editUsersCheckbox = screen.getByLabelText("Edit Users");
		expect(editUsersCheckbox.hasAttribute("checked")).toBe(false);

		fireEvent.click(editUsersCheckbox);

		await waitFor(() => {
			editUsersCheckbox = screen.getByLabelText("Edit Users");
			expect(editUsersCheckbox.hasAttribute("checked")).toBe(true);
		});
	});

	it("should show unsaved changes indicator when permissions are modified", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Edit Users")).toBeDefined();
		});

		const editUsersCheckbox = screen.getByLabelText("Edit Users") as HTMLInputElement;
		fireEvent.click(editUsersCheckbox);

		await waitFor(() => {
			expect(screen.getByText("Unsaved changes")).toBeDefined();
		});
	});

	it("should not show unsaved changes when no modifications", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("View Users")).toBeDefined();
		});

		expect(screen.queryByText("Unsaved changes")).toBeNull();
	});

	it("should enable save button when there are changes", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Edit Users")).toBeDefined();
		});

		const saveButton = screen.getByRole("button", { name: "Save" });
		expect(saveButton.hasAttribute("disabled")).toBe(true);

		const editUsersCheckbox = screen.getByLabelText("Edit Users") as HTMLInputElement;
		fireEvent.click(editUsersCheckbox);

		await waitFor(() => {
			expect(saveButton.hasAttribute("disabled")).toBe(false);
		});
	});

	it("should call setRolePermissions when save is clicked", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Edit Users")).toBeDefined();
		});

		const editUsersCheckbox = screen.getByLabelText("Edit Users") as HTMLInputElement;
		fireEvent.click(editUsersCheckbox);

		const saveButton = screen.getByRole("button", { name: "Save" });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockSetRolePermissions).toHaveBeenCalledWith(
				2,
				expect.arrayContaining(["users.view", "users.edit"]),
			);
			expect(mockOnSaved).toHaveBeenCalled();
		});
	});

	it("should show error message when save fails", async () => {
		mockSetRolePermissions.mockRejectedValueOnce(new Error("Failed to save"));
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Edit Users")).toBeDefined();
		});

		const editUsersCheckbox = screen.getByLabelText("Edit Users") as HTMLInputElement;
		fireEvent.click(editUsersCheckbox);

		const saveButton = screen.getByRole("button", { name: "Save" });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to save")).toBeDefined();
		});

		expect(mockOnSaved).not.toHaveBeenCalled();
	});

	it("should show generic error when error is not an Error instance", async () => {
		mockSetRolePermissions.mockRejectedValueOnce("Something went wrong");
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Edit Users")).toBeDefined();
		});

		const editUsersCheckbox = screen.getByLabelText("Edit Users") as HTMLInputElement;
		fireEvent.click(editUsersCheckbox);

		const saveButton = screen.getByRole("button", { name: "Save" });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to save permissions")).toBeDefined();
		});
	});

	it("should disable save button while saving", async () => {
		mockSetRolePermissions.mockImplementation(
			() =>
				new Promise(resolve => {
					setTimeout(() => resolve(null), 100);
				}),
		);

		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Edit Users")).toBeDefined();
		});

		const editUsersCheckbox = screen.getByLabelText("Edit Users") as HTMLInputElement;
		fireEvent.click(editUsersCheckbox);

		const saveButton = screen.getByRole("button", { name: "Save" });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByText("Saving...")).toBeDefined();
			const savingButton = screen.getByRole("button", { name: "Saving..." });
			expect(savingButton.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should call onOpenChange when cancel is clicked", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("View Users")).toBeDefined();
		});

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		fireEvent.click(cancelButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should clear error when dialog closes", async () => {
		mockListPermissionsGrouped.mockRejectedValueOnce(new Error("Failed to load"));
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Failed to load")).toBeDefined();
		});

		const closeButton = screen.getByRole("button", { name: "Cancel" });
		fireEvent.click(closeButton);

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should show View title and description for built-in roles", async () => {
		renderDialog(mockBuiltInRole);

		await waitFor(() => {
			expect(screen.getByText(/View Permissions - Admin/)).toBeDefined();
			expect(
				screen.getByText(/Built-in roles cannot be modified. Clone this role to create a customizable copy./),
			).toBeDefined();
		});
	});

	it("should show Edit title and description for custom roles", async () => {
		renderDialog(mockCustomRole);

		await waitFor(() => {
			expect(screen.getByText(/Edit Permissions - Custom Role/)).toBeDefined();
			expect(
				screen.getByText(/Select the permissions for this role. Changes are saved when you click Save./),
			).toBeDefined();
		});
	});

	it("should disable permission checkboxes for built-in roles", async () => {
		renderDialog(mockBuiltInRole);

		await waitFor(() => {
			const viewUsersCheckbox = screen.getByLabelText("View Users") as HTMLInputElement;
			expect(viewUsersCheckbox.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should show Close button for built-in roles", async () => {
		renderDialog(mockBuiltInRole);

		await waitFor(() => {
			const closeButtons = screen.getAllByRole("button", { name: "Close" });
			expect(closeButtons.length).toBeGreaterThan(0);
		});
	});

	it("should not show Save button for built-in roles", async () => {
		renderDialog(mockBuiltInRole);

		await waitFor(() => {
			expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
		});
	});

	it("should not show unsaved changes indicator for built-in roles", async () => {
		renderDialog(mockBuiltInRole);

		await waitFor(() => {
			expect(screen.getByText("View Users")).toBeDefined();
		});

		expect(screen.queryByText("Unsaved changes")).toBeNull();
	});

	it("should not call setRolePermissions for built-in roles", async () => {
		renderDialog(mockBuiltInRole);

		await waitFor(() => {
			expect(screen.getByText("View Users")).toBeDefined();
		});

		expect(mockSetRolePermissions).not.toHaveBeenCalled();
	});

	it("should show error state when permissions fail to load", async () => {
		mockListPermissionsGrouped.mockRejectedValueOnce(new Error("Network error"));
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeDefined();
		});
	});

	it("should show generic error when load error is not an Error instance", async () => {
		mockListPermissionsGrouped.mockRejectedValueOnce("Something went wrong");
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Failed to load permissions")).toBeDefined();
		});
	});

	it("should show retry button when loading fails", async () => {
		mockListPermissionsGrouped.mockRejectedValueOnce(new Error("Network error"));
		renderDialog();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
		});
	});

	it("should retry loading permissions when retry button is clicked", async () => {
		mockListPermissionsGrouped.mockRejectedValueOnce(new Error("Network error"));
		renderDialog();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
		});

		mockListPermissionsGrouped.mockResolvedValueOnce(mockPermissionsByCategory);

		const retryButton = screen.getByRole("button", { name: "Retry" });
		fireEvent.click(retryButton);

		await waitFor(() => {
			expect(mockListPermissionsGrouped).toHaveBeenCalledTimes(2);
			expect(screen.getByText("View Users")).toBeDefined();
		});
	});

	it("should not render categories with no permissions", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("Users")).toBeDefined();
			expect(screen.getByText("Sites")).toBeDefined();
		});

		expect(screen.queryByText("Spaces")).toBeNull();
		expect(screen.queryByText("Integrations")).toBeNull();
		expect(screen.queryByText("Roles")).toBeNull();
		expect(screen.queryByText("Dashboard")).toBeNull();
		expect(screen.queryByText("Articles")).toBeNull();
	});

	it("should handle toggling permission off", async () => {
		renderDialog();

		await waitFor(() => {
			expect(screen.getByText("View Users")).toBeDefined();
		});

		let viewUsersCheckbox = screen.getByLabelText("View Users");
		expect(viewUsersCheckbox.hasAttribute("checked")).toBe(true);

		fireEvent.click(viewUsersCheckbox);

		await waitFor(() => {
			viewUsersCheckbox = screen.getByLabelText("View Users");
			expect(viewUsersCheckbox.hasAttribute("checked")).toBe(false);
		});

		const saveButton = screen.getByRole("button", { name: "Save" });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockSetRolePermissions).toHaveBeenCalledWith(2, expect.arrayContaining([]));
			// Verify the array is empty (no slugs selected)
			expect(mockSetRolePermissions.mock.calls[0][1]).toHaveLength(0);
		});
	});

	it("should reload permissions when dialog reopens", async () => {
		mockListPermissionsGrouped.mockClear();

		renderDialog(mockCustomRole, false);

		expect(mockListPermissionsGrouped).not.toHaveBeenCalled();

		const rolesClient = {
			listPermissionsGrouped: mockListPermissionsGrouped,
			setRolePermissions: mockSetRolePermissions,
		};

		const client = createMockClient({
			roles: vi.fn(() => rolesClient),
		});

		renderWithProviders(
			<RolePermissionsDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				role={mockCustomRole}
				onSaved={mockOnSaved}
			/>,
			{ client },
		);

		await waitFor(() => {
			expect(mockListPermissionsGrouped).toHaveBeenCalled();
		});
	});

	it("should show read-only message when readOnly prop is true for custom role", async () => {
		const rolesClient = {
			listPermissionsGrouped: mockListPermissionsGrouped,
			setRolePermissions: mockSetRolePermissions,
		};

		const client = createMockClient({
			roles: vi.fn(() => rolesClient),
		});

		renderWithProviders(
			<RolePermissionsDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				role={mockCustomRole}
				onSaved={mockOnSaved}
				readOnly={true}
			/>,
			{ client },
		);

		await waitFor(() => {
			expect(screen.getByText(/View Permissions - Custom Role/)).toBeDefined();
			expect(screen.getByText(/You don't have permission to modify role permissions./)).toBeDefined();
		});
	});

	it("should disable permission checkboxes when readOnly prop is true", async () => {
		const rolesClient = {
			listPermissionsGrouped: mockListPermissionsGrouped,
			setRolePermissions: mockSetRolePermissions,
		};

		const client = createMockClient({
			roles: vi.fn(() => rolesClient),
		});

		renderWithProviders(
			<RolePermissionsDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				role={mockCustomRole}
				onSaved={mockOnSaved}
				readOnly={true}
			/>,
			{ client },
		);

		await waitFor(() => {
			const viewUsersCheckbox = screen.getByLabelText("View Users") as HTMLInputElement;
			expect(viewUsersCheckbox.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should not show Save button when readOnly prop is true", async () => {
		const rolesClient = {
			listPermissionsGrouped: mockListPermissionsGrouped,
			setRolePermissions: mockSetRolePermissions,
		};

		const client = createMockClient({
			roles: vi.fn(() => rolesClient),
		});

		renderWithProviders(
			<RolePermissionsDialog
				open={true}
				onOpenChange={mockOnOpenChange}
				role={mockCustomRole}
				onSaved={mockOnSaved}
				readOnly={true}
			/>,
			{ client },
		);

		await waitFor(() => {
			expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
		});
	});
});
