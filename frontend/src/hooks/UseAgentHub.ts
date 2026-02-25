import { useClient } from "../contexts/ClientContext";
import { useCurrentUser } from "../contexts/CurrentUserContext";
import type {
	AgentHubConvoSummary,
	AgentHubMode,
	AgentHubStreamCallbacks,
	AgentPlanPhase,
	CollabMessage,
	NavigationAction,
	PendingConfirmation,
} from "jolli-common";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * State returned by the useAgentHub hook
 */
export interface AgentHubState {
	/** List of all conversations (summary only) */
	readonly convos: ReadonlyArray<AgentHubConvoSummary>;
	/** Currently active conversation ID */
	readonly activeConvoId: number | undefined;
	/** Messages for the active conversation */
	readonly messages: ReadonlyArray<CollabMessage>;
	/** Current input text */
	readonly message: string;
	/** Content currently being streamed */
	readonly streamingContent: string;
	/** Whether a response is being generated */
	readonly isLoading: boolean;
	/** Error message if the last operation failed */
	readonly error: string | undefined;
	/** Pending navigation action from the agent */
	readonly pendingNavigation: NavigationAction | undefined;
	/** Current plan markdown from the agent */
	readonly plan: string | undefined;
	/** Current plan phase */
	readonly planPhase: AgentPlanPhase | undefined;
	/** Current conversation mode */
	readonly mode: AgentHubMode | undefined;
	/** Pending tool confirmations awaiting user approval */
	readonly pendingConfirmations: ReadonlyArray<PendingConfirmation>;
	/** Update the input text */
	readonly setMessage: (message: string) => void;
	/** Send the current message */
	readonly send: () => void;
	/** Start a new conversation */
	readonly newChat: () => void;
	/** Switch to a different conversation */
	readonly switchConvo: (id: number) => void;
	/** Delete a conversation */
	readonly deleteConvo: (id: number) => void;
	/** Stop the current stream */
	readonly stop: () => void;
	/** Clear a pending navigation action */
	readonly clearPendingNavigation: () => void;
	/** Retry an assistant response from a specific message index */
	readonly retry: (messageIndex: number) => void;
	/** Approve a pending tool confirmation */
	readonly approveConfirmation: (confirmationId: string) => void;
	/** Deny a pending tool confirmation */
	readonly denyConfirmation: (confirmationId: string) => void;
	/** Change the conversation mode */
	readonly setMode: (mode: AgentHubMode) => void;
}

/**
 * Custom hook that manages all Agent Hub state.
 * Handles conversation CRUD, message sending, SSE streaming, and navigation actions.
 */
