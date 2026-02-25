import { Users } from "./Users";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { Locales } from "intlayer";
import type { Client } from "jolli-common";
import type { ReactNode } from "react";
import { useLocale } from "react-intlayer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientProvider } from "@/contexts/ClientContext";
import { OrgProvider } from "@/contexts/OrgContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Mock data
const mockActiveUsers = [
	{
		id: 1,
		email: "user1@example.com",
		name: "User One",
		role: "admin" as const,
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
	{
		id: 2,
		email: "user2@example.com",
		name: "User Two",
		role: "member" as const,
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
		verificationId: 100,
		expiresAt: "2025-01-01T00:00:00Z",
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
		reason: "Left the company",
		removedAt: "2024-06-01T00:00:00Z",
	},
];

// Create mock user management client
const mockUserManagement = {
	listActiveUsers: vi
		.fn()
		.mockResolvedValue({ data: mockActiveUsers, total: 2, canEditRoles: true, canManageUsers: true }),
	listPendingInvitations: vi.fn().mockResolvedValue({ data: mockPendingInvitations, total: 1 }),
	listArchivedUsers: vi.fn().mockResolvedValue({ data: mockArchivedUsers, total: 1 }),
	inviteUser: vi.fn().mockResolvedValue(mockPendingInvitations[0]),
	cancelInvitation: vi.fn().mockResolvedValue({ success: true }),
	resendInvitation: vi.fn().mockResolvedValue(mockPendingInvitations[0]),
	updateUserRole: vi.fn().mockResolvedValue(mockActiveUsers[0]),
	updateUserName: vi.fn().mockResolvedValue(mockActiveUsers[0]),
	deactivateUser: vi.fn().mockResolvedValue({ ...mockActiveUsers[0], isActive: false }),
	activateUser: vi.fn().mockResolvedValue({ ...mockActiveUsers[0], isActive: true }),
	archiveUser: vi.fn().mockResolvedValue({ success: true }),
	getConfig: vi.fn().mockResolvedValue({ authorizedEmailPatterns: "*" }),
	listRoles: vi.fn().mockResolvedValue([]),
};

// Mock the client
const mockClient = {
	orgs: () => ({
		getCurrent: vi.fn().mockResolvedValue({
			tenant: null,
			org: null,
			availableOrgs: [],
		}),
	}),
	userManagement: () => mockUserManagement,
} as unknown as Client;

function renderWithProviders(ui: ReactNode) {
	return render(
		<ClientProvider client={mockClient}>
			<OrgProvider>
				<PreferencesProvider>
					<ThemeProvider>{ui}</ThemeProvider>
				</PreferencesProvider>
			</OrgProvider>
		</ClientProvider>,
	);
}

describe("Users", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock implementations after clearAllMocks
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: mockActiveUsers,
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.listPendingInvitations.mockResolvedValue({ data: mockPendingInvitations, total: 1 });
		mockUserManagement.listArchivedUsers.mockResolvedValue({ data: mockArchivedUsers, total: 1 });
		mockUserManagement.inviteUser.mockResolvedValue(mockPendingInvitations[0]);
		mockUserManagement.cancelInvitation.mockResolvedValue({ success: true });
		mockUserManagement.resendInvitation.mockResolvedValue(mockPendingInvitations[0]);
		mockUserManagement.updateUserRole.mockResolvedValue(mockActiveUsers[0]);
		mockUserManagement.archiveUser.mockResolvedValue({ success: true });
		mockUserManagement.getConfig.mockResolvedValue({ authorizedEmailPatterns: "*" });
		mockUserManagement.listRoles.mockResolvedValue([]);

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

	it("should render page title", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText("Users")).toBeDefined();
		});
	});

	it("should render invite button", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByTestId("invite-user-button")).toBeDefined();
		});
	});

	it("should render tabs", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByTestId("tab-active")).toBeDefined();
			expect(screen.getByTestId("tab-pending")).toBeDefined();
			expect(screen.getByTestId("tab-archived")).toBeDefined();
		});
	});

	it("should load active users by default", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(mockUserManagement.listActiveUsers).toHaveBeenCalledWith(20, 0);
		});
	});

	it("should display active users in table", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
			expect(screen.getByText("user2@example.com")).toBeDefined();
		});
	});

	it("should switch to pending tab and load invitations", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the pending tab
		await act(() => {
			fireEvent.click(screen.getByTestId("tab-pending"));
		});

		await waitFor(() => {
			expect(mockUserManagement.listPendingInvitations).toHaveBeenCalledWith(20, 0);
		});
	});

	it("should switch to archived tab and load archived users", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the archived tab
		await act(() => {
			fireEvent.click(screen.getByTestId("tab-archived"));
		});

		await waitFor(() => {
			expect(mockUserManagement.listArchivedUsers).toHaveBeenCalledWith(20, 0);
		});
	});

	it("should open invite dialog when invite button is clicked", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByTestId("invite-user-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("invite-user-button"));

		await waitFor(() => {
			expect(screen.getByTestId("invite-user-dialog")).toBeDefined();
		});
	});

	it("should submit invitation and switch to pending tab", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Open invite dialog
		fireEvent.click(screen.getByTestId("invite-user-button"));

		await waitFor(() => {
			expect(screen.getByTestId("invite-user-dialog")).toBeDefined();
		});

		// Fill in the form
		const emailInput = screen.getByTestId("invite-email-input");
		const nameInput = screen.getByTestId("invite-name-input");

		await act(() => {
			fireEvent.change(emailInput, { target: { value: "newuser@example.com" } });
			fireEvent.change(nameInput, { target: { value: "New User" } });
		});

		// Submit the form
		await act(() => {
			fireEvent.click(screen.getByTestId("invite-submit-button"));
		});

		// Wait for the invite API call and tab switch
		await waitFor(() => {
			expect(mockUserManagement.inviteUser).toHaveBeenCalledWith({
				email: "newuser@example.com",
				role: "member",
				name: "New User",
			});
		});

		// Should switch to pending tab
		await waitFor(() => {
			expect(mockUserManagement.listPendingInvitations).toHaveBeenCalled();
		});
	});

	it("should refresh data when inviting from pending tab", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Switch to pending tab first
		await act(() => {
			fireEvent.click(screen.getByTestId("tab-pending"));
		});

		await waitFor(() => {
			expect(mockUserManagement.listPendingInvitations).toHaveBeenCalled();
		});

		// Clear mock call counts
		vi.clearAllMocks();

		// Open invite dialog
		fireEvent.click(screen.getByTestId("invite-user-button"));

		await waitFor(() => {
			expect(screen.getByTestId("invite-user-dialog")).toBeDefined();
		});

		// Fill in the form
		const emailInput = screen.getByTestId("invite-email-input");

		await act(() => {
			fireEvent.change(emailInput, { target: { value: "another@example.com" } });
		});

		// Submit the form
		await act(() => {
			fireEvent.click(screen.getByTestId("invite-submit-button"));
		});

		// Wait for the invite API call
		await waitFor(() => {
			expect(mockUserManagement.inviteUser).toHaveBeenCalledWith({
				email: "another@example.com",
				role: "member",
			});
		});

		// Should refresh the pending list (not switch tabs)
		await waitFor(() => {
			expect(mockUserManagement.listPendingInvitations).toHaveBeenCalled();
		});
	});

	it("should not show pagination footer when only one page of results", async () => {
		// With total: 2 and pageSize: 20, there's only one page
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Pagination footer should NOT be shown when there's only one page
		expect(screen.queryByTestId("page-size-select")).toBeNull();
	});

	it("should handle error when loading users", async () => {
		mockUserManagement.listActiveUsers.mockRejectedValueOnce(new Error("Network error"));

		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeDefined();
		});
	});

	it("should display empty state when no users", async () => {
		mockUserManagement.listActiveUsers.mockResolvedValueOnce({
			data: [],
			total: 0,
			canEditRoles: false,
			canManageUsers: false,
		});

		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText("No active users")).toBeDefined();
		});
	});
});

