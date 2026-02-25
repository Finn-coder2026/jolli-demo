/**
 * UnifiedSidebar - The new unified sidebar that replaces the old two-tier navigation.
 *
 * Features:
 * - Sidebar-level collapse/expand with hoverable rail
 * - Inbox and Dashboard navigation items
 * - Placeholder sections for Spaces and Sites
 * - Bottom utilities section placeholder
 * - Full accessibility support
 */

import { AppBranding } from "../components/AppBranding";
import { Badge } from "../components/ui/Badge";
import { usePreference } from "../hooks/usePreference";
import { PREFERENCES } from "../services/preferences/PreferencesRegistry";
import { ChevronLeft, ChevronRight, Home, Inbox as InboxIcon } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface UnifiedSidebarProps {
	/** Callback when navigation item is clicked */
	onNavigate: (path: string) => void;
	/** Current active path */
	activePath: string;
	/** Number of unread inbox items */
	inboxCount?: number;
	/** Render function for Spaces section */
	renderSpacesSection?: () => ReactElement;
	/** Render function for Sites section */
	renderSitesSection?: () => ReactElement;
	/** Render function for Bottom utilities section */
	renderBottomSection?: () => ReactElement;
}

export function UnifiedSidebar({
	onNavigate,
	activePath,
	inboxCount = 0,
	renderSpacesSection,
	renderSitesSection,
	renderBottomSection,
}: UnifiedSidebarProps): ReactElement {
	const content = useIntlayer("unified-sidebar");
	const [collapsed, setCollapsed] = usePreference(PREFERENCES.sidebarCollapsed);
	const [shouldAnimate, setShouldAnimate] = useState(false);
	const [isNarrowScreen, setIsNarrowScreen] = useState(window.innerWidth < 1024);
	const [isHovering, setIsHovering] = useState(false);

	// Handle window resize for responsive sidebar
	useEffect(() => {
		function handleResize() {
			const narrow = window.innerWidth < 1024;
			setIsNarrowScreen(narrow);
			// Auto-collapse on narrow screens
			if (narrow && !collapsed) {
				setCollapsed(true);
			}
		}
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [collapsed, setCollapsed]);

	function handleToggleCollapse(): void {
		const newCollapsed = !collapsed;
		if (collapsed) {
			// Expanding - enable animation
			setShouldAnimate(true);
		}
		setCollapsed(newCollapsed);
	}

	// Determine if sidebar is actually collapsed (either by user or narrow screen)
	const isCollapsed = collapsed || isNarrowScreen;
	const sidebarWidth = isCollapsed ? "60px" : "260px";

	return (
		<aside
			className="relative flex flex-col flex-shrink-0 transition-all duration-300"
			style={{
				width: sidebarWidth,
				backgroundColor: "var(--sidebar-bg)",
				borderRight: "1px solid var(--sidebar-border)",
			}}
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}
			role="navigation"
			aria-label={content.ariaLabel.value}
		>
			{/* Logo */}
			<AppBranding variant="sidebar" showText={!isCollapsed} animate={shouldAnimate} />

			{/* Main Navigation Section */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
				<div className="p-2">
					{/* Section Label (only when expanded) */}
					{!isCollapsed && (
						<div
							/* v8 ignore next - animation class branch based on shouldAnimate state */
							className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${shouldAnimate ? "animate-in fade-in duration-600" : ""}`}
							style={{ color: "var(--sidebar-text-secondary)" }}
						>
							{content.navigation}
						</div>
					)}

					{/* Navigation Items */}
					<nav className="space-y-1" aria-label={content.mainNavigation.value}>
						{/* Inbox */}
						<button
							onClick={() => onNavigate("/inbox")}
							title={isCollapsed ? content.inbox.value : undefined}
							className={`flex w-full items-center gap-3 rounded-md font-normal transition-colors relative ${
								isCollapsed ? "justify-center" : ""
							}`}
							style={{
								fontSize: "14px",
								padding: "12px 16px",
								backgroundColor: activePath === "/inbox" ? "var(--sidebar-selected-bg)" : "transparent",
								color: activePath === "/inbox" ? "var(--sidebar-selected-text)" : "var(--sidebar-text)",
							}}
							onMouseEnter={e => {
								if (activePath !== "/inbox") {
									e.currentTarget.style.backgroundColor = "var(--sidebar-hover-bg)";
								}
							}}
							onMouseLeave={e => {
								if (activePath !== "/inbox") {
									e.currentTarget.style.backgroundColor = "transparent";
								}
							}}
							aria-current={activePath === "/inbox" ? "page" : undefined}
							data-testid="nav-inbox"
						>
							<div className="relative">
								<InboxIcon className="h-[16px] w-[16px] flex-shrink-0" />
								{/* Unread Badge - shown as overlay when collapsed */}
								{inboxCount > 0 && (
									<Badge
										variant="destructive"
										className={`text-xs ${isCollapsed ? "absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]" : "ml-auto"}`}
										data-testid="inbox-badge"
									>
										{inboxCount > 99 ? "99+" : inboxCount}
									</Badge>
								)}
							</div>
							{!isCollapsed && (
								<>
									<span>{content.inbox}</span>
									{inboxCount > 0 && (
										<Badge variant="destructive" className="ml-auto text-xs">
											{inboxCount > 99 ? "99+" : inboxCount}
										</Badge>
									)}
								</>
							)}
						</button>

						{/* Dashboard */}
						<button
							onClick={() => onNavigate("/dashboard")}
							title={isCollapsed ? content.dashboard.value : undefined}
							className={`flex w-full items-center gap-3 rounded-md font-normal transition-colors ${
								isCollapsed ? "justify-center" : ""
							}`}
							style={{
								fontSize: "14px",
								padding: "12px 16px",
								backgroundColor:
									activePath === "/dashboard" ? "var(--sidebar-selected-bg)" : "transparent",
								color:
									activePath === "/dashboard"
										? "var(--sidebar-selected-text)"
										: "var(--sidebar-text)",
							}}
							onMouseEnter={e => {
								if (activePath !== "/dashboard") {
									e.currentTarget.style.backgroundColor = "var(--sidebar-hover-bg)";
								}
							}}
							onMouseLeave={e => {
								if (activePath !== "/dashboard") {
									e.currentTarget.style.backgroundColor = "transparent";
								}
							}}
							aria-current={activePath === "/dashboard" ? "page" : undefined}
							data-testid="nav-dashboard"
						>
							<Home className="h-[16px] w-[16px] flex-shrink-0" />
							{!isCollapsed && <span>{content.dashboard}</span>}
						</button>
					</nav>

					{/* Spaces Section Placeholder */}
					{renderSpacesSection && (
						<div className="mt-4" data-testid="spaces-section">
							{renderSpacesSection()}
						</div>
					)}

					{/* Sites Section Placeholder */}
					{renderSitesSection && (
						<div className="mt-4" data-testid="sites-section">
							{renderSitesSection()}
						</div>
					)}
				</div>
			</div>

			{/* Bottom Utilities Section Placeholder */}
			{renderBottomSection && (
				<div
					className="border-t p-2"
					style={{ borderColor: "var(--sidebar-border)" }}
					data-testid="bottom-section"
				>
					{renderBottomSection()}
				</div>
			)}

			{/* Hoverable Collapse/Expand Rail */}
			{isHovering && !isNarrowScreen && (
				<button
					onClick={handleToggleCollapse}
					className="absolute top-1/2 -right-3 transform -translate-y-1/2 z-10 rounded-full p-1 transition-opacity duration-200"
					style={{
						backgroundColor: "var(--sidebar-bg)",
						border: "1px solid var(--sidebar-border)",
						color: "var(--sidebar-text)",
					}}
					title={collapsed ? content.expandSidebar.value : content.collapseSidebar.value}
					aria-label={collapsed ? content.expandSidebar.value : content.collapseSidebar.value}
					aria-expanded={!collapsed}
					data-testid="sidebar-toggle"
				>
					{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
				</button>
			)}
		</aside>
	);
}
