import type { ReactElement, ReactNode } from "react";
import { cn } from "@/common/ClassNameUtils";

export interface EmptyProps {
	icon?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	className?: string;
}

export function Empty({ icon, title, description, action, className }: EmptyProps): ReactElement {
	return (
		<div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
			{icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
			<h3 className="text-lg font-semibold mb-2">{title}</h3>
			{description && <p className="text-sm text-muted-foreground mb-4 max-w-md">{description}</p>}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
