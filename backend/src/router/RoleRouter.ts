/**
 * RoleRouter - API endpoints for managing roles and permissions.
 *
 * Provides endpoints for:
 * - Listing roles and permissions
 * - Getting role details with permissions
 * - Cloning roles to create custom variants
 * - Updating custom roles (built-in roles are immutable)
 * - Deleting custom roles
 * - Setting permissions for custom roles
 */

import { auditLog, computeAuditChanges } from "../audit";
import type { DaoProvider } from "../dao/DaoProvider";
import type { PermissionDao } from "../dao/PermissionDao";
import type { RoleDao } from "../dao/RoleDao";
import type { AuthenticatedRequest, PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { UpdateRole } from "../model/Role";
import type { PermissionService } from "../services/PermissionService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import express, { type Router } from "express";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

/**
 * Request body for cloning a role.
 */
export interface CloneRoleRequest {
	name: string;
	slug?: string; // Optional - will be generated from name if not provided
	description?: string;
}

/**
 * Request body for updating a role.
 */
export interface UpdateRoleRequest {
	name?: string;
	description?: string;
	isDefault?: boolean;
	priority?: number;
}

/**
 * Request body for setting role permissions (by slug).
 */
export interface SetPermissionsRequest {
	permissionSlugs: Array<string>;
}

/**
 * Dependencies for the role router.
 */
export interface RoleRouterDependencies {
	roleDaoProvider: DaoProvider<RoleDao>;
	permissionDaoProvider: DaoProvider<PermissionDao>;
	permissionMiddleware: PermissionMiddlewareFactory;
	permissionService: PermissionService;
}

/**
 * Create the role router.
 */
export function createRoleRouter(deps: RoleRouterDependencies): Router {
	const { roleDaoProvider, permissionDaoProvider, permissionMiddleware, permissionService } = deps;
	const router = express.Router();

	// Helper functions to get DAOs with tenant context
	function getRoleDao(): RoleDao {
		return roleDaoProvider.getDao(getTenantContext());
	}

	function getPermissionDao(): PermissionDao {
		return permissionDaoProvider.getDao(getTenantContext());
	}

	/**
	 * GET /
	 *
	 * List all roles.
	 * Requires: roles.view permission
	 */
	router.get("/", permissionMiddleware.requirePermission("roles.view"), async (_req, res) => {
		try {
			const roles = await getRoleDao().listAll();
			res.json(roles);
		} catch (error) {
			log.error(error, "Error listing roles");
			res.status(500).json({ error: "Failed to list roles" });
		}
	});

	/**
	 * GET /permissions
	 *
	 * List all permissions.
	 * Requires: roles.view permission
	 */
	router.get("/permissions", permissionMiddleware.requirePermission("roles.view"), async (_req, res) => {
		try {
			const permissions = await getPermissionDao().listAll();
			res.json(permissions);
		} catch (error) {
			log.error(error, "Error listing permissions");
			res.status(500).json({ error: "Failed to list permissions" });
		}
	});

	/**
	 * GET /me/permissions
	 *
	 * Get the current user's permissions.
	 * Any authenticated user can access this endpoint.
	 */
	router.get("/me/permissions", permissionMiddleware.requireAuth(), async (req, res) => {
		try {
			const user = (req as AuthenticatedRequest).user;
			if (!user) {
				res.status(401).json({ error: "Authentication required" });
				return;
			}

			// Load user permissions from PermissionService
			const permissions = await permissionService.getUserPermissions(user.userId);
			const role = await permissionService.getUserRole(user.userId);

			log.info(
				{ userId: user.userId, email: user.email, roleName: role?.name, permissionCount: permissions.length },
				"User permissions loaded: %s",
				permissions.join(", "),
			);

			res.json({
				permissions,
				role,
			});
		} catch (error) {
			log.error(error, "Error getting current user permissions");
			res.status(500).json({ error: "Failed to get permissions" });
		}
	});

	/**
	 * GET /permissions/grouped
	 *
	 * List all permissions grouped by category.
	 * Requires: roles.view permission
	 */
	router.get("/permissions/grouped", permissionMiddleware.requirePermission("roles.view"), async (_req, res) => {
		try {
			const grouped = await getPermissionDao().listGroupedByCategory();
			res.json(grouped);
		} catch (error) {
			log.error(error, "Error listing grouped permissions");
			res.status(500).json({ error: "Failed to list permissions" });
		}
	});

	/**
	 * GET /:id
	 *
	 * Get a role with its permissions.
	 * Requires: roles.view permission
	 */
	router.get("/:id", permissionMiddleware.requirePermission("roles.view"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid role ID" });
				return;
			}

			const role = await getRoleDao().getRoleWithPermissions(id);
			if (!role) {
				res.status(404).json({ error: "Role not found" });
				return;
			}

			res.json(role);
		} catch (error) {
			log.error(error, "Error getting role");
			res.status(500).json({ error: "Failed to get role" });
		}
	});

	/**
	 * POST /:id/clone
	 *
	 * Clone a role to create a new custom role.
	 * Copies all permissions from the source role.
	 * Requires: roles.edit permission
	 */
	router.post("/:id/clone", permissionMiddleware.requirePermission("roles.edit"), async (req, res) => {
		try {
			const sourceId = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(sourceId)) {
				res.status(400).json({ error: "Invalid role ID" });
				return;
			}

			const { name, slug, description } = req.body as CloneRoleRequest;

			if (!name || typeof name !== "string" || name.trim().length === 0) {
				res.status(400).json({ error: "Name is required" });
				return;
			}

			// Generate slug from name if not provided
			const roleSlug = slug || generateSlug(name);

			// Check if slug already exists
			const existingRole = await getRoleDao().findBySlug(roleSlug);
			if (existingRole) {
				res.status(409).json({ error: "A role with this slug already exists" });
				return;
			}

			const newRole = await getRoleDao().cloneRole(sourceId, name.trim(), roleSlug);

			// Update description if provided
			if (description !== undefined) {
				await getRoleDao().update(newRole.id, { description });
			}

			const roleWithPermissions = await getRoleDao().getRoleWithPermissions(newRole.id);

			// Audit log role clone
			auditLog({
				action: "create",
				resourceType: "role",
				resourceId: newRole.id,
				resourceName: newRole.name,
				changes: computeAuditChanges(null, newRole as unknown as Record<string, unknown>, "role"),
				metadata: { clonedFrom: sourceId },
			});

			res.status(201).json(roleWithPermissions);
		} catch (error) {
			log.error(error, "Error cloning role");
			if (error instanceof Error && error.message === "Source role not found") {
				res.status(404).json({ error: error.message });
			} else {
				res.status(500).json({ error: "Failed to clone role" });
			}
		}
	});

	/**
	 * PUT /:id
	 *
	 * Update a custom role.
	 * Built-in roles cannot be updated.
	 * Requires: roles.edit permission
	 */
	router.put("/:id", permissionMiddleware.requirePermission("roles.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid role ID" });
				return;
			}

			const role = await getRoleDao().findById(id);
			if (!role) {
				res.status(404).json({ error: "Role not found" });
				return;
			}

			if (role.isBuiltIn) {
				res.status(403).json({ error: "Cannot modify built-in role" });
				return;
			}

			const updates: UpdateRole = {};
			const { name, description, isDefault, priority } = req.body as UpdateRoleRequest;

			if (name !== undefined) {
				updates.name = name;
			}
			if (description !== undefined) {
				updates.description = description;
			}
			if (isDefault !== undefined) {
				updates.isDefault = isDefault;
			}
			if (priority !== undefined) {
				updates.priority = priority;
			}

			const updated = await getRoleDao().update(id, updates);

			// Audit log role update
			auditLog({
				action: "update",
				resourceType: "role",
				resourceId: id,
				resourceName: updated?.name ?? role.name,
				changes: computeAuditChanges(
					role as unknown as Record<string, unknown>,
					updated as unknown as Record<string, unknown>,
					"role",
				),
			});

			res.json(updated);
		} catch (error) {
			log.error(error, "Error updating role");
			if (error instanceof Error && error.message === "Cannot update built-in role") {
				res.status(403).json({ error: error.message });
			} else {
				res.status(500).json({ error: "Failed to update role" });
			}
		}
	});

	/**
	 * DELETE /:id
	 *
	 * Delete a custom role.
	 * Built-in roles cannot be deleted.
	 * Requires: roles.edit permission
	 */
	router.delete("/:id", permissionMiddleware.requirePermission("roles.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid role ID" });
				return;
			}

			const role = await getRoleDao().findById(id);
			if (!role) {
				res.status(404).json({ error: "Role not found" });
				return;
			}

			if (role.isBuiltIn) {
				res.status(403).json({ error: "Cannot delete built-in role" });
				return;
			}

			const deleted = await getRoleDao().delete(id);
			if (!deleted) {
				res.status(404).json({ error: "Role not found" });
				return;
			}

			// Audit log role deletion
			auditLog({
				action: "delete",
				resourceType: "role",
				resourceId: id,
				resourceName: role.name,
				changes: computeAuditChanges(role as unknown as Record<string, unknown>, null, "role"),
			});

			res.status(204).send();
		} catch (error) {
			log.error(error, "Error deleting role");
			if (error instanceof Error && error.message === "Cannot delete built-in role") {
				res.status(403).json({ error: error.message });
			} else {
				res.status(500).json({ error: "Failed to delete role" });
			}
		}
	});

	/**
	 * PUT /:id/permissions
	 *
	 * Set permissions for a custom role.
	 * Replaces all existing permissions.
	 * Built-in roles cannot have their permissions modified.
	 * Requires: roles.edit permission
	 */
	router.put("/:id/permissions", permissionMiddleware.requirePermission("roles.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid role ID" });
				return;
			}

			const { permissionSlugs } = req.body as SetPermissionsRequest;

			if (!Array.isArray(permissionSlugs) || !permissionSlugs.every(s => typeof s === "string")) {
				res.status(400).json({ error: "permissionSlugs must be an array of permission slug strings" });
				return;
			}

			const role = await getRoleDao().findById(id);
			if (!role) {
				res.status(404).json({ error: "Role not found" });
				return;
			}

			if (role.isBuiltIn) {
				res.status(403).json({ error: "Cannot modify permissions for built-in role" });
				return;
			}

			// Get current permissions for audit
			const oldPermissions = await getRoleDao().getPermissions(id);

			await getRoleDao().setPermissions(id, permissionSlugs);

			// Get updated permissions
			const newPermissions = await getRoleDao().getPermissions(id);

			// Audit log permission change
			auditLog({
				action: "update",
				resourceType: "role_permissions",
				resourceId: id,
				resourceName: role.name,
				changes: computeAuditChanges(
					{ permissions: oldPermissions.map(p => p.slug) },
					{ permissions: newPermissions.map(p => p.slug) },
					"role_permissions",
				),
			});

			const roleWithPermissions = await getRoleDao().getRoleWithPermissions(id);
			res.json(roleWithPermissions);
		} catch (error) {
			log.error(error, "Error setting role permissions");
			if (error instanceof Error && error.message === "Cannot modify permissions for built-in role") {
				res.status(403).json({ error: error.message });
			} else {
				res.status(500).json({ error: "Failed to set role permissions" });
			}
		}
	});

	return router;
}
