import { Settings } from "./Settings";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { Locales } from "intlayer";
import type { Client, ProfileData } from "jolli-common";
import type { ReactNode } from "react";
import { useLocale } from "react-intlayer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientProvider } from "@/contexts/ClientContext";
import { DevToolsProvider } from "@/contexts/DevToolsContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { OrgProvider } from "@/contexts/OrgContext";
import { PermissionProvider } from "@/contexts/PermissionContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { RouterProvider } from "@/contexts/RouterContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Mock profile data
const mockProfile: ProfileData = {
	userId: 1,
	email: "test@example.com",
	name: "Test User",
	image: null,
};

// Mock the client
const mockClient = {
	orgs: () => ({
		getCurrent: vi.fn().mockResolvedValue({
			tenant: null,
			org: null,
			availableOrgs: [],
		}),
	}),
	roles: () => ({
		getCurrentUserPermissions: vi.fn().mockResolvedValue({
			role: {
				id: 1,
				name: "Member",
				slug: "member",
				description: null,
				isBuiltIn: true,
				isDefault: true,
				priority: 50,
				clonedFrom: null,
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				permissions: [],
			},
			permissions: ["roles.view", "users.view", "integrations.view"],
		}),
	}),
	profile: () => ({
		getProfile: vi.fn().mockResolvedValue(mockProfile),
		updateProfile: vi.fn().mockResolvedValue(mockProfile),
		hasPassword: vi.fn().mockResolvedValue({ hasPassword: true }),
		setPassword: vi.fn().mockResolvedValue(undefined),
		changePassword: vi.fn().mockResolvedValue(undefined),
		logoutAllSessions: vi.fn().mockResolvedValue({ success: true }),
	}),
	auth: () => ({
		getSessionConfig: vi.fn().mockResolvedValue({ idleTimeoutMs: 3600000 }),
	}),
	integrations: () => ({
		listIntegrations: vi.fn().mockResolvedValue([{ id: 1 }]),
	}),
	github: () => ({
		getGitHubInstallations: vi.fn().mockResolvedValue([]),
	}),
} as unknown as Client;

function renderWithProviders(ui: ReactNode, pathname = "/settings") {
	return render(
		<ClientProvider client={mockClient}>
			<OrgProvider>
				<PermissionProvider>
					<PreferencesProvider>
						<RouterProvider>
							<DevToolsProvider>
								<NavigationProvider pathname={pathname}>
									<ThemeProvider>{ui}</ThemeProvider>
								</NavigationProvider>
							</DevToolsProvider>
						</RouterProvider>
					</PreferencesProvider>
				</PermissionProvider>
			</OrgProvider>
		</ClientProvider>,
	);
}