describe("Users - Actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock implementations after clearAllMocks
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: mockActiveUsers,
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.listPendingInvitations.mockResolvedValue({ data: mockPendingInvitations, total: 1 });
		mockUserManagement.listArchivedUsers.mockResolvedValue({ data: mockArchivedUsers, total: 1 });
		mockUserManagement.inviteUser.mockResolvedValue(mockPendingInvitations[0]);
		mockUserManagement.cancelInvitation.mockResolvedValue({ success: true });
		mockUserManagement.resendInvitation.mockResolvedValue(mockPendingInvitations[0]);
		mockUserManagement.updateUserRole.mockResolvedValue(mockActiveUsers[0]);
		mockUserManagement.archiveUser.mockResolvedValue({ success: true });
		mockUserManagement.getConfig.mockResolvedValue({ authorizedEmailPatterns: "*" });
		mockUserManagement.listRoles.mockResolvedValue([]);

		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
		// Mock window.confirm
		vi.spyOn(window, "confirm").mockReturnValue(true);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should cancel invitation when cancel button is clicked and confirmed", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Switch to pending tab
		await act(() => {
			fireEvent.click(screen.getByTestId("tab-pending"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("cancel-invitation-1")).toBeDefined();
		});

		// Click cancel button to open confirmation dialog
		await act(() => {
			fireEvent.click(screen.getByTestId("cancel-invitation-1"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("cancel-dialog-1")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("cancel-dialog-confirm-button"));
		});

		await waitFor(() => {
			expect(mockUserManagement.cancelInvitation).toHaveBeenCalledWith(1);
		});
	});

	it("should resend invitation when resend button is clicked and confirmed", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Switch to pending tab
		await act(() => {
			fireEvent.click(screen.getByTestId("tab-pending"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("resend-invitation-1")).toBeDefined();
		});

		// Click resend button to open confirmation dialog
		await act(() => {
			fireEvent.click(screen.getByTestId("resend-invitation-1"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("resend-dialog-1")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("resend-confirm-button"));
		});

		await waitFor(() => {
			expect(mockUserManagement.resendInvitation).toHaveBeenCalledWith(1);
		});
	});

	it("should archive user when deactivate option is clicked and confirmed", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (member, not owner)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Click deactivate option
		await waitFor(() => {
			expect(screen.getByTestId("deactivate-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("deactivate-user-2"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(mockUserManagement.deactivateUser).toHaveBeenCalledWith(2);
		});
	});

	it("should handle error when deactivating user fails", async () => {
		mockUserManagement.deactivateUser.mockRejectedValueOnce(new Error("Deactivate failed"));

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (member, not owner)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Click deactivate option
		await waitFor(() => {
			expect(screen.getByTestId("deactivate-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("deactivate-user-2"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(screen.getByText("Deactivate failed")).toBeDefined();
		});
	});

	it("should handle error when cancelling invitation fails", async () => {
		mockUserManagement.cancelInvitation.mockRejectedValueOnce(new Error("Cancel failed"));

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Switch to pending tab
		await act(() => {
			fireEvent.click(screen.getByTestId("tab-pending"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("cancel-invitation-1")).toBeDefined();
		});

		// Click cancel button to open confirmation dialog
		await act(() => {
			fireEvent.click(screen.getByTestId("cancel-invitation-1"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("cancel-dialog-1")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("cancel-dialog-confirm-button"));
		});

		await waitFor(() => {
			expect(screen.getByText("Cancel failed")).toBeDefined();
		});
	});

	it("should handle error when resending invitation fails", async () => {
		mockUserManagement.resendInvitation.mockRejectedValueOnce(new Error("Resend failed"));

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Switch to pending tab
		await act(() => {
			fireEvent.click(screen.getByTestId("tab-pending"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("resend-invitation-1")).toBeDefined();
		});

		// Click resend button to open confirmation dialog
		await act(() => {
			fireEvent.click(screen.getByTestId("resend-invitation-1"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("resend-dialog-1")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("resend-confirm-button"));
		});

		await waitFor(() => {
			expect(screen.getByText("Resend failed")).toBeDefined();
		});
	});

	it("should open Edit User dialog when Edit is clicked", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (member, not owner)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Wait for Edit menu item and click it
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-2")).toBeDefined();
		});
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-user-2"));
		});

		// Verify Edit User dialog opens with user data
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-dialog")).toBeDefined();
		});
	});

	it("should update user via Edit dialog successfully", async () => {
		mockUserManagement.updateUserRole.mockResolvedValue(mockActiveUsers[1]);

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (member, not owner)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Wait for Edit menu item and click it
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-2")).toBeDefined();
		});
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-user-2"));
		});

		// Verify Edit User dialog opens
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-dialog")).toBeDefined();
		});

		// Change role in the dialog
		const roleSelect = screen.getByTestId("edit-role-select") as HTMLSelectElement;
		await act(() => {
			roleSelect.value = "admin";
			roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
		});

		// Submit the form
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-submit-button"));
		});

		// Wait for the API call
		await waitFor(() => {
			expect(mockUserManagement.updateUserRole).toHaveBeenCalledWith(2, "admin");
		});
	});

	it("should update only user name when only name changes", async () => {
		mockUserManagement.updateUserName.mockResolvedValue(mockActiveUsers[1]);

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Wait for Edit menu item and click it
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-2")).toBeDefined();
		});
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-user-2"));
		});

		// Verify Edit User dialog opens
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-dialog")).toBeDefined();
		});

		// Change only the name in the dialog (leave role unchanged)
		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		await act(() => {
			fireEvent.change(nameInput, { target: { value: "Updated Name" } });
		});

		// Submit the form
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-submit-button"));
		});

		// Wait for the API call - should only call updateUserName, not updateUserRole
		await waitFor(() => {
			expect(mockUserManagement.updateUserName).toHaveBeenCalledWith(2, "Updated Name");
		});

		// updateUserRole should NOT be called since role didn't change
		expect(mockUserManagement.updateUserRole).not.toHaveBeenCalled();
	});

	it("should not call any API when neither name nor role changes", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Wait for Edit menu item and click it
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-2")).toBeDefined();
		});
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-user-2"));
		});

		// Verify Edit User dialog opens
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-dialog")).toBeDefined();
		});

		// Don't change anything, just submit
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-submit-button"));
		});

		// Wait a bit for any async operations
		await new Promise(resolve => setTimeout(resolve, 50));

		// Neither API should be called since nothing changed
		expect(mockUserManagement.updateUserName).not.toHaveBeenCalled();
		expect(mockUserManagement.updateUserRole).not.toHaveBeenCalled();
	});

	it("should update both name and role when both change", async () => {
		mockUserManagement.updateUserName.mockResolvedValue(mockActiveUsers[1]);
		mockUserManagement.updateUserRole.mockResolvedValue(mockActiveUsers[1]);

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Wait for Edit menu item and click it
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-2")).toBeDefined();
		});
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-user-2"));
		});

		// Verify Edit User dialog opens
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-dialog")).toBeDefined();
		});

		// Change both name and role
		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		await act(() => {
			fireEvent.change(nameInput, { target: { value: "New Name" } });
		});

		const roleSelect = screen.getByTestId("edit-role-select") as HTMLSelectElement;
		await act(() => {
			roleSelect.value = "admin";
			roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
		});

		// Submit the form
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-submit-button"));
		});

		// Wait for the API calls - should call both
		await waitFor(() => {
			expect(mockUserManagement.updateUserName).toHaveBeenCalledWith(2, "New Name");
			expect(mockUserManagement.updateUserRole).toHaveBeenCalledWith(2, "admin");
		});
	});

	it("should show role as read-only in Edit dialog when canEditRoles is false", async () => {
		// Mock listActiveUsers to return canEditRoles: false
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: mockActiveUsers,
			total: 2,
			canEditRoles: false,
			canManageUsers: true,
		});

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (member, not owner)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Wait for Edit menu item and click it
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-2")).toBeDefined();
		});
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-user-2"));
		});

		// Verify Edit User dialog opens
		await waitFor(() => {
			expect(screen.getByTestId("edit-user-dialog")).toBeDefined();
		});

		// Verify role is shown as read-only input (not as select)
		const roleInput = screen.getByTestId("edit-role-input") as HTMLInputElement;
		expect(roleInput).toBeDefined();
		expect(roleInput.disabled).toBe(true);
		// The select should not exist when canEditRoles is false
		expect(screen.queryByTestId("edit-role-select")).toBeNull();
	});

	it("should activate user successfully", async () => {
		// Create a deactivated user
		const deactivatedUser = { ...mockActiveUsers[1], isActive: false };
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: [mockActiveUsers[0], deactivatedUser],
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.activateUser.mockResolvedValue({ ...deactivatedUser, isActive: true });

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (deactivated member)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Click activate option
		await waitFor(() => {
			expect(screen.getByTestId("activate-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("activate-user-2"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(mockUserManagement.activateUser).toHaveBeenCalledWith(2);
		});
	});

	it("should delete user when delete option is clicked and confirmed", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (member, not owner)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Click delete option
		await waitFor(() => {
			expect(screen.getByTestId("delete-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("delete-user-2"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(mockUserManagement.archiveUser).toHaveBeenCalledWith(2);
		});
	});

	it("should handle error when deleting user fails", async () => {
		mockUserManagement.archiveUser.mockRejectedValueOnce(new Error("Archive failed"));

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (member, not owner)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Click delete option
		await waitFor(() => {
			expect(screen.getByTestId("delete-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("delete-user-2"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(screen.getByText("Archive failed")).toBeDefined();
		});
	});

	it("should handle error when activating user fails", async () => {
		// Create a deactivated user
		const deactivatedUser = { ...mockActiveUsers[1], isActive: false };
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: [mockActiveUsers[0], deactivatedUser],
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.activateUser.mockRejectedValueOnce(new Error("Activate failed"));

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Click the actions button for user2 (deactivated member)
		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		// Click activate option
		await waitFor(() => {
			expect(screen.getByTestId("activate-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("activate-user-2"));
		});

		// Wait for dialog to appear and click confirm
		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(screen.getByText("Activate failed")).toBeDefined();
		});
	});
});

describe("Users - Owner role display", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const ownerUser = {
			id: 1,
			email: "owner@example.com",
			name: "Owner User",
			role: "owner" as const,
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
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: [ownerUser],
			total: 1,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.getConfig.mockResolvedValue({ authorizedEmailPatterns: "*" });
		mockUserManagement.listRoles.mockResolvedValue([]);

		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	it("should display Owner role label for owner users", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByTestId("role-owner")).toBeDefined();
			expect(screen.getByText("Owner")).toBeDefined();
		});
	});
});

