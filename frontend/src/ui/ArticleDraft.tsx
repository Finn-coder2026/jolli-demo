import { ACCEPTED_IMAGE_TYPES, ImageInsert, MAX_FILE_SIZE_MB } from "../components/ImageInsert";
import { MarkdownContent } from "../components/MarkdownContent";
import { MarkdownContentWithChanges } from "../components/MarkdownContentWithChanges";
import { SectionChangePanel } from "../components/SectionChangePanel";
import { UserAvatar } from "../components/UserAvatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { NumberEdit, type NumberEditRef } from "../components/ui/NumberEdit";
import { ResizablePanels } from "../components/ui/ResizablePanels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Textarea } from "../components/ui/Textarea";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { PREFERENCES } from "../contexts/PreferencesContext";
import { VersionHistoryProvider } from "../contexts/VersionHistoryContext";
import { usePreference } from "../hooks/usePreference";
import { stripJolliScriptFrontmatter } from "../util/ContentUtil";
import { getLog } from "../util/Logger";
import { ChunkReorderer, createSseSubscription, type SseSubscription } from "../util/SseSubscription";
import { EditHistoryDropdown } from "./components/EditHistoryDropdown";
import { VersionHistoryDialog } from "./components/VersionHistoryDialog";
import type {
	CollabConvo,
	CollabMessage,
	ContentDiff,
	Doc,
	DocDraft,
	DocDraftEditHistoryEntry,
	DocDraftSectionChanges,
	OpenApiValidationError,
	SectionAnnotation,
	ToolEvent,
} from "jolli-common";
import { ChevronDown, ChevronUp, History, Info, MessageSquare, Redo2, Send, Share2, Undo2, X } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

// Timeout for clearing tool result display (milliseconds)
// Can be overridden in tests via window.TOOL_RESULT_TIMEOUT
const TOOL_RESULT_TIMEOUT = 10000;

// Helper to check if content type supports AI assistant
function isMarkdownContentType(contentType: string | undefined): boolean {
	return !contentType || contentType === "text/markdown";
}

// Helper to get file extension label for content type
function getContentTypeLabel(contentType: string | undefined): string {
	switch (contentType) {
		case "application/json":
			return "JSON";
		case "application/yaml":
			return "YAML";
		default:
			return "Markdown";
	}
}

// Helper to get articles URL with space parameter preserved
function getArticlesUrl(draft: DocDraft | null): string {
	const metadata = draft?.contentMetadata as { space?: string } | undefined;
	const space = metadata?.space;
	return space ? `/articles?space=${encodeURIComponent(space)}` : "/articles";
}

/**
 * Checks if draft content matches the original article (no changes made).
 * Compares content, contentType, and title.
 */
