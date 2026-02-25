/**
 * SettingsLayout - Full-screen settings page layout with sidebar navigation.
 *
 * Features:
 * - Full-screen flex layout (sidebar + content area)
 * - "Back to App" button at top of sidebar
 * - Navigation categories (Personal, Account) with items
 * - Active state highlighting for current page
 * - Collapsible sidebar with toggle
 */

import { Button } from "../../components/ui/Button";
import { useNavigation } from "../../contexts/NavigationContext";
import { usePreference } from "../../hooks/usePreference";
import { PREFERENCES } from "../../services/preferences/PreferencesRegistry";
import type { UserInfo } from "jolli-common";
import { ArrowLeft, ChevronLeft, ChevronRight, FolderGit2, Settings, User, Users } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useIntlayer } from "react-intlayer";

export type SettingsPage = "profile" | "preferences" | "users" | "sources";

export interface SettingsLayoutProps {
	/** The currently active settings page */
	activePage: SettingsPage;
	/** Children to render in the content area */
	children: ReactNode;
	/** User info for display */
	userInfo?: UserInfo;
	/** Callback to handle logout */
	onLogout?: () => void;
}

interface NavItem {
	id: SettingsPage;
	label: string;
	icon: typeof User;
	path: string;
}

interface NavSection {
	title: string;
	items: Array<NavItem>;
}

/**
 * Full-screen settings layout with collapsible sidebar navigation.
 */
export function SettingsLayout({ activePage, children }: SettingsLayoutProps): ReactElement {
	const content = useIntlayer("settings-layout");
	const { navigate } = useNavigation();
	const [collapsed, setCollapsed] = usePreference(PREFERENCES.sidebarCollapsed);

	const navSections: Array<NavSection> = [
		{
			title: content.personalSection.value,
			items: [
				{ id: "profile", label: content.profileNav.value, icon: User, path: "/settings/profile" },
				{
					id: "preferences",
					label: content.preferencesNav.value,
					icon: Settings,
					path: "/settings/preferences",
				},
			],
		},
		{
			title: content.accountSection.value,
			items: [
				{ id: "users", label: content.usersNav.value, icon: Users, path: "/settings/users" },
				{ id: "sources", label: content.sourcesNav.value, icon: FolderGit2, path: "/integrations" },
			],
		},
	];

	function handleBackClick() {
		navigate("/");
	}

	function handleNavClick(path: string) {
		navigate(path);
	}

	function handleToggleCollapse() {
		setCollapsed(!collapsed);
	}

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			{/* Sidebar */}
			<aside
				className="relative flex flex-col h-full bg-card border-r transition-all duration-300"
				style={{
					width: collapsed ? "60px" : "240px",
				}}
				data-testid="settings-sidebar"
			>
				{/* Back to App button with collapse toggle */}
				<div className={`flex items-center p-2 border-b ${collapsed ? "flex-col gap-1" : ""}`}>
					{collapsed && (
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 shrink-0"
							onClick={handleToggleCollapse}
							title={content.expandSidebar.value}
							aria-label={content.expandSidebar.value}
							data-testid="sidebar-collapse-button"
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					)}
					<Button
						variant="ghost"
						onClick={handleBackClick}
						className={`${collapsed ? "justify-center px-2" : "flex-1 min-w-0 justify-start"}`}
						title={collapsed ? content.backToApp.value : undefined}
						data-testid="back-to-app-button"
					>
						<ArrowLeft className="h-4 w-4 flex-shrink-0" />
						{!collapsed && <span className="ml-2 truncate">{content.backToApp}</span>}
					</Button>
					{!collapsed && (
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 shrink-0"
							onClick={handleToggleCollapse}
							title={content.collapseSidebar.value}
							aria-label={content.collapseSidebar.value}
							data-testid="sidebar-collapse-button"
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
					)}
				</div>

				{/* Navigation sections */}
				<nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-thin">
					{navSections.map((section, sectionIndex) => (
						<div key={section.title} className={sectionIndex > 0 ? "mt-4" : ""}>
							{/* Section header */}
							{!collapsed && (
								<div
									className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									data-testid={`section-header-${section.title.toLowerCase()}`}
								>
									{section.title}
								</div>
							)}

							{/* Section items */}
							<div className="px-2 space-y-1">
								{section.items.map(item => {
									const Icon = item.icon;
									const isActive = activePage === item.id;

									return (
										<button
											key={item.id}
											type="button"
											onClick={() => handleNavClick(item.path)}
											className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
												collapsed ? "justify-center" : ""
											} ${
												isActive
													? "bg-accent text-accent-foreground"
													: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
											}`}
											title={collapsed ? item.label : undefined}
											data-testid={`nav-${item.id}`}
										>
											<Icon className="h-4 w-4 flex-shrink-0" />
											{!collapsed && <span className="truncate">{item.label}</span>}
										</button>
									);
								})}
							</div>
						</div>
					))}
				</nav>
			</aside>

			{/* Main Content */}
			<main className="flex-1 overflow-auto p-6 scrollbar-thin" data-testid="settings-content">
				{children}
			</main>
		</div>
	);
}
