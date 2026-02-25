/**
 * Tests for PreferencesPage.
 */

import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { PreferencesPage } from "./PreferencesPage";
import { fireEvent, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Moon: () => <div data-testid="moon-icon" />,
		Sun: () => <div data-testid="sun-icon" />,
	};
});

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: (key: string) => {
		if (key === "preferences-page") {
			return {
				title: createMockIntlayerValue("Preferences"),
				subtitle: createMockIntlayerValue("Manage your application preferences"),
			};
		}
		// settings content
		return {
			appearanceTitle: createMockIntlayerValue("Appearance"),
			appearanceDescription: createMockIntlayerValue("Customize the look and feel"),
			themeLabel: createMockIntlayerValue("Theme"),
			themeDescription: createMockIntlayerValue("Choose between light and dark mode"),
			themeLight: createMockIntlayerValue("Light"),
			themeDark: createMockIntlayerValue("Dark"),
			languageTitle: createMockIntlayerValue("Language"),
			languageDescription: createMockIntlayerValue("Choose your language"),
			interfaceTitle: createMockIntlayerValue("Interface"),
			interfaceDescription: createMockIntlayerValue("Adjust interface layout"),
			sidebarLabel: createMockIntlayerValue("Sidebar default state"),
			sidebarDescription: createMockIntlayerValue("Choose sidebar default"),
			sidebarExpanded: createMockIntlayerValue("Expanded"),
			sidebarCollapsed: createMockIntlayerValue("Collapsed"),
			chatWidthLabel: createMockIntlayerValue("Chat panel width"),
			chatWidthDescription: createMockIntlayerValue("Set default width"),
			articlesTitle: createMockIntlayerValue("Articles"),
			articlesDescription: createMockIntlayerValue("Configure article preferences"),
			draftFilterLabel: createMockIntlayerValue("Default draft filter"),
			draftFilterDescription: createMockIntlayerValue("Choose which drafts to show"),
			draftFilterAll: createMockIntlayerValue("All"),
			draftFilterMyNew: createMockIntlayerValue("My New Drafts"),
			draftFilterShared: createMockIntlayerValue("Shared With Me"),
			draftFilterSuggested: createMockIntlayerValue("Suggested Updates"),
			showToolDetailsLabel: createMockIntlayerValue("Show AI tool details"),
			showToolDetailsDescription: createMockIntlayerValue("Display AI tool usage"),
		};
	},
}));

// Mock ThemeContext
const mockSetThemeMode = vi.fn();
let mockIsDarkMode = false;

vi.mock("../../contexts/ThemeContext", () => ({
	useTheme: () => ({
		isDarkMode: mockIsDarkMode,
		setThemeMode: mockSetThemeMode,
	}),
}));

// Mock LanguageSwitcher component
vi.mock("../../components/ui/LanguageSwitcher", () => ({
	LanguageSwitcher: () => <div data-testid="language-switcher">Language Switcher</div>,
}));

// Mock preferences
const mockPreferences: Record<string, { value: unknown; setter: ReturnType<typeof vi.fn> }> = {};

function initMockPreferences(): void {
	mockPreferences.sidebarCollapsed = { value: false, setter: vi.fn() };
	mockPreferences.chatWidth = { value: 400, setter: vi.fn() };
	mockPreferences.articlesDraftFilter = { value: "all", setter: vi.fn() };
	mockPreferences.articleDraftShowToolDetails = { value: false, setter: vi.fn() };
}

vi.mock("../../hooks/usePreference", () => ({
	usePreference: (key: string) => {
		const pref = mockPreferences[key];
		if (pref) {
			return [pref.value, pref.setter];
		}
		return [null, vi.fn()];
	},
}));

vi.mock("../../contexts/PreferencesContext", () => ({
	PREFERENCES: {
		sidebarCollapsed: "sidebarCollapsed",
		chatWidth: "chatWidth",
		articlesDraftFilter: "articlesDraftFilter",
		articleDraftShowToolDetails: "articleDraftShowToolDetails",
	},
}));

