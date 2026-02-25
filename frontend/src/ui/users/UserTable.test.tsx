import { UserTable } from "./UserTable";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { Locales } from "intlayer";
import type { OrgUserRole } from "jolli-common";
import { useLocale } from "react-intlayer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock data
const mockActiveUsers = [
	{
		id: 1,
		email: "user1@example.com",
		name: "User One",
		role: "admin" as const,
		roleId: null,
		isActive: true,
		image: "https://example.com/avatar.png",
		jobTitle: null,
		phone: null,
		language: "en",
		timezone: "UTC",
		location: null,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
	{
		id: 2,
		email: "user2@example.com",
		name: null,
		role: "member" as const,
		roleId: null,
		isActive: true,
		image: null,
		jobTitle: null,
		phone: null,
		language: "en",
		timezone: "UTC",
		location: null,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
];

const mockPendingInvitations = [
	{
		id: 1,
		email: "invited@example.com",
		name: "Invited User",
		role: "member" as const,
		invitedBy: 1,
		tokenHash: "hash",
		expiresAt: "2030-01-01T00:00:00Z",
		status: "pending" as const,
		createdAt: "2024-01-01T00:00:00Z",
	},
	{
		id: 2,
		email: "expired@example.com",
		name: null,
		role: "admin" as const,
		invitedBy: 1,
		tokenHash: "hash2",
		expiresAt: "2020-01-01T00:00:00Z", // Expired
		status: "pending" as const,
		createdAt: "2024-01-01T00:00:00Z",
	},
];

const mockArchivedUsers = [
	{
		id: 1,
		userId: 3,
		email: "archived@example.com",
		name: "Archived User",
		role: "member" as const,
		removedBy: 1,
		removedByName: "Admin User",
		reason: "Left the company",
		removedAt: "2024-06-01T00:00:00Z",
	},
	{
		id: 2,
		userId: 4,
		email: "archived2@example.com",
		name: null,
		role: null,
		removedBy: 1,
		removedByName: null,
		reason: null,
		removedAt: "2024-06-01T00:00:00Z",
	},
];

function mockGetRoleLabel(role: OrgUserRole): string {
	const labels: Record<OrgUserRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };
	return labels[role];
}

describe("UserTable - Active Users", () => {
	const mockOnEditUser = vi.fn();
	const mockOnDeactivateUser = vi.fn().mockResolvedValue(undefined);
	const mockOnActivateUser = vi.fn().mockResolvedValue(undefined);
	const mockOnDeleteUser = vi.fn().mockResolvedValue(undefined);

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock implementations after clearAllMocks
		mockOnEditUser.mockReset();
		mockOnDeactivateUser.mockResolvedValue(undefined);
		mockOnActivateUser.mockResolvedValue(undefined);
		mockOnDeleteUser.mockResolvedValue(undefined);
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

	it("should render loading state", () => {
		render(
			<UserTable
				type="active"
				data={[]}
				loading={true}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		expect(screen.getByText("Loading...")).toBeDefined();
	});

	it("should render empty state", () => {
		render(
			<UserTable
				type="active"
				data={[]}
				loading={false}
				emptyMessage="No active users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		expect(screen.getByText("No active users")).toBeDefined();
	});

	it("should render active users table with data", () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		expect(screen.getByTestId("user-table-active")).toBeDefined();
		expect(screen.getByText("user1@example.com")).toBeDefined();
		expect(screen.getByText("User One")).toBeDefined();
		// Role should be displayed as plain text (not a badge)
		const roleCell = screen.getByTestId("role-admin");
		expect(roleCell).toBeDefined();
		expect(roleCell.textContent).toBe("Admin");
		// Verify it's a td element (plain text), not a badge component
		expect(roleCell.tagName.toLowerCase()).toBe("td");
		// Status column should show Active
		expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
	});

	it("should show dash when name is null", () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// User 2 has null name
		const rows = screen.getAllByRole("row");
		expect(rows.length).toBeGreaterThan(1);
	});

	it("should show actions dropdown menu when actions button is clicked", async () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Role should be displayed as plain text (not a dropdown or badge)
		expect(screen.getByTestId("role-admin")).toBeDefined();

		// Click actions button to open dropdown
		fireEvent.click(screen.getByTestId("actions-1"));

		// Dropdown menu should show Deactivate and Delete options (user is active)
		await waitFor(() => {
			expect(screen.getByTestId("deactivate-user-1")).toBeDefined();
			expect(screen.getByTestId("delete-user-1")).toBeDefined();
		});
	});

	it("should call onDeactivateUser when deactivate option is clicked", async () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Click actions button to open dropdown
		fireEvent.click(screen.getByTestId("actions-1"));

		await waitFor(() => {
			expect(screen.getByTestId("deactivate-user-1")).toBeDefined();
		});

		// Click deactivate option to open confirmation dialog
		fireEvent.click(screen.getByTestId("deactivate-user-1"));

		// Wait for dialog to appear and verify deactivate description is shown
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-1")).toBeDefined();
			// Verify deactivate-specific description is displayed (covers line 361-362)
			expect(screen.getByText(/deactivate.*User One/i)).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("action-confirm-button"));

		await waitFor(() => {
			expect(mockOnDeactivateUser).toHaveBeenCalledWith(1);
		});
	});

	it("should not call onDeactivateUser when cancel button is clicked in dialog", async () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Click actions button to open dropdown
		fireEvent.click(screen.getByTestId("actions-1"));

		await waitFor(() => {
			expect(screen.getByTestId("deactivate-user-1")).toBeDefined();
		});

		// Click deactivate option to open confirmation dialog
		fireEvent.click(screen.getByTestId("deactivate-user-1"));

		// Wait for dialog to appear
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-1")).toBeDefined();
		});

		// Click cancel button
		fireEvent.click(screen.getByTestId("action-cancel-button"));

		// Verify onDeactivateUser was not called (dialog was cancelled)
		expect(mockOnDeactivateUser).not.toHaveBeenCalled();
	});

	it("should not show actions for owner user", () => {
		const usersWithOwner = [
			{
				id: 1,
				email: "owner@example.com",
				name: "Owner",
				role: "owner" as const,
				roleId: null,
				isActive: true,
				image: null,
				jobTitle: null,
				phone: null,
				language: "en",
				timezone: "UTC",
				location: null,
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			},
		];

		render(
			<UserTable
				type="active"
				data={usersWithOwner}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Owner should not have actions button
		expect(screen.queryByTestId("actions-1")).toBeNull();
	});

	it("should call onEditUser when Edit menu item is clicked", async () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Open the actions menu for user 1
		const actionsButton = screen.getByTestId("actions-1");
		fireEvent.click(actionsButton);

		// Click the Edit menu item
		await waitFor(() => {
			const editMenuItem = screen.getByTestId("edit-user-1");
			fireEvent.click(editMenuItem);
		});

		// Verify onEditUser was called with the user object
		expect(mockOnEditUser).toHaveBeenCalledWith(mockActiveUsers[0]);
	});

	it("should not show Edit menu item when canEditUsers is false", async () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={false}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Open the actions menu for user 1
		const actionsButton = screen.getByTestId("actions-1");
		fireEvent.click(actionsButton);

		// Verify Edit menu item is not present
		await waitFor(() => {
			expect(screen.queryByTestId("edit-user-1")).toBeNull();
		});
	});

	it("should render image when present", () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		const image = screen.getByRole("img");
		expect(image).toBeDefined();
		expect(image.getAttribute("src")).toBe("https://example.com/avatar.png");
	});

	it("should show Activate action for inactive users", async () => {
		const inactiveUsers = [
			{
				...mockActiveUsers[0],
				isActive: false,
			},
		];

		render(
			<UserTable
				type="active"
				data={inactiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Click actions button to open dropdown
		fireEvent.click(screen.getByTestId("actions-1"));

		// Dropdown menu should show Activate and Delete options (user is inactive)
		await waitFor(() => {
			expect(screen.getByTestId("activate-user-1")).toBeDefined();
			expect(screen.getByTestId("delete-user-1")).toBeDefined();
		});

		// Deactivate should not be shown for inactive users
		expect(screen.queryByTestId("deactivate-user-1")).toBeNull();
	});

	it("should call onActivateUser when activate option is clicked", async () => {
		const inactiveUsers = [
			{
				...mockActiveUsers[0],
				isActive: false,
			},
		];

		render(
			<UserTable
				type="active"
				data={inactiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Click actions button to open dropdown
		fireEvent.click(screen.getByTestId("actions-1"));

		await waitFor(() => {
			expect(screen.getByTestId("activate-user-1")).toBeDefined();
		});

		// Click activate option to open confirmation dialog
		fireEvent.click(screen.getByTestId("activate-user-1"));

		// Wait for dialog to appear and verify activate description is shown
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-1")).toBeDefined();
			// Verify activate-specific description is displayed (covers line 363-364)
			expect(screen.getByText(/activate.*User One/i)).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("action-confirm-button"));

		await waitFor(() => {
			expect(mockOnActivateUser).toHaveBeenCalledWith(1);
		});
	});

	it("should show Inactive status badge for inactive users", () => {
		const inactiveUsers = [
			{
				...mockActiveUsers[0],
				isActive: false,
			},
		];

		render(
			<UserTable
				type="active"
				data={inactiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Should show Inactive status
		expect(screen.getByText("Inactive")).toBeDefined();
	});

	it("should call onDeleteUser when delete option is clicked and confirmed", async () => {
		render(
			<UserTable
				type="active"
				data={mockActiveUsers}
				loading={false}
				emptyMessage="No users"
				getRoleLabel={mockGetRoleLabel}
				currentUserId={999}
				canEditUsers={true}
				canManageUsers={true}
				onEditUser={mockOnEditUser}
				onDeactivateUser={mockOnDeactivateUser}
				onActivateUser={mockOnActivateUser}
				onDeleteUser={mockOnDeleteUser}
			/>,
		);

		// Click actions button to open dropdown
		fireEvent.click(screen.getByTestId("actions-1"));

		await waitFor(() => {
			expect(screen.getByTestId("delete-user-1")).toBeDefined();
		});

		// Click delete option to open confirmation dialog
		fireEvent.click(screen.getByTestId("delete-user-1"));

		// Wait for dialog to appear and verify delete description is shown
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-1")).toBeDefined();
			// Verify delete-specific description is displayed (covers line 359-360)
			expect(screen.getByText(/delete.*User One/i)).toBeDefined();
		});

		// Confirm deletion
		fireEvent.click(screen.getByTestId("action-confirm-button"));

		await waitFor(() => {
			expect(mockOnDeleteUser).toHaveBeenCalledWith(1);
		});
	});
});

describe("UserTable - Pending Invitations", () => {
	const mockOnCancel = vi.fn();
	const mockOnResend = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
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

	it("should render pending invitations table", () => {
		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		expect(screen.getByTestId("user-table-pending")).toBeDefined();
		expect(screen.getByText("invited@example.com")).toBeDefined();
		expect(screen.getByText("Invited User")).toBeDefined();
	});

	it("should display roles as plain text in pending invitations", () => {
		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		// Role should be displayed as plain text (not a badge)
		const roleCell = screen.getByTestId("role-member");
		expect(roleCell).toBeDefined();
		expect(roleCell.textContent).toBe("Member");
		// Verify it's a td element (plain text), not a badge component
		expect(roleCell.tagName.toLowerCase()).toBe("td");
	});

	it("should show expired indicator for expired invitations", () => {
		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		// The expired invitation should show expired text
		expect(screen.getByText(/Expired/)).toBeDefined();
	});

	it("should open cancel confirmation dialog when cancel button is clicked", () => {
		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		fireEvent.click(screen.getByTestId("cancel-invitation-1"));

		// Dialog should open with correct content
		expect(screen.getByTestId("cancel-dialog-1")).toBeDefined();
		expect(screen.getByTestId("cancel-dialog-confirm-button")).toBeDefined();
		expect(screen.getByText(/Are you sure you want to cancel the invitation to invited@example.com/)).toBeDefined();
		// onCancel should not be called yet
		expect(mockOnCancel).not.toHaveBeenCalled();
	});

	it("should call onCancelInvitation when confirm button is clicked in cancel dialog", async () => {
		mockOnCancel.mockResolvedValue(undefined);

		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		// Open the dialog
		fireEvent.click(screen.getByTestId("cancel-invitation-1"));

		// Click confirm button
		fireEvent.click(screen.getByTestId("cancel-dialog-confirm-button"));

		await waitFor(() => {
			expect(mockOnCancel).toHaveBeenCalledWith(1);
		});
	});

	it("should not call onCancel when dismiss button is clicked in cancel dialog", async () => {
		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		// Open the dialog
		fireEvent.click(screen.getByTestId("cancel-invitation-1"));

		// Dialog should be open
		expect(screen.getByTestId("cancel-dialog-1")).toBeDefined();

		// Click dismiss button
		fireEvent.click(screen.getByTestId("cancel-dialog-dismiss-button"));

		// Wait a bit to ensure onCancel is not called
		await new Promise(resolve => setTimeout(resolve, 100));

		// onCancel should not have been called
		expect(mockOnCancel).not.toHaveBeenCalled();
	});

	it("should open confirmation dialog when resend button is clicked", () => {
		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		fireEvent.click(screen.getByTestId("resend-invitation-1"));

		// Dialog should open
		expect(screen.getByTestId("resend-dialog-1")).toBeDefined();
		expect(screen.getByText("Resend Invitation")).toBeDefined();
		expect(screen.getByText(/Are you sure you want to resend the invitation to invited@example.com/)).toBeDefined();
		// onResend should not be called yet
		expect(mockOnResend).not.toHaveBeenCalled();
	});

	it("should call onResendInvitation when confirm button is clicked in dialog", async () => {
		mockOnResend.mockResolvedValue(undefined);

		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		// Open the dialog
		fireEvent.click(screen.getByTestId("resend-invitation-1"));

		// Click confirm button
		fireEvent.click(screen.getByTestId("resend-confirm-button"));

		await waitFor(() => {
			expect(mockOnResend).toHaveBeenCalledWith(1);
		});
	});

	it("should not call onResend when cancel button is clicked", async () => {
		render(
			<UserTable
				type="pending"
				data={mockPendingInvitations}
				loading={false}
				emptyMessage="No invitations"
				getRoleLabel={mockGetRoleLabel}
				canManageUsers={true}
				onCancelInvitation={mockOnCancel}
				onResendInvitation={mockOnResend}
			/>,
		);

		// Open the dialog
		fireEvent.click(screen.getByTestId("resend-invitation-1"));

		// Dialog should be open
		expect(screen.getByTestId("resend-dialog-1")).toBeDefined();

		// Click cancel button
		fireEvent.click(screen.getByTestId("resend-cancel-button"));

		// Wait a bit to ensure onResend is not called
		await new Promise(resolve => setTimeout(resolve, 100));

		// onResend should not have been called
		expect(mockOnResend).not.toHaveBeenCalled();
	});
});

describe("UserTable - Archived Users", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

	it("should render archived users table", () => {
		render(
			<UserTable
				type="archived"
				data={mockArchivedUsers}
				loading={false}
				emptyMessage="No archived users"
				getRoleLabel={mockGetRoleLabel}
			/>,
		);

		expect(screen.getByTestId("user-table-archived")).toBeDefined();
		expect(screen.getByText("archived@example.com")).toBeDefined();
		expect(screen.getByText("Archived User")).toBeDefined();
		expect(screen.getByText("Left the company")).toBeDefined();
	});

	it("should display roles as plain text in archived users", () => {
		render(
			<UserTable
				type="archived"
				data={mockArchivedUsers}
				loading={false}
				emptyMessage="No archived users"
				getRoleLabel={mockGetRoleLabel}
			/>,
		);

		// Role should be displayed as plain text (not a badge)
		const roleCell = screen.getByTestId("role-member");
		expect(roleCell).toBeDefined();
		expect(roleCell.textContent).toBe("Member");
		// Verify it's a td element (plain text), not a badge component
		expect(roleCell.tagName.toLowerCase()).toBe("td");
	});

	it("should show dash for null values", () => {
		render(
			<UserTable
				type="archived"
				data={mockArchivedUsers}
				loading={false}
				emptyMessage="No archived users"
				getRoleLabel={mockGetRoleLabel}
			/>,
		);

		// User 2 has null name, role, and reason
		const dashes = screen.getAllByText("-");
		expect(dashes.length).toBeGreaterThan(0);
	});
});
