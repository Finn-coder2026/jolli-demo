import type { PasswordHistory } from "../model/PasswordHistory.js";
import { definePasswordHistory } from "../model/PasswordHistory.js";
import { verify } from "@node-rs/argon2";
import type { Sequelize } from "sequelize";
import { Op } from "sequelize";

/**
 * Data Access Object for password history
 * Used to store historical passwords and prevent password reuse
 */
export interface PasswordHistoryDao {
	/**
	 * Add a password to history when changed
	 */
	addPasswordHistory(userId: number, passwordHash: string): Promise<PasswordHistory>;

	/**
	 * Get last N passwords for a user (ordered by most recent first)
	 */
	getRecentPasswords(userId: number, limit: number): Promise<Array<PasswordHistory>>;

	/**
	 * Check if a password matches any of the last N passwords
	 * Returns false if user has no password history (first time resetting password)
	 */
	isPasswordReused(userId: number, plainPassword: string, limit: number): Promise<boolean>;

	/**
	 * Cleanup: keep only last N passwords per user, delete older ones
	 * Returns the number of deleted records
	 */
	cleanupOldPasswords(userId: number, keepCount: number): Promise<number>;
}

/**
 * Create a PasswordHistoryDao instance
 */
export function createPasswordHistoryDao(sequelize: Sequelize): PasswordHistoryDao {
	const PasswordHistories = definePasswordHistory(sequelize);

	return {
		addPasswordHistory,
		getRecentPasswords,
		isPasswordReused,
		cleanupOldPasswords,
	};

	async function addPasswordHistory(userId: number, passwordHash: string): Promise<PasswordHistory> {
		const result = await PasswordHistories.create({
			userId,
			passwordHash,
		} as never);
		return result.get({ plain: true }) as PasswordHistory;
	}

	async function getRecentPasswords(userId: number, limit: number): Promise<Array<PasswordHistory>> {
		const results = await PasswordHistories.findAll({
			where: { userId },
			order: [["created_at", "DESC"]],
			limit,
		});
		return results.map(r => r.get({ plain: true }) as PasswordHistory);
	}

	async function isPasswordReused(userId: number, plainPassword: string, limit: number): Promise<boolean> {
		// Get recent password hashes
		const recentPasswords = await getRecentPasswords(userId, limit);

		// If no password history, it's not reused (first time setting password)
		if (recentPasswords.length === 0) {
			return false;
		}

		// Check if any historical password matches the new password
		// Use argon2.verify for constant-time comparison
		for (const history of recentPasswords) {
			try {
				const matches = await verify(history.passwordHash, plainPassword);
				if (matches) {
					return true; // Password is reused
				}
			} catch (_error) {
				// Ignore verification errors for invalid hashes (continue to next password)
			}
		}

		return false; // Password is not reused
	}

	async function cleanupOldPasswords(userId: number, keepCount: number): Promise<number> {
		// Get IDs of the most recent N passwords to keep
		const recentPasswords = await getRecentPasswords(userId, keepCount);
		const idsToKeep = recentPasswords.map(p => p.id);

		// Delete all passwords for this user except the ones we want to keep
		const result = await PasswordHistories.destroy({
			where: {
				userId,
				id: {
					[Op.notIn]: idsToKeep.length > 0 ? idsToKeep : [-1], // Use [-1] if no passwords to keep
				},
			},
		});

		return result;
	}
}
