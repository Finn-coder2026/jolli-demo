/**
 * UnifiedSidebar - Main unified sidebar component that replaces the two-tier navigation.
 *
 * Features:
 * - Collapsible sidebar with width transition
 * - Org/Tenant selector at top
 * - Spaces favorites section
 * - Sites favorites section
 * - Bottom utilities (user menu, settings, theme, help)
 * - Edge hover trigger for collapse/expand
 * - Persists collapsed state via preferences
 */

import { cn } from "../../common/ClassNameUtils";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useNavigation } from "../../contexts/NavigationContext";
import { BottomUtilities } from "./BottomUtilities";
import { OrgTenantSelector } from "./OrgTenantSelector";
import styles from "./SidebarItem.module.css";
import { SitesFavoritesList } from "./SitesFavoritesList";
import { SpacesFavoritesList } from "./SpacesFavoritesList";
import type { Space, UserInfo } from "jolli-common";
import { Bot, ChevronLeft, ChevronRight, Settings, User } from "lucide-react";
import { type ReactElement, useCallback, useEffect } from "react";
import { useIntlayer } from "react-intlayer";

export interface UnifiedSidebarProps {
	/** Whether the sidebar is collapsed */
	collapsed: boolean;
	/** User information for bottom utilities */
	userInfo: UserInfo | undefined;
	/** Callback when a space is clicked to navigate */
	onSpaceClick: (space: Space) => void;
	/** Callback to handle logout */
	onLogout: () => void;
	/** Callback to toggle sidebar collapse state */
	onToggle: () => void;
}

/**
 * Main unified sidebar component.
 * Combines org/tenant selector, spaces, sites, and utilities into one sidebar.
 *
 * @example
 * ```tsx
 * <UnifiedSidebar
 *   collapsed={collapsed}
 *   userInfo={userInfo}
 *   onSpaceClick={handleSpaceClick}
 *   onLogout={handleLogout}
 *   onToggle={handleToggle}
 * />
 * ```
 */

/** Sidebar width constants */
const SIDEBAR_WIDTH_COLLAPSED = 48; // 3rem
const SIDEBAR_WIDTH_EXPANDED = 272; // 17rem

