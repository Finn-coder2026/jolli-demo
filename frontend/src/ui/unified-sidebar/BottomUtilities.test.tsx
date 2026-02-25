import { BottomUtilities } from "./BottomUtilities";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { UserInfo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		User: () => <div data-testid="user-icon" />,
		Settings: () => <div data-testid="settings-icon" />,
		LogOut: () => <div data-testid="logout-icon" />,
		Wrench: () => <div data-testid="wrench-icon" />,
		Info: () => <div data-testid="info-icon" />,
		ChevronsUpDown: () => <div data-testid="chevrons-up-down-icon" />,
		Monitor: () => <div data-testid="monitor-icon" />,
		Sun: () => <div data-testid="sun-icon" />,
		Moon: () => <div data-testid="moon-icon" />,
	};
});

// Helper to create intlayer-like values
function createMockIntlayerValue(str: string) {
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Mock helper
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper
	const val = new String(str) as any;
	val.value = str;
	return val;
}

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		myProfile: createMockIntlayerValue("My Profile"),
		settings: createMockIntlayerValue("Settings"),
		devTools: createMockIntlayerValue("Dev Tools"),
		signOut: createMockIntlayerValue("Log Out"),
		theme: createMockIntlayerValue("Theme"),
		systemTheme: createMockIntlayerValue("System theme"),
		lightMode: createMockIntlayerValue("Light mode"),
		darkMode: createMockIntlayerValue("Dark mode"),
		userContext: createMockIntlayerValue("User Context"),
		userContextDescription: createMockIntlayerValue("Current Agent Hub context state for debugging"),
		contextActive: createMockIntlayerValue("Active"),
		contextConversationId: createMockIntlayerValue("Conversation ID"),
		contextNone: createMockIntlayerValue("none"),
	}),
}));

// Mock NavigationContext
const mockNavigate = vi.fn();

vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
		activeTab: "dashboard",
		tabs: [],
	}),
}));

// Mock ThemeContext
const mockSetThemeMode = vi.fn();
let mockThemeMode: "system" | "light" | "dark" = "system";

vi.mock("../../contexts/ThemeContext", () => ({
	useTheme: () => ({
		themeMode: mockThemeMode,
		setThemeMode: mockSetThemeMode,
		isDarkMode: false,
	}),
}));

// Mock DevToolsContext - use vi.hoisted to ensure mock is available before vi.mock hoisting
const { mockUseDevTools } = vi.hoisted(() => ({
	mockUseDevTools: vi.fn(() => ({ devToolsEnabled: false })),
}));
vi.mock("../../contexts/DevToolsContext", () => ({
	useDevTools: mockUseDevTools,
}));

// Mock CurrentUserContext
const mockSetAgentHubConversation = vi.fn();
const mockMarkAgentNavigating = vi.fn();
const mockDeactivateAgentHub = vi.fn();
const mockClearContext = vi.fn();

let mockUserContext = {
	agentHubContext: undefined as { conversationId?: number; active: boolean } | undefined,
};

vi.mock("../../contexts/CurrentUserContext", () => ({
	useCurrentUser: () => ({
		userContext: mockUserContext,
		setAgentHubConversation: mockSetAgentHubConversation,
		markAgentNavigating: mockMarkAgentNavigating,
		deactivateAgentHub: mockDeactivateAgentHub,
		clearContext: mockClearContext,
	}),
}));

