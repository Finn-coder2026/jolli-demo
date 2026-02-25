import type { NewRememberMeToken, RememberMeToken, RememberMeTokenRow } from "../models";
import { defineRememberMeTokens, toRememberMeToken } from "../models";
import { Op, type Sequelize } from "sequelize";

/**
 * Data Access Object for remember-me tokens using Series + Token pattern.
 * Handles persistent login tokens for "Keep me signed in" functionality.
 *
 * Series stays constant per login session, token rotates on each use.
 * This enables theft detection when series exists but token doesn't match.
 */
export interface RememberMeTokenDao {
	/**
	 * Create a new remember-me token
	 */
	createToken(data: NewRememberMeToken): Promise<RememberMeToken>;

	/**
	 * Find a token by its series (primary key lookup)
	 */
	findBySeries(series: string): Promise<RememberMeToken | undefined>;

	/**
	 * Find all tokens for a user
	 */
	findByUserId(userId: number): Promise<Array<RememberMeToken>>;

	/**
	 * Atomically rotate a token - updates tokenHash, previousTokenHash, rotatedAt, expiresAt, and lastUsed
	 * in a single database operation. This prevents race conditions during token rotation.
	 *
	 * @param series - The token series (primary key)
	 * @param newTokenHash - The new token hash
	 * @param previousTokenHash - The current token hash (becomes the previous)
	 * @param newExpiry - The new expiration time
	 */
	rotateToken(series: string, newTokenHash: string, previousTokenHash: string, newExpiry: Date): Promise<void>;

	/**
	 * @deprecated Use rotateToken instead for atomic updates
	 * Update a token's hash and last used time (used for token rotation)
	 */
	updateToken(series: string, tokenHash: string, lastUsed: Date): Promise<void>;

	/**
	 * @deprecated Use rotateToken instead for atomic updates
	 * Update a token's expiry time (used for grace period)
	 */
	updateExpiry(series: string, expiresAt: Date): Promise<void>;

	/**
	 * Delete a token by its series
	 */
	deleteBySeries(series: string): Promise<void>;

	/**
	 * Delete all tokens for a user (used on password change, logout all devices)
	 */
	deleteAllForUser(userId: number): Promise<void>;

	/**
	 * Delete all expired tokens (cleanup job)
	 * Returns the number of deleted tokens
	 */
	deleteExpired(): Promise<number>;
}

export function createRememberMeTokenDao(sequelize: Sequelize): RememberMeTokenDao {
	const RememberMeTokens = defineRememberMeTokens(sequelize);

	async function createToken(data: NewRememberMeToken): Promise<RememberMeToken> {
		const row = await RememberMeTokens.create({
			series: data.series,
			userId: data.userId,
			tokenHash: data.tokenHash,
			previousTokenHash: null,
			rotatedAt: null,
			userAgent: data.userAgent ?? null,
			ipAddress: data.ipAddress ?? null,
			expiresAt: data.expiresAt,
		} as unknown as RememberMeTokenRow);
		return toRememberMeToken(row.dataValues);
	}

	async function findBySeries(series: string): Promise<RememberMeToken | undefined> {
		const row = await RememberMeTokens.findByPk(series);
		if (!row) {
			return;
		}
		return toRememberMeToken(row.dataValues);
	}

	async function findByUserId(userId: number): Promise<Array<RememberMeToken>> {
		const rows = await RememberMeTokens.findAll({
			where: { userId },
			order: [["createdAt", "DESC"]],
		});
		return rows.map(row => toRememberMeToken(row.dataValues));
	}

	async function rotateToken(
		series: string,
		newTokenHash: string,
		previousTokenHash: string,
		newExpiry: Date,
	): Promise<void> {
		const now = new Date();
		await RememberMeTokens.update(
			{
				tokenHash: newTokenHash,
				previousTokenHash,
				rotatedAt: now,
				expiresAt: newExpiry,
				lastUsed: now,
			} as never,
			{ where: { series } },
		);
	}

	async function updateToken(series: string, tokenHash: string, lastUsed: Date): Promise<void> {
		await RememberMeTokens.update({ tokenHash, lastUsed } as never, { where: { series } });
	}

	async function updateExpiry(series: string, expiresAt: Date): Promise<void> {
		await RememberMeTokens.update({ expiresAt } as never, { where: { series } });
	}

	async function deleteBySeries(series: string): Promise<void> {
		await RememberMeTokens.destroy({
			where: { series },
		});
	}

	async function deleteAllForUser(userId: number): Promise<void> {
		await RememberMeTokens.destroy({
			where: { userId },
		});
	}

	async function deleteExpired(): Promise<number> {
		const count = await RememberMeTokens.destroy({
			where: {
				expiresAt: {
					[Op.lt]: new Date(),
				},
			},
		});
		return count;
	}

	return {
		createToken,
		findBySeries,
		findByUserId,
		rotateToken,
		updateToken,
		updateExpiry,
		deleteBySeries,
		deleteAllForUser,
		deleteExpired,
	};
}
