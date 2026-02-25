import { cn } from "../../common/ClassNameUtils";
import { MarkdownContent } from "../../components/MarkdownContent";
import { useNavigation } from "../../contexts/NavigationContext";
import { Check, Copy, FileText, RefreshCw } from "lucide-react";
import { memo, type ReactElement, useCallback, useState } from "react";
import { useIntlayer } from "react-intlayer";

/** Inline tooltip button — renders tooltip within the DOM tree to avoid Radix portal hover conflicts */
function ActionButton({
	onClick,
	label,
	testId,
	children,
}: {
	readonly onClick: () => void;
	readonly label: string;
	readonly testId: string;
	readonly children: ReactElement;
}): ReactElement {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group/btn relative rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
			data-testid={testId}
			aria-label={label}
		>
			{children}
			<span
				role="tooltip"
				className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground opacity-0 transition-opacity group-hover/btn:opacity-100"
			>
				{label}
			</span>
		</button>
	);
}

export interface AgentMessageProps {
	/** Message role (user or assistant) */
	role: string;
	/** Message content text */
	content: string;
	/** Whether this message is currently streaming */
	isStreaming?: boolean;
	/** Callback to create an article from message content */
	onCreateArticle?: ((content: string) => void) | undefined;
	/** Callback to retry from this assistant message */
	onRetry?: (() => void) | undefined;
}

/**
 * Renders a single chat message with role-based styling.
 * User messages appear right-aligned; assistant messages left-aligned with markdown rendering.
 * Internal links (starting with /) are intercepted for SPA navigation.
 * Memoized to prevent re-renders of unchanged messages during streaming.
 */
export const AgentMessage = memo(function AgentMessage({
	role,
	content: messageContent,
	isStreaming,
	onCreateArticle,
	onRetry,
}: AgentMessageProps): ReactElement {
	const intl = useIntlayer("agent-page");
	const { navigate } = useNavigation();
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(messageContent);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [messageContent]);

	const handleCreateArticle = useCallback(() => {
		onCreateArticle?.(messageContent);
	}, [messageContent, onCreateArticle]);

	/** Intercept clicks on internal links for SPA navigation */
	const handleContentClick = useCallback(
		(e: React.MouseEvent) => {
			const target = e.target as HTMLElement;
			const anchor = target.closest("a");
			if (!anchor) {
				return;
			}
			const href = anchor.getAttribute("href");
			if (href?.startsWith("/")) {
				e.preventDefault();
				navigate(href);
			}
		},
		[navigate],
	);

	const isUser = role === "user";

	return (
		<div
			className={cn("group flex w-full gap-3 agent-message-enter", isUser ? "justify-end" : "justify-start")}
			data-testid="agent-message"
			data-role={role}
		>
			<div className={cn("max-w-3xl", isUser ? "max-w-md" : "flex-1")}>
				<div
					className={cn(
						"rounded-2xl px-4 py-2.5 text-sm",
						isUser ? "bg-primary text-primary-foreground ml-auto w-fit" : "bg-transparent text-foreground",
					)}
					onClick={isUser ? undefined : handleContentClick}
				>
					{isUser ? (
						<p className="whitespace-pre-wrap">{messageContent}</p>
					) : (
						<MarkdownContent compact>{messageContent || " "}</MarkdownContent>
					)}
					{isStreaming && (
						<span className="inline-flex gap-1 ml-1" data-testid="typing-indicator">
							<span className="agent-typing-dot h-1.5 w-1.5 rounded-full bg-current" />
							<span className="agent-typing-dot h-1.5 w-1.5 rounded-full bg-current" />
							<span className="agent-typing-dot h-1.5 w-1.5 rounded-full bg-current" />
						</span>
					)}
				</div>

				{/* Hover actions for assistant messages */}
				{!isUser && !isStreaming && messageContent && (
					<div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
						{/* Copy button */}
						<ActionButton
							onClick={handleCopy}
							label={copied ? intl.copied.value : intl.copy.value}
							testId="copy-message-button"
						>
							{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
						</ActionButton>

						{/* Create Article button */}
						{onCreateArticle && (
							<ActionButton
								onClick={handleCreateArticle}
								label={intl.createArticle.value}
								testId="create-article-button"
							>
								<FileText className="h-3.5 w-3.5" />
							</ActionButton>
						)}

						{/* Try Again button */}
						{onRetry && (
							<ActionButton onClick={onRetry} label={intl.tryAgain.value} testId="retry-message-button">
								<RefreshCw className="h-3.5 w-3.5" />
							</ActionButton>
						)}
					</div>
				)}
			</div>
		</div>
	);
});
