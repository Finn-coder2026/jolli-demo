import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SettingsUsers } from "./SettingsUsers";
import { screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Users: () => <div data-testid="users-icon" />,
	};
});

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		title: createMockIntlayerValue("Users"),
		subtitle: createMockIntlayerValue("Manage team members and permissions"),
		comingSoon: createMockIntlayerValue("Coming Soon"),
		comingSoonDescription: createMockIntlayerValue(
			"User management features are currently in development. Check back soon!",
		),
	}),
}));

describe("SettingsUsers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render users page with title and subtitle", () => {
		renderWithProviders(<SettingsUsers />, { withNavigation: false });

		expect(screen.getByText("Users")).toBeDefined();
		expect(screen.getByText("Manage team members and permissions")).toBeDefined();
	});

	it("should display coming soon message", () => {
		renderWithProviders(<SettingsUsers />, { withNavigation: false });

		expect(screen.getByTestId("coming-soon-title").textContent).toBe("Coming Soon");
		expect(screen.getByTestId("coming-soon-description")).toBeDefined();
	});

	it("should render users icon", () => {
		renderWithProviders(<SettingsUsers />, { withNavigation: false });

		expect(screen.getByTestId("users-icon")).toBeDefined();
	});
});
