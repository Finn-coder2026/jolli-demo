import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { Convo } from "jolli-common";
import type React from "react";

interface ConvoListProps {
	convos: Array<Convo>;
	activeConvoId: number | undefined;
	onSelect: (convo: Convo) => void;
	onNewConvo: () => void;
	onBack: () => void;
}

export function ConvoList({ convos, activeConvoId, onSelect, onNewConvo, onBack }: ConvoListProps): React.ReactElement {
	const items = [
		{
			label: "+ New Conversation",
			value: "new",
		},
		{
			label: "← Back to Chat",
			value: "back",
		},
		...convos.map(conv => ({
			label: `${conv.id === activeConvoId ? "→ " : "  "}${conv.title} (${new Date(conv.updatedAt).toLocaleDateString()})`,
			value: conv.id.toString(),
		})),
	];

	const handleSelect = (item: { value: string }) => {
		if (item.value === "new") {
			onNewConvo();
		} else if (item.value === "back") {
			onBack();
		} else {
			const conv = convos.find(c => c.id.toString() === item.value);
			if (conv) {
				onSelect(conv);
			}
		}
	};

	return (
		<Box flexDirection="column" padding={1} borderStyle="single" borderColor="cyan">
			<Text bold color="cyan">
				Conversations
			</Text>
			<Box marginTop={1}>
				{convos.length === 0 ? (
					<Box flexDirection="column">
						<Text dimColor>No conversations yet</Text>
						<Box marginTop={1}>
							<SelectInput items={items.slice(0, 2)} onSelect={handleSelect} />
						</Box>
					</Box>
				) : (
					<SelectInput items={items} onSelect={handleSelect} />
				)}
			</Box>
		</Box>
	);
}
