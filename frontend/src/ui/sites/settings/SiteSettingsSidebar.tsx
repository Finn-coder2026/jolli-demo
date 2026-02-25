import { SiteIcon } from "../../../components/SiteIcon";
import { type SiteSettingsView, useNavigation } from "../../../contexts/NavigationContext";
import type { SiteWithUpdate } from "jolli-common";
import { ArrowLeft, Settings2 } from "lucide-react";
import { type ReactElement, useMemo } from "react";
import { useIntlayer } from "react-intlayer";

export interface SiteSettingsSidebarProps {
	site: SiteWithUpdate;
}

interface NavItem {
	id: SiteSettingsView;
	label: string;
	icon: typeof Settings2;
	path: string;
}

export function SiteSettingsSidebar({ site }: SiteSettingsSidebarProps): ReactElement {
	const content = useIntlayer("site-settings");
	const { navigate, siteSettingsView } = useNavigation();

	const navItems = useMemo(
		(): Array<NavItem> => [
			{
				id: "general",
				label: content.generalTab.value,
				icon: Settings2,
				path: `/sites/${site.id}/settings/general`,
			},
		],
		[content.generalTab.value, site.id],
	);

	function handleBackClick() {
		navigate(`/sites/${site.id}`);
	}

	function handleNavClick(path: string) {
		navigate(path);
	}

	return (
		<aside className="flex flex-col h-full bg-sidebar w-60 min-w-60" data-testid="site-settings-sidebar">
			<div className="p-4">
				<button
					className="flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
					onClick={handleBackClick}
					data-testid="back-to-site-button"
				>
					<ArrowLeft className="h-4 w-4" />
					<SiteIcon name={site.displayName} size={5} />
					<span className="truncate">{site.displayName}</span>
				</button>
			</div>

			<nav className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
				<div className="space-y-0.5">
					<h3
						className="text-[11px] font-semibold text-sidebar-foreground/50 px-2 mb-1"
						data-testid="settings-section-title"
					>
						{content.siteSettingsTitle}
					</h3>
					{navItems.map(item => {
						const Icon = item.icon;
						const isActive = siteSettingsView === item.id;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => handleNavClick(item.path)}
								className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors ${
									isActive
										? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
										: "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
								}`}
								data-testid={`settings-nav-${item.id}`}
							>
								<Icon className="h-4 w-4" />
								<span>{item.label}</span>
							</button>
						);
					})}
				</div>
			</nav>
		</aside>
	);
}
