import type { ClientAuth } from "./Client";
import { createUserManagementClient } from "./UserManagementClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockAuth(checkUnauthorized?: (response: Response) => boolean): ClientAuth {
	const auth: ClientAuth = {
		createRequest: (method, body, additional) => {
			const headers: Record<string, string> = {};
			if (body) {
				headers["Content-Type"] = "application/json";
			}

			return {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
				...additional,
			};
		},
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

describe("UserManagementClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all methods", () => {
		const client = createUserManagementClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.getConfig).toBeDefined();
		expect(client.listRoles).toBeDefined();
		expect(client.listActiveUsers).toBeDefined();
		expect(client.listPendingInvitations).toBeDefined();
		expect(client.listArchivedUsers).toBeDefined();
		expect(client.inviteUser).toBeDefined();
		expect(client.cancelInvitation).toBeDefined();
		expect(client.resendInvitation).toBeDefined();
		expect(client.updateUserRole).toBeDefined();
		expect(client.archiveUser).toBeDefined();
	});

	describe("getConfig", () => {
		it("should get user management config", async () => {
			const mockResponse = { authorizedEmailPatterns: "@example\\.com$" };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.getConfig();

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/config", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error on failure", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
			});

			const client = createUserManagementClient("", createMockAuth());
			await expect(client.getConfig()).rejects.toThrow("Failed to get user management config: Forbidden");
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockResponse = { authorizedEmailPatterns: "*" };
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => mockResponse,
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createUserManagementClient("", createMockAuth(mockCheckUnauthorized));
			await client.getConfig();

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("listRoles", () => {
		it("should list all roles", async () => {
			const mockResponse = [
				{ id: 1, name: "Owner", slug: "owner", priority: 100 },
				{ id: 2, name: "Admin", slug: "admin", priority: 80 },
				{ id: 3, name: "Member", slug: "member", priority: 50 },
			];
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.listRoles();

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/roles", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error on failure", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createUserManagementClient("", createMockAuth());
			await expect(client.listRoles()).rejects.toThrow("Failed to list roles: Internal Server Error");
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => [],
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createUserManagementClient("", createMockAuth(mockCheckUnauthorized));
			await client.listRoles();

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("listActiveUsers", () => {
		it("should list active users without pagination", async () => {
			const mockResponse = {
				data: [{ id: 1, email: "user@example.com", role: "member" }],
				total: 1,
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.listActiveUsers();

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/active", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should list active users with pagination", async () => {
			const mockResponse = { data: [], total: 0 };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			await client.listActiveUsers(20, 40);

			expect(global.fetch).toHaveBeenCalledWith(
				"/api/user-management/active?limit=20&offset=40",
				expect.anything(),
			);
		});

		it("should throw error when listing fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.listActiveUsers()).rejects.toThrow(
				"Failed to list active users: Internal Server Error",
			);
		});

		it("should return empty result for 404 response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.listActiveUsers();

			expect(result).toEqual({ data: [], total: 0, canEditRoles: false, canManageUsers: false });
		});
	});

	describe("listPendingInvitations", () => {
		it("should list pending invitations without pagination", async () => {
			const mockResponse = {
				data: [{ id: 1, email: "invite@example.com", status: "pending" }],
				total: 1,
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.listPendingInvitations();

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/pending", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should list pending invitations with pagination", async () => {
			const mockResponse = { data: [], total: 0 };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			await client.listPendingInvitations(10, 20);

			expect(global.fetch).toHaveBeenCalledWith(
				"/api/user-management/pending?limit=10&offset=20",
				expect.anything(),
			);
		});

		it("should throw error when listing fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.listPendingInvitations()).rejects.toThrow(
				"Failed to list pending invitations: Internal Server Error",
			);
		});

		it("should return empty result for 404 response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.listPendingInvitations();

			expect(result).toEqual({ data: [], total: 0 });
		});
	});

	describe("listArchivedUsers", () => {
		it("should list archived users without pagination", async () => {
			const mockResponse = {
				data: [{ id: 1, userId: 10, email: "archived@example.com" }],
				total: 1,
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.listArchivedUsers();

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/archived", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should list archived users with pagination", async () => {
			const mockResponse = { data: [], total: 0 };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			await client.listArchivedUsers(50, 100);

			expect(global.fetch).toHaveBeenCalledWith(
				"/api/user-management/archived?limit=50&offset=100",
				expect.anything(),
			);
		});

		it("should throw error when listing fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.listArchivedUsers()).rejects.toThrow(
				"Failed to list archived users: Internal Server Error",
			);
		});

		it("should return empty result for 404 response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.listArchivedUsers();

			expect(result).toEqual({ data: [], total: 0 });
		});
	});

	describe("inviteUser", () => {
		it("should invite a user", async () => {
			const mockInvitation = {
				id: 1,
				email: "new@example.com",
				role: "member",
				status: "pending",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockInvitation,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.inviteUser({ email: "new@example.com", role: "member" });

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/invite", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email: "new@example.com", role: "member" }),
			});
			expect(result).toEqual(mockInvitation);
		});

		it("should invite a user with name", async () => {
			const mockInvitation = {
				id: 1,
				email: "new@example.com",
				name: "John Doe",
				role: "admin",
				status: "pending",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockInvitation,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.inviteUser({
				email: "new@example.com",
				name: "John Doe",
				role: "admin",
			});

			expect(result).toEqual(mockInvitation);
		});

		it("should throw error with message from response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Conflict",
				json: async () => ({ error: "User with this email already exists" }),
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.inviteUser({ email: "existing@example.com", role: "member" })).rejects.toThrow(
				"User with this email already exists",
			);
		});

		it("should throw fallback error when response has no error message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
				json: async () => ({}),
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.inviteUser({ email: "test@example.com", role: "member" })).rejects.toThrow(
				"Failed to invite user: Bad Request",
			);
		});
	});

	describe("cancelInvitation", () => {
		it("should cancel an invitation", async () => {
			const mockResponse = { success: true };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.cancelInvitation(1);

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/invitation/1", {
				method: "DELETE",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when cancellation fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.cancelInvitation(999)).rejects.toThrow("Failed to cancel invitation: Not Found");
		});
	});

	describe("resendInvitation", () => {
		it("should resend an invitation", async () => {
			const mockInvitation = {
				id: 2,
				email: "user@example.com",
				role: "member",
				status: "pending",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockInvitation,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.resendInvitation(1);

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/invitation/1/resend", {
				method: "POST",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockInvitation);
		});

		it("should throw error when resend fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.resendInvitation(999)).rejects.toThrow("Failed to resend invitation: Not Found");
		});
	});

	describe("updateUserRole", () => {
		it("should update a user role", async () => {
			const mockUser = {
				id: 1,
				email: "user@example.com",
				role: "admin",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUser,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.updateUserRole(1, "admin");

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/user/1/role", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ role: "admin" }),
			});
			expect(result).toEqual(mockUser);
		});

		it("should throw error when update fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.updateUserRole(999, "admin")).rejects.toThrow("Failed to update user role: Not Found");
		});
	});

	describe("updateUserName", () => {
		it("should update a user name", async () => {
			const mockUser = {
				id: 1,
				email: "user@example.com",
				name: "New Name",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUser,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.updateUserName(1, "New Name");

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/user/1/name", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ name: "New Name" }),
			});
			expect(result).toEqual(mockUser);
		});

		it("should throw error when update fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.updateUserName(999, "New Name")).rejects.toThrow(
				"Failed to update user name: Not Found",
			);
		});
	});

	describe("deactivateUser", () => {
		it("should deactivate a user successfully", async () => {
			const mockUser = {
				id: 1,
				email: "test@example.com",
				role: "member",
				roleId: 1,
				isActive: false,
				name: "Test User",
				image: null,
				jobTitle: null,
				phone: null,
				language: "en",
				timezone: "UTC",
				location: null,
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUser,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.deactivateUser(1);

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/user/1/deactivate", {
				method: "PUT",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockUser);
		});

		it("should throw error when deactivation fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.deactivateUser(999)).rejects.toThrow("Failed to deactivate user: Not Found");
		});
	});

	describe("activateUser", () => {
		it("should activate a user successfully", async () => {
			const mockUser = {
				id: 1,
				email: "test@example.com",
				role: "member",
				roleId: 1,
				isActive: true,
				name: "Test User",
				image: null,
				jobTitle: null,
				phone: null,
				language: "en",
				timezone: "UTC",
				location: null,
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUser,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.activateUser(1);

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/user/1/activate", {
				method: "PUT",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockUser);
		});

		it("should throw error when activation fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.activateUser(999)).rejects.toThrow("Failed to activate user: Not Found");
		});
	});

	describe("archiveUser", () => {
		it("should archive a user without reason", async () => {
			const mockResponse = { success: true };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.archiveUser(1);

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/user/1", {
				method: "DELETE",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should archive a user with reason", async () => {
			const mockResponse = { success: true };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createUserManagementClient("", createMockAuth());
			const result = await client.archiveUser(1, "Left the company");

			expect(global.fetch).toHaveBeenCalledWith("/api/user-management/user/1", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ reason: "Left the company" }),
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when archive fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createUserManagementClient("", createMockAuth());

			await expect(client.archiveUser(999)).rejects.toThrow("Failed to archive user: Not Found");
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for listActiveUsers", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ data: [], total: 0 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.listActiveUsers();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for listPendingInvitations", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ data: [], total: 0 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.listPendingInvitations();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for listArchivedUsers", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ data: [], total: 0 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.listArchivedUsers();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for inviteUser", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.inviteUser({ email: "test@example.com", role: "member" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for cancelInvitation", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.cancelInvitation(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for resendInvitation", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.resendInvitation(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for updateUserRole", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.updateUserRole(1, "admin");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for updateUserName", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.updateUserName(1, "New Name");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for archiveUser", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.archiveUser(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for deactivateUser", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1, isActive: false }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.deactivateUser(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for activateUser", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1, isActive: true }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createUserManagementClient("", createMockAuth(checkUnauthorized));
			await client.activateUser(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
