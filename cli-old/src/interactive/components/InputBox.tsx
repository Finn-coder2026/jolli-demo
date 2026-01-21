import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import React from "react";

interface InputBoxProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	isLoading: boolean;
	hasCommandSuggestions?: boolean;
}

export function InputBox({
	value,
	onChange,
	onSubmit,
	isLoading,
	hasCommandSuggestions = false,
}: InputBoxProps): React.ReactElement {
	// Track whether CTRL key is currently being pressed (ref for synchronous checking)
	const isCtrlPressedRef = React.useRef(false);
	const [isCtrlPressed, setIsCtrlPressed] = React.useState(false);

	// Detect when CTRL key is pressed/released
	useInput(
		(_input, key) => {
			// When any control key combination is detected, block input changes
			if (key.ctrl) {
				isCtrlPressedRef.current = true;
				setIsCtrlPressed(true);
				// Re-enable after a short delay
				setTimeout(() => {
					isCtrlPressedRef.current = false;
					setIsCtrlPressed(false);
				}, 100);
			}
		},
		{ isActive: !isLoading },
	);

	// Wrap onChange to block changes when CTRL is pressed
	const handleChange = (newValue: string): void => {
		// Block any changes while CTRL is pressed
		if (isCtrlPressedRef.current) {
			return;
		}
		onChange(newValue);
	};

	// Don't submit if command suggestions are visible - let CommandSuggestions handle Enter key
	const handleSubmit = (): void => {
		if (!hasCommandSuggestions) {
			onSubmit();
		}
	};
	return (
		<Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
			<Text dimColor>Type your message and press Enter to send (Ctrl+C to exit)</Text>
			<Box marginTop={1}>
				<Text color="cyan" bold>
					{">"}{" "}
				</Text>
				<Box flexGrow={1}>
					{isLoading ? (
						<Text dimColor>Waiting for response...</Text>
					) : isCtrlPressed ? (
						<Text>{value || " "}</Text>
					) : (
						<TextInput
							value={value}
							onChange={handleChange}
							onSubmit={handleSubmit}
							placeholder="Type your message..."
						/>
					)}
				</Box>
			</Box>
		</Box>
	);
}
