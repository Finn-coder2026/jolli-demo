import { saveActiveConvoId } from "../../util/Config";
import type { ChatMessage, Client } from "jolli-common";
import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

export interface UseChatMessagesResult {
	messages: Array<ChatMessage>;
	setMessages: Dispatch<SetStateAction<Array<ChatMessage>>>;
	isLoading: boolean;
	setIsLoading: Dispatch<SetStateAction<boolean>>;
	sendMessage: (params: {
		userMessage: string;
		activeConvoId: number | undefined;
		setActiveConvoId: Dispatch<SetStateAction<number | undefined>>;
		reloadConvos: () => Promise<void>;
		abortControllerRef: React.MutableRefObject<AbortController | null>;
		isMountedRef: React.MutableRefObject<boolean>;
	}) => Promise<void>;
}

export function useChatMessages(client: Client): UseChatMessagesResult {
	const [messages, setMessages] = useState<Array<ChatMessage>>([]);
	const [isLoading, setIsLoading] = useState(false);

	async function sendMessage(params: {
		userMessage: string;
		activeConvoId: number | undefined;
		setActiveConvoId: (id: number) => void;
		reloadConvos: () => Promise<void>;
		abortControllerRef: React.MutableRefObject<AbortController | null>;
		isMountedRef: React.MutableRefObject<boolean>;
	}) {
		const { userMessage, activeConvoId, setActiveConvoId, reloadConvos, abortControllerRef, isMountedRef } = params;

		// Cancel any pending request
		abortControllerRef.current?.abort();

		// Create new AbortController for this request
		const abortController = new AbortController();
		abortControllerRef.current = abortController;

		// Add user message
		setMessages(prev => [...prev, { role: "user", content: userMessage }]);

		// Add placeholder for assistant message
		setMessages(prev => [...prev, { role: "assistant", content: "" }]);
		setIsLoading(true);

		try {
			await client.chat().stream({
				messages,
				userMessage,
				onContent: newContent => {
					setMessages(prev => {
						const newMessages = [...prev];
						const lastMsg = newMessages[newMessages.length - 1];
						if (
							lastMsg &&
							(lastMsg.role === "user" || lastMsg.role === "assistant" || lastMsg.role === "system")
						) {
							lastMsg.content += newContent;
						}
						return newMessages;
					});
				},
				onConvoId: newConvId => {
					setActiveConvoId(newConvId);
					saveActiveConvoId(newConvId).catch(() => {
						// Ignore errors
					});
					// Reload convos to include the newly created one
					reloadConvos().then();
				},
				readyRef: isMountedRef,
				activeConvoId,
				signal: abortController.signal,
			});
		} finally {
			if (isMountedRef.current) {
				setIsLoading(false);
			}
		}
	}

	return {
		messages,
		setMessages,
		isLoading,
		setIsLoading,
		sendMessage,
	};
}
