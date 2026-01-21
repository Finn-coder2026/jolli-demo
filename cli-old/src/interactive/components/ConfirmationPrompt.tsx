import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import type React from "react";

interface ConfirmationPromptProps {
	message: string;
	onConfirm: (confirmed: boolean) => void;
	loading: boolean;
	error?: string | null;
}

export function ConfirmationPrompt({
	message,
	onConfirm,
	loading,
	error,
}: ConfirmationPromptProps): React.ReactElement {
	const items = [
		{
			label: "Yes",
			value: "yes",
		},
		{
			label: "No",
			value: "no",
		},
	];

	const handleSelect = (item: { value: string }) => {
		onConfirm(item.value === "yes");
	};

	return (
		<Box flexDirection="column" padding={1} borderStyle="single" borderColor="yellow">
			<Text bold color="yellow">
				Confirmation Required
			</Text>

			<Box marginTop={1} marginBottom={1}>
				<Text>{message}</Text>
			</Box>

			{error && (
				<Box marginBottom={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}

			{loading ? (
				<Box>
					<Text color="cyan">
						<Spinner type="dots" />
					</Text>
					<Text> Processing...</Text>
				</Box>
			) : (
				<SelectInput items={items} onSelect={handleSelect} />
			)}
		</Box>
	);
}
