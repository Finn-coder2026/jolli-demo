import { Input } from "../../../components/ui/Input";
import { PresetSection } from "../branding/PresetSection";
import { LogoDisplaySelector } from "../LogoDisplaySelector";
import type { SiteBranding, ThemePreset } from "jolli-common";
import type { ReactElement, ReactNode } from "react";

export interface BrandingStepContent {
	brandingTitle: ReactNode;
	brandingDescription: ReactNode;
	brandingNote: ReactNode;
	useDefaultsNote: ReactNode;
	logoSectionTitle: ReactNode;
	logoDisplayLabel: ReactNode;
	logoDisplayText: ReactNode;
	logoDisplayImage: ReactNode;
	logoDisplayBoth: ReactNode;
	logoTextLabel: ReactNode;
	logoUrlLabel: ReactNode;
	faviconUrlLabel: ReactNode;
	displayNamePlaceholder: { value: string };
	previewLabel: ReactNode;
	previewDarkMode: ReactNode;
	previewLightMode: ReactNode;
	previewButton: ReactNode;
}

export interface PresetSectionContent {
	presetTitle: ReactNode;
	presetHint: ReactNode;
	presetCustom: ReactNode;
	[key: string]: ReactNode;
}

export interface WizardBrandingStepProps {
	branding: Partial<SiteBranding>;
	displayName: string;
	usedRememberedPreset: boolean;
	creating: boolean;
	content: BrandingStepContent;
	brandingContent: PresetSectionContent;
	onBrandingChange: (updater: (prev: Partial<SiteBranding>) => Partial<SiteBranding>) => void;
	onPresetSelect: (preset: Exclude<ThemePreset, "custom">) => void;
}

