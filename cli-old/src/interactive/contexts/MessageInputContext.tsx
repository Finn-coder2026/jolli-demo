import { type CommandContext, executeCommand } from "../commands";
import { useChatContext } from "./ChatContext";
import { useConvoContext } from "./ConvoContext";
import { useExitContext } from "./ExitContext";
import { useSystemContext } from "./SystemContext";
import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext, useState } from "react";

export interface MessageInputContextValue {
	message: string;
	setMessage: Dispatch<SetStateAction<string>>;
	handleSend: () => Promise<void>;
	handleCommand: (command: string) => Promise<void>;
}

export const MessageInputContext = createContext<MessageInputContextValue | undefined>(undefined);

export function useMessageInputContext(): MessageInputContextValue {
	const context = useContext(MessageInputContext);
	if (!context) {
		throw new Error("useMessageInputContext must be used within a MessageInputProvider");
	}
	return context;
}

interface MessageInputProviderProps {
	onLogin: () => Promise<void>;
	children: React.ReactNode;
}

/**
 * MessageInputProvider manages message input state and handles sending messages/commands
 * It orchestrates interactions between chat, convos, and system state
 */
export function MessageInputProvider({ onLogin, children }: MessageInputProviderProps): React.ReactElement {
	const [message, setMessage] = useState("");

	const chat = useChatContext();
	const convo = useConvoContext();
	const exit = useExitContext();
	const system = useSystemContext();

	async function handleCommand(command: string): Promise<void> {
		// Create command context
		const ctx: CommandContext = {
			setMessages: chat.setMessages,
			setSystemMessage: system.setSystemMessage,
			setShouldExit: exit.setShouldExit,
			setViewMode: system.setViewMode,
			onLogin,
			reloadConvos: convo.reloadConvos,
			isMountedRef: exit.isMountedRef,
		};

		// Try to execute the command
		const executed = await executeCommand(command, ctx);

		// If command wasn't found, show error message
		if (!executed) {
			system.setSystemMessage(`Unknown command: ${command}. Type /help to see available commands.`);
		}
	}

	async function handleSend(): Promise<void> {
		if (!message.trim() || chat.isLoading) {
			return;
		}

		const userMessage = message.trim();
		setMessage("");

		// Handle "exit" without slash (always check first)
		if (userMessage.toLowerCase() === "exit") {
			await handleCommand("/exit");
			return;
		}

		// Handle "clear" without slash (always check first)
		if (userMessage.toLowerCase() === "clear") {
			await handleCommand("/clear");
			return;
		}

		// Handle slash commands (always check first)
		if (userMessage.startsWith("/")) {
			await handleCommand(userMessage);
			return;
		}

		// Handle resume convo prompt
		const handled = await convo.handleResumeResponse(userMessage);
		if (handled) {
			return;
		}

		// Send chat message
		await chat.sendMessage({
			userMessage,
			activeConvoId: convo.activeConvoId,
			setActiveConvoId: convo.setActiveConvoId,
			reloadConvos: convo.reloadConvos,
			abortControllerRef: exit.abortControllerRef,
			isMountedRef: exit.isMountedRef,
		});
	}

	const value: MessageInputContextValue = {
		message,
		setMessage,
		handleSend,
		handleCommand,
	};

	return <MessageInputContext.Provider value={value}>{children}</MessageInputContext.Provider>;
}
