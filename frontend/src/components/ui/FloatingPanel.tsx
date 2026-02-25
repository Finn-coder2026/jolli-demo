import type { ReactElement, ReactNode } from "react";
import { cn } from "@/common/ClassNameUtils";

export interface FloatingPanelProps {
	children: ReactNode;
	className?: string;
	"data-testid"?: string;
}

/**
 * Floating card panel with the standard app styling: white background, rounded
 * corners, subtle border and shadow. Used as the content surface inside the
 * sidebar-coloured page shell.
 */
export function FloatingPanel({ children, className, ...rest }: FloatingPanelProps): ReactElement {
	return (
		<div className={cn("bg-background rounded-lg border border-border shadow-sm", className)} {...rest}>
			{children}
		</div>
	);
}