export function UnifiedSidebar({
	collapsed,
	userInfo,
	onSpaceClick,
	onLogout,
	onToggle,
}: UnifiedSidebarProps): ReactElement {
	const { activeTab, tabs, navigate: navNavigate } = useNavigation();
	const content = useIntlayer("unified-sidebar");

	function handleTabClick(tabName: string) {
		navNavigate(`/${tabName}`);
	}

	function handleSettingsClick() {
		navNavigate("/settings/preferences");
	}

	// Keyboard shortcut: Cmd/Ctrl + B to toggle sidebar (VS Code pattern)
	// Skip when focus is in an editor to avoid conflicting with bold formatting
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "b") {
				const activeElement = document.activeElement;
				const isInEditor = activeElement?.closest(".ProseMirror, [contenteditable], textarea, input");
				if (isInEditor) {
					return; // Let the editor handle Cmd/Ctrl+B for bold
				}
				e.preventDefault();
				onToggle();
			}
		},
		[onToggle],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	const isAgentActive = activeTab === "agent";
	const isPersonalSpaceActive = activeTab === "spaces";
	const isSettingsActive = activeTab === "settings";

	return (
		<aside
			className="relative flex flex-col h-full py-1.5 bg-sidebar transition-[width] duration-200 ease-linear"
			style={{
				width: collapsed ? `${SIDEBAR_WIDTH_COLLAPSED}px` : `${SIDEBAR_WIDTH_EXPANDED}px`,
			}}
			data-testid="unified-sidebar"
		>
			{/* Top: Org/Tenant Selector */}
			<div className={cn("flex items-center px-2 shrink-0", collapsed ? "flex-col py-2 gap-1" : "h-12")}>
				<div className={cn(collapsed ? "" : "flex-1 min-w-0")}>
					<OrgTenantSelector collapsed={collapsed} />
				</div>
				{/* Collapse toggle — inline-right when expanded */}
				{!collapsed && (
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0"
						onClick={onToggle}
						title={content.collapseSidebar.value}
						aria-label={content.collapseSidebar.value}
						data-testid="sidebar-collapse-button"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
				)}
			</div>

			{/* Expand toggle — below org logo when collapsed */}
			{collapsed && (
				<div className="px-2 shrink-0 flex justify-center">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0"
						onClick={onToggle}
						title={content.expandSidebar.value}
						aria-label={content.expandSidebar.value}
						data-testid="sidebar-expand-button"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}

			{/* Middle: Scrollable sections */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
				{/* Navigation Tabs */}
				<div className="py-2">
					<nav className="space-y-0.5 px-2">
						{tabs.map(({ name: tabName, icon: Icon, label, badge }) => (
							<button
								key={tabName}
								onClick={() => handleTabClick(tabName)}
								title={collapsed ? label : undefined}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
									collapsed && "justify-center",
									styles.item,
									activeTab === tabName ? styles.selected : "text-sidebar-foreground",
								)}
								data-testid={`nav-${tabName}`}
							>
								<div className="w-6 h-6 flex items-center justify-center shrink-0">
									<Icon className="h-4 w-4" />
								</div>
								{!collapsed && (
									<>
										<span className="flex-1 text-left">{label}</span>
										{/* v8 ignore next 4 - badge rendering when badge prop provided */}
										{badge !== undefined && badge > 0 && (
											<Badge variant="secondary" className="ml-auto">
												{badge > 99 ? "99+" : badge}
											</Badge>
										)}
									</>
								)}
							</button>
						))}
					</nav>
				</div>

				{/* Agent Hub */}
				<div className="px-2 pb-1">
					<button
						type="button"
						onClick={() => handleTabClick("agent")}
						title={collapsed ? content.agent.value : undefined}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
							collapsed && "justify-center",
							styles.item,
							isAgentActive ? styles.selected : "text-sidebar-foreground",
						)}
						data-testid="nav-agent"
					>
						<div className="w-6 h-6 flex items-center justify-center shrink-0">
							<Bot className="h-4 w-4" />
						</div>
						{!collapsed && <span className="flex-1 text-left">{content.agent}</span>}
					</button>
				</div>

				{/* Personal Space */}
				<div className="px-2 pb-1">
					<button
						type="button"
						onClick={() => navNavigate("/spaces/personal")}
						title={collapsed ? content.personalSpace.value : undefined}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
							collapsed && "justify-center",
							styles.item,
							isPersonalSpaceActive ? styles.selected : "text-sidebar-foreground",
						)}
						data-testid="nav-personal-space"
					>
						<div className="w-6 h-6 flex items-center justify-center shrink-0">
							<User className="h-4 w-4" />
						</div>
						{!collapsed && <span className="flex-1 text-left">{content.personalSpace}</span>}
					</button>
				</div>

				{/* Spaces and Sites */}
				<SpacesFavoritesList collapsed={collapsed} onSpaceClick={onSpaceClick} />
				<SitesFavoritesList collapsed={collapsed} />
			</div>

			{/* Settings - Standalone nav item at bottom, outside scrollable area */}
			<div className="px-2 py-2 shrink-0">
				<button
					type="button"
					onClick={handleSettingsClick}
					title={collapsed ? content.settings.value : undefined}
					className={cn(
						"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
						collapsed && "justify-center",
						styles.item,
						isSettingsActive ? styles.selected : "text-sidebar-foreground",
					)}
					data-testid="nav-settings"
				>
					<div className="w-6 h-6 flex items-center justify-center shrink-0">
						<Settings className="h-4 w-4" />
					</div>
					{!collapsed && <span className="flex-1 text-left">{content.settings}</span>}
				</button>
			</div>

			{/* Bottom: User utilities - Fixed height h-12 */}
			<BottomUtilities collapsed={collapsed} userInfo={userInfo} onLogout={onLogout} />
		</aside>
	);
}
