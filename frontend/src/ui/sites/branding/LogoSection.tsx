import { Input } from "../../../components/ui/Input";
import { LogoDisplaySelector } from "../LogoDisplaySelector";
import { BRANDING_LIMITS, CollapsibleSection, Field, isValidUrl } from "./FormComponents";
import type { SiteBranding } from "jolli-common";
import { Type } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

interface LogoSectionProps {
	branding: SiteBranding;
	expanded: boolean;
	onToggle: () => void;
	isActive: boolean;
	onUpdateField: <K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) => void;
	content: {
		identityTitle: ReactNode;
		logoTextLabel: ReactNode;
		logoUrlLabel: ReactNode;
		logoUrlHint: ReactNode;
		faviconLabel: ReactNode;
		faviconHint: ReactNode;
		logoDisplayLabel: ReactNode;
		logoDisplayText: ReactNode;
		logoDisplayImage: ReactNode;
		logoDisplayBoth: ReactNode;
		invalidUrlError: { value: string };
	};
}

export function LogoSection({
	branding,
	expanded,
	onToggle,
	isActive,
	onUpdateField,
	content,
}: LogoSectionProps): ReactElement {
	const logoUrlInvalid = branding.logoUrl && branding.logoUrl.trim() !== "" && !isValidUrl(branding.logoUrl);
	const faviconInvalid = branding.favicon && branding.favicon.trim() !== "" && !isValidUrl(branding.favicon);
	const displayMode = branding.logoDisplay || "text";

	return (
		<CollapsibleSection
			title={content.identityTitle}
			icon={<Type className="h-4 w-4" />}
			expanded={expanded}
			onToggle={onToggle}
			data-testid="logo-section"
		>
			<div className="space-y-3">
				{/* Logo display mode selector */}
				<Field label={content.logoDisplayLabel}>
					<LogoDisplaySelector
						selected={displayMode}
						disabled={!isActive}
						labels={content}
						testId="logo-display-selector"
						buttonTestId="logo-display"
						onSelect={mode => onUpdateField("logoDisplay", mode)}
					/>
				</Field>

				{/* Logo text input (shown for "text" and "both" modes) */}
				{(displayMode === "text" || displayMode === "both") && (
					<Field label={content.logoTextLabel}>
						<Input
							value={branding.logo || ""}
							onChange={e => onUpdateField("logo", e.target.value)}
							placeholder="My Docs"
							disabled={!isActive}
							maxLength={BRANDING_LIMITS.MAX_LOGO_LENGTH}
							className="h-8"
							data-testid="logo-text-input"
						/>
					</Field>
				)}

				{/* Logo URL input (shown for "image" and "both" modes) */}
				{(displayMode === "image" || displayMode === "both") && (
					<Field
						label={content.logoUrlLabel}
						hint={content.logoUrlHint}
						{...(logoUrlInvalid ? { error: content.invalidUrlError.value } : {})}
					>
						<Input
							value={branding.logoUrl || ""}
							onChange={e => onUpdateField("logoUrl", e.target.value)}
							placeholder="https://example.com/logo.png"
							disabled={!isActive}
							className={`h-8 ${logoUrlInvalid ? "border-red-500 focus-visible:ring-red-500" : ""}`}
							data-testid="logo-url-input"
						/>
					</Field>
				)}

				<Field
					label={content.faviconLabel}
					hint={content.faviconHint}
					{...(faviconInvalid ? { error: content.invalidUrlError.value } : {})}
				>
					<Input
						value={branding.favicon || ""}
						onChange={e => onUpdateField("favicon", e.target.value)}
						placeholder="https://example.com/favicon.ico"
						disabled={!isActive}
						className={`h-8 ${faviconInvalid ? "border-red-500 focus-visible:ring-red-500" : ""}`}
						data-testid="favicon-input"
					/>
				</Field>
			</div>
		</CollapsibleSection>
	);
}
