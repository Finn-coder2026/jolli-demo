import { cn } from "../common/ClassNameUtils";
import { getSpaceColor, getSpaceInitial } from "../util/SpaceUtil";
import { User } from "lucide-react";
import type { ReactElement } from "react";

export interface SpaceIconProps {
	/** Space name (used to determine color and initial) */
	name: string;

	/** Icon size (in Tailwind units: 5 = 1.25rem, 6 = 1.5rem, 8 = 2rem) */
	size?: 5 | 6 | 8;

	/** Whether this is a personal space (shows User icon on neutral background) */
	isPersonal?: boolean;

	/** Additional CSS classes */
	className?: string;

	/** Test ID for testing */
	"data-testid"?: string;
}

/** Icon sizes for the User icon inside personal space avatars */
const personalIconSizes = {
	5: "h-3 w-3",
	6: "h-3.5 w-3.5",
	8: "h-4 w-4",
};

/**
 * SpaceIcon component - displays a colored square with the space's first letter.
 * For personal spaces, shows a User icon on a neutral background.
 * Colors are determined algorithmically based on the space name.
 */
export function SpaceIcon({
	name,
	size = 5,
	isPersonal = false,
	className,
	"data-testid": testId,
}: SpaceIconProps): ReactElement {
	// Size mapping to Tailwind classes
	const sizeClasses = {
		5: "h-5 w-5 text-xs",
		6: "h-6 w-6 text-sm",
		8: "h-8 w-8 text-sm",
	};

	if (isPersonal) {
		return (
			<div
				className={cn(
					"rounded flex items-center justify-center text-muted-foreground bg-muted font-semibold flex-shrink-0",
					sizeClasses[size],
					className,
				)}
				data-testid={testId}
			>
				<User className={personalIconSizes[size]} />
			</div>
		);
	}

	const colorClass = getSpaceColor(name);
	const initial = getSpaceInitial(name);

	return (
		<div
			className={cn(
				"rounded flex items-center justify-center text-white font-semibold flex-shrink-0",
				sizeClasses[size],
				colorClass,
				className,
			)}
			data-testid={testId}
		>
			{initial}
		</div>
	);
}
