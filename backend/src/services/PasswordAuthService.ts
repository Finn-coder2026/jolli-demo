import { getConfig } from "../config/Config.js";
import type { GlobalAuthDao } from "../dao/GlobalAuthDao.js";
import type { GlobalUserDao } from "../dao/GlobalUserDao.js";
import { RateLimitService } from "../services/RateLimitService.js";
import { sendOAuthAccountNotificationEmail, sendPasswordResetEmail } from "../util/EmailService.js";
import { getLog } from "../util/Logger.js";
import { hash, verify } from "@node-rs/argon2";

const log = getLog(import.meta);

/**
 * Login result
 */
export interface LoginResult {
	success: boolean;
	error?: "user_not_found" | "invalid_password" | "account_inactive";
	userId?: number;
	user?: {
		id: number;
		email: string;
		name: string;
	};
}

/**
 * Service for password-based authentication
 */
export class PasswordAuthService {
	constructor(
		private globalUserDao: GlobalUserDao,
		private globalAuthDao: GlobalAuthDao,
	) {}

	/**
	 * Authenticate user with email and password
	 */
	async login(email: string, password: string): Promise<LoginResult> {
		// 1. Find user by email
		const user = await this.globalUserDao.findUserByEmail(email);
		if (!user) {
			log.warn({ email }, "Login failed: user not found");
			return { success: false, error: "user_not_found" };
		}

		// 2. Check if user is active
		if (!user.isActive) {
			log.warn({ email, userId: user.id }, "Login failed: account inactive");
			return { success: false, error: "account_inactive" };
		}

		// 3. Get password auth record
		const auth = await this.globalAuthDao.findAuthByUserIdAndProvider(user.id, "password");
		if (!auth || !auth.passwordHash) {
			log.warn({ email, userId: user.id }, "Login failed: no password auth record");
			return { success: false, error: "invalid_password" };
		}

		// 4. Verify password using argon2
		try {
			const isValid = await verify(auth.passwordHash, password);
			if (!isValid) {
				log.warn({ email, userId: user.id }, "Login failed: invalid password");
				return { success: false, error: "invalid_password" };
			}
		} catch (error) {
			log.error(error, "Error verifying password");
			return { success: false, error: "invalid_password" };
		}

		// 5. Login successful
		log.info({ email, userId: user.id }, "Login successful");
		return {
			success: true,
			userId: user.id,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
		};
	}

	/**
	 * Hash a password using argon2
	 */
	async hashPassword(password: string): Promise<string> {
		return await hash(password);
	}

	/**
	 * Verify a password against a hash
	 */
	async verifyPassword(hashValue: string, password: string): Promise<boolean> {
		try {
			return await verify(hashValue, password);
		} catch (error) {
			log.error(error, "Error verifying password");
			return false;
		}
	}

	/**
	 * Handle password reset request with anti-enumeration protection
	 * Implements OWASP best practices:
	 * - No information leakage about account existence
	 * - Consistent timing for all requests
	 * - Handles both password and OAuth-only accounts
	 *
	 * @param user - User object (can be null if user doesn't exist)
	 * @param resetToken - Password reset token (already hashed with SHA256)
	 * @returns Promise<void> - Always resolves (never reveals if user exists)
	 */
	async handlePasswordResetRequest(
		user: { id: string; email: string; name: string } | null,
		resetToken: string,
	): Promise<void> {
		const config = getConfig();
		const rateLimitService = new RateLimitService();

		// Path 1: User doesn't exist → do nothing (simulate work for timing consistency)
		if (!user) {
			// Simulate work to match timing of other paths
			await new Promise(resolve => setTimeout(resolve, 100));
			log.debug("Password reset requested for non-existent user");
			return;
		}

		// Check rate limit (applies to all existing users)
		const rateLimit = await rateLimitService.checkPasswordResetEmailLimit(user.email);

		if (!rateLimit.allowed) {
			log.warn(
				{
					email: user.email,
					current: rateLimit.current,
					limit: rateLimit.limit,
					resetInSeconds: rateLimit.resetInSeconds,
				},
				"Password reset rate limit exceeded",
			);
			// Don't throw error - return silently to prevent timing attacks
			return;
		}

		if (!resetToken) {
			log.error("No reset token provided");
			return;
		}

		// Path 2: User has password auth (with or without OAuth) → send reset email
		const hasPassword = await this.globalAuthDao.hasPasswordAuth(Number(user.id));
		if (hasPassword) {
			// resetToken is already hashed by sendResetPassword hook
			// Send email with hashed token in URL
			const resetUrl = `${config.AUTH_GATEWAY_ORIGIN}/reset-password?token=${resetToken}`;

			await sendPasswordResetEmail({
				toEmail: user.email,
				toName: user.name,
				resetUrl,
			});

			// Record successful email send for rate limiting
			await rateLimitService.recordPasswordResetEmail(user.email);

			log.info({ email: user.email }, "Password reset email sent successfully");
			return;
		}

		// Path 3: User has OAuth only (no password) → send generic info email
		await sendOAuthAccountNotificationEmail(user.email);

		// Record email send for rate limiting
		await rateLimitService.recordPasswordResetEmail(user.email);

		log.info({ email: user.email }, "OAuth account notification email sent successfully");
	}
}
