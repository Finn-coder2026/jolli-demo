/**
 * Account Settings - Application preferences and configuration.
 *
 * Routes to either ProfilePage or PreferencesPage based on the URL.
 * Wraps the content in SettingsLayout with sidebar navigation.
 */

import { useNavigation } from "../contexts/NavigationContext";
import { PreferencesPage } from "./settings/PreferencesPage";
import { ProfilePage } from "./settings/ProfilePage";
import { SettingsLayout } from "./settings/SettingsLayout";
import type { ReactElement } from "react";

export function Settings(): ReactElement {
	const { settingsView } = useNavigation();

	// Default to profile if no sub-route specified
	const activePage = settingsView === "preferences" ? "preferences" : "profile";

	return (
		<SettingsLayout activePage={activePage}>
			{activePage === "profile" ? <ProfilePage /> : <PreferencesPage />}
		</SettingsLayout>
	);
}
