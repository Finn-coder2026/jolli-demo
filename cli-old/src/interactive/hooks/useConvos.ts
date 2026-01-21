import { loadActiveConvoId, saveActiveConvoId } from "../../util/Config";
import type { ChatMessage, Client, Convo } from "jolli-common";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

export interface UseConvosParams {
	client: Client;
	setMessages: Dispatch<SetStateAction<Array<ChatMessage>>>;
	setViewMode: Dispatch<SetStateAction<string>>;
}

export interface UseConvosResult {
	convos: Array<Convo>;
	setConvos: Dispatch<SetStateAction<Array<Convo>>>;
	activeConvoId: number | undefined;
	setActiveConvoId: Dispatch<SetStateAction<number | undefined>>;
	currentTitle: string;
	handleNewConvo: () => void;
	handleSwitchConvo: (convo: Convo) => void;
	reloadConvos: () => Promise<void>;
	loadInitialConvos: (
		setSystemMessage: Dispatch<SetStateAction<string | null>>,
		setPendingResumeConvo: Dispatch<SetStateAction<Convo | null>>,
	) => Promise<void>;
}

export function useConvos(params: UseConvosParams): UseConvosResult {
	const [convos, setConvos] = useState<Array<Convo>>([]);
	const [activeConvoId, setActiveConvoId] = useState<number | undefined>();

	// Save active convo ID when it changes
	useEffect(() => {
		if (activeConvoId !== undefined) {
			saveActiveConvoId(activeConvoId).catch(() => {
				// Ignore errors
			});
		}
	}, [activeConvoId]);

	// Load convos on mount and check authentication
	async function loadInitialConvos(
		setSystemMessage: (message: string | null) => void,
		setPendingResumeConvo: (convo: Convo | null) => void,
	) {
		try {
			const convoList = await params.client.convos().listConvos();
			setConvos(convoList);
			setSystemMessage(null);

			// Check if there's a saved convo to potentially resume
			const savedId = await loadActiveConvoId();
			if (savedId) {
				const activeConv = convoList.find(c => c.id === savedId);
				if (activeConv && activeConv.messages.length > 0) {
					// Prompt user to resume instead of automatically loading
					setPendingResumeConvo(activeConv);
					const firstMsg = activeConv.messages[0];
					const firstMessage =
						firstMsg &&
						(firstMsg.role === "user" || firstMsg.role === "assistant" || firstMsg.role === "system")
							? firstMsg.content
							: "";
					const preview = firstMessage.length > 100 ? `${firstMessage.slice(0, 100)}...` : firstMessage;
					setSystemMessage(
						`Would you like to resume your last conversation?\n"${preview}"\n\nType 'yes' or 'no'`,
					);
				}
			}
		} catch (error) {
			// If we get a 401/403, user needs to log in
			const errorMessage = String(error);
			if (errorMessage.includes("401") || errorMessage.includes("403") || errorMessage.includes("Unauthorized")) {
				setSystemMessage("You need to log in. Type /login to authenticate.");
			} else {
				console.error("Failed to load convos:", error);
			}
		}
	}

	// Reload convos list
	async function reloadConvos() {
		try {
			const convoList = await params.client.convos().listConvos();
			setConvos(convoList);
		} catch (error) {
			console.error("Failed to reload convos:", error);
		}
	}

	// Start a new convo
	function handleNewConvo() {
		setActiveConvoId(undefined);
		params.setMessages([]);
		params.setViewMode("chat");
		saveActiveConvoId(undefined).catch(() => {
			// Ignore errors
		});
	}

	// Switch to an existing convo
	function handleSwitchConvo(convo: Convo) {
		setActiveConvoId(convo.id);
		params.setMessages(convo.messages);
		params.setViewMode("chat");
		saveActiveConvoId(convo.id).catch(() => {
			// Ignore errors
		});
	}

	// Get current convo title
	const currentTitle =
		activeConvoId !== undefined
			? convos.find(c => c.id === activeConvoId)?.title || "Conversation"
			: "New Conversation";

	return {
		convos,
		setConvos,
		activeConvoId,
		setActiveConvoId,
		currentTitle,
		handleNewConvo,
		handleSwitchConvo,
		reloadConvos,
		loadInitialConvos,
	};
}
