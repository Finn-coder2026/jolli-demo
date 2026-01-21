import { cn } from "../../common/ClassNameUtils";
import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export interface FilterCardProps {
	title: ReactNode;
	count: number;
	icon: LucideIcon;
	selected: boolean;
	onClick: () => void;
	testId?: string;
}

export function FilterCard({ title, count, icon: Icon, selected, onClick, testId }: FilterCardProps): ReactElement {
	return (
		<button
			type="button"
			onClick={onClick}
			data-testid={testId}
			data-selected={selected ? "true" : undefined}
			className={cn(
				"flex flex-col items-start gap-1 p-4 rounded-lg border transition-all min-w-[160px]",
				"hover:bg-muted/50 hover:border-primary/50",
				selected ? "bg-primary/10 border-primary shadow-sm ring-1 ring-primary/20" : "bg-card border-border",
			)}
		>
			<div className="flex items-center gap-2 w-full">
				<Icon className={cn("h-4 w-4 flex-shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
				<span className={cn("text-2xl font-bold", selected ? "text-primary" : "text-foreground")}>{count}</span>
			</div>
			<span
				className={cn(
					"text-sm text-left leading-tight",
					selected ? "text-primary font-medium" : "text-muted-foreground",
				)}
			>
				{title}
			</span>
		</button>
	);
}
