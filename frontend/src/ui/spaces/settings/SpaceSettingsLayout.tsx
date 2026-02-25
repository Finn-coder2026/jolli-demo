/**
 * SpaceSettingsLayout - Layout component for Space Settings pages.
 *
 * Provides a full-screen layout with:
 * - Left sidebar with navigation (Back to Space, General tab)
 * - Right content area for settings pages
 */

import { ContentShell } from "../../../components/ui/ContentShell";
import { FloatingPanel } from "../../../components/ui/FloatingPanel";
import { useNavigation } from "../../../contexts/NavigationContext";
import { useSpace } from "../../../contexts/SpaceContext";
import { SpaceSettingsSidebar } from "./SpaceSettingsSidebar";
import type { ReactElement, ReactNode } from "react";
import { useIntlayer } from "react-intlayer";

export interface SpaceSettingsLayoutProps {
	/** Children to render in the content area */
	children: ReactNode;
}

/**
 * Full-screen space settings layout with sidebar navigation.
 */
export function SpaceSettingsLayout({ children }: SpaceSettingsLayoutProps): ReactElement {
	const content = useIntlayer("space-settings");
	const { spaceSettingsSpaceId } = useNavigation();
	const { spaces, isLoading } = useSpace();

	// Find the space being configured
	const space = spaces.find(s => s.id === spaceSettingsSpaceId);

	// Show loading state while spaces are being fetched
	/* v8 ignore next 3 -- Loading state is transient and difficult to capture in tests */
	if (isLoading) {
		return <div className="flex h-screen items-center justify-center bg-sidebar" />;
	}

	// If space not found, show error state
	if (!space) {
		return (
			<div className="flex h-screen items-center justify-center bg-sidebar">
				<div className="text-muted-foreground">{content.spaceNotFound}</div>
			</div>
		);
	}

	return (
		<ContentShell className="flex h-screen">
			{/* Sidebar — sits in bg-sidebar background */}
			<SpaceSettingsSidebar space={space} />

			{/* Content area — floating panel */}
			<main className="flex-1 h-full overflow-hidden pl-1.5" data-testid="space-settings-content">
				<FloatingPanel className="h-full overflow-auto scrollbar-thin">
					<div className="max-w-2xl mx-auto p-8">{children}</div>
				</FloatingPanel>
			</main>
		</ContentShell>
	);
}
