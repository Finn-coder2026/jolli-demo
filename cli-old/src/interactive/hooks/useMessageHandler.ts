import { type CommandContext, executeCommand } from "../commands";
import type { UseChatMessagesResult } from "./useChatMessages";
import type { UseConvoResumeResult } from "./useConvoResume";
import type { UseConvosResult } from "./useConvos";
import type { UseExitHandlerResult } from "./useExitHandler";
import type { Dispatch, SetStateAction } from "react";

export interface UseMessageHandlerParams {
	message: string;
	setMessage: Dispatch<SetStateAction<string>>;
	chatMessages: UseChatMessagesResult;
	convos: UseConvosResult;
	resume: UseConvoResumeResult;
	exitHandler: UseExitHandlerResult;
	setSystemMessage: Dispatch<SetStateAction<string | null>>;
	setViewMode: Dispatch<SetStateAction<string>>;
	onLogin: () => Promise<void>;
}

export interface UseMessageHandlerResult {
	handleSend: () => Promise<void>;
	handleCommand: (command: string) => Promise<void>;
}

export function useMessageHandler(params: UseMessageHandlerParams): UseMessageHandlerResult {
	const { message, setMessage, chatMessages, convos, resume, exitHandler, setSystemMessage, setViewMode, onLogin } =
		params;

	async function handleCommand(command: string): Promise<void> {
		// Create command context
		const ctx: CommandContext = {
			setMessages: chatMessages.setMessages,
			setSystemMessage,
			setShouldExit: exitHandler.setShouldExit,
			setViewMode,
			onLogin,
			reloadConvos: convos.reloadConvos,
			isMountedRef: exitHandler.isMountedRef,
		};

		// Try to execute the command
		const executed = await executeCommand(command, ctx);

		// If command wasn't found, show error message
		if (!executed) {
			setSystemMessage(`Unknown command: ${command}. Type /help to see available commands.`);
		}
	}

	async function handleSend(): Promise<void> {
		if (!message.trim() || chatMessages.isLoading) {
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
		const handled = await resume.handleResumeResponse(
			userMessage,
			chatMessages.setMessages,
			convos.setActiveConvoId,
			setSystemMessage,
		);
		if (handled) {
			return;
		}

		// Send chat message
		await chatMessages.sendMessage({
			userMessage,
			activeConvoId: convos.activeConvoId,
			setActiveConvoId: convos.setActiveConvoId,
			reloadConvos: convos.reloadConvos,
			abortControllerRef: exitHandler.abortControllerRef,
			isMountedRef: exitHandler.isMountedRef,
		});
	}

	return {
		handleSend,
		handleCommand,
	};
}
