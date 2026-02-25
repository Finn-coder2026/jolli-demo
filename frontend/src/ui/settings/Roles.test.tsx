import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import { Roles } from "./Roles";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { Role, RoleWithPermissions } from "jolli-common";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async () => {
	const actual = await vi.importActual<typeof import("lucide-react")>("lucide-react");
	return {
		...actual,
		Copy: () => <span>Copy Icon</span>,
		Lock: () => <span>Lock Icon</span>,
		Pencil: () => <span>Pencil Icon</span>,
		Shield: () => <span>Shield Icon</span>,
		Trash2: () => <span>Trash Icon</span>,
		MoreHorizontal: () => <span>More Icon</span>,
	};
});

// Mock PermissionGuard to always render children (permissions are tested separately)
vi.mock("../../components/PermissionGuard", () => ({
	PermissionGuard: ({ children }: { children: ReactNode }) => children,
	withPermission: <P extends object>(Component: ComponentType<P>) => Component,
}));

// Mock RolePermissionsDialog to trigger the onSaved callback
vi.mock("./RolePermissionsDialog", () => ({
	RolePermissionsDialog: ({
		open,
		onSaved,
		role,
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		role: { name: string } | null;
		onSaved: () => void;
	}) => {
		return open ? (
			<div data-testid="mock-permissions-dialog">
				<span>Permissions - {role?.name}</span>
				<button type="button" data-testid="mock-save-permissions" onClick={onSaved}>
					Mock Save
				</button>
			</div>
		) : null;
	},
}));

// Mock EditRoleDialog to trigger the onSuccess callback
vi.mock("./EditRoleDialog", () => ({
	EditRoleDialog: ({
		open,
		onSuccess,
		role,
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		role: { name: string } | null;
		onSuccess: () => void;
	}) => {
		return open ? (
			<div data-testid="mock-edit-dialog">
				<span>Edit - {role?.name}</span>
				<button type="button" data-testid="mock-save-edit" onClick={onSuccess}>
					Mock Save Edit
				</button>
			</div>
		) : null;
	},
}));

// Mock Radix UI DropdownMenu to avoid rendering issues in tests
// In tests, we always render the dropdown content regardless of open state
vi.mock("@radix-ui/react-dropdown-menu", async () => {
	const actual = await vi.importActual<typeof import("@radix-ui/react-dropdown-menu")>(
		"@radix-ui/react-dropdown-menu",
	);
	return {
		...actual,
		Root: vi.fn(({ children }) => <div data-testid="dropdown-root">{children}</div>),
		// Trigger with asChild just renders the children directly
		Trigger: vi.fn(({ children, asChild }) =>
			asChild ? children : <button data-testid="dropdown-trigger">{children}</button>,
		),
		Portal: vi.fn(({ children }) => <div data-testid="dropdown-portal">{children}</div>),
		// Always render content in tests so items are accessible
		Content: vi.fn(({ children }) => <div data-testid="dropdown-content">{children}</div>),
		Item: vi.fn(({ children, onClick, className }) => (
			<button type="button" onClick={onClick} className={className}>
				{children}
			</button>
		)),
	};
});

