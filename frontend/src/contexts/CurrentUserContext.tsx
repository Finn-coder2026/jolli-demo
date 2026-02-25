import type { AgentHubContext, JolliCurrentUserContext } from "jolli-common";
import {
	createContext,
	type ReactElement,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";

interface CurrentUserContextType {
	/** The current user context state (read-only). */
	userContext: JolliCurrentUserContext;
	/** Sets the Agent Hub conversation and marks it as active. */
	setAgentHubConversation(conversationId: number): void;
	/**
	 * Marks that the agent is about to navigate the user away.
	 * The next deactivateAgentHub() call will be skipped so the context stays active.
	 */
	markAgentNavigating(): void;
	/**
	 * Deactivates the Agent Hub context (sets active=false).
	 * Skipped if markAgentNavigating() was called since the last deactivation.
	 */
	deactivateAgentHub(): void;
	/** Resets the entire context (e.g., on logout or session expiry). */
	clearContext(): void;
}

const CurrentUserContext = createContext<CurrentUserContextType | undefined>(undefined);

/**
 * Provides JolliCurrentUserContext state to the component tree.
 * Tracks Agent Hub conversation context so that pages navigated to from the Agent Hub
 * can detect they are operating within an Agent Hub conversation.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }): ReactElement {
	const [agentHubContext, setAgentHubContext] = useState<AgentHubContext | undefined>(undefined);

	// Ref-based flag: true when the agent triggered the navigation (not the user).
	// Using a ref avoids re-renders — this is a transient synchronous signal consumed
	// in the same render cycle by deactivateAgentHub().
	const agentNavigatingRef = useRef(false);

	const setAgentHubConversation = useCallback((conversationId: number) => {
		setAgentHubContext({ conversationId, active: true });
	}, []);

	const markAgentNavigating = useCallback(() => {
		agentNavigatingRef.current = true;
	}, []);

	const deactivateAgentHub = useCallback(() => {
		if (agentNavigatingRef.current) {
			// Agent triggered the navigation — keep context active
			agentNavigatingRef.current = false;
			return;
		}
		setAgentHubContext(prev => (prev ? { ...prev, active: false } : prev));
	}, []);

	const clearContext = useCallback(() => {
		setAgentHubContext(undefined);
		agentNavigatingRef.current = false;
	}, []);

	const userContext: JolliCurrentUserContext = useMemo(
		() => (agentHubContext ? { agentHubContext } : {}),
		[agentHubContext],
	);

	const value: CurrentUserContextType = useMemo(
		() => ({
			userContext,
			setAgentHubConversation,
			markAgentNavigating,
			deactivateAgentHub,
			clearContext,
		}),
		[userContext, setAgentHubConversation, markAgentNavigating, deactivateAgentHub, clearContext],
	);

	return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

/**
 * Hook to access the current user context.
 * Must be used within a CurrentUserProvider.
 */
export function useCurrentUser(): CurrentUserContextType {
	const context = useContext(CurrentUserContext);
	if (context === undefined) {
		throw new Error("useCurrentUser must be used within a CurrentUserProvider");
	}
	return context;
}
