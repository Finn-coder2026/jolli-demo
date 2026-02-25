/**
 * Footer section for configuring copyright, columns, and social links.
 */
import { Input } from "../../../components/ui/Input";
import {
	AddButton,
	BRANDING_LIMITS,
	CollapsibleSection,
	DiscordIcon,
	isValidUrl,
	LinkRow,
	TwitterIcon,
} from "./FormComponents";
import type { ExternalLink, FooterColumn, SiteBranding, SocialLinks } from "jolli-common";
import { Github, Linkedin, X, Youtube } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

interface FooterSectionProps {
	branding: SiteBranding;
	expanded: boolean;
	onToggle: () => void;
	isActive: boolean;
	onUpdateField: <K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) => void;
	footerHandlers: {
		addFooterColumn: () => void;
		updateFooterColumn: (index: number, field: keyof FooterColumn, value: string | Array<ExternalLink>) => void;
		removeFooterColumn: (index: number) => void;
		addFooterColumnLink: (columnIndex: number) => void;
		updateFooterColumnLink: (
			columnIndex: number,
			linkIndex: number,
			field: keyof ExternalLink,
			value: string,
		) => void;
		removeFooterColumnLink: (columnIndex: number, linkIndex: number) => void;
		updateSocialLink: (platform: keyof SocialLinks, value: string) => void;
	};
	content: {
		footerTitle: ReactNode;
		copyrightLabel: ReactNode;
		footerColumnsLabel: ReactNode;
		socialLinksLabel: ReactNode;
		addColumnButton: ReactNode;
		addLinkButton: ReactNode;
		poweredByNote: ReactNode;
	};
}

/**
 * Footer configuration section
 */
