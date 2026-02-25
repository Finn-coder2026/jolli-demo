import type { ClientAuth } from "./Client";
import { createRoleClient } from "./RoleClient";
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

describe("RoleClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all methods", () => {
		const client = createRoleClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.listRoles).toBeDefined();
		expect(client.getRole).toBeDefined();
		expect(client.cloneRole).toBeDefined();
		expect(client.updateRole).toBeDefined();
		expect(client.deleteRole).toBeDefined();
		expect(client.setRolePermissions).toBeDefined();
		expect(client.listPermissions).toBeDefined();
		expect(client.listPermissionsGrouped).toBeDefined();
		expect(client.getCurrentUserPermissions).toBeDefined();
	});

	describe("listRoles", () => {
		it("should list all roles", async () => {
			const mockResponse = [
				{ id: 1, name: "Owner", slug: "owner", priority: 100, isCustom: false },
				{ id: 2, name: "Admin", slug: "admin", priority: 80, isCustom: false },
			];
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createRoleClient("", createMockAuth());
			const result = await client.listRoles();

			expect(global.fetch).toHaveBeenCalledWith("/api/roles", {
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

			const client = createRoleClient("", createMockAuth());
			await expect(client.listRoles()).rejects.toThrow("Failed to list roles: Internal Server Error");
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => [],
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.listRoles();

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("getRole", () => {
		it("should get a role by id", async () => {
			const mockResponse = {
				id: 1,
				name: "Owner",
				slug: "owner",
				priority: 100,
				isCustom: false,
				permissions: [{ id: 1, name: "manage_users", category: "users" }],
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createRoleClient("", createMockAuth());
			const result = await client.getRole(1);

			expect(global.fetch).toHaveBeenCalledWith("/api/roles/1", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw 'Role not found' for 404 response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.getRole(999)).rejects.toThrow("Role not found");
		});

		it("should throw error on other failures", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.getRole(1)).rejects.toThrow("Failed to get role: Internal Server Error");
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => ({ id: 1 }),
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.getRole(1);

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("cloneRole", () => {
		it("should clone a role", async () => {
			const mockResponse = {
				id: 5,
				name: "Custom Admin",
				slug: "custom-admin",
				priority: 75,
				isCustom: true,
				permissions: [],
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createRoleClient("", createMockAuth());
			const result = await client.cloneRole(2, { name: "Custom Admin" });

			expect(global.fetch).toHaveBeenCalledWith("/api/roles/2/clone", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ name: "Custom Admin" }),
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error with message from response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Conflict",
				json: async () => ({ error: "Role with this name already exists" }),
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.cloneRole(1, { name: "Duplicate" })).rejects.toThrow(
				"Role with this name already exists",
			);
		});

		it("should throw fallback error when response has no error message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
				json: async () => ({}),
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.cloneRole(1, { name: "Test" })).rejects.toThrow("Failed to clone role: Bad Request");
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => ({ id: 5 }),
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.cloneRole(1, { name: "Clone" });

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("updateRole", () => {
		it("should update a role", async () => {
			const mockResponse = {
				id: 5,
				name: "Updated Name",
				slug: "updated-name",
				priority: 75,
				isCustom: true,
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createRoleClient("", createMockAuth());
			const result = await client.updateRole(5, { name: "Updated Name" });

			expect(global.fetch).toHaveBeenCalledWith("/api/roles/5", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ name: "Updated Name" }),
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error with message from response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
				json: async () => ({ error: "Cannot update built-in role" }),
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.updateRole(1, { name: "Hacked" })).rejects.toThrow("Cannot update built-in role");
		});

		it("should throw fallback error when response has no error message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
				json: async () => ({}),
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.updateRole(999, { name: "Test" })).rejects.toThrow("Failed to update role: Not Found");
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => ({ id: 5 }),
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.updateRole(5, { name: "New Name" });

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("deleteRole", () => {
		it("should delete a role", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createRoleClient("", createMockAuth());
			await client.deleteRole(5);

			expect(global.fetch).toHaveBeenCalledWith("/api/roles/5", {
				method: "DELETE",
				headers: {},
				credentials: "include",
				body: null,
			});
		});

		it("should throw error with message from response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
				json: async () => ({ error: "Cannot delete built-in role" }),
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.deleteRole(1)).rejects.toThrow("Cannot delete built-in role");
		});

		it("should throw fallback error when response has no error message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
				json: async () => ({}),
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.deleteRole(999)).rejects.toThrow("Failed to delete role: Not Found");
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.deleteRole(5);

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("setRolePermissions", () => {
		it("should set role permissions", async () => {
			const mockResponse = {
				id: 5,
				name: "Custom Role",
				slug: "custom-role",
				priority: 75,
				isCustom: true,
				permissions: [
					{ id: 1, name: "users.view", category: "users" },
					{ id: 2, name: "users.edit", category: "users" },
				],
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createRoleClient("", createMockAuth());
			const result = await client.setRolePermissions(5, ["users.view", "users.edit"]);

			expect(global.fetch).toHaveBeenCalledWith("/api/roles/5/permissions", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ permissionSlugs: ["users.view", "users.edit"] }),
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error with message from response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
				json: async () => ({ error: "Cannot modify permissions of built-in role" }),
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.setRolePermissions(1, ["users.view", "users.edit"])).rejects.toThrow(
				"Cannot modify permissions of built-in role",
			);
		});

		it("should throw fallback error when response has no error message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
				json: async () => ({}),
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.setRolePermissions(999, ["spaces.view"])).rejects.toThrow(
				"Failed to set role permissions: Not Found",
			);
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => ({ id: 5, permissions: [] }),
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.setRolePermissions(5, ["users.view", "users.edit", "spaces.view"]);

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("listPermissions", () => {
		it("should list all permissions", async () => {
			const mockResponse = [
				{ id: 1, name: "view_docs", category: "docs", description: "View documents" },
				{ id: 2, name: "edit_docs", category: "docs", description: "Edit documents" },
			];
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createRoleClient("", createMockAuth());
			const result = await client.listPermissions();

			expect(global.fetch).toHaveBeenCalledWith("/api/roles/permissions", {
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

			const client = createRoleClient("", createMockAuth());
			await expect(client.listPermissions()).rejects.toThrow("Failed to list permissions: Internal Server Error");
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => [],
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.listPermissions();

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("listPermissionsGrouped", () => {
		it("should list permissions grouped by category", async () => {
			const mockResponse = {
				docs: [
					{ id: 1, name: "view_docs", category: "docs", description: "View documents" },
					{ id: 2, name: "edit_docs", category: "docs", description: "Edit documents" },
				],
				users: [{ id: 3, name: "manage_users", category: "users", description: "Manage users" }],
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createRoleClient("", createMockAuth());
			const result = await client.listPermissionsGrouped();

			expect(global.fetch).toHaveBeenCalledWith("/api/roles/permissions/grouped", {
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

			const client = createRoleClient("", createMockAuth());
			await expect(client.listPermissionsGrouped()).rejects.toThrow(
				"Failed to list grouped permissions: Internal Server Error",
			);
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => ({}),
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.listPermissionsGrouped();

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});

	describe("getCurrentUserPermissions", () => {
		it("should get current user permissions", async () => {
			const mockResponse = {
				permissions: ["view_docs", "edit_docs", "manage_users"],
				role: { id: 2, name: "Admin", slug: "admin" },
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createRoleClient("", createMockAuth());
			const result = await client.getCurrentUserPermissions();

			expect(global.fetch).toHaveBeenCalledWith("/api/roles/me/permissions", {
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
				statusText: "Unauthorized",
			});

			const client = createRoleClient("", createMockAuth());
			await expect(client.getCurrentUserPermissions()).rejects.toThrow(
				"Failed to get current user permissions: Unauthorized",
			);
		});

		it("should call checkUnauthorized when provided", async () => {
			const mockCheckUnauthorized = vi.fn();
			const fetchResponse = {
				ok: true,
				json: async () => ({ permissions: [], role: null }),
			};
			global.fetch = vi.fn().mockResolvedValue(fetchResponse);

			const client = createRoleClient("", createMockAuth(mockCheckUnauthorized));
			await client.getCurrentUserPermissions();

			expect(mockCheckUnauthorized).toHaveBeenCalledWith(fetchResponse);
		});
	});
});
