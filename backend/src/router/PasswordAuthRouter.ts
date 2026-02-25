import { auditLog } from "../audit";
import type { GlobalAuthDao } from "../dao/GlobalAuthDao.js";
import type { PasswordHistoryDao } from "../dao/PasswordHistoryDao.js";
import type { VerificationDao } from "../dao/VerificationDao.js";
import type { RememberMeService } from "../services/RememberMeService.js";
import { getLog } from "../util/Logger.js";
import { hash } from "@node-rs/argon2";
import express from "express";
import { type PasswordValidationError, validatePassword as validatePasswordShared } from "jolli-common";
import "../types/SessionTypes.js";

const log = getLog(import.meta);

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
 * Validates password requirements using shared validation from jolli-common.
 * Returns an error message if validation fails, or null if valid.
 */
function validatePasswordRequirements(password: string): string | null {
	const result = validatePasswordShared(password);
	if (!result.valid && result.error) {
		return passwordErrorMessages[result.error];
	}
	return null;
}

export interface PasswordAuthRouterDeps {
	verificationDao: VerificationDao;
	passwordHistoryDao: PasswordHistoryDao;
	globalAuthDao: GlobalAuthDao;
	rememberMeService?: RememberMeService;
}

/**
 * Create password authentication router
 */
export function createPasswordAuthRouter(deps: PasswordAuthRouterDeps): express.Router {
	const router = express.Router();
	const { verificationDao, passwordHistoryDao, globalAuthDao, rememberMeService } = deps;

	// GET /password/validate-reset-token - Validate password reset token
	router.get("/password/validate-reset-token", async (req, res) => {
		try {
			const { token } = req.query;

			// Check if token parameter is provided
			if (!token || typeof token !== "string") {
				log.warn("Token validation: missing token parameter");
				return res.json({
					valid: false,
					error: "missing_token",
				});
			}

			// Find verification record by identifier field (better-auth format: "reset-password:token")
			const verification = await verificationDao.findByResetPasswordToken(token);

			// Check if token exists
			if (!verification) {
				log.warn("Token validation: token not found in database");
				return res.json({
					valid: false,
					error: "invalid_token",
				});
			}

			log.info(
				{
					id: verification.id,
					identifier: verification.identifier,
					expiresAt: verification.expiresAt,
					usedAt: verification.usedAt,
					hasValue: !!verification.value,
				},
				"Token validation: verification record found",
			);

			// Check if token has expired
			const now = new Date();
			if (verification.expiresAt < now) {
				log.warn({ id: verification.id, expiresAt: verification.expiresAt }, "Token validation: token expired");
				return res.json({
					valid: false,
					error: "expired_token",
				});
			}

			// Check if token has already been used
			if (verification.usedAt) {
				log.warn({ id: verification.id, usedAt: verification.usedAt }, "Token validation: token already used");
				return res.json({
					valid: false,
					error: "used_token",
				});
			}

			// Token is valid
			log.info({ id: verification.id }, "Token validation: token is valid");
			return res.json({
				valid: true,
			});
		} catch (error) {
			log.error(error, "Token validation error");
			return res.status(500).json({
				valid: false,
				error: "server_error",
			});
		}
	});

	// POST /password/reset-password - Custom reset password endpoint with password history
	router.post("/password/reset-password", async (req, res) => {
		try {
			const { token, newPassword } = req.body;

			// Validate input
			if (!token || !newPassword) {
				log.warn("Reset password: missing token or password");
				return res.status(400).json({
					success: false,
					error: "invalid_request",
					message: "Token and new password are required",
				});
			}

			// Find verification record by identifier field (better-auth format: "reset-password:token")
			const verification = await verificationDao.findByResetPasswordToken(token);

			// Check if token exists
			if (!verification) {
				log.warn("Reset password: token not found in database");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid reset token",
				});
			}

			log.info(
				{
					id: verification.id,
					identifier: verification.identifier,
					expiresAt: verification.expiresAt,
					usedAt: verification.usedAt,
					hasValue: !!verification.value,
				},
				"Reset password: verification record found",
			);

			// Check if token has expired
			const now = new Date();
			if (verification.expiresAt < now) {
				return res.status(400).json({
					success: false,
					error: "expired_token",
					message: "This reset link has expired",
				});
			}

			// Check if token has already been used
			if (verification.usedAt) {
				return res.status(400).json({
					success: false,
					error: "used_token",
					message: "This reset link has already been used",
				});
			}

			// Get userId from verification record
			const userId = Number.parseInt(verification.value || "0", 10);
			if (!userId) {
				log.error({ verification }, "Invalid userId in verification record");
				return res.status(400).json({
					success: false,
					error: "invalid_token",
					message: "Invalid reset token",
				});
			}

			// Validate password requirements
			const passwordError = validatePasswordRequirements(newPassword);
			if (passwordError) {
				return res.status(400).json({
					success: false,
					error: "invalid_password",
					message: passwordError,
				});
			}

			// Check if password is reused (matches last 5 passwords)
			const isReused = await passwordHistoryDao.isPasswordReused(userId, newPassword, 5);
			if (isReused) {
				return res.status(400).json({
					success: false,
					error: "password_reused",
					message: "This password was used recently. Please choose a different password.",
				});
			}

			// Get current auth record
			// Try "credential" first (better-auth default), fallback to "password" (legacy)
			let authRecord = await globalAuthDao.findAuthByUserIdAndProvider(userId, "credential");
			if (!authRecord) {
				authRecord = await globalAuthDao.findAuthByUserIdAndProvider(userId, "password");
			}
			if (!authRecord) {
				log.error({ userId }, "No auth record found for user");
				return res.status(400).json({
					success: false,
					error: "no_auth_record",
					message: "No authentication method found for this account",
				});
			}

			// Save current password to history (if exists)
			if (authRecord.passwordHash) {
				await passwordHistoryDao.addPasswordHistory(userId, authRecord.passwordHash);
			}

			// Hash new password with argon2
			const newPasswordHash = await hash(newPassword);

			// Update password
			await globalAuthDao.updateAuth(authRecord.id, {
				passwordHash: newPasswordHash,
			});

			// Mark verification token as used
			await verificationDao.markAsUsed(verification.id);

			// Cleanup old passwords (keep only last 5)
			await passwordHistoryDao.cleanupOldPasswords(userId, 5);

			// Clear all remember-me tokens for this user (security: invalidate all persistent sessions)
			if (rememberMeService) {
				await rememberMeService.revokeAllTokensForUser(userId);
				log.debug({ userId }, "Revoked all remember-me tokens after password reset");
			}

			// Audit log password reset
			auditLog({
				action: "password_reset",
				resourceType: "user",
				resourceId: userId,
				resourceName: verification.identifier,
				actorId: userId,
			});

			log.info({ userId }, "Password reset successful");
			return res.json({
				success: true,
			});
		} catch (error) {
			log.error(error, "Password reset error");
			return res.status(500).json({
				success: false,
				error: "server_error",
				message: "Failed to reset password. Please try again later.",
			});
		}
	});

	return router;
}
