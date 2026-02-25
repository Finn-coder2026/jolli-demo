import { EMPTY_PREFERENCES_HASH, type UserPreference } from "../model/UserPreference";
import type { UserPreferenceDao } from "./UserPreferenceDao";
import { vi } from "vitest";

export function mockUserPreferenceDao(partial?: Partial<UserPreferenceDao>): UserPreferenceDao {
	return {
		getPreference: vi.fn().mockResolvedValue(undefined),
		getHash: vi.fn().mockResolvedValue(EMPTY_PREFERENCES_HASH),
		upsertPreference: vi.fn().mockImplementation(
			async (userId: number, updates): Promise<UserPreference> => ({
				userId,
				favoriteSpaces: updates.favoriteSpaces ?? [],
				favoriteSites: updates.favoriteSites ?? [],
				hash: "mockhash",
				updatedAt: new Date(),
			}),
		),
		...partial,
	};
}
