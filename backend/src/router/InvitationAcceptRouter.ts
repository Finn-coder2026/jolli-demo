/**
 * InvitationAcceptRouter - Endpoints for accepting user invitations.
 *
 * Provides public endpoints (no auth required) for:
 * - Validating invitation tokens
 * - Accepting invitations with password setup
 */

import { auditLog } from "../audit";
import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GlobalAuthDao } from "../dao/GlobalAuthDao";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { UserInvitationDao } from "../dao/UserInvitationDao";
import type { UserOrgDao } from "../dao/UserOrgDao";
import type { VerificationDao } from "../dao/VerificationDao";
import type { NewActiveUser, OrgUserRole } from "../model/ActiveUser";
import { runWithTenantContext, type TenantOrgContext } from "../tenant/TenantContext";
import type { InvitationTokenUtil } from "../util/InvitationTokenUtil";
import { getLog } from "../util/Logger";
import { parseNameFromEmail } from "../util/NameUtil";
import { hash } from "@node-rs/argon2";
import express, { type Router } from "express";
import { type PasswordValidationError, validatePassword as validatePasswordShared } from "jolli-common";
import type { Sequelize, Transaction } from "sequelize";

const log = getLog(import.meta);

/**
 * Argon2id options for password hashing (matches BetterAuthConfig)
 * Algorithm values: 0 = Argon2d, 1 = Argon2i, 2 = Argon2id
 */
const argon2Options = {
	algorithm: 2 as const, // Argon2id
	memoryCost: 1 << 16, // 65536 KiB = 64 MiB (2^16 KiB)
	timeCost: 3,
	parallelism: 4,
	outputLen: 32,
};

/**
 * Request body for accepting invitation with password.
 */
export interface AcceptInvitationRequest {
	token: string;
	password: string;
	name?: string;
}

/**
 * Response for invitation validation.
 */
export interface ValidateInvitationResponse {
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
		role: OrgUserRole;
		name: string | null;
		organizationName: string;
		userExists: boolean;
		hasCredential: boolean;
	};
}

/**
 * Response for accepting invitation.
 */
export interface AcceptInvitationResponse {
	success: boolean;
	error?:
		| "missing_fields"
		| "invalid_token"
		| "expired_token"
		| "used_token"
		| "invitation_not_found"
		| "invalid_password"
		| "user_exists"
		| "email_mismatch"
		| "server_error";
	message?: string;
}

/**
 * Request body for accepting invitation via OAuth.
 */
export interface AcceptInvitationOAuthRequest {
	token: string;
}

/**
 * Request body for accepting invitation with existing password.
 */
export interface AcceptInvitationExistingPasswordRequest {
	token: string;
	password: string;
}
/**
 * Dependencies for the invitation accept router.
 */
