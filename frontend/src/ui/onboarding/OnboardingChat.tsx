/**
 * OnboardingChat - Chat component for the onboarding flow.
 *
 * Displays a chat interface where users can interact with the onboarding agent.
 * Supports streaming responses via SSE, displays tool call results, timestamps,
 * and action buttons in assistant messages.
 */

import { Button } from "../../components/ui/Button";
import { useClient } from "../../contexts/ClientContext";
import type {
	OnboardingChatAction,
	OnboardingChatMessage,
	OnboardingFsmTransition,
	OnboardingSSEEvent,
	OnboardingState,
	OnboardingToolCall,
	OnboardingToolResult,
	OnboardingUIAction,
} from "jolli-common";
import { forwardRef, type ReactElement, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Message type for the chat UI.
 */
interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	toolCalls?: Array<OnboardingToolCall> | undefined;
	actions?: Array<OnboardingChatAction> | undefined;
	isStreaming?: boolean | undefined;
}

/**
 * Props for OnboardingChat.
 */
export interface OnboardingChatProps {
	/** Initial onboarding state */
	initialState?: OnboardingState | undefined;
	/** Called when onboarding is completed or skipped */
	onComplete?: (() => void) | undefined;
	/** Called when an error occurs */
	onError?: ((error: string) => void) | undefined;
	/** Called when an action button is clicked */
	onAction?: ((action: string) => void) | undefined;
	/** Called when a UI action is triggered by the agent */
	onUIAction?: ((action: OnboardingUIAction) => void) | undefined;
	/** Called when a tool is called by the agent */
	onToolCall?: ((toolCall: OnboardingToolCall) => void) | undefined;
	/** Called when a tool result is received */
	onToolResult?: ((toolResult: OnboardingToolResult) => void) | undefined;
	/** Called when the onboarding state is updated (e.g., after each chat turn) */
	onStateUpdate?: ((state: OnboardingState) => void) | undefined;
	/** Called when an FSM transition occurs (for dev logging) */
	onFsmTransition?: ((transition: OnboardingFsmTransition) => void) | undefined;
}

/**
 * Handle for imperatively controlling the chat.
 */
export interface OnboardingChatHandle {
	/** Send a message to the chat */
	sendMessage: (message: string) => void;
}

/**
 * Get a user-friendly tool name.
 */
function getToolDisplayName(toolName: string, content: ReturnType<typeof useIntlayer<"onboarding">>): string {
	const toolNames: Record<string, string> = {
		connect_github: content.toolConnectGithub.value,
		list_repos: content.toolListRepos.value,
		scan_repository: content.toolScanRepository.value,
		import_markdown: content.toolImportMarkdown.value,
		import_all_markdown: content.toolImportAllMarkdown.value,
		generate_article: content.toolGenerateArticle.value,
		advance_step: content.toolAdvanceStep.value,
		skip_onboarding: content.toolSkipOnboarding.value,
		complete_onboarding: content.toolCompleteOnboarding.value,
		check_github_status: content.toolCheckGithubStatus.value,
		install_github_app: content.toolInstallGithubApp.value,
		connect_github_repo: content.toolConnectGithubRepo.value,
		get_or_create_space: content.toolGetOrCreateSpace.value,
		gap_analysis: content.toolGapAnalysis.value,
		generate_from_code: content.toolGenerateFromCode.value,
		check_sync_triggered: content.toolCheckSyncTriggered.value,
	};
	return toolNames[toolName] ?? toolName;
}

/**
 * Generate a unique message ID.
 */
