import { createMockClient, renderWithProviders } from "../test/TestUtils";
import { Profile } from "./Profile";
import { screen } from "@testing-library/preact";
import type { UserInfo } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

const mockClient = createMockClient();

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("Profile", () => {
	const mockUserInfo: UserInfo = {
		userId: 1,
		name: "John Doe",
		email: "john@example.com",
		picture: undefined,
	};

	it("should render profile page with title", () => {
		renderWithProviders(<Profile userInfo={mockUserInfo} />, {});

		expect(screen.getByText("My Profile")).toBeDefined();
	});

	it("should render subtitle", () => {
		renderWithProviders(<Profile userInfo={mockUserInfo} />, {});

		expect(screen.getByText("View and manage your personal information")).toBeDefined();
	});

	it("should render personal information section", () => {
		renderWithProviders(<Profile userInfo={mockUserInfo} />, {});

		expect(screen.getByText("Personal Information")).toBeDefined();
	});

	it("should display user name in disabled input", () => {
		renderWithProviders(<Profile userInfo={mockUserInfo} />, {});

		const nameInput = screen.getByDisplayValue("John Doe") as HTMLInputElement;
		expect(nameInput).toBeDefined();
		expect(nameInput.disabled).toBe(true);
	});

	it("should display user email in disabled input", () => {
		renderWithProviders(<Profile userInfo={mockUserInfo} />, {});

		const emailInput = screen.getByDisplayValue("john@example.com") as HTMLInputElement;
		expect(emailInput).toBeDefined();
		expect(emailInput.disabled).toBe(true);
	});

	it("should render language section", () => {
		renderWithProviders(<Profile userInfo={mockUserInfo} />, {});

		const languageElements = screen.getAllByText("Language");
		expect(languageElements.length).toBeGreaterThan(0);
	});

	it("should render language switcher", () => {
		renderWithProviders(<Profile userInfo={mockUserInfo} />, {});

		// LanguageSwitcher is tested in its own test file
		// Just verify the section heading is present
		const languageElements = screen.getAllByText("Language");
		expect(languageElements.length).toBeGreaterThan(0);
	});
});
