/**
 * Live preview component showing a visual representation of branding settings.
 */

import { getCodeThemeColors, getFontFamilyValue, getRadiusValue, PREVIEW_SPACING } from "./BrandingTypes";
import type { SiteBranding } from "jolli-common";
import type { ReactElement } from "react";

interface LivePreviewProps {
	branding: SiteBranding;
}

/**
 * Style preview showing focused samples of each branding setting.
 * Fonts are loaded by the parent component and render when ready.
 */
export function LivePreview({ branding }: LivePreviewProps): ReactElement {
	const hue = branding.primaryHue ?? 212;
	const isDark = branding.defaultTheme === "dark";
	const radius = getRadiusValue(branding.borderRadius);
	const fontFamily = getFontFamilyValue(branding.fontFamily);
	const codeColors = getCodeThemeColors(branding.codeTheme, isDark);
	const selectedFont = branding.fontFamily || "inter";
	const spacingDensity = branding.spacingDensity || "comfortable";
	const spacing = PREVIEW_SPACING[spacingDensity];

	// Color palette
	const accent = `hsl(${hue}, 70%, ${isDark ? "60%" : "45%"})`;
	const accentBg = `hsl(${hue}, 70%, ${isDark ? "15%" : "95%"})`;
	const bg = isDark ? "#0a0a0a" : "#ffffff";
	const fg = isDark ? "#fafafa" : "#0a0a0a";
	const muted = isDark ? "#262626" : "#f5f5f5";
	const mutedFg = isDark ? "#a3a3a3" : "#737373";
	const border = isDark ? "#333" : "#e5e5e5";

	return (
		<div
			className="rounded-xl border overflow-hidden"
			style={{ backgroundColor: bg, borderColor: border, fontFamily }}
			data-testid="live-preview"
		>
			{/* Header */}
			<div
				className="px-4 py-2.5 border-b flex items-center justify-between"
				style={{ borderColor: border, backgroundColor: muted }}
			>
				<span className="text-[11px] font-medium" style={{ color: mutedFg }}>
					Style Preview
				</span>
				<span
					className="text-[10px] px-2 py-0.5 rounded"
					style={{ backgroundColor: isDark ? "#333" : "#e5e5e5", color: mutedFg }}
				>
					{isDark ? "Dark" : "Light"}
				</span>
			</div>

			<div className="p-4 space-y-4">
				{/* Typography - now shows font name */}
				<div>
					<div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: mutedFg }}>
						Typography ({selectedFont.replace("-", " ")})
					</div>
					<h3 className="text-base font-bold mb-1" style={{ color: fg, fontFamily }}>
						Documentation Title
					</h3>
					<p className="text-[12px] leading-relaxed" style={{ color: mutedFg, fontFamily }}>
						This is body text in your chosen font. It should be easy to read and scan quickly.
					</p>
				</div>

				{/* Colors */}
				<div>
					<div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: mutedFg }}>
						Colors
					</div>
					<div className="flex items-center gap-2 flex-wrap">
						<button
							className="px-3 py-1.5 text-[11px] font-medium text-white"
							style={{ backgroundColor: accent, borderRadius: radius, fontFamily }}
						>
							Primary Button
						</button>
						<button
							className="px-3 py-1.5 text-[11px] font-medium border"
							style={{ borderColor: border, color: fg, borderRadius: radius, fontFamily }}
						>
							Secondary
						</button>
						<a
							href="#"
							onClick={e => e.preventDefault()}
							className="text-[11px] underline underline-offset-2"
							style={{ color: accent, fontFamily }}
						>
							Link text
						</a>
						<span
							className="px-2 py-0.5 text-[10px] font-medium"
							style={{ backgroundColor: accentBg, color: accent, borderRadius: radius, fontFamily }}
						>
							Badge
						</span>
					</div>
				</div>

				{/* Code Block */}
				<div>
					<div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: mutedFg }}>
						Code Block
					</div>
					<div
						className="p-3 text-[11px] font-mono leading-relaxed overflow-x-auto"
						style={{ backgroundColor: codeColors.bg, color: codeColors.fg, borderRadius: radius }}
					>
						<div>
							<span style={{ color: codeColors.keyword }}>npm</span>{" "}
							<span style={{ color: codeColors.string }}>install</span>{" "}
							<span style={{ color: codeColors.fg }}>@jolli/docs</span>
						</div>
						<div className="mt-1">
							<span style={{ color: codeColors.keyword }}>import</span>{" "}
							<span style={{ color: codeColors.fg }}>{"{ Docs }"}</span>{" "}
							<span style={{ color: codeColors.keyword }}>from</span>{" "}
							<span style={{ color: codeColors.string }}>'@jolli/docs'</span>
						</div>
					</div>
				</div>

				{/* Spacing - shows actual list with varying gaps */}
				<div>
					<div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: mutedFg }}>
						Spacing ({spacingDensity})
					</div>
					<div
						className="rounded border"
						style={{ borderColor: border, backgroundColor: muted, padding: spacing.padding }}
					>
						<div style={{ display: "flex", flexDirection: "column", gap: spacing.gap }}>
							{["Introduction", "Getting Started", "API Reference"].map((item, i) => (
								<div
									key={item}
									className="text-[11px] rounded flex items-center"
									style={{
										backgroundColor: bg,
										padding: spacing.padding,
										color: i === 0 ? accent : fg,
										borderRadius: radius,
										fontFamily,
									}}
								>
									<span
										className="w-1 h-3 rounded-full mr-2"
										style={{ backgroundColor: i === 0 ? accent : "transparent" }}
									/>
									{item}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