export function useAgentHub(): AgentHubState {
	const client = useClient();
	const agentHub = client.agentHub();
	const { setAgentHubConversation } = useCurrentUser();

	const [convos, setConvos] = useState<ReadonlyArray<AgentHubConvoSummary>>([]);
	const [activeConvoId, setActiveConvoId] = useState<number | undefined>(undefined);
	const [messages, setMessages] = useState<ReadonlyArray<CollabMessage>>([]);
	const [message, setMessage] = useState("");
	const [streamingContent, setStreamingContent] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const [pendingNavigation, setPendingNavigation] = useState<NavigationAction | undefined>(undefined);
	const [plan, setPlan] = useState<string | undefined>(undefined);
	const [planPhase, setPlanPhase] = useState<AgentPlanPhase | undefined>(undefined);
	const [mode, setModeState] = useState<AgentHubMode | undefined>(undefined);
	const [pendingConfirmationsState, setPendingConfirmations] = useState<ReadonlyArray<PendingConfirmation>>([]);
	const abortRef = useRef(false);
	/** Tracks the active conversation so streaming callbacks can bail when the user switches away. */
	const activeConvoRef = useRef<number | undefined>(undefined);
	const seedAttemptedRef = useRef(false);
	const advancedConvosRef = useRef(new Set<number>());

	// Keep ref in sync so the mount effect can read the latest value
	activeConvoRef.current = activeConvoId;

	// Load conversations on mount and auto-seed Getting Started
	useEffect(() => {
		async function initConvos() {
			await loadConvos();
			// Auto-seed Getting Started if not attempted this session
			if (!seedAttemptedRef.current) {
				seedAttemptedRef.current = true;
				try {
					const seeded = await agentHub.seedConvo("getting_started");
					if (seeded) {
						await loadConvos();
						// Only auto-switch if user has no active conversation
						if (!activeConvoRef.current) {
							await switchConvo(seeded.id);
							// Auto-advance if freshly seeded (only has the intro message)
							if (seeded.messages.length === 1) {
								advance(seeded.id);
							}
						}
					}
				} catch {
					// Seeding is non-critical
				}
			}
		}
		initConvos();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	async function loadConvos() {
		try {
			const result = await agentHub.listConvos();
			setConvos(result);
		} catch {
			// Non-critical — sidebar will just be empty
		}
	}

	const switchConvo = useCallback(
		async (id: number) => {
			setActiveConvoId(id);
			activeConvoRef.current = id;
			setAgentHubConversation(id);
			setStreamingContent("");
			setError(undefined);
			setPendingConfirmations([]);
			try {
				const convo = await agentHub.getConvo(id);
				setMessages(convo.messages);
				setPlan(convo.metadata?.plan);
				setPlanPhase(convo.metadata?.planPhase);
				setModeState(convo.metadata?.mode);
			} catch {
				setMessages([]);
				setPlan(undefined);
				setPlanPhase(undefined);
				setModeState(undefined);
			}
		},
		[agentHub, setAgentHubConversation],
	);

	const newChat = useCallback(() => {
		setActiveConvoId(undefined);
		activeConvoRef.current = undefined;
		setMessages([]);
		setStreamingContent("");
		setMessage("");
		setError(undefined);
		setPlan(undefined);
		setPlanPhase(undefined);
		setModeState(undefined);
		setPendingConfirmations([]);
	}, []);

	const deleteConvo = useCallback(
		async (id: number) => {
			try {
				await agentHub.deleteConvo(id);
				setConvos(prev => prev.filter(c => c.id !== id));
				if (activeConvoId === id) {
					newChat();
				}
			} catch {
				// Non-critical
			}
		},
		[agentHub, activeConvoId, newChat],
	);

	const stop = useCallback(() => {
		abortRef.current = true;
	}, []);

	const clearPendingNavigation = useCallback(() => {
		setPendingNavigation(undefined);
	}, []);

	/**
	 * Creates streaming callbacks that guard against stale conversation state.
	 * If the user switches away from `convoId` mid-stream, callbacks silently no-op
	 * so that Chat A's response doesn't leak into Chat B's UI.
	 */
	function createStreamCallbacks(convoId: number, accumulator: { value: string }): AgentHubStreamCallbacks {
		function isStale(): boolean {
			return activeConvoRef.current !== convoId;
		}
		return {
			onChunk(content) {
				if (abortRef.current || isStale()) {
					return;
				}
				accumulator.value += content;
				setStreamingContent(accumulator.value);
			},
			onComplete(completeMessage) {
				if (isStale()) {
					return;
				}
				const assistantMessage: CollabMessage = {
					role: "assistant",
					content: completeMessage.content,
					timestamp: completeMessage.timestamp,
				};
				setMessages(prev => [...prev, assistantMessage]);
				setStreamingContent("");
			},
			onError(errorMsg) {
				if (isStale()) {
					return;
				}
				setError(errorMsg);
			},
			onNavigationAction(action) {
				if (isStale()) {
					return;
				}
				setPendingNavigation(action);
			},
			onPlanUpdate(p, ph) {
				if (isStale()) {
					return;
				}
				setPlan(p);
				setPlanPhase(ph);
			},
			onConfirmationRequired(confirmation) {
				if (isStale()) {
					return;
				}
				setPendingConfirmations(prev => [...prev, confirmation]);
			},
			onConfirmationResolved(confirmationId) {
				if (isStale()) {
					return;
				}
				setPendingConfirmations(prev => prev.filter(c => c.confirmationId !== confirmationId));
			},
			onModeChange(newMode) {
				if (isStale()) {
					return;
				}
				setModeState(newMode);
			},
		};
	}

	/**
	 * Auto-advance a seeded conversation by triggering the agent to proactively run tools.
	 * Idempotent: skips if already advanced for this convo in this session.
	 */
	const advance = useCallback(
		async (convoId: number) => {
			if (advancedConvosRef.current.has(convoId)) {
				return;
			}
			advancedConvosRef.current.add(convoId);
			setIsLoading(true);
			abortRef.current = false;

			const accumulator = { value: "" };

			try {
				setStreamingContent("");
				await agentHub.advanceConvo(convoId, createStreamCallbacks(convoId, accumulator));
			} catch {
				// Preserve any accumulated content
				if (accumulator.value) {
					setMessages(prev => [
						...prev,
						{ role: "assistant" as const, content: accumulator.value, timestamp: new Date().toISOString() },
					]);
					setStreamingContent("");
				}
			} finally {
				setIsLoading(false);
			}
		},
		[agentHub],
	);

	const retry = useCallback(
		async (messageIndex: number) => {
			if (!activeConvoId || isLoading) {
				return;
			}

			setError(undefined);
			setIsLoading(true);
			abortRef.current = false;

			// Optimistically truncate to the user message preceding messageIndex
			setMessages(prev => {
				for (let i = messageIndex - 1; i >= 0; i--) {
					if (prev[i].role === "user") {
						return prev.slice(0, i + 1);
					}
				}
				return prev;
			});

			const accumulator = { value: "" };

			try {
				setStreamingContent("");
				await agentHub.retryMessage(
					activeConvoId,
					messageIndex,
					createStreamCallbacks(activeConvoId, accumulator),
				);
			} catch {
				setError("Failed to retry message. Please try again.");
				if (accumulator.value) {
					setMessages(prev => [
						...prev,
						{ role: "assistant" as const, content: accumulator.value, timestamp: new Date().toISOString() },
					]);
					setStreamingContent("");
				}
			} finally {
				setIsLoading(false);
			}
		},
		[activeConvoId, isLoading, agentHub],
	); // eslint-disable-line react-hooks/exhaustive-deps

	const send = useCallback(async () => {
		const trimmedMessage = message.trim();
		if (!trimmedMessage || isLoading) {
			return;
		}

		setError(undefined);
		setIsLoading(true);
		setMessage("");
		abortRef.current = false;

		// Add user message optimistically
		const userMessage: CollabMessage = {
			role: "user",
			content: trimmedMessage,
			timestamp: new Date().toISOString(),
		};
		setMessages(prev => [...prev, userMessage]);

		let convoId = activeConvoId;
		const accumulator = { value: "" };

		try {
			// Create a new conversation if needed
			if (!convoId) {
				const title = trimmedMessage.length <= 50 ? trimmedMessage : `${trimmedMessage.slice(0, 47)}...`;
				const newConvo = await agentHub.createConvo(title);
				convoId = newConvo.id;
				setActiveConvoId(convoId);
				activeConvoRef.current = convoId;
				// New convos are exec mode — no forced plan phase
				setModeState("exec");
			}
			setAgentHubConversation(convoId);

			// Send message with streaming callbacks
			setStreamingContent("");
			await agentHub.sendMessage(convoId, trimmedMessage, createStreamCallbacks(convoId, accumulator));
		} catch {
			setError("Failed to send message. Please try again.");
			// If streaming was in progress, preserve accumulated content as a message
			if (accumulator.value) {
				setMessages(prev => [
					...prev,
					{ role: "assistant" as const, content: accumulator.value, timestamp: new Date().toISOString() },
				]);
				setStreamingContent("");
			}
		} finally {
			setIsLoading(false);
			// Always refresh conversation list so newly created convos and titles appear
			loadConvos();
		}
	}, [message, isLoading, activeConvoId, agentHub, setAgentHubConversation]); // eslint-disable-line react-hooks/exhaustive-deps

	const approveConfirmation = useCallback(
		async (confirmationId: string) => {
			if (!activeConvoId) {
				return;
			}
			setPendingConfirmations(prev => prev.filter(c => c.confirmationId !== confirmationId));
			try {
				await agentHub.respondToConfirmation(activeConvoId, confirmationId, true);
			} catch {
				// Non-critical — the stream will handle the timeout
			}
		},
		[activeConvoId, agentHub],
	);

	const denyConfirmation = useCallback(
		async (confirmationId: string) => {
			if (!activeConvoId) {
				return;
			}
			setPendingConfirmations(prev => prev.filter(c => c.confirmationId !== confirmationId));
			try {
				await agentHub.respondToConfirmation(activeConvoId, confirmationId, false);
			} catch {
				// Non-critical
			}
		},
		[activeConvoId, agentHub],
	);

	const setMode = useCallback(
		async (newMode: AgentHubMode) => {
			if (!activeConvoId) {
				return;
			}
			setModeState(newMode);
			try {
				await agentHub.setMode(activeConvoId, newMode);
			} catch {
				// Revert on failure — re-fetch the convo to get the actual mode
				try {
					const convo = await agentHub.getConvo(activeConvoId);
					setModeState(convo.metadata?.mode);
				} catch {
					// Non-critical
				}
			}
		},
		[activeConvoId, agentHub],
	);

	return {
		convos,
		activeConvoId,
		messages,
		message,
		streamingContent,
		isLoading,
		error,
		pendingNavigation,
		plan,
		planPhase,
		mode,
		pendingConfirmations: pendingConfirmationsState,
		setMessage,
		send,
		newChat,
		switchConvo,
		deleteConvo,
		stop,
		clearPendingNavigation,
		retry,
		approveConfirmation,
		denyConfirmation,
		setMode,
	};
}
