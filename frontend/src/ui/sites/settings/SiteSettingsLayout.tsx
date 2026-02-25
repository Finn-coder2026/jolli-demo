import { ContentShell } from "../../../components/ui/ContentShell";
import { FloatingPanel } from "../../../components/ui/FloatingPanel";
import { useNavigation } from "../../../contexts/NavigationContext";
import { useSites } from "../../../contexts/SitesContext";
import { SiteSettingsSidebar } from "./SiteSettingsSidebar";
import type { ReactElement, ReactNode } from "react";
import { useIntlayer } from "react-intlayer";

export interface SiteSettingsLayoutProps {
	children: ReactNode;
}

export function SiteSettingsLayout({ children }: SiteSettingsLayoutProps): ReactElement {
	const content = useIntlayer("site-settings");
	const { siteSettingsSiteId } = useNavigation();
	const { sites, isLoading } = useSites();

	const site = sites.find(s => s.id === siteSettingsSiteId);

	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center bg-sidebar" data-testid="settings-loading">
				<span className="text-muted-foreground">{content.loading}</span>
			</div>
		);
	}

	if (!site) {
		return (
			<div className="flex h-screen items-center justify-center bg-sidebar" data-testid="settings-not-found">
				<span className="text-muted-foreground">{content.siteNotFound}</span>
			</div>
		);
	}

	return (
		<ContentShell className="flex h-screen">
			{/* Sidebar — sits in bg-sidebar background */}
			<SiteSettingsSidebar site={site} />

			{/* Content area — floating panel */}
			<main className="flex-1 h-full overflow-hidden pl-1.5" data-testid="site-settings-content">
				<FloatingPanel className="h-full overflow-auto scrollbar-thin">
					<div className="max-w-2xl mx-auto p-8">{children}</div>
				</FloatingPanel>
			</main>
		</ContentShell>
	);
}
