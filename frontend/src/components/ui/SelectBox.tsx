import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import type { ReactElement } from "react";

export interface SelectBoxOption {
	value: string;
	label: string;
}

export interface SelectBoxProps {
	value: string;
	onValueChange: (value: string) => void;
	options: Array<SelectBoxOption>;
	width?: string;
	className?: string;
	placeholder?: string;
	"data-testid"?: string;
}

export function SelectBox({
	value,
	onValueChange,
	options,
	width = "180px",
	className = "",
	placeholder,
	"data-testid": dataTestId,
}: SelectBoxProps): ReactElement {
	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger className={className} style={{ width }} data-testid={dataTestId}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{options.map(option => (
					<SelectItem
						key={option.value}
						value={option.value}
						data-testid={`${dataTestId}-option-${option.value}`}
					>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
