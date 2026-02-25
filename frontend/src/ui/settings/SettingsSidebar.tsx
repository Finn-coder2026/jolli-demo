/**
 * SettingsSidebar - Sidebar navigation for Settings pages.
 *
 * Displays navigation sections:
 * - Personal: Profile, Preferences
 * - Account: Users, Sources (links to existing pages)
 */

import { useNavigation } from "../../contexts/NavigationContext";
import { usePermissions } from "../../contexts/PermissionContext";
import { ArrowLeft, Plug, Shield, Sliders, User, Users } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

/** Valid active page values for the settings sidebar */
export type SettingsActivePage = "profile" | "preferences" | "users" | "roles" | "sources";

export interface SettingsSidebarProps {
	/** Currently active settings page */
	activePage: SettingsActivePage;
}

interface NavItem {
	name: string;
	path: string;
	icon: typeof User;
	/** Localized display label for this nav item */
	label: string;
	/** If true, this item navigates to a different app section (not a settings sub-page) */
	external?: boolean;
	/** Permission required to view this item. If undefined, item is always visible. */
	permission?: string;
}

interface NavSection {
	title: string;
	items: Array<NavItem>;
}

/**
 * Settings sidebar with navigation sections.
 */
export function SettingsSidebar({ activePage }: SettingsSidebarProps): ReactElement {
	const content = useIntlayer("settings-layout");
	const { navigate } = useNavigation();
	const { hasPermission } = usePermissions();

	const allSections: Array<NavSection> = [
		{
			title: content.sectionPersonal.value,
			items: [
				{
					name: "profile",
					path: "/settings/profile",
					icon: User,
					label: content.navProfile.value,
				},
				{
					name: "preferences",
					path: "/settings/preferences",
					icon: Sliders,
					label: content.navPreferences.value,
				},
			],
		},
		{
			title: content.sectionAccount.value,
			items: [
				{
					name: "users",
					path: "/users",
					icon: Users,
					label: content.navUsers.value,
					external: true,
					permission: "users.view",
				},
				{
					name: "roles",
					path: "/roles",
					icon: Shield,
					label: content.navRoles.value,
					external: true,
					permission: "roles.view",
				},
				{
					name: "sources",
					path: "/integrations",
					icon: Plug,
					label: content.navSources.value,
					external: true,
					permission: "integrations.view",
				},
			],
		},
	];

	// Filter items based on permissions and remove empty sections
	const sections = allSections
		.map(section => ({
			...section,
			items: section.items.filter(item => !item.permission || hasPermission(item.permission)),
		}))
		.filter(section => section.items.length > 0);

	function handleNavClick(item: NavItem): void {
		navigate(item.path);
	}

	function handleBackClick(): void {
		navigate("/dashboard");
	}

	return (
		<nav className="w-60 min-w-60 bg-sidebar h-full flex flex-col" data-testid="settings-sidebar">
			{/* Back to App link */}
			<div className="p-4">
				<button
					onClick={handleBackClick}
					className="flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
					data-testid="settings-back-button"
				>
					<ArrowLeft className="h-4 w-4" />
					<span>{content.backToApp}</span>
				</button>
			</div>

			{/* Navigation sections */}
			<div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-thin">
				{sections.map(section => (
					<div key={section.title} className="space-y-0.5">
						{/* Section title */}
						<h3 className="text-[11px] font-semibold text-sidebar-foreground/50 px-2 mb-1">
							{section.title}
						</h3>

						{/* Section items */}
						{section.items.map(item => {
							const Icon = item.icon;
							const isActive = activePage === item.name;

							return (
								<button
									key={item.name}
									onClick={() => handleNavClick(item)}
									className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
										isActive
											? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
											: "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
									}`}
									data-testid={`settings-nav-${item.name}`}
								>
									<Icon className="h-4 w-4 flex-shrink-0" />
									<span>{item.label}</span>
								</button>
							);
						})}
					</div>
				))}
			</div>
		</nav>
	);
}
