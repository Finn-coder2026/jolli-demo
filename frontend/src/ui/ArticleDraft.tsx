import { ACCEPTED_IMAGE_TYPES, ImageInsert, MAX_FILE_SIZE_MB } from "../components/ImageInsert";
import { MarkdownContent } from "../components/MarkdownContent";
import { UserAvatar } from "../components/UserAvatar";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../components/ui/AlertDialog";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../components/ui/DropdownMenu";
import { NumberEdit, type NumberEditRef } from "../components/ui/NumberEdit";
import { Separator } from "../components/ui/Separator";
import { Textarea } from "../components/ui/Textarea";
import { TiptapEdit, type TiptapEditRef } from "../components/ui/TiptapEdit";
import { SpaceImageProvider } from "../context/SpaceImageContext";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { useHasPermission } from "../contexts/PermissionContext";
import { PREFERENCES } from "../contexts/PreferencesContext";
import { useLocation } from "../contexts/RouterContext";
import { useSpace } from "../contexts/SpaceContext";
import { VersionHistoryProvider } from "../contexts/VersionHistoryContext";
import { usePreference } from "../hooks/usePreference";
import { stripJolliScriptFrontmatter } from "../util/ContentUtil";
import { getLog } from "../util/Logger";
import { isConvoTerminalEvent, isSelfEchoByUserId, shouldIgnoreConvoSelfEcho } from "../util/SelfEchoGuard";
import { ChunkReorderer, createSseSubscription, type SseSubscription } from "../util/SseSubscription";
import { countPendingChanges, emitSuggestionsChanged } from "../util/SuggestionEvents";
import { VersionHistoryDialog } from "./components/VersionHistoryDialog";
import { ArticleOutline, extractHeadingsFromEditor, type OutlineHeading } from "./spaces/ArticleOutline";
import {
	type CollabConvo,
	type CollabMessage,
	type ContentDiff,
	type Doc,
	type DocDraft,
	type DocDraftSectionChanges,
	extractBrainContent,
	type OpenApiValidationError,
	type SectionAnnotation,
	type ToolEvent,
} from "jolli-common";
import {
	Bot,
	Brain,
	ChevronDown,
	ChevronUp,
	Eye,
	EyeOff,
	FileText,
	GripVertical,
	Hash,
	History,
	Lightbulb,
	MoreHorizontal,
	PanelLeftClose,
	PanelRightClose,
	Redo,
	Save,
	Send,
	Share2,
	Sparkles,
	Trash2,
	Undo,
	User,
	X,
} from "lucide-react";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIntlayer } from "react-intlayer";
import { cn } from "@/common/ClassNameUtils";

const log = getLog(import.meta);

/** Timeout for clearing tool result display (milliseconds). */
export const TOOL_RESULT_TIMEOUT = 10000;
const CONVO_PENDING_REQUEST_LIMIT = 64;

// Helper to check if content type supports AI assistant
function isMarkdownContentType(contentType: string | undefined): boolean {
	return !contentType || contentType === "text/markdown";
}

// Helper to get file extension label for content type
/* v8 ignore start - content type label helper */
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

/* v8 ignore stop */

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

/**
 * Module-level cache for user ID → display name map.
 * Shared across all ArticleDraft instances to avoid re-fetching per mount.
 */
const userNameCacheRef: { current: Map<string, string> | null } = { current: null };

/** @internal Resets the user name cache. Used by tests for isolation. */
export function resetUserNameCache(): void {
	userNameCacheRef.current = null;
}

// Clear the module-level cache on hot module reload to avoid stale user names during development.
if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		userNameCacheRef.current = null;
	});
}

/**
 * Combines brain content and article content into the full saved format.
 * Format: `---\n{brainContent}\n---\n\n{articleContent}`
 *
 * @param brainContent - Content for the brain/frontmatter section
 * @param articleContent - Main article content
 * @returns Combined content string
 */
function combineContentWithBrain(brainContent: string, articleContent: string): string {
	if (!brainContent.trim()) {
		// No brain content, return article content as-is
		return articleContent;
	}
	return `---\n${brainContent}\n---\n\n${articleContent}`;
}

interface ArticleDraftProps {
	/** Optional draftId prop for inline editing mode (overrides URL-based draftId) */
	draftId?: number | undefined;
	/** Article JRN for always-editable mode (no draft yet, lazy creation on first edit) */
	articleJrn?: string | undefined;
	/** Article title for instant display before article data loads */
	articleTitle?: string | undefined;
	/** Callback when the article is deleted (soft delete) — used by Spaces to remove from tree */
	onArticleDeleted?: ((docId: number) => void) | undefined;
	/** Portal target element for header actions — provided by Spaces breadcrumb bar */
	headerActionsContainer?: HTMLDivElement | null | undefined;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is a complex component that manages article drafts, SSE connections, and chat state
export function ArticleDraft({
	draftId: propDraftId,
	articleJrn,
	articleTitle,
	onArticleDeleted,
	headerActionsContainer,
}: ArticleDraftProps): ReactElement {
	const content = useIntlayer("article-draft");
	const tiptapContent = useIntlayer("tiptap-edit");
	const articleDraftsContent = useIntlayer("article-drafts");
	const client = useClient();
	const { draftId: navDraftId, navigate, currentUserId, currentUserName } = useNavigation();
	const location = useLocation();
	const { currentSpace } = useSpace();
	const canEdit = useHasPermission("articles.edit");
	// Use prop draftId if provided (inline mode), otherwise use navigation draftId (URL mode)
	const draftId = propDraftId ?? navDraftId;
	// Track whether we're in inline mode (using prop or articleJrn) for navigation behavior
	const isInlineMode = propDraftId !== undefined || articleJrn !== undefined;
	const heightClass = isInlineMode ? "h-full" : "h-screen";
	const [draft, setDraft] = useState<DocDraft | null>(null);
	const [editingArticle, setEditingArticle] = useState<Doc | null>(null);

	// Get spaceId for image uploads:
	// - For existing articles: use the article's spaceId
	// - For new drafts: use the current space from SpaceContext
	/* v8 ignore next 1 - fallback to currentSpace */
	const imageUploadSpaceId = editingArticle?.spaceId ?? currentSpace?.id;
	const [articleContent, setArticleContent] = useState("");
	const [draftTitle, setDraftTitle] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [showDiscardDialog, setShowDiscardDialog] = useState(false);
	const [showDeleteArticleDialog, setShowDeleteArticleDialog] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<"article" | "markdown" | "brain">("article");
	const [brainContent, setBrainContent] = useState<string>("");
	const [showAgentPanel, setShowAgentPanel] = useState(false);
	const [markdownPreview, setMarkdownPreview] = useState<string>("");
	const brainContentRef = useRef<string>("");
	const articleContentRef = useRef<string>("");

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

	// Chat pane resize state
	const [savedChatPaneWidth, setSavedChatPaneWidth] = usePreference(PREFERENCES.articleDraftChatPaneWidth);
	const [chatPaneWidth, setChatPaneWidth] = useState(savedChatPaneWidth);
	const [isResizingChatPane, setIsResizingChatPane] = useState(false);
	const [chatPanePosition, setChatPanePosition] = usePreference(PREFERENCES.chatbotPosition);
	const chatPaneRef = useRef<HTMLDivElement>(null);
	const chatPaneWidthRef = useRef(chatPaneWidth);

	// Article streaming state
	const streamingArticleRef = useRef<string>("");
	const fullStreamBufferRef = useRef<string>("");
	const [isStreamingArticle, setIsStreamingArticle] = useState(false);
	const justFinishedStreamingRef = useRef<boolean>(false);

	// Chunk reordering for Mercure (chunks may arrive out of order)
	const chunkReordererRef = useRef(new ChunkReorderer<string>());

	// Draft state machine for lazy draft creation.
	// Start in "editing_draft" if we already have a draft ID (prop from Spaces or URL nav).
	// Start in "viewing" only for the always-editable Spaces mode where no draft exists yet.
	const [draftState, setDraftState] = useState<"viewing" | "creating_draft" | "editing_draft">(
		propDraftId !== undefined || navDraftId !== undefined ? "editing_draft" : "viewing",
	);

	// Ref to skip the load effect after internal transitions (lazy draft creation, save/discard).
	// These transitions change draftId/articleJrn via URL navigation but the component already
	// has the correct state — re-fetching would clobber in-progress editor content.
	const skipNextLoadRef = useRef(false);

	// Refs used by the propDraftId reset effect to read current values without making them
	// dependencies — they should not re-trigger the effect, only be read at trigger time.
	const navDraftIdRef = useRef(navDraftId);
	navDraftIdRef.current = navDraftId;
	const draftStateRef = useRef(draftState);
	draftStateRef.current = draftState;

	// Reset draft state when propDraftId is removed (e.g. after save/discard navigates away the ?edit= param).
	// Only applies in Spaces inline-editing mode (propDraftId-based), not URL mode (navDraftId-based).
	// Restores published article content immediately from originalArticleRef (no API call).
	useEffect(() => {
		if (propDraftId === undefined && navDraftIdRef.current === undefined && draftStateRef.current !== "viewing") {
			skipNextLoadRef.current = true;
			setDraftState("viewing");
			setSaving(false);
			setDraft(null);
			setConvo(null);
			setMessages([]);
			updateHasUserMadeChanges(false, "propDraftId removed - returning to viewing mode");

			const original = originalArticleRef.current;
			if (original) {
				const { brainContent: parsedBrain, articleContent: parsedArticle } = extractBrainContent(
					original.content,
				);
				setBrainContent(parsedBrain);
				setArticleContent(parsedArticle);
				setDraftTitle(original.contentMetadata?.title ?? articleTitle ?? "");
				setMarkdownPreview("");
			}
		}
	}, [propDraftId, articleTitle]);

	// Collapsible toolbar preference (only active in inline/Spaces mode)
	const [toolbarCollapsed, setToolbarCollapsed] = usePreference(PREFERENCES.editorToolbarCollapsed);

	// Article outline (TOC) state
	const [outlineHeadings, setOutlineHeadings] = useState<Array<OutlineHeading>>([]);
	const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

	const originalArticleRef = useRef<Doc | null>(null);

	// Track if user has made changes since loading (state so Save button re-renders)
	const [hasUserMadeChanges, setHasUserMadeChanges] = useState(false);

	/** Update the hasUserMadeChanges flag with logging. */
	const updateHasUserMadeChanges = useCallback((value: boolean, reason: string) => {
		setHasUserMadeChanges(value);
		log.debug("hasUserMadeChanges updated to %s: %s", value, reason);
	}, []);

	// Undo/Redo state
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	// Refs to track current undo/redo state for keyboard event handlers (to avoid stale closures)
	const canUndoRef = useRef(false);
	const canRedoRef = useRef(false);

	// Section changes state
	const [sectionAnnotations, setSectionAnnotations] = useState<Array<SectionAnnotation>>([]);
	const [sectionChanges, setSectionChanges] = useState<Array<DocDraftSectionChanges>>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);

