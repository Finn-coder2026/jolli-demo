import { LanguageSwitcher } from "./LanguageSwitcher";
import { fireEvent, render, screen } from "@testing-library/preact";
import { Locales } from "intlayer";
import { useLocale } from "react-intlayer";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("LanguageSwitcher", () => {
	const mockSetLocale = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.ENGLISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: mockSetLocale,
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});
	});

	it("should render the language switcher button", () => {
		render(<LanguageSwitcher />);

		expect(screen.getByLabelText("Language")).toBeDefined();
		expect(screen.getByText("Language")).toBeDefined();
	});

	it("should open dropdown when clicked", () => {
		render(<LanguageSwitcher />);

		const button = screen.getByLabelText("Language");
		fireEvent.click(button);

		expect(screen.getByText("English")).toBeDefined();
		expect(screen.getByText("Spanish")).toBeDefined();
	});

	it("should call setLocale with ENGLISH when English option is clicked", async () => {
		render(<LanguageSwitcher />);

		const button = screen.getByLabelText("Language");
		fireEvent.click(button);

		// Wait for dropdown to open
		const englishOption = await screen.findByText("English");
		// Use mouseDown instead of click to ensure event fires
		fireEvent.mouseDown(englishOption);
		fireEvent.click(englishOption);

		expect(mockSetLocale).toHaveBeenCalledWith(Locales.ENGLISH);
	});

	it("should call setLocale with SPANISH when Spanish option is clicked", async () => {
		render(<LanguageSwitcher />);

		const button = screen.getByLabelText("Language");
		fireEvent.click(button);

		// Wait for dropdown to open
		const spanishOption = await screen.findByText("Spanish");
		fireEvent.mouseDown(spanishOption);
		fireEvent.click(spanishOption);

		expect(mockSetLocale).toHaveBeenCalledWith(Locales.SPANISH);
	});

	it("should highlight the current locale", () => {
		vi.mocked(useLocale).mockReturnValue({
			locale: Locales.SPANISH,
			defaultLocale: Locales.ENGLISH,
			setLocale: mockSetLocale,
			availableLocales: [Locales.ENGLISH, Locales.SPANISH],
		});

		render(<LanguageSwitcher />);

		const button = screen.getByLabelText("Language");
		fireEvent.click(button);

		const englishOption = screen.getByText("English");
		const spanishOption = screen.getByText("Spanish");

		// Check that the selected item has the bg-accent class (not just hover:bg-accent)
		// Spanish should be selected, so it should have more classes than English
		const spanishClasses = spanishOption.className.split(" ");
		const englishClasses = englishOption.className.split(" ");

		// Spanish should have bg-accent as a standalone class (indicating selection)
		expect(spanishClasses.filter(c => c === "bg-accent").length).toBeGreaterThan(0);
		// English should only have hover:bg-accent in the base classes
		expect(englishClasses.includes("text-accent-foreground")).toBe(false);
	});

	it("should handle Intlayer Proxy objects in getStringValue", () => {
		// Test that the component correctly extracts string values from IntlayerNode objects
		// The global smart mock in Vitest.tsx provides IntlayerNode objects with .value properties
		// The component should handle these correctly via getStringValue

		render(<LanguageSwitcher />);

		// The aria-label should have the string extracted from the IntlayerNode object
		expect(screen.getByLabelText("Language")).toBeDefined();
		// Verify the button renders the label text correctly
		expect(screen.getByText("Language")).toBeDefined();
	});
});