describe("Users - Role label from loaded roles", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock implementations after clearAllMocks
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: mockActiveUsers,
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.listPendingInvitations.mockResolvedValue({ data: mockPendingInvitations, total: 1 });
		mockUserManagement.listArchivedUsers.mockResolvedValue({ data: mockArchivedUsers, total: 1 });
		mockUserManagement.getConfig.mockResolvedValue({ authorizedEmailPatterns: "*" });
		// Mock roles with custom names
		mockUserManagement.listRoles.mockResolvedValue([
			{ id: 1, slug: "admin", name: "Administrator", description: "Admin role" },
			{ id: 2, slug: "member", name: "Team Member", description: "Member role" },
		]);

		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	it("should display role label from loaded roles when available", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		// Switch to pending tab where role is always displayed as a badge
		await act(() => {
			fireEvent.click(screen.getByTestId("tab-pending"));
		});

		// Wait for pending invitations to load and display custom role labels
		// mockPendingInvitations[0] has role "member" which should display as "Team Member" from loaded roles
		await waitFor(() => {
			expect(screen.getByText("Team Member")).toBeDefined();
		});
	});
});

describe("Users - Error handling with non-Error objects", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: mockActiveUsers,
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.getConfig.mockResolvedValue({ authorizedEmailPatterns: "*" });
		mockUserManagement.listRoles.mockResolvedValue([]);

		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
		vi.spyOn(window, "confirm").mockReturnValue(true);
	});

	it("should show fallback error message when deactivate throws non-Error object", async () => {
		mockUserManagement.deactivateUser.mockRejectedValueOnce("string error");

		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("deactivate-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("deactivate-user-2"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(screen.getByText("Failed to deactivate user")).toBeDefined();
		});
	});

	it("should show fallback error message when activate throws non-Error object", async () => {
		const deactivatedUser = { ...mockActiveUsers[1], isActive: false };
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: [mockActiveUsers[0], deactivatedUser],
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.activateUser.mockRejectedValueOnce("string error");

		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("activate-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("activate-user-2"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(screen.getByText("Failed to activate user")).toBeDefined();
		});
	});

	it("should show fallback error message when archive throws non-Error object", async () => {
		mockUserManagement.archiveUser.mockRejectedValueOnce("string error");

		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("actions-2"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("delete-user-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("delete-user-2"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("action-dialog-2")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("action-confirm-button"));
		});

		await waitFor(() => {
			expect(screen.getByText("Failed to archive user")).toBeDefined();
		});
	});
});