function BrandingPreview({
	branding,
	content,
}: {
	branding: Partial<SiteBranding>;
	content: BrandingStepContent;
}): ReactElement {
	const hue = branding.primaryHue ?? 212;
	const isDark = branding.defaultTheme === "dark";

	const accent = `hsl(${hue}, 70%, ${isDark ? "60%" : "45%"})`;
	const bg = isDark ? "#0a0a0a" : "#ffffff";
	const fg = isDark ? "#fafafa" : "#0a0a0a";
	const muted = isDark ? "#262626" : "#f5f5f5";
	const mutedFg = isDark ? "#a3a3a3" : "#737373";
	const border = isDark ? "#333" : "#e5e5e5";

	return (
		<div
			className="rounded-xl border overflow-hidden"
			style={{ backgroundColor: bg, borderColor: border }}
			data-testid="branding-preview"
		>
			{/* Preview header */}
			<div
				className="px-3 py-2 border-b flex items-center justify-between"
				style={{ borderColor: border, backgroundColor: muted }}
			>
				<span className="text-[10px] font-medium" style={{ color: mutedFg }}>
					{content.previewLabel}
				</span>
				<span
					className="text-[9px] px-1.5 py-0.5 rounded"
					style={{ backgroundColor: isDark ? "#333" : "#e5e5e5", color: mutedFg }}
				>
					{isDark ? content.previewDarkMode : content.previewLightMode}
				</span>
			</div>

			<div className="p-3" style={{ minHeight: "160px" }}>
				<div
					className="h-6 rounded-t flex items-center px-2 gap-2"
					style={{ backgroundColor: muted, borderColor: border }}
				>
					<div className="w-12 h-2 rounded" style={{ backgroundColor: accent }} />
					<div className="flex-1" />
					<div className="w-6 h-2 rounded" style={{ backgroundColor: mutedFg, opacity: 0.3 }} />
					<div className="w-6 h-2 rounded" style={{ backgroundColor: mutedFg, opacity: 0.3 }} />
				</div>

				<div className="flex" style={{ borderColor: border }}>
					<div className="w-16 p-2 border-r" style={{ backgroundColor: muted, borderColor: border }}>
						<div
							className="w-full h-1.5 rounded mb-1.5"
							style={{ backgroundColor: accent, opacity: 0.8 }}
						/>
						<div className="w-3/4 h-1.5 rounded mb-1.5" style={{ backgroundColor: fg, opacity: 0.15 }} />
						<div className="w-full h-1.5 rounded mb-1.5" style={{ backgroundColor: fg, opacity: 0.1 }} />
						<div className="w-2/3 h-1.5 rounded" style={{ backgroundColor: fg, opacity: 0.1 }} />
					</div>

					<div className="flex-1 p-2">
						<div className="w-3/4 h-2.5 rounded mb-2" style={{ backgroundColor: fg, opacity: 0.8 }} />
						<div className="w-full h-1.5 rounded mb-1" style={{ backgroundColor: fg, opacity: 0.15 }} />
						<div className="w-5/6 h-1.5 rounded mb-1" style={{ backgroundColor: fg, opacity: 0.15 }} />
						<div className="w-4/5 h-1.5 rounded mb-3" style={{ backgroundColor: fg, opacity: 0.1 }} />
						<div
							className="px-2 py-1 text-[8px] text-white rounded inline-block"
							style={{ backgroundColor: accent }}
						>
							{content.previewButton}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export function WizardBrandingStep({
	branding,
	displayName,
	usedRememberedPreset,
	creating,
	content,
	brandingContent,
	onBrandingChange,
	onPresetSelect,
}: WizardBrandingStepProps): ReactElement {
	const currentPreset = branding.themePreset || "minimal";
	const effectiveLogoDisplay = branding.logoDisplay || "text";
	const showLogoText = effectiveLogoDisplay === "text" || effectiveLogoDisplay === "both";
	const showLogoUrl = effectiveLogoDisplay === "image" || effectiveLogoDisplay === "both";

	return (
		<div className="space-y-6 max-w-2xl">
			<div>
				<h2 className="text-lg font-semibold mb-1">{content.brandingTitle}</h2>
				<p className="text-sm text-muted-foreground">{content.brandingDescription}</p>
				{usedRememberedPreset && (
					<p className="text-xs text-muted-foreground mt-1">{content.useDefaultsNote}</p>
				)}
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<PresetSection
					currentPreset={currentPreset}
					isActive={true}
					onPresetSelect={onPresetSelect}
					content={brandingContent}
				/>

				<BrandingPreview branding={branding} content={content} />
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-medium">{content.logoSectionTitle}</h3>

				<div>
					<label className="text-xs text-muted-foreground block mb-1">{content.logoDisplayLabel}</label>
					<LogoDisplaySelector
						selected={effectiveLogoDisplay}
						disabled={creating}
						labels={content}
						testId="wizard-logo-display-selector"
						buttonTestId="wizard-logo-display"
						onSelect={mode => onBrandingChange(prev => ({ ...prev, logoDisplay: mode }))}
					/>
				</div>

				{showLogoText && (
					<div>
						<label className="text-xs text-muted-foreground block mb-1">{content.logoTextLabel}</label>
						<Input
							type="text"
							value={branding.logo || ""}
							onChange={e => onBrandingChange(prev => ({ ...prev, logo: e.target.value }))}
							placeholder={displayName || content.displayNamePlaceholder.value}
							disabled={creating}
							maxLength={50}
							className="h-8"
							data-testid="wizard-logo-text"
						/>
					</div>
				)}

				{showLogoUrl && (
					<div>
						<label className="text-xs text-muted-foreground block mb-1">{content.logoUrlLabel}</label>
						<Input
							type="url"
							value={branding.logoUrl || ""}
							onChange={e => onBrandingChange(prev => ({ ...prev, logoUrl: e.target.value }))}
							placeholder="https://example.com/logo.png"
							disabled={creating}
							className="h-8"
							data-testid="wizard-logo-url"
						/>
					</div>
				)}

				<div>
					<label className="text-xs text-muted-foreground block mb-1">{content.faviconUrlLabel}</label>
					<Input
						type="url"
						value={branding.favicon || ""}
						onChange={e => onBrandingChange(prev => ({ ...prev, favicon: e.target.value }))}
						placeholder="https://example.com/favicon.ico"
						disabled={creating}
						className="h-8"
						data-testid="wizard-favicon-url"
					/>
				</div>
			</div>

			<div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
				<p>{content.brandingNote}</p>
			</div>
		</div>
	);
}
