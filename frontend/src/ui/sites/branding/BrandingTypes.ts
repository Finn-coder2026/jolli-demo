/**
 * Shared types, constants, and helper functions for the branding tab.
 */
import { type BorderRadius, type CodeTheme, FONT_CONFIG, type FontFamily, type SpacingDensity } from "jolli-common";

/**
 * Color presets for quick selection
 */
export const COLOR_PRESETS = [
	{ name: "Blue", hue: 212 },
	{ name: "Purple", hue: 270 },
	{ name: "Green", hue: 142 },
	{ name: "Orange", hue: 30 },
	{ name: "Red", hue: 0 },
	{ name: "Teal", hue: 180 },
	{ name: "Pink", hue: 330 },
	{ name: "Cyan", hue: 195 },
];

/**
 * Google Font CSS URLs for font preview.
 * Derived from centralized FONT_CONFIG in jolli-common.
 */
export const GOOGLE_FONT_URLS: Record<FontFamily, string> = {
	inter: FONT_CONFIG.inter.url,
	"space-grotesk": FONT_CONFIG["space-grotesk"].url,
	"ibm-plex": FONT_CONFIG["ibm-plex"].url,
	"source-sans": FONT_CONFIG["source-sans"].url,
};

/**
 * CSS font-family values for each option.
 * Derived from centralized FONT_CONFIG in jolli-common.
 */
export const FONT_FAMILIES: Record<FontFamily, string> = {
	inter: FONT_CONFIG.inter.cssFamily,
	"space-grotesk": FONT_CONFIG["space-grotesk"].cssFamily,
	"ibm-plex": FONT_CONFIG["ibm-plex"].cssFamily,
	"source-sans": FONT_CONFIG["source-sans"].cssFamily,
};

/**
 * Spacing values for preview (gap and padding for list items)
 */
export const PREVIEW_SPACING: Record<SpacingDensity, { gap: string; padding: string }> = {
	compact: { gap: "4px", padding: "6px" },
	comfortable: { gap: "8px", padding: "10px" },
	airy: { gap: "12px", padding: "14px" },
};

/**
 * Helper to get border radius CSS value
 */
export function getRadiusValue(borderRadius: BorderRadius | undefined): string {
	const radiusMap: Record<BorderRadius, string> = {
		sharp: "2px",
		subtle: "4px",
		rounded: "8px",
		pill: "12px",
	};
	return radiusMap[borderRadius || "subtle"];
}

/**
 * Helper to get font family CSS value.
 * Uses the centralized FONT_FAMILIES derived from FONT_CONFIG.
 */
export function getFontFamilyValue(fontFamily: FontFamily | undefined): string {
	return FONT_FAMILIES[fontFamily || "inter"];
}

/**
 * Helper to get code theme colors
 */
export function getCodeThemeColors(codeTheme: CodeTheme | undefined, isDark: boolean) {
	const themes: Record<CodeTheme, { bg: string; fg: string; keyword: string; string: string; comment: string }> = {
		github: {
			bg: isDark ? "#1e1e1e" : "#f6f8fa",
			fg: isDark ? "#e5e5e5" : "#24292e",
			keyword: "#d73a49",
			string: "#22863a",
			comment: "#6a737d",
		},
		dracula: { bg: "#282a36", fg: "#f8f8f2", keyword: "#ff79c6", string: "#50fa7b", comment: "#6272a4" },
		"one-dark": { bg: "#282c34", fg: "#abb2bf", keyword: "#c678dd", string: "#98c379", comment: "#5c6370" },
		nord: { bg: "#2e3440", fg: "#d8dee9", keyword: "#81a1c1", string: "#a3be8c", comment: "#616e88" },
	};
	return themes[codeTheme || "github"];
}
