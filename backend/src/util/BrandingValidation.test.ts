import { validateSiteBranding } from "./BrandingValidation.js";
import { BRANDING_LIMITS } from "jolli-common";
import { describe, expect, it } from "vitest";

describe("BrandingValidation", () => {
	describe("validateSiteBranding", () => {
		it("should accept an empty branding object", () => {
			const result = validateSiteBranding({});
			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("should accept a valid complete branding object", () => {
			const result = validateSiteBranding({
				logo: "My Site",
				logoUrl: "https://example.com/logo.png",
				favicon: "https://example.com/favicon.ico",
				primaryHue: 212,
				defaultTheme: "dark",
				themePreset: "minimal",
				fontFamily: "inter",
				codeTheme: "github",
				borderRadius: "subtle",
				spacingDensity: "comfortable",
				navigationMode: "sidebar",
				hideToc: false,
				tocTitle: "Contents",
				sidebarDefaultCollapseLevel: 2,
				pageWidth: "wide",
				contentWidth: "standard",
				sidebarWidth: "standard",
				tocWidth: "standard",
				headerAlignment: "right",
				headerLinks: {
					items: [
						{ label: "Docs", url: "https://docs.example.com" },
						{
							label: "More",
							items: [
								{ label: "Blog", url: "https://blog.example.com" },
								{ label: "GitHub", url: "https://github.com/example" },
							],
						},
					],
				},
				footer: {
					copyright: "2024 Example Inc.",
					columns: [
						{
							title: "Resources",
							links: [{ label: "Documentation", url: "https://docs.example.com" }],
						},
					],
					socialLinks: {
						github: "https://github.com/example",
						twitter: "https://twitter.com/example",
					},
				},
			});
			expect(result.isValid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("should reject non-object input", () => {
			expect(validateSiteBranding(null).isValid).toBe(false);
			expect(validateSiteBranding(undefined).isValid).toBe(false);
			expect(validateSiteBranding("string").isValid).toBe(false);
			expect(validateSiteBranding(123).isValid).toBe(false);
		});

		describe("URL validation", () => {
			it("should reject invalid logoUrl", () => {
				const result = validateSiteBranding({ logoUrl: "not-a-url" });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("logoUrl must be a valid http/https URL");
			});

			it("should reject javascript: URLs", () => {
				const result = validateSiteBranding({ logoUrl: "javascript:alert(1)" });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("logoUrl must be a valid http/https URL");
			});

			it("should reject data: URLs", () => {
				const result = validateSiteBranding({ favicon: "data:image/png;base64,abc" });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("favicon must be a valid http/https URL");
			});

			it("should accept valid http URLs", () => {
				const result = validateSiteBranding({ logoUrl: "http://example.com/logo.png" });
				expect(result.isValid).toBe(true);
			});

			it("should accept valid https URLs", () => {
				const result = validateSiteBranding({ logoUrl: "https://example.com/logo.png" });
				expect(result.isValid).toBe(true);
			});

			it("should allow empty string URLs (treated as not set)", () => {
				const result = validateSiteBranding({ logoUrl: "" });
				expect(result.isValid).toBe(true);
			});
		});

		describe("primaryHue validation", () => {
			it("should reject primaryHue below 0", () => {
				const result = validateSiteBranding({ primaryHue: -1 });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("primaryHue must be between 0 and 360");
			});

			it("should reject primaryHue above 360", () => {
				const result = validateSiteBranding({ primaryHue: 361 });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("primaryHue must be between 0 and 360");
			});

			it("should accept primaryHue at boundaries", () => {
				expect(validateSiteBranding({ primaryHue: 0 }).isValid).toBe(true);
				expect(validateSiteBranding({ primaryHue: 360 }).isValid).toBe(true);
			});

			it("should reject non-numeric primaryHue", () => {
				const result = validateSiteBranding({ primaryHue: "blue" as unknown as number });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("primaryHue must be a number");
			});

			it("should reject NaN primaryHue", () => {
				const result = validateSiteBranding({ primaryHue: Number.NaN });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("primaryHue must be a number");
			});
		});

		describe("sidebarDefaultCollapseLevel validation", () => {
			it("should reject non-numeric sidebarDefaultCollapseLevel", () => {
				const result = validateSiteBranding({ sidebarDefaultCollapseLevel: "two" as unknown as number });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("sidebarDefaultCollapseLevel must be a number");
			});

			it("should reject NaN sidebarDefaultCollapseLevel", () => {
				const result = validateSiteBranding({ sidebarDefaultCollapseLevel: Number.NaN });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("sidebarDefaultCollapseLevel must be a number");
			});

			it("should reject collapse level below 1", () => {
				const result = validateSiteBranding({ sidebarDefaultCollapseLevel: 0 });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("sidebarDefaultCollapseLevel must be between 1 and 6");
			});

			it("should reject collapse level above 6", () => {
				const result = validateSiteBranding({ sidebarDefaultCollapseLevel: 7 });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("sidebarDefaultCollapseLevel must be between 1 and 6");
			});

			it("should accept collapse level at boundaries", () => {
				expect(validateSiteBranding({ sidebarDefaultCollapseLevel: 1 }).isValid).toBe(true);
				expect(validateSiteBranding({ sidebarDefaultCollapseLevel: 6 }).isValid).toBe(true);
			});
		});

		describe("enum validation", () => {
			it("should reject invalid themePreset", () => {
				const result = validateSiteBranding({ themePreset: "invalid" as "minimal" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("themePreset must be one of");
			});

			it("should reject invalid defaultTheme", () => {
				const result = validateSiteBranding({ defaultTheme: "blue" as "dark" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("defaultTheme must be one of");
			});

			it("should reject invalid fontFamily", () => {
				const result = validateSiteBranding({ fontFamily: "comic-sans" as "inter" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("fontFamily must be one of");
			});

			it("should reject invalid codeTheme", () => {
				const result = validateSiteBranding({ codeTheme: "monokai" as "github" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("codeTheme must be one of");
			});

			it("should reject invalid borderRadius", () => {
				const result = validateSiteBranding({ borderRadius: "round" as "rounded" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("borderRadius must be one of");
			});

			it("should reject invalid spacingDensity", () => {
				const result = validateSiteBranding({ spacingDensity: "tight" as "compact" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("spacingDensity must be one of");
			});

			it("should reject invalid navigationMode", () => {
				const result = validateSiteBranding({ navigationMode: "dropdown" as "tabs" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("navigationMode must be one of");
			});

			it("should reject invalid pageWidth", () => {
				const result = validateSiteBranding({ pageWidth: "huge" as "wide" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("pageWidth must be one of");
			});

			it("should reject invalid contentWidth", () => {
				const result = validateSiteBranding({ contentWidth: "tiny" as "compact" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("contentWidth must be one of");
			});

			it("should reject invalid sidebarWidth", () => {
				const result = validateSiteBranding({ sidebarWidth: "huge" as "wide" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("sidebarWidth must be one of");
			});

			it("should reject invalid tocWidth", () => {
				const result = validateSiteBranding({ tocWidth: "tiny" as "compact" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("tocWidth must be one of");
			});

			it("should reject invalid headerAlignment", () => {
				const result = validateSiteBranding({ headerAlignment: "center" as "left" });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("headerAlignment must be one of");
			});

			it("should accept all valid layout width values", () => {
				expect(validateSiteBranding({ pageWidth: "compact" }).isValid).toBe(true);
				expect(validateSiteBranding({ pageWidth: "standard" }).isValid).toBe(true);
				expect(validateSiteBranding({ pageWidth: "wide" }).isValid).toBe(true);
				expect(validateSiteBranding({ contentWidth: "compact" }).isValid).toBe(true);
				expect(validateSiteBranding({ contentWidth: "standard" }).isValid).toBe(true);
				expect(validateSiteBranding({ contentWidth: "wide" }).isValid).toBe(true);
				expect(validateSiteBranding({ sidebarWidth: "compact" }).isValid).toBe(true);
				expect(validateSiteBranding({ sidebarWidth: "standard" }).isValid).toBe(true);
				expect(validateSiteBranding({ sidebarWidth: "wide" }).isValid).toBe(true);
				expect(validateSiteBranding({ tocWidth: "compact" }).isValid).toBe(true);
				expect(validateSiteBranding({ tocWidth: "standard" }).isValid).toBe(true);
				expect(validateSiteBranding({ tocWidth: "wide" }).isValid).toBe(true);
				expect(validateSiteBranding({ headerAlignment: "left" }).isValid).toBe(true);
				expect(validateSiteBranding({ headerAlignment: "right" }).isValid).toBe(true);
			});
		});

		describe("string length validation", () => {
			it("should reject logo exceeding max length", () => {
				const result = validateSiteBranding({ logo: "x".repeat(BRANDING_LIMITS.MAX_LOGO_LENGTH + 1) });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("logo exceeds maximum length");
			});

			it("should reject tocTitle exceeding max length", () => {
				const result = validateSiteBranding({ tocTitle: "x".repeat(BRANDING_LIMITS.MAX_TOC_TITLE_LENGTH + 1) });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("tocTitle exceeds maximum length");
			});

			it("should accept strings at exactly max length", () => {
				const result = validateSiteBranding({
					logo: "x".repeat(BRANDING_LIMITS.MAX_LOGO_LENGTH),
					tocTitle: "y".repeat(BRANDING_LIMITS.MAX_TOC_TITLE_LENGTH),
				});
				expect(result.isValid).toBe(true);
			});
		});

		describe("hideToc validation", () => {
			it("should accept boolean hideToc", () => {
				expect(validateSiteBranding({ hideToc: true }).isValid).toBe(true);
				expect(validateSiteBranding({ hideToc: false }).isValid).toBe(true);
			});

			it("should reject non-boolean hideToc", () => {
				const result = validateSiteBranding({ hideToc: "yes" as unknown as boolean });
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("hideToc must be a boolean");
			});
		});

		describe("headerLinks validation", () => {
			it("should reject too many header items", () => {
				const items = Array.from({ length: BRANDING_LIMITS.MAX_HEADER_ITEMS + 1 }, (_, i) => ({
					label: `Item ${i}`,
					url: `https://example.com/${i}`,
				}));
				const result = validateSiteBranding({ headerLinks: { items } });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("exceeds maximum of 6 items");
			});

			it("should reject header item with both url and items", () => {
				const result = validateSiteBranding({
					headerLinks: {
						items: [
							{
								label: "Both",
								url: "https://example.com",
								items: [{ label: "Sub", url: "https://sub.example.com" }],
							},
						],
					},
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("cannot have both url and items");
			});

			it("should reject too many dropdown items", () => {
				const subItems = Array.from({ length: BRANDING_LIMITS.MAX_DROPDOWN_ITEMS + 1 }, (_, i) => ({
					label: `Sub ${i}`,
					url: `https://example.com/sub/${i}`,
				}));
				const result = validateSiteBranding({
					headerLinks: { items: [{ label: "Dropdown", items: subItems }] },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("exceeds maximum of 8 dropdown items");
			});

			it("should reject header item without label", () => {
				const result = validateSiteBranding({
					headerLinks: { items: [{ label: "", url: "https://example.com" }] },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("label is required");
			});

			it("should reject invalid URL in header item", () => {
				const result = validateSiteBranding({
					headerLinks: { items: [{ label: "Bad", url: "not-a-url" }] },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("must be a valid http/https URL");
			});

			it("should reject non-array headerLinks.items", () => {
				const result = validateSiteBranding({
					headerLinks: { items: "not-an-array" as unknown as Array<unknown> },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("headerLinks.items must be an array");
			});

			it("should reject non-array dropdown items", () => {
				const result = validateSiteBranding({
					headerLinks: {
						items: [{ label: "Menu", items: "not-an-array" as unknown as Array<unknown> }],
					},
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("items must be an array");
			});

			it("should reject invalid URL in dropdown item", () => {
				const result = validateSiteBranding({
					headerLinks: {
						items: [{ label: "Dropdown", items: [{ label: "Bad", url: "javascript:void(0)" }] }],
					},
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("must be a valid http/https URL");
			});
		});

		describe("footer validation", () => {
			it("should reject non-array footer.columns", () => {
				const result = validateSiteBranding({
					footer: { columns: "not-an-array" as unknown as Array<unknown> },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors).toContain("footer.columns must be an array");
			});

			it("should reject non-array column.links", () => {
				const result = validateSiteBranding({
					footer: { columns: [{ title: "Col", links: "not-an-array" }] },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("links must be an array");
			});

			it("should reject too many footer columns", () => {
				const columns = Array.from({ length: BRANDING_LIMITS.MAX_FOOTER_COLUMNS + 1 }, (_, i) => ({
					title: `Column ${i}`,
					links: [{ label: "Link", url: "https://example.com" }],
				}));
				const result = validateSiteBranding({ footer: { columns } });
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("exceeds maximum of 4 columns");
			});

			it("should reject footer column without title", () => {
				const result = validateSiteBranding({
					footer: { columns: [{ title: "", links: [] }] },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("title is required");
			});

			it("should reject copyright exceeding max length", () => {
				const result = validateSiteBranding({
					footer: { copyright: "x".repeat(BRANDING_LIMITS.MAX_COPYRIGHT_LENGTH + 1) },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("copyright exceeds maximum length");
			});

			it("should reject invalid social link URLs", () => {
				const result = validateSiteBranding({
					footer: { socialLinks: { github: "not-a-url" } },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("footer.socialLinks.github must be a valid http/https URL");
			});

			it("should accept valid social links", () => {
				const result = validateSiteBranding({
					footer: {
						socialLinks: {
							github: "https://github.com/example",
							twitter: "https://twitter.com/example",
							discord: "https://discord.gg/example",
							linkedin: "https://linkedin.com/company/example",
							youtube: "https://youtube.com/@example",
						},
					},
				});
				expect(result.isValid).toBe(true);
			});

			it("should allow empty social link URLs", () => {
				const result = validateSiteBranding({
					footer: { socialLinks: { github: "" } },
				});
				expect(result.isValid).toBe(true);
			});

			it("should reject footer link without label", () => {
				const result = validateSiteBranding({
					footer: { columns: [{ title: "Col", links: [{ label: "", url: "https://example.com" }] }] },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("link label is required");
			});

			it("should reject footer link without URL", () => {
				const result = validateSiteBranding({
					footer: { columns: [{ title: "Col", links: [{ label: "Link", url: "" }] }] },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("link URL is required");
			});

			it("should reject too many links in a footer column", () => {
				const links = Array.from({ length: BRANDING_LIMITS.MAX_FOOTER_LINKS_PER_COLUMN + 1 }, (_, i) => ({
					label: `Link ${i}`,
					url: `https://example.com/${i}`,
				}));
				const result = validateSiteBranding({
					footer: { columns: [{ title: "Column", links }] },
				});
				expect(result.isValid).toBe(false);
				expect(result.errors[0]).toContain("exceeds maximum of 10 links");
			});
		});

		describe("multiple errors", () => {
			it("should collect all validation errors", () => {
				const result = validateSiteBranding({
					primaryHue: 500,
					sidebarDefaultCollapseLevel: 10,
					logoUrl: "not-a-url",
					themePreset: "invalid" as "minimal",
				});
				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThanOrEqual(4);
			});
		});
	});

	describe("BRANDING_LIMITS", () => {
		it("should export limits for use in frontend", () => {
			expect(BRANDING_LIMITS.MAX_HEADER_ITEMS).toBe(6);
			expect(BRANDING_LIMITS.MAX_DROPDOWN_ITEMS).toBe(8);
			expect(BRANDING_LIMITS.MAX_FOOTER_COLUMNS).toBe(4);
			expect(BRANDING_LIMITS.MAX_LOGO_LENGTH).toBe(50);
			expect(BRANDING_LIMITS.MIN_PRIMARY_HUE).toBe(0);
			expect(BRANDING_LIMITS.MAX_PRIMARY_HUE).toBe(360);
		});
	});
});