export interface InvitationAcceptRouterDependencies {
	invitationTokenUtil: InvitationTokenUtil;
	verificationDao: VerificationDao;
	globalUserDao: GlobalUserDao;
	globalAuthDao: GlobalAuthDao;
	userOrgDao: UserOrgDao;
	userInvitationDaoProvider: DaoProvider<UserInvitationDao>;
	activeUserDaoProvider: DaoProvider<ActiveUserDao>;
	getTenantContextByTenantId: (tenantId: string, orgId: string) => Promise<TenantOrgContext | undefined>;
	getSessionFromRequest?: (
		req: express.Request,
	) => Promise<{ user: { id: string; email: string; name: string } } | null>;
	/** Sequelize instance for the Manager DB (for transactions) */
	managerSequelize: Sequelize;
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
 * Validate password against rules (matches BetterAuthConfig password rules).
 * Uses shared validation from jolli-common.
 */
function validatePassword(password: string, email: string): string | null {
	const result = validatePasswordShared(password, email);
	if (!result.valid && result.error) {
		return passwordErrorMessages[result.error];
	}
	return null;
}

/**
 * Create the invitation accept router.
 */
export function createInvitationAcceptRouter(deps: InvitationAcceptRouterDependencies): Router {
	const router = express.Router();
	const {
		invitationTokenUtil,
		verificationDao,
		globalUserDao,
		globalAuthDao,
		userOrgDao,
		userInvitationDaoProvider,
		activeUserDaoProvider,
		getTenantContextByTenantId,
		getSessionFromRequest,
		managerSequelize,
	} = deps;

	/**
	 * Create user_orgs binding if it doesn't exist.
	 * Ignores unique constraint violations (record already exists).
	 */
	async function createUserOrgBinding(
		userId: number,
		tenantId: string,
		orgId: string,
		role: OrgUserRole,
		transaction?: Transaction,
	): Promise<void> {
		try {
			await userOrgDao.createUserOrg(
				{
					userId,
					tenantId,
					orgId,
					role,
					isDefault: true, // First org for user is default
				},
				transaction,
			);
			log.info({ userId, tenantId, orgId, role }, "Created user_orgs binding");
		} catch (error) {
			// Check if it's a unique constraint violation (user_orgs already exists)
			const err = error as { name?: string; parent?: { code?: string } };
			if (err.name === "SequelizeUniqueConstraintError" || err.parent?.code === "23505") {
				log.debug({ userId, tenantId, orgId }, "User_orgs binding already exists");
				return;
			}
			throw error;
		}
	}

	/**
	 * Build a NewActiveUser object for creating a tenant user.
	 */
	function buildNewActiveUser(id: number, email: string, name: string, role: OrgUserRole): NewActiveUser {
		return {
			id,
			email,
			name,
			role,
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
	 * Create tenant user and mark invitation as accepted.
	 * Handles transaction for tenant DB operations.
	 */
	async function createTenantUserAndAcceptInvitation(
		tenantContext: TenantOrgContext,
		newActiveUser: NewActiveUser,
		invitationId: number,
	): Promise<void> {
		const tenantSequelize = tenantContext.database.sequelize;
		const tenantTransaction = await tenantSequelize.transaction();
		try {
			const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
			await activeUserDao.create(newActiveUser, tenantTransaction);
			const userInvitationDao = userInvitationDaoProvider.getDao(tenantContext);
			await userInvitationDao.markAccepted(invitationId, tenantTransaction);
			await tenantTransaction.commit();
		} catch (error) {
			await tenantTransaction.rollback();
			throw error;
		}
	}

	/**
	 * Check if a verification record is valid (not expired or used).
	 * Returns null if valid, or an error type string if invalid.
	 */
	function checkVerificationValidity(
		verification: { expiresAt: Date; usedAt?: Date | null; id: number },
		context: string,
	): "expired_token" | "used_token" | null {
		const now = new Date();
		if (verification.expiresAt < now) {
			log.warn({ id: verification.id }, "%s: token expired", context);
			return "expired_token";
		}
		if (verification.usedAt) {
			log.warn({ id: verification.id }, "%s: token already used", context);
			return "used_token";
		}
		return null;
	}

	/**
	 * Build an error response for verification errors.
	 */
	function makeVerificationErrorResponse(error: "expired_token" | "used_token"): AcceptInvitationResponse {
		const messages: Record<"expired_token" | "used_token", string> = {
			expired_token: "This invitation link has expired",
			used_token: "This invitation has already been used",
		};
		return { success: false, error, message: messages[error] };
	}

	/**
	 * Build a standard error response.
	 */
	function makeErrorResponse(
		error: NonNullable<AcceptInvitationResponse["error"]>,
		message: string,
	): AcceptInvitationResponse {
		return { success: false, error, message };
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
	 * Result of invitation verification lookup.
	 * When validation succeeds, both invitation and verification are guaranteed to be defined.
	 */
	interface InvitationVerificationResult {
		invitation: NonNullable<Awaited<ReturnType<UserInvitationDao["findById"]>>>;
		verification: NonNullable<Awaited<ReturnType<VerificationDao["findById"]>>>;
	}

	/**
	 * Validate invitation and verification by invitationId.
	 * Returns the invitation and verification if valid, or an error response if invalid.
	 */
	async function validateInvitationAndVerification(
		tenantContext: TenantOrgContext,
		invitationId: number,
		token: string,
		context: string,
	): Promise<
		{ success: true; result: InvitationVerificationResult } | { success: false; error: AcceptInvitationResponse }
	> {
		const userInvitationDao = userInvitationDaoProvider.getDao(tenantContext);
		const invitation = await userInvitationDao.findById(invitationId);

		if (!invitation || invitation.status !== "pending") {
			log.warn({ invitationId }, "%s: invitation not found or not pending", context);
			return {
				success: false,
				error: makeErrorResponse("invitation_not_found", "Invitation not found or already used"),
			};
		}

		/* v8 ignore start - defensive check for data integrity */
		if (!invitation.verificationId) {
			log.warn({ invitationId: invitation.id }, "%s: verification not linked", context);
			return { success: false, error: makeErrorResponse("invalid_token", "Invalid invitation link") };
		}
		/* v8 ignore stop */

		const verification = await verificationDao.findById(invitation.verificationId);
		if (!verification) {
			log.warn({ verificationId: invitation.verificationId }, "%s: verification not found", context);
			return { success: false, error: makeErrorResponse("invalid_token", "Invalid invitation link") };
		}

		// Security check: verify tokenHash matches
		const tokenHash = invitationTokenUtil.hashToken(token);
		/* v8 ignore start - security defense against token tampering */
		if (verification.tokenHash !== tokenHash) {
			log.warn("%s: tokenHash mismatch - possible tampering", context);
			return { success: false, error: makeErrorResponse("invalid_token", "Invalid invitation link") };
		}
		/* v8 ignore stop */

		// Check if verification is valid (not expired or used)
		const verificationError = checkVerificationValidity(verification, context);
		if (verificationError) {
			return { success: false, error: makeVerificationErrorResponse(verificationError) };
		}

		return { success: true, result: { invitation, verification } };
	}

	/**
	 * GET /validate
	 *
	 * Validate an invitation token and return invitation details.
	 * This is a public endpoint (no auth required).
	 * Query params: token
	 */
	router.get("/validate", async (req, res) => {
		try {
			const { token } = req.query;

			// Check if token parameter is provided
			if (!token || typeof token !== "string") {
				log.warn("Invitation validation: missing token parameter");
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "missing_token",
				};
				return res.json(response);
			}

			// Verify JWT token
			const payload = invitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("Invitation validation: invalid or expired JWT token");
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}

			// Get tenant context to access the invitation
			const tenantContext = await getTenantContextByTenantId(payload.tenantId, payload.orgId);
			if (!tenantContext) {
				log.warn(
					{ tenantId: payload.tenantId, orgId: payload.orgId },
					"Invitation validation: tenant not found",
				);
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}

			// Find the invitation in the tenant database by invitationId from JWT
			const userInvitationDao = userInvitationDaoProvider.getDao(tenantContext);
			const invitation = await userInvitationDao.findById(payload.invitationId);

			if (!invitation) {
				log.warn({ invitationId: payload.invitationId }, "Invitation validation: invitation not found");
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "invitation_not_found",
				};
				return res.json(response);
			}

			// Check invitation status
			if (invitation.status !== "pending") {
				log.warn({ invitationId: payload.invitationId, status: invitation.status }, "Invitation not pending");
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "used_token",
				};
				return res.json(response);
			}

			// Find verification by invitation.verificationId
			/* v8 ignore start - defensive check for data integrity */
			if (!invitation.verificationId) {
				log.warn({ invitationId: invitation.id }, "Invitation validation: verification not linked");
				const response: ValidateInvitationResponse = {
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
					"Invitation validation: verification not found",
				);
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}

			// Security check: verify tokenHash matches
			const tokenHash = invitationTokenUtil.hashToken(token);
			/* v8 ignore start - security defense against token tampering */
			if (verification.tokenHash !== tokenHash) {
				log.warn("Invitation validation: tokenHash mismatch - possible tampering");
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "invalid_token",
				};
				return res.json(response);
			}
			/* v8 ignore stop */

			// Check if token has expired
			const now = new Date();
			if (verification.expiresAt < now) {
				log.warn({ id: verification.id }, "Invitation validation: token expired");
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "expired_token",
				};
				return res.json(response);
			}

			// Check if token has already been used
			if (verification.usedAt) {
				log.warn({ id: verification.id }, "Invitation validation: token already used");
				const response: ValidateInvitationResponse = {
					valid: false,
					error: "used_token",
				};
				return res.json(response);
			}

			// Token is valid - return invitation details
			const existingUser = await globalUserDao.findUserByEmail(payload.email);
			let hasCredential = false;
			if (existingUser) {
				const credentialAuth = await globalAuthDao.findAuthByUserIdAndProvider(existingUser.id, "credential");
				hasCredential = !!credentialAuth?.passwordHash;
			}

			log.info({ invitationId: payload.invitationId, email: payload.email }, "Invitation validation successful");
			const response: ValidateInvitationResponse = {
				valid: true,
				invitation: {
					email: payload.email,
					role: payload.role,
					name: invitation.name,
					organizationName: tenantContext.org.displayName,
					userExists: !!existingUser,
					hasCredential,
				},
			};
			return res.json(response);
		} catch (error) {
			log.error(error, "Invitation validation error");
			const response: ValidateInvitationResponse = {
				valid: false,
				error: "server_error",
			};
			return res.status(500).json(response);
		}
	});

	/**
	 * POST /accept-password
	 *
	 * Accept an invitation by creating a user account with password.
	 * This is a public endpoint (no auth required).
	 * Body: { token: string, password: string, name?: string }
	 */
	router.post("/accept-password", async (req, res) => {
		try {
			const { token, password, name } = req.body as AcceptInvitationRequest;

			// Validate required fields
			if (!token || !password) {
				log.warn("Invitation accept: missing token or password");
				return res.status(400).json(makeErrorResponse("missing_fields", "Token and password are required"));
			}

			// Verify JWT token
			const payload = invitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("Invitation accept: invalid or expired JWT token");
				return res.status(400).json(makeErrorResponse("invalid_token", "Invalid invitation link"));
			}

			// Validate password
			const passwordError = validatePassword(password, payload.email);
			if (passwordError) {
				log.warn({ email: payload.email }, "Invitation accept: password validation failed");
				return res.status(400).json(makeErrorResponse("invalid_password", passwordError));
			}

			// Get tenant context
			const tenantContext = await getTenantContextByTenantId(payload.tenantId, payload.orgId);
			if (!tenantContext) {
				log.warn({ tenantId: payload.tenantId, orgId: payload.orgId }, "Invitation accept: tenant not found");
				return res.status(400).json(makeErrorResponse("invalid_token", "Invalid invitation link"));
			}

			// Validate invitation and verification
			const validationResult = await validateInvitationAndVerification(
				tenantContext,
				payload.invitationId,
				token,
				"Invitation accept",
			);
			if (!validationResult.success) {
				return res.status(400).json(validationResult.error);
			}
			const { invitation, verification } = validationResult.result;

			// Check if user already exists in global users
			const existingUser = await globalUserDao.findUserByEmail(payload.email);
			if (existingUser) {
				// User already exists - check if they already have a credential auth
				const existingAuth = await globalAuthDao.findAuthByUserIdAndProvider(existingUser.id, "credential");
				if (existingAuth) {
					log.warn({ email: payload.email }, "Invitation accept: user already has password auth");
					return res
						.status(409)
						.json(
							makeErrorResponse(
								"user_exists",
								"An account with this email already exists. Please use the login page.",
							),
						);
				}

				// User exists but no credential auth - this is an OAuth user
				// Add password authentication and create tenant user

				// Hash password
				const passwordHash = await hash(password, argon2Options);

				// Manager DB transaction: create auth, create user_orgs, delete verification
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
					await createUserOrgBinding(existingUser.id, payload.tenantId, payload.orgId, payload.role, t);
					await verificationDao.deleteVerification(verification.id, t);
				});

				// Tenant DB transaction: create active user (if needed), mark invitation accepted
				const tenantSequelize = tenantContext.database.sequelize;
				const tenantTransaction = await tenantSequelize.transaction();
				try {
					const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
					const userInvitationDao = userInvitationDaoProvider.getDao(tenantContext);
					const existingActiveUser = await activeUserDao.findByEmail(payload.email);

					if (!existingActiveUser) {
						const userName = name || invitation.name || existingUser.name;
						const newActiveUser = buildNewActiveUser(
							existingUser.id,
							payload.email,
							userName,
							payload.role,
						);
						await activeUserDao.create(newActiveUser, tenantTransaction);
					}
					await userInvitationDao.markAccepted(payload.invitationId, tenantTransaction);
					await tenantTransaction.commit();
				} catch (error) {
					await tenantTransaction.rollback();
					throw error;
				}

				log.info(
					{ email: payload.email, userId: existingUser.id, invitationId: payload.invitationId },
					"Invitation accepted for existing OAuth user",
				);

				runWithTenantContext(tenantContext, () => {
					auditLog({
						action: "accept",
						resourceType: "user_invitation",
						resourceId: payload.invitationId,
						resourceName: payload.email,
						actorId: existingUser.id,
						actorEmail: payload.email,
						metadata: {
							method: "password",
							tenantId: payload.tenantId,
							orgId: payload.orgId,
							role: payload.role,
						},
					});
				});

				const response: AcceptInvitationResponse = {
					success: true,
				};
				return res.json(response);
			}

			// Create new user

			// Hash password
			const newPasswordHash = await hash(password, argon2Options);
			const userName = name || invitation.name || parseNameFromEmail(payload.email);

			// Manager DB transaction: create global user, create auth, create user_orgs, delete verification
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
						passwordHash: newPasswordHash,
					},
					t,
				);
				await createUserOrgBinding(globalUser.id, payload.tenantId, payload.orgId, payload.role, t);
				await verificationDao.deleteVerification(verification.id, t);
				return globalUser.id;
			});

			// Tenant DB transaction: create active user, mark invitation accepted
			const newActiveUser = buildNewActiveUser(globalUserId, payload.email, userName, payload.role);
			await createTenantUserAndAcceptInvitation(tenantContext, newActiveUser, payload.invitationId);

			log.info(
				{ email: payload.email, userId: globalUserId, invitationId: payload.invitationId },
				"Invitation accepted, new user created",
			);

			runWithTenantContext(tenantContext, () => {
				auditLog({
					action: "accept",
					resourceType: "user_invitation",
					resourceId: payload.invitationId,
					resourceName: payload.email,
					actorId: globalUserId,
					actorEmail: payload.email,
					metadata: {
						method: "password",
						tenantId: payload.tenantId,
						orgId: payload.orgId,
						role: payload.role,
					},
				});
			});

			const response: AcceptInvitationResponse = {
				success: true,
			};
			return res.json(response);
		} catch (error) {
			log.error(error, "Invitation accept error");
			const response: AcceptInvitationResponse = {
				success: false,
				error: "server_error",
				message: "Failed to accept invitation. Please try again later.",
			};
			return res.status(500).json(response);
		}
	});

	/**
	 * POST /accept-social
	 *
	 * Accept an invitation using OAuth authentication.
	 * Requires user to be authenticated via OAuth (session cookie).
	 * Body: { token: string }
	 */
	router.post("/accept-social", async (req, res) => {
		try {
			// Check if getSessionFromRequest is provided
			if (!getSessionFromRequest) {
				log.error("OAuth accept: getSessionFromRequest not configured");
				const response: AcceptInvitationResponse = {
					success: false,
					error: "server_error",
					message: "OAuth acceptance not configured",
				};
				return res.status(500).json(response);
			}

			// Get authenticated user from session
			const session = await getSessionFromRequest(req);
			if (!session?.user) {
				log.warn("OAuth accept: no authenticated session");
				const response: AcceptInvitationResponse = {
					success: false,
					error: "server_error",
					message: "Not authenticated. Please sign in with Google or GitHub first.",
				};
				return res.status(401).json(response);
			}

			const { token } = req.body as AcceptInvitationOAuthRequest;

			// Validate required fields
			if (!token) {
				log.warn("OAuth accept: missing token");
				const response: AcceptInvitationResponse = {
					success: false,
					error: "missing_fields",
					message: "Invitation token is required",
				};
				return res.status(400).json(response);
			}

			// Verify JWT token
			const payload = invitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("OAuth accept: invalid or expired JWT token");
				const response: AcceptInvitationResponse = {
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				};
				return res.status(400).json(response);
			}

			// Verify email matches invitation
			if (session.user.email.toLowerCase() !== payload.email.toLowerCase()) {
				log.warn(
					{ sessionEmail: session.user.email, invitationEmail: payload.email },
					"OAuth accept: email mismatch",
				);
				const response: AcceptInvitationResponse = {
					success: false,
					error: "email_mismatch",
					message: `This invitation is for ${payload.email}. Please sign in with that email address.`,
				};
				return res.status(400).json(response);
			}

			// Get tenant context
			const tenantContext = await getTenantContextByTenantId(payload.tenantId, payload.orgId);
			if (!tenantContext) {
				log.warn({ tenantId: payload.tenantId, orgId: payload.orgId }, "OAuth accept: tenant not found");
				const response: AcceptInvitationResponse = {
					success: false,
					error: "invalid_token",
					message: "Invalid invitation link",
				};
				return res.status(400).json(response);
			}

			// Validate invitation and verification
			const validationResult = await validateInvitationAndVerification(
				tenantContext,
				payload.invitationId,
				token,
				"OAuth accept",
			);
			if (!validationResult.success) {
				return res.status(400).json(validationResult.error);
			}
			const { invitation, verification } = validationResult.result;

			// Get or verify the global user (OAuth should have created them already)
			const globalUser = await globalUserDao.findUserByEmail(session.user.email);
			if (!globalUser) {
				log.error({ email: session.user.email }, "OAuth accept: OAuth user not found in global users");
				const response: AcceptInvitationResponse = {
					success: false,
					error: "server_error",
					message: "User account not found. Please try signing in again.",
				};
				return res.status(500).json(response);
			}

			// Use transactions to ensure atomicity
			// Manager DB transaction: create user_orgs, delete verification
			const managerTransaction = await managerSequelize.transaction();
			try {
				await createUserOrgBinding(
					globalUser.id,
					payload.tenantId,
					payload.orgId,
					payload.role,
					managerTransaction,
				);
				await verificationDao.deleteVerification(verification.id, managerTransaction);
				await managerTransaction.commit();
			} catch (error) {
				await managerTransaction.rollback();
				throw error;
			}

			// Tenant DB transaction: create active user (if needed), mark invitation accepted
			const tenantSequelize = tenantContext.database.sequelize;
			const tenantTransaction = await tenantSequelize.transaction();
			try {
				const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
				const userInvitationDao = userInvitationDaoProvider.getDao(tenantContext);
				const existingActiveUser = await activeUserDao.findByEmail(session.user.email);

				if (existingActiveUser) {
					log.info(
						{ email: session.user.email, userId: globalUser.id },
						"OAuth accept: user already exists in tenant",
					);
				} else {
					const userName = invitation.name || session.user.name || parseNameFromEmail(session.user.email);
					const newActiveUser = buildNewActiveUser(globalUser.id, session.user.email, userName, payload.role);
					await activeUserDao.create(newActiveUser, tenantTransaction);
				}
				await userInvitationDao.markAccepted(payload.invitationId, tenantTransaction);
				await tenantTransaction.commit();
			} catch (error) {
				await tenantTransaction.rollback();
				throw error;
			}

			log.info(
				{ email: session.user.email, userId: globalUser.id, invitationId: payload.invitationId },
				"Invitation accepted via OAuth",
			);

			runWithTenantContext(tenantContext, () => {
				auditLog({
					action: "accept",
					resourceType: "user_invitation",
					resourceId: payload.invitationId,
					resourceName: payload.email,
					actorId: globalUser.id,
					actorEmail: session.user.email,
					metadata: {
						method: "social",
						tenantId: payload.tenantId,
						orgId: payload.orgId,
						role: payload.role,
					},
				});
			});

			const response: AcceptInvitationResponse = {
				success: true,
			};
			return res.json(response);
		} catch (error) {
			log.error(error, "OAuth invitation accept error");
			const response: AcceptInvitationResponse = {
				success: false,
				error: "server_error",
				message: "Failed to accept invitation. Please try again later.",
			};
			return res.status(500).json(response);
		}
	});

	/**
	 * POST /accept-existing-password
	 *
	 * Accept an invitation by confirming existing password.
	 * This is a public endpoint (no auth required).
	 * Body: { token: string, password: string }
	 */
	router.post("/accept-existing-password", async (req, res) => {
		try {
			const { token, password } = req.body as AcceptInvitationExistingPasswordRequest;

			if (!token || !password) {
				log.warn("Existing password accept: missing token or password");
				return res.status(400).json(makeErrorResponse("missing_fields", "Token and password are required"));
			}

			// Verify JWT token
			const payload = invitationTokenUtil.verifyToken(token);
			if (!payload) {
				log.warn("Existing password accept: invalid or expired JWT token");
				return res.status(400).json(makeErrorResponse("invalid_token", "Invalid invitation link"));
			}

			// Get tenant context
			const tenantContext = await getTenantContextByTenantId(payload.tenantId, payload.orgId);
			if (!tenantContext) {
				log.warn(
					{ tenantId: payload.tenantId, orgId: payload.orgId },
					"Existing password accept: tenant not found",
				);
				return res.status(400).json(makeErrorResponse("invalid_token", "Invalid invitation link"));
			}

			// Validate invitation and verification
			const validationResult = await validateInvitationAndVerification(
				tenantContext,
				payload.invitationId,
				token,
				"Existing password accept",
			);
			if (!validationResult.success) {
				return res.status(400).json(validationResult.error);
			}
			const { invitation, verification } = validationResult.result;

			// Find existing user
			const existingUser = await globalUserDao.findUserByEmail(payload.email);
			if (!existingUser) {
				log.warn({ email: payload.email }, "Existing password accept: user not found");
				return res.status(400).json(makeErrorResponse("invalid_token", "User account not found"));
			}

			// Find credential auth for user
			const credentialAuth = await globalAuthDao.findAuthByUserIdAndProvider(existingUser.id, "credential");
			if (!credentialAuth?.passwordHash) {
				log.warn({ email: payload.email }, "Existing password accept: no password auth found");
				return res
					.status(400)
					.json(
						makeErrorResponse(
							"invalid_password",
							"This account does not have password authentication. Please set a password first.",
						),
					);
			}

			const { verify } = await import("@node-rs/argon2");
			const isPasswordValid = await verify(credentialAuth.passwordHash, password);
			if (!isPasswordValid) {
				log.warn({ email: payload.email }, "Existing password accept: invalid password");
				return res.status(400).json(makeErrorResponse("invalid_password", "Invalid password"));
			}

			// Manager DB transaction: create user_orgs, delete verification
			await withManagerTransaction(async t => {
				await createUserOrgBinding(existingUser.id, payload.tenantId, payload.orgId, payload.role, t);
				await verificationDao.deleteVerification(verification.id, t);
			});

			// Tenant DB transaction: create active user (if needed), mark invitation accepted
			const tenantSequelize = tenantContext.database.sequelize;
			const tenantTransaction = await tenantSequelize.transaction();
			try {
				const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
				const userInvitationDao = userInvitationDaoProvider.getDao(tenantContext);
				const existingActiveUser = await activeUserDao.findByEmail(payload.email);

				if (!existingActiveUser) {
					const userName = invitation.name || existingUser.name || parseNameFromEmail(payload.email);
					const newActiveUser = buildNewActiveUser(existingUser.id, payload.email, userName, payload.role);
					await activeUserDao.create(newActiveUser, tenantTransaction);
				}
				await userInvitationDao.markAccepted(payload.invitationId, tenantTransaction);
				await tenantTransaction.commit();
			} catch (error) {
				await tenantTransaction.rollback();
				throw error;
			}

			log.info(
				{ email: payload.email, userId: existingUser.id, invitationId: payload.invitationId },
				"Invitation accepted via existing password",
			);

			runWithTenantContext(tenantContext, () => {
				auditLog({
					action: "accept",
					resourceType: "user_invitation",
					resourceId: payload.invitationId.toString(),
					resourceName: payload.email,
					actorId: existingUser.id,
					actorEmail: payload.email,
					metadata: {
						method: "existing_password",
						tenantId: payload.tenantId,
						orgId: payload.orgId,
						role: payload.role,
					},
				});
			});

			return res.json({ success: true } as AcceptInvitationResponse);
		} catch (error) {
			log.error(error, "Existing password invitation accept error");
			return res.status(500).json({
				success: false,
				error: "server_error",
				message: "Failed to accept invitation. Please try again later.",
			} as AcceptInvitationResponse);
		}
	});

	return router;
}
