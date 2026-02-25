/**
 * Theme preset definitions and helper functions for site branding.
 * Presets bundle together styling properties for common design patterns.
 */
import type {
	BorderRadius,
	CodeTheme,
	FontFamily,
	SiteBranding,
	SpacingDensity,
	ThemePreset,
} from "../core/SiteClient";

/**
 * Configuration values for a theme preset
 */
export interface PresetConfig {
	primaryHue: number;
	fontFamily: FontFamily;
	codeTheme: CodeTheme;
	borderRadius: BorderRadius;
	spacingDensity: SpacingDensity;
	defaultTheme: "dark" | "light" | "system";
}

/**
 * Theme preset definitions.
 * Each preset bundles design properties for a cohesive look.
 */
export const THEME_PRESETS: Record<Exclude<ThemePreset, "custom">, PresetConfig> = {
	minimal: {
		primaryHue: 220,
		fontFamily: "inter",
		codeTheme: "github",
		borderRadius: "subtle",
		spacingDensity: "comfortable",
		defaultTheme: "light",
	},
	vibrant: {
		primaryHue: 270,
		fontFamily: "space-grotesk",
		codeTheme: "dracula",
		borderRadius: "rounded",
		spacingDensity: "comfortable",
		defaultTheme: "dark",
	},
	terminal: {
		primaryHue: 210,
		fontFamily: "ibm-plex",
		codeTheme: "one-dark",
		borderRadius: "sharp",
		spacingDensity: "compact",
		defaultTheme: "system",
	},
	friendly: {
		primaryHue: 25,
		fontFamily: "source-sans",
		codeTheme: "github",
		borderRadius: "pill",
		spacingDensity: "airy",
		defaultTheme: "light",
	},
	noir: {
		primaryHue: 160,
		fontFamily: "inter",
		codeTheme: "nord",
		borderRadius: "rounded",
		spacingDensity: "comfortable",
		defaultTheme: "dark",
	},
};

/**
 * Preset metadata for UI display
 */
export const PRESET_METADATA: Record<Exclude<ThemePreset, "custom">, { label: string; description: string }> = {
	minimal: { label: "Minimal", description: "Clean and professional" },
	vibrant: { label: "Vibrant", description: "Bold and energetic" },
	terminal: { label: "Terminal", description: "Developer-first" },
	friendly: { label: "Friendly", description: "Warm and approachable" },
	noir: { label: "Noir", description: "Sleek and premium" },
};

/**
 * Applies a preset's values to create branding configuration.
 * @param preset The preset name to apply
 * @returns Partial SiteBranding with all preset values set
 */
export function applyPreset(preset: Exclude<ThemePreset, "custom">): Partial<SiteBranding> {
	const config = THEME_PRESETS[preset];
	return {
		themePreset: preset,
		primaryHue: config.primaryHue,
		fontFamily: config.fontFamily,
		codeTheme: config.codeTheme,
		borderRadius: config.borderRadius,
		spacingDensity: config.spacingDensity,
		defaultTheme: config.defaultTheme,
	};
}

/**
 * Detects if current branding matches a preset exactly.
 * @param branding Current branding configuration
 * @returns The matching preset name, or "custom" if no match
 */
export function detectPreset(branding: SiteBranding): ThemePreset {
	for (const [name, config] of Object.entries(THEME_PRESETS) as Array<
		[Exclude<ThemePreset, "custom">, PresetConfig]
	>) {
		if (
			branding.primaryHue === config.primaryHue &&
			branding.fontFamily === config.fontFamily &&
			branding.codeTheme === config.codeTheme &&
			branding.borderRadius === config.borderRadius &&
			branding.spacingDensity === config.spacingDensity &&
			branding.defaultTheme === config.defaultTheme
		) {
			return name;
		}
	}
	return "custom";
}

/**
 * Gets the default values used when no branding is configured.
 * These are sensible defaults for new sites, using system theme preference
 * and a neutral blue accent (212). Note: These differ slightly from the
 * "minimal" preset which uses a lighter blue (220) and forces light theme.
 */
export function getDefaultBrandingValues(): Partial<SiteBranding> {
	return {
		primaryHue: 212,
		fontFamily: "inter",
		codeTheme: "github",
		borderRadius: "subtle",
		spacingDensity: "comfortable",
		defaultTheme: "system",
		pageWidth: "wide",
		contentWidth: "standard",
		sidebarWidth: "standard",
		tocWidth: "standard",
		headerAlignment: "right",
	};
}
