import type { ReactElement } from "react";

interface TogglePillOption {
	value: string;
	label: string;
	icon?: ReactElement;
}

interface TogglePillProps {
	options: readonly [TogglePillOption, TogglePillOption];
	value: string;
	onChange: (value: string) => void;
	className?: string;
}

export function TogglePill({ options, value, onChange, className = "" }: TogglePillProps): ReactElement {
	return (
		<div className={`inline-flex rounded-lg border border-input bg-background p-1 ${className}`} role="group">
			{options.map(option => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
						value === option.value
							? "bg-primary text-primary-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
					aria-pressed={value === option.value}
				>
					{option.icon}
					{option.label}
				</button>
			))}
		</div>
	);
}