describe("PreferencesPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsDarkMode = false;
		initMockPreferences();
	});

	it("should render preferences page with title and subtitle", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		expect(screen.getByTestId("preferences-page")).toBeDefined();
		expect(screen.getByText("Preferences")).toBeDefined();
		expect(screen.getByText("Manage your application preferences")).toBeDefined();
	});

	it("should render appearance section with theme toggle", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		expect(screen.getByText("Appearance")).toBeDefined();
		expect(screen.getByTestId("theme-toggle")).toBeDefined();
	});

	it("should toggle theme to dark when clicked in light mode", () => {
		mockIsDarkMode = false;
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const themeToggle = screen.getByTestId("theme-toggle");
		expect(themeToggle.textContent).toContain("Light");

		fireEvent.click(themeToggle);
		expect(mockSetThemeMode).toHaveBeenCalledWith("dark");
	});

	it("should toggle theme to light when clicked in dark mode", () => {
		mockIsDarkMode = true;
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const themeToggle = screen.getByTestId("theme-toggle");
		expect(themeToggle.textContent).toContain("Dark");

		fireEvent.click(themeToggle);
		expect(mockSetThemeMode).toHaveBeenCalledWith("light");
	});

	it("should render language switcher", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		expect(screen.getByTestId("language-switcher")).toBeDefined();
	});

	it("should render interface section with sidebar toggle", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		expect(screen.getByText("Interface")).toBeDefined();
		expect(screen.getByTestId("sidebar-toggle")).toBeDefined();
	});

	it("should toggle sidebar state when button clicked", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const sidebarToggle = screen.getByTestId("sidebar-toggle");
		expect(sidebarToggle.textContent).toBe("Expanded");

		fireEvent.click(sidebarToggle);
		expect(mockPreferences.sidebarCollapsed.setter).toHaveBeenCalledWith(true);
	});

	it("should show collapsed state when sidebar is collapsed", () => {
		mockPreferences.sidebarCollapsed.value = true;
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const sidebarToggle = screen.getByTestId("sidebar-toggle");
		expect(sidebarToggle.textContent).toBe("Collapsed");
	});

	it("should display chat width input with current value", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
		expect(chatWidthInput.value).toBe("400");
	});

	it("should update chat width input on change", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
		fireEvent.input(chatWidthInput, { target: { value: "500" } });

		expect(chatWidthInput.value).toBe("500");
	});

	it("should handle chat width blur event", () => {
		// Note: The blur handler is wrapped in v8 ignore, so we just verify
		// the component can handle blur events without errors
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
		fireEvent.input(chatWidthInput, { target: { value: "500" } });
		fireEvent.blur(chatWidthInput);

		// Component should still be rendered after blur
		expect(screen.getByTestId("preferences-page")).toBeDefined();
	});

	it("should render articles section with draft filter select", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		expect(screen.getByText("Articles")).toBeDefined();
		expect(screen.getByTestId("draft-filter-select")).toBeDefined();
	});

	it("should display draft filter select with current value", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const draftFilterSelect = screen.getByTestId("draft-filter-select") as HTMLSelectElement;
		expect(draftFilterSelect.value).toBe("all");
	});

	it("should render all draft filter options", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const draftFilterSelect = screen.getByTestId("draft-filter-select") as HTMLSelectElement;
		const options = draftFilterSelect.querySelectorAll("option");

		expect(options.length).toBe(4);
		expect(options[0].value).toBe("all");
		expect(options[1].value).toBe("my-new-drafts");
		expect(options[2].value).toBe("shared-with-me");
		expect(options[3].value).toBe("suggested-updates");
	});

	it("should call setter when draft filter is changed", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const draftFilterSelect = screen.getByTestId("draft-filter-select") as HTMLSelectElement;
		draftFilterSelect.value = "my-new-drafts";
		draftFilterSelect.dispatchEvent(new Event("change", { bubbles: true }));

		expect(mockPreferences.articlesDraftFilter.setter).toHaveBeenCalledWith("my-new-drafts");
	});

	it("should render tool details toggle", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		expect(screen.getByTestId("tool-details-toggle")).toBeDefined();
	});

	it("should toggle tool details when button clicked", () => {
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const toolDetailsToggle = screen.getByTestId("tool-details-toggle");
		expect(toolDetailsToggle.textContent).toBe("Off");

		fireEvent.click(toolDetailsToggle);
		expect(mockPreferences.articleDraftShowToolDetails.setter).toHaveBeenCalledWith(true);
	});

	it("should show On when tool details is enabled", () => {
		mockPreferences.articleDraftShowToolDetails.value = true;
		renderWithProviders(<PreferencesPage />, { withNavigation: false, withPreferences: false });

		const toolDetailsToggle = screen.getByTestId("tool-details-toggle");
		expect(toolDetailsToggle.textContent).toBe("On");
	});
});
