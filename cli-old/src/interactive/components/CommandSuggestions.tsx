import { Box, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useState } from "react";

interface CommandSuggestionsProps {
	commands: Array<{ name: string; description: string }>;
	onSelect: (command: string) => Promise<void> | void;
	onDismiss: () => void;
}

export function CommandSuggestions({
	commands,
	onSelect,
	onDismiss,
}: CommandSuggestionsProps): React.ReactElement | null {
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Reset selection when commands change
	useEffect(() => {
		setSelectedIndex(0);
	}, [commands]);

	// Handle keyboard input - only respond to arrow keys, Enter, and Escape
	// Regular typing will be handled by InputBox
	useInput(
		(_input, key) => {
			// Only handle special keys, ignore regular character input
			if (key.escape) {
				onDismiss();
			} else if (key.upArrow) {
				setSelectedIndex(prev => {
					/* v8 ignore next 3 - hard to test state changes in unit tests */
					if (prev > 0) {
						return prev - 1;
					}
					return commands.length - 1;
				});
			} else if (key.downArrow) {
				setSelectedIndex(prev => {
					/* v8 ignore next 4 - hard to test state changes in unit tests */
					if (prev < commands.length - 1) {
						return prev + 1;
					}
					return 0;
				});
			} else if (key.return && commands.length > 0) {
				onSelect(commands[selectedIndex].name);
			}
			// Ignore all other input - let InputBox handle it
		},
		{ isActive: commands.length > 0 },
	);

	if (commands.length === 0) {
		return null;
	}

	return (
		<Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
			<Text dimColor>Type to filter, arrows to select, Enter to choose, Esc to dismiss:</Text>
			<Box flexDirection="column">
				{commands.map((cmd, index) => (
					<Box key={cmd.name}>
						<Text color={index === selectedIndex ? "green" : "cyan"} bold={index === selectedIndex}>
							{index === selectedIndex ? "> " : "  "}
							{cmd.name}
						</Text>
						<Text dimColor> - {cmd.description}</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}
