import { cn } from "../common/ClassNameUtils";
import { getSiteColor } from "../util/ColorUtils";
import type { ReactElement } from "react";

export interface SiteIconProps {
	/** Site display name (used to determine color and initial) */
	name: string;

	/** Icon size (in Tailwind units: 5 = 1.25rem, 6 = 1.5rem, 8 = 2rem) */
	size?: 5 | 6 | 8;

	/** Additional CSS classes */
	className?: string;

	/** Test ID for testing */
	"data-testid"?: string;
}

function getSiteInitial(name: string): string {
	return name.charAt(0).toUpperCase();
}

const SITE_ICON_SIZE_CLASSES = {
	5: "h-5 w-5 text-xs",
	6: "h-6 w-6 text-sm",
	8: "h-8 w-8 text-sm",
} as const;

/**
 * Displays a colored square with the site's first letter.
 * Colors are determined algorithmically based on the site display name.
 */
export function SiteIcon({ name, size = 5, className, "data-testid": testId }: SiteIconProps): ReactElement {
	const colorClass = getSiteColor(name);
	const initial = getSiteInitial(name);

	return (
		<div
			className={cn(
				"rounded flex items-center justify-center text-white font-semibold flex-shrink-0",
				SITE_ICON_SIZE_CLASSES[size],
				colorClass,
				className,
			)}
			data-testid={testId}
		>
			{initial}
		</div>
	);
}
