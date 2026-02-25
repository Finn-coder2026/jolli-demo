/**
 * Theme preset selection section.
 */
import type { FontFamily, ThemePreset } from "jolli-common";
import { PRESET_METADATA, THEME_PRESETS } from "jolli-common";
import { Palette, Settings2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

interface PresetSectionProps {
	currentPreset: ThemePreset;
	isActive: boolean;
	onPresetSelect: (preset: Exclude<ThemePreset, "custom">) => void;
	content: {
		presetTitle: ReactNode;
		presetHint: ReactNode;
		presetCustom: ReactNode;
		[key: string]: ReactNode;
	};
}

/**
 * Theme preset selection grid with visual previews
 */
export function PresetSection({ currentPreset, isActive, onPresetSelect, content }: PresetSectionProps): ReactElement {
	return (
		<div className="rounded-xl border border-border/60 bg-card overflow-hidden" data-testid="preset-section">
			<div className="px-4 py-3 border-b border-border/40 bg-muted/20">
				<h3 className="text-sm font-semibold flex items-center gap-2">
					<Palette className="h-4 w-4 text-muted-foreground" />
					{content.presetTitle}
				</h3>
				<p className="text-[11px] text-muted-foreground mt-0.5">{content.presetHint}</p>
			</div>
			<div className="p-3 grid grid-cols-2 gap-2">
				{(Object.keys(THEME_PRESETS) as Array<Exclude<ThemePreset, "custom">>).map(preset => {
					const meta = PRESET_METADATA[preset];
					const presetConfig = THEME_PRESETS[preset];
					const isSelected = currentPreset === preset;
					const contentKey =
						`preset${preset.charAt(0).toUpperCase()}${preset.slice(1)}` as keyof typeof content;
					const descKey =
						`preset${preset.charAt(0).toUpperCase()}${preset.slice(1)}Desc` as keyof typeof content;
					return (
						<button
							key={preset}
							type="button"
							onClick={() => onPresetSelect(preset)}
							disabled={!isActive}
							className={`relative rounded-lg border overflow-hidden text-left transition-all ${
								isSelected
									? "border-foreground/40 ring-2 ring-foreground/20"
									: "border-border/50 hover:border-border"
							} disabled:opacity-50 disabled:cursor-not-allowed`}
							data-testid={`preset-${preset}`}
						>
							<PresetMiniSite config={presetConfig} />
							<div className="px-2.5 py-2 bg-background">
								{/* Fallback to meta.label only if intlayer content missing (defensive) */}
								{/* c8 ignore next */}
								<div className="text-[12px] font-medium leading-tight">
									{content[contentKey] ?? meta.label}
								</div>
								{/* c8 ignore next */}
								<div className="text-[10px] text-muted-foreground leading-tight">
									{content[descKey] ?? meta.description}
								</div>
							</div>
						</button>
					);
				})}
				<button
					type="button"
					disabled={!isActive}
					className={`relative rounded-lg border overflow-hidden text-left transition-all ${
						currentPreset === "custom"
							? "border-foreground/40 ring-2 ring-foreground/20"
							: "border-border/50 hover:border-border"
					} disabled:opacity-50 disabled:cursor-not-allowed`}
					data-testid="preset-custom"
				>
					<div className="h-16 bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center">
						<Settings2 className="h-5 w-5 text-muted-foreground/50" />
					</div>
					<div className="px-2.5 py-2 bg-background">
						<div className="text-[12px] font-medium leading-tight">{content.presetCustom}</div>
						<div className="text-[10px] text-muted-foreground leading-tight">Mix and match</div>
					</div>
				</button>
			</div>
		</div>
	);
}

/**
 * Mini site preview for theme presets - shows a tiny representation of the theme
 */
function PresetMiniSite({
	config,
}: {
	config: { primaryHue: number; defaultTheme?: "light" | "dark" | "system"; fontFamily?: FontFamily };
}): ReactElement {
	const isDark = config.defaultTheme === "dark";
	const bg = isDark ? "#1a1a1a" : "#ffffff";
	const fg = isDark ? "#e5e5e5" : "#1a1a1a";
	const mutedBg = isDark ? "#2a2a2a" : "#f5f5f5";
	const accent = `hsl(${config.primaryHue}, 70%, ${isDark ? "60%" : "45%"})`;

	return (
		<div className="h-16 overflow-hidden" style={{ backgroundColor: bg }}>
			{/* Mini header */}
			<div className="h-4 flex items-center px-1.5 border-b" style={{ borderColor: isDark ? "#333" : "#eee" }}>
				<div className="w-8 h-1.5 rounded-sm" style={{ backgroundColor: accent }} />
				<div className="ml-auto flex gap-0.5">
					<div className="w-4 h-1 rounded-sm" style={{ backgroundColor: mutedBg }} />
					<div className="w-4 h-1 rounded-sm" style={{ backgroundColor: mutedBg }} />
				</div>
			</div>
			{/* Mini content area */}
			<div className="flex h-12">
				{/* Mini sidebar */}
				<div
					className="w-6 p-1 border-r"
					style={{ borderColor: isDark ? "#333" : "#eee", backgroundColor: mutedBg }}
				>
					<div className="w-full h-1 rounded-sm mb-0.5" style={{ backgroundColor: accent, opacity: 0.7 }} />
					<div className="w-3/4 h-1 rounded-sm mb-0.5" style={{ backgroundColor: fg, opacity: 0.2 }} />
					<div className="w-full h-1 rounded-sm" style={{ backgroundColor: fg, opacity: 0.15 }} />
				</div>
				{/* Mini main content */}
				<div className="flex-1 p-1.5">
					<div className="w-2/3 h-1.5 rounded-sm mb-1" style={{ backgroundColor: fg, opacity: 0.8 }} />
					<div className="w-full h-1 rounded-sm mb-0.5" style={{ backgroundColor: fg, opacity: 0.15 }} />
					<div className="w-4/5 h-1 rounded-sm mb-0.5" style={{ backgroundColor: fg, opacity: 0.15 }} />
					<div className="w-3/4 h-1 rounded-sm" style={{ backgroundColor: fg, opacity: 0.1 }} />
				</div>
			</div>
		</div>
	);
}
