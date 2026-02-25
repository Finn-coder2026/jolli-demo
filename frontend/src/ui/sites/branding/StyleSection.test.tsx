/**
 * Tests for StyleSection - color, theme, typography, code blocks, and appearance settings.
 */
import { cleanupBrandingTest, createMockDocsite, renderBrandingTab, setupBrandingTest } from "./BrandingTestUtils";
import { cleanup, fireEvent, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("StyleSection", () => {
	let originalFonts: FontFaceSet | undefined;

	beforeEach(() => {
		originalFonts = setupBrandingTest();
	});

	afterEach(() => {
		cleanup();
		cleanupBrandingTest(originalFonts);
	});

	describe("color settings", () => {
		it("should allow selecting preset colors", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const purplePreset = screen.getByTestId("preset-purple");
			fireEvent.click(purplePreset);

			const hueInput = screen.getByTestId("primary-hue-input") as HTMLInputElement;
			expect(hueInput.value).toBe("270");
		});

		it("should update hue via slider", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const slider = screen.getByTestId("primary-hue-slider") as HTMLInputElement;
			fireEvent.input(slider, { target: { value: "180" } });

			expect(slider.value).toBe("180");
		});

		it("should update hue via number input", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const input = screen.getByTestId("primary-hue-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "300" } });

			expect(input.value).toBe("300");
		});

		it("should clamp hue to valid range", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const input = screen.getByTestId("primary-hue-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "400" } });

			expect(input.value).toBe("360");
		});
	});

	describe("theme settings", () => {
		it("should allow selecting theme", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const darkButton = screen.getByTestId("theme-dark");
			fireEvent.click(darkButton);

			expect(darkButton.className).toContain("bg-background");
		});
	});

	describe("typography settings", () => {
		it("should render typography section", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expect(screen.getByTestId("typography-section")).toBeDefined();
		});

		it("should allow selecting font family", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const spaceGroteskButton = screen.getByTestId("font-space-grotesk");
			fireEvent.click(spaceGroteskButton);

			expect(spaceGroteskButton.className).toContain("ring-1");
		});

		it("should switch preset to custom when changing font", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						themePreset: "minimal",
						primaryHue: 220,
						fontFamily: "inter",
						codeTheme: "github",
						borderRadius: "subtle",
						spacingDensity: "comfortable",
						defaultTheme: "light",
					},
				},
			});
			renderBrandingTab(docsite);

			const minimalButton = screen.getByTestId("preset-minimal");
			expect(minimalButton.className).toContain("ring-2");

			fireEvent.click(screen.getByTestId("font-ibm-plex"));

			const customButton = screen.getByTestId("preset-custom");
			expect(customButton.className).toContain("ring-2");
		});
	});

	describe("code blocks settings", () => {
		it("should render code blocks section", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expect(screen.getByTestId("code-blocks-section")).toBeDefined();
		});

		it("should allow selecting code theme", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const draculaButton = screen.getByTestId("code-theme-dracula");
			fireEvent.click(draculaButton);

			expect(draculaButton.className).toContain("ring-1");
		});
	});

	describe("appearance settings", () => {
		it("should render appearance section", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expect(screen.getByTestId("appearance-section")).toBeDefined();
		});

		it("should allow selecting border radius", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const pillButton = screen.getByTestId("border-radius-pill");
			fireEvent.click(pillButton);

			expect(pillButton.className).toContain("ring-1");
		});

		it("should allow selecting spacing density", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const airyButton = screen.getByTestId("spacing-airy");
			fireEvent.click(airyButton);

			expect(airyButton.className).toContain("ring-1");
		});
	});
});
