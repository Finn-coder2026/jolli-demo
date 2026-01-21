import { Box, Text } from "ink";
import type React from "react";

interface SimpleProgressBarProps {
	percent: number;
	columns?: number;
	character?: string;
}

export const SimpleProgressBar: React.FC<SimpleProgressBarProps> = ({ percent, columns = 40, character = "█" }) => {
	const filled = Math.round(percent * columns);
	const empty = columns - filled;

	return (
		<Box>
			<Text color="green">{character.repeat(filled)}</Text>
			<Text dimColor>{"░".repeat(empty)}</Text>
		</Box>
	);
};

export default SimpleProgressBar;
