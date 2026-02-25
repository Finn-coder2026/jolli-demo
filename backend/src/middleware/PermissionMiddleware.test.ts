import type { PermissionService } from "../services/PermissionService";
import type { TokenUtil } from "../util/TokenUtil";
import {
	type AuthenticatedRequest,
	createPermissionMiddleware,
	type PermissionMiddlewareDependencies,
} from "./PermissionMiddleware";
import type { NextFunction, Request, Response } from "express";
import type { UserInfo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PermissionMiddleware", () => {
	let mockTokenUtil: TokenUtil<UserInfo>;
	let mockPermissionService: PermissionService;
	let mockRequest: Partial<AuthenticatedRequest>;
	let mockResponse: Partial<Response>;
	let mockNext: NextFunction;
	let middleware: ReturnType<typeof createPermissionMiddleware>;

	const mockUser: UserInfo = {
		userId: 123,
		email: "test@example.com",
		name: "Test User",
		picture: undefined,
	};

	beforeEach(() => {
		mockTokenUtil = {
			decodePayload: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		mockPermissionService = {
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			getUserPermissions: vi.fn(),
			getUserRole: vi.fn(),
		} as unknown as PermissionService;

		mockRequest = {};
		mockResponse = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn(),
		};
		mockNext = vi.fn();

		const deps: PermissionMiddlewareDependencies = {
			tokenUtil: mockTokenUtil,
			permissionService: mockPermissionService,
		};
		middleware = createPermissionMiddleware(deps);
	});

	describe("requireAuth", () => {
		it("should authenticate user and call next", () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);

			const handler = middleware.requireAuth();
			handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.decodePayload).toHaveBeenCalledWith(mockRequest);
			expect(mockRequest.user).toBe(mockUser);
			expect(mockNext).toHaveBeenCalled();
			expect(mockResponse.status).not.toHaveBeenCalled();
		});

		it("should return 401 when user is not authenticated", () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const handler = middleware.requireAuth();
			handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.json).toHaveBeenCalledWith({ error: "Authentication required" });
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should return 401 when token decode throws error", () => {
			vi.mocked(mockTokenUtil.decodePayload).mockImplementation(() => {
				throw new Error("Invalid token");
			});

			const handler = middleware.requireAuth();
			handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.json).toHaveBeenCalledWith({ error: "Authentication failed" });
			expect(mockNext).not.toHaveBeenCalled();
		});
	});

	describe("requirePermission", () => {
		it("should allow access when user has required permission", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.hasAnyPermission).mockResolvedValue(true);
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["users.view"]);

			const handler = middleware.requirePermission("users.view");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockPermissionService.hasAnyPermission).toHaveBeenCalledWith(mockUser.userId, ["users.view"]);
			expect(mockRequest.user).toBe(mockUser);
			expect(mockRequest.userPermissions).toEqual(["users.view"]);
			expect(mockNext).toHaveBeenCalled();
			expect(mockResponse.status).not.toHaveBeenCalled();
		});

		it("should allow access when user has any of the required permissions", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.hasAnyPermission).mockResolvedValue(true);
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["users.view", "users.edit"]);

			const handler = middleware.requirePermission("users.view", "users.edit");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockPermissionService.hasAnyPermission).toHaveBeenCalledWith(mockUser.userId, [
				"users.view",
				"users.edit",
			]);
			expect(mockNext).toHaveBeenCalled();
		});

		it("should deny access when user lacks required permission", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.hasAnyPermission).mockResolvedValue(false);

			const handler = middleware.requirePermission("roles.edit");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
			expect(mockResponse.json).toHaveBeenCalledWith({
				error: "Forbidden",
				message: "You do not have permission to perform this action",
				requiredPermissions: ["roles.edit"],
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should return 401 when user is not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const handler = middleware.requirePermission("users.view");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.json).toHaveBeenCalledWith({ error: "Authentication required" });
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should use existing user from request if available", async () => {
			mockRequest.user = mockUser;
			vi.mocked(mockPermissionService.hasAnyPermission).mockResolvedValue(true);
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["users.view"]);

			const handler = middleware.requirePermission("users.view");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.decodePayload).not.toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should return 500 when permission check fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.hasAnyPermission).mockRejectedValue(new Error("Database error"));

			const handler = middleware.requirePermission("users.view");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(500);
			expect(mockResponse.json).toHaveBeenCalledWith({ error: "Permission check failed" });
			expect(mockNext).not.toHaveBeenCalled();
		});
	});

	describe("requireAllPermissions", () => {
		it("should allow access when user has all required permissions", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.hasAllPermissions).mockResolvedValue(true);
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["users.view", "users.edit"]);

			const handler = middleware.requireAllPermissions("users.view", "users.edit");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockPermissionService.hasAllPermissions).toHaveBeenCalledWith(mockUser.userId, [
				"users.view",
				"users.edit",
			]);
			expect(mockRequest.user).toBe(mockUser);
			expect(mockRequest.userPermissions).toEqual(["users.view", "users.edit"]);
			expect(mockNext).toHaveBeenCalled();
			expect(mockResponse.status).not.toHaveBeenCalled();
		});

		it("should deny access when user lacks any required permission", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.hasAllPermissions).mockResolvedValue(false);

			const handler = middleware.requireAllPermissions("users.view", "roles.edit");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
			expect(mockResponse.json).toHaveBeenCalledWith({
				error: "Forbidden",
				message: "You do not have permission to perform this action",
				requiredPermissions: ["users.view", "roles.edit"],
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should return 401 when user is not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const handler = middleware.requireAllPermissions("users.view");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.json).toHaveBeenCalledWith({ error: "Authentication required" });
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should use existing user from request if available", async () => {
			mockRequest.user = mockUser;
			vi.mocked(mockPermissionService.hasAllPermissions).mockResolvedValue(true);
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["users.view"]);

			const handler = middleware.requireAllPermissions("users.view");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.decodePayload).not.toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should return 500 when permission check fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.hasAllPermissions).mockRejectedValue(new Error("Database error"));

			const handler = middleware.requireAllPermissions("users.view");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(500);
			expect(mockResponse.json).toHaveBeenCalledWith({ error: "Permission check failed" });
			expect(mockNext).not.toHaveBeenCalled();
		});
	});

	describe("requireRole", () => {
		it("should allow access when user has required role", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.getUserRole).mockResolvedValue({
				id: 1,
				name: "Admin",
				slug: "admin",
				description: "Admin role",
				isBuiltIn: true,
				isDefault: false,
				priority: 80,
				clonedFrom: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				permissions: [],
			});

			const handler = middleware.requireRole("admin");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockPermissionService.getUserRole).toHaveBeenCalledWith(mockUser.userId);
			expect(mockRequest.user).toBe(mockUser);
			expect(mockNext).toHaveBeenCalled();
			expect(mockResponse.status).not.toHaveBeenCalled();
		});

		it("should allow access when user has any of the required roles", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.getUserRole).mockResolvedValue({
				id: 1,
				name: "Admin",
				slug: "admin",
				description: "Admin role",
				isBuiltIn: true,
				isDefault: false,
				priority: 80,
				clonedFrom: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				permissions: [],
			});

			const handler = middleware.requireRole("admin", "owner");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
		});

		it("should deny access when user lacks required role", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.getUserRole).mockResolvedValue({
				id: 1,
				name: "Member",
				slug: "member",
				description: "Member role",
				isBuiltIn: true,
				isDefault: true,
				priority: 50,
				clonedFrom: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				permissions: [],
			});

			const handler = middleware.requireRole("admin");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
			expect(mockResponse.json).toHaveBeenCalledWith({
				error: "Forbidden",
				message: "You do not have the required role to perform this action",
				requiredRoles: ["admin"],
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should deny access when user has no role", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.getUserRole).mockResolvedValue(undefined);

			const handler = middleware.requireRole("admin");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(403);
			expect(mockResponse.json).toHaveBeenCalledWith({
				error: "Forbidden",
				message: "You do not have the required role to perform this action",
				requiredRoles: ["admin"],
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should return 401 when user is not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const handler = middleware.requireRole("admin");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(401);
			expect(mockResponse.json).toHaveBeenCalledWith({ error: "Authentication required" });
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should use existing user from request if available", async () => {
			mockRequest.user = mockUser;
			vi.mocked(mockPermissionService.getUserRole).mockResolvedValue({
				id: 1,
				name: "Admin",
				slug: "admin",
				description: "Admin role",
				isBuiltIn: true,
				isDefault: false,
				priority: 80,
				clonedFrom: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				permissions: [],
			});

			const handler = middleware.requireRole("admin");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.decodePayload).not.toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should return 500 when role check fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.getUserRole).mockRejectedValue(new Error("Database error"));

			const handler = middleware.requireRole("admin");
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockResponse.status).toHaveBeenCalledWith(500);
			expect(mockResponse.json).toHaveBeenCalledWith({ error: "Role check failed" });
			expect(mockNext).not.toHaveBeenCalled();
		});
	});

	describe("loadPermissions", () => {
		it("should load permissions for authenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["users.view", "users.edit"]);

			const handler = middleware.loadPermissions();
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockRequest.user).toBe(mockUser);
			expect(mockRequest.userPermissions).toEqual(["users.view", "users.edit"]);
			expect(mockNext).toHaveBeenCalled();
			expect(mockResponse.status).not.toHaveBeenCalled();
		});

		it("should continue without permissions for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const handler = middleware.loadPermissions();
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockRequest.user).toBeUndefined();
			expect(mockRequest.userPermissions).toBeUndefined();
			expect(mockNext).toHaveBeenCalled();
			expect(mockResponse.status).not.toHaveBeenCalled();
		});

		it("should use existing user from request if available", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			mockRequest.user = mockUser;
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["users.view"]);

			const handler = middleware.loadPermissions();
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockRequest.userPermissions).toEqual(["users.view"]);
			expect(mockNext).toHaveBeenCalled();
		});

		it("should continue even if loading permissions fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUser);
			vi.mocked(mockPermissionService.getUserPermissions).mockRejectedValue(new Error("Database error"));

			const handler = middleware.loadPermissions();
			await handler(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
			expect(mockResponse.status).not.toHaveBeenCalled();
		});
	});
});