describe("Users - User with null name", () => {
	const userWithNullName = {
		id: 3,
		email: "nullname@example.com",
		name: null,
		role: "member" as const,
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

	beforeEach(() => {
		vi.clearAllMocks();
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: [mockActiveUsers[0], userWithNullName],
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.getConfig.mockResolvedValue({ authorizedEmailPatterns: "*" });
		mockUserManagement.listRoles.mockResolvedValue([]);
		mockUserManagement.updateUserName.mockResolvedValue(userWithNullName);

		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	it("should handle editing a user with null name and adding a name", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText("nullname@example.com")).toBeDefined();
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("actions-3"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("edit-user-3")).toBeDefined();
		});
		await act(() => {
			fireEvent.click(screen.getByTestId("edit-user-3"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("edit-user-dialog")).toBeDefined();
		});

		const nameInput = screen.getByTestId("edit-name-input") as HTMLInputElement;
		await act(() => {
			fireEvent.change(nameInput, { target: { value: "New Name" } });
		});

		await act(() => {
			fireEvent.click(screen.getByTestId("edit-submit-button"));
		});

		await waitFor(() => {
			expect(mockUserManagement.updateUserName).toHaveBeenCalledWith(3, "New Name");
		});
	});
});

describe("Users - Config and roles loading errors", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: mockActiveUsers,
			total: 2,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.listPendingInvitations.mockResolvedValue({ data: mockPendingInvitations, total: 1 });
		mockUserManagement.listArchivedUsers.mockResolvedValue({ data: mockArchivedUsers, total: 1 });

		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	it("should handle config loading failure gracefully", async () => {
		mockUserManagement.getConfig.mockRejectedValue(new Error("Config load failed"));
		mockUserManagement.listRoles.mockResolvedValue([]);

		renderWithProviders(<Users currentUserId={1} />);

		// Component should still render despite config error
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});
	});

	it("should handle roles loading failure gracefully", async () => {
		mockUserManagement.getConfig.mockResolvedValue({ authorizedEmailPatterns: "*" });
		mockUserManagement.listRoles.mockRejectedValue(new Error("Roles load failed"));

		renderWithProviders(<Users currentUserId={1} />);

		// Component should still render despite roles error
		await waitFor(() => {
			expect(screen.getByText("user1@example.com")).toBeDefined();
		});
	});
});

