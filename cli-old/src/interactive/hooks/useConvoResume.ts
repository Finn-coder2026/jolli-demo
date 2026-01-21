import { saveActiveConvoId } from "../../util/Config";
import type { ChatMessage, Convo } from "jolli-common";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

export interface UseConvoResumeResult {
	pendingResumeConvo: Convo | null;
	setPendingResumeConvo: Dispatch<SetStateAction<Convo | null>>;
	handleResumeResponse: (
		userMessage: string,
		setMessages: Dispatch<SetStateAction<Array<ChatMessage>>>,
		setActiveConvoId: Dispatch<SetStateAction<number | undefined>>,
		setSystemMessage: Dispatch<SetStateAction<string | null>>,
	) => Promise<boolean>;
}

export function useConvoResume(): UseConvoResumeResult {
	const [pendingResumeConvo, setPendingResumeConvo] = useState<Convo | null>(null);

	async function handleResumeResponse(
		userMessage: string,
		setMessages: (messages: Array<ChatMessage>) => void,
		setActiveConvoId: (id: number | undefined) => void,
		setSystemMessage: (message: string | null) => void,
	): Promise<boolean> {
		if (!pendingResumeConvo) {
			return false;
		}

		const response = userMessage.toLowerCase();

		if (response === "yes" || response === "y") {
			// Resume the conversation
			setActiveConvoId(pendingResumeConvo.id);
			setMessages(pendingResumeConvo.messages);
			setSystemMessage(null);
			setPendingResumeConvo(null);
			return true;
		}

		if (response === "no" || response === "n") {
			// Start fresh
			setSystemMessage(null);
			setPendingResumeConvo(null);
			// Clear the saved convo ID
			await saveActiveConvoId(undefined);
			return true;
		}

		// Invalid response, ask again
		const firstMsg = pendingResumeConvo.messages[0];
		const preview =
			firstMsg && (firstMsg.role === "user" || firstMsg.role === "assistant" || firstMsg.role === "system")
				? firstMsg.content.slice(0, 100)
				: "";
		setSystemMessage(
			`Please type 'yes' or 'no' to resume your last conversation.\n"${preview}..."\n\nType 'yes' or 'no'`,
		);
		return true;
	}

	return {
		pendingResumeConvo,
		setPendingResumeConvo,
		handleResumeResponse,
	};
}
