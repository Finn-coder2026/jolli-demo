/**
 * Roles page component.
 *
 * Displays the role management interface as a standalone page.
 */

import { Roles as RolesContent } from "./settings/Roles";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Roles page.
 */
export function Roles(): ReactElement {
	const content = useIntlayer("roles");

	return (
		<div className="bg-card rounded-lg p-6 border h-full overflow-auto scrollbar-thin">
			<div className="mb-6">
				<h1 className="text-2xl font-semibold mb-2">{content.title}</h1>
				<p className="text-muted-foreground">{content.subtitle}</p>
			</div>

			<RolesContent />
		</div>
	);
}
