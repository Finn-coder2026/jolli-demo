import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

interface SectionHeaderProps {
	icon: LucideIcon;
	title: ReactNode;
	description: ReactNode;
	variant?: "default" | "destructive";
	trailing?: ReactNode;
}

export function SectionHeader({
	icon: Icon,
	title,
	description,
	variant = "default",
	trailing,
}: SectionHeaderProps): ReactElement {
	const isDestructive = variant === "destructive";
	const bgClass = isDestructive ? "bg-destructive/10" : "bg-primary/10";
	const iconClass = isDestructive ? "text-destructive" : "text-primary";
	const titleClass = isDestructive ? "text-base font-semibold text-destructive" : "text-base font-semibold";

	return (
		<div className="flex items-center gap-3">
			<div className={`h-9 w-9 rounded-lg ${bgClass} flex items-center justify-center flex-shrink-0`}>
				<Icon className={`h-5 w-5 ${iconClass}`} />
			</div>
			<div>
				<h3 className={titleClass}>{title}</h3>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			{trailing}
		</div>
	);
}
