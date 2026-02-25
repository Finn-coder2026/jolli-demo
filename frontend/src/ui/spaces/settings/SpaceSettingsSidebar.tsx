/**
 * SpaceSettingsSidebar - Sidebar navigation for Space Settings.
 *
 * Features:
 * - "Back to {spaceName}" button at top
 * - Navigation items for settings sections
 * - Active state highlighting for current page
 */

import { type SpaceSettingsView, useNavigation } from "../../../contexts/NavigationContext";
import type { Space } from "jolli-common";
import { ArrowLeft, Plug, Settings2 } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface SpaceSettingsSidebarProps {
	/** The space being configured */
	space: Space;
}

interface NavItem {
	id: SpaceSettingsView;
	label: string;
	icon: typeof Settings2;
	path: string;
}

/**
 * Sidebar navigation for space settings pages.
 */
export function SpaceSettingsSidebar({ space }: SpaceSettingsSidebarProps): ReactElement {
	const content = useIntlayer("space-settings");
	const { navigate, spaceSettingsView } = useNavigation();

	const navItems: Array<NavItem> = [
		{
			id: "general",
			label: content.generalTab.value,
			icon: Settings2,
			path: `/spaces/${space.id}/settings/general`,
		},
		{
			id: "sources",
			label: content.sourcesTab.value,
			icon: Plug,
			path: `/spaces/${space.id}/settings/sources`,
		},
		// Members tab placeholder for future implementation
		// { id: "members", label: "Members", icon: Users, path: `/spaces/${space.id}/settings/members` },
	];

	function handleBackClick(): void {
		navigate("/articles");
	}

	function handleNavClick(path: string): void {
		navigate(path);
	}

	return (
		<aside className="flex flex-col h-full bg-sidebar w-60 min-w-60" data-testid="space-settings-sidebar">
			{/* Back button */}
			<div className="p-4">
				<button
					onClick={handleBackClick}
					className="flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
					data-testid="back-to-space-button"
				>
					<ArrowLeft className="h-4 w-4" />
					<span className="truncate">{content.backToSpace({ spaceName: space.name })}</span>
				</button>
			</div>

			{/* Navigation section */}
			<nav className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
				<div className="space-y-0.5">
					<h3 className="text-[11px] font-semibold text-sidebar-foreground/50 px-2 mb-1">
						{content.spaceSettingsTitle}
					</h3>
					{navItems.map(item => {
						const Icon = item.icon;
						const isActive = spaceSettingsView === item.id;

						return (
							<button
								key={item.id}
								type="button"
								onClick={() => handleNavClick(item.path)}
								className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
									isActive
										? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
										: "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
								}`}
								data-testid={`nav-${item.id}`}
							>
								<Icon className="h-4 w-4 flex-shrink-0" />
								<span className="truncate">{item.label}</span>
							</button>
						);
					})}
				</div>
			</nav>
		</aside>
	);
}
