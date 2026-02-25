/**
 * Tests for LayoutSection - page widths, ToC, sidebar, and header alignment settings.
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

describe("LayoutSection", () => {
	let originalFonts: FontFaceSet | undefined;

	beforeEach(() => {
		originalFonts = setupBrandingTest();
	});

	afterEach(() => {
		cleanup();
		cleanupBrandingTest(originalFonts);
	});

	describe("ToC settings", () => {
		it("should toggle hide ToC", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const checkbox = screen.getByTestId("hide-toc-checkbox") as HTMLInputElement;
			expect(checkbox.checked).toBe(false);

			fireEvent.click(checkbox);

			expect(checkbox.checked).toBe(true);
		});

		it("should update ToC title", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const input = screen.getByTestId("toc-title-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "Contents" } });

			expect(input.value).toBe("Contents");
		});

		it("should hide ToC title input when ToC is hidden", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const checkbox = screen.getByTestId("hide-toc-checkbox") as HTMLInputElement;
			fireEvent.click(checkbox);

			expect(screen.queryByTestId("toc-title-input")).toBeNull();
		});
	});

	describe("layout width controls", () => {
		it("should render page width control with default value", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const wideButton = screen.getByTestId("page-width-wide");
			expect(wideButton.className).toContain("bg-background");
		});

		it("should select page width option", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const standardButton = screen.getByTestId("page-width-standard");
			fireEvent.click(standardButton);

			expect(standardButton.className).toContain("bg-background");
		});

		it("should render content width control with default value", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const standardButton = screen.getByTestId("content-width-standard");
			expect(standardButton.className).toContain("bg-background");
		});

		it("should render sidebar width control", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			expect(screen.getByTestId("sidebar-width-compact")).toBeDefined();
			expect(screen.getByTestId("sidebar-width-standard")).toBeDefined();
			expect(screen.getByTestId("sidebar-width-wide")).toBeDefined();
		});

		it("should render TOC width control when TOC is visible", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			expect(screen.getByTestId("toc-width-compact")).toBeDefined();
			expect(screen.getByTestId("toc-width-standard")).toBeDefined();
			expect(screen.getByTestId("toc-width-wide")).toBeDefined();
		});

		it("should hide TOC width control when TOC is hidden", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			// Hide TOC
			const checkbox = screen.getByTestId("hide-toc-checkbox") as HTMLInputElement;
			fireEvent.click(checkbox);

			expect(screen.queryByTestId("toc-width-standard")).toBeNull();
		});

		it("should render header alignment control with right as default", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const rightButton = screen.getByTestId("header-alignment-right");
			expect(rightButton.className).toContain("bg-background");
		});

		it("should select content width option", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const compactButton = screen.getByTestId("content-width-compact");
			fireEvent.click(compactButton);

			expect(compactButton.className).toContain("bg-background");
		});

		it("should select sidebar width option", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const wideButton = screen.getByTestId("sidebar-width-wide");
			fireEvent.click(wideButton);

			expect(wideButton.className).toContain("bg-background");
		});

		it("should select TOC width option", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const compactButton = screen.getByTestId("toc-width-compact");
			fireEvent.click(compactButton);

			expect(compactButton.className).toContain("bg-background");
		});

		it("should select header alignment option", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const leftButton = screen.getByTestId("header-alignment-left");
			fireEvent.click(leftButton);

			expect(leftButton.className).toContain("bg-background");
		});

		it("should display existing layout width values", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						pageWidth: "wide",
						contentWidth: "compact",
						sidebarWidth: "compact",
						tocWidth: "wide",
						headerAlignment: "left",
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("layout-section");

			expect(screen.getByTestId("page-width-wide").className).toContain("bg-background");
			expect(screen.getByTestId("content-width-compact").className).toContain("bg-background");
			expect(screen.getByTestId("sidebar-width-compact").className).toContain("bg-background");
			expect(screen.getByTestId("toc-width-wide").className).toContain("bg-background");
			expect(screen.getByTestId("header-alignment-left").className).toContain("bg-background");
		});
	});

	describe("sidebar settings", () => {
		it("should select sidebar collapse level", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const level3Button = screen.getByTestId("sidebar-collapse-3");
			fireEvent.click(level3Button);

			expect(level3Button.className).toContain("bg-foreground");
		});

		it("should default to collapse level 2", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const level2Button = screen.getByTestId("sidebar-collapse-2");
			expect(level2Button.className).toContain("bg-foreground");
		});

		it("should render all collapse level options", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("layout-section");

			for (let i = 1; i <= 6; i++) {
				expect(screen.getByTestId(`sidebar-collapse-${i}`)).toBeDefined();
			}
		});

		it("should display existing collapse level", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						sidebarDefaultCollapseLevel: 4,
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("layout-section");

			const level4Button = screen.getByTestId("sidebar-collapse-4");
			expect(level4Button.className).toContain("bg-foreground");
		});
	});
});
