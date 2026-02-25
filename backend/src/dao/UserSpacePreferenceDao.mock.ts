import type { UserSpacePreference } from "../model/UserSpacePreference";
import type { UserSpacePreferenceDao, UserSpacePreferenceUpdate } from "./UserSpacePreferenceDao";
import { vi } from "vitest";

export function mockUserSpacePreferenceDao(): UserSpacePreferenceDao {
	return {
		getPreference: vi.fn(
			(_userId: number, _spaceId: number): Promise<UserSpacePreference | undefined> => Promise.resolve(undefined),
		),
		upsertPreference: vi.fn(
			(userId: number, spaceId: number, updates: UserSpacePreferenceUpdate): Promise<UserSpacePreference> =>
				Promise.resolve({
					id: 1,
					userId,
					spaceId,
					sort: updates.sort === undefined ? undefined : updates.sort,
					filters: updates.filters,
					expandedFolders: updates.expandedFolders ?? [],
					updatedAt: new Date(),
				}),
		),
		deletePreference: vi.fn((_userId: number, _spaceId: number): Promise<void> => Promise.resolve()),
	};
}
