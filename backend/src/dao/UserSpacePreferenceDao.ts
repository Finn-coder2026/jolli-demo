import {
	defineUserSpacePreferences,
	type NewUserSpacePreference,
	type UserSpacePreference,
} from "../model/UserSpacePreference";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { SpaceSortOption } from "jolli-common";
import type { Sequelize } from "sequelize";

/**
 * Update fields for user space preferences.
 * All fields are optional to allow partial updates.
 */
export interface UserSpacePreferenceUpdate {
	sort?: SpaceSortOption | null;
	filters?: Record<string, unknown>;
	expandedFolders?: Array<number>;
}

/**
 * User Space Preferences DAO
 */
export interface UserSpacePreferenceDao {
	/**
	 * Gets a user's preference for a space.
	 * @param userId the user ID.
	 * @param spaceId the space ID.
	 */
	getPreference(userId: number, spaceId: number): Promise<UserSpacePreference | undefined>;

	/**
	 * Creates or updates a user's preference for a space.
	 * Uses upsert to handle both create and update cases.
	 * @param userId the user ID.
	 * @param spaceId the space ID.
	 * @param updates the preference updates to apply.
	 */
	upsertPreference(userId: number, spaceId: number, updates: UserSpacePreferenceUpdate): Promise<UserSpacePreference>;

	/**
	 * Deletes a user's preference for a space.
	 * @param userId the user ID.
	 * @param spaceId the space ID.
	 */
	deletePreference(userId: number, spaceId: number): Promise<void>;
}

export function createUserSpacePreferenceDao(sequelize: Sequelize): UserSpacePreferenceDao {
	const UserSpacePreferences = defineUserSpacePreferences(sequelize);

	return {
		getPreference,
		upsertPreference,
		deletePreference,
	};

	async function getPreference(userId: number, spaceId: number): Promise<UserSpacePreference | undefined> {
		const pref = await UserSpacePreferences.findOne({
			where: { userId, spaceId },
		});
		return pref ? pref.get({ plain: true }) : undefined;
	}

	async function upsertPreference(
		userId: number,
		spaceId: number,
		updates: UserSpacePreferenceUpdate,
	): Promise<UserSpacePreference> {
		// Build the update/create data - use mutable type for building
		const data: {
			userId: number;
			spaceId: number;
			sort?: SpaceSortOption | null | undefined;
			filters?: Record<string, unknown>;
			expandedFolders?: Array<number>;
		} = {
			userId,
			spaceId,
		};

		// Handle sort field - allow explicit null to clear stored preference
		if (updates.sort !== undefined) {
			data.sort = updates.sort;
		}

		if (updates.filters !== undefined) {
			data.filters = updates.filters;
		}

		if (updates.expandedFolders !== undefined) {
			data.expandedFolders = updates.expandedFolders;
		}

		// Try to find existing preference
		const existing = await UserSpacePreferences.findOne({
			where: { userId, spaceId },
		});

		if (existing) {
			// Update existing record
			await existing.update(data);
			return existing.get({ plain: true });
		}

		// Create new record with defaults for missing fields
		const newPref: NewUserSpacePreference = {
			userId,
			spaceId,
			sort: data.sort ?? undefined,
			filters: data.filters,
			expandedFolders: data.expandedFolders ?? [],
		};

		// biome-ignore lint/suspicious/noExplicitAny: Sequelize auto-generates id and updatedAt
		const created = await UserSpacePreferences.create(newPref as any);
		return created.get({ plain: true });
	}

	async function deletePreference(userId: number, spaceId: number): Promise<void> {
		await UserSpacePreferences.destroy({
			where: { userId, spaceId },
		});
	}
}

export function createUserSpacePreferenceDaoProvider(
	defaultDao: UserSpacePreferenceDao,
): DaoProvider<UserSpacePreferenceDao> {
	return {
		getDao(context: TenantOrgContext | undefined): UserSpacePreferenceDao {
			return context?.database.userSpacePreferenceDao ?? defaultDao;
		},
	};
}
