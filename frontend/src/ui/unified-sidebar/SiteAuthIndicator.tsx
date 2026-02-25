/**
 * SiteAuthIndicator - Shows a small Lock (protected) or Globe (public) icon
 * indicating whether a site requires authentication.
 *
 * Used in sidebar favorites list and the "View All Sites" dropdown.
 */

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/Tooltip";
import type { SiteMetadata } from "jolli-common";
import { Globe, Lock } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface SiteAuthIndicatorProps {
	/** Site metadata containing jwtAuth configuration */
	metadata: SiteMetadata | undefined;
	/** CSS class for the icon size, e.g. "h-3 w-3" */
	iconClassName?: string;
}

/**
 * Renders a Globe (public) or Lock (protected) icon with a tooltip.
 * Always visible — auth status is informational metadata, not an action.
 */
export function SiteAuthIndicator({ metadata, iconClassName = "h-3 w-3" }: SiteAuthIndicatorProps): ReactElement {
	const content = useIntlayer("site-auth-indicator");
	const isProtected = metadata?.generatedJwtAuthEnabled === true;

	const label = isProtected ? content.authProtected.value : content.authPublic.value;
	const testId = isProtected ? "site-auth-protected" : "site-auth-public";
	const Icon = isProtected ? Lock : Globe;
	const iconColor = isProtected ? "text-amber-500" : "text-sidebar-foreground/40";

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<span aria-label={label} className="flex-shrink-0" data-testid={testId}>
						<Icon className={`${iconClassName} ${iconColor}`} />
					</span>
				</TooltipTrigger>
				<TooltipContent side="top" className="text-xs">
					{label}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
