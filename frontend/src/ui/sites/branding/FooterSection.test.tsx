/**
 * Tests for FooterSection - copyright, columns, and social link settings.
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

describe("FooterSection", () => {
	let originalFonts: FontFaceSet | undefined;

	beforeEach(() => {
		originalFonts = setupBrandingTest();
	});

	afterEach(() => {
		cleanup();
		cleanupBrandingTest(originalFonts);
	});

	describe("copyright settings", () => {
		it("should update copyright text", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const input = screen.getByTestId("copyright-input") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "2024 Acme Inc." } });

			expect(input.value).toBe("2024 Acme Inc.");
		});

		it("should display existing copyright text", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						footer: {
							copyright: "2024 Test Company",
						},
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const input = screen.getByTestId("copyright-input") as HTMLInputElement;
			expect(input.value).toBe("2024 Test Company");
		});
	});

	describe("footer columns", () => {
		it("should add a footer column", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			fireEvent.click(screen.getByTestId("add-footer-column"));

			expect(screen.getByTestId("footer-column-0")).toBeDefined();
		});

		it("should update footer column title", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			fireEvent.click(screen.getByTestId("add-footer-column"));

			const titleInput = screen.getByTestId("footer-column-title-0") as HTMLInputElement;
			fireEvent.input(titleInput, { target: { value: "Resources" } });

			expect(titleInput.value).toBe("Resources");
		});

		it("should add link to footer column", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			fireEvent.click(screen.getByTestId("add-footer-column"));
			fireEvent.click(screen.getByTestId("add-footer-column-0-link"));

			expect(screen.getByTestId("footer-column-0-link-0-label")).toBeDefined();
		});

		it("should update footer column link", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			fireEvent.click(screen.getByTestId("add-footer-column"));
			fireEvent.click(screen.getByTestId("add-footer-column-0-link"));

			const labelInput = screen.getByTestId("footer-column-0-link-0-label") as HTMLInputElement;
			fireEvent.input(labelInput, { target: { value: "Documentation" } });

			const urlInput = screen.getByTestId("footer-column-0-link-0-url") as HTMLInputElement;
			fireEvent.input(urlInput, { target: { value: "https://docs.example.com" } });

			expect(labelInput.value).toBe("Documentation");
			expect(urlInput.value).toBe("https://docs.example.com");
		});

		it("should remove footer column", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			fireEvent.click(screen.getByTestId("add-footer-column"));
			expect(screen.getByTestId("footer-column-0")).toBeDefined();

			fireEvent.click(screen.getByTestId("remove-footer-column-0"));

			expect(screen.queryByTestId("footer-column-0")).toBeNull();
		});

		it("should limit footer columns to 4", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						footer: {
							columns: [
								{ title: "Col 1", links: [] },
								{ title: "Col 2", links: [] },
								{ title: "Col 3", links: [] },
								{ title: "Col 4", links: [] },
							],
						},
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("footer-section");

			expect(screen.queryByTestId("add-footer-column")).toBeNull();
		});
	});

	describe("social links", () => {
		it("should update GitHub link", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const input = screen.getByTestId("social-github") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "https://github.com/acme" } });

			expect(input.value).toBe("https://github.com/acme");
		});

		it("should update Twitter link", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const input = screen.getByTestId("social-twitter") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "https://twitter.com/acme" } });

			expect(input.value).toBe("https://twitter.com/acme");
		});

		it("should update Discord link", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const input = screen.getByTestId("social-discord") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "https://discord.gg/acme" } });

			expect(input.value).toBe("https://discord.gg/acme");
		});

		it("should update LinkedIn link", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const input = screen.getByTestId("social-linkedin") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "https://linkedin.com/company/acme" } });

			expect(input.value).toBe("https://linkedin.com/company/acme");
		});

		it("should update YouTube link", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const input = screen.getByTestId("social-youtube") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "https://youtube.com/@acme" } });

			expect(input.value).toBe("https://youtube.com/@acme");
		});

		it("should display existing social links", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						footer: {
							socialLinks: {
								github: "https://github.com/test",
								twitter: "https://twitter.com/test",
							},
						},
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const githubInput = screen.getByTestId("social-github") as HTMLInputElement;
			expect(githubInput.value).toBe("https://github.com/test");

			const twitterInput = screen.getByTestId("social-twitter") as HTMLInputElement;
			expect(twitterInput.value).toBe("https://twitter.com/test");
		});

		it("should clear social link when value is emptied", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						footer: {
							socialLinks: {
								github: "https://github.com/test",
							},
						},
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const githubInput = screen.getByTestId("social-github") as HTMLInputElement;
			fireEvent.input(githubInput, { target: { value: "" } });

			expect(githubInput.value).toBe("");
		});

		it("should show error styling for invalid social link URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			const input = screen.getByTestId("social-github") as HTMLInputElement;
			fireEvent.input(input, { target: { value: "not-a-valid-url" } });

			expect(input.className).toContain("border-red-500");
			expect(input.title).toBe("URL must start with http:// or https://");
		});
	});

	describe("footer column links", () => {
		it("should remove link from footer column", () => {
			const docsite = createMockDocsite({
				metadata: {
					branding: {
						footer: {
							columns: [
								{
									title: "Resources",
									links: [{ label: "Docs", url: "https://docs.example.com" }],
								},
							],
						},
					},
				},
			});
			renderBrandingTab(docsite);

			expandSection("footer-section");

			expect(screen.getByTestId("footer-column-0-link-0-label")).toBeDefined();

			fireEvent.click(screen.getByTestId("remove-footer-column-0-link-0"));

			expect(screen.queryByTestId("footer-column-0-link-0-label")).toBeNull();
		});

		it("should show error styling for invalid footer link URL", () => {
			const docsite = createMockDocsite();
			renderBrandingTab(docsite);

			expandSection("footer-section");

			fireEvent.click(screen.getByTestId("add-footer-column"));
			fireEvent.click(screen.getByTestId("add-footer-column-0-link"));

			const urlInput = screen.getByTestId("footer-column-0-link-0-url") as HTMLInputElement;
			fireEvent.input(urlInput, { target: { value: "invalid-url" } });

			expect(urlInput.className).toContain("border-red-500");
		});
	});
});