function generateId(): string {
	return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(date: Date): string {
	return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export const OnboardingChat = forwardRef<OnboardingChatHandle, OnboardingChatProps>(function OnboardingChat(
	{
		initialState,
		onComplete,
		onError,
		onAction,
		onUIAction,
		onToolCall,
		onToolResult,
		onStateUpdate,
		onFsmTransition,
	},
	ref,
): ReactElement {
	const content = useIntlayer("onboarding");
	const client = useClient();

	const [messages, setMessages] = useState<Array<ChatMessage>>([]);
	const [inputValue, setInputValue] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isComplete, setIsComplete] = useState(
		initialState?.status === "completed" || initialState?.status === "skipped",
	);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Focus input on mount and when loading completes
	useEffect(() => {
		if (!isLoading) {
			inputRef.current?.focus();
		}
	}, [isLoading]);

	// Send initial greeting if no messages and not complete
	useEffect(() => {
		if (messages.length === 0 && !isComplete && !isLoading) {
			// Send a greeting to start the conversation
			handleSendMessage("Hi, I'm ready to get started!");
		}
		// Only run on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/**
	 * Convert ChatMessage array to OnboardingChatMessage array for API.
	 */
	function toApiMessages(msgs: Array<ChatMessage>): Array<OnboardingChatMessage> {
		return msgs.map(msg => ({
			role: msg.role,
			content: msg.content,
			toolCalls: msg.toolCalls,
		}));
	}

	/**
	 * Handle an action button click.
	 */
	function handleActionClick(action: string): void {
		onAction?.(action);
		// Send the action as a message to continue the conversation
		handleSendMessage(action);
	}

	/**
	 * Handle sending a message.
	 */
	const handleSendMessage = useCallback(
		async (messageText?: string) => {
			const text = messageText ?? inputValue.trim();
			if (!text || isLoading) {
				return;
			}

			setInputValue("");
			setIsLoading(true);

			// Add user message
			const userMessage: ChatMessage = {
				id: generateId(),
				role: "user",
				content: text,
				timestamp: new Date(),
			};
			setMessages(prev => [...prev, userMessage]);

			// Create placeholder for assistant response
			const assistantId = generateId();
			setMessages(prev => [
				...prev,
				{
					id: assistantId,
					role: "assistant",
					content: "",
					timestamp: new Date(),
					isStreaming: true,
				},
			]);

			try {
				// Get current messages for context (excluding the streaming placeholder)
				const history = toApiMessages(messages);

				// Stream response from API
				const stream = client.onboarding().chat(text, history);

				let fullContent = "";
				const toolCalls: Array<OnboardingToolCall> = [];

				for await (const event of stream) {
					handleSSEEvent(event, assistantId, fullContent, toolCalls, newContent => {
						fullContent = newContent;
					});
				}

				// Finalize the assistant message
				setMessages(prev =>
					prev.map(msg =>
						msg.id === assistantId
							? {
									...msg,
									content: fullContent,
									toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
									isStreaming: false,
								}
							: msg,
					),
				);
			} catch (error) {
				console.error("Chat error:", error);

				// Update assistant message with error
				setMessages(prev =>
					prev.map(msg =>
						msg.id === assistantId
							? {
									...msg,
									content: content.errorGeneric.value,
									isStreaming: false,
								}
							: msg,
					),
				);

				onError?.(error instanceof Error ? error.message : "Unknown error");
			} finally {
				setIsLoading(false);
			}
		},
		[inputValue, isLoading, messages, client, content.errorGeneric.value, onError],
	);

	// Expose imperative handle for parent to send messages
	useImperativeHandle(
		ref,
		() => ({
			sendMessage: (message: string) => {
				handleSendMessage(message);
			},
		}),
		[handleSendMessage],
	);

	/**
	 * Handle SSE event from the stream.
	 */
	function handleSSEEvent(
		event: OnboardingSSEEvent,
		assistantId: string,
		currentContent: string,
		toolCalls: Array<OnboardingToolCall>,
		setContent: (content: string) => void,
	): void {
		switch (event.type) {
			case "content":
				if (event.content) {
					const newContent = currentContent + event.content;
					setContent(newContent);
					setMessages(prev =>
						prev.map(msg =>
							msg.id === assistantId
								? {
										...msg,
										content: newContent,
									}
								: msg,
						),
					);
				}
				break;

			case "tool_call":
				if (event.toolCall) {
					toolCalls.push(event.toolCall);
					onToolCall?.(event.toolCall);
				}
				break;

			case "tool_result":
				// Tool results are handled by the LLM, but notify parent for job tracking
				if (event.toolResult) {
					onToolResult?.(event.toolResult);
				}
				break;

			case "ui_action":
				if (event.uiAction) {
					onUIAction?.(event.uiAction);
				}
				break;

			case "fsm_transition":
				if (event.fsmTransition) {
					onFsmTransition?.(event.fsmTransition);
				}
				break;

			case "done":
				if (event.state) {
					onStateUpdate?.(event.state);
				}
				if (event.state?.status === "completed" || event.state?.status === "skipped") {
					setIsComplete(true);
					onComplete?.();
				}
				break;

			case "error":
				console.error("SSE error:", event.error);
				onError?.(event.error ?? "Unknown error");
				break;
		}
	}

	/**
	 * Handle form submit.
	 */
	function handleSubmit(e: React.FormEvent): void {
		e.preventDefault();
		handleSendMessage();
	}

	/**
	 * Handle key press in input.
	 */
	function handleKeyPress(e: React.KeyboardEvent): void {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	}

	return (
		<div className="flex flex-col h-full" data-testid="onboarding-chat">
			{/* Messages area */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{messages.map(msg => (
					<div
						key={msg.id}
						className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
						data-testid={`chat-message-${msg.role}`}
					>
						<div
							className={`max-w-[80%] rounded-lg p-3 ${
								msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
							}`}
						>
							{/* Message content */}
							<div className="whitespace-pre-wrap">
								{msg.content || (msg.isStreaming ? content.thinking.value : "")}
							</div>

							{/* Tool calls */}
							{msg.toolCalls && msg.toolCalls.length > 0 && (
								<div className="mt-2 pt-2 border-t border-border/50 text-xs opacity-70">
									{msg.toolCalls.map(tc => (
										<div key={tc.id} className="flex items-center gap-1">
											<span>{content.toolCallPrefix.value}</span>
											<span className="font-medium">{getToolDisplayName(tc.name, content)}</span>
										</div>
									))}
								</div>
							)}

							{/* Action buttons */}
							{msg.actions && msg.actions.length > 0 && !msg.isStreaming && (
								<div className="mt-3 flex flex-wrap gap-2" data-testid="message-actions">
									{msg.actions.map(action => (
										<Button
											key={action.action}
											variant="outline"
											size="sm"
											onClick={() => handleActionClick(action.action)}
											disabled={isLoading}
											data-testid={`action-${action.action}`}
										>
											{action.label}
										</Button>
									))}
								</div>
							)}
						</div>

						{/* Timestamp */}
						<span
							className="text-xs text-muted-foreground mt-1 px-1"
							data-testid={`message-timestamp-${msg.id}`}
						>
							{formatTimestamp(msg.timestamp)}
						</span>
					</div>
				))}
				<div ref={messagesEndRef} />
			</div>

			{/* Input area */}
			{!isComplete && (
				<form onSubmit={handleSubmit} className="border-t p-4">
					<div className="flex gap-2">
						<input
							ref={inputRef}
							type="text"
							value={inputValue}
							onChange={e => setInputValue(e.target.value)}
							onKeyPress={handleKeyPress}
							placeholder={content.chatPlaceholder.value}
							aria-label={content.chatInputLabel.value}
							disabled={isLoading}
							className="flex-1 rounded-lg border bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
							data-testid="chat-input"
						/>
						<Button type="submit" disabled={isLoading || !inputValue.trim()} data-testid="chat-send-button">
							{isLoading ? content.thinking.value : content.send.value}
						</Button>
					</div>
				</form>
			)}
		</div>
	);
});
