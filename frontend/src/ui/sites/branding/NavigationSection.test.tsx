/**
 * Tests for NavigationSection - navigation mode and header navigation settings.
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

describe("NavigationSection", () => {
	let originalFonts: FontFaceSet | undefined;

	beforeEach(() => {
		originalFonts = setupBrandingTest();
	});

	afterEach(() => {
		cleanup();
		cleanupBrandingTest(originalFonts);
	});

	describe("navigation mode", () => {
		it("should render navigation mode section", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			expect(screen.getByTestId("navigation-mode-section")).toBeDefined();
		});

		it("should allow selecting sidebar mode", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			const sidebarButton = screen.getByTestId("nav-mode-sidebar");
			fireEvent.click(sidebarButton);

			expect(sidebarButton.className).toContain("ring-1");
		});

		it("should allow selecting tabs mode", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			const tabsButton = screen.getByTestId("nav-mode-tabs");
			fireEvent.click(tabsButton);

			expect(tabsButton.className).toContain("ring-1");
		});

		it("should default to sidebar mode", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			const sidebarButton = screen.getByTestId("nav-mode-sidebar");
			expect(sidebarButton.className).toContain("ring-1");
		});
	});

	describe("header navigation", () => {
		it("should render header links section", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			expect(screen.getByTestId("header-links-section")).toBeDefined();
		});

		it("should add a navigation item", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			const addButton = screen.getByTestId("add-nav-item");
			fireEvent.click(addButton);

			expect(screen.getByTestId("nav-item-0")).toBeDefined();
		});

		it("should update navigation item label", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			fireEvent.click(screen.getByTestId("add-nav-item"));

			const labelInput = screen.getByTestId("nav-item-0-label") as HTMLInputElement;
			fireEvent.input(labelInput, { target: { value: "Docs" } });

			expect(labelInput.value).toBe("Docs");
		});

		it("should update navigation item URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			fireEvent.click(screen.getByTestId("add-nav-item"));

			const urlInput = screen.getByTestId("nav-item-0-url") as HTMLInputElement;
			fireEvent.input(urlInput, { target: { value: "https://docs.example.com" } });

			expect(urlInput.value).toBe("https://docs.example.com");
		});

		it("should toggle navigation item type", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			fireEvent.click(screen.getByTestId("add-nav-item"));

			const typeToggle = screen.getByTestId("nav-item-0-type-toggle");
			fireEvent.click(typeToggle);

			// After toggling to dropdown, expand button should appear
			expect(screen.getByTestId("nav-item-0-expand")).toBeDefined();
		});

		it("should remove navigation item", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			fireEvent.click(screen.getByTestId("add-nav-item"));
			expect(screen.getByTestId("nav-item-0")).toBeDefined();

			fireEvent.click(screen.getByTestId("remove-nav-item-0"));

			expect(screen.queryByTestId("nav-item-0")).toBeNull();
		});

		it("should add dropdown link to dropdown item", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			// Add nav item and convert to dropdown
			fireEvent.click(screen.getByTestId("add-nav-item"));
			fireEvent.click(screen.getByTestId("nav-item-0-type-toggle"));

			// Add link to dropdown
			fireEvent.click(screen.getByTestId("nav-item-0-add-link"));

			expect(screen.getByTestId("nav-item-0-link-0-label")).toBeDefined();
		});

		it("should limit navigation items to 6", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						headerLinks: {
							items: [
								{ label: "Item 1", url: "https://1.com" },
								{ label: "Item 2", url: "https://2.com" },
								{ label: "Item 3", url: "https://3.com" },
								{ label: "Item 4", url: "https://4.com" },
								{ label: "Item 5", url: "https://5.com" },
								{ label: "Item 6", url: "https://6.com" },
							],
						},
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			// Add button should not be visible when at max
			expect(screen.queryByTestId("add-nav-item")).toBeNull();
		});

		it("should update dropdown link label and URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			// Add nav item and convert to dropdown
			fireEvent.click(screen.getByTestId("add-nav-item"));
			fireEvent.click(screen.getByTestId("nav-item-0-type-toggle"));

			// Add link to dropdown
			fireEvent.click(screen.getByTestId("nav-item-0-add-link"));

			// Update the dropdown link
			const labelInput = screen.getByTestId("nav-item-0-link-0-label") as HTMLInputElement;
			fireEvent.input(labelInput, { target: { value: "Documentation" } });
			expect(labelInput.value).toBe("Documentation");

			const urlInput = screen.getByTestId("nav-item-0-link-0-url") as HTMLInputElement;
			fireEvent.input(urlInput, { target: { value: "https://docs.example.com" } });
			expect(urlInput.value).toBe("https://docs.example.com");
		});

		it("should remove dropdown link", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			// Add nav item and convert to dropdown
			fireEvent.click(screen.getByTestId("add-nav-item"));
			fireEvent.click(screen.getByTestId("nav-item-0-type-toggle"));

			// Add link to dropdown
			fireEvent.click(screen.getByTestId("nav-item-0-add-link"));
			expect(screen.getByTestId("nav-item-0-link-0-label")).toBeDefined();

			// Remove the link
			fireEvent.click(screen.getByTestId("remove-nav-item-0-link-0"));
			expect(screen.queryByTestId("nav-item-0-link-0-label")).toBeNull();
		});

		it("should show error styling for invalid nav item URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			fireEvent.click(screen.getByTestId("add-nav-item"));

			const urlInput = screen.getByTestId("nav-item-0-url") as HTMLInputElement;
			fireEvent.input(urlInput, { target: { value: "not-valid-url" } });

			expect(urlInput.className).toContain("border-red-500");
			expect(urlInput.title).toBe("URL must start with http:// or https://");
		});

		it("should toggle dropdown back to link", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			// Add nav item and convert to dropdown
			fireEvent.click(screen.getByTestId("add-nav-item"));
			fireEvent.click(screen.getByTestId("nav-item-0-type-toggle"));

			// Should have expand button (dropdown mode)
			expect(screen.getByTestId("nav-item-0-expand")).toBeDefined();

			// Toggle back to link
			fireEvent.click(screen.getByTestId("nav-item-0-type-toggle"));

			// Should have URL input again (link mode)
			expect(screen.getByTestId("nav-item-0-url")).toBeDefined();
			expect(screen.queryByTestId("nav-item-0-expand")).toBeNull();
		});

		it("should collapse/expand dropdown items", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			// Add nav item and convert to dropdown
			fireEvent.click(screen.getByTestId("add-nav-item"));
			fireEvent.click(screen.getByTestId("nav-item-0-type-toggle"));

			// Add link to dropdown
			fireEvent.click(screen.getByTestId("nav-item-0-add-link"));
			expect(screen.getByTestId("nav-item-0-link-0-label")).toBeDefined();

			// Collapse the dropdown
			fireEvent.click(screen.getByTestId("nav-item-0-expand"));

			// Link should be hidden
			expect(screen.queryByTestId("nav-item-0-link-0-label")).toBeNull();

			// Expand again
			fireEvent.click(screen.getByTestId("nav-item-0-expand"));

			// Link should be visible again
			expect(screen.getByTestId("nav-item-0-link-0-label")).toBeDefined();
		});

		it("should limit dropdown items to 8", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						headerLinks: {
							items: [
								{
									label: "Dropdown",
									items: [
										{ label: "Link 1", url: "https://1.com" },
										{ label: "Link 2", url: "https://2.com" },
										{ label: "Link 3", url: "https://3.com" },
										{ label: "Link 4", url: "https://4.com" },
										{ label: "Link 5", url: "https://5.com" },
										{ label: "Link 6", url: "https://6.com" },
										{ label: "Link 7", url: "https://7.com" },
										{ label: "Link 8", url: "https://8.com" },
									],
								},
							],
						},
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			// Add link button should not be visible when at max
			expect(screen.queryByTestId("nav-item-0-add-link")).toBeNull();
		});

		it("should show error for invalid dropdown link URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("navigation-section");

			// Add nav item and convert to dropdown
			fireEvent.click(screen.getByTestId("add-nav-item"));
			fireEvent.click(screen.getByTestId("nav-item-0-type-toggle"));

			// Add link to dropdown
			fireEvent.click(screen.getByTestId("nav-item-0-add-link"));

			const urlInput = screen.getByTestId("nav-item-0-link-0-url") as HTMLInputElement;
			fireEvent.input(urlInput, { target: { value: "invalid" } });

			expect(urlInput.className).toContain("border-red-500");
		});
	});
});
