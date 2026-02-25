/**
 * Style customization section including color, typography, code blocks, and appearance.
 */

import { COLOR_PRESETS, FONT_FAMILIES, GOOGLE_FONT_URLS } from "./BrandingTypes";
import { CollapsibleSection, SegmentedControl } from "./FormComponents";
import type { BorderRadius, CodeTheme, FontFamily, SiteBranding, SpacingDensity } from "jolli-common";
import { Palette } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";

interface StyleSectionProps {
	branding: SiteBranding;
	expanded: boolean;
	onToggle: () => void;
	isActive: boolean;
	currentHue: number;
	onUpdateThemeField: <K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) => void;
	content: {
		customizeTitle: ReactNode;
		colorTitle: ReactNode;
		typographyTitle: ReactNode;
		codeBlocksTitle: ReactNode;
		appearanceTitle: ReactNode;
		borderRadiusLabel: ReactNode;
		spacingLabel: ReactNode;
		themeTitle: ReactNode;
		themeSystem: ReactNode;
		themeLight: ReactNode;
		themeDark: ReactNode;
	};
}

/**
 * Style customization section with all appearance controls
 */
export function StyleSection({
	branding,
	expanded,
	onToggle,
	isActive,
	currentHue,
	onUpdateThemeField,
	content,
}: StyleSectionProps): ReactElement {
	return (
		<CollapsibleSection
			title={content.customizeTitle}
			icon={<Palette className="h-4 w-4" />}
			expanded={expanded}
			onToggle={onToggle}
			data-testid="style-section"
		>
			<div className="space-y-4">
				{/* Accent Color */}
				<div data-testid="color-section">
					<label className="text-[12px] font-medium text-foreground mb-2 block">{content.colorTitle}</label>
					<div className="flex flex-wrap gap-1.5 mb-2">
						{COLOR_PRESETS.map(preset => (
							<button
								type="button"
								key={preset.name}
								onClick={() => onUpdateThemeField("primaryHue", preset.hue)}
								disabled={!isActive}
								className={`w-6 h-6 rounded-md transition-all disabled:opacity-50 ${
									currentHue === preset.hue
										? "ring-2 ring-offset-1 ring-offset-background ring-foreground/40 scale-110"
										: "hover:scale-105 ring-1 ring-black/10"
								}`}
								style={{ backgroundColor: `hsl(${preset.hue}, 70%, 50%)` }}
								title={preset.name}
								data-testid={`preset-${preset.name.toLowerCase()}`}
							/>
						))}
					</div>
					<div className="flex items-center gap-2">
						<input
							type="range"
							min="0"
							max="360"
							value={currentHue}
							onChange={e => onUpdateThemeField("primaryHue", Number.parseInt(e.target.value, 10))}
							disabled={!isActive}
							className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed"
							style={{
								background: `linear-gradient(to right, hsl(0,70%,50%), hsl(60,70%,50%), hsl(120,70%,50%), hsl(180,70%,50%), hsl(240,70%,50%), hsl(300,70%,50%), hsl(360,70%,50%))`,
							}}
							data-testid="primary-hue-slider"
						/>
						<div className="flex items-center">
							<input
								type="number"
								min="0"
								max="360"
								value={currentHue}
								onChange={e => {
									const val = Number.parseInt(e.target.value, 10);
									if (!Number.isNaN(val)) {
										onUpdateThemeField("primaryHue", Math.max(0, Math.min(360, val)));
									}
								}}
								disabled={!isActive}
								className="w-10 h-6 text-[10px] text-center tabular-nums border border-border rounded px-1 bg-background disabled:opacity-50"
								data-testid="primary-hue-input"
							/>
							<span className="text-[10px] text-muted-foreground ml-0.5">°</span>
						</div>
					</div>
				</div>

				{/* Typography */}
				<div data-testid="typography-section">
					<label className="text-[12px] font-medium text-foreground mb-2 block">
						{content.typographyTitle}
					</label>
					<FontFamilySelector
						value={branding.fontFamily || "inter"}
						onChange={v => onUpdateThemeField("fontFamily", v)}
						disabled={!isActive}
					/>
				</div>

				{/* Code Theme */}
				<div data-testid="code-blocks-section">
					<label className="text-[12px] font-medium text-foreground mb-2 block">
						{content.codeBlocksTitle}
					</label>
					<CodeThemeSelector
						value={branding.codeTheme || "github"}
						onChange={v => onUpdateThemeField("codeTheme", v)}
						disabled={!isActive}
					/>
				</div>

				{/* Appearance */}
				<div data-testid="appearance-section">
					<label className="text-[12px] font-medium text-foreground mb-2 block">
						{content.appearanceTitle}
					</label>
					<div className="space-y-3">
						<div>
							<span className="text-[11px] text-muted-foreground">{content.borderRadiusLabel}</span>
							<BorderRadiusSelector
								value={branding.borderRadius || "subtle"}
								onChange={v => onUpdateThemeField("borderRadius", v)}
								disabled={!isActive}
								hue={currentHue}
							/>
						</div>
						<div>
							<span className="text-[11px] text-muted-foreground">{content.spacingLabel}</span>
							<SpacingSelector
								value={branding.spacingDensity || "comfortable"}
								onChange={v => onUpdateThemeField("spacingDensity", v)}
								disabled={!isActive}
							/>
						</div>
					</div>
				</div>

				{/* Default Theme */}
				<div data-testid="theme-section">
					<label className="text-[12px] font-medium text-foreground mb-2 block">{content.themeTitle}</label>
					<SegmentedControl
						options={[
							{ value: "system", label: <>{content.themeSystem}</> },
							{ value: "light", label: <>{content.themeLight}</> },
							{ value: "dark", label: <>{content.themeDark}</> },
						]}
						value={branding.defaultTheme || "system"}
						onChange={v => onUpdateThemeField("defaultTheme", v as "system" | "light" | "dark")}
						disabled={!isActive}
						testIdPrefix="theme"
					/>
				</div>
			</div>
		</CollapsibleSection>
	);
}

