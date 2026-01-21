import { Settings } from "./Settings";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { Locales } from "intlayer";
import type { Client } from "jolli-common";
import type { ReactNode } from "react";
import { useLocale } from "react-intlayer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientProvider } from "@/contexts/ClientContext";
import { OrgProvider } from "@/contexts/OrgContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Mock the client
const mockClient = {
	orgs: () => ({
		getCurrent: vi.fn().mockResolvedValue({
			tenant: null,
			org: null,
			availableOrgs: [],
		}),
	}),
} as unknown as Client;

function renderWithProviders(ui: ReactNode) {
	return render(
		<ClientProvider client={mockClient}>
			<OrgProvider>
				<PreferencesProvider>
					<ThemeProvider>{ui}</ThemeProvider>
				</PreferencesProvider>
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

	it("should render settings heading", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Settings")).toBeDefined();
		});
	});

	it("should render subtitle", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Configure your preferences and account settings")).toBeDefined();
		});
	});

	it("should render appearance section with language option", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			// Appearance is a section heading
			expect(screen.getByText("Appearance")).toBeDefined();
			// Language appears as both a row label and in the LanguageSwitcher, so use getAllByText
			expect(screen.getAllByText("Language").length).toBeGreaterThan(0);
		});
	});

	it("should render interface section", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Interface")).toBeDefined();
			expect(screen.getByText("Sidebar default state")).toBeDefined();
			expect(screen.getByText("Chat panel width")).toBeDefined();
		});
	});

	it("should render articles section", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Articles")).toBeDefined();
			expect(screen.getByText("Default draft filter")).toBeDefined();
			expect(screen.getByText("Show AI tool details")).toBeDefined();
		});
	});

	it("should toggle theme when theme button is clicked", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Light")).toBeDefined();
		});

		// Find and click the theme button
		const themeButton = screen.getByText("Light").closest("button");
		expect(themeButton).toBeDefined();
		if (themeButton) {
			fireEvent.click(themeButton);
		}

		// After clicking, theme should toggle (we can verify the button still exists)
		await waitFor(() => {
			// Button should still be present after toggle
			const buttons = screen.getAllByRole("button");
			expect(buttons.length).toBeGreaterThan(0);
		});
	});

	it("should toggle sidebar state when sidebar button is clicked", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Expanded")).toBeDefined();
		});

		// Find and click the sidebar button
		const sidebarButton = screen.getByText("Expanded").closest("button");
		expect(sidebarButton).toBeDefined();
		if (sidebarButton) {
			fireEvent.click(sidebarButton);
		}

		// After clicking, should show Collapsed
		await waitFor(() => {
			expect(screen.getByText("Collapsed")).toBeDefined();
		});
	});

	it("should toggle show tool details when button is clicked", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Off")).toBeDefined();
		});

		// Find and click the tool details button
		const toolDetailsButton = screen.getByText("Off").closest("button");
		expect(toolDetailsButton).toBeDefined();
		if (toolDetailsButton) {
			fireEvent.click(toolDetailsButton);
		}

		// After clicking, should show On
		await waitFor(() => {
			expect(screen.getByText("On")).toBeDefined();
		});
	});

	it("should update chat width on valid input blur", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Chat panel width")).toBeDefined();
		});

		// Find the chat width input (type=number)
		const chatWidthInput = screen.getByRole("spinbutton");
		expect(chatWidthInput).toBeDefined();

		// Change to a valid value and blur
		fireEvent.change(chatWidthInput, { target: { value: "500" } });
		fireEvent.blur(chatWidthInput);

		// Verify the value is set
		await waitFor(() => {
			expect((chatWidthInput as HTMLInputElement).value).toBe("500");
		});
	});

	it("should handle invalid chat width input (too small)", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Chat panel width")).toBeDefined();
		});

		// Find the chat width input
		const chatWidthInput = screen.getByRole("spinbutton");
		// Default value is 600
		expect((chatWidthInput as HTMLInputElement).value).toBe("600");

		// Change to an invalid value (too small) and blur
		fireEvent.change(chatWidthInput, { target: { value: "100" } });
		fireEvent.blur(chatWidthInput);

		// The blur handler is called - verify component doesn't crash
		// and the input still exists
		await waitFor(() => {
			expect(screen.getByRole("spinbutton")).toBeDefined();
		});
	});

	it("should handle invalid chat width input (too large)", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Chat panel width")).toBeDefined();
		});

		// Find the chat width input
		const chatWidthInput = screen.getByRole("spinbutton");

		// Change to an invalid value (too large) and blur
		fireEvent.change(chatWidthInput, { target: { value: "1000" } });
		fireEvent.blur(chatWidthInput);

		// The blur handler is called - verify component doesn't crash
		await waitFor(() => {
			expect(screen.getByRole("spinbutton")).toBeDefined();
		});
	});

	it("should handle empty chat width input (NaN)", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Chat panel width")).toBeDefined();
		});

		// Find the chat width input
		const chatWidthInput = screen.getByRole("spinbutton");

		// Change to an empty value and blur
		fireEvent.change(chatWidthInput, { target: { value: "" } });
		fireEvent.blur(chatWidthInput);

		// The blur handler is called - verify component doesn't crash
		await waitFor(() => {
			expect(screen.getByRole("spinbutton")).toBeDefined();
		});
	});

	it("should change draft filter when select changes", async () => {
		renderWithProviders(<Settings />);

		await waitFor(() => {
			expect(screen.getByText("Default draft filter")).toBeDefined();
		});

		// Find the draft filter select
		const draftFilterSelect = screen.getByRole("combobox");
		expect(draftFilterSelect).toBeDefined();

		// Change the value
		fireEvent.change(draftFilterSelect, { target: { value: "my-new-drafts" } });

		// Verify the value changed
		await waitFor(() => {
			expect((draftFilterSelect as HTMLSelectElement).value).toBe("my-new-drafts");
		});
	});

	it("should render dark mode button when in dark mode", async () => {
		// Set dark mode in localStorage before rendering
		localStorage.setItem("theme", "dark");

		renderWithProviders(<Settings />);

		await waitFor(() => {
			// In dark mode, should show "Dark" text
			expect(screen.getByText("Dark")).toBeDefined();
		});
	});
});
