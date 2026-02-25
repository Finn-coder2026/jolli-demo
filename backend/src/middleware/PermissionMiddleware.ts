import type { PermissionService } from "../services/PermissionService";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

/**
 * Extended request interface with user permissions.
 */
export interface AuthenticatedRequest extends Request {
	user?: UserInfo;
	userPermissions?: Array<string>;
}

/**
 * Dependencies for permission middleware.
 */
export interface PermissionMiddlewareDependencies {
	tokenUtil: TokenUtil<UserInfo>;
	permissionService: PermissionService;
}

/**
 * Create permission middleware factory.
 * Returns functions to create middleware that check permissions on routes.
 */
export function createPermissionMiddleware(deps: PermissionMiddlewareDependencies) {
	const { tokenUtil, permissionService } = deps;

	/**
	 * Middleware to require authentication and decode user info.
	 */
	function requireAuth(): RequestHandler {
		return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
			try {
				const user = tokenUtil.decodePayload(req);
				if (!user) {
					res.status(401).json({ error: "Authentication required" });
					return;
				}

				req.user = user;
				next();
			} catch (error) {
				log.error(error, "Error in auth middleware");
				res.status(401).json({ error: "Authentication failed" });
			}
		};
	}

	/**
	 * Middleware to require any of the specified permissions.
	 * User must have at least one of the permissions to proceed.
	 *
	 * @param permissions - Permission slugs to check (e.g., "users.view", "users.edit")
	 */
	function requirePermission(...permissions: Array<string>): RequestHandler {
		return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
			try {
				// First ensure user is authenticated
				const user = req.user ?? tokenUtil.decodePayload(req);
				if (!user) {
					res.status(401).json({ error: "Authentication required" });
					return;
				}
				req.user = user;

				// Check if user has any of the required permissions
				const hasPermission = await permissionService.hasAnyPermission(user.userId, permissions);

				log.info(
					{
						url: req.originalUrl,
						method: req.method,
						userId: user.userId,
						required: permissions,
						result: hasPermission,
					},
					"Permission check: %s %s - requires [%s] -> %s",
					req.method,
					req.originalUrl,
					permissions.join(", "),
					hasPermission ? "ALLOWED" : "DENIED",
				);

				if (!hasPermission) {
					res.status(403).json({
						error: "Forbidden",
						message: "You do not have permission to perform this action",
						requiredPermissions: permissions,
					});
					return;
				}

				// Optionally cache user permissions on request for later use
				req.userPermissions = await permissionService.getUserPermissions(user.userId);
				next();
			} catch (error) {
				log.error(error, "Error in permission middleware");
				res.status(500).json({ error: "Permission check failed" });
			}
		};
	}

	/**
	 * Middleware to require all of the specified permissions.
	 * User must have ALL permissions to proceed.
	 *
	 * @param permissions - Permission slugs to check
	 */
	function requireAllPermissions(...permissions: Array<string>): RequestHandler {
		return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
			try {
				// First ensure user is authenticated
				const user = req.user ?? tokenUtil.decodePayload(req);
				if (!user) {
					res.status(401).json({ error: "Authentication required" });
					return;
				}
				req.user = user;

				// Check if user has all required permissions
				const hasAllPermissions = await permissionService.hasAllPermissions(user.userId, permissions);
				if (!hasAllPermissions) {
					log.debug(
						"User %d denied access - requires all permissions: %s",
						user.userId,
						permissions.join(", "),
					);
					res.status(403).json({
						error: "Forbidden",
						message: "You do not have permission to perform this action",
						requiredPermissions: permissions,
					});
					return;
				}

				req.userPermissions = await permissionService.getUserPermissions(user.userId);
				next();
			} catch (error) {
				log.error(error, "Error in permission middleware");
				res.status(500).json({ error: "Permission check failed" });
			}
		};
	}

	/**
	 * Middleware to check if user has a specific org role.
	 * Useful for role-based checks without specific permissions.
	 *
	 * @param roles - Role slugs to check (e.g., "owner", "admin")
	 */
	function requireRole(...roles: Array<string>): RequestHandler {
		return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
			try {
				// First ensure user is authenticated
				const user = req.user ?? tokenUtil.decodePayload(req);
				if (!user) {
					res.status(401).json({ error: "Authentication required" });
					return;
				}
				req.user = user;

				// Get user's role
				const userRole = await permissionService.getUserRole(user.userId);
				const roleSlug = userRole?.slug;

				if (!roleSlug || !roles.includes(roleSlug)) {
					log.debug(
						"User %d denied access - requires role: %s, has: %s",
						user.userId,
						roles.join("|"),
						roleSlug,
					);
					res.status(403).json({
						error: "Forbidden",
						message: "You do not have the required role to perform this action",
						requiredRoles: roles,
					});
					return;
				}

				next();
			} catch (error) {
				log.error(error, "Error in role middleware");
				res.status(500).json({ error: "Role check failed" });
			}
		};
	}

	/**
	 * Middleware to load user permissions without enforcing any specific permission.
	 * Useful when you need to check permissions conditionally in the route handler.
	 */
	function loadPermissions(): RequestHandler {
		return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
			try {
				const user = req.user ?? tokenUtil.decodePayload(req);
				if (user) {
					req.user = user;
					req.userPermissions = await permissionService.getUserPermissions(user.userId);
				}
				next();
			} catch (error) {
				log.error(error, "Error loading permissions");
				// Don't fail the request, just continue without permissions
				next();
			}
		};
	}

	return {
		requireAuth,
		requirePermission,
		requireAllPermissions,
		requireRole,
		loadPermissions,
	};
}

/**
 * Type for the permission middleware factory result.
 */
export type PermissionMiddlewareFactory = ReturnType<typeof createPermissionMiddleware>;
