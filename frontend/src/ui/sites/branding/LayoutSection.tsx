/**
 * Layout section for configuring page widths, ToC, sidebar, and header alignment.
 */

import { Input } from "../../../components/ui/Input";
import { BRANDING_LIMITS, CollapsibleSection, Field, SegmentedControl } from "./FormComponents";
import type { SiteBranding } from "jolli-common";
import type { ReactElement, ReactNode } from "react";

interface LayoutSectionProps {
	branding: SiteBranding;
	expanded: boolean;
	onToggle: () => void;
	isActive: boolean;
	onUpdateField: <K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) => void;
	content: {
		layoutTitle: ReactNode;
		hideTocLabel: ReactNode;
		tocTitleLabel: ReactNode;
		sidebarCollapseLabel: ReactNode;
		sidebarCollapseHint: ReactNode;
		pageWidthLabel: ReactNode;
		pageWidthHint: ReactNode;
		pageWidthCompact: ReactNode;
		pageWidthStandard: ReactNode;
		pageWidthWide: ReactNode;
		contentWidthLabel: ReactNode;
		contentWidthHint: ReactNode;
		contentWidthCompact: ReactNode;
		contentWidthStandard: ReactNode;
		contentWidthWide: ReactNode;
		sidebarWidthLabel: ReactNode;
		sidebarWidthHint: ReactNode;
		sidebarWidthCompact: ReactNode;
		sidebarWidthStandard: ReactNode;
		sidebarWidthWide: ReactNode;
		tocWidthLabel: ReactNode;
		tocWidthHint: ReactNode;
		tocWidthCompact: ReactNode;
		tocWidthStandard: ReactNode;
		tocWidthWide: ReactNode;
		headerAlignmentLabel: ReactNode;
		headerAlignmentHint: ReactNode;
		headerAlignmentLeft: ReactNode;
		headerAlignmentRight: ReactNode;
	};
}

/**
 * Page layout configuration section
 */
export function LayoutSection({
	branding,
	expanded,
	onToggle,
	isActive,
	onUpdateField,
	content,
}: LayoutSectionProps): ReactElement {
	return (
		<CollapsibleSection
			title={content.layoutTitle}
			expanded={expanded}
			onToggle={onToggle}
			data-testid="layout-section"
		>
			<div className="space-y-4">
				{/* Width Controls */}
				<div className="space-y-3">
					<Field label={content.pageWidthLabel} hint={content.pageWidthHint}>
						<SegmentedControl
							options={[
								{ value: "compact", label: content.pageWidthCompact },
								{ value: "standard", label: content.pageWidthStandard },
								{ value: "wide", label: content.pageWidthWide },
							]}
							value={branding.pageWidth ?? "wide"}
							onChange={v => onUpdateField("pageWidth", v as SiteBranding["pageWidth"])}
							disabled={!isActive}
							testIdPrefix="page-width"
						/>
					</Field>

					<Field label={content.contentWidthLabel} hint={content.contentWidthHint}>
						<SegmentedControl
							options={[
								{ value: "compact", label: content.contentWidthCompact },
								{ value: "standard", label: content.contentWidthStandard },
								{ value: "wide", label: content.contentWidthWide },
							]}
							value={branding.contentWidth ?? "standard"}
							onChange={v => onUpdateField("contentWidth", v as SiteBranding["contentWidth"])}
							disabled={!isActive}
							testIdPrefix="content-width"
						/>
					</Field>

					<Field label={content.sidebarWidthLabel} hint={content.sidebarWidthHint}>
						<SegmentedControl
							options={[
								{ value: "compact", label: content.sidebarWidthCompact },
								{ value: "standard", label: content.sidebarWidthStandard },
								{ value: "wide", label: content.sidebarWidthWide },
							]}
							value={branding.sidebarWidth ?? "standard"}
							onChange={v => onUpdateField("sidebarWidth", v as SiteBranding["sidebarWidth"])}
							disabled={!isActive}
							testIdPrefix="sidebar-width"
						/>
					</Field>

					{!branding.hideToc && (
						<Field label={content.tocWidthLabel} hint={content.tocWidthHint}>
							<SegmentedControl
								options={[
									{ value: "compact", label: content.tocWidthCompact },
									{ value: "standard", label: content.tocWidthStandard },
									{ value: "wide", label: content.tocWidthWide },
								]}
								value={branding.tocWidth ?? "standard"}
								onChange={v => onUpdateField("tocWidth", v as SiteBranding["tocWidth"])}
								disabled={!isActive}
								testIdPrefix="toc-width"
							/>
						</Field>
					)}
				</div>

				{/* Divider */}
				<div className="border-t border-border/30" />

				{/* Header & Sidebar Settings */}
				<div className="space-y-3">
					<Field label={content.headerAlignmentLabel} hint={content.headerAlignmentHint}>
						<SegmentedControl
							options={[
								{ value: "left", label: content.headerAlignmentLeft },
								{ value: "right", label: content.headerAlignmentRight },
							]}
							value={branding.headerAlignment ?? "right"}
							onChange={v => onUpdateField("headerAlignment", v as SiteBranding["headerAlignment"])}
							disabled={!isActive}
							testIdPrefix="header-alignment"
						/>
					</Field>

					<label className="flex items-center gap-2 cursor-pointer select-none">
						<input
							type="checkbox"
							checked={branding.hideToc || false}
							onChange={e => onUpdateField("hideToc", e.target.checked)}
							disabled={!isActive}
							className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/20"
							data-testid="hide-toc-checkbox"
						/>
						<span className="text-[12px]">{content.hideTocLabel}</span>
					</label>

					{!branding.hideToc && (
						<Field label={content.tocTitleLabel}>
							<Input
								value={branding.tocTitle || ""}
								onChange={e => onUpdateField("tocTitle", e.target.value)}
								placeholder="On This Page"
								disabled={!isActive}
								maxLength={BRANDING_LIMITS.MAX_TOC_TITLE_LENGTH}
								className="h-7 text-[12px]"
								data-testid="toc-title-input"
							/>
						</Field>
					)}

					<div>
						<label className="text-[12px] font-medium text-foreground mb-1.5 block">
							{content.sidebarCollapseLabel}
						</label>
						<p className="text-[10px] text-muted-foreground mb-2">{content.sidebarCollapseHint}</p>
						<div className="flex gap-1">
							{[1, 2, 3, 4, 5, 6].map(level => (
								<button
									type="button"
									key={level}
									onClick={() => onUpdateField("sidebarDefaultCollapseLevel", level)}
									disabled={!isActive}
									className={`w-7 h-7 text-[12px] rounded-md transition-colors ${
										(branding.sidebarDefaultCollapseLevel ?? 2) === level
											? "bg-foreground text-background"
											: "bg-muted/50 hover:bg-muted text-foreground"
									} disabled:opacity-50`}
									data-testid={`sidebar-collapse-${level}`}
								>
									{level}
								</button>
							))}
						</div>
					</div>
				</div>
			</div>
		</CollapsibleSection>
	);
}
