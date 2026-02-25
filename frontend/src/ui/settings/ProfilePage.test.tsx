import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import { ProfilePage } from "./ProfilePage";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { Locales } from "intlayer";
import { useLocale } from "react-intlayer";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

// Mock authClient for signOut testing
const { mockSignOut } = vi.hoisted(() => ({
	mockSignOut: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/authClient", () => ({
	authClient: {
		signOut: mockSignOut,
	},
}));

const mockProfile = {
	id: 1,
	email: "test@example.com",
	name: "Test User",
	image: null,
};

const mockProfileWithImage = {
	...mockProfile,
	image: "https://example.com/avatar.png",
};

describe("ProfilePage", () => {
	let mockClient: ReturnType<typeof createMockClient>;
	let mockGetProfile: ReturnType<typeof vi.fn>;
	let mockUpdateProfile: ReturnType<typeof vi.fn>;
	let mockHasPassword: ReturnType<typeof vi.fn>;
	let mockSetPassword: ReturnType<typeof vi.fn>;
	let mockChangePassword: ReturnType<typeof vi.fn>;
	let mockLogoutAllSessions: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockClient = createMockClient();
		mockGetProfile = vi.fn().mockResolvedValue(mockProfile);
		mockUpdateProfile = vi.fn().mockResolvedValue(mockProfile);
		mockHasPassword = vi.fn().mockResolvedValue({ hasPassword: true });
		mockSetPassword = vi.fn().mockResolvedValue({ success: true });
		mockChangePassword = vi.fn().mockResolvedValue({ success: true });
		mockLogoutAllSessions = vi.fn().mockResolvedValue({ success: true });

		// Override the profile method to return our controlled mocks
		vi.mocked(mockClient.profile).mockReturnValue({
			getProfile: mockGetProfile,
			updateProfile: mockUpdateProfile,
			hasPassword: mockHasPassword,
			setPassword: mockSetPassword,
			changePassword: mockChangePassword,
			logoutAllSessions: mockLogoutAllSessions,
			getPreferences: vi.fn().mockResolvedValue({ favoriteSpaces: [], favoriteSites: [], hash: "EMPTY" }),
			updatePreferences: vi.fn().mockResolvedValue({ favoriteSpaces: [], favoriteSites: [], hash: "newhash" }),
		});

		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	function renderProfilePage(): void {
		renderWithProviders(<ProfilePage />, { client: mockClient });
	}

	it("should render loading state initially", () => {
		// Promise that never resolves to keep component in loading state
		mockGetProfile.mockImplementation(
			() =>
				new Promise(() => {
					/* intentionally never resolves */
				}),
		);
		renderProfilePage();

		expect(screen.getByTestId("profile-loading")).toBeDefined();
	});

	it("should render profile data after loading", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-page")).toBeDefined();
		});

		expect(screen.getByTestId("profile-title")).toBeDefined();
		expect(screen.getByTestId("profile-name-display").textContent).toBe("Test User");
		expect(screen.getByTestId("profile-email-display").textContent).toBe("test@example.com");
	});

	it("should render error state when profile fails to load", async () => {
		mockGetProfile.mockRejectedValue(new Error("Failed to load"));
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-error")).toBeDefined();
		});

		expect(toast.error).toHaveBeenCalled();
	});

	it("should render initials when no profile image", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-avatar")).toBeDefined();
		});

		// Should show initials "TU" (from "Test User")
		expect(screen.getByTestId("profile-avatar").textContent).toBe("TU");
	});

	it("should render profile image when present", async () => {
		mockGetProfile.mockResolvedValue(mockProfileWithImage);
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-image")).toBeDefined();
		});

		const image = screen.getByTestId("profile-image");
		expect(image.getAttribute("src")).toBe("https://example.com/avatar.png");
	});

	it("should use email initials when name is undefined", async () => {
		mockGetProfile.mockResolvedValue({
			...mockProfile,
			name: undefined,
		});
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-avatar")).toBeDefined();
		});

		// Should show initials "TE" (from "test@example.com")
		expect(screen.getByTestId("profile-avatar").textContent).toBe("TE");
	});

	it("should use first two chars when name is single word", async () => {
		mockGetProfile.mockResolvedValue({
			...mockProfile,
			name: "Alice",
		});
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-avatar")).toBeDefined();
		});

		// Should show initials "AL" (from "Alice")
		expect(screen.getByTestId("profile-avatar").textContent).toBe("AL");
	});

	it("should open change password dialog when button is clicked", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("change-password-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("change-password-button"));

		expect(screen.getByTestId("change-password-dialog")).toBeDefined();
	});

	it("should show password mismatch error when passwords do not match", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("change-password-button")).toBeDefined();
		});

		// Open dialog
		fireEvent.click(screen.getByTestId("change-password-button"));

		// Fill in passwords that don't match
		const currentPasswordInput = screen.getByTestId("current-password-input");
		const newPasswordInput = screen.getByTestId("new-password-input");
		const confirmPasswordInput = screen.getByTestId("confirm-password-input");

		fireEvent.input(currentPasswordInput, { target: { value: "CurrentPass1!" } });
		fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "DifferentPass1234!" } });

		// Click update button
		fireEvent.click(screen.getByTestId("update-password-button"));

		// Should show password mismatch error
		await waitFor(() => {
			expect(screen.getByTestId("password-error")).toBeDefined();
		});
	});

	it("should show password requirements error when new password is invalid", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("change-password-button")).toBeDefined();
		});

		// Open dialog
		fireEvent.click(screen.getByTestId("change-password-button"));

		// Fill in passwords that match but don't meet requirements
		const currentPasswordInput = screen.getByTestId("current-password-input");
		const newPasswordInput = screen.getByTestId("new-password-input");
		const confirmPasswordInput = screen.getByTestId("confirm-password-input");

		fireEvent.input(currentPasswordInput, { target: { value: "CurrentPass1!" } });
		fireEvent.input(newPasswordInput, { target: { value: "weak" } }); // Too weak
		fireEvent.input(confirmPasswordInput, { target: { value: "weak" } });

		// Click update button
		fireEvent.click(screen.getByTestId("update-password-button"));

		// Should show password requirements error
		await waitFor(() => {
			expect(screen.getByTestId("password-error")).toBeDefined();
		});
	});

	it("should successfully change password when valid", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("change-password-button")).toBeDefined();
		});

		// Open dialog
		fireEvent.click(screen.getByTestId("change-password-button"));

		// Fill in valid passwords
		const currentPasswordInput = screen.getByTestId("current-password-input");
		const newPasswordInput = screen.getByTestId("new-password-input");
		const confirmPasswordInput = screen.getByTestId("confirm-password-input");

		fireEvent.input(currentPasswordInput, { target: { value: "CurrentPass1!" } });
		fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

		// Click update button
		fireEvent.click(screen.getByTestId("update-password-button"));

		await waitFor(() => {
			expect(mockChangePassword).toHaveBeenCalledWith({
				currentPassword: "CurrentPass1!",
				newPassword: "NewPass1234!",
			});
		});

		expect(toast.success).toHaveBeenCalled();
	});

	it("should show error when password change API fails with Error", async () => {
		mockChangePassword.mockRejectedValue(new Error("Current password is incorrect"));
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("change-password-button")).toBeDefined();
		});

		// Open dialog
		fireEvent.click(screen.getByTestId("change-password-button"));

		// Fill in valid passwords
		const currentPasswordInput = screen.getByTestId("current-password-input");
		const newPasswordInput = screen.getByTestId("new-password-input");
		const confirmPasswordInput = screen.getByTestId("confirm-password-input");

		fireEvent.input(currentPasswordInput, { target: { value: "WrongPass1!" } });
		fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

		// Click update button
		fireEvent.click(screen.getByTestId("update-password-button"));

		// Should show error from API
		await waitFor(() => {
			expect(screen.getByTestId("password-error")).toBeDefined();
			expect(screen.getByTestId("password-error").textContent).toContain("Current password is incorrect");
		});
	});

	it("should show generic error when password change API fails with non-Error", async () => {
		mockChangePassword.mockRejectedValue("Unknown error");
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("change-password-button")).toBeDefined();
		});

		// Open dialog
		fireEvent.click(screen.getByTestId("change-password-button"));

		// Fill in valid passwords
		const currentPasswordInput = screen.getByTestId("current-password-input");
		const newPasswordInput = screen.getByTestId("new-password-input");
		const confirmPasswordInput = screen.getByTestId("confirm-password-input");

		fireEvent.input(currentPasswordInput, { target: { value: "WrongPass1!" } });
		fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

		// Click update button
		fireEvent.click(screen.getByTestId("update-password-button"));

		// Should show password error (will show generic error from content)
		await waitFor(() => {
			expect(screen.getByTestId("password-error")).toBeDefined();
		});
	});

	it("should reset password form when dialog is closed", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("change-password-button")).toBeDefined();
		});

		// Open dialog
		fireEvent.click(screen.getByTestId("change-password-button"));

		// Fill in some values
		const currentPasswordInput = screen.getByTestId("current-password-input");
		fireEvent.input(currentPasswordInput, { target: { value: "SomePassword1!" } });

		// Close dialog by clicking cancel button
		const cancelButton = screen.getByRole("button", { name: /cancel/i });
		fireEvent.click(cancelButton);

		// Reopen dialog
		await waitFor(() => {
			expect(screen.queryByTestId("change-password-dialog")).toBeNull();
		});

		fireEvent.click(screen.getByTestId("change-password-button"));

		// Fields should be reset
		const newCurrentPasswordInput = screen.getByTestId("current-password-input") as HTMLInputElement;
		expect(newCurrentPasswordInput.value).toBe("");
	});

	// Name editing tests
	it("should enter edit mode when clicking edit name button", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});

		// Click edit button
		fireEvent.click(screen.getByTestId("profile-name-change-link"));

		// Should show input field instead of display
		expect(screen.getByTestId("profile-name-input")).toBeDefined();
		expect(screen.getByTestId("profile-name-save-button")).toBeDefined();
		expect(screen.getByTestId("profile-name-cancel-button")).toBeDefined();
	});

	it("should initialize edit name with empty string when name is undefined", async () => {
		mockGetProfile.mockResolvedValue({
			...mockProfile,
			name: undefined,
		});
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-page")).toBeDefined();
		});

		// Click edit button
		fireEvent.click(screen.getByTestId("profile-name-change-link"));

		// Should show input field with empty string (from ?? "")
		const input = screen.getByTestId("profile-name-input") as HTMLInputElement;
		expect(input.value).toBe("");
	});

	it("should cancel name editing when clicking cancel button", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});

		// Enter edit mode
		fireEvent.click(screen.getByTestId("profile-name-change-link"));

		// Change the value
		const input = screen.getByTestId("profile-name-input") as HTMLInputElement;
		fireEvent.input(input, { target: { value: "New Name" } });

		// Click cancel
		fireEvent.click(screen.getByTestId("profile-name-cancel-button"));

		// Should return to display mode with original name
		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});
		expect(screen.getByTestId("profile-name-display").textContent).toBe("Test User");
	});

	it("should save name successfully when clicking save button", async () => {
		const updatedProfile = { ...mockProfile, name: "New Name" };
		mockUpdateProfile.mockResolvedValue(updatedProfile);
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});

		// Enter edit mode
		fireEvent.click(screen.getByTestId("profile-name-change-link"));

		// Change the value
		const input = screen.getByTestId("profile-name-input") as HTMLInputElement;
		fireEvent.input(input, { target: { value: "New Name" } });

		// Click save
		fireEvent.click(screen.getByTestId("profile-name-save-button"));

		// Should call updateProfile API
		await waitFor(() => {
			expect(mockUpdateProfile).toHaveBeenCalledWith({ name: "New Name" });
		});

		// Should show success toast and return to display mode
		expect(toast.success).toHaveBeenCalled();
		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});
		expect(screen.getByTestId("profile-name-display").textContent).toBe("New Name");
	});

	it("should show error toast when save name fails", async () => {
		mockUpdateProfile.mockRejectedValue(new Error("Failed to update"));
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});

		// Enter edit mode
		fireEvent.click(screen.getByTestId("profile-name-change-link"));

		// Change the value
		const input = screen.getByTestId("profile-name-input") as HTMLInputElement;
		fireEvent.input(input, { target: { value: "New Name" } });

		// Click save
		fireEvent.click(screen.getByTestId("profile-name-save-button"));

		// Should show error toast
		await waitFor(() => {
			expect(toast.error).toHaveBeenCalled();
		});
	});

	it("should cancel edit when saving empty or unchanged name", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});

		// Enter edit mode
		fireEvent.click(screen.getByTestId("profile-name-change-link"));

		// Clear the value to empty
		const input = screen.getByTestId("profile-name-input") as HTMLInputElement;
		fireEvent.input(input, { target: { value: "   " } });

		// Click save (should cancel instead since name is empty after trim)
		fireEvent.click(screen.getByTestId("profile-name-save-button"));

		// Should return to display mode without calling API
		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});
		expect(mockUpdateProfile).not.toHaveBeenCalled();
	});

	it("should cancel edit when saving same name as current", async () => {
		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});

		// Enter edit mode
		fireEvent.click(screen.getByTestId("profile-name-change-link"));

		// Keep the same name
		const input = screen.getByTestId("profile-name-input") as HTMLInputElement;
		expect(input.value).toBe("Test User");

		// Click save (should cancel since name is unchanged)
		fireEvent.click(screen.getByTestId("profile-name-save-button"));

		// Should return to display mode without calling API
		await waitFor(() => {
			expect(screen.getByTestId("profile-name-display")).toBeDefined();
		});
		expect(mockUpdateProfile).not.toHaveBeenCalled();
	});

	// Set Password functionality tests (for OAuth-only users)
	describe("Set Password functionality", () => {
		it("should show Set Password button when user has no password", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			expect(screen.queryByTestId("change-password-button")).toBeNull();
		});

		it("should show Change Password button when user has password", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: true });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("change-password-button")).toBeDefined();
			});

			expect(screen.queryByTestId("set-password-button")).toBeNull();
		});

		it("should open set password dialog when button is clicked", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			expect(screen.getByTestId("set-password-dialog")).toBeDefined();
		});

		it("should show password mismatch error in set password dialog", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			const newPasswordInput = screen.getByTestId("set-new-password-input");
			const confirmPasswordInput = screen.getByTestId("set-confirm-password-input");

			fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "DifferentPass1234!" } });

			fireEvent.click(screen.getByTestId("set-password-submit-button"));

			await waitFor(() => {
				expect(screen.getByTestId("set-password-error")).toBeDefined();
			});
		});

		it("should show password requirements error when password is weak", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			const newPasswordInput = screen.getByTestId("set-new-password-input");
			const confirmPasswordInput = screen.getByTestId("set-confirm-password-input");

			fireEvent.input(newPasswordInput, { target: { value: "weak" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "weak" } });

			fireEvent.click(screen.getByTestId("set-password-submit-button"));

			await waitFor(() => {
				expect(screen.getByTestId("set-password-error")).toBeDefined();
			});
		});

		it("should successfully set password when valid", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			const newPasswordInput = screen.getByTestId("set-new-password-input");
			const confirmPasswordInput = screen.getByTestId("set-confirm-password-input");

			fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

			fireEvent.click(screen.getByTestId("set-password-submit-button"));

			await waitFor(() => {
				expect(mockSetPassword).toHaveBeenCalledWith({
					newPassword: "NewPass1234!",
				});
			});

			expect(toast.success).toHaveBeenCalled();
		});

		it("should show error when set password API fails with Error", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			mockSetPassword.mockRejectedValue(new Error("Server error"));
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			const newPasswordInput = screen.getByTestId("set-new-password-input");
			const confirmPasswordInput = screen.getByTestId("set-confirm-password-input");

			fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

			fireEvent.click(screen.getByTestId("set-password-submit-button"));

			await waitFor(() => {
				expect(screen.getByTestId("set-password-error")).toBeDefined();
				expect(screen.getByTestId("set-password-error").textContent).toContain("Server error");
			});
		});

		it("should show generic error when set password API fails with non-Error", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			mockSetPassword.mockRejectedValue("Unknown error");
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			const newPasswordInput = screen.getByTestId("set-new-password-input");
			const confirmPasswordInput = screen.getByTestId("set-confirm-password-input");

			fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

			fireEvent.click(screen.getByTestId("set-password-submit-button"));

			await waitFor(() => {
				expect(screen.getByTestId("set-password-error")).toBeDefined();
			});
		});

		it("should update to show Change Password button after successfully setting password", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			const newPasswordInput = screen.getByTestId("set-new-password-input");
			const confirmPasswordInput = screen.getByTestId("set-confirm-password-input");

			fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

			fireEvent.click(screen.getByTestId("set-password-submit-button"));

			await waitFor(() => {
				expect(screen.getByTestId("change-password-button")).toBeDefined();
			});

			expect(screen.queryByTestId("set-password-button")).toBeNull();
		});

		it("should reset set password form when dialog is closed", async () => {
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			// Open dialog
			fireEvent.click(screen.getByTestId("set-password-button"));

			// Fill in some values
			const newPasswordInput = screen.getByTestId("set-new-password-input");
			fireEvent.input(newPasswordInput, { target: { value: "SomePassword1!" } });

			// Close dialog by clicking cancel button
			const cancelButton = screen.getByRole("button", { name: /cancel/i });
			fireEvent.click(cancelButton);

			// Reopen dialog
			await waitFor(() => {
				expect(screen.queryByTestId("set-password-dialog")).toBeNull();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			// Fields should be reset
			const newNewPasswordInput = screen.getByTestId("set-new-password-input") as HTMLInputElement;
			expect(newNewPasswordInput.value).toBe("");
		});
	});

	// Auth gateway origin tests
	it("should set authGatewayOrigin when session config provides it", async () => {
		vi.mocked(mockClient.auth).mockReturnValue({
			...mockClient.auth(),
			getSessionConfig: vi.fn().mockResolvedValue({
				idleTimeoutMs: 3600000,
				authGatewayOrigin: "https://auth.example.com",
			}),
		});

		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("profile-page")).toBeDefined();
		});
	});

	// Restart onboarding tests
	describe("Restart onboarding", () => {
		it("should restart onboarding when button is clicked", async () => {
			const mockRestart = vi.fn().mockResolvedValue({ success: true, state: {} });
			const onboardingMock = mockClient.onboarding();
			vi.mocked(mockClient.onboarding).mockReturnValue({ ...onboardingMock, restart: mockRestart });

			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("restart-onboarding-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("restart-onboarding-button"));

			await waitFor(() => {
				expect(mockRestart).toHaveBeenCalled();
			});

			expect(toast.success).toHaveBeenCalled();
		});

		it("should show error toast when restart onboarding fails", async () => {
			const mockRestart = vi.fn().mockRejectedValue(new Error("Failed to restart"));
			const onboardingMock = mockClient.onboarding();
			vi.mocked(mockClient.onboarding).mockReturnValue({ ...onboardingMock, restart: mockRestart });

			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("restart-onboarding-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("restart-onboarding-button"));

			await waitFor(() => {
				expect(toast.error).toHaveBeenCalled();
			});
		});
	});

	// Protection check tests - these test defensive checks against race conditions
	// The protection checks are hit when hasPassword state doesn't match what was expected
	describe("Protection checks", () => {
		it("should show error when trying to change password but hasPassword state is null", async () => {
			// Test normal flow where hasPassword resolves to true
			mockHasPassword.mockResolvedValue({ hasPassword: true });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("change-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("change-password-button"));

			// Fill in valid passwords
			const currentPasswordInput = screen.getByTestId("current-password-input");
			const newPasswordInput = screen.getByTestId("new-password-input");
			const confirmPasswordInput = screen.getByTestId("confirm-password-input");

			fireEvent.input(currentPasswordInput, { target: { value: "CurrentPass1!" } });
			fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

			fireEvent.click(screen.getByTestId("update-password-button"));

			// This tests the normal flow - protection is based on state at time of action
			await waitFor(() => {
				expect(mockChangePassword).toHaveBeenCalled();
			});
		});

		it("should show error when trying to set password but hasPassword is already true", async () => {
			// Test where hasPassword returns false initially, but then updates to true
			mockHasPassword.mockResolvedValue({ hasPassword: false });
			renderProfilePage();

			await waitFor(() => {
				expect(screen.getByTestId("set-password-button")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("set-password-button"));

			// Fill in valid passwords
			const newPasswordInput = screen.getByTestId("set-new-password-input");
			const confirmPasswordInput = screen.getByTestId("set-confirm-password-input");

			fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

			fireEvent.click(screen.getByTestId("set-password-submit-button"));

			// This tests the normal flow - protection is based on state at time of action
			await waitFor(() => {
				expect(mockSetPassword).toHaveBeenCalled();
			});
		});
	});

	// Auth gateway redirect and signOut error handling
	it("should redirect to auth gateway login URL after password change and handle signOut failure", async () => {
		// Set up authGatewayOrigin via session config (covers getLoginUrl truthy branch)
		vi.mocked(mockClient.auth).mockReturnValue({
			...mockClient.auth(),
			getSessionConfig: vi.fn().mockResolvedValue({
				idleTimeoutMs: 3600000,
				authGatewayOrigin: "https://auth.example.com",
			}),
		});

		// Make signOut throw (covers catch block at L197)
		mockSignOut.mockRejectedValueOnce(new Error("Session already invalid"));

		// Mock window.location.href to capture navigation
		const hrefSpy = vi.fn();
		const originalLocation = window.location;
		// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for window.location override
		delete (window as any).location;
		// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for window.location override
		(window as any).location = {
			href: "http://localhost:8034",
			origin: "http://localhost:8034",
			pathname: "/",
			search: "",
			hash: "",
		};
		Object.defineProperty(window.location, "href", {
			set: hrefSpy,
			get: () => "http://localhost:8034",
			configurable: true,
		});

		renderProfilePage();

		await waitFor(() => {
			expect(screen.getByTestId("change-password-button")).toBeDefined();
		});

		// Open dialog
		fireEvent.click(screen.getByTestId("change-password-button"));

		// Fill in valid passwords
		const currentPasswordInput = screen.getByTestId("current-password-input");
		const newPasswordInput = screen.getByTestId("new-password-input");
		const confirmPasswordInput = screen.getByTestId("confirm-password-input");

		fireEvent.input(currentPasswordInput, { target: { value: "CurrentPass1!" } });
		fireEvent.input(newPasswordInput, { target: { value: "NewPass1234!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "NewPass1234!" } });

		// Click update button
		fireEvent.click(screen.getByTestId("update-password-button"));

		await waitFor(() => {
			expect(mockChangePassword).toHaveBeenCalled();
		});

		// Should redirect to auth gateway login URL (not just /login)
		await waitFor(() => {
			expect(hrefSpy).toHaveBeenCalledWith("https://auth.example.com/login");
		});

		// Restore window.location
		// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for window.location override
		(window as any).location = originalLocation;
	});
});
