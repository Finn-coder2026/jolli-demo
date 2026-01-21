import { Box, Text } from "ink";
import type React from "react";

interface SimpleTableProps {
	data: Array<Record<string, string | number | boolean | null | undefined>>;
}

export const SimpleTable: React.FC<SimpleTableProps> = ({ data }) => {
	if (data.length === 0) {
		return <Text>No data</Text>;
	}

	const headers = Object.keys(data[0]);
	const columnWidths = headers.map(header => {
		const maxDataWidth = Math.max(...data.map(row => String(row[header] || "").length));
		return Math.max(header.length, maxDataWidth) + 2;
	});

	return (
		<Box flexDirection="column">
			{/* Header */}
			<Box>
				{headers.map((header, i) => (
					<Box key={header} width={columnWidths[i]} marginRight={1}>
						<Text bold color="cyan">
							{header}
						</Text>
					</Box>
				))}
			</Box>

			{/* Separator */}
			<Box>
				{headers.map((header, i) => (
					<Box key={header} width={columnWidths[i]} marginRight={1}>
						<Text dimColor>{"-".repeat(columnWidths[i])}</Text>
					</Box>
				))}
			</Box>

			{/* Rows */}
			{data.map((row, rowIndex) => (
				<Box key={rowIndex}>
					{headers.map((header, i) => (
						<Box key={header} width={columnWidths[i]} marginRight={1}>
							<Text>{String(row[header] || "")}</Text>
						</Box>
					))}
				</Box>
			))}
		</Box>
	);
};

export default SimpleTable;
