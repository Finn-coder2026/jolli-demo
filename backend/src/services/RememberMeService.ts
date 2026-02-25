import { getConfig } from "../config/Config.js";
import type { RememberMeTokenDao } from "../dao/RememberMeTokenDao.js";
import { getLog } from "../util/Logger.js";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import ms from "ms";

const log = getLog(import.meta);

/**
 * Grace period in milliseconds for concurrent requests during token rotation.
 * When a token is rotated, the old token remains valid for this duration
 * to allow concurrent requests to complete successfully.
 * Keep this short (10s) to minimize attack window while handling normal concurrent requests.
 */
const ROTATION_GRACE_PERIOD_MS = 10_000; // 10 seconds

/**
 * Minimum interval between token rotations in milliseconds.
 * Tokens will only be rotated if they are older than this threshold.
 * This prevents creating a new token on every single request.
 */
const ROTATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Expected length of base64url encoded 32-byte token (43 chars).
 * Combined format "series:token" = 43 + 1 + 43 = 87 chars.
 * Allow some tolerance for edge cases.
 */
const EXPECTED_COMPONENT_LENGTH = 43;
const MAX_COMBINED_TOKEN_LENGTH = 100; // series:token with tolerance

/**
 * Result of validating a remember-me token
 */
export interface TokenValidationResult {
	valid: boolean;
	userId?: number;
	/** New token if rotation occurred (series:token format) */
	newToken?: string;
	/** True if token theft was detected (series exists but token mismatch) */
	possibleTheft?: boolean;
}

/**
 * Service for managing remember-me tokens.
 * Provides secure persistent login functionality.
 */
export class RememberMeService {
	private dao: RememberMeTokenDao;
	private durationMs: number;
	private rotationEnabled: boolean;
	private maxTokensPerUser: number;

	constructor(dao: RememberMeTokenDao) {
		this.dao = dao;
		const config = getConfig();
		this.durationMs = ms(config.REMEMBER_ME_DURATION);
		this.rotationEnabled = config.REMEMBER_ME_ROTATION;
		this.maxTokensPerUser = config.REMEMBER_ME_MAX_TOKENS_PER_USER;
	}

	/**
	 * Generate a secure random token (32 bytes, base64url encoded)
	 */
	private generateRandomToken(): string {
		return randomBytes(32).toString("base64url");
	}

	/**
	 * Hash a token using SHA256
	 */
	private hashToken(token: string): string {
		return createHash("sha256").update(token).digest("hex");
	}

	/**
	 * Compare two hash strings using constant-time comparison to prevent timing attacks.
	 * Returns true if the hashes are equal, false otherwise.
	 */
	private compareHashes(a: string, b: string): boolean {
		if (a.length !== b.length) {
			return false;
		}
		return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
	}

	/**
	 * Create a new remember-me token for a user.
	 * Returns the combined series:token format (to be sent to client as cookie).
	 * Only the token hash is stored in the database; series is the primary key.
	 *
	 * Enforces maxTokensPerUser limit by removing oldest tokens when exceeded.
	 */
	async createToken(userId: number, userAgent?: string, ipAddress?: string): Promise<string> {
		// Enforce token limit per user - remove oldest tokens if at limit
		await this.enforceTokenLimit(userId);

		const series = this.generateRandomToken();
		const token = this.generateRandomToken();
		const tokenHash = this.hashToken(token);
		const expiresAt = new Date(Date.now() + this.durationMs);

		await this.dao.createToken({
			series,
			userId,
			tokenHash,
			userAgent: userAgent ?? null,
			ipAddress: ipAddress ?? null,
			expiresAt,
		});

		log.debug({ userId, series, expiresAt }, "Created remember-me token");
		return `${series}:${token}`;
	}

