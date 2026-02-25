import type { ReactElement, ReactNode } from "react";
import { cn } from "@/common/ClassNameUtils";

export interface ContentShellProps {
	children: ReactNode;
	className?: string;
	"data-testid"?: string;
}

/**
 * Outermost page shell that provides the sidebar-coloured background and
 * standard padding for all main content areas. Content panels inside this
 * shell should use {@link FloatingPanel} for the raised card surface.
 */
export function ContentShell({ children, className, ...rest }: ContentShellProps): ReactElement {
	return (
		<div className={cn("h-full bg-sidebar py-1.5 pr-1.5", className)} {...rest}>
			{children}
		</div>
	);
}
