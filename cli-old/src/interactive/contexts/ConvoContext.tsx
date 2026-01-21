import { useConvoResume } from "../hooks/useConvoResume";
import { useConvos } from "../hooks/useConvos";
import { useChatContext } from "./ChatContext";
import { useSystemContext } from "./SystemContext";
import type { Client, Convo } from "jolli-common";
import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext, useEffect } from "react";

export interface ConvoContextValue {
	convos: Array<Convo>;
	setConvos: Dispatch<SetStateAction<Array<Convo>>>;
	activeConvoId: number | undefined;
	setActiveConvoId: Dispatch<SetStateAction<number | undefined>>;
	currentTitle: string;
	handleNewConvo: () => void;
	handleSwitchConvo: (convo: Convo) => void;
	reloadConvos: () => Promise<void>;
	pendingResumeConvo: Convo | null;
	setPendingResumeConvo: Dispatch<SetStateAction<Convo | null>>;
	handleResumeResponse: (userMessage: string) => Promise<boolean>;
}

export const ConvoContext = createContext<ConvoContextValue | undefined>(undefined);

export function useConvoContext(): ConvoContextValue {
	const context = useContext(ConvoContext);
	if (!context) {
		throw new Error("useConvoContext must be used within a ConvoProvider");
	}
	return context;
}

interface ConvoProviderProps {
	client: Client;
	children: React.ReactNode;
}

/**
 * ConvoProvider manages convos list, active conversation, and resume functionality
 * It orchestrates convo state and interactions with the chat system
 */
export function ConvoProvider({ client, children }: ConvoProviderProps): React.ReactElement {
	const { setMessages } = useChatContext();
	const { setViewMode, setSystemMessage } = useSystemContext();

	const convosHook = useConvos({
		client,
		setMessages,
		setViewMode,
	});

	const resumeHook = useConvoResume();

	// Load initial convos on mount
	useEffect(() => {
		convosHook.loadInitialConvos(setSystemMessage, resumeHook.setPendingResumeConvo).then();
	}, [client]);

	// Simplified handleResumeResponse that uses contexts internally
	const handleResumeResponse = (userMessage: string): Promise<boolean> => {
		return resumeHook.handleResumeResponse(userMessage, setMessages, convosHook.setActiveConvoId, setSystemMessage);
	};

	const value: ConvoContextValue = {
		convos: convosHook.convos,
		setConvos: convosHook.setConvos,
		activeConvoId: convosHook.activeConvoId,
		setActiveConvoId: convosHook.setActiveConvoId,
		currentTitle: convosHook.currentTitle,
		handleNewConvo: convosHook.handleNewConvo,
		handleSwitchConvo: convosHook.handleSwitchConvo,
		reloadConvos: convosHook.reloadConvos,
		pendingResumeConvo: resumeHook.pendingResumeConvo,
		setPendingResumeConvo: resumeHook.setPendingResumeConvo,
		handleResumeResponse,
	};

	return <ConvoContext.Provider value={value}>{children}</ConvoContext.Provider>;
}
