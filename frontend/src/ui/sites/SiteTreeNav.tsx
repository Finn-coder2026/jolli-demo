import { cn } from "../../common/ClassNameUtils";
import { Button } from "../../components/ui/Button";
import { FloatingPanel } from "../../components/ui/FloatingPanel";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/Tooltip";
import { useNavigation } from "../../contexts/NavigationContext";
import { SiteSwitcher } from "./SiteSwitcher";
import type { SiteWithUpdate } from "jolli-common";
import { ChevronLeft, Layers, ListTree, Palette, Settings } from "lucide-react";
import { type ReactElement, useMemo } from "react";
import { useIntlayer } from "react-intlayer";

export type SiteDetailView = "navigation" | "content" | "branding" | "changes";

export interface SiteTreeNavProps {
	site: SiteWithUpdate;
	activeView: SiteDetailView;
	onViewChange: (view: SiteDetailView) => void;
	onSiteChange: (site: SiteWithUpdate) => void;
	/** Callback to collapse the tree navigation panel */
	onCollapse?: () => void;
}

interface NavItem {
	id: SiteDetailView;
	label: string;
	tooltip: string;
	icon: typeof Layers;
}

export function SiteTreeNav({
	site,
	activeView,
	onViewChange,
	onSiteChange,
	onCollapse,
}: SiteTreeNavProps): ReactElement {
	const content = useIntlayer("site-tree-nav");
	const { navigate } = useNavigation();
	const mainNavItems = useMemo(
		(): Array<NavItem> => [
			{ id: "content", label: content.contentTab.value, tooltip: content.contentTooltip.value, icon: Layers },
			{
				id: "navigation",
				label: content.navigationTab.value,
				tooltip: content.navigationTooltip.value,
				icon: ListTree,
			},
			{ id: "branding", label: content.brandingTab.value, tooltip: content.brandingTooltip.value, icon: Palette },
		],
		[
			content.contentTab.value,
			content.contentTooltip.value,
			content.navigationTab.value,
			content.navigationTooltip.value,
			content.brandingTab.value,
			content.brandingTooltip.value,
		],
	);

	return (
		<FloatingPanel className="h-full flex flex-col" data-testid="site-tree-nav">
			<div className="h-12 flex items-center overflow-hidden min-w-0">
				<SiteSwitcher currentSite={site} onSiteChange={onSiteChange} />
				{onCollapse && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7 mr-2 shrink-0"
								onClick={onCollapse}
								data-testid="site-tree-collapse-button"
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right" className="text-xs">
							{content.collapsePanel.value}
						</TooltipContent>
					</Tooltip>
				)}
			</div>

			<div className="flex-1 px-3 py-4">
				<h3
					className="text-[11px] font-semibold text-sidebar-foreground/50 px-2 mb-1"
					data-testid="section-label"
				>
					{content.siteSettingsLabel.value}
				</h3>

				<nav className="space-y-0.5">
					{mainNavItems.map(item => {
						const Icon = item.icon;
						const isActive = activeView === item.id;
						return (
							<Tooltip key={item.id}>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => onViewChange(item.id)}
										className={cn(
											"relative flex items-center gap-2.5 w-full px-2 py-2 text-sm rounded-md transition-colors",
											isActive
												? "bg-accent text-accent-foreground font-medium"
												: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
										)}
										data-testid={`nav-${item.id}`}
									>
										{isActive && (
											<span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-full" />
										)}
										<Icon className={cn("h-4 w-4", isActive && "text-primary")} />
										{item.label}
									</button>
								</TooltipTrigger>
								<TooltipContent side="right" className="text-xs">
									{item.tooltip}
								</TooltipContent>
							</Tooltip>
						);
					})}
				</nav>
			</div>

			{/* Footer with Settings - matches SpaceTreeNav styling */}
			<div className="h-12 flex items-center px-3">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => navigate(`/sites/${site.id}/settings`)}
					className="justify-start text-muted-foreground hover:text-foreground"
					data-testid="nav-settings"
				>
					<Settings className="h-4 w-4 mr-2" />
					{content.settingsTab.value}
				</Button>
			</div>
		</FloatingPanel>
	);
}
