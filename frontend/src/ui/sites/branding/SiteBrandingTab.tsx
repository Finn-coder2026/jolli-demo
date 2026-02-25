import { Button } from "../../../components/ui/Button";
import { useClient } from "../../../contexts/ClientContext";
import { SectionHeader } from "../SectionHeader";
import { useBrandingState, useFooterHandlers, useHeaderNavHandlers } from "./BrandingHooks";
import { GOOGLE_FONT_URLS } from "./BrandingTypes";
import { FooterSection } from "./FooterSection";
import { LayoutSection } from "./LayoutSection";
import { LivePreview } from "./LivePreview";
import { LogoSection } from "./LogoSection";
import { NavigationSection } from "./NavigationSection";
import { PresetSection } from "./PresetSection";
import { StyleSection } from "./StyleSection";
import type { SiteBranding, SiteWithUpdate, ThemePreset } from "jolli-common";
import { applyPreset, detectPreset } from "jolli-common";
import { AlertCircle, Info, Loader2, Palette } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface SiteBrandingTabProps {
	docsite: SiteWithUpdate;
	onDocsiteUpdate: (site: SiteWithUpdate) => void;
}

export function SiteBrandingTab({ docsite, onDocsiteUpdate }: SiteBrandingTabProps): ReactElement {
	const content = useIntlayer("site-branding-tab");
	const client = useClient();

	// Load Google Fonts at component level so they're available for LivePreview
	useEffect(() => {
		// Track links we create so we can clean them up on unmount
		const createdLinks: Array<HTMLLinkElement> = [];

		// Font configuration using centralized constants
		const fontConfig = [
			{ family: "Inter", url: GOOGLE_FONT_URLS.inter },
			{ family: "Space Grotesk", url: GOOGLE_FONT_URLS["space-grotesk"] },
			{ family: "IBM Plex Sans", url: GOOGLE_FONT_URLS["ibm-plex"] },
			{ family: "Source Sans 3", url: GOOGLE_FONT_URLS["source-sans"] },
		];

		// Create and append font stylesheet links (check by URL to avoid duplicates)
		for (const font of fontConfig) {
			const existing = document.querySelector(`link[href="${font.url}"]`);
			if (!existing) {
				const link = document.createElement("link");
				link.rel = "stylesheet";
				link.href = font.url;
				link.setAttribute("data-font-preview", "true");
				document.head.appendChild(link);
				createdLinks.push(link);
			}
		}

		// Use Font Loading API to explicitly load fonts (fire-and-forget)
		// Fonts will render when ready; no state update needed since LivePreview
		// uses fallback fonts while loading
		if (document.fonts?.load) {
			for (const font of fontConfig) {
				document.fonts.load(`400 16px "${font.family}"`).catch(() => {
					// Ignore errors for individual fonts - fallback fonts will be used
				});
			}
		}

		// Cleanup: remove only the links we created
		return () => {
			for (const link of createdLinks) {
				link.remove();
			}
		};
	}, []);

	const { branding, setBranding, saving, error, setError, isDirty, updateField, handleSave, handleReset } =
		useBrandingState(docsite, onDocsiteUpdate, client);

	const headerNavHandlers = useHeaderNavHandlers(branding, updateField);
	const footerHandlers = useFooterHandlers(branding, updateField);

	function handlePresetSelect(preset: Exclude<ThemePreset, "custom">) {
		const presetValues = applyPreset(preset);
		setBranding(prev => ({ ...prev, ...presetValues }));
		setError(null);
	}

	function updateThemeField<K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) {
		setBranding(prev => {
			const updated = { ...prev, [field]: value };
			// Check if this change makes it no longer match any preset
			const detectedPreset = detectPreset(updated);
			if (detectedPreset === "custom" && prev.themePreset !== "custom") {
				updated.themePreset = "custom";
			}
			return updated;
		});
		setError(null);
	}

	const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
		style: true,
		identity: false,
		navigation: false,
		footer: false,
		layout: false,
	});

	function toggleSection(section: string) {
		setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
	}

	// Allow editing when active OR error (so users can fix branding after failed builds)
	const isActive = docsite.status === "active" || docsite.status === "error";
	const currentHue = branding.primaryHue ?? 212;
	const currentPreset = branding.themePreset || detectPreset(branding);

	return (
		<div className="h-full flex flex-col">
			<div className="px-6 pt-6 pb-4">
				<SectionHeader icon={Palette} title={content.brandingTitle} description={content.brandingDescription} />
			</div>

			{/* Content area */}
			<div className="flex-1 overflow-auto px-6 pb-6 flex gap-6">
				{/* Left Panel - Settings */}
				<div className="flex-1 min-w-0 max-w-md space-y-5">
					{error && (
						<div
							className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-destructive/10 text-destructive"
							data-testid="branding-error"
						>
							<AlertCircle className="h-4 w-4 flex-shrink-0" />
							{error}
						</div>
					)}

					<div className="space-y-3">
						{/* 1. Theme Preset */}
						<PresetSection
							currentPreset={currentPreset}
							isActive={isActive}
							onPresetSelect={handlePresetSelect}
							content={content}
						/>

						{/* 2. Style Customization */}
						<StyleSection
							branding={branding}
							expanded={expandedSections.style}
							onToggle={() => toggleSection("style")}
							isActive={isActive}
							currentHue={currentHue}
							onUpdateThemeField={updateThemeField}
							content={content}
						/>

						{/* 3. Identity - Logo & Favicon */}
						<LogoSection
							branding={branding}
							expanded={expandedSections.identity}
							onToggle={() => toggleSection("identity")}
							isActive={isActive}
							onUpdateField={updateField}
							content={content}
						/>

						{/* 4. Navigation */}
						<NavigationSection
							branding={branding}
							expanded={expandedSections.navigation}
							onToggle={() => toggleSection("navigation")}
							isActive={isActive}
							onUpdateField={updateField}
							headerNavHandlers={headerNavHandlers}
							content={content}
						/>

						{/* 5. Footer */}
						<FooterSection
							branding={branding}
							expanded={expandedSections.footer}
							onToggle={() => toggleSection("footer")}
							isActive={isActive}
							onUpdateField={updateField}
							footerHandlers={footerHandlers}
							content={content}
						/>

						{/* 6. Page Layout */}
						<LayoutSection
							branding={branding}
							expanded={expandedSections.layout}
							onToggle={() => toggleSection("layout")}
							isActive={isActive}
							onUpdateField={updateField}
							content={content}
						/>
					</div>

					{/* Save Actions */}
					<div className="flex items-center justify-between pt-4 border-t">
						<div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
							<Info className="h-3.5 w-3.5 flex-shrink-0" />
							<span>{content.rebuildNote}</span>
						</div>
						{isDirty && (
							<div className="flex items-center gap-2" data-testid="save-actions">
								<Button
									variant="ghost"
									size="sm"
									onClick={handleReset}
									disabled={saving}
									data-testid="reset-button"
								>
									{content.resetButton}
								</Button>
								<Button
									size="sm"
									onClick={handleSave}
									disabled={saving || !isActive}
									data-testid="save-button"
								>
									{saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
									{saving ? content.savingButton : content.saveButton}
								</Button>
							</div>
						)}
					</div>
				</div>

				{/* Right Panel - Live Preview */}
				<div className="hidden lg:block flex-1 min-w-0">
					<div className="sticky top-0">
						<LivePreview branding={branding} />
					</div>
				</div>
			</div>
		</div>
	);
}