describe("Roles", () => {
	let mockListRoles: ReturnType<typeof vi.fn>;
	let mockGetRole: ReturnType<typeof vi.fn>;
	let mockCloneRole: ReturnType<typeof vi.fn>;
	let mockUpdateRole: ReturnType<typeof vi.fn>;
	let mockDeleteRole: ReturnType<typeof vi.fn>;
	let mockSetRolePermissions: ReturnType<typeof vi.fn>;
	let mockListPermissionsGrouped: ReturnType<typeof vi.fn>;

	const mockBuiltInRoles: Array<Role> = [
		{
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
		},
		{
			id: 2,
			name: "Member",
			slug: "member",
			description: "Member role",
			isBuiltIn: true,
			isDefault: true,
			priority: 50,
			clonedFrom: null,
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-01T00:00:00.000Z",
		},
	];

	const mockCustomRoles: Array<Role> = [
		{
			id: 3,
			name: "Custom Admin",
			slug: "custom-admin",
			description: "Custom admin role",
			isBuiltIn: false,
			isDefault: false,
			priority: 90,
			clonedFrom: 1,
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-01T00:00:00.000Z",
		},
	];

	const mockRoleWithPermissions: RoleWithPermissions = {
		...mockBuiltInRoles[0],
		permissions: [
			{
				id: 1,
				name: "View Users",
				slug: "users.view",
				description: "View user list",
				category: "users",
				createdAt: "2024-01-01T00:00:00.000Z",
			},
		],
	};

	const mockCustomRoleWithPermissions: RoleWithPermissions = {
		...mockCustomRoles[0],
		permissions: [
			{
				id: 1,
				name: "View Users",
				slug: "users.view",
				description: "View user list",
				category: "users",
				createdAt: "2024-01-01T00:00:00.000Z",
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockListRoles = vi.fn().mockResolvedValue([...mockBuiltInRoles, ...mockCustomRoles]);
		mockGetRole = vi.fn().mockResolvedValue(mockRoleWithPermissions);
		mockCloneRole = vi.fn().mockResolvedValue({ id: 4, name: "Admin (Copy)" });
		mockUpdateRole = vi.fn().mockResolvedValue({ id: 3, name: "Updated Custom Admin" });
		mockDeleteRole = vi.fn().mockResolvedValue(undefined);
		mockSetRolePermissions = vi.fn().mockResolvedValue(null);
		mockListPermissionsGrouped = vi.fn().mockResolvedValue({
			users: [],
			spaces: [],
			integrations: [],
			sites: [],
			roles: [],
			dashboard: [],
			articles: [],
		});

		// Mock window.confirm
		vi.spyOn(window, "confirm").mockReturnValue(true);
	});

	function renderRoles() {
		const rolesClient = {
			listRoles: mockListRoles,
			getRole: mockGetRole,
			cloneRole: mockCloneRole,
			updateRole: mockUpdateRole,
			deleteRole: mockDeleteRole,
			setRolePermissions: mockSetRolePermissions,
			listPermissionsGrouped: mockListPermissionsGrouped,
			// Include getCurrentUserPermissions for PermissionProvider
			getCurrentUserPermissions: vi.fn().mockResolvedValue({
				role: {
					id: 1,
					name: "Owner",
					slug: "owner",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 100,
					clonedFrom: null,
					createdAt: "2024-01-01T00:00:00.000Z",
					updatedAt: "2024-01-01T00:00:00.000Z",
					permissions: [],
				},
				permissions: ["roles.view", "roles.edit"],
			}),
		};

		const client = createMockClient({
			roles: vi.fn(() => rolesClient),
		});

		return renderWithProviders(<Roles />, { client });
	}

	it("should show loading state initially", () => {
		renderRoles();
		expect(screen.getByText("Loading roles...")).toBeDefined();
	});

	it("should load and display roles", async () => {
		renderRoles();

		await waitFor(() => {
			expect(mockListRoles).toHaveBeenCalled();
			expect(screen.getByText("Admin")).toBeDefined();
			expect(screen.getByText("Member")).toBeDefined();
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});
	});

	it("should display built-in roles section", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Built-in Roles")).toBeDefined();
			expect(
				screen.getByText(
					"These roles are system-defined and cannot be modified. Clone them to create custom variants.",
				),
			).toBeDefined();
		});
	});

	it("should display custom roles section", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Roles")).toBeDefined();
		});
	});

	it("should show message when no custom roles exist", async () => {
		mockListRoles.mockResolvedValue(mockBuiltInRoles);
		renderRoles();

		await waitFor(() => {
			expect(
				screen.getByText("No custom roles yet. Clone a built-in role to create a custom variant."),
			).toBeDefined();
		});
	});

	it("should show role descriptions", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin role")).toBeDefined();
			expect(screen.getByText("Member role")).toBeDefined();
			expect(screen.getByText("Custom admin role")).toBeDefined();
		});
	});

	it("should show Default badge for default roles", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Default")).toBeDefined();
		});
	});

	it("should show cloned from indicator for custom roles", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Cloned from another role")).toBeDefined();
		});
	});

	it("should show View Permissions button for built-in roles", async () => {
		renderRoles();

		await waitFor(() => {
			const viewButtons = screen.getAllByRole("button", { name: /View Permissions/ });
			expect(viewButtons.length).toBeGreaterThan(0);
		});
	});

	it("should show Edit Permissions button for custom roles", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Edit Permissions" })).toBeDefined();
		});
	});

	it("should open clone dialog when Clone Role is clicked", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered, so we can directly find Clone Role button
		const cloneButtons = screen.getAllByText("Clone Role");
		// Click the first Clone Role button (for Admin role)
		fireEvent.click(cloneButtons[0]);

		await waitFor(() => {
			expect(screen.getByText(/Create a new custom role based on/)).toBeDefined();
		});
	});

	it("should open permissions dialog when View Permissions is clicked", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});

		const viewPermissionsButton = screen.getAllByRole("button", { name: /View Permissions/ })[0];
		fireEvent.click(viewPermissionsButton);

		await waitFor(() => {
			expect(mockGetRole).toHaveBeenCalledWith(1);
			expect(screen.getByText(/Permissions - Admin/)).toBeDefined();
		});
	});

	it("should open permissions dialog when Edit Permissions is clicked", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		const editPermissionsButton = screen.getByRole("button", { name: "Edit Permissions" });
		fireEvent.click(editPermissionsButton);

		await waitFor(() => {
			expect(mockGetRole).toHaveBeenCalledWith(3);
		});
	});

	it("should show error when loading permissions fails", async () => {
		mockGetRole.mockRejectedValueOnce(new Error("Failed to load role"));
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});

		const viewPermissionsButton = screen.getAllByRole("button", { name: /View Permissions/ })[0];
		fireEvent.click(viewPermissionsButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to load role")).toBeDefined();
		});
	});

	it("should show generic error when load error is not an Error instance", async () => {
		mockGetRole.mockRejectedValueOnce("Something went wrong");
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});

		const viewPermissionsButton = screen.getAllByRole("button", { name: /View Permissions/ })[0];
		fireEvent.click(viewPermissionsButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to load role permissions")).toBeDefined();
		});
	});

	it("should delete role when Delete Role is clicked and confirmed", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		const deleteButton = screen.getByText("Delete Role");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete the role "Custom Admin"?');
			expect(mockDeleteRole).toHaveBeenCalledWith(3);
			expect(mockListRoles).toHaveBeenCalledTimes(2); // Initial load + reload after delete
		});
	});

	it("should not delete role when deletion is cancelled", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		const deleteButton = screen.getByText("Delete Role");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(window.confirm).toHaveBeenCalled();
		});

		expect(mockDeleteRole).not.toHaveBeenCalled();
	});

	it("should show error when deletion fails", async () => {
		mockDeleteRole.mockRejectedValueOnce(new Error("Cannot delete default role"));
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		const deleteButton = screen.getByText("Delete Role");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(screen.getByText("Cannot delete default role")).toBeDefined();
		});
	});

	it("should show generic error when delete error is not an Error instance", async () => {
		mockDeleteRole.mockRejectedValueOnce("Something went wrong");
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		const deleteButton = screen.getByText("Delete Role");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to delete role")).toBeDefined();
		});
	});

	it("should reload roles after successful clone", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		const cloneButton = screen.getAllByText("Clone Role")[0];
		fireEvent.click(cloneButton);

		await waitFor(() => {
			expect(screen.getByText(/Create a new custom role based on/)).toBeDefined();
		});

		// Submit clone form
		const createButton = screen.getByRole("button", { name: "Create Role" });
		fireEvent.click(createButton);

		await waitFor(() => {
			expect(mockCloneRole).toHaveBeenCalled();
			expect(mockListRoles).toHaveBeenCalledTimes(2); // Initial load + reload after clone
		});
	});

	it("should allow cloning a custom role", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// Get the Clone Role button for the custom role (third in the list after Admin and Member)
		const cloneButtons = screen.getAllByText("Clone Role");
		// Custom Admin is the third role, so its clone button is at index 2
		fireEvent.click(cloneButtons[2]);

		await waitFor(() => {
			expect(screen.getByText(/Create a new custom role based on/)).toBeDefined();
		});
	});

	it("should reload roles when permissions are saved via callback", async () => {
		// This test verifies handlePermissionsSaved is called when the dialog saves
		mockGetRole.mockResolvedValue(mockCustomRoleWithPermissions);

		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// Open permissions dialog
		const editPermissionsButton = screen.getByRole("button", { name: "Edit Permissions" });
		fireEvent.click(editPermissionsButton);

		// Wait for permissions dialog to be rendered
		await waitFor(() => {
			expect(mockGetRole).toHaveBeenCalledWith(3);
			expect(screen.getByTestId("mock-permissions-dialog")).toBeDefined();
		});

		// Click the mock save button which triggers onSaved (handlePermissionsSaved)
		const mockSaveButton = screen.getByTestId("mock-save-permissions");
		fireEvent.click(mockSaveButton);

		// Verify roles are reloaded after save
		await waitFor(() => {
			expect(mockListRoles).toHaveBeenCalledTimes(2); // Initial load + reload after save
		});
	});

	it("should show error state when loading fails", async () => {
		mockListRoles.mockRejectedValueOnce(new Error("Network error"));
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeDefined();
		});
	});

	it("should show generic error when load error is not an Error instance", async () => {
		mockListRoles.mockRejectedValueOnce("Something went wrong");
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Failed to load roles")).toBeDefined();
		});
	});

	it("should show retry button when loading fails", async () => {
		mockListRoles.mockRejectedValueOnce(new Error("Network error"));
		renderRoles();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
		});
	});

	it("should retry loading when retry button is clicked", async () => {
		mockListRoles.mockRejectedValueOnce(new Error("Network error"));
		renderRoles();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
		});

		mockListRoles.mockResolvedValueOnce([...mockBuiltInRoles, ...mockCustomRoles]);

		const retryButton = screen.getByRole("button", { name: "Retry" });
		fireEvent.click(retryButton);

		await waitFor(() => {
			expect(mockListRoles).toHaveBeenCalledTimes(2);
			expect(screen.getByText("Admin")).toBeDefined();
		});
	});

	it("should not show Delete Role option for built-in roles", async () => {
		// Render only built-in roles to test that Delete Role doesn't appear
		mockListRoles.mockResolvedValue(mockBuiltInRoles);
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		// Clone Role should be shown for built-in roles
		expect(screen.getAllByText("Clone Role").length).toBeGreaterThan(0);

		// Delete Role should not be shown for built-in roles
		expect(screen.queryByText("Delete Role")).toBeNull();
	});

	it("should show Delete Role option for custom roles", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		// Delete Role should be shown for custom roles
		expect(screen.getByText("Delete Role")).toBeDefined();
	});

	it("should handle role without description", async () => {
		const rolesWithoutDesc = [
			{
				...mockBuiltInRoles[0],
				description: null,
			},
		];
		mockListRoles.mockResolvedValue(rolesWithoutDesc);
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});
	});

	it("should handle role without clonedFrom", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});

		// Built-in roles don't have "Cloned from another role" text
		const clonedFromTexts = screen.queryAllByText("Cloned from another role");
		expect(clonedFromTexts.length).toBe(1); // Only custom role has this
	});

	it("should show Edit Role option for custom roles", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		// Edit Role should be shown for custom roles
		expect(screen.getByText("Edit Role")).toBeDefined();
	});

	it("should not show Edit Role option for built-in roles", async () => {
		// Render only built-in roles to test that Edit Role doesn't appear
		mockListRoles.mockResolvedValue(mockBuiltInRoles);
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		// Edit Role should not be shown for built-in roles
		expect(screen.queryByText("Edit Role")).toBeNull();
	});

	it("should open edit dialog when Edit Role is clicked", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// In tests, dropdown content is always rendered
		const editButton = screen.getByText("Edit Role");
		fireEvent.click(editButton);

		await waitFor(() => {
			expect(screen.getByTestId("mock-edit-dialog")).toBeDefined();
			expect(screen.getByText(/Edit - Custom Admin/)).toBeDefined();
		});
	});

	it("should reload roles after successful edit", async () => {
		renderRoles();

		await waitFor(() => {
			expect(screen.getByText("Custom Admin")).toBeDefined();
		});

		// Open edit dialog
		const editButton = screen.getByText("Edit Role");
		fireEvent.click(editButton);

		await waitFor(() => {
			expect(screen.getByTestId("mock-edit-dialog")).toBeDefined();
		});

		// Click mock save button which triggers onSuccess (handleEditSuccess)
		const mockSaveButton = screen.getByTestId("mock-save-edit");
		fireEvent.click(mockSaveButton);

		// Verify roles are reloaded after save
		await waitFor(() => {
			expect(mockListRoles).toHaveBeenCalledTimes(2); // Initial load + reload after edit
		});
	});
});
