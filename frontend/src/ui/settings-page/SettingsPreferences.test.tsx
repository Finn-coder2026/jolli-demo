import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SettingsPreferences } from "./SettingsPreferences";
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
	useIntlayer: () => ({
		title: createMockIntlayerValue("Account Settings"),
		subtitle: createMockIntlayerValue("Configure your application preferences"),
		appearanceTitle: createMockIntlayerValue("Appearance"),
		appearanceDescription: createMockIntlayerValue("Customize the look and feel"),
		themeLabel: createMockIntlayerValue("Theme"),
		themeDescription: createMockIntlayerValue("Choose between light and dark mode"),
		themeLight: createMockIntlayerValue("Light"),
		themeDark: createMockIntlayerValue("Dark"),
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
		advancedTitle: createMockIntlayerValue("Advanced"),
		advancedDescription: createMockIntlayerValue("Advanced features"),
		sourceViewLabel: createMockIntlayerValue("Source view"),
		sourceViewDescription: createMockIntlayerValue("View raw source data"),
		viewSource: createMockIntlayerValue("View Source"),
	}),
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

// Mock preferences
const mockPreferences: Record<string, { value: unknown; setter: ReturnType<typeof vi.fn> }> = {};

function initMockPreferences() {
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

describe("SettingsPreferences", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsDarkMode = false;
		initMockPreferences();
	});

	it("should render preferences page with title and subtitle", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		expect(screen.getByText("Account Settings")).toBeDefined();
		expect(screen.getByText("Configure your application preferences")).toBeDefined();
	});

	it("should toggle theme when theme button clicked", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const themeToggle = screen.getByTestId("theme-toggle");
		fireEvent.click(themeToggle);

		expect(mockSetThemeMode).toHaveBeenCalledWith("dark");
	});

	it("should toggle theme to light when dark mode is active", () => {
		mockIsDarkMode = true;
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const themeToggle = screen.getByTestId("theme-toggle");
		fireEvent.click(themeToggle);

		expect(mockSetThemeMode).toHaveBeenCalledWith("light");
	});

	it("should toggle sidebar state when button clicked", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const sidebarToggle = screen.getByTestId("sidebar-toggle");
		expect(sidebarToggle.textContent).toBe("Expanded");

		fireEvent.click(sidebarToggle);
		expect(mockPreferences.sidebarCollapsed.setter).toHaveBeenCalledWith(true);
	});

	it("should show collapsed state when sidebar is collapsed", () => {
		mockPreferences.sidebarCollapsed.value = true;
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const sidebarToggle = screen.getByTestId("sidebar-toggle");
		expect(sidebarToggle.textContent).toBe("Collapsed");
	});

	it("should display chat width input", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
		expect(chatWidthInput.value).toBe("400");
	});

	it("should handle chat width blur with valid initial value", () => {
		// Initial value 400 is valid (300-800), blur triggers valid branch
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
		// Verify initial value is set correctly
		expect(chatWidthInput.value).toBe("400");

		// Blur with the initial valid value
		fireEvent.blur(chatWidthInput);

		// Verify the component still renders (blur handler was called)
		expect(screen.getByTestId("chat-width-input")).toBeDefined();
	});

	it("should handle chat width blur with value below minimum", () => {
		// Set initial value below minimum (300) to test invalid branch
		mockPreferences.chatWidth.value = 100;
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
		fireEvent.blur(chatWidthInput);

		// Setter should NOT be called for invalid value
		expect(mockPreferences.chatWidth.setter).not.toHaveBeenCalled();
	});

	it("should handle chat width blur with value above maximum", () => {
		// Set initial value above maximum (800) to test invalid branch
		mockPreferences.chatWidth.value = 900;
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
		fireEvent.blur(chatWidthInput);

		// Setter should NOT be called for invalid value
		expect(mockPreferences.chatWidth.setter).not.toHaveBeenCalled();
	});

	it("should handle chat width input change", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const chatWidthInput = screen.getByTestId("chat-width-input") as HTMLInputElement;
		// Simulate user typing
		fireEvent.input(chatWidthInput, { target: { value: "500" } });

		// Verify the input value reflects the change
		expect(chatWidthInput.value).toBe("500");
	});

	it("should display draft filter select", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const draftFilterSelect = screen.getByTestId("draft-filter-select") as HTMLSelectElement;
		expect(draftFilterSelect.value).toBe("all");
	});

	it("should render draft filter select with options", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const draftFilterSelect = screen.getByTestId("draft-filter-select") as HTMLSelectElement;
		// Verify all options are present
		const options = draftFilterSelect.querySelectorAll("option");
		expect(options.length).toBe(4);
		expect(options[0].value).toBe("all");
		expect(options[1].value).toBe("my-new-drafts");
		expect(options[2].value).toBe("shared-with-me");
		expect(options[3].value).toBe("suggested-updates");
	});

	it("should call setter when draft filter is changed", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const draftFilterSelect = screen.getByTestId("draft-filter-select") as HTMLSelectElement;
		// Set the value and dispatch change event
		draftFilterSelect.value = "my-new-drafts";
		draftFilterSelect.dispatchEvent(new Event("change", { bubbles: true }));

		expect(mockPreferences.articlesDraftFilter.setter).toHaveBeenCalledWith("my-new-drafts");
	});

	it("should toggle tool details when button clicked", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const toolDetailsToggle = screen.getByTestId("tool-details-toggle");
		expect(toolDetailsToggle.textContent).toBe("Off");

		fireEvent.click(toolDetailsToggle);
		expect(mockPreferences.articleDraftShowToolDetails.setter).toHaveBeenCalledWith(true);
	});

	it("should show On when tool details is enabled", () => {
		mockPreferences.articleDraftShowToolDetails.value = true;
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const toolDetailsToggle = screen.getByTestId("tool-details-toggle");
		expect(toolDetailsToggle.textContent).toBe("On");
	});

	it("should render disabled source view button", () => {
		renderWithProviders(<SettingsPreferences />, { withNavigation: false, withPreferences: false });

		const sourceViewButton = screen.getByTestId("source-view-button");
		expect(sourceViewButton).toBeDefined();
		expect(sourceViewButton.hasAttribute("disabled")).toBe(true);
	});
});
