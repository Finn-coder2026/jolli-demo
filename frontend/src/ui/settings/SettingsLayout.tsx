/**
 * SettingsLayout - Layout wrapper for Settings pages.
 *
 * Provides a two-column layout with:
 * - Left: SettingsSidebar with navigation
 * - Right: Content area for the active settings page
 */

import { ContentShell } from "../../components/ui/ContentShell";
import { FloatingPanel } from "../../components/ui/FloatingPanel";
import { type SettingsActivePage, SettingsSidebar } from "./SettingsSidebar";
import type { ReactElement, ReactNode } from "react";

export interface SettingsLayoutProps {
	/** Currently active settings page */
	activePage: SettingsActivePage;
	/** Content to render in the main area */
	children: ReactNode;
}

/**
 * Settings layout with sidebar navigation.
 */
export function SettingsLayout({ activePage, children }: SettingsLayoutProps): ReactElement {
	return (
		<ContentShell className="flex h-screen" data-testid="settings-layout">
			{/* Sidebar — sits in bg-sidebar background */}
			<SettingsSidebar activePage={activePage} />

			{/* Content area — floating panel */}
			<main className="flex-1 h-full overflow-hidden pl-1.5">
				<FloatingPanel className="h-full overflow-auto scrollbar-thin">
					<div className="min-h-full max-w-4xl mx-auto p-8">{children}</div>
				</FloatingPanel>
			</main>
		</ContentShell>
	);
}
