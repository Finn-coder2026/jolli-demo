import type { ProfileClient, ProfileData, UserPreferencesResponse } from "./ProfileClient";

function createMockProfileData(): ProfileData {
	return {
		userId: 1,
		email: "test@example.com",
		name: "Test User",
		image: null,
	};
}

function createMockUserPreferences(): UserPreferencesResponse {
	return {
		favoriteSpaces: [],
		favoriteSites: [],
		hash: "EMPTY",
	};
}

export function mockProfileClient(partial?: Partial<ProfileClient>): ProfileClient {
	return {
		getProfile: async () => createMockProfileData(),
		updateProfile: async () => createMockProfileData(),
		hasPassword: async () => ({ hasPassword: true }),
		setPassword: async () => void 0,
		changePassword: async () => void 0,
		logoutAllSessions: async () => void 0,
		getPreferences: async () => createMockUserPreferences(),
		updatePreferences: async () => createMockUserPreferences(),
		...partial,
	};
}