/**
 * Font family selector with actual Google Fonts preview
 */
function FontFamilySelector({
	value,
	onChange,
	disabled,
}: {
	value: FontFamily;
	onChange: (v: FontFamily) => void;
	disabled?: boolean;
}): ReactElement {
	const [fontsLoaded, setFontsLoaded] = useState(false);

	// Load Google Fonts on mount
	useEffect(() => {
		const existingLinks = document.querySelectorAll("link[data-font-preview]");
		if (existingLinks.length > 0) {
			setFontsLoaded(true);
			return;
		}

		const fragment = document.createDocumentFragment();
		for (const url of Object.values(GOOGLE_FONT_URLS)) {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = url;
			link.setAttribute("data-font-preview", "true");
			fragment.appendChild(link);
		}
		document.head.appendChild(fragment);

		// Mark as loaded after a short delay to allow fonts to load
		const timer = setTimeout(() => setFontsLoaded(true), 100);
		return () => clearTimeout(timer);
	}, []);

	const fonts: Array<{ key: FontFamily; label: string; desc: string }> = [
		{ key: "inter", label: "Inter", desc: "Clean & neutral" },
		{ key: "space-grotesk", label: "Space Grotesk", desc: "Bold & technical" },
		{ key: "ibm-plex", label: "IBM Plex Sans", desc: "Developer-friendly" },
		{ key: "source-sans", label: "Source Sans", desc: "Warm & readable" },
	];

	return (
		<div className="grid grid-cols-2 gap-2">
			{fonts.map(font => (
				<button
					key={font.key}
					type="button"
					onClick={() => onChange(font.key)}
					disabled={disabled}
					className={`p-2.5 rounded-lg border text-left transition-all ${
						value === font.key
							? "border-foreground/30 bg-muted/50 ring-1 ring-foreground/20"
							: "border-border/50 hover:border-border hover:bg-muted/30"
					} disabled:opacity-50 disabled:cursor-not-allowed`}
					data-testid={`font-${font.key}`}
				>
					<div
						className="text-[14px] font-semibold leading-tight"
						style={{ fontFamily: fontsLoaded ? FONT_FAMILIES[font.key] : undefined }}
					>
						{font.label}
					</div>
					<div className="text-[10px] text-muted-foreground mt-0.5">{font.desc}</div>
				</button>
			))}
		</div>
	);
}

/**
 * Code theme selector with visual preview swatches
 */
