import { cn } from "../../common/ClassNameUtils";
import { AgentPlanToggle } from "./AgentPlanToggle";
import type { AgentHubMode, AgentPlanPhase } from "jolli-common";
import { ArrowUp, Square } from "lucide-react";
import { type KeyboardEvent, type ReactElement, type RefObject, useCallback, useRef } from "react";
import { useIntlayer } from "react-intlayer";

export interface AgentInputProps {
	/** Current input message text */
	message: string;
	/** Whether a response is currently streaming */
	isLoading: boolean;
	/** Called when the input text changes */
	onMessageChange: (message: string) => void;
	/** Called when the user submits the message */
	onSend: () => void;
	/** Called when the user wants to stop the current stream */
	onStop?: () => void;
	/** Optional ref to the textarea element, allowing the parent to focus it */
	inputRef?: RefObject<HTMLTextAreaElement | null>;
	/** Current conversation mode (renders mode selector when defined) */
	mode?: AgentHubMode | undefined;
	/** Current plan phase */
	planPhase?: AgentPlanPhase | undefined;
	/** Called when user selects a different mode */
	onSetMode?: ((mode: AgentHubMode) => void) | undefined;
	/** Called when user clicks the plan phase badge */
	onOpenPlan?: (() => void) | undefined;
}

/**
 * Chat input component with auto-growing textarea and send button.
 * Supports Enter to send, Shift+Enter for newline.
 */
export function AgentInput({
	message,
	isLoading,
	onMessageChange,
	onSend,
	onStop,
	inputRef,
	mode,
	planPhase,
	onSetMode,
	onOpenPlan,
}: AgentInputProps): ReactElement {
	const content = useIntlayer("agent-page");
	const internalRef = useRef<HTMLTextAreaElement>(null);

	/** Callback ref that assigns the textarea element to both the internal and parent refs. */
	const mergedRef = useCallback(
		(node: HTMLTextAreaElement | null) => {
			(internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
			if (inputRef) {
				(inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
			}
		},
		[inputRef],
	);

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (message.trim() && !isLoading) {
				onSend();
			}
		}
	}

	function handleButtonClick() {
		if (isLoading) {
			onStop?.();
		} else if (message.trim()) {
			onSend();
			internalRef.current?.focus();
		}
	}

	const showToolbar = !!(mode && onSetMode && onOpenPlan);

	/** Send/stop button shared between toolbar and standalone layouts. */
	const sendButton = (
		<button
			type="button"
			onClick={handleButtonClick}
			disabled={!isLoading && !message.trim()}
			className={cn(
				"flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
				isLoading
					? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
					: message.trim()
						? "bg-primary text-primary-foreground hover:bg-primary/90"
						: "bg-muted text-muted-foreground cursor-not-allowed",
			)}
			data-testid="agent-send-button"
			aria-label={isLoading ? content.stop.value : content.send.value}
		>
			{isLoading ? (
				<Square className="h-3.5 w-3.5" />
			) : (
				<>
					<ArrowUp className="h-4 w-4" />
					<span>{content.send}</span>
				</>
			)}
		</button>
	);

	return (
		<div className="px-4 pb-4 pt-2" data-testid="agent-input">
			<div className="mx-auto max-w-3xl">
				<div className="flex flex-col rounded-xl border border-border bg-background shadow-sm">
					{/* Textarea row — send button inline when no toolbar */}
					<div className="flex items-end gap-2 p-2">
						<textarea
							ref={mergedRef}
							value={message}
							onChange={e => onMessageChange(e.currentTarget.value)}
							onKeyDown={handleKeyDown}
							placeholder={content.inputPlaceholder.value}
							className="agent-input-textarea flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
							rows={1}
							data-testid="agent-input-textarea"
						/>
						{!showToolbar && sendButton}
					</div>

					{/* Toolbar row — mode selector + send button */}
					{showToolbar && (
						<div className="flex items-center gap-2 px-2 pb-1.5" data-testid="agent-input-toolbar">
							<AgentPlanToggle
								mode={mode}
								planPhase={planPhase}
								onSetMode={onSetMode}
								onOpenPlan={onOpenPlan}
							/>
							<div className="ml-auto">{sendButton}</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
