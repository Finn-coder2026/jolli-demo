import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type React from "react";

interface AdminUtilitiesListProps {
	onSelect: (utility: string) => void;
	onBack: () => void;
}

export function AdminUtilitiesList({ onSelect, onBack }: AdminUtilitiesListProps): React.ReactElement {
	const items = [
		{
			label: "Clear all articles",
			value: "clear-all-articles",
		},
		{
			label: "← Back to Chat",
			value: "back",
		},
	];

	const handleSelect = (item: { value: string }) => {
		if (item.value === "back") {
			onBack();
		} else {
			onSelect(item.value);
		}
	};

	return (
		<Box flexDirection="column" padding={1} borderStyle="single" borderColor="cyan">
			<Text bold color="cyan">
				Admin Utilities
			</Text>
			<Box marginTop={1}>
				<SelectInput items={items} onSelect={handleSelect} />
			</Box>
		</Box>
	);
}
