/**
 * Profile Router - Handles user profile operations.
 *
 * Provides endpoints for:
 * - GET /api/profile - Get current user profile
 * - PUT /api/profile - Update profile (name only, email is read-only)
 * - GET /api/profile/has-password - Check if user has password authentication
 * - POST /api/profile/set-password - Set initial password (for OAuth-only users)
 * - POST /api/profile/change-password - Change password (requires current password)
 * - POST /api/profile/logout-all-sessions - Logout from all devices
 * - GET /api/profile/preferences - Get user preferences (favorites)
 * - PUT /api/profile/preferences - Update user preferences (favorites)
 */

import { auditLog } from "../audit/index.js";
import type { ActiveUserDao } from "../dao/ActiveUserDao.js";
import type { DaoProvider } from "../dao/DaoProvider.js";
import type { GlobalAuthDao } from "../dao/GlobalAuthDao.js";
import type { GlobalUserDao } from "../dao/GlobalUserDao.js";
import type { PasswordHistoryDao } from "../dao/PasswordHistoryDao.js";
import { getUserPreferenceHashCacheKey, type UserPreferenceDao } from "../dao/UserPreferenceDao.js";
import { getCache } from "../services/CacheService.js";
import type { RememberMeService } from "../services/RememberMeService.js";
import { getTenantContext } from "../tenant/TenantContext.js";
import { clearAuthCookie, clearRememberMeCookie } from "../util/Cookies.js";
import { getLog } from "../util/Logger.js";
import type { TokenUtil } from "../util/TokenUtil.js";
import { hash, verify } from "@node-rs/argon2";
import express from "express";
import { type PasswordValidationError, type UserInfo, validatePassword as validatePasswordShared } from "jolli-common";

const log = getLog(import.meta);

export interface ProfileRouterDeps {
	globalUserDao: GlobalUserDao;
	globalAuthDao: GlobalAuthDao;
	passwordHistoryDao: PasswordHistoryDao;
	tokenUtil: TokenUtil<UserInfo>;
	/** DAO provider for active users - used to sync name to tenant's active_users table */
	activeUserDaoProvider?: DaoProvider<ActiveUserDao>;
	/** DAO provider for user preferences (favorites) */
	userPreferenceDaoProvider?: DaoProvider<UserPreferenceDao>;
	/** RememberMeService for revoking tokens on password change (optional for backwards compatibility) */
	rememberMeService?: RememberMeService;
}

/**
 * Create profile router for user profile operations.
 */
