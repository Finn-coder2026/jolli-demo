import { CommandSuggestions } from "../components/CommandSuggestions";
import { InputBox } from "../components/InputBox";
import { MessageList } from "../components/MessageList";
import { useChatContext, useCommandContext, useMessageInputContext } from "../contexts";
import type { ViewDefinition } from "./types";
import { Box } from "ink";
import type React from "react";

function ChatViewComponent(): React.ReactElement {
	const { messages, isLoading } = useChatContext();
	const { message, setMessage, handleSend } = useMessageInputContext();
	const { commandSuggestions, handleCommandSelect } = useCommandContext();

	return (
		<>
			{/* Messages */}
			<Box flexGrow={1} flexDirection="column">
				<MessageList messages={messages} isLoading={isLoading} />
			</Box>

			{/* Input Area */}
			<InputBox
				value={message}
				onChange={setMessage}
				onSubmit={handleSend}
				isLoading={isLoading}
				hasCommandSuggestions={commandSuggestions.length > 0}
			/>

			{/* Command Suggestions - shown below input */}
			<CommandSuggestions
				commands={commandSuggestions}
				onSelect={handleCommandSelect}
				onDismiss={() => setMessage("")}
			/>
		</>
	);
}

export const chatView: ViewDefinition = {
	name: "chat",
	component: ChatViewComponent,
};
