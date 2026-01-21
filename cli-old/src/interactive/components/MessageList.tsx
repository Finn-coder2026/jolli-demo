import { renderMarkdown } from "../util/MarkdownUtils";
import { Box, Text } from "ink";
import type { ChatMessage } from "jolli-common";
import type React from "react";

interface MessageListProps {
	messages: Array<ChatMessage>;
	isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps): React.ReactElement {
	if (messages.length === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text dimColor>How can I help you today?</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1}>
			{messages.map((msg, index) => {
				// Only render messages with content
				if (msg.role !== "user" && msg.role !== "assistant" && msg.role !== "system") {
					return null;
				}

				const renderedContent =
					msg.role === "assistant" && msg.content ? renderMarkdown(msg.content) : msg.content;

				return (
					<Box key={index} flexDirection="column" marginBottom={1}>
						<Text bold color={msg.role === "user" ? "cyan" : "green"}>
							{msg.role === "user" ? "You" : "Assistant"}:
						</Text>
						<Box paddingLeft={2}>
							{msg.content === "" && isLoading && index === messages.length - 1 ? (
								<Text dimColor>Thinking...</Text>
							) : (
								<Text>{renderedContent}</Text>
							)}
						</Box>
					</Box>
				);
			})}
		</Box>
	);
}