describe("Users - Pagination", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Create 30 users to trigger pagination
		const manyUsers = Array.from({ length: 30 }, (_, i) => ({
			id: i + 1,
			email: `user${i + 1}@example.com`,
			name: `User ${i + 1}`,
			role: "member" as const,
			isActive: true,
			image: null,
			jobTitle: null,
			phone: null,
			language: "en",
			timezone: "UTC",
			location: null,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
		}));
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: manyUsers.slice(0, 20),
			total: 30,
			canEditRoles: true,
			canManageUsers: true,
		});
		mockUserManagement.getConfig.mockResolvedValue({ authorizedEmailPatterns: "*" });
		mockUserManagement.listRoles.mockResolvedValue([]);

		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	it("should render pagination when there are multiple pages", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			// Should show pagination info
			expect(screen.getByText(/Showing 1-20 of 30/)).toBeDefined();
		});

		// Should have page navigation buttons (Pagination component renders buttons with aria-label "Page N")
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Page 2" })).toBeDefined();
		});
	});

	it("should handle page change", async () => {
		renderWithProviders(<Users currentUserId={1} />);

		await waitFor(() => {
			expect(screen.getByText(/Showing 1-20 of 30/)).toBeDefined();
		});

		// Find and click page 2 button (aria-label is "Page 2")
		const page2Button = screen.getByRole("button", { name: "Page 2" });
		expect(page2Button).toBeDefined();

		await act(() => {
			fireEvent.click(page2Button);
		});

		// Wait for API call with offset for page 2
		await waitFor(() => {
			expect(mockUserManagement.listActiveUsers).toHaveBeenCalledWith(20, 20);
		});
	});

	it("should change page size", async () => {
		// Create 30 users to trigger pagination
		const manyUsers = Array.from({ length: 30 }, (_, i) => ({
			id: i + 1,
			email: `user${i + 1}@example.com`,
			name: `User ${i + 1}`,
			role: "member" as const,
			isActive: true,
			image: null,
			jobTitle: null,
			phone: null,
			language: "en",
			timezone: "UTC",
			location: null,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
		}));

		renderWithProviders(<Users currentUserId={1} />);

		// Wait for initial data to load with default page size
		await waitFor(() => {
			expect(screen.getByText(/Showing 1-20 of 30/)).toBeDefined();
		});

		// Verify initial call was made with default page size
		expect(mockUserManagement.listActiveUsers).toHaveBeenCalledWith(20, 0);

		// Setup mock to return data with new page size
		mockUserManagement.listActiveUsers.mockResolvedValue({
			data: manyUsers.slice(0, 50),
			total: 30,
			canEditRoles: true,
			canManageUsers: true,
		});

		// Get the select and verify initial value
		const pageSizeSelect = screen.getByTestId("page-size-select") as HTMLSelectElement;
		expect(pageSizeSelect.value).toBe("20");

		// Change page size to 50 using native event dispatch (works better with preact)
		await act(() => {
			pageSizeSelect.value = "50";
			pageSizeSelect.dispatchEvent(new Event("change", { bubbles: true }));
		});

		// Wait for the API call with new page size (should reset to page 1)
		await waitFor(() => {
			expect(mockUserManagement.listActiveUsers).toHaveBeenCalledWith(50, 0);
		});
	});
});
