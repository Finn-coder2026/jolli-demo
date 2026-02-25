import {
	defineUserPreferences,
	EMPTY_PREFERENCES_HASH,
	type NewUserPreference,
	type UserPreference,
	type UserPreferenceUpdate,
} from "../model/UserPreference";
import type { CacheClient } from "../services/CacheService";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import { createHash } from "node:crypto";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Calculate hash for favorites data.
 * Uses SHA256 truncated to 16 characters for compact storage.
 */
export function calculateFavoritesHash(favoriteSpaces: Array<number>, favoriteSites: Array<number>): string {
	const data = JSON.stringify({ favoriteSpaces: favoriteSpaces.sort(), favoriteSites: favoriteSites.sort() });
	return createHash("sha256").update(data, "utf8").digest("hex").substring(0, 16);
}

/**
 * Generate Redis cache key for user preference hash.
 */
export function getUserPreferenceHashCacheKey(tenantSlug: string, orgSlug: string, userId: number): string {
	return `user_pref_hash:${tenantSlug}:${orgSlug}:${userId}`;
}

/**
 * User Preference DAO
 */
export interface UserPreferenceDao {
	/**
	 * Gets a user's preferences.
	 * @param userId the user ID.
	 */
	getPreference(userId: number): Promise<UserPreference | undefined>;

	/**
	 * Gets a user's preference hash.
	 * Returns EMPTY_PREFERENCES_HASH if no record exists.
	 * @param userId the user ID.
	 */
	getHash(userId: number): Promise<string>;

	/**
	 * Creates or updates a user's preferences.
	 * Recalculates hash and invalidates Redis cache.
	 * @param userId the user ID.
	 * @param updates the preference updates to apply.
	 * @param cacheKey optional Redis cache key to invalidate.
	 * @param cacheClient optional cache client for invalidation.
	 */
	upsertPreference(
		userId: number,
		updates: UserPreferenceUpdate,
		cacheKey?: string,
		cacheClient?: CacheClient,
	): Promise<UserPreference>;
}

export function createUserPreferenceDao(sequelize: Sequelize): UserPreferenceDao {
	const UserPreferences = defineUserPreferences(sequelize);

	return {
		getPreference,
		getHash,
		upsertPreference,
	};

	async function getPreference(userId: number): Promise<UserPreference | undefined> {
		const pref = await UserPreferences.findOne({
			where: { userId },
		});
		return pref ? pref.get({ plain: true }) : undefined;
	}

	async function getHash(userId: number): Promise<string> {
		const pref = await UserPreferences.findOne({
			where: { userId },
			attributes: ["hash"],
		});
		return pref ? pref.get({ plain: true }).hash : EMPTY_PREFERENCES_HASH;
	}

	async function upsertPreference(
		userId: number,
		updates: UserPreferenceUpdate,
		cacheKey?: string,
		cacheClient?: CacheClient,
	): Promise<UserPreference> {
		// Try to find existing preference
		const existing = await UserPreferences.findOne({
			where: { userId },
		});

		// Merge updates with existing data
		const favoriteSpaces = updates.favoriteSpaces ?? existing?.get("favoriteSpaces") ?? [];
		const favoriteSites = updates.favoriteSites ?? existing?.get("favoriteSites") ?? [];

		// Calculate new hash
		const hash = calculateFavoritesHash(favoriteSpaces, favoriteSites);

		if (existing) {
			// Update existing record
			await existing.update({
				favoriteSpaces,
				favoriteSites,
				hash,
			});

			// Invalidate cache (non-blocking - log errors but don't fail the operation)
			if (cacheKey && cacheClient) {
				try {
					await cacheClient.del(cacheKey);
				} catch (error) {
					log.warn(error, "Failed to invalidate preferences cache: cacheKey=%s", cacheKey);
				}
			}

			return existing.get({ plain: true });
		}

		// Create new record
		const newPref: NewUserPreference = {
			userId,
			favoriteSpaces,
			favoriteSites,
			hash,
		};

		// biome-ignore lint/suspicious/noExplicitAny: Sequelize auto-generates updatedAt
		const created = await UserPreferences.create(newPref as any);

		// Invalidate cache (in case there was a stale EMPTY entry)
		// Non-blocking - log errors but don't fail the operation
		if (cacheKey && cacheClient) {
			try {
				await cacheClient.del(cacheKey);
			} catch (error) {
				log.warn(error, "Failed to invalidate preferences cache: cacheKey=%s", cacheKey);
			}
		}

		return created.get({ plain: true });
	}
}

export function createUserPreferenceDaoProvider(defaultDao: UserPreferenceDao): DaoProvider<UserPreferenceDao> {
	return {
		getDao(context: TenantOrgContext | undefined): UserPreferenceDao {
			return context?.database.userPreferenceDao ?? defaultDao;
		},
	};
}
