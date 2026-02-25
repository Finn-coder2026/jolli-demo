import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SettingsProfile } from "./SettingsProfile";
import { screen } from "@testing-library/preact";
import type { UserInfo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
	};
});

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		title: createMockIntlayerValue("Profile"),
		subtitle: createMockIntlayerValue("View and manage your profile"),
		personalInfoTitle: createMockIntlayerValue("Personal Information"),
		personalInfoDescription: createMockIntlayerValue("Your personal details"),
		nameLabel: createMockIntlayerValue("Name"),
		nameDescription: createMockIntlayerValue("Your display name"),
		emailLabel: createMockIntlayerValue("Email"),
		emailDescription: createMockIntlayerValue("Your email address"),
		languageTitle: createMockIntlayerValue("Language"),
		languageDescription: createMockIntlayerValue("Choose your preferred language"),
	}),
}));

// Mock LanguageSwitcher
vi.mock("../../components/ui/LanguageSwitcher", () => ({
	LanguageSwitcher: () => <div data-testid="language-switcher">Language Switcher</div>,
}));

describe("SettingsProfile", () => {
	const mockUserInfo: UserInfo = {
		userId: 1,
		name: "John Doe",
		email: "john@example.com",
		picture: undefined,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render profile page with title and subtitle", () => {
		renderWithProviders(<SettingsProfile userInfo={mockUserInfo} />, { withNavigation: false });

		expect(screen.getByText("Profile")).toBeDefined();
		expect(screen.getByText("View and manage your profile")).toBeDefined();
	});

	it("should display user name in input", () => {
		renderWithProviders(<SettingsProfile userInfo={mockUserInfo} />, { withNavigation: false });

		const nameInput = screen.getByTestId("profile-name-input") as HTMLInputElement;
		expect(nameInput.value).toBe("John Doe");
		expect(nameInput.disabled).toBe(true);
	});

	it("should display user email in input", () => {
		renderWithProviders(<SettingsProfile userInfo={mockUserInfo} />, { withNavigation: false });

		const emailInput = screen.getByTestId("profile-email-input") as HTMLInputElement;
		expect(emailInput.value).toBe("john@example.com");
		expect(emailInput.disabled).toBe(true);
	});

	it("should render language switcher", () => {
		renderWithProviders(<SettingsProfile userInfo={mockUserInfo} />, { withNavigation: false });

		expect(screen.getByTestId("language-switcher")).toBeDefined();
	});

	it("should handle missing userInfo", () => {
		renderWithProviders(<SettingsProfile />, { withNavigation: false });

		const nameInput = screen.getByTestId("profile-name-input") as HTMLInputElement;
		const emailInput = screen.getByTestId("profile-email-input") as HTMLInputElement;
		expect(nameInput.value).toBe("");
		expect(emailInput.value).toBe("");
	});
});
