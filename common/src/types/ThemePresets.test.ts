import type { SiteBranding } from "../core/SiteClient";
import { applyPreset, detectPreset, getDefaultBrandingValues, PRESET_METADATA, THEME_PRESETS } from "./ThemePresets";
import { describe, expect, it } from "vitest";

describe("ThemePresets", () => {
	describe("THEME_PRESETS", () => {
		it("should have all five preset definitions", () => {
			expect(Object.keys(THEME_PRESETS)).toHaveLength(5);
			expect(THEME_PRESETS).toHaveProperty("minimal");
			expect(THEME_PRESETS).toHaveProperty("vibrant");
			expect(THEME_PRESETS).toHaveProperty("terminal");
			expect(THEME_PRESETS).toHaveProperty("friendly");
			expect(THEME_PRESETS).toHaveProperty("noir");
		});

		it("should have valid preset configurations", () => {
			for (const [_name, config] of Object.entries(THEME_PRESETS)) {
				expect(config.primaryHue).toBeGreaterThanOrEqual(0);
				expect(config.primaryHue).toBeLessThanOrEqual(360);
				expect(["inter", "space-grotesk", "ibm-plex", "source-sans"]).toContain(config.fontFamily);
				expect(["github", "dracula", "one-dark", "nord"]).toContain(config.codeTheme);
				expect(["sharp", "subtle", "rounded", "pill"]).toContain(config.borderRadius);
				expect(["compact", "comfortable", "airy"]).toContain(config.spacingDensity);
				expect(["dark", "light", "system"]).toContain(config.defaultTheme);
			}
		});

		it("minimal preset should have expected values", () => {
			const minimal = THEME_PRESETS.minimal;
			expect(minimal.primaryHue).toBe(220);
			expect(minimal.fontFamily).toBe("inter");
			expect(minimal.codeTheme).toBe("github");
			expect(minimal.borderRadius).toBe("subtle");
			expect(minimal.spacingDensity).toBe("comfortable");
			expect(minimal.defaultTheme).toBe("light");
		});

		it("vibrant preset should have expected values", () => {
			const vibrant = THEME_PRESETS.vibrant;
			expect(vibrant.primaryHue).toBe(270);
			expect(vibrant.fontFamily).toBe("space-grotesk");
			expect(vibrant.codeTheme).toBe("dracula");
			expect(vibrant.borderRadius).toBe("rounded");
			expect(vibrant.spacingDensity).toBe("comfortable");
			expect(vibrant.defaultTheme).toBe("dark");
		});

		it("terminal preset should have expected values", () => {
			const terminal = THEME_PRESETS.terminal;
			expect(terminal.primaryHue).toBe(210);
			expect(terminal.fontFamily).toBe("ibm-plex");
			expect(terminal.codeTheme).toBe("one-dark");
			expect(terminal.borderRadius).toBe("sharp");
			expect(terminal.spacingDensity).toBe("compact");
			expect(terminal.defaultTheme).toBe("system");
		});

		it("friendly preset should have expected values", () => {
			const friendly = THEME_PRESETS.friendly;
			expect(friendly.primaryHue).toBe(25);
			expect(friendly.fontFamily).toBe("source-sans");
			expect(friendly.codeTheme).toBe("github");
			expect(friendly.borderRadius).toBe("pill");
			expect(friendly.spacingDensity).toBe("airy");
			expect(friendly.defaultTheme).toBe("light");
		});

		it("noir preset should have expected values", () => {
			const noir = THEME_PRESETS.noir;
			expect(noir.primaryHue).toBe(160);
			expect(noir.fontFamily).toBe("inter");
			expect(noir.codeTheme).toBe("nord");
			expect(noir.borderRadius).toBe("rounded");
			expect(noir.spacingDensity).toBe("comfortable");
			expect(noir.defaultTheme).toBe("dark");
		});
	});

	describe("PRESET_METADATA", () => {
		it("should have metadata for all presets", () => {
			expect(Object.keys(PRESET_METADATA)).toHaveLength(5);
			expect(PRESET_METADATA).toHaveProperty("minimal");
			expect(PRESET_METADATA).toHaveProperty("vibrant");
			expect(PRESET_METADATA).toHaveProperty("terminal");
			expect(PRESET_METADATA).toHaveProperty("friendly");
			expect(PRESET_METADATA).toHaveProperty("noir");
		});

		it("should have label and description for each preset", () => {
			for (const [_name, meta] of Object.entries(PRESET_METADATA)) {
				expect(meta.label).toBeDefined();
				expect(meta.label.length).toBeGreaterThan(0);
				expect(meta.description).toBeDefined();
				expect(meta.description.length).toBeGreaterThan(0);
			}
		});
	});

	describe("applyPreset", () => {
		it("should return branding values for minimal preset", () => {
			const result = applyPreset("minimal");
			expect(result.themePreset).toBe("minimal");
			expect(result.primaryHue).toBe(220);
			expect(result.fontFamily).toBe("inter");
			expect(result.codeTheme).toBe("github");
			expect(result.borderRadius).toBe("subtle");
			expect(result.spacingDensity).toBe("comfortable");
			expect(result.defaultTheme).toBe("light");
		});

		it("should return branding values for vibrant preset", () => {
			const result = applyPreset("vibrant");
			expect(result.themePreset).toBe("vibrant");
			expect(result.primaryHue).toBe(270);
			expect(result.fontFamily).toBe("space-grotesk");
			expect(result.codeTheme).toBe("dracula");
		});

		it("should return branding values for terminal preset", () => {
			const result = applyPreset("terminal");
			expect(result.themePreset).toBe("terminal");
			expect(result.fontFamily).toBe("ibm-plex");
			expect(result.codeTheme).toBe("one-dark");
		});

		it("should return branding values for friendly preset", () => {
			const result = applyPreset("friendly");
			expect(result.themePreset).toBe("friendly");
			expect(result.fontFamily).toBe("source-sans");
			expect(result.borderRadius).toBe("pill");
		});

		it("should return branding values for noir preset", () => {
			const result = applyPreset("noir");
			expect(result.themePreset).toBe("noir");
			expect(result.codeTheme).toBe("nord");
			expect(result.defaultTheme).toBe("dark");
		});
	});

	describe("detectPreset", () => {
		it("should detect minimal preset when all values match", () => {
			const branding: SiteBranding = {
				primaryHue: 220,
				fontFamily: "inter",
				codeTheme: "github",
				borderRadius: "subtle",
				spacingDensity: "comfortable",
				defaultTheme: "light",
			};
			expect(detectPreset(branding)).toBe("minimal");
		});

		it("should detect vibrant preset when all values match", () => {
			const branding: SiteBranding = {
				primaryHue: 270,
				fontFamily: "space-grotesk",
				codeTheme: "dracula",
				borderRadius: "rounded",
				spacingDensity: "comfortable",
				defaultTheme: "dark",
			};
			expect(detectPreset(branding)).toBe("vibrant");
		});

		it("should detect terminal preset when all values match", () => {
			const branding: SiteBranding = {
				primaryHue: 210,
				fontFamily: "ibm-plex",
				codeTheme: "one-dark",
				borderRadius: "sharp",
				spacingDensity: "compact",
				defaultTheme: "system",
			};
			expect(detectPreset(branding)).toBe("terminal");
		});

		it("should detect friendly preset when all values match", () => {
			const branding: SiteBranding = {
				primaryHue: 25,
				fontFamily: "source-sans",
				codeTheme: "github",
				borderRadius: "pill",
				spacingDensity: "airy",
				defaultTheme: "light",
			};
			expect(detectPreset(branding)).toBe("friendly");
		});

		it("should detect noir preset when all values match", () => {
			const branding: SiteBranding = {
				primaryHue: 160,
				fontFamily: "inter",
				codeTheme: "nord",
				borderRadius: "rounded",
				spacingDensity: "comfortable",
				defaultTheme: "dark",
			};
			expect(detectPreset(branding)).toBe("noir");
		});

		it("should return custom when no preset matches", () => {
			const branding: SiteBranding = {
				primaryHue: 100,
				fontFamily: "inter",
				codeTheme: "github",
				borderRadius: "subtle",
				spacingDensity: "comfortable",
				defaultTheme: "light",
			};
			expect(detectPreset(branding)).toBe("custom");
		});

		it("should return custom when only one value differs", () => {
			// Like minimal but with different hue
			const branding: SiteBranding = {
				primaryHue: 221, // Different from minimal's 220
				fontFamily: "inter",
				codeTheme: "github",
				borderRadius: "subtle",
				spacingDensity: "comfortable",
				defaultTheme: "light",
			};
			expect(detectPreset(branding)).toBe("custom");
		});

		it("should return custom for empty branding", () => {
			const branding: SiteBranding = {};
			expect(detectPreset(branding)).toBe("custom");
		});

		it("should return custom when branding has extra properties", () => {
			// Matches minimal but has extra properties - should still match
			const branding: SiteBranding = {
				primaryHue: 220,
				fontFamily: "inter",
				codeTheme: "github",
				borderRadius: "subtle",
				spacingDensity: "comfortable",
				defaultTheme: "light",
				logo: "My Logo", // Extra property
			};
			expect(detectPreset(branding)).toBe("minimal");
		});
	});

	describe("getDefaultBrandingValues", () => {
		it("should return default values", () => {
			const defaults = getDefaultBrandingValues();
			expect(defaults.primaryHue).toBe(212);
			expect(defaults.fontFamily).toBe("inter");
			expect(defaults.codeTheme).toBe("github");
			expect(defaults.borderRadius).toBe("subtle");
			expect(defaults.spacingDensity).toBe("comfortable");
			expect(defaults.defaultTheme).toBe("system");
		});

		it("should return consistent values on multiple calls", () => {
			const first = getDefaultBrandingValues();
			const second = getDefaultBrandingValues();
			expect(first).toEqual(second);
		});
	});
});
