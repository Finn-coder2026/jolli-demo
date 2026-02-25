import { createMockClient, renderHookWithProviders } from "../test/TestUtils";
import { useHasAnyPermission, useHasPermission, usePermissions } from "./PermissionContext";
import { renderHook, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PermissionContext", () => {
	let mockGetCurrentUserPermissions: ReturnType<typeof vi.fn>;

	const mockPermissionsResponse = {
		role: {
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
			permissions: [],
		},
		permissions: ["users.view", "users.edit", "sites.view"],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetCurrentUserPermissions = vi.fn().mockResolvedValue(mockPermissionsResponse);
	});

	function createClientWithPermissions(getCurrentUserPermissions = mockGetCurrentUserPermissions) {
		return createMockClient({
			roles: vi.fn(() => ({
				listRoles: vi.fn().mockResolvedValue([]),
				getRole: vi.fn().mockResolvedValue(null),
				cloneRole: vi.fn().mockResolvedValue(null),
				updateRole: vi.fn().mockResolvedValue(null),
				deleteRole: vi.fn().mockResolvedValue(undefined),
				setRolePermissions: vi.fn().mockResolvedValue(null),
				listPermissions: vi.fn().mockResolvedValue([]),
				listPermissionsGrouped: vi.fn().mockResolvedValue({}),
				getCurrentUserPermissions,
			})),
		});
	}

	describe("PermissionProvider", () => {
		it("should load permissions on mount", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.permissions).toEqual(["users.view", "users.edit", "sites.view"]);
			expect(result.current.role).toEqual(mockPermissionsResponse.role);
			expect(result.current.error).toBeUndefined();
		});

		it("should handle error when loading permissions fails with Error instance", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
				// Intentionally empty - suppress console.error during test
			});
			const mockError = new Error("Failed to load permissions");
			const client = createClientWithPermissions(vi.fn().mockRejectedValue(mockError));

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.permissions).toEqual([]);
			expect(result.current.role).toBeNull();
			expect(result.current.error).toBe("Failed to load permissions");
			expect(consoleSpy).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it("should handle error when loading permissions fails with non-Error value", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
				// Intentionally empty - suppress console.error during test
			});
			const client = createClientWithPermissions(vi.fn().mockRejectedValue("Network error"));

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.permissions).toEqual([]);
			expect(result.current.role).toBeNull();
			expect(result.current.error).toBe("Failed to load permissions");

			consoleSpy.mockRestore();
		});

		it("should refresh permissions when refresh is called", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Update mock to return different permissions
			mockGetCurrentUserPermissions.mockResolvedValueOnce({
				...mockPermissionsResponse,
				permissions: ["users.view", "users.edit", "sites.view", "roles.edit"],
			});

			await result.current.refresh();

			await waitFor(() => {
				expect(result.current.permissions).toContain("roles.edit");
			});
		});
	});

	describe("usePermissions", () => {
		it("should throw error when used outside of PermissionProvider", () => {
			// Suppress console.error for this test as we expect an error
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
				// Intentionally empty - suppress console.error during test
			});

			expect(() => {
				renderHook(() => usePermissions());
			}).toThrow("usePermissions must be used within a PermissionProvider");

			consoleSpy.mockRestore();
		});
	});

	describe("hasPermission", () => {
		it("should return true when user has the permission", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.hasPermission("users.view")).toBe(true);
		});

		it("should return false when user does not have the permission", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.hasPermission("users.delete")).toBe(false);
		});
	});

	describe("hasAnyPermission", () => {
		it("should return true when user has any of the permissions", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.hasAnyPermission("users.delete", "users.view")).toBe(true);
		});

		it("should return false when user has none of the permissions", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.hasAnyPermission("users.delete", "roles.edit")).toBe(false);
		});
	});

	describe("hasAllPermissions", () => {
		it("should return true when user has all of the permissions", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.hasAllPermissions("users.view", "users.edit")).toBe(true);
		});

		it("should return false when user is missing any of the permissions", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => usePermissions(), {
				client,
			});

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.hasAllPermissions("users.view", "users.delete")).toBe(false);
		});
	});

	describe("useHasPermission", () => {
		it("should return true when user has the permission", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => useHasPermission("users.view"), {
				client,
			});

			await waitFor(() => {
				expect(result.current).toBe(true);
			});
		});

		it("should return false when user does not have the permission", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => useHasPermission("users.delete"), {
				client,
			});

			// Initially loading, wait for permissions to load
			await waitFor(() => {
				// After loading, check the result
				expect(result.current).toBe(false);
			});
		});
	});

	describe("useHasAnyPermission", () => {
		it("should return true when user has any of the permissions", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => useHasAnyPermission("users.delete", "users.view"), {
				client,
			});

			await waitFor(() => {
				expect(result.current).toBe(true);
			});
		});

		it("should return false when user has none of the permissions", async () => {
			const client = createClientWithPermissions();

			const { result } = renderHookWithProviders(() => useHasAnyPermission("users.delete", "roles.edit"), {
				client,
			});

			await waitFor(() => {
				expect(result.current).toBe(false);
			});
		});
	});
});