export function createProfileRouter(deps: ProfileRouterDeps): express.Router {
	const router = express.Router();
	const {
		globalUserDao,
		globalAuthDao,
		passwordHistoryDao,
		tokenUtil,
		activeUserDaoProvider,
		userPreferenceDaoProvider,
		rememberMeService,
	} = deps;

	/**
	 * GET / - Get current user profile
	 */
	router.get("/", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.userId) {
				return res.status(401).json({ error: "unauthorized" });
			}

			const user = await globalUserDao.findUserById(userInfo.userId);
			if (!user) {
				log.warn({ userId: userInfo.userId }, "Profile not found for user");
				return res.status(404).json({ error: "user_not_found" });
			}

			// Return profile data (email is included but read-only on frontend)
			res.json({
				userId: user.id,
				email: user.email,
				name: user.name,
				image: user.image ?? null,
			});
		} catch (error) {
			log.error(error, "Get profile error");
			res.status(500).json({ error: "server_error" });
		}
	});

	/**
	 * PUT / - Update user profile (name only, email is read-only)
	 */
	router.put("/", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.userId) {
				return res.status(401).json({ error: "unauthorized" });
			}

			const { name } = req.body;

			// Validate name
			if (!name || typeof name !== "string") {
				return res.status(400).json({
					error: "invalid_name",
					message: "Name is required",
				});
			}

			const trimmedName = name.trim();
			if (trimmedName.length < 1 || trimmedName.length > 255) {
				return res.status(400).json({
					error: "invalid_name",
					message: "Name must be 1-255 characters",
				});
			}

			// Update user in global users table
			await globalUserDao.updateUser(userInfo.userId, { name: trimmedName });

			// Also update name in tenant's active_users table if in tenant context
			const tenantContext = getTenantContext();
			if (tenantContext && activeUserDaoProvider) {
				try {
					const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
					// Find active user by email (since global userId != active_users id)
					const activeUser = await activeUserDao.findByEmail(userInfo.email);
					if (activeUser) {
						await activeUserDao.update(activeUser.id, { name: trimmedName });
						log.debug(
							{ userId: userInfo.userId, activeUserId: activeUser.id },
							"Updated name in active_users",
						);
					}
				} catch (activeUserError) {
					// Log but don't fail the request - global update succeeded
					log.warn(activeUserError, "Failed to update name in active_users table");
				}
			}

			// Fetch updated user
			const updatedUser = await globalUserDao.findUserById(userInfo.userId);
			if (!updatedUser) {
				return res.status(404).json({ error: "user_not_found" });
			}

			log.info({ userId: userInfo.userId }, "Profile updated");
			res.json({
				userId: updatedUser.id,
				email: updatedUser.email,
				name: updatedUser.name,
				image: updatedUser.image ?? null,
			});
		} catch (error) {
			log.error(error, "Update profile error");
			res.status(500).json({ error: "server_error" });
		}
	});

	/**
	 * GET /has-password - Check if user has password authentication
	 *
	 * Returns whether the user has a password set (credential provider with passwordHash).
	 */
	router.get("/has-password", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.userId) {
				return res.status(401).json({ error: "unauthorized" });
			}

			// Check for credential auth record with password
			const authRecord = await globalAuthDao.findAuthByUserIdAndProvider(userInfo.userId, "credential");
			const hasPassword = Boolean(authRecord?.passwordHash);

			res.json({ hasPassword });
		} catch (error) {
			log.error(error, "Check has-password error");
			res.status(500).json({ error: "server_error" });
		}
	});

	/**
	 * POST /set-password - Set initial password (for OAuth-only users)
	 *
	 * Allows users who signed up via OAuth to set a password for their account.
	 * Fails if the user already has a password set.
	 */
	router.post("/set-password", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.userId) {
				return res.status(401).json({ error: "unauthorized" });
			}

			const { newPassword } = req.body;

			// Validate input
			if (!newPassword) {
				return res.status(400).json({
					error: "missing_fields",
					message: "New password is required",
				});
			}

			// Validate password requirements
			const passwordError = validatePassword(newPassword);
			if (passwordError) {
				return res.status(400).json({
					error: "invalid_password",
					message: passwordError,
				});
			}

			// Check if user already has a password
			const existingAuth = await globalAuthDao.findAuthByUserIdAndProvider(userInfo.userId, "credential");
			if (existingAuth?.passwordHash) {
				return res.status(400).json({
					error: "password_already_set",
					message: "Password is already set. Use change-password to update it.",
				});
			}

			// Hash the new password
			const passwordHash = await hash(newPassword);

			if (existingAuth) {
				// Update existing credential auth record with password
				await globalAuthDao.updateAuth(existingAuth.id, { passwordHash });
			} else {
				// Create new credential auth record
				await globalAuthDao.createAuth({
					userId: userInfo.userId,
					provider: "credential",
					passwordHash,
				});
			}

			log.info({ userId: userInfo.userId }, "Password set successfully");

			// Audit log the password set event
			auditLog({
				action: "update",
				resourceType: "user",
				resourceId: userInfo.userId.toString(),
				resourceName: userInfo.email,
				actorId: userInfo.userId,
				actorEmail: userInfo.email,
				metadata: { operation: "set_password" },
			});

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Set password error");
			res.status(500).json({ error: "server_error" });
		}
	});

	/**
	 * POST /change-password - Change password (authenticated user)
	 *
	 * Requires current password for verification.
	 * Validates new password against requirements and history.
	 */
	router.post("/change-password", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.userId) {
				return res.status(401).json({ error: "unauthorized" });
			}

			const { currentPassword, newPassword } = req.body;

			// Validate input
			if (!currentPassword || !newPassword) {
				return res.status(400).json({
					error: "missing_fields",
					message: "Current password and new password are required",
				});
			}

			// Get auth record (better-auth uses "credential" as provider name)
			const authRecord = await globalAuthDao.findAuthByUserIdAndProvider(userInfo.userId, "credential");
			if (!authRecord) {
				log.warn({ userId: userInfo.userId }, "No password auth record found");
				return res.status(400).json({
					error: "no_password_auth",
					message: "Password authentication is not set up for this account",
				});
			}

			// Verify current password
			if (!authRecord.passwordHash) {
				return res.status(400).json({
					error: "no_password_auth",
					message: "Password authentication is not set up for this account",
				});
			}

			const isCurrentPasswordValid = await verify(authRecord.passwordHash, currentPassword);
			if (!isCurrentPasswordValid) {
				log.warn({ userId: userInfo.userId }, "Change password: current password invalid");
				return res.status(400).json({
					error: "invalid_current_password",
					message: "Current password is incorrect",
				});
			}

			// Validate new password requirements
			const passwordError = validatePassword(newPassword);
			if (passwordError) {
				return res.status(400).json({
					error: "invalid_password",
					message: passwordError,
				});
			}

			// Check if password is reused (matches last 5 passwords)
			const isReused = await passwordHistoryDao.isPasswordReused(userInfo.userId, newPassword, 5);
			if (isReused) {
				return res.status(400).json({
					error: "password_reused",
					message: "This password was used recently. Please choose a different password.",
				});
			}

			// Save current password to history
			await passwordHistoryDao.addPasswordHistory(userInfo.userId, authRecord.passwordHash);

			// Hash new password
			const newPasswordHash = await hash(newPassword);

			// Update password
			await globalAuthDao.updateAuth(authRecord.id, {
				passwordHash: newPasswordHash,
			});

			// Cleanup old passwords (keep only last 5)
			await passwordHistoryDao.cleanupOldPasswords(userInfo.userId, 5);

			// Revoke all remember-me tokens for this user (security best practice)
			// This ensures any stolen tokens become invalid after password change
			if (rememberMeService) {
				try {
					await rememberMeService.revokeAllTokensForUser(userInfo.userId);
					log.info({ userId: userInfo.userId }, "Revoked all remember-me tokens after password change");
				} catch (revokeError) {
					// Log but don't fail the password change
					log.warn(revokeError, "Failed to revoke remember-me tokens after password change");
				}
			}

			// Clear the remember-me cookie from the current response
			clearRememberMeCookie(res);

			log.info({ userId: userInfo.userId }, "Password changed successfully");

			// Audit log the password change event
			auditLog({
				action: "password_reset",
				resourceType: "user",
				resourceId: userInfo.userId.toString(),
				resourceName: userInfo.email,
				actorId: userInfo.userId,
				actorEmail: userInfo.email,
				metadata: { operation: "change_password" },
			});

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Change password error");
			res.status(500).json({ error: "server_error" });
		}
	});

	/**
	 * POST /logout-all-sessions - Logout from all devices
	 *
	 * Revokes all remember-me tokens for the current user, effectively
	 * logging them out from all devices. This is a security feature that
	 * allows users to invalidate all their sessions.
	 *
	 * LIMITATIONS:
	 * 1. authToken is a stateless JWT (2hr expiry) - cannot be remotely revoked.
	 *    Other devices' JWTs remain valid until they expire (max 2 hours).
	 * 2. No multi-device session tracking - we only track remember-me tokens,
	 *    not individual device sessions. This means we can't show a list of
	 *    active devices or selectively log out specific devices.
	 *
	 * WHAT THIS DOES:
	 * - Current device: Fully logged out (authToken + remember_me_token cleared)
	 * - Other devices: Will be logged out when their JWT expires and they try
	 *   to refresh (because their remember-me token has been revoked from DB)
	 */
	router.post("/logout-all-sessions", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.userId) {
				return res.status(401).json({ error: "unauthorized" });
			}

			// Revoke all remember-me tokens for this user from DB
			// This prevents other devices from auto-refreshing when their JWT expires
			if (rememberMeService) {
				try {
					await rememberMeService.revokeAllTokensForUser(userInfo.userId);
					log.info({ userId: userInfo.userId }, "Revoked all remember-me tokens (logout all sessions)");
				} catch (revokeError) {
					log.error(revokeError, "Failed to revoke all remember-me tokens");
					return res.status(500).json({ error: "server_error" });
				}
			}

			// Clear cookies for current device
			// Note: Cannot clear cookies on other devices - they will expire naturally
			clearAuthCookie(res);
			clearRememberMeCookie(res);

			log.info({ userId: userInfo.userId }, "User logged out from all devices");

			// Audit log the logout all sessions event
			auditLog({
				action: "logout",
				resourceType: "session",
				resourceId: userInfo.userId.toString(),
				resourceName: userInfo.email,
				actorId: userInfo.userId,
				actorEmail: userInfo.email,
				metadata: { operation: "logout_all_sessions" },
			});

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Logout all sessions error");
			res.status(500).json({ error: "server_error" });
		}
	});

	/**
	 * GET /preferences - Get user preferences (favorites)
	 *
	 * Returns favorite spaces and sites for the current user.
	 */
	router.get("/preferences", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.userId) {
				return res.status(401).json({ error: "unauthorized" });
			}

			const tenantContext = getTenantContext();
			if (!tenantContext || !userPreferenceDaoProvider) {
				return res.status(400).json({ error: "tenant_context_required" });
			}

			const userPreferenceDao = userPreferenceDaoProvider.getDao(tenantContext);
			const pref = await userPreferenceDao.getPreference(userInfo.userId);

			res.json({
				favoriteSpaces: pref?.favoriteSpaces ?? [],
				favoriteSites: pref?.favoriteSites ?? [],
				hash: pref?.hash ?? "EMPTY",
			});
		} catch (error) {
			log.error(error, "Get preferences error");
			res.status(500).json({ error: "server_error" });
		}
	});

	/**
	 * PUT /preferences - Update user preferences (favorites)
	 *
	 * Partial updates supported - only provided fields are updated.
	 * Returns updated preferences with new hash.
	 */
	router.put("/preferences", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo?.userId) {
				return res.status(401).json({ error: "unauthorized" });
			}

			const tenantContext = getTenantContext();
			if (!tenantContext || !userPreferenceDaoProvider) {
				return res.status(400).json({ error: "tenant_context_required" });
			}

			const { favoriteSpaces, favoriteSites } = req.body;

			// Validate input types
			if (favoriteSpaces !== undefined && !Array.isArray(favoriteSpaces)) {
				return res
					.status(400)
					.json({ error: "invalid_favorite_spaces", message: "favoriteSpaces must be an array" });
			}
			if (favoriteSites !== undefined && !Array.isArray(favoriteSites)) {
				return res
					.status(400)
					.json({ error: "invalid_favorite_sites", message: "favoriteSites must be an array" });
			}

			// Validate array elements are positive integers
			if (
				favoriteSpaces !== undefined &&
				!favoriteSpaces.every((id: unknown) => Number.isInteger(id) && (id as number) > 0)
			) {
				return res.status(400).json({
					error: "invalid_favorite_spaces",
					message: "favoriteSpaces must contain only positive integers",
				});
			}
			if (
				favoriteSites !== undefined &&
				!favoriteSites.every((id: unknown) => Number.isInteger(id) && (id as number) > 0)
			) {
				return res.status(400).json({
					error: "invalid_favorite_sites",
					message: "favoriteSites must contain only positive integers",
				});
			}

			// Build cache key for invalidation
			const cacheKey = getUserPreferenceHashCacheKey(
				tenantContext.tenant.slug,
				tenantContext.org.slug,
				userInfo.userId,
			);
			const cacheClient = getCache();

			const userPreferenceDao = userPreferenceDaoProvider.getDao(tenantContext);
			const pref = await userPreferenceDao.upsertPreference(
				userInfo.userId,
				{ favoriteSpaces, favoriteSites },
				cacheKey,
				cacheClient,
			);

			log.info({ userId: userInfo.userId }, "Preferences updated");
			res.json({
				favoriteSpaces: pref.favoriteSpaces,
				favoriteSites: pref.favoriteSites,
				hash: pref.hash,
			});
		} catch (error) {
			log.error(error, "Update preferences error");
			res.status(500).json({ error: "server_error" });
		}
	});

	return router;
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
 * Validate password against requirements using shared validation from jolli-common.
 * Returns error message if invalid, null if valid.
 */
function validatePassword(password: string): string | null {
	const result = validatePasswordShared(password);
	if (!result.valid && result.error) {
		return passwordErrorMessages[result.error];
	}
	return null;
}