// Mock Dialog components for testing
vi.mock("../../components/ui/Dialog", () => ({
	Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
	DialogContent: ({ children, ...props }: { children: React.ReactNode; "data-testid"?: string }) => (
		<div data-testid={props["data-testid"]}>{children}</div>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

describe("BottomUtilities", () => {
	const mockUserInfo: UserInfo = {
		userId: 1,
		name: "John Doe",
		email: "john@example.com",
		picture: undefined,
	};

	const mockOnLogout = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockThemeMode = "system";
		// Default: devtools disabled
		mockUseDevTools.mockReturnValue({ devToolsEnabled: false });
		mockUserContext = { agentHubContext: undefined };
	});

	describe("Collapsed Mode", () => {
		it("should render user menu trigger in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			expect(screen.getByTestId("user-menu-trigger-collapsed")).toBeDefined();
		});

		it("should show user initials when no picture in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const initials = screen.getByTestId("user-initials-collapsed");
			expect(initials).toBeDefined();
			expect(initials.textContent).toBe("JD");
		});

		it("should show user avatar when picture provided in collapsed mode", () => {
			const userWithPicture = { ...mockUserInfo, picture: "https://example.com/avatar.jpg" };
			render(<BottomUtilities collapsed={true} userInfo={userWithPicture} onLogout={mockOnLogout} />);

			const avatar = screen.getByTestId("user-avatar-collapsed");
			expect(avatar).toBeDefined();
			expect(avatar.getAttribute("src")).toBe("https://example.com/avatar.jpg");
			expect(avatar.getAttribute("alt")).toBe("John Doe");
		});

		it("should show user menu dropdown when user button clicked in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			expect(screen.getByText("My Profile")).toBeDefined();
			expect(screen.getByText("Log Out")).toBeDefined();
		});

		it("should call onLogout when logout clicked in user menu in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			// Open user menu
			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			// Click logout
			const logoutButton = screen.getByText("Log Out");
			fireEvent.click(logoutButton);

			expect(mockOnLogout).toHaveBeenCalledTimes(1);
		});

		it("should navigate to settings when My Profile clicked in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const profileButton = screen.getByText("My Profile");
			fireEvent.click(profileButton);

			expect(mockNavigate).toHaveBeenCalledWith("/settings/profile");
		});
	});

	describe("Expanded Mode", () => {
		it("should render user menu trigger in expanded mode", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			expect(screen.getByTestId("user-menu-trigger-expanded")).toBeDefined();
		});

		it("should show user initials when no picture in expanded mode", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const initials = screen.getByTestId("user-initials-expanded");
			expect(initials).toBeDefined();
			expect(initials.textContent).toBe("JD");
		});

		it("should show user avatar when picture provided in expanded mode", () => {
			const userWithPicture = { ...mockUserInfo, picture: "https://example.com/avatar.jpg" };
			render(<BottomUtilities collapsed={false} userInfo={userWithPicture} onLogout={mockOnLogout} />);

			const avatar = screen.getByTestId("user-avatar-expanded");
			expect(avatar).toBeDefined();
			expect(avatar.getAttribute("src")).toBe("https://example.com/avatar.jpg");
			expect(avatar.getAttribute("alt")).toBe("John Doe");
		});

		it("should show user menu dropdown when user button clicked in expanded mode", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			expect(screen.getByText("My Profile")).toBeDefined();
			expect(screen.getByText("Log Out")).toBeDefined();
		});

		it("should call onLogout when logout clicked in user menu in expanded mode", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			// Open user menu
			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			// Click logout
			const logoutButton = screen.getByText("Log Out");
			fireEvent.click(logoutButton);

			expect(mockOnLogout).toHaveBeenCalledTimes(1);
		});

		it("should show user name in expanded mode trigger", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const trigger = screen.getByTestId("user-menu-trigger-expanded");
			expect(trigger.textContent).toContain("John Doe");
		});

		it("should show chevrons up-down icon in expanded mode user menu", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			expect(screen.getByTestId("chevrons-up-down-icon")).toBeDefined();
		});
	});

	describe("User Initials Logic", () => {
		it("should use first and last name initials for full name", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const initials = screen.getByTestId("user-initials-expanded");
			expect(initials.textContent).toBe("JD");
		});

		it("should use first two characters for single name", () => {
			const singleNameUser = { ...mockUserInfo, name: "John" };
			render(<BottomUtilities collapsed={false} userInfo={singleNameUser} onLogout={mockOnLogout} />);

			const initials = screen.getByTestId("user-initials-expanded");
			expect(initials.textContent).toBe("JO");
		});

		it("should use email initials when name is empty", () => {
			const noNameUser = { ...mockUserInfo, name: "" };
			render(<BottomUtilities collapsed={false} userInfo={noNameUser} onLogout={mockOnLogout} />);

			const initials = screen.getByTestId("user-initials-expanded");
			expect(initials.textContent).toBe("JO"); // From "john@example.com"
		});

		it("should show question mark when userInfo is undefined", () => {
			render(<BottomUtilities collapsed={false} userInfo={undefined} onLogout={mockOnLogout} />);

			const initials = screen.getByTestId("user-initials-expanded");
			expect(initials.textContent).toBe("?");

			const trigger = screen.getByTestId("user-menu-trigger-expanded");
			expect(trigger.textContent).toContain("User");
		});

		it("should use email as alt text when name is empty and picture is provided in collapsed mode", () => {
			const userWithPictureNoName = { ...mockUserInfo, name: "", picture: "https://example.com/avatar.jpg" };
			render(<BottomUtilities collapsed={true} userInfo={userWithPictureNoName} onLogout={mockOnLogout} />);

			const avatar = screen.getByTestId("user-avatar-collapsed");
			expect(avatar.getAttribute("alt")).toBe("john@example.com");
		});

		it("should use email as alt text when name is empty and picture is provided in expanded mode", () => {
			const userWithPictureNoName = { ...mockUserInfo, name: "", picture: "https://example.com/avatar.jpg" };
			render(<BottomUtilities collapsed={false} userInfo={userWithPictureNoName} onLogout={mockOnLogout} />);

			const avatar = screen.getByTestId("user-avatar-expanded");
			expect(avatar.getAttribute("alt")).toBe("john@example.com");
		});
	});

	describe("User Menu Content", () => {
		it("should navigate to profile when My Profile clicked", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const profileButton = screen.getByText("My Profile");
			fireEvent.click(profileButton);

			expect(mockNavigate).toHaveBeenCalledWith("/settings/profile");
		});
	});

	describe("DevTools Menu Item", () => {
		it("should hide devtools menu item when disabled in collapsed mode", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: false });
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			// Open user menu
			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			expect(screen.queryByTestId("devtools-menu-item-collapsed")).toBeNull();
		});

		it("should show devtools menu item in collapsed mode when enabled", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);
			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);
			expect(screen.getByTestId("devtools-menu-item-collapsed")).toBeDefined();
		});

		it("should navigate to devtools when devtools menu item clicked in collapsed mode", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);
			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);
			const devToolsItem = screen.getByTestId("devtools-menu-item-collapsed");
			fireEvent.click(devToolsItem);
			expect(mockNavigate).toHaveBeenCalledWith("/devtools");
		});

		it("should show devtools menu item in expanded mode when enabled", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);
			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);
			expect(screen.getByTestId("devtools-menu-item")).toBeDefined();
			expect(screen.getByText("Dev Tools")).toBeDefined();
		});

		it("should navigate to devtools when devtools menu item clicked in expanded mode", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);
			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);
			const devToolsItem = screen.getByTestId("devtools-menu-item");
			fireEvent.click(devToolsItem);
			expect(mockNavigate).toHaveBeenCalledWith("/devtools");
		});
	});

	describe("User Context Menu Item", () => {
		it("should hide user context menu item when devtools disabled in collapsed mode", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: false });
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			expect(screen.queryByTestId("user-context-menu-item-collapsed")).toBeNull();
		});

		it("should show user context menu item in collapsed mode when devtools enabled", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			expect(screen.getByTestId("user-context-menu-item-collapsed")).toBeDefined();
			expect(screen.getByText("User Context")).toBeDefined();
		});

		it("should hide user context menu item when devtools disabled in expanded mode", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: false });
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			expect(screen.queryByTestId("user-context-menu-item")).toBeNull();
		});

		it("should show user context menu item in expanded mode when devtools enabled", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			expect(screen.getByTestId("user-context-menu-item")).toBeDefined();
			expect(screen.getByText("User Context")).toBeDefined();
		});

		it("should open user context dialog when clicked in expanded mode", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const contextItem = screen.getByTestId("user-context-menu-item");
			fireEvent.click(contextItem);

			expect(screen.getByTestId("user-context-dialog")).toBeDefined();
		});

		it("should open user context dialog when clicked in collapsed mode", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const contextItem = screen.getByTestId("user-context-menu-item-collapsed");
			fireEvent.click(contextItem);

			expect(screen.getByTestId("user-context-dialog")).toBeDefined();
		});

		it("should show active context with conversation ID in dialog", () => {
			mockUseDevTools.mockReturnValue({ devToolsEnabled: true });
			mockUserContext = { agentHubContext: { conversationId: 42, active: true } };
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const contextItem = screen.getByTestId("user-context-menu-item");
			fireEvent.click(contextItem);

			expect(screen.getByTestId("context-active").textContent).toContain("true");
			expect(screen.getByTestId("context-conversation-id").textContent).toContain("42");
		});
	});

	describe("Theme Selector", () => {
		it("should show theme selector in user menu in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			expect(screen.getByTestId("theme-selector")).toBeDefined();
			expect(screen.getByText("Theme")).toBeDefined();
			expect(screen.getByTestId("theme-system-button")).toBeDefined();
			expect(screen.getByTestId("theme-light-button")).toBeDefined();
			expect(screen.getByTestId("theme-dark-button")).toBeDefined();
		});

		it("should show theme selector in user menu in expanded mode", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			expect(screen.getByTestId("theme-selector")).toBeDefined();
			expect(screen.getByText("Theme")).toBeDefined();
			expect(screen.getByTestId("theme-system-button")).toBeDefined();
			expect(screen.getByTestId("theme-light-button")).toBeDefined();
			expect(screen.getByTestId("theme-dark-button")).toBeDefined();
		});

		it("should set theme to system when system button clicked in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			fireEvent.click(systemButton);

			expect(mockSetThemeMode).toHaveBeenCalledWith("system");
		});

		it("should set theme to light when light button clicked in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const lightButton = screen.getByTestId("theme-light-button");
			fireEvent.click(lightButton);

			expect(mockSetThemeMode).toHaveBeenCalledWith("light");
		});

		it("should set theme to dark when dark button clicked in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const darkButton = screen.getByTestId("theme-dark-button");
			fireEvent.click(darkButton);

			expect(mockSetThemeMode).toHaveBeenCalledWith("dark");
		});

		it("should set theme to system when system button clicked", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			fireEvent.click(systemButton);

			expect(mockSetThemeMode).toHaveBeenCalledWith("system");
		});

		it("should set theme to light when light button clicked", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const lightButton = screen.getByTestId("theme-light-button");
			fireEvent.click(lightButton);

			expect(mockSetThemeMode).toHaveBeenCalledWith("light");
		});

		it("should set theme to dark when dark button clicked", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const darkButton = screen.getByTestId("theme-dark-button");
			fireEvent.click(darkButton);

			expect(mockSetThemeMode).toHaveBeenCalledWith("dark");
		});

		it("should highlight system theme button when theme is system in collapsed mode", () => {
			mockThemeMode = "system";
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			const lightButton = screen.getByTestId("theme-light-button");
			const darkButton = screen.getByTestId("theme-dark-button");

			// Check for the active styling - should end with "bg-accent"
			expect(systemButton.className).toMatch(/bg-accent$/);
			expect(lightButton.className).toMatch(/transition-colors $/);
			expect(darkButton.className).toMatch(/transition-colors $/);
		});

		it("should highlight light theme button when theme is light in collapsed mode", () => {
			mockThemeMode = "light";
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			const lightButton = screen.getByTestId("theme-light-button");
			const darkButton = screen.getByTestId("theme-dark-button");

			// Check for the active styling - should end with "bg-accent"
			expect(systemButton.className).toMatch(/transition-colors $/);
			expect(lightButton.className).toMatch(/bg-accent$/);
			expect(darkButton.className).toMatch(/transition-colors $/);
		});

		it("should highlight dark theme button when theme is dark in collapsed mode", () => {
			mockThemeMode = "dark";
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			const lightButton = screen.getByTestId("theme-light-button");
			const darkButton = screen.getByTestId("theme-dark-button");

			// Check for the active styling - should end with "bg-accent"
			expect(systemButton.className).toMatch(/transition-colors $/);
			expect(lightButton.className).toMatch(/transition-colors $/);
			expect(darkButton.className).toMatch(/bg-accent$/);
		});

		it("should highlight system theme button when theme is system in expanded mode", () => {
			mockThemeMode = "system";
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			const lightButton = screen.getByTestId("theme-light-button");
			const darkButton = screen.getByTestId("theme-dark-button");

			// Check for the active styling - should end with "bg-accent"
			expect(systemButton.className).toMatch(/bg-accent$/);
			expect(lightButton.className).toMatch(/transition-colors $/);
			expect(darkButton.className).toMatch(/transition-colors $/);
		});

		it("should highlight light theme button when theme is light in expanded mode", () => {
			mockThemeMode = "light";
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			const lightButton = screen.getByTestId("theme-light-button");
			const darkButton = screen.getByTestId("theme-dark-button");

			// Check for the active styling - should end with "bg-accent"
			expect(systemButton.className).toMatch(/transition-colors $/);
			expect(lightButton.className).toMatch(/bg-accent$/);
			expect(darkButton.className).toMatch(/transition-colors $/);
		});

		it("should highlight dark theme button when theme is dark in expanded mode", () => {
			mockThemeMode = "dark";
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			const lightButton = screen.getByTestId("theme-light-button");
			const darkButton = screen.getByTestId("theme-dark-button");

			// Check for the active styling - should end with "bg-accent"
			expect(systemButton.className).toMatch(/transition-colors $/);
			expect(lightButton.className).toMatch(/transition-colors $/);
			expect(darkButton.className).toMatch(/bg-accent$/);
		});

		it("should show proper tooltip text on theme buttons in collapsed mode", () => {
			render(<BottomUtilities collapsed={true} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-collapsed");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			const lightButton = screen.getByTestId("theme-light-button");
			const darkButton = screen.getByTestId("theme-dark-button");

			// Verify tooltips show proper text (not [object Object])
			expect(systemButton.getAttribute("title")).toBe("System theme");
			expect(lightButton.getAttribute("title")).toBe("Light mode");
			expect(darkButton.getAttribute("title")).toBe("Dark mode");
		});

		it("should show proper tooltip text on theme buttons in expanded mode", () => {
			render(<BottomUtilities collapsed={false} userInfo={mockUserInfo} onLogout={mockOnLogout} />);

			const userButton = screen.getByTestId("user-menu-trigger-expanded");
			fireEvent.click(userButton);

			const systemButton = screen.getByTestId("theme-system-button");
			const lightButton = screen.getByTestId("theme-light-button");
			const darkButton = screen.getByTestId("theme-dark-button");

			// Verify tooltips show proper text (not [object Object])
			expect(systemButton.getAttribute("title")).toBe("System theme");
			expect(lightButton.getAttribute("title")).toBe("Light mode");
			expect(darkButton.getAttribute("title")).toBe("Dark mode");
		});
	});
});
