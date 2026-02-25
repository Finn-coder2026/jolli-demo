/**
 * ProfileClient - Client for user profile management.
 *
 * Provides methods for:
 * - Fetching the current user's profile
 * - Updating profile information (name)
 * - Checking if user has password authentication
 * - Setting initial password for OAuth-only users
 * - Changing password
 * - Getting and updating user preferences (favorites)
 */

import type { ClientAuth } from "./Client";

/**
 * User profile data returned from the API.
 */
export interface ProfileData {
	userId: number;
	email: string;
	name: string;
	image: string | null;
}

/**
 * Request body for updating profile.
 */
export interface UpdateProfileRequest {
	name: string;
}

/**
 * Request body for changing password.
 */
export interface ChangePasswordRequest {
	currentPassword: string;
	newPassword: string;
}

/**
 * Response body for has-password check.
 */
export interface HasPasswordResponse {
	hasPassword: boolean;
}

/**
 * Request body for setting initial password.
 */
export interface SetPasswordRequest {
	newPassword: string;
}

/**
 * Error response from profile API.
 */
export interface ProfileApiError {
	error: string;
	message?: string;
}

/**
 * User preferences (favorites) response.
 */
export interface UserPreferencesResponse {
	favoriteSpaces: Array<number>;
	favoriteSites: Array<number>;
	hash: string;
}

/**
 * Request body for updating user preferences.
 * Partial updates supported - only provided fields are updated.
 */
export interface UpdateUserPreferencesRequest {
	favoriteSpaces?: Array<number>;
	favoriteSites?: Array<number>;
}

/**
 * Client interface for profile operations.
 */
export interface ProfileClient {
	/**
	 * Get the current user's profile.
	 */
	getProfile(): Promise<ProfileData>;

	/**
	 * Update the current user's profile.
	 * Currently only name can be updated (email is read-only).
	 */
	updateProfile(data: UpdateProfileRequest): Promise<ProfileData>;

	/**
	 * Check if the current user has password authentication set up.
	 */
	hasPassword(): Promise<HasPasswordResponse>;

	/**
	 * Set initial password for OAuth-only users.
	 * Only works if user doesn't have password authentication yet.
	 */
	setPassword(data: SetPasswordRequest): Promise<void>;

	/**
	 * Change the current user's password.
	 * Requires the current password for verification.
	 */
	changePassword(data: ChangePasswordRequest): Promise<void>;

	/**
	 * Logout from all devices by revoking all remember-me tokens.
	 * After calling this, all sessions (including current) will be invalidated.
	 */
	logoutAllSessions(): Promise<void>;

	/**
	 * Get user preferences (favorites).
	 */
	getPreferences(): Promise<UserPreferencesResponse>;

	/**
	 * Update user preferences (favorites).
	 * Partial updates supported - only provided fields are updated.
	 */
	updatePreferences(data: UpdateUserPreferencesRequest): Promise<UserPreferencesResponse>;
}

/**
 * Create a profile client instance.
 */
export function createProfileClient(baseUrl: string, auth: ClientAuth): ProfileClient {
	return {
		getProfile,
		updateProfile,
		hasPassword,
		setPassword,
		changePassword,
		logoutAllSessions,
		getPreferences,
		updatePreferences,
	};

	async function getProfile(): Promise<ProfileData> {
		const response = await fetch(`${baseUrl}/api/profile`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const error = (await response.json()) as ProfileApiError;
			throw new Error(error.message ?? error.error ?? "Failed to get profile");
		}
		return (await response.json()) as ProfileData;
	}

	async function updateProfile(data: UpdateProfileRequest): Promise<ProfileData> {
		const response = await fetch(`${baseUrl}/api/profile`, auth.createRequest("PUT", data));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const error = (await response.json()) as ProfileApiError;
			throw new Error(error.message ?? error.error ?? "Failed to update profile");
		}
		return (await response.json()) as ProfileData;
	}

	async function hasPassword(): Promise<HasPasswordResponse> {
		const response = await fetch(`${baseUrl}/api/profile/has-password`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const error = (await response.json()) as ProfileApiError;
			throw new Error(error.message ?? error.error ?? "Failed to check password status");
		}
		return (await response.json()) as HasPasswordResponse;
	}

	async function setPassword(data: SetPasswordRequest): Promise<void> {
		const response = await fetch(`${baseUrl}/api/profile/set-password`, auth.createRequest("POST", data));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const error = (await response.json()) as ProfileApiError;
			throw new Error(error.message ?? error.error ?? "Failed to set password");
		}
	}

	async function changePassword(data: ChangePasswordRequest): Promise<void> {
		const response = await fetch(`${baseUrl}/api/profile/change-password`, auth.createRequest("POST", data));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const error = (await response.json()) as ProfileApiError;
			throw new Error(error.message ?? error.error ?? "Failed to change password");
		}
	}

	async function logoutAllSessions(): Promise<void> {
		const response = await fetch(`${baseUrl}/api/profile/logout-all-sessions`, auth.createRequest("POST"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const error = (await response.json()) as ProfileApiError;
			throw new Error(error.message ?? error.error ?? "Failed to logout from all devices");
		}
	}

	async function getPreferences(): Promise<UserPreferencesResponse> {
		const response = await fetch(`${baseUrl}/api/profile/preferences`, auth.createRequest("GET"));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const error = (await response.json()) as ProfileApiError;
			throw new Error(error.message ?? error.error ?? "Failed to get preferences");
		}
		return (await response.json()) as UserPreferencesResponse;
	}

	async function updatePreferences(data: UpdateUserPreferencesRequest): Promise<UserPreferencesResponse> {
		const response = await fetch(`${baseUrl}/api/profile/preferences`, auth.createRequest("PUT", data));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			const error = (await response.json()) as ProfileApiError;
			throw new Error(error.message ?? error.error ?? "Failed to update preferences");
		}
		return (await response.json()) as UserPreferencesResponse;
	}
}
