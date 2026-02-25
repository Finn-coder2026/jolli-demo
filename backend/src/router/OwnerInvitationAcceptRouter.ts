/**
 * OwnerInvitationAcceptRouter - Endpoints for accepting owner invitations.
 *
 * Provides public endpoints (no auth required) for:
 * - Validating owner invitation tokens
 * - Accepting invitations with password setup
 * - Accepting invitations via OAuth (social login)
 */

import { auditLog } from "../audit";
import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GlobalAuthDao } from "../dao/GlobalAuthDao";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { OwnerInvitationDao } from "../dao/OwnerInvitationDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { UserOrgDao } from "../dao/UserOrgDao";
import type { VerificationDao } from "../dao/VerificationDao";
import type { NewActiveUser } from "../model/ActiveUser";
import { runWithTenantContext, type TenantOrgContext } from "../tenant/TenantContext";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { getLog } from "../util/Logger";
import { parseNameFromEmail } from "../util/NameUtil";
import type { OwnerInvitationTokenUtil } from "../util/OwnerInvitationTokenUtil";
import { hash } from "@node-rs/argon2";
import express, { type Router } from "express";
import { type PasswordValidationError, validatePassword as validatePasswordShared } from "jolli-common";
import type { Sequelize, Transaction } from "sequelize";

const log = getLog(import.meta);

/**
 * Argon2id options for password hashing (matches BetterAuthConfig)
 */
const argon2Options = {
	algorithm: 2 as const, // Argon2id
	memoryCost: 1 << 16, // 65536 KiB = 64 MiB
	timeCost: 3,
	parallelism: 4,
	outputLen: 32,
};

/**
 * Request body for accepting owner invitation with password.
 */
export interface AcceptOwnerInvitationRequest {
	token: string;
	password: string;
	name?: string;
}

/**
 * Request body for accepting owner invitation via OAuth.
 */
export interface AcceptOwnerInvitationOAuthRequest {
	token: string;
}

/**
 * Response for owner invitation validation.
 */
export interface ValidateOwnerInvitationResponse {
	valid: boolean;
	error?:
		| "missing_token"
		| "invalid_token"
		| "expired_token"
		| "used_token"
		| "invitation_not_found"
		| "server_error";
	invitation?: {
		email: string;
		name: string | null;
		tenantName: string;
		organizationName: string;
		userExists: boolean;
	};
}

/**
 * Response for accepting owner invitation.
 */
export interface AcceptOwnerInvitationResponse {
	success: boolean;
	error?:
		| "missing_fields"
		| "invalid_token"
		| "expired_token"
		| "used_token"
		| "invitation_not_found"
		| "invalid_password"
		| "email_mismatch"
		| "server_error";
	message?: string;
	/** Tenant slug for redirect after acceptance */
	tenantSlug?: string;
}

/**
 * Dependencies for the owner invitation accept router.
 */
export interface OwnerInvitationAcceptRouterDependencies {
	ownerInvitationTokenUtil: OwnerInvitationTokenUtil;
	verificationDao: VerificationDao;
	ownerInvitationDao: OwnerInvitationDao;
	globalUserDao: GlobalUserDao;
	globalAuthDao: GlobalAuthDao;
	userOrgDao: UserOrgDao;
	activeUserDaoProvider: DaoProvider<ActiveUserDao>;
	spaceDaoProvider: DaoProvider<SpaceDao>;
	registryClient: TenantRegistryClient;
	connectionManager: TenantOrgConnectionManager;
	/** Sequelize instance for the Manager DB (for transactions) */
	managerSequelize: Sequelize;
	/** Function to get authenticated session from request (for OAuth flow) */
	getSessionFromRequest?: (
		req: express.Request,
	) => Promise<{ user: { id: string; email: string; name: string } } | null>;
}

/**
 * Error messages for password validation errors.
 */
const passwordErrorMessages: Record<PasswordValidationError, string> = {
	required: "Password is required",
	too_short: "Password must be at least 8 characters",
	too_long: "Password must be at most 36 characters",
	needs_uppercase: "Password must contain at least one uppercase letter",
	needs_lowercase: "Password must contain at least one lowercase letter",
	needs_number: "Password must contain at least one number",
	needs_special: "Password must contain at least one special character",
	contains_email: "Password must not contain your email address",
};

/**
 * Validate password against rules using shared validation from jolli-common.
 */
function validatePassword(password: string, email: string): string | null {
	const result = validatePasswordShared(password, email);
	if (!result.valid && result.error) {
		return passwordErrorMessages[result.error];
	}
	return null;
}

/**
 * Create the owner invitation accept router.
 */