function draftMatchesArticle(
	draftContent: string,
	draftTitle: string,
	draftContentType: string,
	article: Doc,
): boolean {
	return (
		draftContent === article.content &&
		draftContentType === article.contentType &&
		draftTitle === article.contentMetadata?.title
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is a complex component that manages article drafts, SSE connections, and chat state
export function ArticleDraft(): ReactElement {
	const content = useIntlayer("article-draft");
	const articleDraftsContent = useIntlayer("article-drafts");
	const client = useClient();
	const { draftId, navigate } = useNavigation();
	const [draft, setDraft] = useState<DocDraft | null>(null);
	const [editingArticle, setEditingArticle] = useState<Doc | null>(null);
	const [articleContent, setArticleContent] = useState("");
	const [draftTitle, setDraftTitle] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Chat state
	const [convo, setConvo] = useState<CollabConvo | null>(null);
	const [messages, setMessages] = useState<Array<CollabMessage>>([]);
	const [messageInput, setMessageInput] = useState("");
	const [sending, setSending] = useState(false);
	const [aiTyping, setAiTyping] = useState(false);
	const [streamingMessage, setStreamingMessage] = useState("");
	const [toolExecuting, setToolExecuting] = useState<{ tool: string; arguments: string; result?: string } | null>(
		null,
	);
	const lastChunkTimeRef = useRef<number>(0);
	const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
	const toolResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [showToolDetails, setShowToolDetails] = usePreference(PREFERENCES.articleDraftShowToolDetails);

	// Article streaming state
	const streamingArticleRef = useRef<string>("");
	const fullStreamBufferRef = useRef<string>("");
	const [isStreamingArticle, setIsStreamingArticle] = useState(false);
	const justFinishedStreamingRef = useRef<boolean>(false);

	// Chunk reordering for Mercure (chunks may arrive out of order)
	const chunkReordererRef = useRef(new ChunkReorderer<string>());

	// Track if user has made changes since loading
	const hasUserMadeChanges = useRef<boolean>(false);

	// Undo/Redo state
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	// Section changes state
	const [sectionAnnotations, setSectionAnnotations] = useState<Array<SectionAnnotation>>([]);
	const [sectionChanges, setSectionChanges] = useState<Array<DocDraftSectionChanges>>([]);
	const [openPanelChangeIds, setOpenPanelChangeIds] = useState<Set<number>>(new Set());

	// Edit history state
	const [editHistory, setEditHistory] = useState<Array<DocDraftEditHistoryEntry>>([]);

	// Version history dialog state
	const [showVersionHistory, setShowVersionHistory] = useState(false);

	// Validation state
	const [validationErrors, setValidationErrors] = useState<Array<OpenApiValidationError>>([]);
	const editorRef = useRef<NumberEditRef>(null);

	// Image deletion state
	const [imageToDelete, setImageToDelete] = useState<string | null>(null);
	const [deletingImage, setDeletingImage] = useState(false);
	const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Image error toast state (separate from page-level error to avoid full-page redirect)
	const [imageError, setImageError] = useState<string | null>(null);

	// SSE state
	const [draftConnected, setDraftConnected] = useState(false);
	const [convoConnected, setConvoConnected] = useState(false);
	const [activeUsers, setActiveUsers] = useState<Set<number>>(new Set());
	const [draftReconnecting, setDraftReconnecting] = useState(false);
	const [convoReconnecting, setConvoReconnecting] = useState(false);
	const draftSubscriptionRef = useRef<SseSubscription | null>(null);
	const convoSubscriptionRef = useRef<SseSubscription | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Track pending section changes fetch to prevent race conditions
	const pendingSectionChangeFetchRef = useRef<boolean>(false);

	// Load draft and setup SSE on mount
	useEffect(() => {
		/* v8 ignore next 5 - defensive guard, component shows error if no draftId from route */
		if (!draftId) {
			setError("No draft ID provided");
			setLoading(false);
			return;
		}

		loadDraft(draftId).then();

		/* v8 ignore next 8 - cleanup function tested via unmount tests */
		return () => {
			// Cleanup SSE connections
			draftSubscriptionRef.current?.close();
			convoSubscriptionRef.current?.close();
			// Cleanup error timeout
			if (errorTimeoutRef.current) {
				clearTimeout(errorTimeoutRef.current);
			}
		};
	}, [draftId]);

	// Show loading indicator when AI is typing but paused (no chunks in 1.5 seconds)
	useEffect(() => {
		if (!aiTyping) {
			setShowLoadingIndicator(false);
			return;
		}

		const checkInterval = setInterval(() => {
			const timeSinceLastChunk = Date.now() - lastChunkTimeRef.current;
			// Show indicator if it's been >1.5s since last chunk and we're still typing
			if (aiTyping && lastChunkTimeRef.current > 0 && timeSinceLastChunk > 1500) {
				setShowLoadingIndicator(true);
			} else if (timeSinceLastChunk <= 1500) {
				setShowLoadingIndicator(false);
			}
		}, 500); // Check every 500ms

		return () => clearInterval(checkInterval);
	}, [aiTyping]);

	// Auto-scroll chat to bottom when new messages arrive
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, streamingMessage]);

	// Auto-save draft periodically when content changes
	useEffect(() => {
		/* v8 ignore next 5 - defensive guard for missing draftId */
		if (!draftId || loading || isStreamingArticle || aiTyping) {
			return;
		}

		// Don't auto-save if user hasn't made changes (prevents auto-save on initial load)
		if (!hasUserMadeChanges.current) {
			return;
		}

		// Debounce auto-save: wait 2 seconds after last change
		/* v8 ignore next 6 - setTimeout callback and cleanup tested indirectly */
		const timeoutId = setTimeout(() => {
			autoSaveDraft().then();
		}, 2000);

		return () => clearTimeout(timeoutId);
	}, [articleContent, draftTitle, draftId, loading, isStreamingArticle, aiTyping]);

	// Keyboard shortcuts for undo/redo
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "z") {
				e.preventDefault();
				if (e.shiftKey) {
					handleRedo().then();
				} else {
					handleUndo().then();
				}
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		/* v8 ignore next - cleanup function tested indirectly */
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [draftId]);

	async function loadDraft(id: number) {
		try {
			const draftData = await client.docDrafts().getDocDraft(id);
			setDraft(draftData);
			setArticleContent(draftData.content);
			setDraftTitle(draftData.title);

			// If this draft is editing an existing article, load the article and check for changes
			if (draftData.docId) {
				try {
					const docs = await client.docs().listDocs();
					const article = docs.find(doc => doc.id === draftData.docId);
					if (article) {
						setEditingArticle(article);
						// Initialize hasUserMadeChanges based on whether draft differs from original article
						hasUserMadeChanges.current = !draftMatchesArticle(
							draftData.content,
							draftData.title,
							draftData.contentType,
							article,
						);
					} else {
						hasUserMadeChanges.current = false;
					}
				} catch (err) {
					log.error(err, "Failed to load article being edited");
					hasUserMadeChanges.current = false;
				}
			} else {
				// New draft (not editing an article) - reset change tracking
				hasUserMadeChanges.current = false;
			}

			// Setup draft SSE stream
			setupDraftStream(id).then();

			// Load section changes
			try {
				const sectionChangesData = await client.docDrafts().getSectionChanges(id);
				setSectionAnnotations(sectionChangesData.sections);
				setSectionChanges(sectionChangesData.changes);

				// Auto-apply any already-applied changes and add to undo history
				/* v8 ignore next 5 - placeholder loop for future undo history implementation */
				const appliedChanges = sectionChangesData.changes.filter(change => change.applied);
				for (const _change of appliedChanges) {
					// Changes are already applied to content, just add to undo history
					// This ensures the user can undo auto-applied changes
					// TODO: Implement undo history for section changes
				}
			} catch (err) {
				log.error(err, "Failed to load section changes");
				// Non-fatal error, continue loading the draft
			}

			// Load revision history to initialize undo/redo state
			try {
				const revisionsData = await client.docDrafts().getRevisions(id);
				setCanUndo(revisionsData.canUndo);
				setCanRedo(revisionsData.canRedo);
			} catch (err) {
				log.error(err, "Failed to load revisions");
				// Non-fatal error, continue loading the draft
			}

			// Load edit history
			try {
				const historyData = await client.docDrafts().getDraftHistory(id);
				setEditHistory(historyData);
			} catch (err) {
				log.error(err, "Failed to load edit history");
				// Non-fatal error, continue loading the draft
			}

			// Load or create conversation
			try {
				const convoData = await client.collabConvos().getCollabConvoByArtifact("doc_draft", id);
				setConvo(convoData);
				setMessages(convoData.messages);
				setupConvoStream(convoData.id).then();
			} catch {
				// No conversation exists yet, create one
				const newConvo = await client.collabConvos().createCollabConvo("doc_draft", id);
				setConvo(newConvo);
				setMessages(newConvo.messages);
				setupConvoStream(newConvo.id).then();
			}
		} catch (err) {
			log.error(err, "Failed to load draft");
			setError(content.errorLoading.value);
		} finally {
			setLoading(false);
		}
	}

	/**
	 * Refresh the editing article data after version restore.
	 * This fetches the latest article data from the server and updates the local state.
	 */
	async function refreshEditingArticle() {
		if (!editingArticle?.id) {
			return;
		}

		try {
			const article = await client.docs().getDocById(editingArticle.id);
			if (article) {
				setEditingArticle(article);
				// Update draft content to match the restored article
				setArticleContent(article.content);
				setDraftTitle(article.contentMetadata?.title ?? "");
				// Reset change tracking since we just synced with the article
				hasUserMadeChanges.current = false;
				log.info("Article refreshed after version restore, version=%d", article.version);
			}
		} catch (err) {
			log.error(err, "Failed to refresh article after version restore");
		}
	}

	async function setupDraftStream(id: number) {
		draftSubscriptionRef.current = await createSseSubscription<{
			type: string;
			userId?: number;
			diffs?: Array<ContentDiff>;
		}>({
			type: "draft",
			id,
			directSseUrl: `/api/doc-drafts/${id}/stream`,
			onMessage: handleDraftSSEEvent,
			onConnected: () => {
				setDraftConnected(true);
				setDraftReconnecting(false);
			},
			onReconnecting: attempt => {
				log.info("Draft SSE reconnecting, attempt %d", attempt);
				setDraftReconnecting(true);
				setDraftConnected(false);
			},
			onReconnected: afterAttempts => {
				log.info("Draft SSE reconnected after %d attempts", afterAttempts);
				setDraftReconnecting(false);
				setDraftConnected(true);
			},
			onFailed: () => {
				log.error("Draft SSE connection failed after maximum reconnection attempts");
				setDraftReconnecting(false);
				setDraftConnected(false);
			},
		});
	}

	async function setupConvoStream(id: number) {
		convoSubscriptionRef.current = await createSseSubscription<{
			type: string;
			userId?: number;
			content?: string;
			diffs?: Array<ContentDiff>;
			message?: CollabMessage;
			contentLastEditedAt?: string;
			contentLastEditedBy?: number;
			event?: ToolEvent;
		}>({
			type: "convo",
			id,
			directSseUrl: `/api/collab-convos/${id}/stream`,
			onMessage: handleConvoSSEEvent,
			onConnected: () => {
				setConvoConnected(true);
				setConvoReconnecting(false);
			},
			onReconnecting: attempt => {
				log.info("Convo SSE reconnecting, attempt %d", attempt);
				setConvoReconnecting(true);
				setConvoConnected(false);
			},
			onReconnected: afterAttempts => {
				log.info("Convo SSE reconnected after %d attempts", afterAttempts);
				setConvoReconnecting(false);
				setConvoConnected(true);
			},
			onFailed: () => {
				log.error("Convo SSE connection failed after maximum reconnection attempts");
				setConvoReconnecting(false);
				setConvoConnected(false);
			},
		});
	}

	function handleDraftSSEEvent(data: { type: string; userId?: number; diffs?: Array<ContentDiff> }) {
		switch (data.type) {
			case "connected":
				setDraftConnected(true);
				break;
			case "user_joined":
				if (data.userId) {
					setActiveUsers(prev => new Set([...prev, data.userId as number]));
				}
				break;
			case "user_left":
				if (data.userId) {
					setActiveUsers(prev => {
						const next = new Set(prev);
						next.delete(data.userId as number);
						return next;
					});
				}
				break;
			case "content_update":
				if (data.diffs) {
					applyDiffsToArticle(data.diffs);
				}
				break;
			case "draft_saved":
				// Redirect to article detail if editing, otherwise articles list (preserving space filter)
				/* v8 ignore next 5 - navigation in async event handler difficult to test with coverage */
				if (editingArticle) {
					navigate(`/articles/${encodeURIComponent(editingArticle.jrn)}`);
				} else {
					navigate(getArticlesUrl(draft));
				}
				break;
			case "draft_deleted":
				// Redirect to articles page (preserving space filter)
				navigate(getArticlesUrl(draft));
				break;
		}
	}

	function getToolMessage(toolName: string, args: string, hasResult: boolean) {
		if (showToolDetails) {
			// Detailed view: show toolName(args) or toolName(args): result
			const truncatedArgs = args.length >= 200 && !args.endsWith("...") ? `${args}...` : args;
			return content.toolCall({ toolName, args: truncatedArgs });
		}
		// Simple view: "Running the toolName tool" or "Running the toolName tool: completed"
		return hasResult ? content.toolCallCompleted({ toolName }) : content.toolCallRunning({ toolName });
	}

	function handleUserJoined(userId: number) {
		setActiveUsers(prev => new Set([...prev, userId]));
	}

	function handleUserLeft(userId: number) {
		setActiveUsers(prev => {
			const next = new Set(prev);
			next.delete(userId);
			return next;
		});
	}

	function handleTypingEvent() {
		setAiTyping(true);
		setStreamingMessage("");
		// Reset streaming buffers and flags
		fullStreamBufferRef.current = "";
		streamingArticleRef.current = "";
		setIsStreamingArticle(false);
		justFinishedStreamingRef.current = false;
		lastChunkTimeRef.current = 0; // Reset timing for paragraph detection
		// Reset chunk reordering for new message
		chunkReordererRef.current.reset();
	}

	function handleToolEvent(event: ToolEvent) {
		// Clear any existing timeout
		if (toolResultTimeoutRef.current) {
			clearTimeout(toolResultTimeoutRef.current);
			toolResultTimeoutRef.current = null;
		}

		if (event.status === "start" && event.tool) {
			// Tool starting - show tool name without result
			setToolExecuting({ tool: event.tool, arguments: event.arguments });
		} else if (event.status === "end" && event.tool) {
			// Tool completed - show tool name with result (only include result if defined)
			setToolExecuting(
				event.result
					? { tool: event.tool, arguments: event.arguments, result: event.result }
					: { tool: event.tool, arguments: event.arguments },
			);

			// After a tool finishes, refresh section changes for tools that propose edits
			if (event.tool === "edit_section" || event.tool === "create_section" || event.tool === "delete_section") {
				refreshSectionChanges().then(() => {
					log.debug("Refreshed section changes after %s tool", event.tool);
				});
			}

			// After configured timeout, clear the result but keep showing "AI working..." if still typing
			const timeout =
				(typeof window !== "undefined" && (window as { TOOL_RESULT_TIMEOUT?: number }).TOOL_RESULT_TIMEOUT) ||
				TOOL_RESULT_TIMEOUT;
			toolResultTimeoutRef.current = setTimeout(() => {
				setToolExecuting(null);
				toolResultTimeoutRef.current = null;
			}, timeout);
		}
	}

	function processContentChunk(content: string) {
		// Detect if there was a pause (>500ms) since last chunk
		const now = Date.now();
		const timeSinceLastChunk = now - lastChunkTimeRef.current;
		const hadPause = lastChunkTimeRef.current > 0 && timeSinceLastChunk > 500;
		lastChunkTimeRef.current = now;

		// Add paragraph break if there was a pause and content doesn't start with whitespace
		const needsParagraphBreak =
			hadPause &&
			fullStreamBufferRef.current.length > 0 &&
			!fullStreamBufferRef.current.endsWith("\n") &&
			!content.startsWith("\n") &&
			!content.startsWith(" ");

		// Accumulate full response with paragraph breaks after pauses
		fullStreamBufferRef.current += (needsParagraphBreak ? "\n\n" : "") + content;
		return fullStreamBufferRef.current;
	}

	function handleArticleStreamUpdate(fullBuffer: string) {
		const startMarker = "[ARTICLE_UPDATE]";
		const endMarker = "[/ARTICLE_UPDATE]";
		const startIndex = fullBuffer.indexOf(startMarker);
		const endIndex = fullBuffer.indexOf(endMarker);

		// Stream article content in real-time
		/* v8 ignore next 20 - streaming article update edge cases */
		if (startIndex !== -1) {
			setIsStreamingArticle(true);
			hasUserMadeChanges.current = true; // AI is making changes
			if (endIndex === -1) {
				// Still streaming - show partial content
				const partialArticle = fullBuffer.slice(startIndex + startMarker.length);
				setArticleContent(partialArticle);
			} else {
				// Complete - show final content
				const finalArticle = fullBuffer.slice(startIndex + startMarker.length, endIndex).trim();
				setArticleContent(finalArticle);
				setIsStreamingArticle(false);
				// Flag that we just finished streaming - ignore diffs for a moment
				justFinishedStreamingRef.current = true;
				setTimeout(() => {
					justFinishedStreamingRef.current = false;
				}, 500); // 500ms grace period
			}
		}
	}

	function handleArticleUpdated(
		diffs?: Array<ContentDiff>,
		contentLastEditedAt?: string,
		contentLastEditedBy?: number,
	) {
		// Apply diffs from other users or for consistency
		// Skip if we're currently streaming or just finished streaming
		if (diffs && !isStreamingArticle && !justFinishedStreamingRef.current) {
			applyDiffsToArticle(diffs);
		}
		// Update draft metadata if provided
		if (contentLastEditedAt !== undefined || contentLastEditedBy !== undefined) {
			// If contentLastEditedAt is being set, it means changes were made (enables save button)
			hasUserMadeChanges.current = true;

			/* v8 ignore next 8 - state update with ternary expression */
			setDraft(prev =>
				prev
					? {
							...prev,
							contentLastEditedAt: contentLastEditedAt ?? prev.contentLastEditedAt,
							contentLastEditedBy: contentLastEditedBy ?? prev.contentLastEditedBy,
						}
					: null,
			);
		}
	}

	function handleMessageComplete(message?: CollabMessage) {
		setAiTyping(false);
		setStreamingMessage("");
		setToolExecuting(null);

		// Clear any pending tool result timeout
		if (toolResultTimeoutRef.current) {
			clearTimeout(toolResultTimeoutRef.current);
			toolResultTimeoutRef.current = null;
		}

		// Clear streaming state
		fullStreamBufferRef.current = "";
		streamingArticleRef.current = "";
		setIsStreamingArticle(false);
		// Reset chunk reordering
		chunkReordererRef.current.reset();
		if (message) {
			setMessages(prev => [...prev, message]);
		}
	}

	/**
	 * Consolidated function to refresh section changes with deduplication.
	 * Prevents race conditions from multiple concurrent getSectionChanges() calls.
	 */
	async function refreshSectionChanges() {
		/* v8 ignore next 3 - defensive guard, draftId always present when function is called */
		if (!draftId) {
			return;
		}

		/* v8 ignore next 4 - race condition guard, testing concurrent fetches is fragile */
		if (pendingSectionChangeFetchRef.current) {
			log.debug("Skipping section changes refresh - fetch already in progress");
			return;
		}

		pendingSectionChangeFetchRef.current = true;
		try {
			const sc = await client.docDrafts().getSectionChanges(draftId);
			setSectionAnnotations(sc.sections);
			setSectionChanges(sc.changes);
		} catch (err) {
			log.error(err, "Failed to refresh section changes");
		} finally {
			pendingSectionChangeFetchRef.current = false;
		}
	}

	function handleConvoSSEEvent(data: {
		type: string;
		userId?: number;
		content?: string;
		seq?: number;
		diffs?: Array<ContentDiff>;
		message?: CollabMessage;
		contentLastEditedAt?: string;
		contentLastEditedBy?: number;
		event?: ToolEvent;
	}) {
		switch (data.type) {
			case "connected":
				setConvoConnected(true);
				break;
			case "user_joined":
				if (data.userId) {
					handleUserJoined(data.userId);
				}
				break;
			case "user_left":
				if (data.userId) {
					handleUserLeft(data.userId);
				}
				break;
			case "typing":
				handleTypingEvent();
				break;
			case "tool_event":
				if (data.event) {
					handleToolEvent(data.event);
				}
				break;
			case "content_chunk":
				if (data.content) {
					// Process chunks in order, buffering out-of-sequence chunks
					chunkReordererRef.current.process(data.content, data.seq, chunk => {
						const fullBuffer = processContentChunk(chunk);
						handleArticleStreamUpdate(fullBuffer);
						// Update chat message (without article content)
						setStreamingMessage(removeArticleUpdateContent(fullBuffer));
					});
				}
				break;
			case "article_updated":
				handleArticleUpdated(data.diffs, data.contentLastEditedAt, data.contentLastEditedBy);
				// Also refresh section changes in case a suggestion was created
				refreshSectionChanges().then();
				break;
			case "message_complete":
				handleMessageComplete(data.message);
				// Final safeguard: refresh section changes at end of tool/message processing
				refreshSectionChanges().then();
				break;
		}
	}

	function removeArticleUpdateContent(message: string): string {
		const startMarker = "[ARTICLE_UPDATE]";
		const endMarker = "[/ARTICLE_UPDATE]";

		const startIndex = message.indexOf(startMarker);
		const endIndex = message.indexOf(endMarker);

		// If no markers found or incomplete, show as-is
		/* v8 ignore next 3 - edge case when no article update markers found */
		if (startIndex === -1) {
			return message;
		}

		// If end marker not found yet (still streaming), show text before marker + "updating article..."
		/* v8 ignore next 4 - edge case when end marker is not found */
		if (endIndex === -1) {
			const beforeMarker = message.slice(0, startIndex).trim();
			return beforeMarker ? `${beforeMarker}\n\nUpdating article...` : "Updating article...";
		}

		// Both markers found - extract text before and after
		/* v8 ignore next 7 - edge case where both before and after markers exist */
		const beforeMarker = message.slice(0, startIndex).trim();
		const afterMarker = message.slice(endIndex + endMarker.length).trim();
		if (beforeMarker && afterMarker) {
			return `${beforeMarker}\n\n${afterMarker}`;
		}
		return beforeMarker || afterMarker || "I've updated the article.";
	}

	function applyDiffsToArticle(diffs: Array<ContentDiff>) {
		// Use functional setState to avoid stale closure issues
		setArticleContent(currentContent => {
			let newContent = currentContent;

			// Apply diffs in order
			for (const diff of diffs) {
				const text = diff.text || "";
				const length = diff.length || 0;

				switch (diff.operation) {
					case "insert":
						newContent = newContent.slice(0, diff.position) + text + newContent.slice(diff.position);
						break;
					case "delete":
						newContent = newContent.slice(0, diff.position) + newContent.slice(diff.position + length);
						break;
					case "replace":
						newContent =
							newContent.slice(0, diff.position) + text + newContent.slice(diff.position + length);
						break;
				}
			}

			// Only update if content actually changed (prevents infinite loop from auto-save)
			if (newContent === currentContent) {
				return currentContent; // No change, don't trigger re-render
			}

			// Mark that changes were made (enables save button)
			hasUserMadeChanges.current = true;

			return newContent;
		});
	}

	async function handleSendMessage() {
		/* v8 ignore next 3 - defensive guard, unreachable as button is disabled when messageInput empty or no convo */
		if (!messageInput.trim() || !convo) {
			return;
		}

		setSending(true);
		const userMessage = messageInput.trim();
		setMessageInput("");

		try {
			// Add user message optimistically
			const newMessage: CollabMessage = {
				role: "user",
				content: userMessage,
				timestamp: new Date().toISOString(),
			};
			setMessages(prev => [...prev, newMessage]);

			// Send to backend (SSE will handle the response)
			await client.collabConvos().sendMessage(convo.id, userMessage);
		} catch (err) {
			log.error(err, "Failed to send message");
			setError(content.errorSending.value);
		} finally {
			setSending(false);
		}
	}

	async function handleUndo() {
		/* v8 ignore next 3 - defensive guard, unreachable as component shows error if no draftId */
		if (!draftId || !canUndo) {
			return;
		}

		try {
			const result = await client.docDrafts().undoDocDraft(draftId);
			setArticleContent(result.content);
			setSectionAnnotations(result.sections);
			setSectionChanges(result.changes);
			setCanUndo(result.canUndo);
			setCanRedo(result.canRedo);
			// If we've undone back to the original article content, disable save button
			if (editingArticle && result.content === editingArticle.content) {
				hasUserMadeChanges.current = false;
			}
		} catch (err) {
			log.error(err, "Failed to undo");
		}
	}

	async function handleRedo() {
		/* v8 ignore next 3 - defensive guard, unreachable as component shows error if no draftId */
		if (!draftId || !canRedo) {
			return;
		}

		try {
			const result = await client.docDrafts().redoDocDraft(draftId);
			setArticleContent(result.content);
			setSectionAnnotations(result.sections);
			setSectionChanges(result.changes);
			setCanUndo(result.canUndo);
			setCanRedo(result.canRedo);
			// If we've redone back to the original article content, disable save button
			// Otherwise, enable it since we've made a change
			hasUserMadeChanges.current = !(editingArticle && result.content === editingArticle.content);
		} catch (err) {
			log.error(err, "Failed to redo");
		}
	}

	function handleSectionClick(changeIds: Array<number>) {
		// Toggle panels for clicked section's changes
		setOpenPanelChangeIds(prev => {
			const newSet = new Set(prev);
			for (const id of changeIds) {
				if (newSet.has(id)) {
					newSet.delete(id);
				} else {
					newSet.add(id);
				}
			}
			return newSet;
		});
	}

	async function handleApplySectionChange(changeId: number) {
		/* v8 ignore next 3 - defensive guard, draftId always present when handler is reachable */
		if (!draftId) {
			return;
		}

		// Set pending flag to prevent SSE-triggered refreshes from overwriting our state update
		pendingSectionChangeFetchRef.current = true;
		try {
			const result = await client.docDrafts().applySectionChange(draftId, changeId);
			setArticleContent(result.content);
			setSectionAnnotations(result.sections);
			setSectionChanges(result.changes);
			// Update undo/redo availability from backend response
			setCanUndo(result.canUndo);
			setCanRedo(result.canRedo);
			// Mark that user has made changes (enables save button)
			hasUserMadeChanges.current = true;
			// Close the panel
			setOpenPanelChangeIds(prev => {
				const newSet = new Set(prev);
				newSet.delete(changeId);
				return newSet;
			});
		} catch (err) {
			log.error(err, "Failed to apply section change");
			setError("Failed to apply change");
		} finally {
			pendingSectionChangeFetchRef.current = false;
		}
	}

	async function handleDismissSectionChange(changeId: number) {
		/* v8 ignore next 3 - defensive guard, draftId always present when handler is reachable */
		if (!draftId) {
			return;
		}

		// Set pending flag to prevent SSE-triggered refreshes from overwriting our state update
		pendingSectionChangeFetchRef.current = true;
		try {
			const result = await client.docDrafts().dismissSectionChange(draftId, changeId);
			setArticleContent(result.content);
			setSectionAnnotations(result.sections);
			setSectionChanges(result.changes);
			// Update undo/redo availability from backend response
			setCanUndo(result.canUndo);
			setCanRedo(result.canRedo);
			// Close the panel
			setOpenPanelChangeIds(prev => {
				const newSet = new Set(prev);
				newSet.delete(changeId);
				return newSet;
			});
		} catch (err) {
			log.error(err, "Failed to dismiss section change");
			setError("Failed to dismiss change");
		} finally {
			pendingSectionChangeFetchRef.current = false;
		}
	}

	/* v8 ignore start - autoSaveDraft tested indirectly via debounced useEffect */
	async function autoSaveDraft() {
		if (!draftId || !draft) {
			return;
		}

		// Validate content before auto-saving using backend API
		try {
			const result = await client.docDrafts().validateContent(articleContent, draft.contentType);
			if (!result.isValid) {
				setValidationErrors(result.errors);
				return;
			}
		} catch (err) {
			log.warn(err, "Validation API failed, skipping validation");
			// Continue with auto-save even if validation API fails
		}

		try {
			const updatedDraft = await client.docDrafts().updateDocDraft(draftId, {
				title: draftTitle,
				content: articleContent,
			});
			setDraft(updatedDraft);
			log.debug("Draft auto-saved");
		} catch (err) {
			log.error(err, "Failed to auto-save draft");
			// Don't show error to user for auto-save failures
		}
	}
	/* v8 ignore stop */

	async function validateContentBeforeSave(): Promise<boolean> {
		/* v8 ignore next 3 - defensive guard, draftId/draft always present when save is clickable */
		if (!draftId || !draft) {
			return true;
		}

		try {
			const result = await client.docDrafts().validateContent(articleContent, draft.contentType);
			if (!result.isValid) {
				setValidationErrors(result.errors);
				return false;
			}
			setValidationErrors([]);
			return true;
		} catch (err) {
			log.error(err, "Validation API failed");
			// Allow save to proceed - backend will validate again
			setValidationErrors([]);
			return true;
		}
	}

	/**
	 * Scrolls the editor to a specific line
	 */
	function scrollToLine(lineNumber: number) {
		editorRef.current?.scrollToLine(lineNumber);
		editorRef.current?.focus();
	}

	/**
	 * Renders the OpenAPI validation errors panel if there are errors
	 */
	function renderValidationErrors() {
		if (validationErrors.length === 0) {
			return null;
		}
		return (
			<div
				className="border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3"
				data-testid="validation-errors"
			>
				<div className="flex items-start gap-2">
					<div className="text-red-600 dark:text-red-400 font-medium text-sm">
						{content.validationErrors ?? "Validation Errors"}:
					</div>
					<div className="flex-1">
						{validationErrors.map((err, idx) => (
							<div
								key={idx}
								className="text-sm text-red-700 dark:text-red-300 mb-1"
								data-testid={`validation-error-${idx}`}
							>
								{err.line ? (
									<button
										type="button"
										onClick={() => scrollToLine(err.line as number)}
										className="font-mono text-xs bg-red-100 dark:bg-red-900/30 px-1 rounded mr-2 hover:bg-red-200 dark:hover:bg-red-800/50 cursor-pointer underline"
										data-testid={`validation-error-${idx}-line`}
									>
										Line {err.line}
										{err.column ? `:${err.column}` : ""}
									</button>
								) : err.path ? (
									<span className="font-mono text-xs bg-red-100 dark:bg-red-900/30 px-1 rounded mr-2">
										{err.path}
									</span>
								) : null}
								{err.message}
							</div>
						))}
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 h-6 px-2"
						onClick={() => setValidationErrors([])}
						data-testid="dismiss-validation-errors"
					>
						<X className="h-3 w-3" />
					</Button>
				</div>
			</div>
		);
	}

	async function handleSave() {
		/* v8 ignore next 3 - defensive guard, unreachable as component shows error if no draftId */
		if (!draftId) {
			return;
		}

		// Validate content before saving
		const isValid = await validateContentBeforeSave();
		if (!isValid) {
			return;
		}

		setSaving(true);
		try {
			// Update draft title and content first
			await client.docDrafts().updateDocDraft(draftId, {
				title: draftTitle,
				content: articleContent,
			});
			// Then save as article (this will trigger SSE event that redirects us)
			await client.docDrafts().saveDocDraft(draftId);
		} catch (err) {
			log.error(err, "Failed to save draft");
			setError(content.errorSaving.value);
			setSaving(false);
		}
	}

	async function handleShare() {
		/* v8 ignore next 3 - defensive guard, share button only rendered when draft exists */
		if (!draftId || !draft) {
			return;
		}

		setSharing(true);
		try {
			const updatedDraft = await client.docDrafts().shareDraft(draftId);
			setDraft(updatedDraft);
		} catch (err) {
			log.error(err, "Failed to share draft");
			setError(content.shareError.value);
		} finally {
			setSharing(false);
		}
	}

	async function handleClose() {
		// Check if there are pending section changes (suggested edits not yet applied or dismissed)
		// If so, keep the draft regardless of content changes
		const hasPendingSectionChanges = sectionChanges.some(c => !c.applied && !c.dismissed);

		// Only consider deleting if: editing an existing article, no pending section changes,
		// and draft content matches original article
		if (draft?.docId && !hasPendingSectionChanges && draft.id) {
			const draftMatchesOriginal =
				editingArticle &&
				draft &&
				draftMatchesArticle(articleContent, draftTitle, draft.contentType, editingArticle);
			if (draftMatchesOriginal) {
				try {
					await client.docDrafts().deleteDocDraft(draft.id);
				} catch (err) {
					// Log but don't block navigation on delete failure
					log.error(err, "Failed to delete unchanged draft");
				}
			}
		}
		navigate(getArticlesUrl(draft));
	}

	/**
	 * Handle image upload completion - insert markdown at cursor position on new line.
	 * NumberEdit tracks cursor position via selectionchange events, so insertTextAtCursor
	 * will use the last known cursor position even after focus is lost.
	 */
	function handleImageUpload(markdownRef: string) {
		editorRef.current?.insertTextAtCursor(markdownRef);
		hasUserMadeChanges.current = true;
	}

	/**
	 * Handle image upload error - shows toast banner instead of full-page error
	 */
	function handleImageUploadError(errorMessage: string) {
		setImageError(errorMessage);
		// Clear any existing timeout to prevent stacking
		if (errorTimeoutRef.current) {
			clearTimeout(errorTimeoutRef.current);
		}
		// Auto-clear error after 5 seconds
		errorTimeoutRef.current = setTimeout(() => {
			setImageError(null);
			errorTimeoutRef.current = null;
		}, 5000);
	}

	/**
	 * Handle image deletion request - show confirmation dialog
	 */
	function handleImageDelete(src: string) {
		setImageToDelete(src);
	}

	/**
	 * Remove all references to an image from the article content
	 */
	function removeImageReferences(src: string) {
		const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

		// Pattern 1: Markdown image ![alt](src) - match entire line if it's alone
		const markdownRegex = new RegExp(`^[ \\t]*!\\[[^\\]]*\\]\\(${escapedSrc}\\)[ \\t]*\\n?`, "gm");

		// Pattern 2: HTML img tag <img ... src="src" ... /> or <img ... src="src" ... >
		const htmlRegex = new RegExp(`^[ \\t]*<img[^>]*src=["']${escapedSrc}["'][^>]*/?>[ \\t]*\\n?`, "gim");

		let newContent = articleContent;
		newContent = newContent.replace(markdownRegex, "");
		newContent = newContent.replace(htmlRegex, "");

		// Clean up any double newlines created by removal
		newContent = newContent.replace(/\n{3,}/g, "\n\n");

		if (newContent !== articleContent) {
			setArticleContent(newContent);
			hasUserMadeChanges.current = true;
		}
	}

	/**
	 * Confirm and execute image deletion - delete from storage and remove references
	 */
	async function confirmImageDelete() {
		if (!imageToDelete) {
			return;
		}

		setDeletingImage(true);
		try {
			// Extract image ID from URL (e.g., "/api/images/tenant/org/draft/filename.png" -> "tenant/org/draft/filename.png")
			const imageId = imageToDelete.replace(/^\/api\/images\//, "");
			await client.images().deleteImage(imageId);

			// Remove all references to this image from the article
			removeImageReferences(imageToDelete);
			setImageToDelete(null);
		} catch (err) {
			log.error(err, "Failed to delete image");
			handleImageUploadError(content.deleteImageError.value);
		} finally {
			setDeletingImage(false);
		}
	}

	/**
	 * Process an image file for upload (used by paste and drag-and-drop)
	 */
	async function processImageFile(file: File | Blob, filename: string) {
		// Validate file type using shared constants
		if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
			handleImageUploadError(content.invalidFileType.value);
			return;
		}

		// Validate file size using shared constant
		const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
		if (file.size > maxSizeBytes) {
			handleImageUploadError(content.fileTooLarge.value);
			return;
		}

		try {
			// Upload image
			const result = await client.images().uploadImage(file, filename);

			// Create markdown reference with filename as alt text
			const markdown = `![${filename}](${result.url})`;
			handleImageUpload(markdown);
		} catch (error) {
			handleImageUploadError(error instanceof Error ? error.message : content.uploadFailed.value);
		}
	}

	/**
	 * Handle paste event on editor - extract images from clipboard
	 */
	function handleEditorPaste(event: React.ClipboardEvent<HTMLDivElement>) {
		const items = event.clipboardData?.items;
		if (!items) {
			return;
		}

		// Look for image items in clipboard
		for (const item of Array.from(items)) {
			if (item.type.startsWith("image/")) {
				event.preventDefault();
				const file = item.getAsFile();
				if (file) {
					const filename = `pasted-image-${Date.now()}.${file.type.split("/")[1] || "png"}`;
					processImageFile(file, filename);
				}
				return;
			}
		}
	}

	/**
	 * Handle drag over event - prevent default to allow drop
	 */
	function handleEditorDragOver(event: React.DragEvent<HTMLDivElement>) {
		event.preventDefault();
		event.stopPropagation();
	}

	/**
	 * Handle drop event on editor - extract and upload all images from dropped files
	 */
	function handleEditorDrop(event: React.DragEvent<HTMLDivElement>) {
		event.preventDefault();
		event.stopPropagation();

		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) {
			return;
		}

		const allFiles = Array.from(files);

		// Check if any files were dropped that aren't images
		const nonImageFiles = allFiles.filter(file => !file.type.startsWith("image/"));

		// Collect all image files (filter by MIME type starting with image/)
		const imageFiles = allFiles.filter(file => file.type.startsWith("image/"));

		// If only non-image files were dropped, show error
		if (imageFiles.length === 0 && nonImageFiles.length > 0) {
			const filenames = nonImageFiles.map(f => f.name).join(", ");
			handleImageUploadError(`${filenames}: ${content.invalidFileType.value}`);
			return;
		}

		// Process all image files and collect results
		async function processAllImages() {
			const results: Array<{ filename: string; markdown: string | null; error: string | null }> = [];

			// Add errors for non-image files that were included in the drop
			for (const file of nonImageFiles) {
				results.push({ filename: file.name, markdown: null, error: content.invalidFileType.value });
			}

			for (const file of imageFiles) {
				// Validate file type using shared constants
				if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
					results.push({ filename: file.name, markdown: null, error: content.invalidFileType.value });
					continue;
				}

				// Validate file size using shared constant
				const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
				if (file.size > maxSizeBytes) {
					results.push({ filename: file.name, markdown: null, error: content.fileTooLarge.value });
					continue;
				}

				try {
					const result = await client.images().uploadImage(file, file.name);
					const markdown = `![${file.name}](${result.url})`;
					results.push({ filename: file.name, markdown, error: null });
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : content.uploadFailed.value;
					results.push({ filename: file.name, markdown: null, error: errorMsg });
				}
			}

			// Collect successful uploads
			const successfulMarkdown = results.filter(r => r.markdown !== null).map(r => r.markdown as string);

			// Insert all successful images as a single block
			if (successfulMarkdown.length > 0) {
				const combinedMarkdown = successfulMarkdown.join("\n");
				handleImageUpload(combinedMarkdown);
			}

			// Show errors for failed uploads
			const failedUploads = results.filter(r => r.error !== null);
			if (failedUploads.length > 0) {
				const errorMessages = failedUploads.map(f => `${f.filename}: ${f.error}`).join(", ");
				handleImageUploadError(errorMessages);
			}
		}

		processAllImages().catch(err => {
			log.error(err, "Failed to process dropped images");
		});
	}

	if (loading) {
		return (
			<div className="flex h-screen items-center justify-center" data-testid="draft-loading">
				{articleDraftsContent.loadingDrafts}
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-screen items-center justify-center flex-col gap-4" data-testid="draft-error">
				<p className="text-destructive">{error}</p>
				<Button onClick={() => navigate(getArticlesUrl(draft))}>{content.close}</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-screen" data-testid="article-draft-page">
			{/* Top Bar */}
			<div className="flex items-center justify-between p-4 border-b bg-card">
				<div className="flex items-center gap-4 flex-1 min-w-0">
					<Input
						value={draftTitle}
						onChange={e => {
							setDraftTitle(e.target.value);
							hasUserMadeChanges.current = true;
						}}
						className="font-semibold text-lg max-w-md"
						data-testid="draft-title-input"
					/>
					{/* Connection status */}
					{draftConnected && convoConnected && !draftReconnecting && !convoReconnecting && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<div className="h-2 w-2 rounded-full bg-green-500" />
							<span>{content.connected}</span>
						</div>
					)}
					{(draftReconnecting || convoReconnecting) && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
							<span>{content.reconnecting}</span>
						</div>
					)}
					{(!draftConnected || !convoConnected) && !draftReconnecting && !convoReconnecting && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<div className="h-2 w-2 rounded-full bg-red-500" />
							<span>{content.disconnected}</span>
						</div>
					)}
					{/* Last Edited */}
					{draft?.contentLastEditedAt && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<span>
								{content.lastEdited} {new Date(draft.contentLastEditedAt).toLocaleString()}
							</span>
						</div>
					)}
					{!draft?.contentLastEditedAt && draft && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground italic">
							<span>{content.noEditsYet}</span>
						</div>
					)}
				</div>

				<div className="flex items-center gap-2">
					{/* Active users */}
					{activeUsers.size > 0 && (
						<div className="flex items-center gap-1">
							{Array.from(activeUsers).map(userId => (
								<UserAvatar key={userId} userId={userId} size="small" />
							))}
						</div>
					)}

					<Button
						variant="outline"
						size="sm"
						onClick={handleUndo}
						disabled={!canUndo}
						data-testid="undo-button"
					>
						<Undo2 className="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleRedo}
						disabled={!canRedo}
						data-testid="redo-button"
					>
						<Redo2 className="h-4 w-4" />
					</Button>
					<EditHistoryDropdown history={editHistory} />
					{/* Version History button - only show when editing existing article */}
					{editingArticle && (
						<Button
							variant="outline"
							size="sm"
							className="hover:bg-primary/10 hover:border-primary transition-colors"
							onClick={() => setShowVersionHistory(true)}
							data-testid="version-history-button"
						>
							<History className="h-4 w-4 mr-2" />
							{content.versionHistory}
						</Button>
					)}
					{/* Share button - only visible for new drafts (no docId) that aren't already shared */}
					{draft && draft.docId == null && !draft.isShared && (
						<Button
							variant="outline"
							size="sm"
							onClick={handleShare}
							disabled={sharing}
							data-testid="share-button"
						>
							<Share2 className="h-4 w-4 mr-2" />
							{sharing ? content.sharing : content.share}
						</Button>
					)}
					{/* Show "Shared" badge if draft is shared */}
					{draft?.isShared && (
						<Badge
							variant="secondary"
							className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
							data-testid="shared-badge"
						>
							<Share2 className="h-3 w-3 mr-1" />
							{content.shared}
						</Badge>
					)}
					<Button
						variant="default"
						size="sm"
						onClick={handleSave}
						disabled={
							saving ||
							validationErrors.length > 0 ||
							(draft?.docId ? !hasUserMadeChanges.current : !articleContent.trim())
						}
						data-testid="save-button"
					>
						{saving ? content.saving : editingArticle ? content.saveChanges : content.save}
					</Button>
					<Button variant="ghost" size="icon" onClick={handleClose} data-testid="close-button">
						<X className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{/* Image error toast banner */}
			{imageError && (
				<div
					className="bg-destructive/10 border-b border-destructive/20 px-4 py-3"
					data-testid="image-error-toast"
				>
					<div className="flex items-center justify-between gap-2 text-sm text-destructive">
						<span>{imageError}</span>
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-destructive hover:text-destructive"
							onClick={() => setImageError(null)}
							data-testid="dismiss-image-error"
						>
							<X className="h-3 w-3" />
						</Button>
					</div>
				</div>
			)}

			{/* Banner when editing existing article */}
			{/* v8 ignore next 22 - conditional JSX rendering */}
			{editingArticle && (
				<div
					className="bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-800 px-4 py-3"
					data-testid="editing-banner"
				>
					<div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
						<Info className="h-4 w-4 flex-shrink-0" />
						<span>
							{content.editingArticle}{" "}
							<strong>{editingArticle.contentMetadata?.title ?? editingArticle.jrn}</strong>
						</span>
						{/* v8 ignore next 8 - conditional JSX rendering */}
						{sectionChanges.filter(c => !c.applied && !c.dismissed).length > 0 && (
							<Badge
								variant="secondary"
								className="ml-2 bg-[rgba(255,180,0,0.2)] text-[rgb(180,120,0)] border-[rgba(255,180,0,0.5)] hover:bg-[rgba(255,180,0,0.3)]"
								data-testid="suggested-edits-badge"
							>
								{sectionChanges.filter(c => !c.applied && !c.dismissed).length} {content.suggestedEdits}
							</Badge>
						)}
					</div>
				</div>
			)}

			{/* Main Content - Split Pane */}
			<div className="flex flex-1 overflow-hidden">
				{isMarkdownContentType(draft?.contentType) ? (
					<ResizablePanels
						initialLeftWidth={openPanelChangeIds.size > 0 ? 35 : 40}
						minLeftWidth={25}
						maxLeftWidth={50}
						storageKey="articleDraft.chatPanelWidth"
						data-testid="main-split"
						className={openPanelChangeIds.size > 0 ? "w-[80%]" : "flex-1"}
						left={
							/* Left Pane - Chat */
							<div className="h-full border-r flex flex-col bg-card" data-testid="chat-pane">
								<div className="p-4 border-b">
									<div className="flex items-center gap-2">
										<MessageSquare className="h-5 w-5 text-primary" />
										<h2 className="font-semibold">{content.aiAssistant}</h2>
									</div>
									<p className="text-sm text-muted-foreground mt-1">{content.startConversation}</p>
								</div>

								{/* Messages */}
								<div className="flex-1 overflow-y-auto p-4 space-y-4">
									{messages.length === 0 && !aiTyping && (
										<div
											className="text-center text-muted-foreground py-8"
											data-testid="no-messages"
										>
											{content.startConversation}
										</div>
									)}

									{messages.map((msg, idx) => (
										<div
											key={idx}
											className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
											data-testid={`message-${idx}`}
										>
											{msg.role === "assistant" && (
												<div className="flex-shrink-0">
													<div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
														<MessageSquare className="h-4 w-4 text-primary" />
													</div>
												</div>
											)}
											<div
												className={`max-w-[80%] rounded-lg p-3 ${
													msg.role === "user"
														? "bg-primary text-primary-foreground"
														: "bg-muted text-foreground"
												}`}
											>
												<MarkdownContent>{msg.content || ""}</MarkdownContent>
											</div>
											{msg.role === "user" && msg.userId && (
												<div className="flex-shrink-0">
													<UserAvatar userId={msg.userId} size="small" />
												</div>
											)}
										</div>
									))}

									{aiTyping && streamingMessage && (
										<div className="flex gap-2 justify-start" data-testid="ai-streaming">
											<div className="flex-shrink-0">
												<div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
													<MessageSquare className="h-4 w-4 text-primary" />
												</div>
											</div>
											<div className="max-w-[80%] rounded-lg p-3 bg-muted text-foreground">
												<MarkdownContent>{streamingMessage}</MarkdownContent>
											</div>
										</div>
									)}

									{aiTyping &&
										(toolExecuting ||
											isStreamingArticle ||
											!streamingMessage ||
											showLoadingIndicator) && (
											<div
												className="flex gap-2 justify-start items-center"
												data-testid="ai-typing"
											>
												<div className="flex-shrink-0">
													<div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
														<MessageSquare className="h-4 w-4 text-primary" />
													</div>
												</div>
												<div className="flex items-center gap-2">
													<div className="text-sm text-muted-foreground italic">
														{toolExecuting ? (
															<span>
																{getToolMessage(
																	toolExecuting.tool,
																	toolExecuting.arguments,
																	!!toolExecuting.result,
																)}
																{showToolDetails && toolExecuting.result ? (
																	<span>
																		{" "}
																		: {toolExecuting.result}
																		{toolExecuting.result.length >= 200 &&
																			!toolExecuting.result.endsWith("...") &&
																			"..."}
																	</span>
																) : !showToolDetails && !toolExecuting.result ? (
																	<span className="animate-pulse">...</span>
																) : showToolDetails && !toolExecuting.result ? (
																	<span className="animate-pulse">...</span>
																) : null}
															</span>
														) : isStreamingArticle ? (
															<span>
																{content.writingArticle}
																<span className="animate-pulse">...</span>
															</span>
														) : (
															<span>
																{content.aiTyping}
																<span className="animate-pulse">...</span>
															</span>
														)}
													</div>
													{toolExecuting && (
														<button
															onClick={() => setShowToolDetails(!showToolDetails)}
															className="text-xs text-muted-foreground hover:text-foreground transition-colors"
															title={String(
																showToolDetails
																	? content.hideDetails
																	: content.showDetails,
															)}
															data-testid="toggle-tool-details"
															type="button"
														>
															{showToolDetails ? (
																<ChevronUp className="h-3 w-3" />
															) : (
																<ChevronDown className="h-3 w-3" />
															)}
														</button>
													)}
												</div>
											</div>
										)}

									<div ref={messagesEndRef} />
								</div>

								{/* Input */}
								<div className="p-4 border-t">
									<div className="flex gap-2">
										<Textarea
											value={messageInput}
											onChange={e => setMessageInput(e.target.value)}
											onKeyDown={e => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													handleSendMessage().then();
												}
											}}
											placeholder={content.typeMessage.value}
											className="flex-1 min-h-[60px] max-h-[120px]"
											disabled={sending || aiTyping}
											data-testid="message-input"
										/>
										<Button
											onClick={handleSendMessage}
											disabled={!messageInput.trim() || sending || aiTyping}
											data-testid="send-message-button"
										>
											<Send className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>
						}
						right={
							/* Right Pane - Article Editor */
							<div className="h-full flex flex-col bg-background" data-testid="editor-pane">
								<div className="p-4 border-b bg-card">
									<div className="flex items-center gap-2">
										<h2 className="font-semibold">{content.articleContent}</h2>
									</div>
								</div>

								{renderValidationErrors()}

								<div className="flex-1 overflow-hidden">
									<Tabs defaultValue="preview" className="h-full flex flex-col">
										<div className="px-6 pt-4">
											<TabsList>
												<TabsTrigger value="preview" data-testid="preview-tab">
													{content.preview}
												</TabsTrigger>
												<TabsTrigger value="edit" data-testid="edit-tab">
													{content.edit}
												</TabsTrigger>
											</TabsList>
										</div>

										<TabsContent value="preview" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
											<div className="pt-4">
												<div
													className="prose dark:prose-invert max-w-none"
													data-testid="article-preview"
												>
													{sectionAnnotations.length > 0 && draft?.docId ? (
														<MarkdownContentWithChanges
															content={stripJolliScriptFrontmatter(articleContent)}
															annotations={sectionAnnotations}
															changes={sectionChanges}
															onSectionClick={handleSectionClick}
															openPanelChangeIds={openPanelChangeIds}
														/>
													) : (
														<MarkdownContent>
															{stripJolliScriptFrontmatter(articleContent)}
														</MarkdownContent>
													)}
												</div>
											</div>
										</TabsContent>

										<TabsContent value="edit" className="flex-1 overflow-hidden px-6 pb-6 mt-0">
											<div className="pt-4 h-full flex flex-col gap-2">
												<div className="flex items-center gap-2 pb-2">
													<ImageInsert
														articleContent={articleContent}
														onInsert={handleImageUpload}
														onDelete={handleImageDelete}
														onError={handleImageUploadError}
														disabled={saving || aiTyping}
													/>
												</div>
												<div
													className="flex-1"
													onPaste={handleEditorPaste}
													onDrop={handleEditorDrop}
													onDragOver={handleEditorDragOver}
													data-testid="article-editor-wrapper"
												>
													<NumberEdit
														ref={editorRef}
														value={articleContent}
														onChange={newContent => {
															setArticleContent(newContent);
															hasUserMadeChanges.current = true;
															// Clear validation errors when user edits content
															if (validationErrors.length > 0) {
																setValidationErrors([]);
															}
														}}
														highlightedLines={validationErrors
															.filter(err => err.line !== undefined)
															.map(err => err.line as number)}
														className="h-full"
														data-testid="article-content-textarea"
													/>
												</div>
											</div>
										</TabsContent>
									</Tabs>
								</div>
							</div>
						}
					/>
				) : (
					/* Non-markdown content - no chat pane */
					<div className="flex-1 flex flex-col bg-background" data-testid="editor-pane">
						<div className="p-4 border-b bg-card">
							<div className="flex items-center gap-2">
								<h2 className="font-semibold">{content.articleContent}</h2>
								{!isMarkdownContentType(draft?.contentType) && (
									<Badge variant="secondary" data-testid="content-type-badge">
										{getContentTypeLabel(draft?.contentType)}
									</Badge>
								)}
							</div>
						</div>

						{renderValidationErrors()}

						<div className="flex-1 overflow-hidden">
							<Tabs defaultValue="preview" className="h-full flex flex-col">
								<div className="px-6 pt-4">
									<TabsList>
										<TabsTrigger value="preview" data-testid="preview-tab">
											{content.preview}
										</TabsTrigger>
										<TabsTrigger value="edit" data-testid="edit-tab">
											{content.edit}
										</TabsTrigger>
									</TabsList>
								</div>

								<TabsContent value="preview" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
									<div className="pt-4">
										<div
											className="prose dark:prose-invert max-w-none"
											data-testid="article-preview"
										>
											{/* v8 ignore next 14 - markdown branches unreachable in non-markdown content type */}
											{isMarkdownContentType(draft?.contentType) ? (
												sectionAnnotations.length > 0 && draft?.docId ? (
													<MarkdownContentWithChanges
														content={stripJolliScriptFrontmatter(articleContent)}
														annotations={sectionAnnotations}
														changes={sectionChanges}
														onSectionClick={handleSectionClick}
														openPanelChangeIds={openPanelChangeIds}
													/>
												) : (
													<MarkdownContent>
														{stripJolliScriptFrontmatter(articleContent)}
													</MarkdownContent>
												)
											) : (
												<pre className="bg-muted p-4 rounded-lg overflow-auto text-sm font-mono">
													<code data-testid="code-preview">
														{articleContent ||
															`// ${getContentTypeLabel(draft?.contentType)} content`}
													</code>
												</pre>
											)}
										</div>
									</div>
								</TabsContent>

								<TabsContent value="edit" className="flex-1 overflow-hidden px-6 pb-6 mt-0">
									<div className="pt-4 h-full flex flex-col gap-2">
										<div className="flex items-center gap-2 pb-2">
											<ImageInsert
												articleContent={articleContent}
												onInsert={handleImageUpload}
												onDelete={handleImageDelete}
												onError={handleImageUploadError}
												disabled={saving || aiTyping}
											/>
										</div>
										<div
											className="flex-1"
											onPaste={handleEditorPaste}
											onDrop={handleEditorDrop}
											onDragOver={handleEditorDragOver}
										>
											<NumberEdit
												ref={editorRef}
												value={articleContent}
												onChange={newContent => {
													setArticleContent(newContent);
													hasUserMadeChanges.current = true;
													// Clear validation errors when user edits content
													if (validationErrors.length > 0) {
														setValidationErrors([]);
													}
												}}
												highlightedLines={validationErrors
													.filter(err => err.line !== undefined)
													.map(err => err.line as number)}
												className="h-full"
												data-testid="article-content-textarea"
											/>
										</div>
									</div>
								</TabsContent>
							</Tabs>
						</div>
					</div>
				)}

				{/* Third Pane - Section Change Panels */}
				{openPanelChangeIds.size > 0 && draft?.docId && (
					<div
						className="w-[20%] border-l flex flex-col bg-background overflow-y-auto"
						data-testid="panels-pane"
					>
						{(() => {
							// Get all changes that are currently open
							const openChanges = sectionChanges.filter(c => openPanelChangeIds.has(c.id));

							/* v8 ignore next 3 - defensive guard for race condition when SSE clears changes while panel is open */
							if (openChanges.length === 0) {
								return null;
							}

							return (
								<SectionChangePanel
									changes={openChanges}
									onApply={handleApplySectionChange}
									onDismiss={handleDismissSectionChange}
									onClose={() => {
										// Close all open panels
										setOpenPanelChangeIds(new Set());
									}}
								/>
							);
						})()}
					</div>
				)}
			</div>

			{/* Version History Dialog */}
			{editingArticle && (
				<VersionHistoryProvider onVersionRestored={refreshEditingArticle}>
					<VersionHistoryDialog
						isOpen={showVersionHistory}
						docId={editingArticle.id}
						currentDoc={{
							title: draftTitle,
							content: articleContent,
							version: editingArticle.version,
						}}
						currentReferVersion={editingArticle.contentMetadata?.referVersion}
						onClose={() => setShowVersionHistory(false)}
					/>
				</VersionHistoryProvider>
			)}

			{/* Image Delete Confirmation Dialog */}
			{imageToDelete && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setImageToDelete(null)}
					data-testid="delete-image-confirm-backdrop"
				>
					<div
						className="bg-background border border-border rounded-lg p-6 max-w-md w-full m-4"
						onClick={e => e.stopPropagation()}
						data-testid="delete-image-confirm-dialog"
					>
						<h2 className="text-xl font-semibold mb-4">{content.deleteImageTitle}</h2>
						<p className="text-muted-foreground mb-6">{content.deleteImageDescription}</p>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setImageToDelete(null)}
								disabled={deletingImage}
								data-testid="delete-image-cancel-button"
							>
								{content.deleteImageCancel}
							</Button>
							<Button
								variant="destructive"
								onClick={confirmImageDelete}
								disabled={deletingImage}
								data-testid="delete-image-confirm-button"
							>
								{content.deleteImageConfirm}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Version History Dialog */}
			{editingArticle && (
				<VersionHistoryProvider onVersionRestored={refreshEditingArticle}>
					<VersionHistoryDialog
						isOpen={showVersionHistory}
						docId={editingArticle.id}
						currentDoc={{
							title: draftTitle,
							content: articleContent,
							version: editingArticle.version,
						}}
						currentReferVersion={editingArticle.contentMetadata?.referVersion}
						onClose={() => setShowVersionHistory(false)}
					/>
				</VersionHistoryProvider>
			)}
		</div>
	);
}