function CodeThemeSelector({
	value,
	onChange,
	disabled,
}: {
	value: CodeTheme;
	onChange: (v: CodeTheme) => void;
	disabled?: boolean;
}): ReactElement {
	// Theme color palettes (approximations)
	const themes: Array<{ key: CodeTheme; label: string; bg: string; colors: Array<string> }> = [
		{ key: "github", label: "GitHub", bg: "#f6f8fa", colors: ["#24292e", "#d73a49", "#6f42c1", "#22863a"] },
		{ key: "dracula", label: "Dracula", bg: "#282a36", colors: ["#f8f8f2", "#ff79c6", "#bd93f9", "#50fa7b"] },
		{ key: "one-dark", label: "One Dark", bg: "#282c34", colors: ["#abb2bf", "#e06c75", "#c678dd", "#98c379"] },
		{ key: "nord", label: "Nord", bg: "#2e3440", colors: ["#d8dee9", "#bf616a", "#b48ead", "#a3be8c"] },
	];

	return (
		<div className="grid grid-cols-4 gap-1.5">
			{themes.map(theme => (
				<button
					key={theme.key}
					type="button"
					onClick={() => onChange(theme.key)}
					disabled={disabled}
					className={`p-2 rounded-lg border text-center transition-all ${
						value === theme.key
							? "border-foreground/30 bg-muted/50 ring-1 ring-foreground/20"
							: "border-border/50 hover:border-border hover:bg-muted/30"
					} disabled:opacity-50 disabled:cursor-not-allowed`}
					data-testid={`code-theme-${theme.key}`}
				>
					<div
						className="h-6 rounded mb-1.5 flex items-center justify-center gap-0.5 px-1"
						style={{ backgroundColor: theme.bg }}
					>
						{theme.colors.map((color, i) => (
							<div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
						))}
					</div>
					<div className="text-[10px] text-muted-foreground truncate">{theme.label}</div>
				</button>
			))}
		</div>
	);
}

/**
 * Border radius selector with visual preview
 */
function BorderRadiusSelector({
	value,
	onChange,
	disabled,
	hue,
}: {
	value: BorderRadius;
	onChange: (v: BorderRadius) => void;
	disabled?: boolean;
	hue: number;
}): ReactElement {
	const options: Array<{ key: BorderRadius; label: string; radius: string }> = [
		{ key: "sharp", label: "Sharp", radius: "2px" },
		{ key: "subtle", label: "Subtle", radius: "4px" },
		{ key: "rounded", label: "Rounded", radius: "8px" },
		{ key: "pill", label: "Pill", radius: "12px" },
	];

	const color = `hsl(${hue}, 70%, 50%)`;

	return (
		<div className="grid grid-cols-4 gap-1.5">
			{options.map(opt => (
				<button
					key={opt.key}
					type="button"
					onClick={() => onChange(opt.key)}
					disabled={disabled}
					className={`p-2 rounded-lg border text-center transition-all ${
						value === opt.key
							? "border-foreground/30 bg-muted/50 ring-1 ring-foreground/20"
							: "border-border/50 hover:border-border hover:bg-muted/30"
					} disabled:opacity-50 disabled:cursor-not-allowed`}
					data-testid={`border-radius-${opt.key}`}
				>
					<div className="h-6 flex items-center justify-center mb-1.5">
						<div className="w-10 h-5" style={{ backgroundColor: color, borderRadius: opt.radius }} />
					</div>
					<div className="text-[10px] text-muted-foreground">{opt.label}</div>
				</button>
			))}
		</div>
	);
}

/**
 * Spacing density selector with visual preview
 */
function SpacingSelector({
	value,
	onChange,
	disabled,
}: {
	value: SpacingDensity;
	onChange: (v: SpacingDensity) => void;
	disabled?: boolean;
}): ReactElement {
	const options: Array<{ key: SpacingDensity; label: string; gap: string }> = [
		{ key: "compact", label: "Compact", gap: "2px" },
		{ key: "comfortable", label: "Comfortable", gap: "4px" },
		{ key: "airy", label: "Airy", gap: "6px" },
	];

	return (
		<div className="grid grid-cols-3 gap-1.5">
			{options.map(opt => (
				<button
					key={opt.key}
					type="button"
					onClick={() => onChange(opt.key)}
					disabled={disabled}
					className={`p-2 rounded-lg border text-center transition-all ${
						value === opt.key
							? "border-foreground/30 bg-muted/50 ring-1 ring-foreground/20"
							: "border-border/50 hover:border-border hover:bg-muted/30"
					} disabled:opacity-50 disabled:cursor-not-allowed`}
					data-testid={`spacing-${opt.key}`}
				>
					<div className="h-8 flex flex-col items-center justify-center" style={{ gap: opt.gap }}>
						<div className="w-10 h-1.5 bg-muted-foreground/30 rounded-sm" />
						<div className="w-8 h-1.5 bg-muted-foreground/20 rounded-sm" />
						<div className="w-10 h-1.5 bg-muted-foreground/30 rounded-sm" />
					</div>
					<div className="text-[10px] text-muted-foreground mt-1">{opt.label}</div>
				</button>
			))}
		</div>
	);
}
