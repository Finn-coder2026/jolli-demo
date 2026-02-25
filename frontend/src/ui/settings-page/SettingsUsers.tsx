/**
 * SettingsUsers - Users management placeholder page.
 *
 * Displays a "Coming Soon" message for future user management features.
 */

import { Users } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Placeholder page for user management features.
 */
export function SettingsUsers(): ReactElement {
	const content = useIntlayer("settings-users");

	return (
		<div className="bg-card rounded-lg p-6 border h-full overflow-auto scrollbar-thin">
			<div className="mb-8">
				<h1 className="text-2xl font-semibold mb-2">{content.title}</h1>
				<p className="text-muted-foreground">{content.subtitle}</p>
			</div>

			<div className="flex flex-col items-center justify-center py-16">
				<div className="rounded-full bg-muted p-4 mb-4">
					<Users className="h-8 w-8 text-muted-foreground" data-testid="users-icon" />
				</div>
				<h2 className="text-lg font-semibold mb-2" data-testid="coming-soon-title">
					{content.comingSoon}
				</h2>
				<p className="text-muted-foreground text-center max-w-md" data-testid="coming-soon-description">
					{content.comingSoonDescription}
				</p>
			</div>
		</div>
	);
}
