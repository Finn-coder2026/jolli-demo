/**
 * Tests for SettingsSidebar component.
 * Verifies navigation rendering and permission-based item filtering.
 */

import { SettingsSidebar } from "./SettingsSidebar";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Track current mock permissions
let mockPermissions: Array<string> = [];

// Mock usePermissions to control permission checks in tests
vi.mock("../../contexts/PermissionContext", () => ({
	usePermissions: () => ({
		permissions: mockPermissions,
		role: null,
		isLoading: false,
		error: undefined,
		hasPermission: (permission: string) => mockPermissions.includes(permission),
		hasAnyPermission: (...perms: Array<string>) => perms.some(p => mockPermissions.includes(p)),
		hasAllPermissions: (...perms: Array<string>) => perms.every(p => mockPermissions.includes(p)),
		refresh: vi.fn(),
	}),
	PermissionProvider: ({ children }: { children: ReactNode }) => children,
}));

// Mock NavigationContext
const mockNavigate = vi.fn();
vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
		pathname: "/settings/profile",
	}),
	NavigationProvider: ({ children }: { children: ReactNode }) => children,
}));

// Mock intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		backToApp: { value: "Back to App" },
		sectionPersonal: { value: "Personal" },
		sectionAccount: { value: "Account" },
		navProfile: { value: "Profile" },
		navPreferences: { value: "Preferences" },
		navUsers: { value: "Users" },
		navRoles: { value: "Roles" },
		navSources: { value: "Sources" },
	}),
}));

describe("SettingsSidebar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default to having all permissions
		mockPermissions = ["users.view", "roles.view", "integrations.view"];
	});

	describe("rendering", () => {
		it("renders the sidebar", () => {
			render(<SettingsSidebar activePage="profile" />);
			expect(screen.getByTestId("settings-sidebar")).toBeDefined();
		});

		it("renders back button", () => {
			render(<SettingsSidebar activePage="profile" />);
			expect(screen.getByTestId("settings-back-button")).toBeDefined();
		});

		it("renders Personal section with profile and preferences", () => {
			render(<SettingsSidebar activePage="profile" />);
			expect(screen.getByTestId("settings-nav-profile")).toBeDefined();
			expect(screen.getByTestId("settings-nav-preferences")).toBeDefined();
		});

		it("highlights the active page", () => {
			render(<SettingsSidebar activePage="preferences" />);

			const profileButton = screen.getByTestId("settings-nav-profile");
			const preferencesButton = screen.getByTestId("settings-nav-preferences");

			// Active page should have sidebar-accent styling
			expect(preferencesButton.className).toContain("bg-sidebar-accent");
			expect(preferencesButton.className).toContain("text-sidebar-accent-foreground");
			// Inactive page has sidebar foreground styling
			expect(profileButton.className).toContain("text-sidebar-foreground");
		});
	});

	describe("navigation", () => {
		it("navigates to dashboard when back button clicked", () => {
			render(<SettingsSidebar activePage="profile" />);

			fireEvent.click(screen.getByTestId("settings-back-button"));

			expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
		});

		it("navigates when clicking profile nav item", () => {
			render(<SettingsSidebar activePage="preferences" />);

			fireEvent.click(screen.getByTestId("settings-nav-profile"));

			expect(mockNavigate).toHaveBeenCalledWith("/settings/profile");
		});

		it("navigates when clicking preferences nav item", () => {
			render(<SettingsSidebar activePage="profile" />);

			fireEvent.click(screen.getByTestId("settings-nav-preferences"));

			expect(mockNavigate).toHaveBeenCalledWith("/settings/preferences");
		});

		it("navigates to external users page", () => {
			render(<SettingsSidebar activePage="profile" />);

			fireEvent.click(screen.getByTestId("settings-nav-users"));

			expect(mockNavigate).toHaveBeenCalledWith("/users");
		});

		it("navigates to external roles page", () => {
			render(<SettingsSidebar activePage="profile" />);

			fireEvent.click(screen.getByTestId("settings-nav-roles"));

			expect(mockNavigate).toHaveBeenCalledWith("/roles");
		});

		it("navigates to external sources page", () => {
			render(<SettingsSidebar activePage="profile" />);

			fireEvent.click(screen.getByTestId("settings-nav-sources"));

			expect(mockNavigate).toHaveBeenCalledWith("/integrations");
		});
	});

	describe("permission-based filtering", () => {
		it("shows all account items when user has all permissions", () => {
			mockPermissions = ["users.view", "roles.view", "integrations.view"];
			render(<SettingsSidebar activePage="profile" />);

			expect(screen.getByTestId("settings-nav-users")).toBeDefined();
			expect(screen.getByTestId("settings-nav-roles")).toBeDefined();
			expect(screen.getByTestId("settings-nav-sources")).toBeDefined();
		});

		it("hides Users nav when user lacks users.view permission", () => {
			mockPermissions = ["roles.view", "integrations.view"]; // Has roles and sources but not users
			render(<SettingsSidebar activePage="profile" />);

			expect(screen.queryByTestId("settings-nav-users")).toBeNull();
			expect(screen.getByTestId("settings-nav-roles")).toBeDefined();
			expect(screen.getByTestId("settings-nav-sources")).toBeDefined();
		});

		it("hides Roles nav when user lacks roles.view permission", () => {
			mockPermissions = ["users.view", "integrations.view"]; // Has users and sources but not roles
			render(<SettingsSidebar activePage="profile" />);

			expect(screen.getByTestId("settings-nav-users")).toBeDefined();
			expect(screen.queryByTestId("settings-nav-roles")).toBeNull();
			expect(screen.getByTestId("settings-nav-sources")).toBeDefined();
		});

		it("hides Sources nav when user lacks integrations.view permission", () => {
			mockPermissions = ["users.view", "roles.view"]; // Has users and roles but not integrations
			render(<SettingsSidebar activePage="profile" />);

			expect(screen.getByTestId("settings-nav-users")).toBeDefined();
			expect(screen.getByTestId("settings-nav-roles")).toBeDefined();
			expect(screen.queryByTestId("settings-nav-sources")).toBeNull();
		});

		it("always shows Personal section items (no permission required)", () => {
			mockPermissions = []; // No permissions
			render(<SettingsSidebar activePage="profile" />);

			expect(screen.getByTestId("settings-nav-profile")).toBeDefined();
			expect(screen.getByTestId("settings-nav-preferences")).toBeDefined();
		});

		it("hides entire Account section when user has no account permissions", () => {
			mockPermissions = []; // No permissions - Account section should be hidden
			render(<SettingsSidebar activePage="profile" />);

			expect(screen.queryByTestId("settings-nav-users")).toBeNull();
			expect(screen.queryByTestId("settings-nav-roles")).toBeNull();
			expect(screen.queryByTestId("settings-nav-sources")).toBeNull();
			// Account section title should not be visible
			expect(screen.queryByText("Account")).toBeNull();
		});
	});
});
