/**
 * Tests for LogoSection - logo and favicon settings.
 */
import {
	cleanupBrandingTest,
	createMockDocsite,
	expandSection,
	renderBrandingTab,
	setupBrandingTest,
} from "./BrandingTestUtils";
import { cleanup, fireEvent, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("LogoSection", () => {
	let originalFonts: FontFaceSet | undefined;

	beforeEach(() => {
		originalFonts = setupBrandingTest();
	});

	afterEach(() => {
		cleanup();
		cleanupBrandingTest(originalFonts);
	});

	describe("logo settings", () => {
		it("should update logo text", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			const input = screen.getByTestId("logo-text-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "My Docs" } });

			expect(input.value).toBe("My Docs");
		});

		it("should update logo URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			// Switch to "image" display mode to show the URL input
			fireEvent.click(screen.getByTestId("logo-display-image"));

			const input = screen.getByTestId("logo-url-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "https://example.com/logo.png" } });

			expect(input.value).toBe("https://example.com/logo.png");
		});

		it("should update favicon", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			const input = screen.getByTestId("favicon-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "https://example.com/favicon.ico" } });

			expect(input.value).toBe("https://example.com/favicon.ico");
		});

		it("should show error styling for invalid logo URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			// Switch to "image" display mode to show the URL input
			fireEvent.click(screen.getByTestId("logo-display-image"));

			const input = screen.getByTestId("logo-url-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "not-a-valid-url" } });

			expect(input.className).toContain("border-red-500");
		});

		it("should show error styling for invalid favicon URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			const input = screen.getByTestId("favicon-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "invalid-url" } });

			expect(input.className).toContain("border-red-500");
		});

		it("should display existing logo values", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						logo: "My Brand",
						logoUrl: "https://example.com/logo.png",
						logoDisplay: "both",
						favicon: "https://example.com/favicon.ico",
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("logo-section");

			expect((screen.getByTestId("logo-text-input") as HTMLInputElement).value).toBe("My Brand");
			expect((screen.getByTestId("logo-url-input") as HTMLInputElement).value).toBe(
				"https://example.com/logo.png",
			);
			expect((screen.getByTestId("favicon-input") as HTMLInputElement).value).toBe(
				"https://example.com/favicon.ico",
			);
		});
	});
});
