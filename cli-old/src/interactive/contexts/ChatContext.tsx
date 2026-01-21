import { useChatMessages } from "../hooks/useChatMessages";
import type { ChatMessage, Client } from "jolli-common";
import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export interface ChatContextValue {
	messages: Array<ChatMessage>;
	setMessages: Dispatch<SetStateAction<Array<ChatMessage>>>;
	isLoading: boolean;
	setIsLoading: Dispatch<SetStateAction<boolean>>;
	client: Client;
	sendMessage: (params: {
		userMessage: string;
		activeConvoId: number | undefined;
		setActiveConvoId: Dispatch<SetStateAction<number | undefined>>;
		reloadConvos: () => Promise<void>;
		abortControllerRef: React.MutableRefObject<AbortController | null>;
		isMountedRef: React.MutableRefObject<boolean>;
	}) => Promise<void>;
}

export const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function useChatContext(): ChatContextValue {
	const context = useContext(ChatContext);
	if (!context) {
		throw new Error("useChatContext must be used within a ChatProvider");
	}
	return context;
}

interface ChatProviderProps {
	client: Client;
	children: React.ReactNode;
}

/**
 * ChatProvider manages chat messages and loading state
 * It provides access to messages, loading state, and the client for chat operations
 */
export function ChatProvider({ client, children }: ChatProviderProps): React.ReactElement {
	const chatHook = useChatMessages(client);

	const value: ChatContextValue = {
		messages: chatHook.messages,
		setMessages: chatHook.setMessages,
		isLoading: chatHook.isLoading,
		setIsLoading: chatHook.setIsLoading,
		client,
		sendMessage: chatHook.sendMessage,
	};

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
