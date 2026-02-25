import type { ClientAuth } from "./Client";
import { createProfileClient, type ProfileData } from "./ProfileClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create a mock auth object
function createMockAuth(checkUnauthorized?: (response: Response) => boolean): ClientAuth {
	const auth: ClientAuth = {
		createRequest: (method, body, additional) => {
			const headers: Record<string, string> = {};
			if (body) {
				headers["Content-Type"] = "application/json";
			}

			return {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
				...additional,
			};
		},
		authToken: undefined,
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

// Sample profile data
const mockProfile: ProfileData = {
	userId: 1,
	email: "test@example.com",
	name: "Test User",
	image: null,
};

describe("ProfileClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	describe("getProfile", () => {
		it("should get profile successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockProfile),
			});

			const client = createProfileClient("", createMockAuth());
			const profile = await client.getProfile();

			expect(profile).toEqual(mockProfile);
			expect(global.fetch).toHaveBeenCalledWith("/api/profile", expect.objectContaining({ method: "GET" }));
		});

		it("should throw error when get profile fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({ error: "Not authenticated" }),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.getProfile()).rejects.toThrow("Not authenticated");
		});

		it("should throw default message when error response has no message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.getProfile()).rejects.toThrow("Failed to get profile");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockProfile),
			});

			const client = createProfileClient("", createMockAuth(checkUnauthorized));
			await client.getProfile();

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("updateProfile", () => {
		it("should update profile successfully", async () => {
			const updatedProfile = { ...mockProfile, name: "New Name" };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(updatedProfile),
			});

			const client = createProfileClient("", createMockAuth());
			const result = await client.updateProfile({ name: "New Name" });

			expect(result).toEqual(updatedProfile);
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/profile",
				expect.objectContaining({
					method: "PUT",
					body: JSON.stringify({ name: "New Name" }),
				}),
			);
		});

		it("should throw error when update fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({ error: "Validation error", message: "Name too short" }),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.updateProfile({ name: "A" })).rejects.toThrow("Name too short");
		});

		it("should throw default message when error response has no message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.updateProfile({ name: "Test" })).rejects.toThrow("Failed to update profile");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockProfile),
			});

			const client = createProfileClient("", createMockAuth(checkUnauthorized));
			await client.updateProfile({ name: "New Name" });

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("hasPassword", () => {
		it("should return hasPassword status successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ hasPassword: true }),
			});

			const client = createProfileClient("", createMockAuth());
			const result = await client.hasPassword();

			expect(result).toEqual({ hasPassword: true });
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/profile/has-password",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("should return false when user has no password", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ hasPassword: false }),
			});

			const client = createProfileClient("", createMockAuth());
			const result = await client.hasPassword();

			expect(result).toEqual({ hasPassword: false });
		});

		it("should throw error when check fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({ error: "unauthorized" }),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.hasPassword()).rejects.toThrow("unauthorized");
		});

		it("should throw default message when error response has no message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.hasPassword()).rejects.toThrow("Failed to check password status");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ hasPassword: false }),
			});

			const client = createProfileClient("", createMockAuth(checkUnauthorized));
			await client.hasPassword();

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("setPassword", () => {
		it("should set password successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createProfileClient("", createMockAuth());
			await client.setPassword({ newPassword: "NewPass1!" });

			expect(global.fetch).toHaveBeenCalledWith(
				"/api/profile/set-password",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ newPassword: "NewPass1!" }),
				}),
			);
		});

		it("should throw error when password already set", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({
					error: "password_already_set",
					message: "Password is already set. Use change-password instead.",
				}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.setPassword({ newPassword: "NewPass1!" })).rejects.toThrow(
				"Password is already set. Use change-password instead.",
			);
		});

		it("should throw default message when error response has no message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.setPassword({ newPassword: "NewPass1!" })).rejects.toThrow("Failed to set password");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createProfileClient("", createMockAuth(checkUnauthorized));
			await client.setPassword({ newPassword: "NewPass1!" });

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("changePassword", () => {
		it("should change password successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createProfileClient("", createMockAuth());
			await client.changePassword({
				currentPassword: "OldPass1!",
				newPassword: "NewPass1!",
			});

			expect(global.fetch).toHaveBeenCalledWith(
				"/api/profile/change-password",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						currentPassword: "OldPass1!",
						newPassword: "NewPass1!",
					}),
				}),
			);
		});

		it("should throw error when current password is wrong", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi
					.fn()
					.mockResolvedValue({ error: "Invalid password", message: "Current password is incorrect" }),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(
				client.changePassword({
					currentPassword: "WrongPass1!",
					newPassword: "NewPass1!",
				}),
			).rejects.toThrow("Current password is incorrect");
		});

		it("should throw default message when error response has no message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(
				client.changePassword({
					currentPassword: "OldPass1!",
					newPassword: "NewPass1!",
				}),
			).rejects.toThrow("Failed to change password");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createProfileClient("", createMockAuth(checkUnauthorized));
			await client.changePassword({
				currentPassword: "OldPass1!",
				newPassword: "NewPass1!",
			});

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("logoutAllSessions", () => {
		it("should logout all sessions successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createProfileClient("", createMockAuth());
			await client.logoutAllSessions();

			expect(global.fetch).toHaveBeenCalledWith(
				"/api/profile/logout-all-sessions",
				expect.objectContaining({
					method: "POST",
				}),
			);
		});

		it("should throw error when logout fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({ error: "Server error", message: "Failed to revoke tokens" }),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.logoutAllSessions()).rejects.toThrow("Failed to revoke tokens");
		});

		it("should throw default message when error response has no message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.logoutAllSessions()).rejects.toThrow("Failed to logout from all devices");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createProfileClient("", createMockAuth(checkUnauthorized));
			await client.logoutAllSessions();

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("getPreferences", () => {
		it("should get preferences successfully", async () => {
			const mockPreferences = {
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [10, 20],
				hash: "abc123",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockPreferences),
			});

			const client = createProfileClient("", createMockAuth());
			const result = await client.getPreferences();

			expect(result).toEqual(mockPreferences);
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/profile/preferences",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("should throw error when get preferences fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({ error: "unauthorized", message: "Not authenticated" }),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.getPreferences()).rejects.toThrow("Not authenticated");
		});

		it("should throw default message when error response has no message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.getPreferences()).rejects.toThrow("Failed to get preferences");
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ favoriteSpaces: [], favoriteSites: [], hash: "EMPTY" }),
			});

			const client = createProfileClient("", createMockAuth(checkUnauthorized));
			await client.getPreferences();

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("updatePreferences", () => {
		it("should update preferences successfully", async () => {
			const updatedPreferences = {
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [10],
				hash: "newhash",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(updatedPreferences),
			});

			const client = createProfileClient("", createMockAuth());
			const result = await client.updatePreferences({ favoriteSpaces: [1, 2, 3], favoriteSites: [10] });

			expect(result).toEqual(updatedPreferences);
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/profile/preferences",
				expect.objectContaining({
					method: "PUT",
					body: JSON.stringify({ favoriteSpaces: [1, 2, 3], favoriteSites: [10] }),
				}),
			);
		});

		it("should support partial updates", async () => {
			const updatedPreferences = {
				favoriteSpaces: [5],
				favoriteSites: [],
				hash: "newhash",
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(updatedPreferences),
			});

			const client = createProfileClient("", createMockAuth());
			const result = await client.updatePreferences({ favoriteSpaces: [5] });

			expect(result).toEqual(updatedPreferences);
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/profile/preferences",
				expect.objectContaining({
					method: "PUT",
					body: JSON.stringify({ favoriteSpaces: [5] }),
				}),
			);
		});

		it("should throw error when update preferences fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({ error: "validation_error", message: "Invalid space IDs" }),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.updatePreferences({ favoriteSpaces: [-1] })).rejects.toThrow("Invalid space IDs");
		});

		it("should throw default message when error response has no message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				json: vi.fn().mockResolvedValue({}),
			});

			const client = createProfileClient("", createMockAuth());

			await expect(client.updatePreferences({ favoriteSpaces: [1] })).rejects.toThrow(
				"Failed to update preferences",
			);
		});

		it("should call checkUnauthorized when provided", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ favoriteSpaces: [1], favoriteSites: [], hash: "hash" }),
			});

			const client = createProfileClient("", createMockAuth(checkUnauthorized));
			await client.updatePreferences({ favoriteSpaces: [1] });

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("base URL handling", () => {
		it("should prefix requests with base URL when provided", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockProfile),
			});

			const client = createProfileClient("https://api.example.com", createMockAuth());
			await client.getProfile();

			expect(global.fetch).toHaveBeenCalledWith("https://api.example.com/api/profile", expect.any(Object));
		});
	});
});
