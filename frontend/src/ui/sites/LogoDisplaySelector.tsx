import type { LogoDisplay } from "jolli-common";
import { Image, LetterText, Type } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export interface LogoDisplayLabels {
	logoDisplayText: ReactNode;
	logoDisplayImage: ReactNode;
	logoDisplayBoth: ReactNode;
}

interface LogoDisplayOption {
	value: LogoDisplay;
	label: ReactNode;
	icon: ReactElement;
}

function buildOptions(labels: LogoDisplayLabels): Array<LogoDisplayOption> {
	return [
		{ value: "text", label: labels.logoDisplayText, icon: <LetterText className="h-3.5 w-3.5" /> },
		{ value: "image", label: labels.logoDisplayImage, icon: <Image className="h-3.5 w-3.5" /> },
		{ value: "both", label: labels.logoDisplayBoth, icon: <Type className="h-3.5 w-3.5" /> },
	];
}

interface LogoDisplaySelectorProps {
	selected: LogoDisplay;
	disabled: boolean;
	labels: LogoDisplayLabels;
	testId: string;
	buttonTestId: string;
	onSelect: (mode: LogoDisplay) => void;
}

export function LogoDisplaySelector({
	selected,
	disabled,
	labels,
	testId,
	buttonTestId,
	onSelect,
}: LogoDisplaySelectorProps): ReactElement {
	const options = buildOptions(labels);

	return (
		<div className="flex rounded-lg border overflow-hidden" data-testid={testId}>
			{options.map(option => (
				<button
					key={option.value}
					type="button"
					onClick={() => onSelect(option.value)}
					disabled={disabled}
					className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs transition-colors ${
						selected === option.value
							? "bg-primary text-primary-foreground"
							: "hover:bg-muted text-muted-foreground"
					}`}
					data-testid={`${buttonTestId}-${option.value}`}
				>
					{option.icon}
					{option.label}
				</button>
			))}
		</div>
	);
}
