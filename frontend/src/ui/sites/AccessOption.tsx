import { Check } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export interface AccessOptionProps {
	selected: boolean;
	disabled: boolean;
	testId: string;
	icon: ReactElement;
	title: ReactNode;
	description: ReactNode;
	onClick: () => void;
}

export function AccessOption({
	selected,
	disabled,
	testId,
	icon,
	title,
	description,
	onClick,
}: AccessOptionProps): ReactElement {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`w-full text-left p-4 rounded-lg border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
				selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
			}`}
			data-testid={testId}
		>
			<div className="flex items-start gap-3">
				<div
					className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
						selected ? "border-primary bg-primary" : "border-muted-foreground/50"
					}`}
				>
					{selected && <Check className="h-3 w-3 text-primary-foreground" />}
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-2">
						{icon}
						<span className="font-medium">{title}</span>
					</div>
					<p className="text-sm text-muted-foreground mt-1">{description}</p>
				</div>
			</div>
		</button>
	);
}
