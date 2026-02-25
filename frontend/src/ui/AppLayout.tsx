import { AppBranding } from "../components/AppBranding";
import { Badge } from "../components/ui/Badge";
import { useNavigation } from "../contexts/NavigationContext";
import { usePreference } from "../hooks/usePreference";
import { PREFERENCES } from "../services/preferences/PreferencesRegistry";
import { UnifiedSidebar } from "./unified-sidebar/UnifiedSidebar";
import type { Space, UserInfo } from "jolli-common";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface AppLayoutProps {
	children?: ReactNode;
	onViewChange(view: string): void;
	doLogout(): void;
	userInfo?: UserInfo;
	onSpaceClick?: (space: Space) => void;
	/** Remove default padding from main content area */
	noPadding?: boolean;
}

export function AppLayout({
	children,
	onViewChange,
	doLogout,
	userInfo,
	onSpaceClick,
	noPadding = true,
}: AppLayoutProps): ReactElement {
	const content = useIntlayer("app-layout");
	const [collapsed, setCollapsed] = usePreference(PREFERENCES.sidebarCollapsed);
	const [useUnifiedSidebar] = usePreference(PREFERENCES.useUnifiedSidebar);
	const [shouldAnimate, _setShouldAnimate] = useState(false);
	const [isNarrowScreen, setIsNarrowScreen] = useState(window.innerWidth < 1024);
	const { activeTab, tabs } = useNavigation();

	// Handle window resize for responsive sidebar
	useEffect(() => {
		function handleResize() {
			setIsNarrowScreen(window.innerWidth < 1024);
		}
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	/* v8 ignore next 5 - simple wrapper function for optional prop callback */
	function handleSpaceClick(space: Space) {
		if (onSpaceClick) {
			onSpaceClick(space);
		}
	}

	return (
		<div className="flex h-screen overflow-hidden">
			{/* Sidebar - Unified or Legacy */}
			{useUnifiedSidebar ? (
				<UnifiedSidebar
					collapsed={collapsed}
					userInfo={userInfo}
					onSpaceClick={handleSpaceClick}
					onLogout={doLogout}
					onToggle={() => setCollapsed(!collapsed)}
				/>
			) : (
				<aside
					className={`transition-all duration-300 ${collapsed || isNarrowScreen ? "w-20" : "w-[244px]"} flex flex-col flex-shrink-0`}
					style={{ backgroundColor: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}
				>
					{/* Logo */}
					<AppBranding variant="sidebar" showText={!collapsed && !isNarrowScreen} animate={shouldAnimate} />

					{/* Navigation */}
					<div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
						<div className="p-2">
							{!collapsed && !isNarrowScreen && (
								<div
									className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${shouldAnimate ? "animate-in fade-in duration-600" : ""}`}
									style={{ color: "var(--sidebar-text-secondary)" }}
								>
									{content.navigation}
								</div>
							)}
							<nav className="space-y-1">
								{tabs.map(({ name: tabName, icon: Icon, label, badge }) => (
									<button
										key={tabName}
										onClick={() => onViewChange(tabName)}
										title={collapsed || isNarrowScreen ? label : undefined}
										className={`flex w-full items-center gap-3 rounded-md font-normal transition-colors ${
											collapsed || isNarrowScreen ? "justify-center" : ""
										}`}
										style={{
											fontSize: "14px",
											padding: "12px 16px",
											backgroundColor:
												activeTab === tabName ? "var(--sidebar-selected-bg)" : "transparent",
											color:
												activeTab === tabName
													? "var(--sidebar-selected-text)"
													: "var(--sidebar-text)",
										}}
										onMouseEnter={e => {
											if (activeTab !== tabName) {
												e.currentTarget.style.backgroundColor = "var(--sidebar-hover-bg)";
											}
										}}
										onMouseLeave={e => {
											if (activeTab !== tabName) {
												e.currentTarget.style.backgroundColor = "transparent";
											}
										}}
									>
										<Icon className="h-[16px] w-[16px] flex-shrink-0" />
										{!collapsed && !isNarrowScreen && (
											<>
												<span>{label}</span>
												{badge && (
													<Badge variant="secondary" className="ml-auto text-xs">
														{badge}
													</Badge>
												)}
											</>
										)}
									</button>
								))}
							</nav>
						</div>
					</div>
				</aside>
			)}

			{/* Main Content */}
			<main className={`flex-1 overflow-auto bg-background scrollbar-thin ${noPadding ? "" : "p-5"}`}>
				{children}
			</main>
		</div>
	);
}