	/**
	 * Enforce the maximum tokens per user limit.
	 * Removes the oldest tokens (by lastUsed) if the user has reached the limit.
	 */
	private async enforceTokenLimit(userId: number): Promise<void> {
		const existingTokens = await this.dao.findByUserId(userId);

		// If at or over limit, remove oldest tokens to make room for the new one
		if (existingTokens.length >= this.maxTokensPerUser) {
			// Sort by lastUsed ascending (oldest first)
			const sortedTokens = existingTokens.sort(
				(a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime(),
			);

			// Calculate how many to delete (at least 1 to make room for new token)
			const tokensToDelete = sortedTokens.slice(0, existingTokens.length - this.maxTokensPerUser + 1);

			for (const tokenRecord of tokensToDelete) {
				await this.dao.deleteBySeries(tokenRecord.series);
			}

			if (tokensToDelete.length > 0) {
				log.info(
					{ userId, deletedCount: tokensToDelete.length, limit: this.maxTokensPerUser },
					"Removed old remember-me tokens to enforce limit",
				);
			}
		}
	}

	/**
	 * Parse the combined series:token format.
	 * Returns null if format is invalid or length is unexpected.
	 */
	private parseSeriesToken(combinedToken: string): { series: string; token: string } | null {
		// Validate total length to prevent processing abnormally large inputs
		if (!combinedToken || combinedToken.length > MAX_COMBINED_TOKEN_LENGTH) {
			return null;
		}

		const colonIndex = combinedToken.indexOf(":");
		if (colonIndex === -1) {
			return null;
		}

		const series = combinedToken.substring(0, colonIndex);
		const token = combinedToken.substring(colonIndex + 1);

		// Validate both components exist and have expected length
		if (
			!series ||
			!token ||
			series.length !== EXPECTED_COMPONENT_LENGTH ||
			token.length !== EXPECTED_COMPONENT_LENGTH
		) {
			return null;
		}

		return { series, token };
	}

	/**
	 * Check if a token is within the grace period after rotation.
	 * During the grace period, both the current and previous token are valid.
	 */
	private isWithinGracePeriod(rotatedAt: Date | null): boolean {
		if (!rotatedAt) {
			return false;
		}
		const timeSinceRotation = Date.now() - rotatedAt.getTime();
		return timeSinceRotation <= ROTATION_GRACE_PERIOD_MS;
	}

	/**
	 * Validate a remember-me token using Series + Token pattern.
	 * Returns the userId if valid, null otherwise.
	 *
	 * Security: Detects token theft when series exists but token doesn't match.
	 * This happens when an attacker steals and uses the token, causing rotation,
	 * and then the legitimate user tries to use the original token.
	 *
	 * If rotation is enabled, rotates the token hash while keeping the series constant.
	 * Grace period handling: After rotation, the previous token remains valid for
	 * ROTATION_GRACE_PERIOD_MS to handle concurrent requests.
	 */
	async validateToken(combinedToken: string, userAgent?: string, ipAddress?: string): Promise<TokenValidationResult> {
		// Parse series:token format
		const parsed = this.parseSeriesToken(combinedToken);
		if (!parsed) {
			log.debug("Invalid remember-me token format - missing colon separator");
			return { valid: false };
		}

		const { series, token } = parsed;
		const tokenHash = this.hashToken(token);

		// Lookup by series (primary key - O(1) lookup)
		const tokenRecord = await this.dao.findBySeries(series);

		if (!tokenRecord) {
			log.info("Remember-me token series not found");
			return { valid: false };
		}

		// Check if token is expired
		if (new Date() > tokenRecord.expiresAt) {
			log.info({ userId: tokenRecord.userId, series }, "Remember-me token expired");
			await this.dao.deleteBySeries(series);
			return { valid: false };
		}

		const userId = tokenRecord.userId;

		// Security: Log when IP or User-Agent changes from original token creation
		// This could indicate token was copied to another device/location
		const ipChanged = ipAddress && tokenRecord.ipAddress && ipAddress !== tokenRecord.ipAddress;
		const uaChanged = userAgent && tokenRecord.userAgent && userAgent !== tokenRecord.userAgent;
		if (ipChanged || uaChanged) {
			log.warn(
				{
					userId,
					series,
					ipChanged,
					uaChanged,
					originalIp: tokenRecord.ipAddress,
					currentIp: ipAddress,
					originalUa: tokenRecord.userAgent?.substring(0, 50),
					currentUa: userAgent?.substring(0, 50),
				},
				"Remember-me token used from different IP or User-Agent",
			);
		}

		// Check if token matches current hash (using constant-time comparison)
		const matchesCurrent = this.compareHashes(tokenRecord.tokenHash, tokenHash);

		// Check if token matches previous hash (within grace period)
		const matchesPrevious =
			tokenRecord.previousTokenHash !== null &&
			this.compareHashes(tokenRecord.previousTokenHash, tokenHash) &&
			this.isWithinGracePeriod(tokenRecord.rotatedAt);

		// CRITICAL: Token theft detection
		// If series exists but token doesn't match current OR previous (within grace period),
		// the token was likely stolen and used by an attacker.
		if (!matchesCurrent && !matchesPrevious) {
			log.warn(
				{ userId, series, ipAddress, userAgent },
				"Possible token theft detected! Series exists but token mismatch. Revoking all user tokens.",
			);
			// Enhanced response: Revoke ALL tokens for this user, not just this series
			await this.dao.deleteAllForUser(userId);
			return { valid: false, possibleTheft: true, userId };
		}

		// If using previous token within grace period, it's valid but don't rotate again
		if (matchesPrevious && !matchesCurrent) {
			log.debug({ userId, series }, "Token validated using previous hash (within grace period)");
			return { valid: true, userId };
		}

		// Token rotation with grace period for concurrent requests
		if (this.rotationEnabled) {
			const tokenAge = Date.now() - tokenRecord.lastUsed.getTime();

			// Only rotate if token is old enough (prevents rotation on every request)
			if (tokenAge >= ROTATION_INTERVAL_MS) {
				// Series + Token rotation: generate new token, update hash atomically
				const newPlainToken = this.generateRandomToken();
				const newTokenHash = this.hashToken(newPlainToken);
				const newExpiry = new Date(Date.now() + this.durationMs);

				// Use atomic rotateToken to update all fields in a single operation
				await this.dao.rotateToken(series, newTokenHash, tokenRecord.tokenHash, newExpiry);

				log.info(
					{ userId, series, tokenAgeMinutes: Math.floor(tokenAge / 60000) },
					"Rotated remember-me token",
				);
				return { valid: true, userId, newToken: `${series}:${newPlainToken}` };
			}

			// Token is still fresh, no rotation needed
			log.debug(
				{ userId, series, tokenAgeMinutes: Math.floor(tokenAge / 60000) },
				"Token still fresh, skipping rotation",
			);
		}

		return { valid: true, userId };
	}

	/**
	 * Revoke a single remember-me token by its series.
	 * Accepts the combined series:token format.
	 */
	async revokeToken(combinedToken: string): Promise<void> {
		const parsed = this.parseSeriesToken(combinedToken);
		if (!parsed) {
			log.debug("Cannot revoke token - invalid format");
			return;
		}
		await this.dao.deleteBySeries(parsed.series);
		log.info({ series: parsed.series }, "Revoked remember-me token");
	}

	/**
	 * Revoke all remember-me tokens for a user.
	 * Call this on password change, explicit logout from all devices, etc.
	 */
	async revokeAllTokensForUser(userId: number): Promise<void> {
		await this.dao.deleteAllForUser(userId);
		log.info({ userId }, "Revoked all remember-me tokens for user");
	}

	/**
	 * Clean up expired tokens.
	 * Should be called periodically by a cleanup job.
	 */
	async cleanupExpiredTokens(): Promise<number> {
		const count = await this.dao.deleteExpired();
		if (count > 0) {
			log.info({ count }, "Cleaned up expired remember-me tokens");
		}
		return count;
	}
}

/**
 * Create a RememberMeService instance
 */
export function createRememberMeService(dao: RememberMeTokenDao): RememberMeService {
	return new RememberMeService(dao);
}
