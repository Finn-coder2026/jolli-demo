/**
 * UserManagementRouter - Endpoints for managing organization users.
 *
 * Provides endpoints for:
 * - Listing active, pending, and archived users with pagination
 * - Inviting new users
 * - Managing invitations (cancel, resend)
 * - Managing users (update role, archive)
 */

import { auditLog, computeAuditChanges } from "../audit";
import { getConfig } from "../config/Config";
import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { ArchivedUserDao } from "../dao/ArchivedUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { RoleDao } from "../dao/RoleDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { UserInvitationDao } from "../dao/UserInvitationDao";
import type { UserOrgDao } from "../dao/UserOrgDao";
import type { VerificationDao } from "../dao/VerificationDao";
import type { PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { ActiveUser, OrgUserRole } from "../model/ActiveUser";
import type { ArchivedUser, NewArchivedUser } from "../model/ArchivedUser";
import type { NewUserInvitation, UserInvitation } from "../model/UserInvitation";
import type { PermissionService } from "../services/PermissionService";
import { RATE_LIMIT_CONFIGS, RateLimitService } from "../services/RateLimitService";
import { getTenantContext } from "../tenant/TenantContext";
import { isEmailAuthorized } from "../util/AuthHandler";
import { sendInvitationEmail } from "../util/EmailService";
import type { InvitationTokenUtil } from "../util/InvitationTokenUtil";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

/**
 * Paginated list response type.
 */
export interface PaginatedListResponse<T> {
	data: Array<T>;
	total: number;
}

/**
 * Request body for inviting a user.
 */
export interface InviteUserRequest {
	email: string;
	name?: string;
	role: OrgUserRole;
}

/**
 * Request body for updating user role.
 */
export interface UpdateUserRoleRequest {
	role: OrgUserRole;
}

/**
 * Request body for archiving a user.
 */
export interface ArchiveUserRequest {
	reason?: string;
}

/**
 * Dependencies for the user management router.
 */
export interface UserManagementRouterDependencies {
	activeUserDaoProvider: DaoProvider<ActiveUserDao>;
	archivedUserDaoProvider: DaoProvider<ArchivedUserDao>;
	userInvitationDaoProvider: DaoProvider<UserInvitationDao>;
	roleDaoProvider: DaoProvider<RoleDao>;
	verificationDao: VerificationDao;
	tokenUtil: TokenUtil<UserInfo>;
	invitationTokenUtil: InvitationTokenUtil;
	permissionMiddleware: PermissionMiddlewareFactory;
	permissionService: PermissionService;
	getInvitationExpirySeconds: () => number;
	getOrigin: () => string;
	/** DAO for managing user-tenant relationships (Manager DB) */
	userOrgDao: UserOrgDao;
	/** DAO for managing global users (Manager DB) */
	globalUserDao: GlobalUserDao;
	/** DAO for managing spaces (used to orphan personal spaces on user deletion) */
	spaceDaoProvider: DaoProvider<SpaceDao>;
}

/**
 * Parse limit/offset query parameters with defaults.
 */
function parsePaginationParams(query: { limit?: string; offset?: string }): { limit: number; offset: number } {
	const limit = query.limit ? Number.parseInt(query.limit, 10) : 20;
	const offset = query.offset ? Number.parseInt(query.offset, 10) : 0;

	// Cap limit to prevent abuse
	const cappedLimit = Math.min(Math.max(limit, 1), 100);
	const sanitizedOffset = Math.max(offset, 0);

	return { limit: cappedLimit, offset: sanitizedOffset };
}

/**
 * Create the user management router.
 */
export function createUserManagementRouter(deps: UserManagementRouterDependencies): Router {
	const router = express.Router();
	const {
		activeUserDaoProvider,
		archivedUserDaoProvider,
		userInvitationDaoProvider,
		roleDaoProvider,
		verificationDao,
		tokenUtil,
		invitationTokenUtil,
		permissionMiddleware,
		permissionService,
		getInvitationExpirySeconds,
		getOrigin,
		userOrgDao,
		globalUserDao,
		spaceDaoProvider,
	} = deps;

	/**
	 * Get the current authenticated user from request
	 */
	function getCurrentUser(req: Request): UserInfo | undefined {
		return tokenUtil.decodePayload(req);
	}

	// Helper functions to get DAOs with tenant context
	function getActiveUserDao(): ActiveUserDao {
		return activeUserDaoProvider.getDao(getTenantContext());
	}

	function getArchivedUserDao(): ArchivedUserDao {
		return archivedUserDaoProvider.getDao(getTenantContext());
	}

	function getUserInvitationDao(): UserInvitationDao {
		return userInvitationDaoProvider.getDao(getTenantContext());
	}

	function getRoleDao(): RoleDao {
		return roleDaoProvider.getDao(getTenantContext());
	}

	/**
	 * Sync role slug to user_orgs in Manager DB (best-effort, fire-and-forget).
	 * Failing to sync here is non-fatal — active_users.role remains the source of truth.
	 */
	function syncRoleToUserOrgs(userId: number, role: string): void {
		const tenantContext = getTenantContext();
		if (!tenantContext) {
			return;
		}
		const { tenant, org } = tenantContext;
		userOrgDao.updateRole(userId, tenant.id, org.id, role).catch(err => {
			log.error(err, "Failed to sync role to user_orgs for user %d", userId);
		});
	}

	/**
	 * Get the origin URL from the request.
	 * Uses the Origin header if available, otherwise constructs from protocol and host.
	 * Falls back to configured origin if request headers are not available.
	 */
	function getRequestOrigin(req: Request): string {
		const origin = req.get("origin");
		if (origin) {
			return origin;
		}
		const host = req.get("host");
		if (host) {
			const protocol = req.protocol || /* v8 ignore next */ "https";
			return `${protocol}://${host}`;
		}
		return getOrigin();
	}

	/**
	 * Get the base URL for invitation links.
	 * In path-based multi-tenant mode (hostname === baseDomain), the invitation URL
	 * must include the tenant slug prefix so the frontend can properly detect the
	 * tenant when the invitee visits the link.
	 * For subdomain/custom-domain mode, the origin already includes the tenant.
	 */
	function getInvitationBaseUrl(req: Request): string {
		const origin = getRequestOrigin(req);
		const tenantSlug = req.get("X-Tenant-Slug");
		const baseDomain = getConfig().BASE_DOMAIN;
		// Only append tenant slug in path-based mode (hostname equals baseDomain).
		// In subdomain mode (e.g., main.jolli-local.me), the tenant is already in the origin.
		if (tenantSlug && baseDomain && req.hostname === baseDomain) {
			return `${origin}/${tenantSlug}`;
		}
		return origin;
	}

	/**
	 * GET /config
	 *
	 * Get user management configuration for the current tenant.
	 * Returns authorized email patterns for client-side validation.
	 * Requires: users.edit permission
	 */
	router.get("/config", permissionMiddleware.requirePermission("users.edit"), (_req, res) => {
		const config = getConfig();
		const authEmails = config.AUTH_EMAILS;

		// Return the raw AUTH_EMAILS string for frontend pattern matching
		// "*" means all emails are allowed
		res.json({
			authorizedEmailPatterns: authEmails,
		});
	});

	/**
	 * GET /roles
	 *
	 * List all available roles for the current tenant.
	 * Returns roles sorted by priority (highest first).
	 * Requires: users.view permission (same as listing users)
	 */
	router.get("/roles", permissionMiddleware.requirePermission("users.view"), async (_req, res) => {
		try {
			const roleDao = getRoleDao();
			const roles = await roleDao.listAll();
			res.json(roles);
		} catch (error) {
			log.error(error, "Error listing roles");
			res.status(500).json({ error: "Failed to list roles" });
		}
	});

	/**
	 * GET /active
	 *
	 * List users (including deactivated) with pagination.
	 * Query params: limit (default 20), offset (default 0)
	 * Requires: users.view permission
	 * Returns: { data, total, canEditRoles } where canEditRoles indicates if the current user can change roles
	 */
	router.get("/active", permissionMiddleware.requirePermission("users.view"), async (req, res) => {
		try {
			const { limit, offset } = parsePaginationParams(req.query as { limit?: string; offset?: string });
			const dao = getActiveUserDao();

			// Get current user to check their permissions
			const currentUser = getCurrentUser(req);
			const [canEditRoles, canManageUsers] = currentUser
				? await Promise.all([
						permissionService.hasPermission(currentUser.userId, "roles.edit"),
						permissionService.hasPermission(currentUser.userId, "users.edit"),
					])
				: /* v8 ignore next */ [false, false];

			// Use listAll to include both active and deactivated users
			const [data, total] = await Promise.all([dao.listAll({ limit, offset }), dao.countAll()]);

			const response: PaginatedListResponse<ActiveUser> & { canEditRoles: boolean; canManageUsers: boolean } = {
				data,
				total,
				canEditRoles,
				canManageUsers,
			};
			res.json(response);
		} catch (error) {
			log.error(error, "Error listing active users");
			res.status(500).json({ error: "Failed to list active users" });
		}
	});

	/**
	 * GET /pending
	 *
	 * List pending invitations with pagination.
	 * Query params: limit (default 20), offset (default 0)
	 * Requires: users.view permission
	 */
	router.get("/pending", permissionMiddleware.requirePermission("users.view"), async (req, res) => {
		try {
			const { limit, offset } = parsePaginationParams(req.query as { limit?: string; offset?: string });
			const dao = getUserInvitationDao();

			const [data, total] = await Promise.all([dao.listPending({ limit, offset }), dao.countPending()]);

			const response: PaginatedListResponse<UserInvitation> = { data, total };
			res.json(response);
		} catch (error) {
			log.error(error, "Error listing pending invitations");
			res.status(500).json({ error: "Failed to list pending invitations" });
		}
	});

	/**
	 * GET /archived
	 *
	 * List archived users with pagination.
	 * Query params: limit (default 20), offset (default 0)
	 * Requires: users.view permission
	 */
	router.get("/archived", permissionMiddleware.requirePermission("users.view"), async (req, res) => {
		try {
			const { limit, offset } = parsePaginationParams(req.query as { limit?: string; offset?: string });
			const dao = getArchivedUserDao();

			const [data, total] = await Promise.all([dao.listAll({ limit, offset }), dao.count()]);

			const response: PaginatedListResponse<ArchivedUser> = { data, total };
			res.json(response);
		} catch (error) {
			log.error(error, "Error listing archived users");
			res.status(500).json({ error: "Failed to list archived users" });
		}
	});

	/**
	 * POST /invite
	 *
	 * Create a new user invitation.
	 * Body: { email: string, name?: string, role: OrgUserRole }
	 * Requires: users.edit permission
	 */
	router.post("/invite", permissionMiddleware.requirePermission("users.edit"), async (req, res) => {
		try {
			const { email, name, role } = req.body as InviteUserRequest;

			if (!email || typeof email !== "string") {
				res.status(400).json({ error: "email is required" });
				return;
			}

			if (!role || typeof role !== "string") {
				res.status(400).json({ error: "role is required" });
				return;
			}

			// Get tenant context early - needed for DAO access
			const tenantContext = getTenantContext();
			if (!tenantContext) {
				res.status(500).json({ error: "Tenant context not available" });
				return;
			}

			// Validate role exists in database (supports both built-in and custom roles)
			const roleDao = getRoleDao();
			const roleRecord = await roleDao.findBySlug(role);
			if (!roleRecord) {
				res.status(400).json({ error: `Invalid role: ${role}` });
				return;
			}

			// Validate email against authorized email patterns
			if (!isEmailAuthorized(email)) {
				res.status(400).json({ error: "Email does not match authorized patterns for this organization" });
				return;
			}

			// Get current user for invitedBy field
			const currentUser = getCurrentUser(req);
			if (!currentUser) {
				res.status(401).json({ error: "Authentication required" });
				return;
			}

			const dao = getUserInvitationDao();
			const activeUserDao = getActiveUserDao();

			// Check if user already exists
			const existingUser = await activeUserDao.findByEmail(email);
			if (existingUser) {
				res.status(409).json({ error: "User with this email already exists" });
				return;
			}

			// Check if pending invitation already exists
			const existingInvitation = await dao.findPendingByEmail(email);
			if (existingInvitation) {
				res.status(409).json({ error: "Pending invitation for this email already exists" });
				return;
			}

			// Check rate limit for invitation emails
			const rateLimitService = new RateLimitService();
			const rateLimit = await rateLimitService.checkInvitationEmailLimit(email);
			if (!rateLimit.allowed) {
				const errorMessage = rateLimitService.createRateLimitError(
					rateLimit,
					RATE_LIMIT_CONFIGS.EMAIL_INVITATION,
				);
				res.status(429).json({ error: errorMessage });
				return;
			}

			// Calculate expiry
			const expirySeconds = getInvitationExpirySeconds();
			const expiresAt = new Date(Date.now() + expirySeconds * 1000);

			// Create the invitation record first to get the ID
			const newInvitation: NewUserInvitation = {
				email,
				name: name ?? null,
				role,
				verificationId: null, // Will be updated after verification creation
				expiresAt,
				status: "pending",
				invitedBy: currentUser.userId,
			};

			const invitation = await dao.create(newInvitation);

			// Generate invitation JWT token
			const tokenResult = invitationTokenUtil.generateToken({
				email,
				tenantId: tenantContext.tenant.id,
				orgId: tenantContext.org.id,
				invitedBy: currentUser.userId,
				role,
				invitationId: invitation.id,
				expiresInSeconds: expirySeconds,
			});

			// Create verification record in Manager DB to get the verification ID
			// The tokenHash is stored in the verification record for token validation
			const verification = await verificationDao.createVerification({
				identifier: email,
				tokenHash: tokenResult.tokenHash,
				type: "invitation",
				expiresAt,
			});

			// Update invitation with verification ID
			await dao.updateVerificationId(invitation.id, verification.id);

			// Get inviter info for email
			const inviter = await activeUserDao.findById(currentUser.userId);
			const inviterName = inviter?.name || currentUser.name || currentUser.email;

			// Send invitation email (fire-and-forget to prevent delays)
			const invitationUrl = `${getInvitationBaseUrl(req)}/invite/accept?token=${tokenResult.token}`;
			const expiresInDays = Math.ceil(expirySeconds / (60 * 60 * 24));

			void sendInvitationEmail({
				toEmail: email,
				toName: name ?? null,
				invitationUrl,
				organizationName: tenantContext.org.displayName,
				inviterName,
				role,
				expiresInDays,
			})
				.then(() => rateLimitService.recordInvitationEmail(email))
				.catch(err => log.error(err, "Failed to send invitation email"));

			// Return the updated invitation
			const updatedInvitation = await dao.findById(invitation.id);

			// Audit log invitation creation
			auditLog({
				action: "invite",
				resourceType: "user_invitation",
				resourceId: invitation.id,
				resourceName: email,
				changes: computeAuditChanges(null, invitation as unknown as Record<string, unknown>, "user_invitation"),
			});

			log.info("Created invitation for email=%s with role=%s invitedBy=%d", email, role, currentUser.userId);
			res.status(201).json(updatedInvitation);
		} catch (error) {
			log.error(error, "Error creating invitation");
			res.status(500).json({ error: "Failed to create invitation" });
		}
	});

	/**
	 * DELETE /invitation/:id
	 *
	 * Cancel/delete an invitation.
	 * Requires: users.edit permission
	 */
	router.delete("/invitation/:id", permissionMiddleware.requirePermission("users.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid invitation ID" });
				return;
			}

			const dao = getUserInvitationDao();

			// Get invitation first to find verificationId for verification cleanup
			const invitation = await dao.findById(id);
			if (!invitation) {
				res.status(404).json({ error: "Invitation not found" });
				return;
			}

			// Delete invitation
			const success = await dao.delete(id);

			if (!success) {
				res.status(404).json({ error: "Invitation not found" });
				return;
			}

			// Clean up verification record using verificationId
			if (invitation.verificationId) {
				await verificationDao.deleteVerification(invitation.verificationId);
			}

			// Audit log invitation cancellation
			auditLog({
				action: "delete",
				resourceType: "user_invitation",
				resourceId: id,
				resourceName: invitation.email,
				changes: computeAuditChanges(invitation as unknown as Record<string, unknown>, null, "user_invitation"),
			});

			log.info("Deleted invitation id=%d for email=%s", id, invitation.email);
			res.json({ success: true });
		} catch (error) {
			log.error(error, "Error deleting invitation");
			res.status(500).json({ error: "Failed to delete invitation" });
		}
	});

	/**
	 * POST /invitation/:id/resend
	 *
	 * Resend an invitation (regenerate token and expiry, send email).
	 * Requires: users.edit permission
	 */
	router.post("/invitation/:id/resend", permissionMiddleware.requirePermission("users.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid invitation ID" });
				return;
			}

			const dao = getUserInvitationDao();
			const activeUserDao = getActiveUserDao();
			const existingInvitation = await dao.findById(id);

			if (!existingInvitation) {
				res.status(404).json({ error: "Invitation not found" });
				return;
			}

			if (existingInvitation.status !== "pending") {
				res.status(400).json({ error: "Can only resend pending invitations" });
				return;
			}

			// Check rate limit for invitation emails
			const rateLimitService = new RateLimitService();
			const rateLimit = await rateLimitService.checkInvitationEmailLimit(existingInvitation.email);
			if (!rateLimit.allowed) {
				const errorMessage = rateLimitService.createRateLimitError(
					rateLimit,
					RATE_LIMIT_CONFIGS.EMAIL_INVITATION,
				);
				res.status(429).json({ error: errorMessage });
				return;
			}

			// Get tenant context for token generation
			const tenantContext = getTenantContext();
			if (!tenantContext) {
				res.status(500).json({ error: "Tenant context not available" });
				return;
			}

			// Delete old verification record using verificationId
			if (existingInvitation.verificationId) {
				await verificationDao.deleteVerification(existingInvitation.verificationId);
			}

			// Delete old invitation and create new one with new token/expiry
			await dao.delete(id);

			// Calculate new expiry
			const expirySeconds = getInvitationExpirySeconds();
			const expiresAt = new Date(Date.now() + expirySeconds * 1000);

			// Create new invitation
			const newInvitation: NewUserInvitation = {
				email: existingInvitation.email,
				name: existingInvitation.name,
				role: existingInvitation.role,
				verificationId: null, // Will be updated after verification creation
				expiresAt,
				status: "pending",
				invitedBy: existingInvitation.invitedBy,
			};

			const invitation = await dao.create(newInvitation);

			// Generate new invitation JWT token
			const tokenResult = invitationTokenUtil.generateToken({
				email: existingInvitation.email,
				tenantId: tenantContext.tenant.id,
				orgId: tenantContext.org.id,
				invitedBy: existingInvitation.invitedBy,
				role: existingInvitation.role,
				invitationId: invitation.id,
				expiresInSeconds: expirySeconds,
			});

			// Create new verification record to get verification ID
			// The tokenHash is stored in the verification record for token validation
			const verification = await verificationDao.createVerification({
				identifier: existingInvitation.email,
				tokenHash: tokenResult.tokenHash,
				type: "invitation",
				expiresAt,
			});

			// Update invitation with verification ID
			await dao.updateVerificationId(invitation.id, verification.id);

			// Get inviter info for email
			const inviter = await activeUserDao.findById(existingInvitation.invitedBy);
			const inviterName = inviter?.name || "A team member";

			// Send invitation email (fire-and-forget)
			const invitationUrl = `${getInvitationBaseUrl(req)}/invite/accept?token=${tokenResult.token}`;
			const expiresInDays = Math.ceil(expirySeconds / (60 * 60 * 24));

			void sendInvitationEmail({
				toEmail: existingInvitation.email,
				toName: existingInvitation.name,
				invitationUrl,
				organizationName: tenantContext.org.displayName,
				inviterName,
				role: existingInvitation.role,
				expiresInDays,
			})
				.then(() => rateLimitService.recordInvitationEmail(existingInvitation.email))
				.catch(err => log.error(err, "Failed to send invitation email"));

			// Return the updated invitation
			const updatedInvitation = await dao.findById(invitation.id);

			// Audit log invitation resend
			auditLog({
				action: "invite",
				resourceType: "user_invitation",
				resourceId: invitation.id,
				resourceName: existingInvitation.email,
				metadata: { resend: true },
			});

			log.info("Resent invitation for email=%s", existingInvitation.email);
			res.json(updatedInvitation);
		} catch (error) {
			log.error(error, "Error resending invitation");
			res.status(500).json({ error: "Failed to resend invitation" });
		}
	});

	/**
	 * PUT /user/:id/role
	 *
	 * Update a user's role.
	 * Body: { role: OrgUserRole }
	 * Requires: roles.edit permission
	 */
	router.put("/user/:id/role", permissionMiddleware.requirePermission("roles.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid user ID" });
				return;
			}

			// Prevent changing your own role
			const currentUser = getCurrentUser(req);
			if (currentUser?.userId === id) {
				res.status(403).json({ error: "Cannot change your own role" });
				return;
			}

			const { role } = req.body as UpdateUserRoleRequest;

			if (!role || typeof role !== "string") {
				res.status(400).json({ error: "role is required" });
				return;
			}

			const dao = getActiveUserDao();
			const roleDao = getRoleDao();

			// Validate role exists in database (supports both built-in and custom roles)
			const roleRecord = await roleDao.findBySlug(role);
			if (!roleRecord) {
				res.status(400).json({ error: `Invalid role: ${role}` });
				return;
			}

			// Check if user exists and if they're the owner
			const existingUser = await dao.findById(id);
			if (!existingUser) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			// Prevent downgrading owner role
			if (existingUser.role === "owner" && role !== "owner") {
				res.status(403).json({ error: "Cannot change the owner's role" });
				return;
			}

			const updatedUser = await dao.update(id, { role });

			if (!updatedUser) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			// Sync role to user_orgs (Manager DB) — best-effort
			syncRoleToUserOrgs(id, role);

			// Audit log role change
			auditLog({
				action: "role_change",
				resourceType: "user",
				resourceId: id,
				resourceName: existingUser.email,
				changes: computeAuditChanges(
					{ role: existingUser.role } as unknown as Record<string, unknown>,
					{ role } as unknown as Record<string, unknown>,
					"user",
				),
			});

			log.info({ id, role }, "Updated role for user");
			res.json(updatedUser);
		} catch (error) {
			log.error(error, "Error updating user role");
			res.status(500).json({ error: "Failed to update user role" });
		}
	});

	/**
	 * PUT /user/:id/name
	 *
	 * Update a user's name.
	 * Body: { name: string }
	 * Requires: users.edit permission
	 */
	router.put("/user/:id/name", permissionMiddleware.requirePermission("users.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid user ID" });
				return;
			}

			const { name } = req.body as { name: string };

			if (name === undefined || typeof name !== "string") {
				res.status(400).json({ error: "name is required" });
				return;
			}

			const dao = getActiveUserDao();

			// Check if user exists
			const existingUser = await dao.findById(id);
			if (!existingUser) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			// Update name (trim and convert empty string to null)
			const trimmedName = name.trim() || null;
			const updatedUser = await dao.update(id, { name: trimmedName });

			if (!updatedUser) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			// Audit log name update
			auditLog({
				action: "update",
				resourceType: "user",
				resourceId: id,
				resourceName: existingUser.email,
				changes: computeAuditChanges(
					{ name: existingUser.name } as unknown as Record<string, unknown>,
					{ name: trimmedName } as unknown as Record<string, unknown>,
					"user",
				),
			});

			log.info({ id, name: trimmedName }, "Updated name for user");
			res.json(updatedUser);
		} catch (error) {
			log.error(error, "Error updating user name");
			res.status(500).json({ error: "Failed to update user name" });
		}
	});

	/**
	 * PUT /user/:id/deactivate
	 *
	 * Deactivate a user (soft lock - user cannot log in but remains in system).
	 * Requires: users.edit permission
	 */
	router.put("/user/:id/deactivate", permissionMiddleware.requirePermission("users.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid user ID" });
				return;
			}

			// Get current user to prevent self-deactivation
			const currentUser = getCurrentUser(req);
			if (!currentUser) {
				res.status(401).json({ error: "Authentication required" });
				return;
			}

			if (currentUser.userId === id) {
				res.status(403).json({ error: "Cannot deactivate yourself" });
				return;
			}

			const dao = getActiveUserDao();

			// Check if user exists
			const existingUser = await dao.findById(id);
			if (!existingUser) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			// Prevent deactivating the owner
			if (existingUser.role === "owner") {
				res.status(403).json({ error: "Cannot deactivate the owner" });
				return;
			}

			// Check if already deactivated
			if (!existingUser.isActive) {
				res.status(400).json({ error: "User is already deactivated" });
				return;
			}

			const success = await dao.deactivate(id);
			if (!success) {
				res.status(500).json({ error: "Failed to deactivate user" });
				return;
			}

			const updatedUser = await dao.findById(id);

			// Audit log user deactivation
			auditLog({
				action: "deactivate",
				resourceType: "user",
				resourceId: id,
				resourceName: existingUser.email,
				changes: computeAuditChanges(
					{ isActive: true } as unknown as Record<string, unknown>,
					{ isActive: false } as unknown as Record<string, unknown>,
					"user",
				),
			});

			log.info("Deactivated user id=%d by user=%d", id, currentUser.userId);
			res.json(updatedUser);
		} catch (error) {
			log.error(error, "Error deactivating user");
			res.status(500).json({ error: "Failed to deactivate user" });
		}
	});

	/**
	 * PUT /user/:id/activate
	 *
	 * Activate a previously deactivated user.
	 * Requires: users.edit permission
	 */
	router.put("/user/:id/activate", permissionMiddleware.requirePermission("users.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid user ID" });
				return;
			}

			const dao = getActiveUserDao();

			// Check if user exists
			const existingUser = await dao.findById(id);
			if (!existingUser) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			// Check if already active
			if (existingUser.isActive) {
				res.status(400).json({ error: "User is already active" });
				return;
			}

			const success = await dao.reactivate(id);
			if (!success) {
				res.status(500).json({ error: "Failed to activate user" });
				return;
			}

			// Get current user for logging
			const currentUser = getCurrentUser(req);
			const updatedUser = await dao.findById(id);

			// Audit log user activation
			auditLog({
				action: "activate",
				resourceType: "user",
				resourceId: id,
				resourceName: existingUser.email,
				changes: computeAuditChanges(
					{ isActive: false } as unknown as Record<string, unknown>,
					{ isActive: true } as unknown as Record<string, unknown>,
					"user",
				),
			});

			log.info("Activated user id=%d by user=%d", id, currentUser?.userId ?? /* v8 ignore next */ 0);
			res.json(updatedUser);
		} catch (error) {
			log.error(error, "Error activating user");
			res.status(500).json({ error: "Failed to activate user" });
		}
	});

	/**
	 * DELETE /user/:id
	 *
	 * Archive/remove a user.
	 * Body: { reason?: string }
	 * Requires: users.edit permission
	 */
	router.delete("/user/:id", permissionMiddleware.requirePermission("users.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid user ID" });
				return;
			}

			// Get current user for removedBy field
			const currentUser = getCurrentUser(req);
			if (!currentUser) {
				res.status(401).json({ error: "Authentication required" });
				return;
			}

			// Prevent users from removing themselves
			if (currentUser.userId === id) {
				res.status(403).json({ error: "Cannot remove yourself" });
				return;
			}

			// Get tenant context for multi-tenant removal
			const tenantContext = getTenantContext();
			/* c8 ignore start - Defensive code: tenant context is set by TenantMiddleware */
			if (!tenantContext) {
				res.status(500).json({ error: "Tenant context not available" });
				return;
			}
			/* c8 ignore stop */

			const { reason } = (req.body as ArchiveUserRequest) ?? {};

			const activeUserDao = getActiveUserDao();
			const archivedUserDao = getArchivedUserDao();

			// Get the user to archive
			const user = await activeUserDao.findById(id);
			if (!user) {
				res.status(404).json({ error: "User not found" });
				return;
			}

			// Prevent removing the owner
			if (user.role === "owner") {
				res.status(403).json({ error: "Cannot remove the owner user" });
				return;
			}

			// Create archived record to preserve historical data
			const archivedUser: NewArchivedUser = {
				userId: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
				removedBy: currentUser.userId,
				reason: reason ?? null,
				removedAt: new Date(),
			};

			await archivedUserDao.create(archivedUser);

			// Orphan the user's personal space (soft-delete it) before removing the user
			try {
				const spaceDao = spaceDaoProvider.getDao(tenantContext);
				await spaceDao.orphanPersonalSpace(id);
			} catch (spaceError) {
				log.error(spaceError, "Failed to orphan personal space for user %d", id);
				// Don't fail user deletion if space orphaning fails
			}

			// Delete the user from this tenant's active_users table
			await activeUserDao.delete(id);

			// Remove user from this tenant/org in the user_orgs table
			const tenantId = tenantContext.tenant.id;
			const orgId = tenantContext.org.id;
			await userOrgDao.deleteUserOrg(id, tenantId, orgId);

			// Check if user belongs to any other tenants
			const remainingOrgs = await userOrgDao.getUserOrgs(id);

			// If user has no more tenant memberships, delete global user record
			if (remainingOrgs.length === 0) {
				await globalUserDao.deleteUser(id);
				log.info(
					"Deleted global user id=%d (no remaining tenant memberships) with reason=%s",
					id,
					reason ?? "none",
				);
			} else {
				log.info(
					"Archived user id=%d from tenant=%s (user still in %d other tenants) with reason=%s",
					id,
					tenantId,
					remainingOrgs.length,
					reason ?? /* v8 ignore next */ "none",
				);
			}

			// Audit log user removal/archival
			auditLog({
				action: "delete",
				resourceType: "user",
				resourceId: id,
				resourceName: user.email,
				changes: computeAuditChanges(user as unknown as Record<string, unknown>, null, "user"),
				metadata: { reason: reason ?? null },
			});

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Error archiving user");
			res.status(500).json({ error: "Failed to archive user" });
		}
	});

	return router;
}
