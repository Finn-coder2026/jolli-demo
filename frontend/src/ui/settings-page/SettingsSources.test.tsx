import { renderWithProviders } from "../../test/TestUtils";
import { SettingsSources } from "./SettingsSources";
import { screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Integrations component
vi.mock("../integrations/Integrations", () => ({
	Integrations: () => <div data-testid="integrations-component">Integrations Component</div>,
}));

describe("SettingsSources", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render the Integrations component", () => {
		renderWithProviders(<SettingsSources />, { withNavigation: false });

		expect(screen.getByTestId("integrations-component")).toBeDefined();
		expect(screen.getByText("Integrations Component")).toBeDefined();
	});
});
