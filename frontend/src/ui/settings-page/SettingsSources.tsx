/**
 * SettingsSources - Sources/Integrations management page within Settings.
 *
 * Wraps the existing Integrations component for use within the Settings layout.
 */

import { Integrations } from "../integrations/Integrations";
import type { ReactElement } from "react";

/**
 * Sources settings page that wraps the Integrations component.
 */
export function SettingsSources(): ReactElement {
	return <Integrations />;
}