export function createOwnerInvitationAcceptRouter(deps: OwnerInvitationAcceptRouterDependencies): Router {
	const router = express.Router();
	const {
		ownerInvitationTokenUtil,
		verificationDao,
		ownerInvitationDao,
		globalUserDao,
		globalAuthDao,
		userOrgDao,
		activeUserDaoProvider,
		spaceDaoProvider,
		registryClient,
		connectionManager,
		managerSequelize,
		getSessionFromRequest,
	} = deps;

	/**
	 * Get tenant context by tenant/org ID.
	 */
	async function getTenantContext(tenantId: string, orgId: string): Promise<TenantOrgContext | undefined> {
		const tenant = await registryClient.getTenant(tenantId);
		if (!tenant) {
			return;
		}
		const org = await registryClient.getOrg(orgId);
		if (!org || org.tenantId !== tenantId) {
			return;
		}
		const database = await connectionManager.getConnection(tenant, org);
		return { tenant, org, schemaName: org.schemaName, database };
	}

	/**
	 * Build a NewActiveUser object for creating an owner user.
	 */
	function buildOwnerActiveUser(id: number, email: string, name: string): NewActiveUser {
		return {
			id,
			email,
			name,
			role: "owner",
			roleId: null,
			isActive: true,
			image: null,
			jobTitle: null,
			phone: null,
			language: "en",
			timezone: "UTC",
			location: null,
		};
	}

	/**
	 * Demote the previous owner to member role in Manager DB (user_orgs).
	 */
	async function demotePreviousOwner(
		previousOwnerId: number | null,
		tenantId: string,
		orgId: string,
		transaction?: Transaction,
	): Promise<void> {
		if (previousOwnerId === null) {
			return;
		}
		try {
			await userOrgDao.updateRole(previousOwnerId, tenantId, orgId, "member", transaction);
			log.info({ previousOwnerId, tenantId, orgId }, "Demoted previous owner to member in user_orgs");
		} catch (error) {
			log.error({ previousOwnerId, tenantId, orgId, error }, "Failed to demote previous owner in user_orgs");
			throw error;
		}
	}

	/**
	 * Demote the previous owner to member role in Tenant DB (active_users).
	 * This is a best-effort operation - if the user doesn't exist in active_users, we skip silently.
	 */
	async function demotePreviousOwnerInTenant(
		tenantContext: TenantOrgContext,
		previousOwnerId: number | null,
	): Promise<void> {
		if (previousOwnerId === null) {
			return;
		}
		try {
			const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
			const previousOwnerActiveUser = await activeUserDao.findById(previousOwnerId);
			if (previousOwnerActiveUser) {
				await activeUserDao.update(previousOwnerId, { role: "member" });
				log.info({ previousOwnerId }, "Demoted previous owner to member in active_users");
			}
		} catch (error) {
			// Log but don't fail - the Manager DB update succeeded, this is best-effort
			log.error({ previousOwnerId, error }, "Failed to demote previous owner in active_users");
		}
	}

	/**
	 * Create or update user_orgs binding to owner role.
	 *
	 * Checks for existing binding before creating to avoid unique constraint
	 * errors that would abort the PostgreSQL transaction (all subsequent
	 * statements in an aborted transaction fail with "current transaction
	 * is aborted, commands ignored until end of transaction block").
	 */
	async function createUserOrgBinding(
		userId: number,
		tenantId: string,
		orgId: string,
		transaction?: Transaction,
	): Promise<void> {
		const existingOrgs = await userOrgDao.getOrgsForTenant(userId, tenantId);
		const hasBinding = existingOrgs.some(o => o.orgId === orgId);

		if (hasBinding) {
			await userOrgDao.updateRole(userId, tenantId, orgId, "owner", transaction);
			log.info({ userId, tenantId, orgId }, "Updated existing user_orgs binding to owner role");
			return;
		}

		await userOrgDao.createUserOrg(
			{
				userId,
				tenantId,
				orgId,
				role: "owner",
				isDefault: true,
			},
			transaction,
		);
		log.info({ userId, tenantId, orgId }, "Created user_orgs binding for owner");
	}

	/**
	 * Execute operations in a manager DB transaction.
	 */
	async function withManagerTransaction<T>(fn: (transaction: Transaction) => Promise<T>): Promise<T> {
		const transaction = await managerSequelize.transaction();
		try {
			const result = await fn(transaction);
			await transaction.commit();
			return result;
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	}

	/**
	 * Create tenant owner user and delete verification/invitation records.
	 * Uses a two-phase approach for cross-database consistency:
	 * 1. First, create the user in tenant DB (within transaction)
	 * 2. After commit, cleanup Manager DB records as best-effort
	 */
	async function createTenantOwnerAndCleanup(
		tenantContext: TenantOrgContext,
		newActiveUser: NewActiveUser,
		verificationId: number,
		invitationId: number,
	): Promise<void> {
		// Phase 1: Create user in tenant DB (critical operation)
		const tenantSequelize = tenantContext.database.sequelize;
		const tenantTransaction = await tenantSequelize.transaction();
		try {
			const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
			await activeUserDao.create(newActiveUser, tenantTransaction);
			await tenantTransaction.commit();
		} catch (error) {
			await tenantTransaction.rollback();
			throw error;
		}

		// Phase 2: Cleanup Manager DB records (best-effort after tenant commit)
		try {
			await verificationDao.deleteVerification(verificationId);
			await ownerInvitationDao.delete(invitationId);
		} catch (cleanupError) {
			// Log but don't fail - user is already created successfully
			log.error(
				{ verificationId, invitationId, error: cleanupError },
				"Failed to cleanup invitation records after owner acceptance",
			);
		}
	}

	/**
	 * Delete verification and owner_invitation records after accepting invitation.
	 */
	async function cleanupInvitationRecords(verificationId: number, invitationId: number): Promise<void> {
		await verificationDao.deleteVerification(verificationId);
		await ownerInvitationDao.delete(invitationId);
	}

	/**
	 * Create default space for the owner.
	 */
	async function createDefaultSpaceForOwner(tenantContext: TenantOrgContext, userId: number): Promise<void> {
		try {
			const spaceDao = spaceDaoProvider.getDao(tenantContext);
			await spaceDao.createDefaultSpaceIfNeeded(userId);
			log.info({ userId }, "Created default space for owner");
		} catch (error) {
			log.error(error, "Failed to create default space for owner");
			// Don't fail the invitation acceptance if space creation fails
		}
	}

	/**
	 * GET /validate
	 *
	 * Validate an owner invitation token and return invitation details.
	 * This is a public endpoint (no auth required).
	 * Query params: token
	 */
	router.get("/validate", async (req, res) => {
		try {
			const { token } = req.query;

			if (!token || typeof token !== "string") {
				log.warn("Owner invitation validation: missing token parameter");
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "missing_token",
				};
				return res.json(response);
			}

			// Verify JWT token
			const payload = ownerInvitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("Owner invitation validation: invalid or expired JWT token");
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}

			// Find owner_invitation by invitationId from JWT payload
			const invitation = await ownerInvitationDao.findById(payload.invitationId);
			if (!invitation) {
				log.warn({ invitationId: payload.invitationId }, "Owner invitation validation: invitation not found");
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "invitation_not_found",
				};
				return res.json(response);
			}

			// Find verification by invitation.verificationId
			/* v8 ignore start - defensive check for data integrity */
			if (!invitation.verificationId) {
				log.warn({ invitationId: invitation.id }, "Owner invitation validation: verification not linked");
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}
			/* v8 ignore stop */

			const verification = await verificationDao.findById(invitation.verificationId);
			if (!verification) {
				log.warn(
					{ verificationId: invitation.verificationId },
					"Owner invitation validation: verification not found",
				);
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}

			// Security check: verify tokenHash matches
			const tokenHash = ownerInvitationTokenUtil.hashToken(token);
			/* v8 ignore start - security defense against token tampering */
			if (verification.tokenHash !== tokenHash) {
				log.warn("Owner invitation validation: tokenHash mismatch - possible tampering");
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}
			/* v8 ignore stop */

			// Check if verification has expired
			if (verification.expiresAt < new Date()) {
				log.warn({ id: verification.id }, "Owner invitation validation: token expired");
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "expired_token",
				};
				return res.json(response);
			}

			// Check if verification has been used (should not happen with delete-on-accept, but check anyway)
			if (verification.usedAt) {
				log.warn({ id: verification.id }, "Owner invitation already used");
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "used_token",
				};
				return res.json(response);
			}

			// Get tenant and org info for display
			const tenant = await registryClient.getTenant(payload.tenantId);
			const org = await registryClient.getOrg(payload.orgId);
			if (!tenant || !org) {
				log.warn(
					{ tenantId: payload.tenantId, orgId: payload.orgId },
					"Owner invitation validation: tenant/org not found",
				);
				const response: ValidateOwnerInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}

			// Check if user already exists
			const existingUser = await globalUserDao.findUserByEmail(payload.email);

			log.info(
				{ invitationId: invitation.id, verificationId: verification.id, email: payload.email },
				"Owner invitation validation successful",
			);
			const response: ValidateOwnerInvitationResponse = {
				valid: true,
				invitation: {
					email: payload.email,
					name: payload.name,
					tenantName: tenant.displayName,
					organizationName: org.displayName,
					userExists: !!existingUser,
				},
			};
			return res.json(response);
		} catch (error) {
			log.error(error, "Owner invitation validation error");
			const response: ValidateOwnerInvitationResponse = {
				valid: false,
				error: "server_error",
			};
			return res.status(500).json(response);
		}
	});

	/**
	 * POST /accept-password
	 *
	 * Accept an owner invitation by creating a user account with password.
	 * This is a public endpoint (no auth required).
	 * Body: { token: string, password: string, name?: string }
	 */
	router.post("/accept-password", async (req, res) => {
		try {
			const { token, password, name } = req.body as AcceptOwnerInvitationRequest;

			if (!token || !password) {
				log.warn("Owner invitation accept: missing token or password");
				return res.status(400).json({
					success: false,
					error: "missing_fields",
					message: "Token and password are required",
				} as AcceptOwnerInvitationResponse);
			}

			// Verify JWT token
			const payload = ownerInvitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("Owner invitation accept: invalid or expired JWT token");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}

			// Validate password
			const passwordError = validatePassword(password, payload.email);
			if (passwordError) {
				log.warn({ email: payload.email }, "Owner invitation accept: password validation failed");
				return res.status(400).json({
					success: false,
					error: "invalid_password",
					message: passwordError,
				} as AcceptOwnerInvitationResponse);
			}

			// Find owner_invitation by invitationId from JWT payload
			const invitation = await ownerInvitationDao.findById(payload.invitationId);
			if (!invitation) {
				log.warn({ invitationId: payload.invitationId }, "Owner invitation accept: invitation not found");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}

			// Find verification by invitation.verificationId
			/* v8 ignore start - defensive check for data integrity */
			if (!invitation.verificationId) {
				log.warn({ invitationId: invitation.id }, "Owner invitation accept: verification not linked");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}
			/* v8 ignore stop */

			const verification = await verificationDao.findById(invitation.verificationId);
			if (!verification || verification.usedAt) {
				log.warn("Owner invitation accept: verification not found or already used");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}

			// Security check: verify tokenHash matches
			const tokenHash = ownerInvitationTokenUtil.hashToken(token);
			/* v8 ignore start - security defense against token tampering */
			if (verification.tokenHash !== tokenHash) {
				log.warn("Owner invitation accept: tokenHash mismatch - possible tampering");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}
			/* v8 ignore stop */

			// Check if token has expired
			if (verification.expiresAt < new Date()) {
				log.warn({ id: verification.id }, "Owner invitation accept: token expired");
				return res.status(400).json({
					success: false,
					error: "expired_token",
					message: "This invitation link has expired",
				} as AcceptOwnerInvitationResponse);
			}

			// Get tenant context (this also forces sync of tenant DB)
			const tenantContext = await getTenantContext(payload.tenantId, payload.orgId);
			if (!tenantContext) {
				log.warn(
					{ tenantId: payload.tenantId, orgId: payload.orgId },
					"Owner invitation accept: tenant not found",
				);
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}

			// Check if user already exists
			const existingUser = await globalUserDao.findUserByEmail(payload.email);

			if (existingUser) {
				// User exists - add password auth if they don't have one
				const existingAuth = await globalAuthDao.findAuthByUserIdAndProvider(existingUser.id, "credential");
				if (existingAuth) {
					// User already has password - they should log in instead
					log.warn({ email: payload.email }, "Owner invitation accept: user already has password auth");
					return res.status(400).json({
						success: false,
						error: "invalid_token",
						message: "You already have an account. Please log in instead.",
					} as AcceptOwnerInvitationResponse);
				}

				// Add password auth for existing user
				const passwordHash = await hash(password, argon2Options);

				await withManagerTransaction(async t => {
					await globalAuthDao.createAuth(
						{
							userId: existingUser.id,
							provider: "credential",
							providerId: existingUser.id.toString(),
							passwordHash,
						},
						t,
					);
					await demotePreviousOwner(invitation.previousOwnerId, payload.tenantId, payload.orgId, t);
					await createUserOrgBinding(existingUser.id, payload.tenantId, payload.orgId, t);
				});

				// Demote previous owner in tenant DB (best-effort)
				await demotePreviousOwnerInTenant(tenantContext, invitation.previousOwnerId);

				// Create tenant owner user
				const userName = name || payload.name || existingUser.name;
				const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
				const existingActiveUser = await activeUserDao.findByEmail(payload.email);

				if (!existingActiveUser) {
					const newActiveUser = buildOwnerActiveUser(existingUser.id, payload.email, userName);
					await createTenantOwnerAndCleanup(tenantContext, newActiveUser, verification.id, invitation.id);
				} else {
					// User already exists in tenant - promote them to owner role
					await activeUserDao.update(existingActiveUser.id, { role: "owner" });
					log.info({ userId: existingActiveUser.id }, "Promoted existing user to owner role");
					await cleanupInvitationRecords(verification.id, invitation.id);
				}

				// Create default space for owner
				await createDefaultSpaceForOwner(tenantContext, existingUser.id);

				log.info(
					{ email: payload.email, userId: existingUser.id, invitationId: invitation.id },
					"Owner invitation accepted for existing user",
				);

				runWithTenantContext(tenantContext, () => {
					auditLog({
						action: "accept",
						resourceType: "owner_invitation",
						resourceId: invitation.id,
						resourceName: payload.email,
						actorId: existingUser.id,
						actorEmail: payload.email,
						metadata: {
							method: "password",
							tenantId: payload.tenantId,
							orgId: payload.orgId,
							isExistingUser: true,
							previousOwnerId: invitation.previousOwnerId ?? null,
						},
					});
				});

				return res.json({
					success: true,
					tenantSlug: tenantContext.tenant.slug,
				} as AcceptOwnerInvitationResponse);
			}

			// Create new user
			const passwordHash = await hash(password, argon2Options);
			const userName = name || payload.name || parseNameFromEmail(payload.email);

			const globalUserId = await withManagerTransaction(async t => {
				const globalUser = await globalUserDao.createUser(
					{ email: payload.email, name: userName, isActive: true },
					t,
				);
				await globalAuthDao.createAuth(
					{
						userId: globalUser.id,
						provider: "credential",
						providerId: globalUser.id.toString(),
						passwordHash,
					},
					t,
				);
				await demotePreviousOwner(invitation.previousOwnerId, payload.tenantId, payload.orgId, t);
				await createUserOrgBinding(globalUser.id, payload.tenantId, payload.orgId, t);
				return globalUser.id;
			});

			// Demote previous owner in tenant DB (best-effort)
			await demotePreviousOwnerInTenant(tenantContext, invitation.previousOwnerId);

			// Create tenant owner user
			const newActiveUser = buildOwnerActiveUser(globalUserId, payload.email, userName);
			await createTenantOwnerAndCleanup(tenantContext, newActiveUser, verification.id, invitation.id);

			// Create default space for owner
			await createDefaultSpaceForOwner(tenantContext, globalUserId);

			log.info(
				{ email: payload.email, userId: globalUserId, invitationId: invitation.id },
				"Owner invitation accepted, new user created",
			);

			runWithTenantContext(tenantContext, () => {
				auditLog({
					action: "accept",
					resourceType: "owner_invitation",
					resourceId: invitation.id,
					resourceName: payload.email,
					actorId: globalUserId,
					actorEmail: payload.email,
					metadata: {
						method: "password",
						tenantId: payload.tenantId,
						orgId: payload.orgId,
						isExistingUser: false,
						previousOwnerId: invitation.previousOwnerId ?? null,
					},
				});
			});

			return res.json({
				success: true,
				tenantSlug: tenantContext.tenant.slug,
			} as AcceptOwnerInvitationResponse);
		} catch (error) {
			log.error(error, "Owner invitation accept error");
			return res.status(500).json({
				success: false,
				error: "server_error",
				message: "Failed to accept invitation. Please try again later.",
			} as AcceptOwnerInvitationResponse);
		}
	});

	/**
	 * POST /accept-existing-password
	 *
	 * Accept an owner invitation by logging in with existing password.
	 * For users who already have an account and registered with password.
	 * Body: { token: string, password: string }
	 */
	router.post("/accept-existing-password", async (req, res) => {
		try {
			const { token, password } = req.body as { token?: string; password?: string };

			if (!token || !password) {
				log.warn("Existing password accept: missing token or password");
				return res.status(400).json({
					success: false,
					error: "missing_fields",
					message: "Token and password are required",
				} as AcceptOwnerInvitationResponse);
			}

			// Verify JWT token
			const payload = ownerInvitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("Existing password accept: invalid or expired JWT token");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}

			// Find owner_invitation by invitationId from JWT payload
			const invitation = await ownerInvitationDao.findById(payload.invitationId);
			if (!invitation) {
				log.warn({ invitationId: payload.invitationId }, "Existing password accept: invitation not found");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}

			// Find verification by invitation.verificationId
			/* v8 ignore start - defensive check for data integrity */
			if (!invitation.verificationId) {
				log.warn({ invitationId: invitation.id }, "Existing password accept: verification not linked");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}
			/* v8 ignore stop */

			const verification = await verificationDao.findById(invitation.verificationId);
			if (!verification || verification.usedAt) {
				log.warn("Existing password accept: verification not found or already used");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}

			// Security check: verify tokenHash matches
			const tokenHash = ownerInvitationTokenUtil.hashToken(token);
			/* v8 ignore start - security defense against token tampering */
			if (verification.tokenHash !== tokenHash) {
				log.warn("Existing password accept: tokenHash mismatch - possible tampering");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}
			/* v8 ignore stop */

			// Check if token has expired
			if (verification.expiresAt < new Date()) {
				log.warn({ id: verification.id }, "Existing password accept: token expired");
				return res.status(400).json({
					success: false,
					error: "expired_token",
					message: "This invitation link has expired",
				} as AcceptOwnerInvitationResponse);
			}

			// Find existing user
			const existingUser = await globalUserDao.findUserByEmail(payload.email);
			if (!existingUser) {
				log.warn({ email: payload.email }, "Existing password accept: user not found");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "User account not found",
				} as AcceptOwnerInvitationResponse);
			}

			// Find credential auth for user
			const credentialAuth = await globalAuthDao.findAuthByUserIdAndProvider(existingUser.id, "credential");
			if (!credentialAuth || !credentialAuth.passwordHash) {
				log.warn({ email: payload.email }, "Existing password accept: no password auth found");
				return res.status(400).json({
					success: false,
					error: "invalid_password",
					message: "This account does not have password authentication. Please use social login.",
				} as AcceptOwnerInvitationResponse);
			}

			// Verify password using argon2
			const { verify } = await import("@node-rs/argon2");
			const isPasswordValid = await verify(credentialAuth.passwordHash, password);
			if (!isPasswordValid) {
				log.warn({ email: payload.email }, "Existing password accept: invalid password");
				return res.status(400).json({
					success: false,
					error: "invalid_password",
					message: "Invalid password",
				} as AcceptOwnerInvitationResponse);
			}

			// Get tenant context
			const tenantContext = await getTenantContext(payload.tenantId, payload.orgId);
			if (!tenantContext) {
				log.warn(
					{ tenantId: payload.tenantId, orgId: payload.orgId },
					"Existing password accept: tenant not found",
				);
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}

			// Create user_orgs binding and demote previous owner
			await withManagerTransaction(async t => {
				await demotePreviousOwner(invitation.previousOwnerId, payload.tenantId, payload.orgId, t);
				await createUserOrgBinding(existingUser.id, payload.tenantId, payload.orgId, t);
			});

			// Demote previous owner in tenant DB (best-effort)
			await demotePreviousOwnerInTenant(tenantContext, invitation.previousOwnerId);

			// Create or update tenant owner user
			const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
			const existingActiveUser = await activeUserDao.findByEmail(payload.email);

			if (!existingActiveUser) {
				const userName = payload.name || existingUser.name;
				const newActiveUser = buildOwnerActiveUser(existingUser.id, payload.email, userName);
				await createTenantOwnerAndCleanup(tenantContext, newActiveUser, verification.id, invitation.id);
			} else {
				// User already exists in tenant - promote them to owner role
				await activeUserDao.update(existingActiveUser.id, { role: "owner" });
				log.info({ userId: existingActiveUser.id }, "Promoted existing user to owner role");
				await cleanupInvitationRecords(verification.id, invitation.id);
			}

			// Create default space for owner
			await createDefaultSpaceForOwner(tenantContext, existingUser.id);

			log.info(
				{ email: payload.email, userId: existingUser.id, invitationId: invitation.id },
				"Owner invitation accepted via existing password",
			);

			runWithTenantContext(tenantContext, () => {
				auditLog({
					action: "accept",
					resourceType: "owner_invitation",
					resourceId: invitation.id,
					resourceName: payload.email,
					actorId: existingUser.id,
					actorEmail: payload.email,
					metadata: {
						method: "existing-password",
						tenantId: payload.tenantId,
						orgId: payload.orgId,
						previousOwnerId: invitation.previousOwnerId ?? null,
					},
				});
			});

			return res.json({
				success: true,
				tenantSlug: tenantContext.tenant.slug,
			} as AcceptOwnerInvitationResponse);
		} catch (error) {
			log.error(error, "Existing password owner invitation accept error");
			return res.status(500).json({
				success: false,
				error: "server_error",
				message: "Failed to accept invitation. Please try again later.",
			} as AcceptOwnerInvitationResponse);
		}
	});

	/**
	 * POST /accept-social
	 *
	 * Accept an owner invitation using OAuth authentication.
	 * Requires user to be authenticated via OAuth (session cookie).
	 * Body: { token: string }
	 */
	router.post("/accept-social", async (req, res) => {
		try {
			if (!getSessionFromRequest) {
				log.error("OAuth accept: getSessionFromRequest not configured");
				return res.status(500).json({
					success: false,
					error: "server_error",
					message: "OAuth acceptance not configured",
				} as AcceptOwnerInvitationResponse);
			}

			// Get authenticated user from session
			const session = await getSessionFromRequest(req);
			if (!session?.user) {
				log.warn("OAuth accept: no authenticated session");
				return res.status(401).json({
					success: false,
					error: "server_error",
					message: "Not authenticated. Please sign in with Google or GitHub first.",
				} as AcceptOwnerInvitationResponse);
			}

			const { token } = req.body as AcceptOwnerInvitationOAuthRequest;

			if (!token) {
				log.warn("OAuth accept: missing token");
				return res.status(400).json({
					success: false,
					error: "missing_fields",
					message: "Invitation token is required",
				} as AcceptOwnerInvitationResponse);
			}

			// Verify JWT token
			const payload = ownerInvitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("OAuth accept: invalid or expired JWT token");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}

			// Verify email matches invitation
			if (session.user.email.toLowerCase() !== payload.email.toLowerCase()) {
				log.warn(
					{ sessionEmail: session.user.email, invitationEmail: payload.email },
					"OAuth accept: email mismatch",
				);
				return res.status(400).json({
					success: false,
					error: "email_mismatch",
					message: `This invitation is for ${payload.email}. Please sign in with that email address.`,
				} as AcceptOwnerInvitationResponse);
			}

			// Find owner_invitation by invitationId from JWT payload
			const invitation = await ownerInvitationDao.findById(payload.invitationId);
			if (!invitation) {
				log.warn({ invitationId: payload.invitationId }, "OAuth accept: invitation not found");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}

			// Find verification by invitation.verificationId
			/* v8 ignore start - defensive check for data integrity */
			if (!invitation.verificationId) {
				log.warn({ invitationId: invitation.id }, "OAuth accept: verification not linked");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}
			/* v8 ignore stop */

			const verification = await verificationDao.findById(invitation.verificationId);
			if (!verification || verification.usedAt) {
				log.warn("OAuth accept: verification not found or already used");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already used",
				} as AcceptOwnerInvitationResponse);
			}

			// Security check: verify tokenHash matches
			const tokenHash = ownerInvitationTokenUtil.hashToken(token);
			/* v8 ignore start - security defense against token tampering */
			if (verification.tokenHash !== tokenHash) {
				log.warn("OAuth accept: tokenHash mismatch - possible tampering");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}
			/* v8 ignore stop */

			// Check if token has expired
			if (verification.expiresAt < new Date()) {
				log.warn({ id: verification.id }, "OAuth accept: token expired");
				return res.status(400).json({
					success: false,
					error: "expired_token",
					message: "This invitation link has expired",
				} as AcceptOwnerInvitationResponse);
			}

			// Get tenant context
			const tenantContext = await getTenantContext(payload.tenantId, payload.orgId);
			if (!tenantContext) {
				log.warn({ tenantId: payload.tenantId, orgId: payload.orgId }, "OAuth accept: tenant not found");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}

			// Get global user (OAuth should have created them)
			const globalUser = await globalUserDao.findUserByEmail(session.user.email);
			if (!globalUser) {
				log.error({ email: session.user.email }, "OAuth accept: OAuth user not found in global users");
				return res.status(500).json({
					success: false,
					error: "server_error",
					message: "User account not found. Please try signing in again.",
				} as AcceptOwnerInvitationResponse);
			}

			// Create user_orgs binding and demote previous owner
			await withManagerTransaction(async t => {
				await demotePreviousOwner(invitation.previousOwnerId, payload.tenantId, payload.orgId, t);
				await createUserOrgBinding(globalUser.id, payload.tenantId, payload.orgId, t);
			});

			// Demote previous owner in tenant DB (best-effort)
			await demotePreviousOwnerInTenant(tenantContext, invitation.previousOwnerId);

			// Create tenant owner user if needed
			const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
			const existingActiveUser = await activeUserDao.findByEmail(session.user.email);

			if (!existingActiveUser) {
				const userName = payload.name || session.user.name || parseNameFromEmail(session.user.email);
				const newActiveUser = buildOwnerActiveUser(globalUser.id, session.user.email, userName);
				await createTenantOwnerAndCleanup(tenantContext, newActiveUser, verification.id, invitation.id);
			} else {
				// User already exists in tenant - promote them to owner role
				await activeUserDao.update(existingActiveUser.id, { role: "owner" });
				log.info({ userId: existingActiveUser.id }, "Promoted existing user to owner role");
				await cleanupInvitationRecords(verification.id, invitation.id);
			}

			// Create default space for owner
			await createDefaultSpaceForOwner(tenantContext, globalUser.id);

			log.info(
				{ email: session.user.email, userId: globalUser.id, invitationId: invitation.id },
				"Owner invitation accepted via OAuth",
			);

			runWithTenantContext(tenantContext, () => {
				auditLog({
					action: "accept",
					resourceType: "owner_invitation",
					resourceId: invitation.id,
					resourceName: payload.email,
					actorId: globalUser.id,
					actorEmail: session.user.email,
					metadata: {
						method: "social",
						tenantId: payload.tenantId,
						orgId: payload.orgId,
						previousOwnerId: invitation.previousOwnerId ?? null,
					},
				});
			});

			return res.json({
				success: true,
				tenantSlug: tenantContext.tenant.slug,
			} as AcceptOwnerInvitationResponse);
		} catch (error) {
			log.error(error, "OAuth owner invitation accept error");
			return res.status(500).json({
				success: false,
				error: "server_error",
				message: "Failed to accept invitation. Please try again later.",
			} as AcceptOwnerInvitationResponse);
		}
	});

	/**
	 * POST /decline
	 *
	 * Decline an owner invitation.
	 * This is a public endpoint (no auth required).
	 * Body: { token: string }
	 */
	router.post("/decline", async (req, res) => {
		try {
			const { token } = req.body as { token?: string };

			if (!token) {
				log.warn("Owner invitation decline: missing token");
				return res.status(400).json({
					success: false,
					error: "missing_fields",
					message: "Token is required",
				} as AcceptOwnerInvitationResponse);
			}

			// Verify JWT token
			const payload = ownerInvitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("Owner invitation decline: invalid or expired JWT token");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}

			// Find owner_invitation by invitationId from JWT payload
			const invitation = await ownerInvitationDao.findById(payload.invitationId);
			if (!invitation) {
				log.warn({ invitationId: payload.invitationId }, "Owner invitation decline: invitation not found");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already processed",
				} as AcceptOwnerInvitationResponse);
			}

			// Find verification by invitation.verificationId
			/* v8 ignore start - defensive check for data integrity */
			if (!invitation.verificationId) {
				log.warn({ invitationId: invitation.id }, "Owner invitation decline: verification not linked");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already processed",
				} as AcceptOwnerInvitationResponse);
			}
			/* v8 ignore stop */

			const verification = await verificationDao.findById(invitation.verificationId);
			if (!verification || verification.usedAt) {
				log.warn("Owner invitation decline: verification not found or already used");
				return res.status(400).json({
					success: false,
					error: "invitation_not_found",
					message: "Invitation not found or already processed",
				} as AcceptOwnerInvitationResponse);
			}

			// Security check: verify tokenHash matches
			const tokenHash = ownerInvitationTokenUtil.hashToken(token);
			/* v8 ignore start - security defense against token tampering */
			if (verification.tokenHash !== tokenHash) {
				log.warn("Owner invitation decline: tokenHash mismatch - possible tampering");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				} as AcceptOwnerInvitationResponse);
			}
			/* v8 ignore stop */

			// Delete verification and owner_invitation records (declined)
			await cleanupInvitationRecords(verification.id, invitation.id);

			log.info({ invitationId: invitation.id, email: payload.email }, "Owner invitation declined");

			const tenantContext = await getTenantContext(payload.tenantId, payload.orgId);
			if (tenantContext) {
				runWithTenantContext(tenantContext, () => {
					auditLog({
						action: "decline",
						resourceType: "owner_invitation",
						resourceId: invitation.id,
						resourceName: payload.email,
						actorEmail: payload.email,
						metadata: { tenantId: payload.tenantId, orgId: payload.orgId },
					});
				});
			}

			return res.json({ success: true } as AcceptOwnerInvitationResponse);
		} catch (error) {
			log.error(error, "Owner invitation decline error");
			return res.status(500).json({
				success: false,
				error: "server_error",
				message: "Failed to decline invitation. Please try again later.",
			} as AcceptOwnerInvitationResponse);
		}
	});

	return router;
}
