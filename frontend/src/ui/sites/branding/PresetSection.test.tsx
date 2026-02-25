/**
 * Tests for PresetSection - theme preset selection.
 */
import { cleanupBrandingTest, createMockDocsite, renderBrandingTab, setupBrandingTest } from "./BrandingTestUtils";
import { cleanup, fireEvent, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("PresetSection", () => {
	let originalFonts: FontFaceSet | undefined;

	beforeEach(() => {
		originalFonts = setupBrandingTest();
	});

	afterEach(() => {
		cleanup();
		cleanupBrandingTest(originalFonts);
	});

	describe("theme presets", () => {
		it("should render preset section", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expect(screen.getByTestId("preset-section")).toBeDefined();
			expect(screen.getByTestId("preset-minimal")).toBeDefined();
			expect(screen.getByTestId("preset-vibrant")).toBeDefined();
			expect(screen.getByTestId("preset-terminal")).toBeDefined();
			expect(screen.getByTestId("preset-friendly")).toBeDefined();
			expect(screen.getByTestId("preset-noir")).toBeDefined();
			expect(screen.getByTestId("preset-custom")).toBeDefined();
		});

		it("should apply preset values when selected", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			fireEvent.click(screen.getByTestId("preset-vibrant"));

			const hueInput = screen.getByTestId("primary-hue-input") as HTMLInputElement;
			expect(hueInput.value).toBe("270");
		});

		it("should highlight selected preset", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						themePreset: "terminal",
						primaryHue: 210,
						fontFamily: "ibm-plex",
						codeTheme: "one-dark",
						borderRadius: "sharp",
						spacingDensity: "compact",
						defaultTheme: "system",
					},
				},
			});
			renderBrandingTab(docsite);

			const terminalButton = screen.getByTestId("preset-terminal");
			expect(terminalButton.className).toContain("ring-2");
		});

		it("should show custom preset when values dont match any preset", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						primaryHue: 123,
					},
				},
			});
			renderBrandingTab(docsite);

			const customButton = screen.getByTestId("preset-custom");
			expect(customButton.className).toContain("ring-2");
		});
	});
});
