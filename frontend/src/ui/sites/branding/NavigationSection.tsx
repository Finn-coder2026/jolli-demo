/**
 * Navigation section for configuring navigation mode and header links.
 */
import { Input } from "../../../components/ui/Input";
import { AddButton, BRANDING_LIMITS, CollapsibleSection, isValidUrl, LinkRow } from "./FormComponents";
import type { ExternalLink, HeaderNavItem, NavigationMode, SiteBranding } from "jolli-common";
import { ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

interface NavigationSectionProps {
	branding: SiteBranding;
	expanded: boolean;
	onToggle: () => void;
	isActive: boolean;
	onUpdateField: <K extends keyof SiteBranding>(field: K, value: SiteBranding[K]) => void;
	headerNavHandlers: {
		addNavItem: () => void;
		updateNavItem: (index: number, updates: Partial<HeaderNavItem>) => void;
		removeNavItem: (index: number) => void;
		toggleNavItemType: (index: number) => void;
		addDropdownLink: (navIndex: number) => void;
		updateDropdownLink: (navIndex: number, linkIndex: number, field: keyof ExternalLink, value: string) => void;
		removeDropdownLink: (navIndex: number, linkIndex: number) => void;
	};
	content: {
		navigationTitle: ReactNode;
		navigationModeLabel: ReactNode;
		navModeSidebar: ReactNode;
		navModeSidebarDesc: ReactNode;
		navModeTabs: ReactNode;
		navModeTabsDesc: ReactNode;
		headerLinksTitle: ReactNode;
		headerLinksHint: ReactNode;
		navItemTypeLink: ReactNode;
		navItemTypeDropdown: ReactNode;
		addNavItemButton: ReactNode;
		addLinkButton: ReactNode;
	};
}

/**
 * Navigation configuration section
 */
export function NavigationSection({
	branding,
	expanded,
	onToggle,
	isActive,
	onUpdateField,
	headerNavHandlers,
	content,
}: NavigationSectionProps): ReactElement {
	const {
		addNavItem,
		updateNavItem,
		removeNavItem,
		toggleNavItemType,
		addDropdownLink,
		updateDropdownLink,
		removeDropdownLink,
	} = headerNavHandlers;

	return (
		<CollapsibleSection
			title={content.navigationTitle}
			icon={<ChevronRight className="h-4 w-4" />}
			expanded={expanded}
			onToggle={onToggle}
			data-testid="navigation-section"
		>
			<div className="space-y-4">
				{/* Navigation Mode */}
				<div data-testid="navigation-mode-section">
					<label className="text-[12px] font-medium text-foreground mb-2 block">
						{content.navigationModeLabel}
					</label>
					<NavigationModeSelector
						value={branding.navigationMode || "sidebar"}
						onChange={v => onUpdateField("navigationMode", v)}
						disabled={!isActive}
						content={content}
					/>
				</div>

				{/* Header Links */}
				<div data-testid="header-links-section">
					<label className="text-[12px] font-medium text-foreground mb-1 block">
						{content.headerLinksTitle}
					</label>
					<p className="text-[10px] text-muted-foreground mb-2">{content.headerLinksHint}</p>
					<div className="space-y-2">
						{(branding.headerLinks?.items || []).map((item, index) => (
							<NavItemRow
								key={index}
								item={item}
								index={index}
								onUpdate={updates => updateNavItem(index, updates)}
								onRemove={() => removeNavItem(index)}
								onToggleType={() => toggleNavItemType(index)}
								onAddDropdownLink={() => addDropdownLink(index)}
								onUpdateDropdownLink={(linkIndex, field, value) =>
									updateDropdownLink(index, linkIndex, field, value)
								}
								onRemoveDropdownLink={linkIndex => removeDropdownLink(index, linkIndex)}
								disabled={!isActive}
								content={content}
							/>
						))}
						{(branding.headerLinks?.items?.length || 0) < 6 && (
							<AddButton onClick={addNavItem} disabled={!isActive} data-testid="add-nav-item">
								{content.addNavItemButton}
							</AddButton>
						)}
					</div>
				</div>
			</div>
		</CollapsibleSection>
	);
}

/**
 * Navigation mode selector with visual mini-previews
 */
function NavigationModeSelector({
	value,
	onChange,
	disabled,
	content,
}: {
	value: NavigationMode;
	onChange: (v: NavigationMode) => void;
	disabled?: boolean;
	content: {
		navModeSidebar: ReactNode;
		navModeSidebarDesc: ReactNode;
		navModeTabs: ReactNode;
		navModeTabsDesc: ReactNode;
	};
}): ReactElement {
	const modes: Array<{ key: NavigationMode; label: ReactNode; desc: ReactNode }> = [
		{ key: "sidebar", label: content.navModeSidebar, desc: content.navModeSidebarDesc },
		{ key: "tabs", label: content.navModeTabs, desc: content.navModeTabsDesc },
	];

	return (
		<div className="grid grid-cols-2 gap-2">
			{modes.map(mode => (
				<button
					key={mode.key}
					type="button"
					onClick={() => onChange(mode.key)}
					disabled={disabled}
					className={`p-2.5 rounded-lg border text-center transition-all ${
						value === mode.key
							? "border-foreground/30 bg-muted/50 ring-1 ring-foreground/20"
							: "border-border/50 hover:border-border hover:bg-muted/30"
					} disabled:opacity-50 disabled:cursor-not-allowed`}
					data-testid={`nav-mode-${mode.key}`}
				>
					<NavModePreview mode={mode.key} />
					<div className="text-[11px] font-medium mt-1.5">{mode.label}</div>
					<div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{mode.desc}</div>
				</button>
			))}
		</div>
	);
}

/**
 * Mini visual preview for each navigation mode
 */
function NavModePreview({ mode }: { mode: NavigationMode }): ReactElement {
	// Common mini-page skeleton
	function MiniPage({ children }: { children?: ReactNode }): ReactElement {
		return (
			<div className="w-full h-12 bg-background rounded border border-border/30 overflow-hidden flex">
				{children}
			</div>
		);
	}

	if (mode === "sidebar") {
		return (
			<MiniPage>
				<div className="w-5 border-r border-border/30 bg-muted/30 p-0.5">
					<div className="w-full h-1 bg-muted-foreground/20 rounded-sm mb-0.5" />
					<div className="w-full h-1 bg-muted-foreground/20 rounded-sm mb-0.5" />
					<div className="w-3/4 h-1 bg-muted-foreground/30 rounded-sm" />
				</div>
				<div className="flex-1 p-1">
					<div className="w-2/3 h-1.5 bg-muted-foreground/20 rounded-sm mb-1" />
					<div className="w-full h-1 bg-muted-foreground/10 rounded-sm mb-0.5" />
					<div className="w-4/5 h-1 bg-muted-foreground/10 rounded-sm" />
				</div>
			</MiniPage>
		);
	}

	// tabs mode (default)
	return (
		<MiniPage>
			<div className="flex-1 flex flex-col">
				<div className="h-3 border-b border-border/30 flex items-end px-1 gap-0.5">
					<div className="w-3 h-2 bg-muted-foreground/30 rounded-t-sm" />
					<div className="w-3 h-2 bg-muted-foreground/15 rounded-t-sm" />
					<div className="w-3 h-2 bg-muted-foreground/15 rounded-t-sm" />
				</div>
				<div className="flex-1 flex">
					<div className="w-4 border-r border-border/30 bg-muted/30 p-0.5">
						<div className="w-full h-0.5 bg-muted-foreground/20 rounded-sm mb-0.5" />
						<div className="w-full h-0.5 bg-muted-foreground/20 rounded-sm" />
					</div>
					<div className="flex-1 p-1">
						<div className="w-2/3 h-1 bg-muted-foreground/20 rounded-sm mb-0.5" />
						<div className="w-full h-0.5 bg-muted-foreground/10 rounded-sm" />
					</div>
				</div>
			</div>
		</MiniPage>
	);
}

interface NavItemRowProps {
	item: HeaderNavItem;
	index: number;
	onUpdate: (updates: Partial<HeaderNavItem>) => void;
	onRemove: () => void;
	onToggleType: () => void;
	onAddDropdownLink: () => void;
	onUpdateDropdownLink: (linkIndex: number, field: keyof ExternalLink, value: string) => void;
	onRemoveDropdownLink: (linkIndex: number) => void;
	disabled?: boolean;
	content: {
		navItemTypeLink: ReactNode;
		navItemTypeDropdown: ReactNode;
		addLinkButton: ReactNode;
	};
}

/**
 * Row for editing a navigation item (link or dropdown)
 */
function NavItemRow({
	item,
	index,
	onUpdate,
	onRemove,
	onToggleType,
	onAddDropdownLink,
	onUpdateDropdownLink,
	onRemoveDropdownLink,
	disabled,
	content,
}: NavItemRowProps): ReactElement {
	const isDropdown = item.items !== undefined;
	const [expanded, setExpanded] = useState(true);

	return (
		<div
			className="group relative rounded-md border border-border/50 bg-muted/30 p-2.5"
			data-testid={`nav-item-${index}`}
		>
			<button
				type="button"
				onClick={onRemove}
				disabled={disabled}
				className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted disabled:opacity-50"
				data-testid={`remove-nav-item-${index}`}
			>
				<X className="h-3 w-3" />
			</button>

			<div className="flex items-center gap-2">
				<Input
					value={item.label}
					onChange={e => onUpdate({ label: e.target.value })}
					placeholder="Label"
					disabled={disabled}
					className="h-7 text-[12px] flex-1"
					maxLength={BRANDING_LIMITS.MAX_LABEL_LENGTH}
					data-testid={`nav-item-${index}-label`}
				/>

				{!isDropdown && (
					<Input
						value={item.url || ""}
						onChange={e => onUpdate({ url: e.target.value })}
						placeholder="https://..."
						disabled={disabled}
						className={`h-7 text-[12px] flex-[1.5] ${item.url && item.url.trim() !== "" && !isValidUrl(item.url) ? "border-red-500 focus-visible:ring-red-500" : ""}`}
						title={
							item.url && item.url.trim() !== "" && !isValidUrl(item.url)
								? "URL must start with http:// or https://"
								: undefined
						}
						data-testid={`nav-item-${index}-url`}
					/>
				)}

				<button
					type="button"
					onClick={onToggleType}
					disabled={disabled}
					className="h-7 px-2 text-[10px] font-medium rounded border border-border/50 bg-background hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
					data-testid={`nav-item-${index}-type-toggle`}
				>
					{isDropdown ? content.navItemTypeDropdown : content.navItemTypeLink}
				</button>

				{isDropdown && (
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						disabled={disabled}
						className="h-7 w-7 flex items-center justify-center rounded border border-border/50 bg-background hover:bg-muted transition-colors disabled:opacity-50"
						data-testid={`nav-item-${index}-expand`}
					>
						{expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
					</button>
				)}
			</div>

			{isDropdown && expanded && (
				<div className="mt-2 pl-3 border-l border-border/50 space-y-1.5">
					{(item.items || []).map((link, linkIndex) => (
						<LinkRow
							key={linkIndex}
							label={link.label}
							url={link.url}
							onLabelChange={v => onUpdateDropdownLink(linkIndex, "label", v)}
							onUrlChange={v => onUpdateDropdownLink(linkIndex, "url", v)}
							onRemove={() => onRemoveDropdownLink(linkIndex)}
							disabled={!!disabled}
							small
							testIdPrefix={`nav-item-${index}-link-${linkIndex}`}
						/>
					))}
					{(item.items?.length || 0) < 8 && (
						<AddButton
							onClick={onAddDropdownLink}
							disabled={!!disabled}
							small
							data-testid={`nav-item-${index}-add-link`}
						>
							{content.addLinkButton}
						</AddButton>
					)}
				</div>
			)}
		</div>
	);
}
