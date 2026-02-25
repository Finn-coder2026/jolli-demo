import { AgentConfirmationCard } from "./AgentConfirmationCard";
import { AgentMessage } from "./AgentMessage";
import type { CollabMessage, PendingConfirmation } from "jolli-common";
import { ArrowDown } from "lucide-react";
import { type ReactElement, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

/** No-op fallback for optional callbacks */
function noop(): void {
	/* intentionally empty */
}

/** Stable timestamp for synthetic streaming messages to prevent key churn */
const STREAMING_TIMESTAMP = "__streaming__";

/** Display message with its original index in the unfiltered message array */
interface DisplayMessage extends CollabMessage {
	readonly originalIndex: number;
}

export interface AgentConversationProps {
	/** Messages to display */
	messages: ReadonlyArray<CollabMessage>;
	/** Content currently being streamed (appended to last assistant message) */
	streamingContent: string;
	/** Whether a response is currently streaming */
	isLoading: boolean;
	/** Callback to create an article from message content */
	onCreateArticle?: (content: string) => void;
	/** Callback to retry from a specific assistant message (receives the original message index) */
	onRetry?: (messageIndex: number) => void;
	/** Pending tool confirmations to display inline */
	pendingConfirmations?: ReadonlyArray<PendingConfirmation>;
	/** Called when user approves a confirmation */
	onApproveConfirmation?: (confirmationId: string) => void;
	/** Called when user denies a confirmation */
	onDenyConfirmation?: (confirmationId: string) => void;
}

/**
 * Displays the conversation message list with auto-scroll behavior.
 * Auto-scrolls to bottom on new messages unless the user has scrolled up.
 */
export function AgentConversation({
	messages,
	streamingContent,
	isLoading,
	onCreateArticle,
	onRetry,
	pendingConfirmations,
	onApproveConfirmation,
	onDenyConfirmation,
}: AgentConversationProps): ReactElement {
	const content = useIntlayer("agent-page");
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const isUserScrolledUp = useRef(false);

	/** Scrolls the message list to the bottom */
	const scrollToBottom = useCallback(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		isUserScrolledUp.current = false;
		setShowScrollButton(false);
	}, []);

	// Detect manual scroll to pause auto-scroll
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) {
			return;
		}

		function handleScroll() {
			if (!container) {
				return;
			}
			const { scrollTop, scrollHeight, clientHeight } = container;
			const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;

			if (isAtBottom) {
				isUserScrolledUp.current = false;
				setShowScrollButton(false);
			} else {
				isUserScrolledUp.current = true;
				setShowScrollButton(true);
			}
		}

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, []);

	// Auto-scroll when new content arrives (unless user scrolled up)
	useAutoScroll(bottomRef, isUserScrolledUp, messages, streamingContent);

	// Build display messages, memoized to avoid rebuilding on every render
	const displayMessages = useMemo(
		() => buildDisplayMessages(messages, streamingContent, isLoading),
		[messages, streamingContent, isLoading],
	);

	return (
		<div className="relative flex-1 overflow-hidden">
			<div
				ref={scrollContainerRef}
				className="h-full overflow-y-auto scrollbar-thin px-4 py-4"
				data-testid="agent-conversation"
			>
				<div className="mx-auto max-w-3xl space-y-4">
					{displayMessages.map((msg, i) => (
						<AgentMessage
							key={`${msg.role}-${msg.timestamp}`}
							role={msg.role}
							content={msg.content || ""}
							isStreaming={isLoading && i === displayMessages.length - 1 && msg.role === "assistant"}
							onCreateArticle={onCreateArticle}
							onRetry={
								!isLoading && msg.role === "assistant" && onRetry
									? () => onRetry(msg.originalIndex)
									: undefined
							}
						/>
					))}
					{/* Render pending confirmation cards inline after the last message */}
					{isLoading &&
						pendingConfirmations?.map(c => (
							<AgentConfirmationCard
								key={c.confirmationId}
								confirmation={c}
								onApprove={onApproveConfirmation ?? noop}
								onDeny={onDenyConfirmation ?? noop}
							/>
						))}
					<div ref={bottomRef} />
				</div>
			</div>

			{/* Scroll to bottom button */}
			{showScrollButton && (
				<button
					type="button"
					onClick={scrollToBottom}
					className="agent-scroll-btn absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-background/90 border border-border px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur-sm hover:text-foreground"
					data-testid="scroll-to-bottom"
					aria-label={content.scrollToBottom.value}
				>
					<ArrowDown className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);
}

/**
 * Auto-scrolls the conversation to the bottom when new content arrives,
 * unless the user has manually scrolled up.
 * Uses requestAnimationFrame to throttle scroll calls during streaming (~60/sec max).
 * Scrolls immediately when a new message is added (messages length change).
 */
function useAutoScroll(
	bottomRef: RefObject<HTMLDivElement | null>,
	isUserScrolledUp: RefObject<boolean>,
	messages: ReadonlyArray<CollabMessage>,
	streamingContent: string,
) {
	const rafRef = useRef<number | null>(null);
	const prevMessagesLengthRef = useRef(messages.length);

	// Immediate scroll on new messages (length change)
	useEffect(() => {
		if (messages.length !== prevMessagesLengthRef.current) {
			prevMessagesLengthRef.current = messages.length;
			if (!isUserScrolledUp.current) {
				bottomRef.current?.scrollIntoView({ behavior: "auto" });
			}
		}
	}, [messages.length, bottomRef, isUserScrolledUp]);

	// rAF-throttled scroll during streaming content updates
	useEffect(() => {
		if (!streamingContent || isUserScrolledUp.current) {
			return;
		}

		if (rafRef.current === null) {
			rafRef.current = requestAnimationFrame(() => {
				rafRef.current = null;
				if (!isUserScrolledUp.current) {
					bottomRef.current?.scrollIntoView({ behavior: "auto" });
				}
			});
		}

		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [streamingContent, bottomRef, isUserScrolledUp]);
}

/**
 * Builds the display message list for rendering.
 * Filters out system/tool messages, annotates each with its original index,
 * and appends streaming content.
 * Uses a stable timestamp for synthetic streaming messages to prevent key churn.
 */
function buildDisplayMessages(
	messages: ReadonlyArray<CollabMessage>,
	streamingContent: string,
	isLoading: boolean,
): ReadonlyArray<DisplayMessage> {
	// Filter to user/assistant messages, preserving original indices
	const visible: Array<DisplayMessage> = [];
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (m.role === "user" || m.role === "assistant") {
			visible.push({ ...m, originalIndex: i });
		}
	}

	// If streaming, append or update streaming content
	if (isLoading && streamingContent) {
		const lastMsg = visible[visible.length - 1];
		if (lastMsg?.timestamp === STREAMING_TIMESTAMP) {
			// Update the existing synthetic streaming message with new content
			return [...visible.slice(0, -1), { ...lastMsg, content: streamingContent }];
		}
		// Append new streaming assistant message with stable timestamp and -1 as synthetic index
		return [
			...visible,
			{
				role: "assistant" as const,
				content: streamingContent,
				timestamp: STREAMING_TIMESTAMP,
				originalIndex: -1,
			},
		];
	}

	// If loading but no content yet, show typing indicator
	if (isLoading && !streamingContent) {
		const lastMsg = visible[visible.length - 1];
		if (lastMsg?.role !== "assistant") {
			return [
				...visible,
				{ role: "assistant" as const, content: "", timestamp: STREAMING_TIMESTAMP, originalIndex: -1 },
			];
		}
	}

	return visible;
}