describe("Settings", () => {
	beforeEach(() => {
		localStorage.clear();
		// Mock intlayer to return content for both settings and language-switcher
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: vi.fn(),
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	afterEach(() => {
		localStorage.clear();
	});

	describe("Layout and Navigation", () => {
		it("should render settings layout with sidebar", async () => {
			renderWithProviders(<Settings />);

			await waitFor(() => {
				// Check for sidebar elements
				expect(screen.getByTestId("settings-sidebar")).toBeDefined();
				expect(screen.getByText("Back to App")).toBeDefined();
			});
		});

		it("should render sidebar with personal section", async () => {
			renderWithProviders(<Settings />);

			await waitFor(() => {
				expect(screen.getByText("Personal")).toBeDefined();
				expect(screen.getByText("Profile")).toBeDefined();
				expect(screen.getByText("Preferences")).toBeDefined();
			});
		});

		it("should render sidebar with account section", async () => {
			renderWithProviders(<Settings />);

			await waitFor(() => {
				expect(screen.getByText("Account")).toBeDefined();
				expect(screen.getByText("Users")).toBeDefined();
				expect(screen.getByText("Sources")).toBeDefined();
			});
		});
	});

	describe("Profile Page (default)", () => {
		it("should render profile page by default", async () => {
			renderWithProviders(<Settings />, "/settings");

			await waitFor(() => {
				expect(screen.getByTestId("profile-page")).toBeDefined();
			});
		});

		it("should render profile page title", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				expect(screen.getByTestId("profile-title")).toBeDefined();
			});
		});

		it("should render profile avatar with initials", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				const avatar = screen.getByTestId("profile-avatar");
				expect(avatar).toBeDefined();
				expect(avatar.textContent).toContain("TU"); // Test User initials
			});
		});

		it("should render name display with user name", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				const nameDisplay = screen.getByTestId("profile-name-display");
				expect(nameDisplay.textContent).toBe("Test User");
			});
		});

		it("should render email display", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				const emailDisplay = screen.getByTestId("profile-email-display");
				expect(emailDisplay.textContent).toBe("test@example.com");
			});
		});

		it("should render change password button", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				expect(screen.getByTestId("change-password-button")).toBeDefined();
			});
		});

		it("should open password dialog when change password button is clicked", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				const changePasswordButton = screen.getByTestId("change-password-button");
				fireEvent.click(changePasswordButton);
			});

			await waitFor(() => {
				expect(screen.getByTestId("change-password-dialog")).toBeDefined();
			});
		});

		it("should show loading state initially", () => {
			// Create a slow client that takes time to load
			const slowClient = {
				...mockClient,
				profile: () => ({
					getProfile: vi.fn().mockImplementation(
						() =>
							new Promise(() => {
								/* never resolves */
							}),
					),
					updateProfile: vi.fn(),
					hasPassword: vi.fn().mockResolvedValue({ hasPassword: true }),
					setPassword: vi.fn(),
					changePassword: vi.fn(),
					logoutAllSessions: vi.fn().mockResolvedValue({ success: true }),
				}),
			} as unknown as Client;

			render(
				<ClientProvider client={slowClient}>
					<OrgProvider>
						<PermissionProvider>
							<PreferencesProvider>
								<RouterProvider>
									<DevToolsProvider>
										<NavigationProvider pathname="/settings/profile">
											<ThemeProvider>
												<Settings />
											</ThemeProvider>
										</NavigationProvider>
									</DevToolsProvider>
								</RouterProvider>
							</PreferencesProvider>
						</PermissionProvider>
					</OrgProvider>
				</ClientProvider>,
			);

			expect(screen.getByTestId("profile-loading")).toBeDefined();
		});

		it("should show error state when profile load fails", async () => {
			const errorClient = {
				...mockClient,
				profile: () => ({
					getProfile: vi.fn().mockRejectedValue(new Error("Load failed")),
					updateProfile: vi.fn(),
					hasPassword: vi.fn().mockResolvedValue({ hasPassword: true }),
					setPassword: vi.fn(),
					changePassword: vi.fn(),
					logoutAllSessions: vi.fn().mockResolvedValue({ success: true }),
				}),
			} as unknown as Client;

			render(
				<ClientProvider client={errorClient}>
					<OrgProvider>
						<PermissionProvider>
							<PreferencesProvider>
								<RouterProvider>
									<DevToolsProvider>
										<NavigationProvider pathname="/settings/profile">
											<ThemeProvider>
												<Settings />
											</ThemeProvider>
										</NavigationProvider>
									</DevToolsProvider>
								</RouterProvider>
							</PreferencesProvider>
						</PermissionProvider>
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(screen.getByTestId("profile-error")).toBeDefined();
			});
		});

		it("should display profile image when available", async () => {
			const profileWithImage = { ...mockProfile, image: "https://example.com/avatar.jpg" };
			const imageClient = {
				...mockClient,
				profile: () => ({
					getProfile: vi.fn().mockResolvedValue(profileWithImage),
					updateProfile: vi.fn(),
					hasPassword: vi.fn().mockResolvedValue({ hasPassword: true }),
					setPassword: vi.fn(),
					changePassword: vi.fn(),
					logoutAllSessions: vi.fn().mockResolvedValue({ success: true }),
				}),
			} as unknown as Client;

			render(
				<ClientProvider client={imageClient}>
					<OrgProvider>
						<PermissionProvider>
							<PreferencesProvider>
								<RouterProvider>
									<DevToolsProvider>
										<NavigationProvider pathname="/settings/profile">
											<ThemeProvider>
												<Settings />
											</ThemeProvider>
										</NavigationProvider>
									</DevToolsProvider>
								</RouterProvider>
							</PreferencesProvider>
						</PermissionProvider>
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(screen.getByTestId("profile-image")).toBeDefined();
			});
		});

		it("should show password mismatch error", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				const changePasswordButton = screen.getByTestId("change-password-button");
				fireEvent.click(changePasswordButton);
			});

			await waitFor(() => {
				const currentPwInput = screen.getByTestId("current-password-input");
				const newPwInput = screen.getByTestId("new-password-input");
				const confirmPwInput = screen.getByTestId("confirm-password-input");

				fireEvent.change(currentPwInput, { target: { value: "OldPass1!" } });
				fireEvent.change(newPwInput, { target: { value: "NewPass1!" } });
				fireEvent.change(confirmPwInput, { target: { value: "DifferentPass1!" } });

				const updateButton = screen.getByTestId("update-password-button");
				fireEvent.click(updateButton);
			});

			await waitFor(() => {
				expect(screen.getByTestId("password-error")).toBeDefined();
			});
		});

		it("should show password requirements error for weak password", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				const changePasswordButton = screen.getByTestId("change-password-button");
				fireEvent.click(changePasswordButton);
			});

			await waitFor(() => {
				const currentPwInput = screen.getByTestId("current-password-input");
				const newPwInput = screen.getByTestId("new-password-input");
				const confirmPwInput = screen.getByTestId("confirm-password-input");

				fireEvent.change(currentPwInput, { target: { value: "OldPass1!" } });
				fireEvent.change(newPwInput, { target: { value: "weak" } }); // Too weak
				fireEvent.change(confirmPwInput, { target: { value: "weak" } });

				const updateButton = screen.getByTestId("update-password-button");
				fireEvent.click(updateButton);
			});

			await waitFor(() => {
				expect(screen.getByTestId("password-error")).toBeDefined();
			});
		});

		it("should handle password change API error", async () => {
			const passwordClient = {
				...mockClient,
				profile: () => ({
					getProfile: vi.fn().mockResolvedValue(mockProfile),
					updateProfile: vi.fn(),
					hasPassword: vi.fn().mockResolvedValue({ hasPassword: true }),
					setPassword: vi.fn().mockResolvedValue(undefined),
					changePassword: vi.fn().mockRejectedValue(new Error("Wrong current password")),
					logoutAllSessions: vi.fn().mockResolvedValue({ success: true }),
				}),
			} as unknown as Client;

			render(
				<ClientProvider client={passwordClient}>
					<OrgProvider>
						<PermissionProvider>
							<PreferencesProvider>
								<RouterProvider>
									<DevToolsProvider>
										<NavigationProvider pathname="/settings/profile">
											<ThemeProvider>
												<Settings />
											</ThemeProvider>
										</NavigationProvider>
									</DevToolsProvider>
								</RouterProvider>
							</PreferencesProvider>
						</PermissionProvider>
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				const changePasswordButton = screen.getByTestId("change-password-button");
				fireEvent.click(changePasswordButton);
			});

			await waitFor(() => {
				const currentPwInput = screen.getByTestId("current-password-input");
				const newPwInput = screen.getByTestId("new-password-input");
				const confirmPwInput = screen.getByTestId("confirm-password-input");

				fireEvent.change(currentPwInput, { target: { value: "OldPass1!" } });
				fireEvent.change(newPwInput, { target: { value: "NewPass1!" } });
				fireEvent.change(confirmPwInput, { target: { value: "NewPass1!" } });

				const updateButton = screen.getByTestId("update-password-button");
				fireEvent.click(updateButton);
			});

			await waitFor(() => {
				expect(screen.getByTestId("password-error")).toBeDefined();
			});
		});

		it("should successfully change password and close dialog", async () => {
			renderWithProviders(<Settings />, "/settings/profile");

			await waitFor(() => {
				const changePasswordButton = screen.getByTestId("change-password-button");
				fireEvent.click(changePasswordButton);
			});

			await waitFor(() => {
				expect(screen.getByTestId("change-password-dialog")).toBeDefined();
			});

			const currentPwInput = screen.getByTestId("current-password-input");
			const newPwInput = screen.getByTestId("new-password-input");
			const confirmPwInput = screen.getByTestId("confirm-password-input");

			fireEvent.change(currentPwInput, { target: { value: "OldPass1!" } });
			fireEvent.change(newPwInput, { target: { value: "NewPass1!" } });
			fireEvent.change(confirmPwInput, { target: { value: "NewPass1!" } });

			const updateButton = screen.getByTestId("update-password-button");
			fireEvent.click(updateButton);

			// Dialog should close after successful password change
			await waitFor(
				() => {
					expect(screen.queryByTestId("change-password-dialog")).toBeNull();
				},
				{ timeout: 3000 },
			);
		});
	});

	describe("Preferences Page", () => {
		it("should render preferences page when on preferences route", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByTestId("preferences-page")).toBeDefined();
			});
		});

		it("should render preferences heading", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				// Use getAllByText since "Preferences" appears in both sidebar and page heading
				const elements = screen.getAllByText("Preferences");
				expect(elements.length).toBeGreaterThanOrEqual(2);
			});
		});

		it("should render appearance section with language option", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				// Appearance is a section heading
				expect(screen.getByText("Appearance")).toBeDefined();
				// Language appears as both a row label and in the LanguageSwitcher, so use getAllByText
				expect(screen.getAllByText("Language").length).toBeGreaterThan(0);
			});
		});

		it("should render interface section", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Interface")).toBeDefined();
				expect(screen.getByText("Sidebar default state")).toBeDefined();
				expect(screen.getByText("Chat panel width")).toBeDefined();
			});
		});

		it("should render articles section", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Articles")).toBeDefined();
				expect(screen.getByText("Default draft filter")).toBeDefined();
				expect(screen.getByText("Show AI tool details")).toBeDefined();
			});
		});

		it("should toggle theme when theme button is clicked", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Light")).toBeDefined();
			});

			// Find and click the theme button
			const themeButton = screen.getByTestId("theme-toggle");
			expect(themeButton).toBeDefined();
			fireEvent.click(themeButton);

			// After clicking, theme should toggle (we can verify the button still exists)
			await waitFor(() => {
				// Button should still be present after toggle
				expect(screen.getByTestId("theme-toggle")).toBeDefined();
			});
		});

		it("should toggle sidebar state when sidebar button is clicked", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Expanded")).toBeDefined();
			});

			// Find and click the sidebar button
			const sidebarButton = screen.getByTestId("sidebar-toggle");
			expect(sidebarButton).toBeDefined();
			fireEvent.click(sidebarButton);

			// After clicking, should show Collapsed
			await waitFor(() => {
				expect(screen.getByText("Collapsed")).toBeDefined();
			});
		});

		it("should toggle show tool details when button is clicked", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Off")).toBeDefined();
			});

			// Find and click the tool details button
			const toolDetailsButton = screen.getByTestId("tool-details-toggle");
			expect(toolDetailsButton).toBeDefined();
			fireEvent.click(toolDetailsButton);

			// After clicking, should show On
			await waitFor(() => {
				expect(screen.getByText("On")).toBeDefined();
			});
		});

		it("should update chat width on valid input blur", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Chat panel width")).toBeDefined();
			});

			// Find the chat width input (type=number)
			const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
			expect(chatWidthInput).toBeDefined();

			// Change to a valid value and blur
			fireEvent.change(chatWidthInput, { target: { value: "500" } });
			fireEvent.blur(chatWidthInput);

			// Verify the value is set
			await waitFor(() => {
				expect(chatWidthInput.value).toBe("500");
			});
		});

		it("should handle invalid chat width input (too small)", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Chat panel width")).toBeDefined();
			});

			// Find the chat width input
			const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
			// Default value is 600
			expect(chatWidthInput.value).toBe("600");

			// Change to an invalid value (too small) and blur
			fireEvent.change(chatWidthInput, { target: { value: "100" } });
			fireEvent.blur(chatWidthInput);

			// The blur handler is called - verify component doesn't crash
			// and the input still exists
			await waitFor(() => {
				expect(screen.getByTestId("chat-width-input")).toBeDefined();
			});
		});

		it("should handle invalid chat width input (too large)", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Chat panel width")).toBeDefined();
			});

			// Find the chat width input
			const chatWidthInput = screen.getByTestId("chat-width-input");

			// Change to an invalid value (too large) and blur
			fireEvent.change(chatWidthInput, { target: { value: "1000" } });
			fireEvent.blur(chatWidthInput);

			// The blur handler is called - verify component doesn't crash
			await waitFor(() => {
				expect(screen.getByTestId("chat-width-input")).toBeDefined();
			});
		});

		it("should handle empty chat width input (NaN)", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Chat panel width")).toBeDefined();
			});

			// Find the chat width input
			const chatWidthInput = screen.getByTestId("chat-width-input");

			// Change to an empty value and blur
			fireEvent.change(chatWidthInput, { target: { value: "" } });
			fireEvent.blur(chatWidthInput);

			// The blur handler is called - verify component doesn't crash
			await waitFor(() => {
				expect(screen.getByTestId("chat-width-input")).toBeDefined();
			});
		});

		it("should change draft filter when select changes", async () => {
			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				expect(screen.getByText("Default draft filter")).toBeDefined();
			});

			// Find the draft filter select
			const draftFilterSelect = screen.getByTestId("draft-filter-select") as HTMLSelectElement;
			expect(draftFilterSelect).toBeDefined();

			// Change the value
			fireEvent.change(draftFilterSelect, { target: { value: "my-new-drafts" } });

			// Verify the value changed
			await waitFor(() => {
				expect(draftFilterSelect.value).toBe("my-new-drafts");
			});
		});

		it("should render dark mode button when in dark mode", async () => {
			// Set dark mode in localStorage before rendering
			localStorage.setItem("theme", "dark");

			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				// In dark mode, should show "Dark" text
				expect(screen.getByText("Dark")).toBeDefined();
			});
		});

		it("should toggle from dark mode to light mode when theme button is clicked", async () => {
			// Set dark mode in localStorage before rendering
			localStorage.setItem("theme", "dark");

			renderWithProviders(<Settings />, "/settings/preferences");

			await waitFor(() => {
				// In dark mode, should show "Dark" text
				expect(screen.getByText("Dark")).toBeDefined();
			});

			// Find and click the theme button to toggle to light mode
			const themeButton = screen.getByTestId("theme-toggle");
			fireEvent.click(themeButton);

			// After clicking, theme should toggle to light
			await waitFor(() => {
				expect(screen.getByText("Light")).toBeDefined();
			});
		});
	});
});