export function FooterSection({
	branding,
	expanded,
	onToggle,
	isActive,
	onUpdateField,
	footerHandlers,
	content,
}: FooterSectionProps): ReactElement {
	const {
		addFooterColumn,
		updateFooterColumn,
		removeFooterColumn,
		addFooterColumnLink,
		updateFooterColumnLink,
		removeFooterColumnLink,
		updateSocialLink,
	} = footerHandlers;

	return (
		<CollapsibleSection
			title={content.footerTitle}
			expanded={expanded}
			onToggle={onToggle}
			data-testid="footer-section"
		>
			<div className="space-y-4">
				<div className="space-y-1">
					<label className="text-[13px] text-muted-foreground">{content.copyrightLabel}</label>
					<Input
						value={branding.footer?.copyright || ""}
						onChange={e => onUpdateField("footer", { ...branding.footer, copyright: e.target.value })}
						placeholder="2026 Acme Inc."
						disabled={!isActive}
						maxLength={BRANDING_LIMITS.MAX_COPYRIGHT_LENGTH}
						className="h-8"
						data-testid="copyright-input"
					/>
				</div>

				<div>
					<label className="text-[12px] font-medium text-foreground mb-2 block">
						{content.footerColumnsLabel}
					</label>
					<div className="space-y-2">
						{(branding.footer?.columns || []).map((column, colIndex) => (
							<div
								key={colIndex}
								className="group relative rounded-md border border-border/50 bg-muted/20 p-2.5"
								data-testid={`footer-column-${colIndex}`}
							>
								<button
									type="button"
									onClick={() => removeFooterColumn(colIndex)}
									disabled={!isActive}
									className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted disabled:opacity-50"
									data-testid={`remove-footer-column-${colIndex}`}
								>
									<X className="h-2.5 w-2.5" />
								</button>
								<Input
									value={column.title}
									onChange={e => updateFooterColumn(colIndex, "title", e.target.value)}
									placeholder="Column title"
									disabled={!isActive}
									maxLength={BRANDING_LIMITS.MAX_COLUMN_TITLE_LENGTH}
									className="h-7 text-[12px] mb-2 bg-background"
									data-testid={`footer-column-title-${colIndex}`}
								/>
								<div className="space-y-1 pl-2 border-l border-border/40">
									{column.links.map((link, linkIndex) => (
										<LinkRow
											key={linkIndex}
											label={link.label}
											url={link.url}
											onLabelChange={v => updateFooterColumnLink(colIndex, linkIndex, "label", v)}
											onUrlChange={v => updateFooterColumnLink(colIndex, linkIndex, "url", v)}
											onRemove={() => removeFooterColumnLink(colIndex, linkIndex)}
											disabled={!isActive}
											small
											testIdPrefix={`footer-column-${colIndex}-link-${linkIndex}`}
										/>
									))}
									<AddButton
										onClick={() => addFooterColumnLink(colIndex)}
										disabled={!isActive}
										small
										data-testid={`add-footer-column-${colIndex}-link`}
									>
										{content.addLinkButton}
									</AddButton>
								</div>
							</div>
						))}
						{(branding.footer?.columns?.length || 0) < 4 && (
							<AddButton onClick={addFooterColumn} disabled={!isActive} data-testid="add-footer-column">
								{content.addColumnButton}
							</AddButton>
						)}
					</div>
				</div>

				<div>
					<label className="text-[12px] font-medium text-foreground mb-2 block">
						{content.socialLinksLabel}
					</label>
					<div className="space-y-1.5">
						<SocialLinkInput
							icon={<Github className="h-3.5 w-3.5" />}
							label="GitHub"
							value={branding.footer?.socialLinks?.github || ""}
							onChange={v => updateSocialLink("github", v)}
							placeholder="https://github.com/yourorg"
							disabled={!isActive}
							testId="social-github"
						/>
						<SocialLinkInput
							icon={<TwitterIcon />}
							label="Twitter/X"
							value={branding.footer?.socialLinks?.twitter || ""}
							onChange={v => updateSocialLink("twitter", v)}
							placeholder="https://twitter.com/yourhandle"
							disabled={!isActive}
							testId="social-twitter"
						/>
						<SocialLinkInput
							icon={<DiscordIcon />}
							label="Discord"
							value={branding.footer?.socialLinks?.discord || ""}
							onChange={v => updateSocialLink("discord", v)}
							placeholder="https://discord.gg/invite"
							disabled={!isActive}
							testId="social-discord"
						/>
						<SocialLinkInput
							icon={<Linkedin className="h-3.5 w-3.5" />}
							label="LinkedIn"
							value={branding.footer?.socialLinks?.linkedin || ""}
							onChange={v => updateSocialLink("linkedin", v)}
							placeholder="https://linkedin.com/company/yourco"
							disabled={!isActive}
							testId="social-linkedin"
						/>
						<SocialLinkInput
							icon={<Youtube className="h-3.5 w-3.5" />}
							label="YouTube"
							value={branding.footer?.socialLinks?.youtube || ""}
							onChange={v => updateSocialLink("youtube", v)}
							placeholder="https://youtube.com/@yourchannel"
							disabled={!isActive}
							testId="social-youtube"
						/>
					</div>
				</div>

				<p className="text-[10px] text-muted-foreground/70">{content.poweredByNote}</p>
			</div>
		</CollapsibleSection>
	);
}

/**
 * Input field for social media links with URL validation
 */
function SocialLinkInput({
	icon,
	label,
	value,
	onChange,
	placeholder,
	disabled,
	testId,
}: {
	icon: ReactNode;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	disabled?: boolean;
	testId: string;
}): ReactElement {
	const urlInvalid = value.trim() !== "" && !isValidUrl(value);
	return (
		<div className="flex items-center gap-2">
			<div className="w-6 h-6 flex items-center justify-center text-muted-foreground" title={label}>
				{icon}
			</div>
			<Input
				value={value}
				onChange={e => onChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				className={`h-7 text-[12px] flex-1 ${urlInvalid ? "border-red-500 focus-visible:ring-red-500" : ""}`}
				title={urlInvalid ? "URL must start with http:// or https://" : undefined}
				aria-label={label}
				data-testid={testId}
			/>
		</div>
	);
}