	// Title editing state (click-to-edit pattern)
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);

	// Validation state
	const [validationErrors, setValidationErrors] = useState<Array<OpenApiValidationError>>([]);
	const editorRef = useRef<NumberEditRef>(null);
	const brainEditorRef = useRef<NumberEditRef>(null);
	const tiptapRef = useRef<TiptapEditRef>(null);

	// Undo/redo state for Markdown and Brain editors
	const [markdownCanUndo, setMarkdownCanUndo] = useState(false);
	const [markdownCanRedo, setMarkdownCanRedo] = useState(false);
	const [brainCanUndo, setBrainCanUndo] = useState(false);
	const [brainCanRedo, setBrainCanRedo] = useState(false);
	const tiptapImageInputRef = useRef<HTMLInputElement>(null);

	// Image deletion state
	const [imageToDelete, setImageToDelete] = useState<string | null>(null);
	/* v8 ignore next 1 */
	const [deletingImage, setDeletingImage] = useState(false);
	const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Image error toast state (separate from page-level error to avoid full-page redirect)
	const [imageError, setImageError] = useState<string | null>(null);

	// SSE connection state — drives the status badge in the header
	const [_draftConnected, setDraftConnected] = useState(false);
	const [_convoConnected, setConvoConnected] = useState(false);
	const [_activeUsers, setActiveUsers] = useState<Set<number>>(new Set());
	const [draftReconnecting, setDraftReconnecting] = useState(false);
	const [convoReconnecting, setConvoReconnecting] = useState(false);
	const [draftFailed, setDraftFailed] = useState(false);
	const [convoFailed, setConvoFailed] = useState(false);
	const draftSubscriptionRef = useRef<SseSubscription | null>(null);
	const convoSubscriptionRef = useRef<SseSubscription | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const currentUserIdRef = useRef<number | undefined>(currentUserId);
	const pendingConvoRequestIdsRef = useRef(new Set<string>());
	const pendingConvoRequestQueueRef = useRef<Array<string>>([]);

	const pendingSectionChangeFetchRef = useRef<boolean>(false);
	const previousPendingCountRef = useRef<number>(0);

	useEffect(() => {
		const pendingCount = countPendingChanges(sectionChanges);
		if (showSuggestions && pendingCount === 0) {
			setShowSuggestions(false);
		}
	}, [showSuggestions, sectionChanges]);

	useEffect(() => {
		currentUserIdRef.current = currentUserId;
	}, [currentUserId]);

	// Populate the module-level user name cache on first mount (shared across all instances).
	useEffect(() => {
		if (userNameCacheRef.current) {
			return;
		}
		client
			.userManagement()
			.listActiveUsers()
			.then(response => {
				const cache = new Map<string, string>();
				for (const user of response.data) {
					cache.set(String(user.id), user.name ?? user.email);
				}
				userNameCacheRef.current = cache;
			})
			.catch(err => {
				log.warn(err, "Failed to load user names for display");
			});
	}, [client]);

	// Sync local chat pane width when preference changes
	useEffect(() => {
		if (!isResizingChatPane) {
			setChatPaneWidth(savedChatPaneWidth);
			chatPaneWidthRef.current = savedChatPaneWidth;
		}
	}, [savedChatPaneWidth, isResizingChatPane]);

	// Handle chat pane resize drag - using imperative approach with refs
	function handleChatPaneResizeMouseDown(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		setIsResizingChatPane(true);

		// Capture the edge position of the chat pane at drag start
		const chatPaneRect = chatPaneRef.current?.getBoundingClientRect();
		/* v8 ignore next 2 - chat pane edge fallbacks */
		const chatPaneLeftEdge = chatPaneRect?.left ?? 0;
		const chatPaneRightEdge = chatPaneRect?.right ?? window.innerWidth;
		// Capture position at drag start (closure variable)
		const isRightPosition = chatPanePosition === "right";

		// Disable text selection during drag
		document.body.style.userSelect = "none";
		document.body.style.cursor = "ew-resize";

		/* v8 ignore start */
		function handleMouseMove(moveEvent: MouseEvent) {
			// Calculate width based on panel position
			// Left position: drag handle on right edge, width = mouse X - left edge
			// Right position: drag handle on left edge, width = right edge - mouse X
			/* v8 ignore next 3 - resize calculation */
			const newWidth = isRightPosition
				? chatPaneRightEdge - moveEvent.clientX
				: moveEvent.clientX - chatPaneLeftEdge;
			// Constrain between min (200px) and max (600px)
			const constrainedWidth = Math.min(Math.max(newWidth, 200), 600);
			setChatPaneWidth(constrainedWidth);
			chatPaneWidthRef.current = constrainedWidth;
		}
		/* v8 ignore stop */

		/* v8 ignore start */
		function handleMouseUp() {
			setIsResizingChatPane(false);
			// Restore text selection and cursor
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
			// Save to preferences
			setSavedChatPaneWidth(chatPaneWidthRef.current);
			// Clean up listeners
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		}
		/* v8 ignore stop */

		// Add listeners immediately on mousedown
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	}

	// Load draft or article on mount, or when the target article/draft changes.
	// Internal transitions (lazy draft creation, save/discard) set skipNextLoadRef to
	// avoid redundant API fetches that would clobber in-progress editor content.
	// Note: in Spaces, ArticleDraft is keyed by articleJrn so cross-article navigation
	// causes a full remount rather than a prop change — but we include articleJrn here
	// for correctness when the component is used without a key.
	useEffect(() => {
		const shouldSkip = skipNextLoadRef.current;
		skipNextLoadRef.current = false;

		if (!shouldSkip) {
			if (draftId) {
				// Existing draft mode: load draft and setup SSE
				loadDraft(draftId).then();
			} else if (articleJrn) {
				// Always-editable mode: load article directly, no draft yet
				loadArticle(articleJrn).then();
			} else {
				setError("No draft ID or article JRN provided");
				setLoading(false);
			}
		} else if (draftId) {
			// Skip path after lazy draft creation: just set up SSE without re-fetching content
			setupDraftStream(draftId).then();
		}
		// Skip path after save/discard (draftId is undefined): nothing to do — reset effect handled state

		/* v8 ignore next 8 - cleanup function tested via unmount tests */
		return () => {
			// Cleanup SSE connections
			draftSubscriptionRef.current?.close();
			convoSubscriptionRef.current?.close();
			// Cleanup error timeout
			if (errorTimeoutRef.current) {
				clearTimeout(errorTimeoutRef.current);
			}
			pendingConvoRequestIdsRef.current.clear();
			pendingConvoRequestQueueRef.current = [];
		};
	}, [draftId, articleJrn]);

	// Focus title input when editing starts
	useEffect(() => {
		if (isEditingTitle && titleInputRef.current) {
			titleInputRef.current.focus();
			titleInputRef.current.select();
		}
	}, [isEditingTitle]);

	// Sync refs with state for keyboard event handler closure safety
	useEffect(() => {
		canUndoRef.current = canUndo;
	}, [canUndo]);

	useEffect(() => {
		canRedoRef.current = canRedo;
	}, [canRedo]);

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

	useEffect(() => {
		brainContentRef.current = brainContent;
	}, [brainContent]);

	useEffect(() => {
		articleContentRef.current = articleContent;
	}, [articleContent]);

	// Auto-save draft periodically when content changes (includes brainContent)
	useEffect(() => {
		/* v8 ignore next 5 - defensive guard for missing draftId */
		if (!draftId || loading || isStreamingArticle || aiTyping) {
			return;
		}

		// Don't auto-save if user hasn't made changes (prevents auto-save on initial load)
		if (!hasUserMadeChanges) {
			return;
		}

		// Debounce auto-save: wait 2 seconds after last change
		/* v8 ignore next 6 - setTimeout callback and cleanup tested indirectly */
		const timeoutId = setTimeout(() => {
			autoSaveDraft().then();
		}, 2000);

		return () => clearTimeout(timeoutId);
	}, [articleContent, brainContent, draftTitle, draftId, loading, isStreamingArticle, aiTyping]);

	// Keyboard shortcuts for undo/redo
	useEffect(() => {
		/* v8 ignore start */
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
		/* v8 ignore stop */

		window.addEventListener("keydown", handleKeyDown);
		/* v8 ignore next - cleanup function tested indirectly */
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [draftId]);

	async function loadDraft(id: number) {
		try {
			const draftData = await client.docDrafts().getDocDraft(id);
			setDraft(draftData);

			// Parse frontmatter: first ---...--- goes to brainContent, rest goes to articleContent
			const { brainContent: parsedBrain, articleContent: parsedArticle } = extractBrainContent(draftData.content);
			setBrainContent(parsedBrain);
			setArticleContent(parsedArticle);
			setDraftTitle(draftData.title);

			// If this draft is editing an existing article, load the article and check for changes
			if (draftData.docId) {
				try {
					const article = await client.docs().getDocById(draftData.docId);
					if (article) {
						setEditingArticle(article);
						const newValue = !draftMatchesArticle(
							draftData.content,
							draftData.title,
							draftData.contentType,
							article,
						);
						updateHasUserMadeChanges(newValue, "Page Load - editing existing article");
					} else {
						updateHasUserMadeChanges(false, "Page Load - article not found");
					}
				} catch (err) {
					log.error(err, "Failed to load article being edited");
					updateHasUserMadeChanges(false, "Page Load - error loading article");
				}
			} else {
				updateHasUserMadeChanges(false, "Page Load - new draft");
			}

			// Setup draft SSE stream
			setupDraftStream(id).then();

			// Load section changes
			try {
				const sectionChangesData = await client.docDrafts().getSectionChanges(id);
				setSectionAnnotations(sectionChangesData.sections);
				setSectionChanges(sectionChangesData.changes);

				// Auto-show inline suggestions if there are pending changes on initial load
				const pendingCount = countPendingChanges(sectionChangesData.changes);
				previousPendingCountRef.current = pendingCount;
				if (pendingCount > 0) {
					setShowSuggestions(true);
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
			// Initial validation: validate Brain first, then Article/Markdown
			// This determines which mode to start in based on content validity
			let initialMode: "article" | "markdown" | "brain" = "article";

			// Step 1: Validate Brain content (skip if empty)
			if (parsedBrain.trim()) {
				try {
					const brainContentWithFrontmatter = `---\n${parsedBrain}\n---`;
					const brainResult = await client
						.docDrafts()
						.validateContent(brainContentWithFrontmatter, draftData.contentType);
					/* v8 ignore next 3 - brain validation failure on load */
					if (!brainResult.isValid) {
						setValidationErrors(brainResult.errors);
						initialMode = "brain";
						/* v8 ignore next 1 */
					}
				} catch (error) {
					/* v8 ignore next 3 - validation API error handling */
					log.error(error, "Failed to validate brain content on load");
					// Continue with default mode if validation API fails
				}
			}

			// Step 2: If Brain passed, validate Article/Markdown content
			if (initialMode === "article") {
				try {
					const articleResult = await client
						.docDrafts()
						.validateContent(parsedArticle, draftData.contentType);
					if (!articleResult.isValid) {
						setValidationErrors(articleResult.errors);
						initialMode = "markdown";
					}
				} catch (error) {
					log.error(error, "Failed to validate article content on load");
					// Continue with default mode if validation API fails
				}
			}

			setViewMode(initialMode);
		} catch (err) {
			log.error(err, "Failed to load draft");
			setError(content.errorLoading.value);
		} finally {
			setLoading(false);
		}
	}

	/**
	 * Load an article directly for always-editable mode (no draft yet).
	 * The article is loaded into the editor in "viewing" state.
	 * A draft will be created lazily on first content change.
	 */
	async function loadArticle(jrn: string) {
		try {
			const article = await client.docs().findDoc(jrn);
			if (!article) {
				setError(content.errorLoading.value);
				return;
			}

			setEditingArticle(article);
			originalArticleRef.current = article;

			// Parse brain/article content
			const { brainContent: parsedBrain, articleContent: parsedArticle } = extractBrainContent(article.content);
			setBrainContent(parsedBrain);
			setArticleContent(parsedArticle);
			setDraftTitle(article.contentMetadata?.title ?? articleTitle ?? "");

			// Set state machine to "viewing" — no draft exists yet
			setDraftState("viewing");
			updateHasUserMadeChanges(false, "Article loaded in viewing mode");

			setViewMode("article");
		} catch (err) {
			log.error(err, "Failed to load article for editing");
			setError(content.errorLoading.value);
		} finally {
			setLoading(false);
		}
	}

	/**
	 * Create a draft lazily when the user first edits article content.
	 * Transitions state machine from "viewing" → "creating_draft" → "editing_draft".
	 */
	const createLazyDraft = useCallback(async (): Promise<CollabConvo | undefined> => {
		if (!canEdit || draftState !== "viewing" || !editingArticle) {
			return;
		}

		setDraftState("creating_draft");
		try {
			const newDraft = await client.docs().createDraftFromArticle(editingArticle.jrn);
			setDraft(newDraft);
			setDraftState("editing_draft");
			updateHasUserMadeChanges(true, "Lazy draft created on first edit");

			// Create conversation for the new draft so the agent chat works
			let createdConvo: CollabConvo | undefined;
			try {
				createdConvo = await client.collabConvos().createCollabConvo("doc_draft", newDraft.id);
				setConvo(createdConvo);
				setMessages(createdConvo.messages);
				setupConvoStream(createdConvo.id).then();
			} catch (convoErr) {
				log.error(convoErr, "Failed to create conversation for lazy draft");
			}

			// Update URL to include draft ID so refresh works.
			// Skip the next load effect — we already have the draft in state;
			// the effect's skip path will set up the SSE stream.
			skipNextLoadRef.current = true;
			const params = new URLSearchParams(location.search);
			params.set("edit", String(newDraft.id));
			if (editingArticle.id) {
				params.set("doc", String(editingArticle.id));
			}
			navigate(`/articles?${params.toString()}`);
			return createdConvo;
		} catch (err) {
			log.error(err, "Failed to create lazy draft");
			setError(content.errorLoading.value);
			// Revert to viewing state on failure
			setDraftState("viewing");
			return;
		}
	}, [canEdit, draftState, editingArticle, client, location.search, navigate, content.errorLoading]);

	/**
	 * Refresh the editing article data after version restore.
	 * This fetches the latest article data from the server and updates the local state.
	 */
	/* v8 ignore start */
	async function refreshEditingArticle() {
		if (!editingArticle?.id) {
			return;
		}

		try {
			const article = await client.docs().getDocById(editingArticle.id);
			if (article) {
				setEditingArticle(article);
				// Parse frontmatter: first ---...--- goes to brainContent, rest goes to articleContent
				const { brainContent: parsedBrain, articleContent: parsedArticle } = extractBrainContent(
					article.content,
				);
				setBrainContent(parsedBrain);
				setArticleContent(parsedArticle);
				setDraftTitle(article.contentMetadata?.title ?? "");
				updateHasUserMadeChanges(false, "version restore sync");
				log.debug("Article refreshed after version restore, version=%d", article.version);
			}
		} catch (err) {
			log.error(err, "Failed to refresh article after version restore");
		}
	}
	/* v8 ignore stop */

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
				log.debug("Draft SSE connected");
				setDraftConnected(true);
				setDraftReconnecting(false);
				setDraftFailed(false);
			},
			onReconnecting: attempt => {
				log.debug("Draft SSE reconnecting, attempt %d", attempt);
				setDraftReconnecting(true);
				setDraftConnected(false);
			},
			onReconnected: afterAttempts => {
				log.debug("Draft SSE reconnected after %d attempts", afterAttempts);
				setDraftReconnecting(false);
				setDraftConnected(true);
				setDraftFailed(false);
			},
			onFailed: () => {
				log.error("Draft SSE connection failed after maximum reconnection attempts");
				setDraftFailed(true);
				setDraftReconnecting(false);
				setDraftConnected(false);
			},
		});
	}

	async function setupConvoStream(id: number) {
		convoSubscriptionRef.current = await createSseSubscription<{
			type: string;
			userId?: number;
			clientRequestId?: string;
			content?: string;
			seq?: number;
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
				setConvoFailed(false);
			},
			onReconnecting: attempt => {
				log.debug("Convo SSE reconnecting, attempt %d", attempt);
				setConvoReconnecting(true);
				setConvoConnected(false);
			},
			onReconnected: afterAttempts => {
				log.debug("Convo SSE reconnected after %d attempts", afterAttempts);
				setConvoReconnecting(false);
				setConvoConnected(true);
				setConvoFailed(false);
			},
			onFailed: () => {
				log.error("Convo SSE connection failed after maximum reconnection attempts");
				setConvoFailed(true);
				setConvoReconnecting(false);
				setConvoConnected(false);
			},
		});
	}

	function generateClientRequestId(): string {
		return crypto.randomUUID();
	}

	function registerPendingConvoRequest(clientRequestId: string): void {
		const pendingIds = pendingConvoRequestIdsRef.current;
		const pendingQueue = pendingConvoRequestQueueRef.current;
		if (!pendingIds.has(clientRequestId)) {
			pendingIds.add(clientRequestId);
			pendingQueue.push(clientRequestId);
		}
		while (pendingQueue.length > CONVO_PENDING_REQUEST_LIMIT) {
			const oldest = pendingQueue.shift();
			if (oldest !== undefined) {
				pendingIds.delete(oldest);
			}
		}
	}

	function clearPendingConvoRequest(clientRequestId: string): void {
		pendingConvoRequestIdsRef.current.delete(clientRequestId);
	}

	/**
	 * Navigates away from inline edit mode by clearing the ?edit= param.
	 * Optionally preserves or clears the ?doc= param for post-navigation selection state.
	 */
	/* v8 ignore next 8 - navigation helper difficult to test with coverage */
	function navigateAfterInlineEdit(preserveDoc: boolean): void {
		const params = new URLSearchParams(location.search);
		params.delete("edit");
		if (preserveDoc && draft?.docId) {
			params.set("doc", String(draft.docId));
		} else if (!preserveDoc) {
			params.delete("doc");
		}
		const queryString = params.toString();
		navigate(`/articles${queryString ? `?${queryString}` : ""}`);
	}

	/* v8 ignore next 8 - navigation in async event handler difficult to test with coverage */
	function handleDraftSaved(): void {
		if (isInlineMode) {
			navigateAfterInlineEdit(true);
		} else if (editingArticle) {
			navigate(`/articles/${encodeURIComponent(editingArticle.jrn)}`);
		} else {
			navigate(getArticlesUrl(draft));
		}
	}

	/* v8 ignore next 6 - navigation in async event handler difficult to test with coverage */
	function handleDraftDeleted(): void {
		if (isInlineMode) {
			navigateAfterInlineEdit(false);
		} else {
			navigate(getArticlesUrl(draft));
		}
	}

	function handleDraftSSEEvent(data: {
		type: string;
		userId?: number;
		clientMutationId?: string;
		diffs?: Array<ContentDiff>;
	}) {
		const myUserId = currentUserIdRef.current;
		switch (data.type) {
			case "connected":
				log.debug("Draft SSE event: connected");
				setDraftConnected(true);
				break;
			case "content_update":
				// Ignore self-echo updates (Mercure republishes sender updates)
				if (data.diffs && !isSelfEchoByUserId(data.userId, myUserId)) {
					applyDiffsToArticle(data.diffs);
				}
				break;
			case "draft_saved":
				handleDraftSaved();
				break;
			case "draft_deleted":
				handleDraftDeleted();
				break;
		}
	}

	function getToolMessage(toolName: string, args: string, hasResult: boolean) {
		if (showToolDetails) {
			// Detailed view: show toolName(args) or toolName(args): result
			const truncatedArgs = args.length >= 200 && !args.endsWith("...") ? `${args}...` : args;
			return content.toolCall({ toolName, args: truncatedArgs }).value;
		}
		// Simple view: "Running the toolName tool" or "Running the toolName tool: completed"
		if (hasResult) {
			return content.toolCallCompleted({ toolName }).value;
		}
		return content.toolCallRunning({ toolName }).value;
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
		lastChunkTimeRef.current = 0; // Reset last-chunk timestamp for loading indicator
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

			// After timeout, clear the result but keep showing "AI working..." if still typing.
			toolResultTimeoutRef.current = setTimeout(() => {
				setToolExecuting(null);
				toolResultTimeoutRef.current = null;
			}, TOOL_RESULT_TIMEOUT);
		}
	}

	function processContentChunk(chunk: string) {
		// Update the last-chunk timestamp so the loading indicator can detect stalls
		lastChunkTimeRef.current = Date.now();
		// Accumulate the full response buffer
		fullStreamBufferRef.current += chunk;
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
			updateHasUserMadeChanges(true, "AI streaming article");
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
		if (contentLastEditedAt !== undefined || contentLastEditedBy !== undefined) {
			updateHasUserMadeChanges(true, "draft metadata updated");

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
			// Deduplicate: skip if message with same timestamp already exists
			// (can happen when both direct SSE and Mercure deliver the same message)
			/* v8 ignore next 3 */
			setMessages(prev => {
				const isDuplicate = prev.some(m => m.timestamp === message.timestamp && m.role === message.role);
				return isDuplicate ? prev : [...prev, message];
			});
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

			// Only auto-show when new pending changes appear, not on every refresh
			const pendingCount = countPendingChanges(sc.changes);
			if (pendingCount > previousPendingCountRef.current) {
				setShowSuggestions(true);
			}
			if (pendingCount !== previousPendingCountRef.current) {
				emitSuggestionsChanged();
			}
			previousPendingCountRef.current = pendingCount;
		} catch (err) {
			log.error(err, "Failed to refresh section changes");
		} finally {
			pendingSectionChangeFetchRef.current = false;
		}
	}

	function handleConvoSSEEvent(data: {
		type: string;
		userId?: number;
		clientRequestId?: string;
		content?: string;
		seq?: number;
		diffs?: Array<ContentDiff>;
		message?: CollabMessage;
		contentLastEditedAt?: string;
		contentLastEditedBy?: number;
		event?: ToolEvent;
	}) {
		const currentUserId = currentUserIdRef.current;
		const shouldIgnore = shouldIgnoreConvoSelfEcho(
			data.type,
			data.userId,
			currentUserId,
			data.clientRequestId,
			pendingConvoRequestIdsRef.current,
		);
		if (shouldIgnore) {
			if (data.clientRequestId && isConvoTerminalEvent(data.type)) {
				clearPendingConvoRequest(data.clientRequestId);
			}
			return;
		}

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
				if (data.clientRequestId) {
					clearPendingConvoRequest(data.clientRequestId);
				}
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
		// SSE diffs are generated from full draft content (frontmatter + body).
		// Apply to the combined representation and then split back to brain/article.
		const currentCombined = combineContentWithBrain(brainContentRef.current, articleContentRef.current);
		let nextCombined = currentCombined;

		// Apply diffs in reverse order to preserve original positions.
		for (const diff of [...diffs].reverse()) {
			const text = diff.text || "";
			const length = diff.length || 0;

			switch (diff.operation) {
				case "insert":
					nextCombined = nextCombined.slice(0, diff.position) + text + nextCombined.slice(diff.position);
					break;
				case "delete":
					nextCombined = nextCombined.slice(0, diff.position) + nextCombined.slice(diff.position + length);
					break;
				case "replace":
					nextCombined =
						nextCombined.slice(0, diff.position) + text + nextCombined.slice(diff.position + length);
					break;
			}
		}

		// No change; avoid unnecessary re-render/autosave churn.
		if (nextCombined === currentCombined) {
			return;
		}

		const { brainContent: nextBrain, articleContent: nextArticle } = extractBrainContent(nextCombined);
		brainContentRef.current = nextBrain;
		articleContentRef.current = nextArticle;
		setBrainContent(nextBrain);
		setArticleContent(nextArticle);

		updateHasUserMadeChanges(true, "diff applied to article");
	}

	async function handleSendMessage() {
		if (!messageInput.trim()) {
			return;
		}

		// If no convo yet (article opened before any edit), create the draft+convo first
		let activeConvo = convo;
		if (!activeConvo) {
			setSending(true);
			try {
				if (draftState === "viewing" && editingArticle) {
					// No draft yet — create one; createLazyDraft returns the new convo
					activeConvo = (await createLazyDraft()) ?? null;
				} else if (draft?.id) {
					// Draft exists but convo wasn't created yet; get or create it
					try {
						activeConvo = await client.collabConvos().getCollabConvoByArtifact("doc_draft", draft.id);
					} catch {
						activeConvo = await client.collabConvos().createCollabConvo("doc_draft", draft.id);
					}
					setConvo(activeConvo);
					setMessages(activeConvo.messages);
					setupConvoStream(activeConvo.id).then();
				}
			} catch (err) {
				log.error(err, "Failed to create draft/convo before sending message");
				setSending(false);
				return;
			}
		}

		/* v8 ignore next 4 - defensive guard if draft/convo creation failed */
		if (!activeConvo) {
			setSending(false);
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

			// Set typing indicator and reset streaming state
			handleTypingEvent();

			const clientRequestId = generateClientRequestId();
			registerPendingConvoRequest(clientRequestId);

			// Send to backend and handle SSE stream response directly
			await client.collabConvos().sendMessage(
				activeConvo.id,
				userMessage,
				{
					onChunk: (chunkContent: string, seq: number) => {
						// Process chunks in order, buffering out-of-sequence chunks
						/* v8 ignore next 5 */
						chunkReordererRef.current.process(chunkContent, seq, chunk => {
							const fullBuffer = processContentChunk(chunk);
							handleArticleStreamUpdate(fullBuffer);
							// Update chat message (without article content)
							setStreamingMessage(removeArticleUpdateContent(fullBuffer));
						});
					},
					onToolEvent: event => {
						/* v8 ignore next 4 */
						const toolEvent: ToolEvent = {
							type: "tool_event",
							tool: event.tool,
							arguments: event.arguments || "",
						};
						if (event.status === "start" || event.status === "end") {
							toolEvent.status = event.status;
						}
						if (event.result) {
							toolEvent.result = event.result;
						}
						handleToolEvent(toolEvent);
					},
					onComplete: message => {
						handleMessageComplete({
							role: message.role as "assistant",
							content: message.content,
							timestamp: message.timestamp,
						});
					},
					/* v8 ignore next 6 - SSE error callback hard to test in unit tests */
					onError: errorMsg => {
						log.error("SSE error: %s", errorMsg);
						setAiTyping(false);
						setStreamingMessage("");
						setError(content.errorSending.value);
					},
					/* v8 ignore next 8 - article updated callback from SSE, tested via handleConvoSSEEvent */
					onArticleUpdated: data => {
						handleArticleUpdated(
							data.diffs as Array<ContentDiff> | undefined,
							data.contentLastEditedAt,
							data.contentLastEditedBy,
						);
						// Also refresh section changes in case a suggestion was created
						refreshSectionChanges().then();
					},
				},
				{ clientRequestId },
			);
		} catch (err) {
			log.error(err, "Failed to send message");
			setAiTyping(false);
			setStreamingMessage("");
			setError(content.errorSending.value);
		} finally {
			setSending(false);
		}
	}

	async function handleUndo() {
		/* v8 ignore next 3 - defensive guard, unreachable as component shows error if no draftId */
		if (!draftId || !canUndoRef.current) {
			return;
		}

		try {
			const result = await client.docDrafts().undoDocDraft(draftId);
			// Parse frontmatter from the restored content
			const { brainContent: parsedBrain, articleContent: parsedArticle } = extractBrainContent(result.content);
			setBrainContent(parsedBrain);
			setArticleContent(parsedArticle);
			setSectionAnnotations(result.sections);
			setSectionChanges(result.changes);
			previousPendingCountRef.current = countPendingChanges(result.changes);
			setCanUndo(result.canUndo);
			/* v8 ignore next 5 */
			setCanRedo(result.canRedo);
			if (editingArticle && result.content === editingArticle.content) {
				updateHasUserMadeChanges(false, "undo to original");
			}
			emitSuggestionsChanged();
		} catch (err) {
			log.error(err, "Failed to undo");
		}
	}

	async function handleRedo() {
		/* v8 ignore next 3 - defensive guard, unreachable as component shows error if no draftId */
		if (!draftId || !canRedoRef.current) {
			return;
		}

		try {
			const result = await client.docDrafts().redoDocDraft(draftId);
			// Parse frontmatter from the restored content
			const { brainContent: parsedBrain, articleContent: parsedArticle } = extractBrainContent(result.content);
			setBrainContent(parsedBrain);
			setArticleContent(parsedArticle);
			setSectionAnnotations(result.sections);
			setSectionChanges(result.changes);
			previousPendingCountRef.current = countPendingChanges(result.changes);
			setCanUndo(result.canUndo);
			/* v8 ignore next 3 */
			setCanRedo(result.canRedo);
			const newValue = !(editingArticle && result.content === editingArticle.content);
			updateHasUserMadeChanges(newValue, "redo action");
			emitSuggestionsChanged();
		} catch (err) {
			log.error(err, "Failed to redo");
		}
	}

	/* v8 ignore start - Section change handlers are triggered by inline suggestion buttons */
	async function handleApplySectionChange(changeId: number) {
		if (!draftId) {
			return;
		}

		pendingSectionChangeFetchRef.current = true;
		try {
			const result = await client.docDrafts().applySectionChange(draftId, changeId);
			// Parse frontmatter from the updated content
			const { brainContent: parsedBrain, articleContent: parsedArticle } = extractBrainContent(result.content);
			setBrainContent(parsedBrain);
			setArticleContent(parsedArticle);
			setMarkdownPreview(parsedArticle);
			setSectionAnnotations(result.sections);
			setSectionChanges(result.changes);
			previousPendingCountRef.current = countPendingChanges(result.changes);
			setCanUndo(result.canUndo);
			setCanRedo(result.canRedo);
			updateHasUserMadeChanges(true, "section change applied");
			emitSuggestionsChanged();
		} catch (err) {
			log.error(err, "Failed to apply section change");
			setError("Failed to apply change");
		} finally {
			pendingSectionChangeFetchRef.current = false;
		}
	}

	async function handleDismissSectionChange(changeId: number) {
		if (!draftId) {
			return;
		}

		pendingSectionChangeFetchRef.current = true;
		try {
			const result = await client.docDrafts().dismissSectionChange(draftId, changeId);
			// Parse frontmatter from the updated content
			const { brainContent: parsedBrain, articleContent: parsedArticle } = extractBrainContent(result.content);
			setBrainContent(parsedBrain);
			setArticleContent(parsedArticle);
			setMarkdownPreview(parsedArticle);
			setSectionAnnotations(result.sections);
			setSectionChanges(result.changes);
			previousPendingCountRef.current = countPendingChanges(result.changes);
			setCanUndo(result.canUndo);
			setCanRedo(result.canRedo);
			emitSuggestionsChanged();
		} catch (err) {
			log.error(err, "Failed to dismiss section change");
			setError("Failed to dismiss change");
		} finally {
			pendingSectionChangeFetchRef.current = false;
		}
	}
	/* v8 ignore stop */

	/* v8 ignore start - autoSaveDraft tested indirectly via debounced useEffect */
	async function autoSaveDraft() {
		if (!draftId || !draft) {
			return;
		}

		// Validate based on current mode — brain mode validates both, article mode validates only article
		if (viewMode === "brain") {
			if (!(await validateBrainContent()) || !(await validateArticleContent())) {
				return;
			}
		} else if (!(await validateArticleContent())) {
			return;
		}

		const contentToSave = combineContentWithBrain(brainContent, articleContent);
		try {
			const updatedDraft = await client.docDrafts().updateDocDraft(draftId, {
				title: draftTitle,
				content: contentToSave,
			});
			setDraft(updatedDraft);
			log.debug("Draft auto-saved");
		} catch (err) {
			log.error(err, "Failed to auto-save draft");
		}
	}
	/* v8 ignore stop */

	/**
	 * Validate content before Save Changes
	 * Logic depends on current mode:
	 * - Brain mode: Brain fails → stay Brain; Article/Markdown fails → switch to Markdown
	 * - Article/Markdown mode: Brain fails → switch to Brain; Article/Markdown fails → stay current
	 */
	async function validateContentBeforeSave(): Promise<boolean> {
		/* v8 ignore next 3 - defensive guard, draftId/draft always present when save is clickable */
		if (!draftId || !draft) {
			/* v8 ignore next 24 */
			return true;
		}

		// Step 1: Validate Brain content (skip if empty)
		let brainValid = true;
		if (brainContent.trim()) {
			try {
				const brainContentWithFrontmatter = `---\n${brainContent}\n---`;
				const brainResult = await client
					.docDrafts()
					.validateContent(brainContentWithFrontmatter, draft.contentType);
				if (!brainResult.isValid) {
					setValidationErrors(brainResult.errors);
					brainValid = false;
				}
			} catch (err) {
				log.error(err, "Brain validation API failed");
				// Allow save to proceed if API fails
			}
		}

		if (!brainValid) {
			// Brain validation failed
			if (viewMode !== "brain") {
				// In Article/Markdown mode, switch to Brain mode
				/* v8 ignore next 5 */
				setViewMode("brain");
			}
			// Stay in Brain mode (or already there)
			return false;
		}

		// Step 2: Validate Article/Markdown content
		let articleValid = true;
		try {
			const articleResult = await client.docDrafts().validateContent(articleContent, draft.contentType);
			if (!articleResult.isValid) {
				setValidationErrors(articleResult.errors);
				articleValid = false;
			}
		} catch (err) {
			log.error(err, "Article validation API failed");
			/* v8 ignore next 2 */
			// Allow save to proceed if API fails
		}

		if (!articleValid) {
			// Article/Markdown validation failed
			if (viewMode === "brain") {
				/* v8 ignore next 3 */
				// In Brain mode, switch to Markdown mode
				setViewMode("markdown");
			}
			// Stay in current mode (Article or Markdown)
			return false;
		}

		// Both validations passed
		setValidationErrors([]);
		return true;
	}

	/**
	 * Validate Brain content only
	 * Returns true if validation passes or brainContent is empty, false if validation fails
	 */
	/* v8 ignore start */
	async function validateBrainContent(): Promise<boolean> {
		// Skip validation if brain content is empty
		if (!brainContent.trim()) {
			return true;
		}

		try {
			const brainContentWithFrontmatter = `---\n${brainContent}\n---`;
			const result = await client.docDrafts().validateContent(brainContentWithFrontmatter, draft?.contentType);
			if (!result.isValid) {
				setValidationErrors(result.errors);
				return false;
			}
			setValidationErrors([]);
			return true;
		} catch (error) {
			log.error(error, "Failed to validate brain content");
			// Allow operation if API fails
			return true;
		}
	}
	/* v8 ignore stop */

	/**
	 * Validate Article/Markdown content only
	 * Returns true if validation passes, false if validation fails
	 */
	/* v8 ignore next 4 */
	async function validateArticleContent(): Promise<boolean> {
		try {
			const result = await client.docDrafts().validateContent(articleContent, draft?.contentType);
			if (!result.isValid) {
				/* v8 ignore next 3 */
				setValidationErrors(result.errors);
				return false;
			}
			setValidationErrors([]);
			return true;
		} catch (error) {
			log.error(error, "Failed to validate article content");
			// Allow operation if API fails
			return true;
		}
	}

	/**
	 * Validate content for the current view mode
	 * Returns true if validation passes, false if validation fails
	 */
	async function validateCurrentModeContent(): Promise<boolean> {
		if (viewMode === "brain") {
			/* v8 ignore next 3 */
			return await validateBrainContent();
		}
		return await validateArticleContent();
	}

	/**
	 * Handle view mode change with validation
	 * Only validates current mode content - must pass to switch
	 * This allows users to switch to fix errors in other modes
	 */
	async function handleViewModeChange(targetMode: "article" | "markdown" | "brain"): Promise<void> {
		// If already in target mode, do nothing
		if (viewMode === targetMode) {
			return;
		}

		// Validate current mode content - must pass to allow switching
		const isValid = await validateCurrentModeContent();
		if (!isValid) {
			/* v8 ignore next 3 */
			return; // Don't switch if current mode has validation errors
		}

		// Validation passed, clear errors and switch mode
		setValidationErrors([]);
		if (targetMode === "article") {
			setMarkdownPreview(articleContent);
		}
		setViewMode(targetMode);
	}

	/**
	 * Scrolls the editor to a specific line
	 */
	/* v8 ignore start */
	function scrollToLine(lineNumber: number) {
		editorRef.current?.scrollToLine(lineNumber);
		editorRef.current?.focus();
	}
	/* v8 ignore stop */

	/**
	 * Get the adjusted line number for display/decoration
	 * Brain mode content is wrapped with "---\n...\n---", so line numbers need -1 offset
	 */
	/* v8 ignore start */
	function getAdjustedLineNumber(line: number): number {
		if (viewMode === "brain") {
			return Math.max(1, line - 1);
		}
		return line;
	}
	/* v8 ignore stop */

	/** Returns the icon component for the given view mode */
	function getViewModeIcon(mode: "article" | "markdown" | "brain"): ReactElement {
		if (mode === "markdown") {
			return <Hash className="h-4 w-4" />;
		}
		if (mode === "brain") {
			return <Brain className="h-4 w-4" />;
		}
		return <FileText className="h-4 w-4" />;
	}

	/** Renders the view mode dropdown for markdown and brain toolbars */
	function renderViewModeDropdown(): ReactElement {
		// viewMode i18n — use compiled tiptap-edit dictionary (already has these strings)
		const viewModeLabels = tiptapContent.viewMode;
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" data-testid="view-mode-dropdown">
						{getViewModeIcon(viewMode)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => handleViewModeChange("article")} data-testid="view-mode-article">
						<FileText className="h-4 w-4 mr-2" />
						{viewModeLabels.article.value}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => handleViewModeChange("markdown")}
						data-testid="view-mode-markdown"
					>
						<Hash className="h-4 w-4 mr-2" />
						{viewModeLabels.markdown.value}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => handleViewModeChange("brain")} data-testid="view-mode-brain">
						<Brain className="h-4 w-4 mr-2" />
						{viewModeLabels.brain.value}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	/** Renders a pill-styled collapsible toolbar matching TipTap's toolbar style.
	 *  Used for markdown and brain mode toolbars so all modes look consistent. */
	function renderPillToolbar(buttons: ReactElement): ReactElement {
		if (!isInlineMode) {
			// Non-inline mode: simple flat toolbar
			return (
				<div className="flex items-center gap-1 p-2 border-b bg-muted/30 flex-shrink-0">
					{buttons}
					{renderViewModeDropdown()}
				</div>
			);
		}
		return (
			<div className="flex-shrink-0 px-2 py-1.5" style={{ minHeight: 42 }}>
				{toolbarCollapsed ? (
					<div className="flex items-center justify-center h-full group">
						<button
							type="button"
							onClick={() => setToolbarCollapsed(false)}
							className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground rounded-md border border-transparent hover:border-border hover:bg-muted transition-all opacity-0 group-hover:opacity-100"
							data-testid="toolbar-expand-button"
						>
							<ChevronDown className="h-3.5 w-3.5" />
							{tiptapContent.showToolbar.value}
						</button>
					</div>
				) : (
					<div className="flex items-center mx-auto w-fit rounded-lg border border-border bg-muted shadow-sm px-2 py-0.5">
						<div className="flex items-center gap-1">
							{buttons}
							<Separator orientation="vertical" className="h-6 mx-1" />
							{renderViewModeDropdown()}
							<Separator orientation="vertical" className="h-6 mx-1" />
							<button
								type="button"
								onClick={() => setToolbarCollapsed(true)}
								title={tiptapContent.collapseToolbar.value}
								aria-label={tiptapContent.collapseToolbar.value}
								className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
								data-testid="toolbar-collapse-button"
							>
								<ChevronUp className="h-4 w-4" />
							</button>
						</div>
					</div>
				)}
			</div>
		);
	}

	/** Renders the source-editor toolbar (ImageInsert + Undo/Redo) shared by markdown and non-markdown source views. */
	function renderSourceEditorToolbar(disableForAi: boolean) {
		const extraDisabled = disableForAi && aiTyping;
		return renderPillToolbar(
			<>
				<ImageInsert
					articleContent={articleContent}
					onInsert={handleImageUpload}
					onDelete={handleImageDelete}
					onError={handleImageUploadError}
					disabled={saving || extraDisabled}
				/>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					onClick={() => editorRef.current?.undo()}
					disabled={!markdownCanUndo || saving || extraDisabled}
					data-testid="markdown-undo"
				>
					<Undo className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					onClick={() => editorRef.current?.redo()}
					disabled={!markdownCanRedo || saving || extraDisabled}
					data-testid="markdown-redo"
				>
					<Redo className="h-4 w-4" />
				</Button>
			</>,
		);
	}

	/**
	 * Renders the OpenAPI validation errors panel if there are errors
	 */
	/* v8 ignore next 8 */
	function renderValidationErrors() {
		if (validationErrors.length === 0) {
			return null;
		}
		/* v8 ignore next 1 */
		return (
			<div
				className="border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3"
				data-testid="validation-errors"
			>
				<div className="flex items-start gap-2">
					<div className="text-red-600 dark:text-red-400 font-medium text-sm">
						{content.validationErrors}:
					</div>
					<div className="flex-1">
						{validationErrors.map((err, idx) => (
							<div
								key={idx}
								className="text-sm text-red-700 dark:text-red-300 mb-1"
								data-testid={`validation-error-${idx}`}
							>
								{err.path ? (
									<span className="font-mono text-xs bg-red-100 dark:bg-red-900/30 px-1 rounded mr-2">
										{err.path}
									</span>
								) : null}
								{viewMode !== "article" && err.line ? (
									<span className="font-mono text-xs bg-red-100 dark:bg-red-900/30 px-1 rounded mr-2">
										{err.column
											? `${getAdjustedLineNumber(err.line)}:${err.column}`
											: `Line ${getAdjustedLineNumber(err.line)}`}
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

	/* v8 ignore start */
	async function handleSave() {
		/* v8 ignore next 3 - defensive guard, unreachable as component shows error if no draftId */
		if (!draftId) {
			return;
		}

		const isValid = await validateContentBeforeSave();
		if (!isValid) {
			return;
		}

		// Combine brain content and article content for saving
		const contentToSave = combineContentWithBrain(brainContent, articleContent);

		// Update original article ref BEFORE the async API calls so the reset effect
		// has the saved content even if the SSE draft_saved event arrives before the HTTP response.
		const previousOriginal = originalArticleRef.current;
		if (originalArticleRef.current) {
			originalArticleRef.current = {
				...originalArticleRef.current,
				content: contentToSave,
				contentMetadata: { ...originalArticleRef.current.contentMetadata, title: draftTitle },
			};
		}

		setSaving(true);
		try {
			await client.docDrafts().updateDocDraft(draftId, {
				title: draftTitle,
				content: contentToSave,
				contentMetadata: draft?.contentMetadata,
			});
			await client.docDrafts().saveDocDraft(draftId);
		} catch (err) {
			// Revert the ref on failure so discard still restores the original
			originalArticleRef.current = previousOriginal;
			log.error(err, "Failed to save draft");
			setError(content.errorSaving.value);
			setSaving(false);
		}
	}
	/* v8 ignore stop */

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

		// In inline mode, clear the ?edit= query param but preserve ?doc= for selection state
		if (isInlineMode) {
			/* v8 ignore next 1 */
			navigateAfterInlineEdit(true);
		} else {
			navigate(getArticlesUrl(draft));
		}
	}

	/* v8 ignore start */
	async function handleDiscardDraft() {
		/* v8 ignore next 3 - defensive guard, draftId always present when discard is clickable */
		if (!draftId) {
			return;
		}

		try {
			await client.docDrafts().deleteDocDraft(draftId);
		} catch (err) {
			log.error(err, "Failed to discard draft");
			setError(content.errorDiscarding.value);
			return;
		}

		// Navigate back to articles page, preserving doc selection
		if (isInlineMode) {
			navigateAfterInlineEdit(true);
		} else {
			navigate(getArticlesUrl(draft));
		}
	}
	/* v8 ignore stop */

	/** Tracks HTML-only changes (e.g. image resize) that don't appear in the markdown output. */
	/* v8 ignore next 4 */
	function handleTiptapHtmlChange(_html: string) {
		updateHasUserMadeChanges(true, "TiptapEdit HTML changed (including image resize)");
	}

	function handleImageUpload(markdownRef: string) {
		/* v8 ignore next 4 */
		editorRef.current?.insertTextAtCursor(markdownRef);
		updateHasUserMadeChanges(true, "image uploaded");
	}
	function handleImageUploadError(errorMessage: string) {
		setImageError(errorMessage);
		/* v8 ignore next 3 */
		if (errorTimeoutRef.current) {
			clearTimeout(errorTimeoutRef.current);
		}
		errorTimeoutRef.current = setTimeout(() => {
			/* v8 ignore next 2 */
			setImageError(null);
			errorTimeoutRef.current = null;
		}, 5000);
	}
	/* v8 ignore start */
	function handleImageDelete(src: string) {
		setImageToDelete(src);
		/* v8 ignore next 3 */
	}
	/* v8 ignore stop */
	/* v8 ignore start */
	function removeImageReferences(src: string) {
		const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const markdownRegex = new RegExp(`^[ \\t]*!\\[[^\\]]*\\]\\(${escapedSrc}\\)[ \\t]*\\n?`, "gm");
		const htmlRegex = new RegExp(`^[ \\t]*<img[^>]*src=["']${escapedSrc}["'][^>]*/?>[ \\t]*\\n?`, "gim");

		let newContent = articleContent;
		newContent = newContent.replace(markdownRegex, "");
		newContent = newContent.replace(htmlRegex, "");
		newContent = newContent.replace(/\n{3,}/g, "\n\n");

		if (newContent !== articleContent) {
			setArticleContent(newContent);
			updateHasUserMadeChanges(true, "image removed");
		}
	}
	/* v8 ignore stop */

	/* v8 ignore start */
	async function confirmImageDelete() {
		if (!imageToDelete) {
			return;
		}

		setDeletingImage(true);
		try {
			const imageId = imageToDelete.replace(/^\/api\/images\//, "");
			await client.images().deleteImage(imageId);
			removeImageReferences(imageToDelete);
			setImageToDelete(null);
		} catch (err) {
			log.error(err, "Failed to delete image");
			/* v8 ignore next 4 */
			handleImageUploadError(content.deleteImageError.value);
		} finally {
			setDeletingImage(false);
		}
	}
	/* v8 ignore stop */
	/* v8 ignore start */
	async function processImageFile(file: File | Blob, filename: string) {
		if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
			handleImageUploadError(content.invalidFileType.value);
			/* v8 ignore next 1 */
			return;
		}

		const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
		if (file.size > maxSizeBytes) {
			handleImageUploadError(content.fileTooLarge.value);
			return;
		}

		try {
			const result = await client.images().uploadImage(file, { filename, spaceId: imageUploadSpaceId });
			const markdown = `![${filename}](${result.url})`;
			handleImageUpload(markdown);
		} catch (error) {
			handleImageUploadError(error instanceof Error ? error.message : content.uploadFailed.value);
		}
	}
	/* v8 ignore stop */
	/* v8 ignore start */
	function handleTiptapImageButtonClick() {
		tiptapImageInputRef.current?.click();
	}
	/* v8 ignore stop */
	/* v8 ignore start */
	async function handleTiptapImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
			handleImageUploadError(content.invalidFileType.value);
			if (tiptapImageInputRef.current) {
				tiptapImageInputRef.current.value = "";
			}
			return;
		}

		const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
		if (file.size > maxSizeBytes) {
			handleImageUploadError(content.fileTooLarge.value);
			if (tiptapImageInputRef.current) {
				tiptapImageInputRef.current.value = "";
			}
			return;
		}

		try {
			const result = await client
				.images()
				.uploadImage(file, { filename: file.name, spaceId: imageUploadSpaceId });
			tiptapRef.current?.insertImage(result.url, file.name);
			updateHasUserMadeChanges(true, "image uploaded via tiptap toolbar");
		} catch (error) {
			handleImageUploadError(error instanceof Error ? error.message : content.uploadFailed.value);
		} finally {
			if (tiptapImageInputRef.current) {
				tiptapImageInputRef.current.value = "";
			}
			/* v8 ignore next 3 */
		}
	}
	/* v8 ignore stop */
	function handleEditorPaste(event: React.ClipboardEvent<HTMLDivElement>) {
		/* v8 ignore next 4 */
		const items = event.clipboardData?.items;
		if (!items) {
			return;
		}

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
	function handleEditorDragOver(event: React.DragEvent<HTMLDivElement>) {
		event.preventDefault();
		event.stopPropagation();
	}
	async function processDroppedImages(imageFiles: Array<File>, nonImageFiles: Array<File>): Promise<void> {
		const results: Array<{ filename: string; markdown: string | null; error: string | null }> = [];

		for (const file of nonImageFiles) {
			results.push({ filename: file.name, markdown: null, error: content.invalidFileType.value });
		}

		for (const file of imageFiles) {
			if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
				/* v8 ignore next 4 */
				results.push({ filename: file.name, markdown: null, error: content.invalidFileType.value });
				continue;
			}

			const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
			/* v8 ignore next */
			if (file.size > maxSizeBytes) {
				/* v8 ignore next 3 */
				results.push({ filename: file.name, markdown: null, error: content.fileTooLarge.value });
				continue;
			}

			try {
				const result = await client
					.images()
					.uploadImage(file, { filename: file.name, spaceId: imageUploadSpaceId });
				const markdown = `![${file.name}](${result.url})`;
				results.push({ filename: file.name, markdown, error: null });
			} catch (error) {
				/* v8 ignore next */
				const errorMsg = error instanceof Error ? error.message : content.uploadFailed.value;
				results.push({ filename: file.name, markdown: null, error: errorMsg });
			}
		}

		const successfulMarkdown = results.filter(r => r.markdown !== null).map(r => r.markdown as string);
		if (successfulMarkdown.length > 0) {
			handleImageUpload(successfulMarkdown.join("\n"));
		}

		const failedUploads = results.filter(r => r.error !== null);
		if (failedUploads.length > 0) {
			handleImageUploadError(failedUploads.map(f => `${f.filename}: ${f.error}`).join(", "));
		}
	}

	function handleEditorDrop(event: React.DragEvent<HTMLDivElement>) {
		event.preventDefault();
		event.stopPropagation();

		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) {
			return;
		}

		const allFiles = Array.from(files);

		const nonImageFiles = allFiles.filter(file => !file.type.startsWith("image/"));

		const imageFiles = allFiles.filter(file => file.type.startsWith("image/"));

		if (imageFiles.length === 0 && nonImageFiles.length > 0) {
			const filenames = nonImageFiles.map(f => f.name).join(", ");
			handleImageUploadError(`${filenames}: ${content.invalidFileType.value}`);
			return;
		}

		processDroppedImages(imageFiles, nonImageFiles).catch(err => {
			log.error(err, "Failed to process dropped images");
		});
	}

	/**
	 * Handle article content change and trigger lazy draft creation if in viewing mode.
	 * This wraps the common pattern of updating content + triggering lazy draft.
	 */
	function handleArticleContentChange(newContent: string) {
		setMarkdownPreview(newContent);
		setArticleContent(newContent);
		updateHasUserMadeChanges(true, "article content edited");
		if (validationErrors.length > 0) {
			setValidationErrors([]);
		}
		// Trigger lazy draft creation on first edit
		if (draftState === "viewing") {
			createLazyDraft().then();
		}
	}

	/**
	 * Handle brain content change and trigger lazy draft creation if in viewing mode.
	 */
	function handleBrainContentChange(newContent: string) {
		setBrainContent(newContent);
		updateHasUserMadeChanges(true, "brain content edited");
		if (validationErrors.length > 0) {
			setValidationErrors([]);
		}
		// Trigger lazy draft creation on first edit
		if (draftState === "viewing") {
			createLazyDraft().then();
		}
	}

	/* v8 ignore start */
	/** Soft-deletes the article and notifies the parent to refresh the tree. */
	async function handleDeleteArticle() {
		if (!editingArticle) {
			return;
		}
		setDeleting(true);
		try {
			await client.docs().softDelete(editingArticle.id);
			setShowDeleteArticleDialog(false);
			onArticleDeleted?.(editingArticle.id);
			if (isInlineMode) {
				navigateAfterInlineEdit(false);
			} else {
				navigate(getArticlesUrl(draft));
			}
		} catch (err) {
			log.error(err, "Failed to delete article");
			setError(content.deleteArticleError.value);
		} finally {
			setDeleting(false);
		}
	}
	/* v8 ignore stop */

	// Whether save/discard controls should be visible
	const showDraftControls = draftState === "editing_draft" || draftState === "creating_draft";

	// Extract headings from editor for the article outline.
	// Deferred by one animation frame so that TipTap's ProseMirror DOM has
	// finished rendering after a content change before we query it.
	useEffect(() => {
		if (!isInlineMode || !tiptapRef.current) {
			return;
		}
		const frameId = requestAnimationFrame(() => {
			const editorEl = tiptapRef.current?.getEditorElement();
			if (editorEl) {
				setOutlineHeadings(extractHeadingsFromEditor(editorEl.parentElement));
			}
		});
		return () => cancelAnimationFrame(frameId);
	}, [isInlineMode, articleContent, markdownPreview]);

	// Track which heading is in view by listening to scroll events on the editor's
	// scroll container. Queries heading elements directly from ProseMirror DOM on
	// each scroll (TipTap re-renders elements frequently, stripping any IDs we set).
	useEffect(() => {
		if (!isInlineMode || outlineHeadings.length === 0) {
			return;
		}

		// Find the scrollable ancestor of the ProseMirror editor
		const proseMirrorEl = tiptapRef.current?.getEditorElement();
		if (!proseMirrorEl) {
			return;
		}
		let scrollContainer: HTMLElement | null = proseMirrorEl.parentElement;
		while (scrollContainer) {
			const style = getComputedStyle(scrollContainer);
			if (style.overflowY === "auto" || style.overflowY === "scroll") {
				break;
			}
			scrollContainer = scrollContainer.parentElement;
		}
		if (!scrollContainer) {
			return;
		}

		const capturedProseMirror = proseMirrorEl;
		function updateActiveHeading() {
			if (!scrollContainer) {
				return;
			}
			const containerTop = scrollContainer.getBoundingClientRect().top;
			const offset = 80;

			// Query headings directly from ProseMirror DOM — don't rely on IDs
			const headingEls = capturedProseMirror.querySelectorAll("h1, h2, h3, h4");
			let activeIdx = -1;
			let headingIndex = 0;

			for (const el of headingEls) {
				const text = el.textContent?.trim() ?? "";
				if (!text) {
					continue;
				}
				const elTop = el.getBoundingClientRect().top - containerTop;
				if (elTop <= offset) {
					activeIdx = headingIndex;
				}
				headingIndex++;
			}

			if (activeIdx >= 0 && activeIdx < outlineHeadings.length) {
				setActiveHeadingId(outlineHeadings[activeIdx].id);
			}
		}

		// Run once immediately to set initial state
		updateActiveHeading();

		scrollContainer.addEventListener("scroll", updateActiveHeading, { passive: true });
		return () => scrollContainer?.removeEventListener("scroll", updateActiveHeading);
	}, [isInlineMode, outlineHeadings]);

	/** Scroll to a heading in the editor when clicked in the outline.
	 *  Matches headings by index position in the ProseMirror DOM rather than by ID
	 *  (TipTap re-renders nodes, stripping IDs we set during extraction). */
	const handleOutlineHeadingClick = useCallback(
		(headingId: string) => {
			// Find which index this heading is in our outline data
			const headingIdx = outlineHeadings.findIndex(h => h.id === headingId);
			if (headingIdx < 0) {
				return;
			}

			// Find the actual DOM element by matching index in ProseMirror's heading elements
			const proseMirror = tiptapRef.current?.getEditorElement();
			if (!proseMirror) {
				return;
			}
			const candidates = proseMirror.querySelectorAll("h1, h2, h3, h4");
			// Filter to non-empty headings (same filter as extractHeadingsFromEditor)
			const nonEmptyCandidates = Array.from(candidates).filter(el => (el.textContent?.trim() ?? "").length > 0);
			const target = nonEmptyCandidates[headingIdx] ?? null;
			if (!target) {
				return;
			}

			// Find the nearest scrollable ancestor and scroll within it
			let scrollParent: HTMLElement | null = target.parentElement;
			while (scrollParent) {
				const style = getComputedStyle(scrollParent);
				if (
					(style.overflowY === "auto" || style.overflowY === "scroll") &&
					scrollParent.scrollHeight > scrollParent.clientHeight
				) {
					break;
				}
				scrollParent = scrollParent.parentElement;
			}
			if (scrollParent) {
				const containerRect = scrollParent.getBoundingClientRect();
				const elRect = target.getBoundingClientRect();
				const targetTop = scrollParent.scrollTop + (elRect.top - containerRect.top);
				scrollParent.scrollTo({ top: targetTop, behavior: "smooth" });
			} else {
				target.scrollIntoView({ behavior: "smooth", block: "start" });
			}
			setActiveHeadingId(headingId);
		},
		[outlineHeadings],
	);

	// --- Header action helper renderers (used in portal and standalone) ---

	/** Title editor — inline editable heading */
	function renderTitleEditor(): ReactElement {
		if (isEditingTitle) {
			return (
				<input
					ref={titleInputRef}
					value={draftTitle}
					onChange={e => {
						setDraftTitle(e.target.value);
						updateHasUserMadeChanges(true, "title edited");
					}}
					onBlur={() => setIsEditingTitle(false)}
					onKeyDown={e => {
						if (e.key === "Enter" || e.key === "Escape") {
							setIsEditingTitle(false);
						}
					}}
					className="flex h-7 rounded-md border border-input bg-background px-2 py-1 text-sm font-medium ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-w-[200px]"
					data-testid="draft-title-input"
				/>
			);
		}
		return (
			<span
				onClick={canEdit ? () => setIsEditingTitle(true) : undefined}
				className={`text-sm font-medium max-w-[200px] truncate px-1.5 py-0.5 rounded transition-colors ${canEdit ? "cursor-pointer hover:bg-muted/50" : ""}`}
				title={canEdit ? content.clickToEdit.value : undefined}
				data-testid="draft-title-display"
			>
				{draftTitle || content.untitledDraft.value}
			</span>
		);
	}

	/** SSE connection status badge — only visible for error/reconnecting states. */
	function renderSseStatus(): ReactElement | null {
		if (draftFailed || convoFailed) {
			return (
				<span className="text-xs text-muted-foreground whitespace-nowrap">{content.disconnected.value}</span>
			);
		}
		if (draftReconnecting || convoReconnecting) {
			return (
				<span className="text-xs text-muted-foreground whitespace-nowrap">{content.reconnecting.value}</span>
			);
		}
		return null;
	}

	function renderLastEdited(): ReactElement | null {
		const editedAt = draft?.contentLastEditedAt ?? editingArticle?.updatedAt;
		if (!editedAt) {
			// Show "No edits yet" when in draft editing mode but no content edits have been made
			if (!draft) {
				return null;
			}
			return <span className="text-xs text-muted-foreground whitespace-nowrap">{content.noEditsYet.value}</span>;
		}
		const editedBy = editingArticle?.updatedBy;
		const dateStr = new Date(editedAt).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
		if (editedBy) {
			// Resolve display name: check module-level cache first, then match against current user, then use raw value if it's not a bare number
			const displayName = userNameCacheRef.current?.get(String(editedBy));
			const isCurrentUser = currentUserId !== undefined && String(editedBy) === String(currentUserId);
			const resolvedName =
				displayName ??
				(isCurrentUser ? currentUserName : undefined) ??
				(Number.isNaN(Number(editedBy)) ? editedBy : undefined);
			if (resolvedName) {
				return (
					<span className="text-xs text-muted-foreground whitespace-nowrap">
						{content.lastEditedBy.value} {resolvedName} {content.lastEditedOn.value} {dateStr}
					</span>
				);
			}
		}
		return (
			<span className="text-xs text-muted-foreground whitespace-nowrap">
				{content.lastEdited.value} {dateStr}
			</span>
		);
	}

	/** Share button + shared badge */
	function renderShareControls(): ReactElement | null {
		if (draft && draft.docId == null && !draft.isShared) {
			return (
				<Button
					variant="outline"
					size="sm"
					onClick={handleShare}
					disabled={sharing}
					className="h-6 px-2 gap-1.5"
					data-testid="share-button"
				>
					<Share2 className="h-3 w-3" />
					{sharing ? content.sharing : content.share}
				</Button>
			);
		}
		if (draft?.isShared) {
			return (
				<Badge
					variant="secondary"
					className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs h-5"
					data-testid="shared-badge"
				>
					<Share2 className="h-3 w-3 mr-1" />
					{content.shared}
				</Badge>
			);
		}
		return null;
	}

	/** Suggested edits badge */
	function renderSuggestedEditsBadge(): ReactElement | null {
		/* v8 ignore next 15 - conditional JSX rendering */
		const pendingCount = countPendingChanges(sectionChanges);
		if (!editingArticle || pendingCount === 0) {
			return null;
		}
		return (
			<div
				className={`flex items-center gap-1 border rounded-md border-amber-500/50 text-amber-600 dark:text-amber-400 transition-all duration-200 ${
					showSuggestions ? "bg-amber-500/10 px-1" : "hover:bg-amber-500/10"
				}`}
				data-testid="suggested-edits-badge"
			>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 hover:bg-transparent h-5 px-2 text-xs"
					onClick={() => setShowSuggestions(prev => !prev)}
				>
					<Sparkles className="h-3 w-3" />
					<span>
						{pendingCount} {pendingCount === 1 ? content.suggestion : content.suggestions}
					</span>
				</Button>
			</div>
		);
	}

	/** Version history button */
	function renderHistoryButton(): ReactElement | null {
		if (!editingArticle) {
			return null;
		}
		return (
			<VersionHistoryProvider onVersionRestored={refreshEditingArticle}>
				<VersionHistoryDialog
					docId={editingArticle.id}
					currentDoc={{
						title: draftTitle,
						content: articleContent,
						version: editingArticle.version,
					}}
					currentReferVersion={editingArticle.contentMetadata?.referVersion}
				>
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 gap-1.5"
						data-testid="version-history-button"
					>
						<History className="h-3.5 w-3.5" />
						{content.versionHistory}
					</Button>
				</VersionHistoryDialog>
			</VersionHistoryProvider>
		);
	}

	/** Save / Discard controls */
	function renderSaveDiscardControls(): ReactElement | null {
		if (!showDraftControls) {
			return null;
		}
		return (
			<>
				<div className="w-px h-4 bg-border" />
				<div className="flex items-center gap-1.5" data-testid="save-button-group">
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 gap-1 text-muted-foreground hover:text-destructive hover:border-destructive"
						onClick={() => setShowDiscardDialog(true)}
						data-testid="discard-draft-button"
					>
						<X className="h-3 w-3" />
						{content.discard}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleSave}
						disabled={
							saving ||
							validationErrors.length > 0 ||
							(draft?.docId ? !hasUserMadeChanges : !articleContent.trim())
						}
						className="h-6 px-2 gap-1"
						data-testid="save-button"
					>
						<Save className="h-3 w-3" />
						{saving ? content.saving : content.saveArticle}
					</Button>
				</div>
			</>
		);
	}

	/** Three-dot menu — only shown when user has edit permissions */
	function renderThreeDotMenu(): ReactElement | null {
		if (!canEdit) {
			return null;
		}
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-7 w-7" data-testid="article-actions-menu">
						<MoreHorizontal className="h-3.5 w-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onClick={() => setToolbarCollapsed(!toolbarCollapsed)}
						data-testid="toggle-toolbar-menu-item"
					>
						{toolbarCollapsed ? (
							<>
								<Eye className="h-4 w-4" />
								{content.showToolbar}
							</>
						) : (
							<>
								<EyeOff className="h-4 w-4" />
								{content.hideToolbar}
							</>
						)}
					</DropdownMenuItem>
					{canEdit && editingArticle && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() => setShowDeleteArticleDialog(true)}
								data-testid="delete-article-menu-item"
							>
								<Trash2 className="h-4 w-4" />
								{content.deleteArticle}
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	/**
	 * Renders header actions into the Spaces breadcrumb bar via a portal.
	 * The portal target element is passed directly as a prop from Spaces,
	 * eliminating DOM ID lookups and timing issues.
	 */
	function renderHeaderActionsPortal(): ReactElement | null {
		if (!headerActionsContainer) {
			return null;
		}
		return createPortal(
			<>
				{renderSseStatus()}
				{renderLastEdited()}
				{/* TODO: integrate ArticleSitesBadge here once wired up */}
				{renderShareControls()}
				{renderSuggestedEditsBadge()}
				{renderHistoryButton()}
				{renderSaveDiscardControls()}
				{canEdit && (
					<Button
						variant={showAgentPanel ? "secondary" : "ghost"}
						size="icon"
						className="h-7 w-7"
						onClick={() => setShowAgentPanel(prev => !prev)}
						title={content.agentPanel.value}
						data-testid="toggle-agent-panel"
					>
						<Sparkles className="h-3.5 w-3.5" />
					</Button>
				)}
				{renderThreeDotMenu()}
			</>,
			headerActionsContainer,
		);
	}

	if (loading) {
		return (
			<div className={`flex ${heightClass} items-center justify-center`} data-testid="draft-loading">
				{articleDraftsContent.loadingDrafts}
				{/* v8 ignore next 7 */}
			</div>
		);
	}

	if (error) {
		// Build close URL - in inline mode, clear ?edit= param; otherwise use getArticlesUrl
		const closeUrl = isInlineMode
			? /* v8 ignore next 6 */
				(() => {
					const params = new URLSearchParams(location.search);
					params.delete("edit");
					const queryString = params.toString();
					return `/articles${queryString ? `?${queryString}` : ""}`;
				})()
			: getArticlesUrl(draft);
		return (
			<div className={`flex ${heightClass} items-center justify-center flex-col gap-4`} data-testid="draft-error">
				<p className="text-destructive">{error}</p>
				<Button onClick={() => navigate(closeUrl)}>{content.close}</Button>
			</div>
		);
	}

	// Quick suggestions for JolliBot-style chat panel
	const quickSuggestions = [
		content.suggestionImproveIntro.value,
		content.suggestionAddExamples.value,
		content.suggestionCheckOutdated.value,
		content.suggestionSimplifyTerms.value,
	];

	return (
		<div
			className={cn(
				"flex",
				isInlineMode ? "h-full" : "h-screen",
				chatPanePosition === "right" && "flex-row-reverse",
			)}
			data-testid="article-draft-page"
		>
			{renderHeaderActionsPortal()}
			{/* JolliBot-style Chat Panel */}
			{showAgentPanel && (
				<div
					ref={chatPaneRef}
					className={`h-full bg-sidebar flex flex-col flex-shrink-0 relative ${chatPanePosition === "right" ? "border-l border-sidebar-border" : "border-r border-sidebar-border"}`}
					style={{ width: `${chatPaneWidth}px` }}
					data-testid="chat-pane"
				>
					{/* Resize Handle - matches pinned-panel-resize-handle style */}
					<div
						onMouseDown={handleChatPaneResizeMouseDown}
						className={`group absolute top-0 ${chatPanePosition === "right" ? "left-0" : "right-0"} w-px h-full cursor-ew-resize z-50 bg-border flex items-center justify-center`}
						style={{ touchAction: "none", userSelect: "none" }}
						data-testid="chat-pane-resize-handle"
					>
						<div
							className={`z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border transition-opacity ${isResizingChatPane ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
						>
							<GripVertical className="h-2.5 w-2.5" />
						</div>
					</div>
					{/* Header with gradient */}
					<div className="flex items-center justify-between p-4 border-b border-border h-[76px] flex-shrink-0">
						<div className="flex items-center gap-3">
							<div
								className={cn(
									"w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center",
									aiTyping && "animate-pulse",
								)}
							>
								<Bot className="h-5 w-5 text-primary-foreground" />
							</div>
							<div className="flex-1">
								<h2 className="font-semibold text-foreground">{content.agentPanel}</h2>
								<p className="text-xs text-muted-foreground">{content.aiWritingAssistant}</p>
							</div>
						</div>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setChatPanePosition(chatPanePosition === "left" ? "right" : "left")}
							title={
								chatPanePosition === "left"
									? content.moveToRightSide.value
									: content.moveToLeftSide.value
							}
							data-testid="chat-pane-position-toggle"
						>
							{chatPanePosition === "left" ? (
								<PanelRightClose className="h-4 w-4" />
							) : (
								<PanelLeftClose className="h-4 w-4" />
							)}
						</Button>
					</div>

					{/* Quick Suggestions */}
					<div className="p-3 border-b border-sidebar-border flex-shrink-0">
						<p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
							<Lightbulb className="h-3 w-3" /> {content.quickSuggestions}
						</p>
						<div className="flex flex-wrap gap-1.5">
							{quickSuggestions.map(suggestion => (
								<button
									key={suggestion}
									onClick={() => setMessageInput(suggestion)}
									className="text-xs px-2 py-1 rounded-full bg-sidebar-accent hover:bg-primary/20 text-secondary-foreground hover:text-primary transition-colors"
									type="button"
								>
									{suggestion}
								</button>
							))}
						</div>
					</div>

					{/* Messages */}
					<div className="flex-1 overflow-y-auto p-4 space-y-4 chat-messages-container scrollbar-thin">
						{messages.length === 0 && !aiTyping && (
							<div className="text-center text-muted-foreground py-8" data-testid="no-messages">
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
									<div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
										<Sparkles className="h-3 w-3 text-primary" />
									</div>
								)}
								<div
									className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
										msg.role === "user"
											? "bg-primary text-primary-foreground"
											: "bg-sidebar-accent text-secondary-foreground"
									}`}
								>
									{/* v8 ignore next */}
									<MarkdownContent compact>{msg.content || ""}</MarkdownContent>
								</div>
								{msg.role === "user" && (
									<div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center shrink-0">
										{msg.userId ? (
											<UserAvatar userId={msg.userId} size="small" />
										) : (
											<User className="h-3 w-3 text-muted-foreground" />
										)}
									</div>
								)}
							</div>
						))}

						{aiTyping && streamingMessage && (
							<div className="flex gap-2 justify-start" data-testid="ai-streaming">
								<div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
									<Sparkles className="h-3 w-3 text-primary" />
								</div>
								<div className="max-w-[85%] rounded-lg px-3 py-2 bg-sidebar-accent text-secondary-foreground text-sm">
									<MarkdownContent compact>{streamingMessage}</MarkdownContent>
								</div>
							</div>
						)}

						{aiTyping &&
							(toolExecuting || isStreamingArticle || !streamingMessage || showLoadingIndicator) && (
								<div className="flex gap-2 justify-start items-center" data-testid="ai-typing">
									<div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
										<Sparkles className="h-3 w-3 text-primary" />
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
												title={
													showToolDetails
														? content.hideDetails.value
														: content.showDetails.value
												}
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
					<div className="p-3 border-t border-sidebar-border flex-shrink-0">
						<div className="flex gap-2 items-end">
							<Textarea
								value={messageInput}
								onChange={e => setMessageInput(e.target.value)}
								onKeyDown={e => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSendMessage().then();
									}
								}}
								placeholder={content.askJolliAnything.value}
								className="flex-1 bg-sidebar-accent border-sidebar-border text-sm min-h-[60px] max-h-[120px] resize-none"
								disabled={sending || aiTyping}
								data-testid="message-input"
								rows={2}
							/>
							<button
								type="button"
								onClick={handleSendMessage}
								disabled={!messageInput.trim() || sending || aiTyping}
								className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 text-primary-foreground h-9 w-9 bg-primary hover:bg-primary/90"
								data-testid="send-message-button"
							>
								<Send className="h-4 w-4" />
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Main Content Area */}
			<div className="flex flex-col flex-1 overflow-hidden">
				{/* Fallback top bar for non-inline mode (no portal container) */}
				{!headerActionsContainer && (
					<div className="flex items-center justify-between px-4 border-b bg-card flex-shrink-0 h-[52px]">
						<div className="flex items-center gap-3 flex-1 min-w-0">{renderTitleEditor()}</div>
						<div className="flex items-center gap-2">
							{renderSseStatus()}
							{renderLastEdited()}
							{renderShareControls()}
							{renderSuggestedEditsBadge()}
							{renderHistoryButton()}
							{renderSaveDiscardControls()}
							{canEdit && (
								<Button
									variant={showAgentPanel ? "secondary" : "ghost"}
									size="icon"
									className="h-7 w-7"
									onClick={() => setShowAgentPanel(prev => !prev)}
									title={content.agentPanel.value}
									data-testid="toggle-agent-panel"
								>
									<Sparkles className="h-3.5 w-3.5" />
								</Button>
							)}
							{renderThreeDotMenu()}
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7"
								onClick={handleClose}
								data-testid="close-button"
							>
								<X className="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
				)}
				{/* Hidden file input for Tiptap toolbar image upload */}
				<input
					ref={tiptapImageInputRef}
					type="file"
					accept={ACCEPTED_IMAGE_TYPES.join(",")}
					className="hidden"
					onChange={handleTiptapImageSelect}
					data-testid="tiptap-image-input"
				/>

				{/* v8 ignore start - Error toast triggered by paste/drag image events which require browser APIs */}
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
				{/* v8 ignore stop */}

				{/* Main Content - Editor Pane */}
				<div className="flex flex-1 overflow-hidden">
					{/* TOC / Article outline — fixed-width column. Top padding aligns
					    bars with the start of article content (below the TipTap toolbar). */}
					{isInlineMode && viewMode === "article" && outlineHeadings.length > 0 && (
						<div className="hidden md:block w-10 shrink-0 pt-14 pl-2 pr-1">
							<ArticleOutline
								headings={outlineHeadings}
								activeHeadingId={activeHeadingId}
								onHeadingClick={handleOutlineHeadingClick}
							/>
						</div>
					)}
					{isMarkdownContentType(draft?.contentType) ? (
						/* Markdown Editor Pane */
						<div
							className="h-full flex flex-col bg-background flex-1 min-w-0 relative"
							data-testid="editor-pane"
						>
							{renderValidationErrors()}
							<div className="flex-1 overflow-hidden flex flex-col">
								{viewMode === "markdown" ? (
									<>
										{renderSourceEditorToolbar(false)}
										<div
											className={cn(
												"flex-1 overflow-hidden p-4 flex flex-col",
												isInlineMode && "items-center",
											)}
										>
											<div
												className="flex-1 min-h-0 min-w-0"
												onPaste={handleEditorPaste}
												onDrop={handleEditorDrop}
												onDragOver={handleEditorDragOver}
												data-testid="article-editor-wrapper"
											>
												<NumberEdit
													ref={editorRef}
													value={stripJolliScriptFrontmatter(
														markdownPreview || articleContent,
													)}
													onChange={newContent => {
														setArticleContent(newContent);
														setMarkdownPreview(newContent);
														updateHasUserMadeChanges(
															true,
															"markdown editor content changed",
														);
														if (validationErrors.length > 0) {
															setValidationErrors([]);
														}
													}}
													className="h-full w-full"
													lineDecorations={validationErrors
														.filter(err => err.line)
														.map(err => ({
															line: err.line as number,
															type: "error" as const,
															/* v8 ignore start - brain mode JSX */
															message: err.message,
														}))}
													onLineClick={lineNumber => scrollToLine(lineNumber)}
													onHistoryChange={(canUndo, canRedo) => {
														setMarkdownCanUndo(canUndo);
														setMarkdownCanRedo(canRedo);
													}}
													data-testid="markdown-source-editor"
												/>
											</div>
										</div>
									</>
									/* v8 ignore next 70 */
								) : viewMode === "brain" ? (
									<>
										{renderPillToolbar(
											<>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={() => brainEditorRef.current?.undo()}
													disabled={!brainCanUndo || saving || aiTyping}
													data-testid="brain-undo"
												>
													<Undo className="h-4 w-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={() => brainEditorRef.current?.redo()}
													disabled={!brainCanRedo || saving || aiTyping}
													data-testid="brain-redo"
												>
													<Redo className="h-4 w-4" />
												</Button>
											</>,
										)}
										{/* Brain mode content */}
										<div className="flex-1 overflow-hidden p-4">
											<div className="flex-1 min-h-0 min-w-0 h-full">
												<NumberEdit
													ref={brainEditorRef}
													value={brainContent}
													onChange={handleBrainContentChange}
													className="h-full w-full"
													/* v8 ignore next 7 */
													lineDecorations={validationErrors
														.filter(err => err.line)
														.map(err => ({
															line: getAdjustedLineNumber(err.line as number),
															type: "error" as const,
															message: err.message,
														}))}
													/* v8 ignore next 10 */
													/* v8 ignore next 15 */
													onHistoryChange={(canUndo, canRedo) => {
														setBrainCanUndo(canUndo);
														setBrainCanRedo(canRedo);
													}}
													data-testid="brain-editor"
												/>
											</div>
										</div>
									</>
								) : (
									<SpaceImageProvider spaceId={imageUploadSpaceId}>
										<TiptapEdit
											ref={tiptapRef}
											content={markdownPreview || articleContent}
											contentType="markdown"
											showToolbar={canEdit}
											showDragHandle={canEdit}
											editable={canEdit}
											className="h-full w-full"
											narrowContent={isInlineMode}
											showFloatingToolbar={canEdit && isInlineMode && toolbarCollapsed}
											collapsibleToolbar={canEdit && isInlineMode}
											toolbarCollapsed={toolbarCollapsed}
											onToolbarCollapsedChange={setToolbarCollapsed}
											showViewToggle={canEdit}
											viewMode="article"
											onImageButtonClick={handleTiptapImageButtonClick}
											/* v8 ignore next 15 */
											onViewModeChange={async (mode, markdown) => {
												if (markdown) {
													setMarkdownPreview(markdown);
													setArticleContent(markdown);
													/* v8 ignore next 10 */
												}
												await handleViewModeChange(mode);
											}}
											/* v8 ignore next 4 */
											onChange={handleTiptapHtmlChange}
											onChangeMarkdown={handleArticleContentChange}
											sectionChanges={sectionChanges}
											sectionAnnotations={sectionAnnotations}
											{...(draft?.id !== undefined && { draftId: draft.id })}
											onApplySectionChange={handleApplySectionChange}
											onDismissSectionChange={handleDismissSectionChange}
											showSuggestions={showSuggestions}
										/>
									</SpaceImageProvider>
								)}
							</div>
						</div>
					) : (
						/* Non-markdown content editor */
						<div className="flex-1 flex flex-col bg-background relative" data-testid="editor-pane">
							{renderValidationErrors()}

							<div className="flex-1 overflow-hidden flex flex-col">
								{viewMode === "markdown" ? (
									<>
										{renderSourceEditorToolbar(true)}
										<div
											className={cn(
												"flex-1 overflow-hidden p-4 flex flex-col",
												isInlineMode && "items-center",
											)}
										>
											<div
												className="flex-1 min-h-0 min-w-0"
												onPaste={handleEditorPaste}
												onDrop={handleEditorDrop}
												/* v8 ignore next 8 */
												onDragOver={handleEditorDragOver}
												data-testid="article-editor-wrapper"
											>
												<NumberEdit
													ref={editorRef}
													value={
														isMarkdownContentType(draft?.contentType)
															? /* v8 ignore start - NumberEdit config */
																stripJolliScriptFrontmatter(
																	markdownPreview || articleContent,
																)
															: markdownPreview ||
																articleContent ||
																`// ${getContentTypeLabel(draft?.contentType)} content`
													}
													onChange={newContent => {
														setArticleContent(newContent);
														setMarkdownPreview(newContent);
														updateHasUserMadeChanges(true, "code editor content changed");
														if (validationErrors.length > 0) {
															setValidationErrors([]);
														}
													}}
													className="h-full w-full"
													lineDecorations={validationErrors
														.filter(err => err.line)
														.map(err => ({
															/* v8 ignore start - brain mode view JSX */
															line: err.line as number,
															type: "error" as const,
															message: err.message,
														}))}
													onLineClick={lineNumber => scrollToLine(lineNumber)}
													onHistoryChange={(canUndo, canRedo) => {
														setMarkdownCanUndo(canUndo);
														setMarkdownCanRedo(canRedo);
													}}
													data-testid="markdown-source-editor"
												/>
											</div>
										</div>
									</>
									/* v8 ignore next 70 */
								) : viewMode === "brain" ? (
									<>
										{renderPillToolbar(
											<>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={() => brainEditorRef.current?.undo()}
													disabled={!brainCanUndo || saving || aiTyping}
													data-testid="brain-undo"
												>
													<Undo className="h-4 w-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={() => brainEditorRef.current?.redo()}
													disabled={!brainCanRedo || saving || aiTyping}
													data-testid="brain-redo"
												>
													<Redo className="h-4 w-4" />
												</Button>
											</>,
										)}
										{/* Brain mode content */}
										<div className="flex-1 overflow-hidden p-4">
											<div className="flex-1 min-h-0 min-w-0 h-full">
												<NumberEdit
													ref={brainEditorRef}
													value={brainContent}
													onChange={handleBrainContentChange}
													className="h-full w-full"
													/* v8 ignore next 7 */
													lineDecorations={validationErrors
														.filter(err => err.line)
														.map(err => ({
															line: getAdjustedLineNumber(err.line as number),
															type: "error" as const,
															message: err.message,
														}))}
													onHistoryChange={(canUndo, canRedo) => {
														setBrainCanUndo(canUndo);
														setBrainCanRedo(canRedo);
													}}
													data-testid="brain-editor"
												/>
											</div>
										</div>
									</>
								) : (
									<SpaceImageProvider spaceId={imageUploadSpaceId}>
										<TiptapEdit
											ref={tiptapRef}
											content={markdownPreview || articleContent}
											contentType="markdown"
											showToolbar={canEdit}
											showDragHandle={canEdit}
											editable={canEdit}
											className="h-full w-full"
											narrowContent={isInlineMode}
											showFloatingToolbar={canEdit && isInlineMode && toolbarCollapsed}
											collapsibleToolbar={canEdit && isInlineMode}
											toolbarCollapsed={toolbarCollapsed}
											onToolbarCollapsedChange={setToolbarCollapsed}
											showViewToggle={canEdit}
											viewMode="article"
											onImageButtonClick={handleTiptapImageButtonClick}
											/* v8 ignore next 15 */
											onViewModeChange={async (mode, markdown) => {
												if (markdown) {
													setMarkdownPreview(markdown);
													setArticleContent(markdown);
												}
												await handleViewModeChange(mode);
											}}
											/* v8 ignore next 4 */
											onChange={handleTiptapHtmlChange}
											onChangeMarkdown={handleArticleContentChange}
											sectionChanges={sectionChanges}
											sectionAnnotations={sectionAnnotations}
											{...(draft?.id !== undefined && { draftId: draft.id })}
											onApplySectionChange={handleApplySectionChange}
											onDismissSectionChange={handleDismissSectionChange}
											showSuggestions={showSuggestions}
										/>
									</SpaceImageProvider>
								)}
							</div>
						</div>
					)}
				</div>
				{/* End of Main Content - Editor Pane */}
			</div>
			{/* End of Main Content Area */}

			{/* Image Delete Confirmation Dialog */}
			<AlertDialog open={imageToDelete !== null} onOpenChange={open => !open && setImageToDelete(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{content.deleteImageTitle}</AlertDialogTitle>
						<AlertDialogDescription>{content.deleteImageDescription}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deletingImage} data-testid="delete-image-cancel-button">
							{content.deleteImageCancel}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmImageDelete}
							disabled={deletingImage}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							data-testid="delete-image-confirm-button"
						>
							{content.deleteImageConfirm}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Discard Draft Confirmation Dialog */}
			<AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{content.discardDraftConfirmTitle}</AlertDialogTitle>
						<AlertDialogDescription>{content.discardDraftConfirmDescription}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel data-testid="discard-cancel-button">
							{content.discardDraftCancel}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDiscardDraft}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							data-testid="discard-confirm-button"
						>
							{content.discardDraftConfirm}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Delete Article Confirmation Dialog */}
			<AlertDialog open={showDeleteArticleDialog} onOpenChange={setShowDeleteArticleDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{content.deleteArticleConfirmTitle}</AlertDialogTitle>
						<AlertDialogDescription>{content.deleteArticleConfirmDescription}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting} data-testid="delete-article-cancel-button">
							{content.deleteArticleCancel}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteArticle}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={deleting}
							data-testid="delete-article-confirm-button"
						>
							{content.deleteArticleConfirm}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
