/**
 * Tests for SiteBrandingTab - core rendering, save/reset, and integration tests.
 */
import {
	cleanupBrandingTest,
	createMockDocsite,
	expandSection,
	mockOnDocsiteUpdate,
	mockUpdateBranding,
	renderBrandingTab,
	setupBrandingTest,
} from "./BrandingTestUtils";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("SiteBrandingTab", () => {
	let originalFonts: FontFaceSet | undefined;

	beforeEach(() => {
		originalFonts = setupBrandingTest();
	});

	afterEach(() => {
		cleanup();
		cleanupBrandingTest(originalFonts);
	});

	describe("rendering", () => {
		it("should render all sections", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expect(screen.getByTestId("preset-section")).toBeDefined();
			expect(screen.getByTestId("style-section")).toBeDefined();
			expect(screen.getByTestId("logo-section")).toBeDefined();
			expect(screen.getByTestId("navigation-section")).toBeDefined();
			expect(screen.getByTestId("footer-section")).toBeDefined();
			expect(screen.getByTestId("layout-section")).toBeDefined();
		});

		it("should render live preview on large screens", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expect(screen.getByTestId("live-preview")).toBeDefined();
		});

		it("should handle click on live preview link without navigation", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			const preview = screen.getByTestId("live-preview");
			const link = preview.querySelector("a");
			expect(link).toBeDefined();
			if (link) {
				fireEvent.click(link);
			}
			expect(preview.querySelector("a")).toBeDefined();
		});

		it("should render style section contents when expanded", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expect(screen.getByTestId("color-section")).toBeDefined();
			expect(screen.getByTestId("theme-section")).toBeDefined();
			expect(screen.getByTestId("typography-section")).toBeDefined();
			expect(screen.getByTestId("code-blocks-section")).toBeDefined();
			expect(screen.getByTestId("appearance-section")).toBeDefined();
		});
	});

	describe("save and reset", () => {
		it("should show save buttons when dirty", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			const input = screen.getByTestId("logo-text-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "Changed" } });

			expect(screen.getByTestId("save-actions")).toBeDefined();
			expect(screen.getByTestId("save-button")).toBeDefined();
			expect(screen.getByTestId("reset-button")).toBeDefined();
		});

		it("should save changes", async () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			fireEvent.input(screen.getByTestId("logo-text-input"), { target: { value: "Changed" } });
			fireEvent.click(screen.getByTestId("save-button"));

			await waitFor(() => {
				expect(mockUpdateBranding).toHaveBeenCalledWith(1, expect.objectContaining({ logo: "Changed" }));
			});
		});

		it("should save all customization settings", async () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			fireEvent.click(screen.getByTestId("font-ibm-plex"));
			fireEvent.click(screen.getByTestId("code-theme-nord"));
			fireEvent.click(screen.getByTestId("border-radius-rounded"));
			fireEvent.click(screen.getByTestId("spacing-compact"));
			fireEvent.click(screen.getByTestId("theme-light"));

			fireEvent.click(screen.getByTestId("save-button"));

			await waitFor(() => {
				expect(mockUpdateBranding).toHaveBeenCalledWith(
					1,
					expect.objectContaining({
						fontFamily: "ibm-plex",
						codeTheme: "nord",
						borderRadius: "rounded",
						spacingDensity: "compact",
						defaultTheme: "light",
						themePreset: "custom",
					}),
				);
			});
		});

		it("should reset changes", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: { logo: "Original" },
				},
			});
			renderBrandingTab(docsite);

			expandSection("logo-section");

			const input = screen.getByTestId("logo-text-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "Changed" } });
			expect(input.value).toBe("Changed");

			fireEvent.click(screen.getByTestId("reset-button"));
			expect(input.value).toBe("Original");
		});

		it("should show error on save failure", async () => {
			mockUpdateBranding.mockRejectedValue(new Error("Save failed"));
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			fireEvent.input(screen.getByTestId("logo-text-input"), { target: { value: "Changed" } });
			fireEvent.click(screen.getByTestId("save-button"));

			await waitFor(() => {
				expect(screen.getByTestId("branding-error")).toBeDefined();
			});
		});

		it("should call onDocsiteUpdate after successful save", async () => {
			mockUpdateBranding.mockResolvedValue({ id: 1, name: "test-site" });
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("logo-section");

			fireEvent.input(screen.getByTestId("logo-text-input"), { target: { value: "Changed" } });
			fireEvent.click(screen.getByTestId("save-button"));

			await waitFor(() => {
				expect(mockOnDocsiteUpdate).toHaveBeenCalledWith(
					expect.objectContaining({
						needsUpdate: true,
						brandingChanged: true,
					}),
				);
			});
		});
	});

	describe("disabled state", () => {
		it("should disable inputs when site is not active", () => {
			const docsite = createMockDocsite({ status: "building" });
			renderBrandingTab(docsite);

			expandSection("logo-section");

			const input = screen.getByTestId("logo-text-input") as HTMLInputElement;
			expect(input.disabled).toBe(true);
		});
	});

	describe("existing branding data", () => {
		it("should load existing branding from metadata", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						logo: "Existing Logo",
						primaryHue: 180,
						defaultTheme: "dark",
						headerLinks: {
							items: [{ label: "GitHub", url: "https://github.com" }],
						},
						footer: {
							copyright: "2024 Test",
						},
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("logo-section");
			expandSection("navigation-section");
			expandSection("footer-section");

			expect((screen.getByTestId("logo-text-input") as HTMLInputElement).value).toBe("Existing Logo");
			expect((screen.getByTestId("primary-hue-input") as HTMLInputElement).value).toBe("180");
			expect((screen.getByTestId("nav-item-0-label") as HTMLInputElement).value).toBe("GitHub");
			expect((screen.getByTestId("copyright-input") as HTMLInputElement).value).toBe("2024 Test");
		});
	});
});
