import { useClient } from "../../contexts/ClientContext";
import { useCurrentUser } from "../../contexts/CurrentUserContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { useAgentHub } from "../../hooks/UseAgentHub";
import { type DateGroupLabels, groupConvosByDate } from "../../util/ConvoDateGroupUtil";
import { AgentConversation } from "./AgentConversation";
import { AgentInput } from "./AgentInput";
import { AgentPlanDialog } from "./AgentPlanDialog";
import { AgentSidebar } from "./AgentSidebar";
import { AgentWelcome } from "./AgentWelcome";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";
import "./AgentPage.css";

/**
 * Extracts a title from markdown content.
 * Uses the first heading, or first line truncated to 50 chars, or "Untitled Draft".
 */
function extractTitleFromContent(content: string): string {
	// Try to find the first markdown heading
	const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
	if (headingMatch) {
		return headingMatch[1].trim().slice(0, 100);
	}

	// Fall back to first line, truncated
	const firstLine = content.split("\n").find(line => line.trim().length > 0);
	if (firstLine) {
		const trimmed = firstLine.trim();
		return trimmed.length <= 50 ? trimmed : `${trimmed.slice(0, 47)}...`;
	}

	return "Untitled Draft";
}

/**
 * Main Agent Hub page.
 * Displays a conversation sidebar and a main chat area with welcome screen or active conversation.
 */
export function AgentPage(): ReactElement {
	const content = useIntlayer("agent-page");
	const client = useClient();
	const { markAgentNavigating, deactivateAgentHub } = useCurrentUser();
	const { navigate } = useNavigation();

	const inputRef = useRef<HTMLTextAreaElement>(null);

	const {
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
		pendingConfirmations,
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
	} = useAgentHub();

	const [planDialogOpen, setPlanDialogOpen] = useState(false);

	// Navigate when the agent triggers a navigation action.
	// Delay briefly so the user sees the agent's response before being navigated away.
	// clearPendingNavigation is called inside the timer callback — calling it earlier
	// would trigger a re-render whose effect cleanup cancels the timer.
	useEffect(() => {
		if (pendingNavigation) {
			const { path } = pendingNavigation;
			const timer = setTimeout(() => {
				clearPendingNavigation();
				markAgentNavigating();
				navigate(path);
			}, 800);
			return () => clearTimeout(timer);
		}
	}, [pendingNavigation, navigate, clearPendingNavigation, markAgentNavigating]);

	// When AgentPage unmounts (user or agent navigates away), deactivate the context.
	// If the agent triggered the navigation, markAgentNavigating() will have set the ref
	// so deactivateAgentHub() skips deactivation — keeping the context active.
	useEffect(() => {
		return () => deactivateAgentHub();
	}, [deactivateAgentHub]);

	// Auto-focus input when landing on Agent Hub with no active conversation.
	useEffect(() => {
		if (!activeConvoId) {
			queueMicrotask(() => inputRef.current?.focus());
		}
	}, [activeConvoId]);

	const dateLabels: DateGroupLabels = {
		today: content.today.value,
		yesterday: content.yesterday.value,
		thisWeek: content.thisWeek.value,
		thisMonth: content.thisMonth.value,
		older: content.older.value,
	};

	const groups = groupConvosByDate(convos, dateLabels);

	/** Start a new chat and auto-focus the input textarea. */
	function handleNewChat() {
		newChat();
		queueMicrotask(() => inputRef.current?.focus());
	}

	/** Set the message from a suggestion card and focus the textarea with cursor at end. */
	function handleSuggestionClick(prompt: string) {
		setMessage(prompt);
		queueMicrotask(() => {
			const textarea = inputRef.current;
			if (textarea) {
				textarea.focus();
				textarea.setSelectionRange(prompt.length, prompt.length);
			}
		});
	}

	const handleCreateArticle = useCallback(
		async (articleContent: string) => {
			try {
				const title = extractTitleFromContent(articleContent);
				const draft = await client.docDrafts().createDocDraft({
					title,
					content: articleContent,
					contentType: "text/markdown",
				});
				navigate(`/article-draft/${draft.id}`);
			} catch {
				// Silently fail — user can still copy content manually
			}
		},
		[client, navigate],
	);

	return (
		<div className="flex h-full" data-testid="agent-page">
			{/* Sidebar */}
			<AgentSidebar
				groups={groups}
				activeConvoId={activeConvoId}
				planPhase={planPhase}
				plan={plan}
				onNewChat={handleNewChat}
				onSelectConvo={switchConvo}
				onDeleteConvo={deleteConvo}
				onOpenPlan={() => setPlanDialogOpen(true)}
			/>

			{/* Main Content */}
			<div className="flex flex-1 flex-col min-w-0">
				{activeConvoId ? (
					<AgentConversation
						messages={messages}
						streamingContent={streamingContent}
						isLoading={isLoading}
						onCreateArticle={handleCreateArticle}
						onRetry={retry}
						pendingConfirmations={pendingConfirmations}
						onApproveConfirmation={approveConfirmation}
						onDenyConfirmation={denyConfirmation}
					/>
				) : (
					<AgentWelcome onSuggestionClick={handleSuggestionClick} />
				)}

				{/* Error display */}
				{error && (
					<div className="mx-auto max-w-3xl px-4 pb-1 text-xs text-destructive" data-testid="agent-error">
						{content.errorSending}
					</div>
				)}

				{/* Input */}
				<AgentInput
					message={message}
					isLoading={isLoading}
					onMessageChange={setMessage}
					onSend={send}
					onStop={stop}
					inputRef={inputRef}
					mode={activeConvoId ? mode : undefined}
					planPhase={planPhase}
					onSetMode={setMode}
					onOpenPlan={() => setPlanDialogOpen(true)}
				/>
			</div>

			{/* Plan Dialog */}
			{planPhase && (
				<AgentPlanDialog open={planDialogOpen} onOpenChange={setPlanDialogOpen} plan={plan} phase={planPhase} />
			)}
		</div>
	);
}
