import { ArticleLinkExtension, ArticleLinkPluginKey, type ArticleLinkPluginState } from "./ArticleLinkExtension";
import { ArticleLinkMenu } from "./ArticleLinkMenu";
import { ArticleLinkNode } from "./ArticleLinkNode";
import { CodeBlockExtension } from "./CodeBlockExtension";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./DropdownMenu";
import { type HiddenRange, HiddenSectionExtension, type HiddenSectionStorage } from "./HiddenSectionExtension";
import { MarkdownPasteExtension } from "./MarkdownPasteExtension";
import { ResizableImageExtension } from "./ResizableImageExtension";
import { SectionSuggestionExtension, type SectionSuggestionStorage } from "./SectionSuggestionExtension";
import { Separator } from "./Separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold as BoldExtension } from "@tiptap/extension-bold";
import { Code as CodeExtension } from "@tiptap/extension-code";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import Highlight from "@tiptap/extension-highlight";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Italic as ItalicExtension } from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike as StrikeExtension } from "@tiptap/extension-strike";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { Text } from "@tiptap/extension-text";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline as UnderlineExtension } from "@tiptap/extension-underline";
import { Dropcursor } from "@tiptap/extensions/drop-cursor";
import { Gapcursor } from "@tiptap/extensions/gap-cursor";
import { TrailingNode } from "@tiptap/extensions/trailing-node";
import { UndoRedo } from "@tiptap/extensions/undo-redo";
import { Markdown } from "@tiptap/markdown";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { NodeSelection, EditorState as PMEditorState, Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import type { ArticleLinkSearchResult, DocDraftSectionChanges, SectionAnnotation } from "jolli-common";
import debounce from "lodash.debounce";
import { common, createLowlight } from "lowlight";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	AtSign,
	Bold,
	Brain as BrainIcon,
	ChevronDown,
	ChevronUp,
	Code,
	CodeSquare,
	Columns3,
	Ellipsis,
	FileText,
	Hash,
	Heading1,
	Heading2,
	Heading3,
	Heading4,
	Highlighter,
	Image as ImageIcon,
	Italic,
	Link2,
	List,
	ListOrdered,
	Minus,
	Pilcrow,
	Plus,
	Quote,
	Redo,
	RowsIcon,
	Split,
	Strikethrough,
	Table as TableIcon,
	Trash2,
	Underline,
	Undo,
} from "lucide-react";
import {
	type ComponentType,
	type CSSProperties,
	Fragment,
	forwardRef,
	lazy,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { useIntlayer } from "react-intlayer";
import { cn } from "@/common/ClassNameUtils";
import { getLog } from "@/util/Logger";
import { isAllowedLinkUrl } from "@/util/UrlUtil";
import "./TiptapEdit.css";

const log = getLog(import.meta);

/** Lazy-loaded DragHandleMenu — keeps yjs/collaboration deps out of the main tiptap chunk */
const LazyDragHandleMenu = lazy(() => import("./DragHandleMenu").then(m => ({ default: m.DragHandleMenu })));

/** Lazy-loaded FloatingToolbar — only loaded when showFloatingToolbar is enabled */
const LazyFloatingToolbar = lazy(() =>
	import("../../ui/spaces/FloatingToolbar").then(m => ({ default: m.FloatingToolbar })),
);

/**
 * Ensures standalone images have blank lines before and after them.
 * This prevents images from being parsed as inline content within paragraphs,
 * which would cause ProseMirror schema validation errors.
 *
 * In Markdown, a blank line separates block elements. Without blank lines,
 * `hello\n![img](url)` is parsed as a single paragraph containing text and image,
 * but ProseMirror's paragraph schema doesn't allow image nodes inside paragraphs.
 */
function ensureImageParagraphs(markdown: string): string {
	// Match markdown images: ![alt](url) or ![alt](url "title")
	const imageRegex = /^!\[[^\]]*\]\([^)]+\)$/;

	// Split content by lines to process
	const lines = markdown.split("\n");
	const result: Array<string> = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmedLine = line.trim();

		// Check if this line is a standalone image (only contains an image)
		if (imageRegex.test(trimmedLine)) {
			// Add blank line before if previous line exists and is not empty
			if (i > 0 && result.length > 0 && result[result.length - 1].trim() !== "") {
				result.push("");
			}
			result.push(line);
			// Add blank line after if next line exists and is not empty
			if (i < lines.length - 1 && lines[i + 1].trim() !== "") {
				result.push("");
			}
		} else {
			result.push(line);
		}
	}

	return result.join("\n");
}

/**
 * Clear the undo/redo history of the editor.
 * Creates a fresh EditorState with the same document/plugins but reset plugin states,
 * so undo won't revert past the current document state (e.g. after mode switch).
 */
function clearEditorHistory(editor: ReturnType<typeof useEditor>): void {
	/* v8 ignore next 3 - defensive null guard; editor.view.state is always present when called */
	if (!editor?.view?.state) {
		return;
	}
	const { state } = editor.view;
	// Create a fresh state with the same doc, schema, and plugins but reset history
	/* v8 ignore next 4 - ProseMirror state reset; requires a real editor instance to test */
	const newState = PMEditorState.create({
		doc: state.doc,
		plugins: state.plugins,
	});
	editor.view.updateState(newState);
}

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

/* v8 ignore start - ProseMirror keyboard handlers require real editor state, tested via E2E */
type DispatchFn = (tr: Transaction) => void;

/**
 * Handle deleting a selected code block (when NodeSelection is on a codeBlock)
 */
function handleDeleteSelectedCodeBlock(state: EditorState, dispatch: DispatchFn): boolean {
	const { selection } = state;
	if (selection instanceof NodeSelection && selection.node?.type.name === "codeBlock") {
		dispatch(state.tr.deleteSelection());
		return true;
	}
	return false;
}

/**
 * Handle selecting code block when cursor is at the beginning of it
 */
function handleSelectCodeBlockAtStart(state: EditorState, dispatch: DispatchFn): boolean {
	const { selection } = state;
	const { $from } = selection;
	if (selection.empty && $from.parent.type.name === "codeBlock" && $from.parentOffset === 0) {
		const codeBlockPos = $from.before($from.depth);
		dispatch(state.tr.setSelection(NodeSelection.create(state.doc, codeBlockPos)));
		return true;
	}
	return false;
}

/**
 * Handle selecting previous node (image or codeBlock) when cursor is at block start
 */
function handleSelectPreviousNode(state: EditorState, dispatch: DispatchFn): boolean {
	const { selection } = state;
	const { $from } = selection;
	if (!selection.empty || $from.parentOffset !== 0) {
		return false;
	}
	const posBefore = $from.before($from.depth);
	if (posBefore <= 0) {
		return false;
	}
	const $posBefore = state.doc.resolve(posBefore);
	const nodeBefore = $posBefore.nodeBefore;
	if (nodeBefore?.type.name === "image" || nodeBefore?.type.name === "codeBlock") {
		const nodePos = posBefore - nodeBefore.nodeSize;
		dispatch(state.tr.setSelection(NodeSelection.create(state.doc, nodePos)));
		return true;
	}
	return false;
}

/**
 * Check if a table node is empty
 */
function isTableEmpty(node: {
	descendants: (callback: (child: { isText: boolean; isTextblock: boolean; textContent: string }) => boolean) => void;
}): boolean {
	let isEmpty = true;
	node.descendants((child: { isText: boolean; isTextblock: boolean; textContent: string }) => {
		if (child.isText || (child.isTextblock && child.textContent.trim() !== "")) {
			isEmpty = false;
			return false;
		}
		return true;
	});
	return isEmpty;
}

/**
 * Handle deleting empty table on backspace
 */
function handleDeleteEmptyTable(state: EditorState, dispatch: DispatchFn): boolean {
	const { selection } = state;
	const { $from } = selection;
	for (let d = $from.depth; d > 0; d--) {
		const node = $from.node(d);
		if (node?.type.name === "table") {
			if (isTableEmpty(node)) {
				const pos = $from.before(d);
				dispatch(state.tr.delete(pos, pos + node.nodeSize));
				return true;
			}
			break;
		}
	}
	return false;
}

/**
 * Handle force delete table with Ctrl/Cmd+Shift+Backspace
 */
function handleForceDeleteTable(state: EditorState, dispatch: DispatchFn): boolean {
	const { selection } = state;
	const { $from } = selection;
	for (let d = $from.depth; d > 0; d--) {
		const node = $from.node(d);
		if (node?.type.name === "table") {
			const pos = $from.before(d);
			dispatch(state.tr.delete(pos, pos + node.nodeSize));
			return true;
		}
	}
	return false;
}

/**
 * Main keyboard event handler for backspace
 */
function handleBackspaceKey(view: EditorView): boolean {
	const { state, dispatch } = view;
	if (handleDeleteSelectedCodeBlock(state, dispatch)) {
		return true;
	}
	if (handleSelectCodeBlockAtStart(state, dispatch)) {
		return true;
	}
	if (handleSelectPreviousNode(state, dispatch)) {
		return true;
	}
	if (handleDeleteEmptyTable(state, dispatch)) {
		return true;
	}
	return false;
}

/**
 * Main keyboard event handler for force delete (Ctrl/Cmd+Shift+Backspace)
 */
function handleForceDeleteKey(view: EditorView): boolean {
	return handleForceDeleteTable(view.state, view.dispatch);
}

/**
 * Handle arrow-right / arrow-down navigation around code blocks.
 * Implements a three-state cycle: text → NodeSelection → inside codeBlock.
 */
function handleArrowForward(view: EditorView, direction: "right" | "down"): boolean {
	const { state } = view;
	const { selection } = state;

	// Case A: NodeSelection on codeBlock → skip past it
	if (selection instanceof NodeSelection && selection.node?.type.name === "codeBlock") {
		const afterPos = selection.from + selection.node.nodeSize;
		if (afterPos >= state.doc.content.size) {
			return true;
		}
		const $after = state.doc.resolve(afterPos);
		if ($after.nodeAfter?.type.name === "codeBlock") {
			view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, afterPos)));
		} else {
			view.dispatch(state.tr.setSelection(Selection.near($after, 1)));
		}
		return true;
	}

	if (selection.empty && view.endOfTextblock(direction)) {
		const { $from } = selection;

		// Case C: cursor at end of codeBlock content → NodeSelect this codeBlock
		if ($from.parent.type.name === "codeBlock" && $from.parentOffset === $from.parent.content.size) {
			const codeBlockPos = $from.before($from.depth);
			view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, codeBlockPos)));
			return true;
		}

		// Case B: cursor at textblock edge → NodeSelect adjacent codeBlock
		const after = $from.after($from.depth);
		if (after < state.doc.content.size) {
			const $after = state.doc.resolve(after);
			const nodeAfter = $after.nodeAfter;
			if (nodeAfter?.type.name === "codeBlock") {
				view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, after)));
				return true;
			}
		}
	}

	return false;
}

/**
 * Handle arrow-left / arrow-up navigation around code blocks.
 * Implements a three-state cycle: text → NodeSelection → inside codeBlock (at end).
 */
function handleArrowBackward(view: EditorView, direction: "left" | "up"): boolean {
	const { state } = view;
	const { selection } = state;

	// Case A: NodeSelection on codeBlock → skip before it
	if (selection instanceof NodeSelection && selection.node?.type.name === "codeBlock") {
		const $before = state.doc.resolve(selection.from);
		if (!$before.nodeBefore) {
			return true;
		}
		if ($before.nodeBefore.type.name === "codeBlock") {
			const nodePos = selection.from - $before.nodeBefore.nodeSize;
			view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, nodePos)));
		} else {
			view.dispatch(state.tr.setSelection(Selection.near($before, -1)));
		}
		return true;
	}

	if (selection.empty && view.endOfTextblock(direction)) {
		const { $from } = selection;

		// Case C: cursor at start of codeBlock content → NodeSelect this codeBlock
		if ($from.parent.type.name === "codeBlock" && $from.parentOffset === 0) {
			const codeBlockPos = $from.before($from.depth);
			view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, codeBlockPos)));
			return true;
		}

		// Case B: cursor at textblock edge → NodeSelect adjacent codeBlock
		const before = $from.before($from.depth);
		if (before > 0) {
			const $before = state.doc.resolve(before);
			const nodeBefore = $before.nodeBefore;
			if (nodeBefore?.type.name === "codeBlock") {
				const nodePos = before - nodeBefore.nodeSize;
				view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, nodePos)));
				return true;
			}
		}
	}

	return false;
}
/* v8 ignore stop */

/**
 * Finds the ProseMirror position of a heading by matching its title text.
 * For preamble (title is null), returns position 0 (start of document).
 * Returns the position at the START of the heading node.
 */
function findPositionForHeading(editor: ReturnType<typeof useEditor>, title: string | null): number | null {
	/* v8 ignore next 3 - defensive null guard; editor is always provided when called */
	if (!editor) {
		return null;
	}

	/* v8 ignore next 3 - null title (preamble) path covered by section-suggestion E2E tests */
	if (title === null) {
		return 0;
	}

	const doc = editor.state.doc;
	let targetPos: number | null = null;

	doc.descendants((node, pos) => {
		if (targetPos !== null) {
			return false;
		}
		if (node.type.name === "heading" && node.textContent === title) {
			targetPos = pos;
			return false;
		}
		return true;
	});

	return targetPos;
}

/**
 * Finds the ProseMirror position AFTER the last node of a section identified by its heading title.
 * For preamble (title is null), returns position after last node before the first heading.
 * This is used for insert-after operations so the suggestion node appears after the anchor section.
 */
function findPositionAfterSection(editor: ReturnType<typeof useEditor>, title: string | null): number | null {
	/* v8 ignore next 3 - defensive null guard; editor is always provided when called */
	if (!editor) {
		return null;
	}

	const doc = editor.state.doc;

	/* v8 ignore start - null title (preamble) path covered by section-suggestion E2E tests */
	if (title === null) {
		let lastPosAfter = 0;
		let foundHeading = false;
		doc.descendants((node, pos) => {
			if (foundHeading) {
				return false;
			}
			if (node.type.name === "heading") {
				foundHeading = true;
				return false;
			}
			if (node.isBlock) {
				lastPosAfter = pos + node.nodeSize;
			}
			return false;
		});
		return lastPosAfter || 0;
	}
	/* v8 ignore stop */

	let inSection = false;
	let sectionEnded = false;
	let lastPosAfter: number | null = null;

	doc.descendants((node, pos) => {
		if (sectionEnded) {
			return false;
		}

		if (node.type.name === "heading") {
			if (inSection) {
				sectionEnded = true;
				return false;
			}
			if (node.textContent === title) {
				inSection = true;
				lastPosAfter = pos + node.nodeSize;
			}
			return false;
		}

		if (inSection && node.isBlock) {
			lastPosAfter = pos + node.nodeSize;
			return false;
		}

		return true;
	});

	return lastPosAfter;
}

function scrollToFirstSuggestion(editorDom: HTMLElement): void {
	setTimeout(() => {
		const firstNode = editorDom.querySelector(".section-suggestion-nodeview");
		/* v8 ignore next 3 - scroll is a visual side-effect; section-suggestion-nodeview not rendered in unit tests */
		if (firstNode) {
			firstNode.scrollIntoView({ behavior: "smooth", block: "center" });
		}
	}, 100);
}

function getExistingSuggestionIds(editor: ReturnType<typeof useEditor>): Set<number> {
	const ids = new Set<number>();
	/* v8 ignore next 3 - defensive null guard; editor is always provided when called */
	if (!editor) {
		return ids;
	}
	editor.state.doc.descendants(node => {
		/* v8 ignore next 3 - sectionSuggestion nodes only exist with real suggestion data; covered by E2E tests */
		if (node.type.name === "sectionSuggestion") {
			ids.add(node.attrs.changeId as number);
		}
		return true;
	});
	return ids;
}

/**
 * Toolbar button types enum
 */
export enum ToolbarButton {
	BOLD = "bold",
	ITALIC = "italic",
	UNDERLINE = "underline",
	STRIKE = "strike",
	CODE = "code",
	CODE_BLOCK = "codeBlock",
	HIGHLIGHT = "highlight",
	HEADING_1 = "heading1",
	HEADING_2 = "heading2",
	HEADING_3 = "heading3",
	HEADING_4 = "heading4",
	PARAGRAPH = "paragraph",
	BULLET_LIST = "bulletList",
	ORDERED_LIST = "orderedList",
	BLOCKQUOTE = "blockquote",
	ALIGN_LEFT = "alignLeft",
	ALIGN_CENTER = "alignCenter",
	ALIGN_RIGHT = "alignRight",
	LINK = "link",
	IMAGE = "image",
	MENTION = "mention",
	UNDO = "undo",
	REDO = "redo",
	INSERT_TABLE = "insertTable",
	DELETE_TABLE = "deleteTable",
	ADD_COLUMN_BEFORE = "addColumnBefore",
	ADD_COLUMN_AFTER = "addColumnAfter",
	DELETE_COLUMN = "deleteColumn",
	ADD_ROW_BEFORE = "addRowBefore",
	ADD_ROW_AFTER = "addRowAfter",
	DELETE_ROW = "deleteRow",
	MERGE_CELLS = "mergeCells",
	SPLIT_CELL = "splitCell",
	TOGGLE_HEADER_COLUMN = "toggleHeaderColumn",
	TOGGLE_HEADER_ROW = "toggleHeaderRow",
	TOGGLE_HEADER_CELL = "toggleHeaderCell",
	HORIZONTAL_RULE = "horizontalRule",
}

/** A toolbar segment is either a group of direct buttons or a dropdown picker. */
type ToolbarSegment =
	| { type: "buttons"; buttons: Array<ToolbarButton> }
	| { type: "dropdown"; id: string; buttons: Array<ToolbarButton> };

export const TOOLBAR_SEGMENTS: Array<ToolbarSegment> = [
	{ type: "buttons", buttons: [ToolbarButton.UNDO, ToolbarButton.REDO] },
	{
		type: "dropdown",
		id: "heading",
		buttons: [
			ToolbarButton.HEADING_1,
			ToolbarButton.HEADING_2,
			ToolbarButton.HEADING_3,
			ToolbarButton.HEADING_4,
			ToolbarButton.PARAGRAPH,
		],
	},
	{
		type: "buttons",
		buttons: [ToolbarButton.BOLD, ToolbarButton.ITALIC, ToolbarButton.UNDERLINE, ToolbarButton.STRIKE],
	},
	{
		type: "dropdown",
		id: "align",
		buttons: [ToolbarButton.ALIGN_LEFT, ToolbarButton.ALIGN_CENTER, ToolbarButton.ALIGN_RIGHT],
	},
	{ type: "buttons", buttons: [ToolbarButton.BULLET_LIST, ToolbarButton.ORDERED_LIST, ToolbarButton.BLOCKQUOTE] },
	{ type: "buttons", buttons: [ToolbarButton.LINK, ToolbarButton.IMAGE] },
	{
		type: "dropdown",
		id: "more",
		buttons: [
			ToolbarButton.CODE,
			ToolbarButton.CODE_BLOCK,
			ToolbarButton.HIGHLIGHT,
			ToolbarButton.INSERT_TABLE,
			ToolbarButton.HORIZONTAL_RULE,
		],
	},
];

/** Flat list of button groups for backwards compatibility. */
export const TOOLBAR_BUTTON_GROUPS: Array<Array<ToolbarButton>> = TOOLBAR_SEGMENTS.map(s => s.buttons);
export const DEFAULT_TOOLBAR_BUTTONS = TOOLBAR_BUTTON_GROUPS.flat();

export interface TiptapEditProps {
	/**
	 * Initial content (can be HTML or Markdown depending on contentType)
	 */
	content?: string;
	/**
	 * Content type
	 * @default 'html'
	 */
	contentType?: "html" | "markdown";
	/**
	 * Callback when content changes (returns HTML)
	 */
	onChange?: (html: string) => void;
	/**
	 * Callback when content changes (returns Markdown)
	 */
	onChangeMarkdown?: (markdown: string) => void;
	/**
	 * Whether to show the toolbar
	 * @default true
	 */
	showToolbar?: boolean;
	/**
	 * Toolbar buttons to display (if showToolbar is true)
	 * @default DEFAULT_TOOLBAR_BUTTONS
	 */
	toolbarButtons?: Array<ToolbarButton>;
	/**
	 * Placeholder text when editor is empty
	 */
	placeholder?: string;
	/**
	 * Whether the editor is editable
	 * @default true
	 */
	editable?: boolean;
	/**
	 * Additional className for the editor container
	 */
	className?: string;
	/**
	 * Additional className for the editor content area
	 */
	editorClassName?: string;
	/**
	 * Table border color
	 * @default '#000000'
	 */
	tableBorderColor?: string;
	/**
	 * Table border width in pixels
	 * @default 2
	 */
	tableBorderWidth?: number;
	/**
	 * Show view mode toggle (Article/Markdown) in toolbar
	 * @default false
	 */
	showViewToggle?: boolean;
	/**
	 * Current view mode
	 * @default 'article'
	 */
	viewMode?: "article" | "markdown" | "brain";
	/**
	 * Callback when view mode changes
	 * When switching to markdown mode, also returns the markdown content
	 */
	onViewModeChange?: (mode: "article" | "markdown" | "brain", markdownContent?: string) => void;
	/**
	 * Show drag handle for block-level selection and reordering
	 * When enabled, a drag handle appears on hover to the left of each block
	 * @default false
	 */
	showDragHandle?: boolean;
	/**
	 * Callback when the image toolbar button is clicked.
	 * If provided, clicking the image button will trigger this callback instead of the default behavior.
	 */
	onImageButtonClick?: () => void;
	/**
	 * Section changes (suggestions) to display inline in the editor
	 */
	sectionChanges?: Array<DocDraftSectionChanges>;
	/**
	 * Section annotations that map section changes to line ranges in the content
	 */
	sectionAnnotations?: Array<SectionAnnotation>;
	/**
	 * Draft ID for the current document (required for section suggestions)
	 */
	draftId?: number;
	/**
	 * Callback when a section suggestion is applied
	 */
	onApplySectionChange?: (changeId: number) => void;
	/**
	 * Callback when a section suggestion is dismissed
	 */
	onDismissSectionChange?: (changeId: number) => void;
	/**
	 * Whether to show inline section suggestions
	 * @default false
	 */
	showSuggestions?: boolean;
	/**
	 * Constrain editor content to a narrow width (max-w-3xl) for focused writing.
	 * Toolbar spans full width; only the content area is narrowed.
	 * @default false
	 */
	narrowContent?: boolean;
	/**
	 * Show a floating toolbar above the text selection for quick formatting.
	 * @default false
	 */
	showFloatingToolbar?: boolean;
	/**
	 * Enable collapsible toolbar with centered pill styling.
	 * When true, the toolbar can be collapsed to a thin bar that expands on hover.
	 * @default false
	 */
	collapsibleToolbar?: boolean;
	/**
	 * Whether the collapsible toolbar is currently collapsed.
	 * Only used when collapsibleToolbar is true.
	 */
	toolbarCollapsed?: boolean;
	/**
	 * Callback when the toolbar collapsed state changes.
	 * Only used when collapsibleToolbar is true.
	 */
	onToolbarCollapsedChange?: (collapsed: boolean) => void;
}

interface ToolbarButtonConfig {
	button: ToolbarButton;
	icon: ComponentType<{ className?: string }>;
	labelKey: keyof typeof tiptapEditContent.content.toolbar;
	action: (editor: ReturnType<typeof useEditor>) => void;
	isActive: (editor: ReturnType<typeof useEditor>) => boolean;
	isDisabled?: (editor: ReturnType<typeof useEditor>) => boolean;
}

interface ToolbarButtonProps {
	config: ToolbarButtonConfig;
	editor: ReturnType<typeof useEditor>;
	label: string;
}

// Import content type for type safety
import type tiptapEditContent from "./TiptapEdit.content";

/**
 * Ref handle for TiptapEdit component
 */
export interface TiptapEditRef {
	/**
	 * Insert an image at the current cursor position
	 * @param src - Image source URL
	 * @param alt - Alt text for the image
	 */
	insertImage: (src: string, alt?: string) => void;
	/**
	 * Returns the editor's ProseMirror DOM element, or null if the editor is not mounted.
	 * Use this to scope DOM queries to this specific editor instance instead of using
	 * document.querySelector(".ProseMirror"), which breaks when multiple editors exist.
	 */
	getEditorElement: () => HTMLElement | null;
}

/**
 * Individual toolbar button component with controlled tooltip
 */
function ToolbarButtonComponent({ config, editor, label }: ToolbarButtonProps) {
	const Icon = config.icon;
	const isActive = config.isActive(editor);
	/* v8 ignore next - ?? false fallback; isDisabled always returns boolean when defined */
	const isDisabled = config.isDisabled?.(editor) ?? false;

	// Use controlled mode with local state
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const hoverTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (hoverTimeoutRef.current) {
				window.clearTimeout(hoverTimeoutRef.current);
			}
		};
	}, []);

	const handleMouseEnter = () => {
		if (hoverTimeoutRef.current) {
			window.clearTimeout(hoverTimeoutRef.current);
			hoverTimeoutRef.current = null;
		}
		setTooltipOpen(true);
	};

	const handleMouseLeave = () => {
		// Close tooltip after a small delay to allow moving to tooltip content
		hoverTimeoutRef.current = window.setTimeout(() => {
			setTooltipOpen(false);
		}, 100);
	};

	return (
		<Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
			<TooltipTrigger asChild>
				<button
					onClick={() => config.action(editor)}
					disabled={isDisabled}
					type="button"
					title={label}
					aria-label={label}
					onMouseEnter={handleMouseEnter}
					onMouseLeave={handleMouseLeave}
					className={cn(
						"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-8 w-8",
						isActive
							? "bg-primary text-primary-foreground shadow hover:bg-primary/90"
							: "text-muted-foreground hover:bg-accent hover:text-foreground",
					)}
				>
					<Icon className="h-4 w-4" />
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="bottom"
				sideOffset={8}
				/* v8 ignore start - Radix tooltip hover interactions, tested via E2E */
				onMouseEnter={() => {
					if (hoverTimeoutRef.current) {
						window.clearTimeout(hoverTimeoutRef.current);
						hoverTimeoutRef.current = null;
					}
				}}
				onMouseLeave={() => {
					setTooltipOpen(false);
				}}
				/* v8 ignore stop */
			>
				<p>{label}</p>
			</TooltipContent>
		</Tooltip>
	);
}

const TOOLBAR_CONFIG: Array<ToolbarButtonConfig> = [
	{
		button: ToolbarButton.BOLD,
		icon: Bold,
		labelKey: "bold",
		action: editor => editor?.chain().focus().toggleBold().run(),
		isActive: editor => {
			if (editor?.isActive("heading", { level: 1 }) || editor?.isActive("heading", { level: 2 })) {
				return false;
			}
			/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
			return editor?.isActive("bold") ?? false;
		},
	},
	{
		button: ToolbarButton.ITALIC,
		icon: Italic,
		labelKey: "italic",
		action: editor => editor?.chain().focus().toggleItalic().run(),
		isActive: editor => {
			if (editor?.isActive("heading", { level: 1 }) || editor?.isActive("heading", { level: 2 })) {
				return false;
			}
			/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
			return editor?.isActive("italic") ?? false;
		},
	},
	{
		button: ToolbarButton.UNDERLINE,
		icon: Underline,
		labelKey: "underline",
		action: editor => editor?.chain().focus().toggleUnderline().run(),
		/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
		isActive: editor => editor?.isActive("underline") ?? false,
	},
	{
		button: ToolbarButton.STRIKE,
		icon: Strikethrough,
		labelKey: "strikethrough",
		action: editor => editor?.chain().focus().toggleStrike().run(),
		/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
		isActive: editor => editor?.isActive("strike") ?? false,
	},
	{
		button: ToolbarButton.CODE,
		icon: Code,
		labelKey: "inlineCode",
		action: editor => editor?.chain().focus().toggleCode().run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.CODE_BLOCK,
		icon: CodeSquare,
		labelKey: "codeBlock",
		action: editor => {
			/* v8 ignore next 3 - defensive check, toolbar only renders when editor exists */
			if (!editor) {
				return;
			}
			if (editor.isActive("codeBlock")) {
				editor.chain().focus().toggleCodeBlock().run();
			} else {
				editor.chain().focus().setCodeBlock().run();
			}
		},
		isActive: () => false,
	},
	{
		button: ToolbarButton.HIGHLIGHT,
		icon: Highlighter,
		labelKey: "highlight",
		action: editor => editor?.chain().focus().toggleHighlight().run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.HEADING_1,
		icon: Heading1,
		labelKey: "heading1",
		action: editor => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
		/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
		isActive: editor => editor?.isActive("heading", { level: 1 }) ?? false,
	},
	{
		button: ToolbarButton.HEADING_2,
		icon: Heading2,
		labelKey: "heading2",
		action: editor => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
		/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
		isActive: editor => editor?.isActive("heading", { level: 2 }) ?? false,
	},
	{
		button: ToolbarButton.HEADING_3,
		icon: Heading3,
		labelKey: "heading3",
		action: editor => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.HEADING_4,
		icon: Heading4,
		labelKey: "heading4",
		action: editor => editor?.chain().focus().toggleHeading({ level: 4 }).run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.PARAGRAPH,
		icon: Pilcrow,
		labelKey: "paragraph",
		action: editor => editor?.chain().focus().setParagraph().run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.BULLET_LIST,
		icon: List,
		labelKey: "bulletList",
		action: editor => editor?.chain().focus().toggleBulletList().run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.ORDERED_LIST,
		icon: ListOrdered,
		labelKey: "orderedList",
		action: editor => editor?.chain().focus().toggleOrderedList().run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.BLOCKQUOTE,
		icon: Quote,
		labelKey: "blockquote",
		action: editor => editor?.chain().focus().toggleBlockquote().run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.ALIGN_LEFT,
		icon: AlignLeft,
		labelKey: "alignLeft",
		action: editor => editor?.chain().focus().setTextAlign("left").run(),
		/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
		isActive: editor => editor?.isActive({ textAlign: "left" }) ?? false,
	},
	{
		button: ToolbarButton.ALIGN_CENTER,
		icon: AlignCenter,
		labelKey: "alignCenter",
		action: editor => editor?.chain().focus().setTextAlign("center").run(),
		/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
		isActive: editor => editor?.isActive({ textAlign: "center" }) ?? false,
	},
	{
		button: ToolbarButton.ALIGN_RIGHT,
		icon: AlignRight,
		labelKey: "alignRight",
		action: editor => editor?.chain().focus().setTextAlign("right").run(),
		/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
		isActive: editor => editor?.isActive({ textAlign: "right" }) ?? false,
	},
	{
		button: ToolbarButton.LINK,
		icon: Link2,
		labelKey: "link",
		action: editor => {
			/* v8 ignore start - link action requires real editor with getAttributes */
			if (!editor) {
				return;
			}
			// If already a link, remove it
			if (editor.isActive("link")) {
				editor.chain().focus().unsetLink().run();
				return;
			}
			// Get previous URL if exists (only if getAttributes is available)
			const previousUrl =
				typeof editor.getAttributes === "function" ? editor.getAttributes("link").href || "" : "";
			// Prompt for URL
			// NOTE: This is a module-level constant so i18n hooks are not available here.
			// The FloatingToolbar has its own localized version of this prompt.
			const url = window.prompt("Enter URL:", previousUrl);
			// If cancelled, empty, or uses a dangerous scheme (javascript:, data:, etc.), do nothing
			if (!url || !isAllowedLinkUrl(url)) {
				return;
			}
			editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
			/* v8 ignore stop */
		},
		/* v8 ignore next - ?? false fallback; editor is non-null when toolbar is rendered */
		isActive: editor => editor?.isActive("link") ?? false,
	},
	{
		button: ToolbarButton.IMAGE,
		icon: ImageIcon,
		labelKey: "image",
		action: _editor => false,
		isActive: () => false,
	},
	{
		button: ToolbarButton.MENTION,
		icon: AtSign,
		labelKey: "mention",
		action: _editor => false,
		isActive: () => false,
	},
	{
		button: ToolbarButton.UNDO,
		icon: Undo,
		labelKey: "undo",
		action: editor => editor?.chain().focus().undo().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().undo(),
	},
	{
		button: ToolbarButton.REDO,
		icon: Redo,
		labelKey: "redo",
		action: editor => editor?.chain().focus().redo().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().redo(),
	},
	{
		button: ToolbarButton.INSERT_TABLE,
		icon: TableIcon,
		labelKey: "insertTable",
		action: editor => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
		isActive: () => false,
	},
	{
		button: ToolbarButton.DELETE_TABLE,
		icon: Trash2,
		labelKey: "deleteTable",
		action: editor => editor?.chain().focus().deleteTable().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().deleteTable(),
	},
	{
		button: ToolbarButton.ADD_COLUMN_BEFORE,
		icon: Columns3,
		labelKey: "addColumnBefore",
		action: editor => editor?.chain().focus().addColumnBefore().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().addColumnBefore(),
	},
	{
		button: ToolbarButton.ADD_COLUMN_AFTER,
		icon: Columns3,
		labelKey: "addColumnAfter",
		action: editor => editor?.chain().focus().addColumnAfter().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().addColumnAfter(),
	},
	{
		button: ToolbarButton.DELETE_COLUMN,
		icon: Minus,
		labelKey: "deleteColumn",
		action: editor => editor?.chain().focus().deleteColumn().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().deleteColumn(),
	},
	{
		button: ToolbarButton.ADD_ROW_BEFORE,
		icon: RowsIcon,
		labelKey: "addRowBefore",
		action: editor => editor?.chain().focus().addRowBefore().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().addRowBefore(),
	},
	{
		button: ToolbarButton.ADD_ROW_AFTER,
		icon: RowsIcon,
		labelKey: "addRowAfter",
		action: editor => editor?.chain().focus().addRowAfter().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().addRowAfter(),
	},
	{
		button: ToolbarButton.DELETE_ROW,
		icon: Minus,
		labelKey: "deleteRow",
		action: editor => editor?.chain().focus().deleteRow().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().deleteRow(),
	},
	{
		button: ToolbarButton.MERGE_CELLS,
		icon: Plus,
		labelKey: "mergeCells",
		action: editor => editor?.chain().focus().mergeCells().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().mergeCells(),
	},
	{
		button: ToolbarButton.SPLIT_CELL,
		icon: Split,
		labelKey: "splitCell",
		action: editor => editor?.chain().focus().splitCell().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().splitCell(),
	},
	{
		button: ToolbarButton.TOGGLE_HEADER_COLUMN,
		icon: Columns3,
		labelKey: "toggleHeaderColumn",
		action: editor => editor?.chain().focus().toggleHeaderColumn().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().toggleHeaderColumn(),
	},
	{
		button: ToolbarButton.TOGGLE_HEADER_ROW,
		icon: RowsIcon,
		labelKey: "toggleHeaderRow",
		action: editor => editor?.chain().focus().toggleHeaderRow().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().toggleHeaderRow(),
	},
	{
		button: ToolbarButton.TOGGLE_HEADER_CELL,
		icon: TableIcon,
		labelKey: "toggleHeaderCell",
		action: editor => editor?.chain().focus().toggleHeaderCell().run(),
		isActive: () => false,
		isDisabled: editor => !editor?.can().toggleHeaderCell(),
	},
	{
		button: ToolbarButton.HORIZONTAL_RULE,
		icon: Minus,
		labelKey: "horizontalRule",
		action: editor => editor?.chain().focus().setHorizontalRule().run(),
		isActive: () => false,
	},
];

/**
 * TiptapEdit - A rich text editor component based on Tiptap
 *
 * @example
 * ```tsx
 * <TiptapEdit
 *   content="<p>Hello world</p>"
 *   onChange={(html) => console.log(html)}
 *   showToolbar={true}
 *   toolbarButtons={[ToolbarButton.BOLD, ToolbarButton.ITALIC]}
 *   tableBorderColor="#000000"
 *   tableBorderWidth={2}
 * />
 * ```
 */
export const TiptapEdit = forwardRef<TiptapEditRef, TiptapEditProps>(
	(
		{
			content = "",
			contentType = "html",
			onChange,
			onChangeMarkdown,
			showToolbar = true,
			toolbarButtons = DEFAULT_TOOLBAR_BUTTONS,
			placeholder,
			editable = true,
			className,
			editorClassName,
			tableBorderColor = "#000000",
			tableBorderWidth = 2,
			showViewToggle = false,
			viewMode = "article",
			onViewModeChange,
			showDragHandle = false,
			onImageButtonClick,
			sectionChanges,
			sectionAnnotations,
			draftId,
			onApplySectionChange,
			onDismissSectionChange,
			showSuggestions = false,
			narrowContent = false,
			showFloatingToolbar = false,
			collapsibleToolbar = false,
			toolbarCollapsed = false,
			onToolbarCollapsedChange,
		},
		ref,
	) => {
		const i18n = useIntlayer("tiptap-edit");
		const [, forceUpdate] = useReducer(x => x + 1, 0);

		const isInternalChangeRef = useRef(false);
		const lastExternalContentRef = useRef<string | undefined>(undefined);
		const editorInitializedRef = useRef(false);
		// Track showSuggestions for use in onUpdate callback (which captures closure at mount)
		const showSuggestionsRef = useRef(showSuggestions);

		// Initial content for useEditor (only used on first render)
		const initialContent = useMemo(() => {
			const rawContent = content || "";
			// For markdown content, ensure images have proper paragraph separation
			if (contentType === "markdown") {
				return ensureImageParagraphs(rawContent);
			}
			return rawContent;
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []); // Only compute once on mount

		const debouncedOnChangeMarkdown = useMemo(
			() =>
				debounce((markdown: string) => {
					// Re-arm the internal change flag so the content sync effect
					// recognises the upcoming prop update as an internal edit and
					// skips calling setContent() (which would reset the cursor).
					isInternalChangeRef.current = true;
					lastExternalContentRef.current = markdown;
					onChangeMarkdown?.(markdown);
				}, 100),
			[onChangeMarkdown],
		);

		// Ref wrapper so the useEditor onUpdate closure (captured once at creation)
		// always calls the latest debounce instance, and cancel() targets the right one.
		const debouncedOnChangeMarkdownRef = useRef(debouncedOnChangeMarkdown);
		debouncedOnChangeMarkdownRef.current = debouncedOnChangeMarkdown;

		useEffect(() => {
			return () => {
				debouncedOnChangeMarkdown.cancel();
			};
		}, [debouncedOnChangeMarkdown]);

		useEffect(() => {
			if (showSuggestions) {
				showSuggestionsRef.current = true;
				debouncedOnChangeMarkdownRef.current.cancel();
			}
			// When showSuggestions becomes false, the ref is set in the suggestion
			// management effect (after removeAllSectionSuggestions) to avoid a race
			// where onUpdate serializes markdown while suggestion artifacts still exist.
		}, [showSuggestions]);

		const editor = useEditor({
			extensions: [
				Document,
				Paragraph,
				Text,
				BoldExtension,
				ItalicExtension,
				UnderlineExtension,
				StrikeExtension,
				CodeExtension,
				Heading.configure({ levels: [1, 2, 3, 4] }),
				TextAlign.configure({ types: ["heading", "paragraph"] }),
				Blockquote.configure({ HTMLAttributes: { class: "blockquote" } }),
				BulletList.configure({ keepMarks: true, keepAttributes: false }),
				OrderedList.configure({ keepMarks: true, keepAttributes: false }),
				ListItem,
				ListKeymap,
				HardBreak,
				HorizontalRule,
				Dropcursor,
				Gapcursor,
				TrailingNode,
				UndoRedo,
				CodeBlockExtension.configure({
					lowlight,
					defaultLanguage: "plaintext",
					exitOnTripleEnter: false,
					exitOnArrowDown: false,
					HTMLAttributes: {
						class: "code-block-lowlight",
					},
				}),
				Highlight.configure({
					multicolor: false,
					HTMLAttributes: {
						class: "highlight",
					},
				}),
				Table.configure({
					resizable: true,
				}),
				TableRow,
				TableHeader,
				TableCell,
				ResizableImageExtension.configure({
					allowBase64: false,
					HTMLAttributes: {
						class: "tiptap-image",
					},
				}),
				Link.configure({
					autolink: true,
					linkOnPaste: true,
					openOnClick: false,
					protocols: ["http", "https", "mailto"],
					HTMLAttributes: {
						class: "tiptap-link",
						rel: "noopener noreferrer",
					},
				}),
				Markdown,
				MarkdownPasteExtension,
				SectionSuggestionExtension,
				HiddenSectionExtension,
				ArticleLinkExtension,
				ArticleLinkNode,
			],
			content: initialContent,
			...(contentType === "markdown" && { contentType: "markdown" as const }),
			editable,
			onUpdate: ({ editor }) => {
				isInternalChangeRef.current = true;
				const html = editor.getHTML();
				onChange?.(html);
				// Skip onChangeMarkdown when suggestions are shown to prevent the markdown
				// (which doesn't include suggestion nodes) from overwriting the content
				// and causing the suggestion nodes to be removed during content sync.
				if (!showSuggestionsRef.current) {
					/* v8 ignore next - ?? html fallback; getMarkdown is always present in the mocked editor */
					// getMarkdown is added by @tiptap/markdown but not declared in the Editor type
					const markdown = (editor as unknown as { getMarkdown?: () => string }).getMarkdown?.() ?? html;
					debouncedOnChangeMarkdownRef.current(markdown);
				}
			},
			/* v8 ignore next 3 - internal Tiptap callback, called during editor selection changes */
			onSelectionUpdate: () => {
				forceUpdate();
			},
			editorProps: {
				attributes: {
					class: cn("ProseMirror focus:outline-none h-full py-2", editorClassName),
					...(placeholder && { "data-placeholder": placeholder }),
				},
				/* v8 ignore start - ProseMirror handleKeyDown requires real editor state, tested via E2E */
				handleKeyDown: (view, event) => {
					if (event.key === "Backspace" && event.shiftKey && (event.metaKey || event.ctrlKey)) {
						return handleForceDeleteKey(view);
					}
					if (event.key === "Backspace") {
						return handleBackspaceKey(view);
					}
					if (event.key === "ArrowRight" || event.key === "ArrowDown") {
						return handleArrowForward(view, event.key === "ArrowRight" ? "right" : "down");
					}
					if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
						return handleArrowBackward(view, event.key === "ArrowLeft" ? "left" : "up");
					}
					return false;
				},
				/* v8 ignore stop */
			},
		});

		// Expose insertImage method through ref
		useImperativeHandle(
			ref,
			() => ({
				insertImage: (src: string, alt?: string) => {
					if (editor) {
						editor
							.chain()
							.focus()
							.setImage({ src, alt: alt || "" })
							.run();
					}
				},
				getEditorElement: () => (editor?.view?.dom as HTMLElement | null) ?? null,
			}),
			[editor],
		);

		useEffect(() => {
			if (editor && content !== undefined) {
				// Skip if this is an internal change (from editor itself)
				if (isInternalChangeRef.current) {
					isInternalChangeRef.current = false;

					// Check if content prop actually changed from what we last saw.
					// If unchanged, it means we're still waiting for the debounced callback
					// to update it - skip sync to avoid overwriting with stale content.
					// If changed, it means external source updated content (like API call
					// after accepting a suggestion) - continue to sync.
					if (content === lastExternalContentRef.current) {
						return;
					}
					// Fall through to sync logic if content changed externally
				}

				const currentHtml = editor.getHTML();

				// Force sync on first editor initialization, or when content changes
				const isFirstInit = !editorInitializedRef.current;
				const contentChanged = content !== lastExternalContentRef.current;

				if (!isFirstInit && !contentChanged) {
					return;
				}

				// Skip if content matches current HTML (already synced)
				if (!isFirstInit && content === currentHtml) {
					lastExternalContentRef.current = content;
					return;
				}

				// Mark editor as initialized and update ref
				editorInitializedRef.current = true;
				lastExternalContentRef.current = content;

				const isHtml = content.trim().startsWith("<");
				if (contentType === "markdown" && !isHtml) {
					try {
						// Ensure images have proper paragraph separation before parsing
						const processedContent = ensureImageParagraphs(content);
						editor.commands.setContent(processedContent, { contentType: "markdown" });
					} catch (error) {
						/* v8 ignore next 2 - fallback when markdown parsing fails, hard to test with mocked editor */
						log.error(error, "Failed to parse Markdown content, falling back to HTML");
						editor.commands.setContent(content);
					}
				} else {
					/* v8 ignore next - HTML content path, tested indirectly via Tiptap editor mock */
					editor.commands.setContent(content);
				}

				// Clear undo history after external content changes (e.g. mode switch)
				// so undo won't revert past the initial Article mode state.
				clearEditorHistory(editor);
			}
		}, [content, editor, contentType]);

		useEffect(() => {
			if (editor) {
				editor.setEditable(editable);
			}
		}, [editable, editor]);

		useEffect(() => {
			if (!editor) {
				return;
			}
			const storage = (editor.storage as unknown as Record<string, SectionSuggestionStorage | undefined>)
				.sectionSuggestion;
			if (storage) {
				storage.onApply = onApplySectionChange ?? null;
				storage.onDismiss = onDismissSectionChange ?? null;
			}
		}, [editor, onApplySectionChange, onDismissSectionChange]);

		useEffect(() => {
			if (!editor || editor.isDestroyed || !sectionChanges) {
				return;
			}

			if (!showSuggestions) {
				// Keep showSuggestionsRef true during removal so onUpdate skips
				// markdown serialization (avoids persisting empty-paragraph artifacts).
				// The ref gets set to false after the synchronous transaction completes.
				editor.commands.removeAllSectionSuggestions();
				showSuggestionsRef.current = false;
				return;
			}

			const existingChangeIds = getExistingSuggestionIds(editor);
			const activeChanges = sectionChanges.filter(c => !c.applied && !c.dismissed);
			const activeChangeIds = new Set(activeChanges.map(c => c.id));

			const staleIds = [...existingChangeIds].filter(id => !activeChangeIds.has(id));
			/* v8 ignore start - stale suggestion removal requires pre-existing nodes in the editor; covered by E2E tests */
			if (staleIds.length > 0) {
				for (const id of staleIds) {
					editor.commands.removeSectionSuggestion(id);
				}
			}
			/* v8 ignore stop */

			let hasNewInsertions = false;

			for (const change of activeChanges) {
				if (existingChangeIds.has(change.id)) {
					continue;
				}

				const latestProposal = change.proposed[change.proposed.length - 1];
				const annotation = sectionAnnotations?.find(a => a.path === change.path);
				const insertPos = annotation
					? change.changeType === "insert-after"
						? findPositionAfterSection(editor, annotation.title)
						: findPositionForHeading(editor, annotation.title)
					: null;

				hasNewInsertions = true;
				editor
					.chain()
					.insertContentAt(insertPos ?? editor.state.doc.content.size, {
						type: "sectionSuggestion",
						attrs: {
							changeId: change.id,
							/* v8 ignore next - ?? 0 fallback; draftId is always provided when suggestions are shown */
							draftId: draftId ?? 0,
							sectionPath: change.path,
							sectionTitle: annotation?.title ?? null,
							originalContent: change.content,
							/* v8 ignore next 3 - ?? "" fallbacks; latestProposal fields are always present for active changes */
							suggestedContent: latestProposal?.value ?? "",
							changeType: change.changeType,
							description: latestProposal?.description ?? "",
						},
					})
					.run();
			}

			if (hasNewInsertions && !editor.isDestroyed) {
				/* v8 ignore next 4 - catch is defensive; editor.view.dom is always accessible in unit tests */
				try {
					scrollToFirstSuggestion(editor.view.dom);
				} catch {
					// Editor view may not be mounted yet; skip scrolling
				}
			}
		}, [editor, sectionChanges, sectionAnnotations, draftId, showSuggestions]);

		useEffect(() => {
			if (!editor || editor.isDestroyed) {
				return;
			}

			const storage = (editor.storage as unknown as Record<string, HiddenSectionStorage | undefined>)
				.hiddenSection;
			if (!storage) {
				return;
			}

			if (!showSuggestions || !sectionChanges || !sectionAnnotations) {
				storage.hiddenRanges = [];
				editor.view.dispatch(editor.state.tr);
				return;
			}

			const activeChanges = sectionChanges.filter(c => !c.applied && !c.dismissed);
			const hiddenRanges: Array<HiddenRange> = [];

			for (const change of activeChanges) {
				if (change.changeType === "insert-before" || change.changeType === "insert-after") {
					continue;
				}
				const annotation = sectionAnnotations.find(a => a.path === change.path);
				if (annotation) {
					hiddenRanges.push({
						title: annotation.title,
					});
				}
			}

			storage.hiddenRanges = hiddenRanges;
			editor.view.dispatch(editor.state.tr);
		}, [editor, showSuggestions, sectionChanges, sectionAnnotations]);

		const renderToolbarButton = (config: ToolbarButtonConfig) => {
			/* v8 ignore next 3 - editor null check is defensive, useEditor mock always returns editor */
			if (!editor) {
				return null;
			}

			// Intlayer toolbar types need to be regenerated after adding new toolbar keys
			const label =
				(i18n.toolbar as unknown as Record<string, { value: string }>)[config.labelKey]?.value ??
				config.labelKey;

			const wrappedConfig: ToolbarButtonConfig = {
				...config,
				isDisabled: editor => {
					if (viewMode === "markdown") {
						return true;
					}
					return config.isDisabled?.(editor) ?? false;
				},
			};

			// Override image button action if callback is provided
			if (config.button === ToolbarButton.IMAGE && onImageButtonClick) {
				wrappedConfig.action = () => {
					onImageButtonClick();
				};
			}

			return <ToolbarButtonComponent key={config.button} config={wrappedConfig} editor={editor} label={label} />;
		};

		/** Safely reads an i18n toolbar label, falling back to the key name if the dictionary hasn't been regenerated yet. */
		function toolbarLabel(key: string): string {
			const entry = (i18n.toolbar as Record<string, { value?: string } | undefined>)[key];
			return entry?.value ?? key;
		}

		/** Returns the icon component for the currently active heading level, or Pilcrow for paragraph. */
		function getActiveHeadingIcon(): ComponentType<{ className?: string }> {
			if (editor?.isActive("heading", { level: 1 })) {
				return Heading1;
			}
			if (editor?.isActive("heading", { level: 2 })) {
				return Heading2;
			}
			if (editor?.isActive("heading", { level: 3 })) {
				return Heading3;
			}
			if (editor?.isActive("heading", { level: 4 })) {
				return Heading4;
			}
			return Pilcrow;
		}

		/** Returns the icon component for the currently active text alignment. */
		function getActiveAlignIcon(): ComponentType<{ className?: string }> {
			if (editor?.isActive({ textAlign: "center" })) {
				return AlignCenter;
			}
			if (editor?.isActive({ textAlign: "right" })) {
				return AlignRight;
			}
			return AlignLeft;
		}

		/** Shared renderer for heading/align style dropdowns that follow the same structure. */
		function renderToolbarDropdown(
			activeEditor: NonNullable<typeof editor>,
			ActiveIcon: ComponentType<{ className?: string }>,
			items: Array<{ button: ToolbarButton; icon: ComponentType<{ className?: string }>; label: string }>,
			testIdPrefix: string,
		): ReactNode {
			const visibleItems = items.filter(item => toolbarButtons.includes(item.button));
			if (visibleItems.length === 0) {
				return null;
			}
			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
							data-testid={`${testIdPrefix}-dropdown`}
						>
							<ActiveIcon className="h-4 w-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{visibleItems.map(item => {
							const ItemIcon = item.icon;
							const config = TOOLBAR_CONFIG.find(c => c.button === item.button);
							/* v8 ignore next - ?? false fallback; all items have entries in TOOLBAR_CONFIG */
							const isActive = config?.isActive(activeEditor) ?? false;
							return (
								<DropdownMenuItem
									key={item.button}
									onSelect={() => config?.action(activeEditor)}
									className={isActive ? "bg-accent font-medium" : ""}
									data-testid={`${testIdPrefix}-item-${item.button}`}
								>
									<ItemIcon className="h-4 w-4 mr-2" />
									{item.label}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			);
		}

		/** Heading dropdown — H1-H4 + Paragraph */
		function renderHeadingDropdown() {
			/* v8 ignore next 3 - defensive null guard; renderToolbarGroups already ensures editor is non-null */
			if (!editor) {
				return null;
			}
			return renderToolbarDropdown(
				editor,
				getActiveHeadingIcon(),
				[
					{ button: ToolbarButton.HEADING_1, icon: Heading1, label: toolbarLabel("heading1") },
					{ button: ToolbarButton.HEADING_2, icon: Heading2, label: toolbarLabel("heading2") },
					{ button: ToolbarButton.HEADING_3, icon: Heading3, label: toolbarLabel("heading3") },
					{ button: ToolbarButton.HEADING_4, icon: Heading4, label: toolbarLabel("heading4") },
					{ button: ToolbarButton.PARAGRAPH, icon: Pilcrow, label: toolbarLabel("paragraph") },
				],
				"heading",
			);
		}

		/** Alignment dropdown — Left, Center, Right */
		function renderAlignDropdown() {
			/* v8 ignore next 3 - defensive null guard; renderToolbarGroups already ensures editor is non-null */
			if (!editor) {
				return null;
			}
			return renderToolbarDropdown(
				editor,
				getActiveAlignIcon(),
				[
					{ button: ToolbarButton.ALIGN_LEFT, icon: AlignLeft, label: toolbarLabel("alignLeft") },
					{ button: ToolbarButton.ALIGN_CENTER, icon: AlignCenter, label: toolbarLabel("alignCenter") },
					{ button: ToolbarButton.ALIGN_RIGHT, icon: AlignRight, label: toolbarLabel("alignRight") },
				],
				"align",
			);
		}

		/** "More" overflow dropdown — less-common formatting options */
		function renderMoreDropdown() {
			/* v8 ignore next 3 - defensive null guard; renderToolbarGroups already ensures editor is non-null */
			if (!editor) {
				return null;
			}
			const items = [
				ToolbarButton.CODE,
				ToolbarButton.CODE_BLOCK,
				ToolbarButton.HIGHLIGHT,
				ToolbarButton.INSERT_TABLE,
				ToolbarButton.HORIZONTAL_RULE,
			]
				.filter(button => toolbarButtons.includes(button))
				.map(button => TOOLBAR_CONFIG.find(c => c.button === button))
				.filter((config): config is ToolbarButtonConfig => config !== undefined);

			if (items.length === 0) {
				return null;
			}
			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
							title={toolbarLabel("more")}
							aria-label={toolbarLabel("more")}
							data-testid="more-dropdown"
						>
							<Ellipsis className="h-4 w-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{items.map(config => {
							const Icon = config.icon;
							const label = toolbarLabel(config.labelKey);
							return (
								<DropdownMenuItem
									key={config.button}
									onSelect={() => config.action(editor)}
									data-testid={`more-item-${config.button}`}
								>
									<Icon className="h-4 w-4 mr-2" />
									{label}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			);
		}

		/** Dropdown renderers keyed by segment id */
		const dropdownRenderers: Record<string, () => ReactNode> = {
			heading: renderHeadingDropdown,
			align: renderAlignDropdown,
			more: renderMoreDropdown,
		};

		const renderToolbarGroups = () => {
			if (!editor) {
				return null;
			}

			const allSegmentButtons = TOOLBAR_SEGMENTS.flatMap(s => s.buttons);
			const ungroupedButtons = toolbarButtons
				.filter(button => !allSegmentButtons.includes(button))
				.map(button => TOOLBAR_CONFIG.find(config => config.button === button))
				.filter((config): config is ToolbarButtonConfig => config !== undefined);

			let renderedCount = 0;
			const segmentElements = TOOLBAR_SEGMENTS.map((segment, segmentIndex) => {
				if (segment.type === "dropdown") {
					const hasAny = segment.buttons.some(b => toolbarButtons.includes(b));
					if (!hasAny) {
						return null;
					}
					const renderer = dropdownRenderers[segment.id];
					if (!renderer) {
						return null;
					}
					const el = renderer();
					if (!el) {
						return null;
					}
					renderedCount++;
					return (
						<Fragment key={segmentIndex}>
							{renderedCount > 1 && <Separator orientation="vertical" className="h-6 mx-1" />}
							{el}
						</Fragment>
					);
				}

				// Direct buttons segment
				const groupButtons = segment.buttons
					.filter(button => toolbarButtons.includes(button))
					.map(button => TOOLBAR_CONFIG.find(config => config.button === button))
					.filter((config): config is ToolbarButtonConfig => config !== undefined);

				if (groupButtons.length === 0) {
					return null;
				}
				renderedCount++;

				return (
					<Fragment key={segmentIndex}>
						{renderedCount > 1 && <Separator orientation="vertical" className="h-6 mx-1" />}
						<div className="flex items-center gap-0.5">{groupButtons.map(renderToolbarButton)}</div>
					</Fragment>
				);
			});

			return (
				<>
					{segmentElements}
					{ungroupedButtons.length > 0 && (
						<>
							{renderedCount > 0 && <Separator orientation="vertical" className="h-6 mx-1" />}
							<div className="flex items-center gap-0.5">{ungroupedButtons.map(renderToolbarButton)}</div>
						</>
					)}
				</>
			);
		};

		// Read article link plugin state directly during render
		const articleLinkState: ArticleLinkPluginState = editor
			? (ArticleLinkPluginKey.getState(editor.state) ?? {
					active: false,
					query: "",
					range: null,
					invalidatedFrom: null,
				})
			: { active: false, query: "", range: null, invalidatedFrom: null };

		// Track whether the menu was dismissed by clicking outside.
		// Resets when the trigger range changes (user types new [[).
		const articleLinkDismissedRef = useRef(false);
		const articleLinkRangeRef = useRef<{ from: number; to: number } | null>(null);

		/* v8 ignore next 4 -- article link menu state, requires full editor to test */
		if (articleLinkState.range?.from !== articleLinkRangeRef.current?.from) {
			articleLinkDismissedRef.current = false;
		}
		articleLinkRangeRef.current = articleLinkState.range;

		const articleLinkMenuVisible = articleLinkState.active && !articleLinkDismissedRef.current;

		/* v8 ignore start -- article link callbacks, requires full editor to test */
		const handleArticleLinkClose = useCallback(() => {
			articleLinkDismissedRef.current = true;
			forceUpdate();
		}, [forceUpdate]);

		const handleArticleLinkSelect = useCallback(
			(result: ArticleLinkSearchResult) => {
				if (!editor || !articleLinkRangeRef.current) {
					return;
				}
				const { from, to } = articleLinkRangeRef.current;
				const title = result.contentMetadata?.title || result.slug.replace(/-/g, " ");

				editor
					.chain()
					.focus()
					.deleteRange({ from, to })
					.insertContent({
						type: "articleLink",
						attrs: { jrn: result.jrn, title },
					})
					.run();

				articleLinkDismissedRef.current = true;
				forceUpdate();
			},
			[editor, forceUpdate],
		);
		/* v8 ignore stop */

		return (
			<TooltipProvider delayDuration={0} skipDelayDuration={300}>
				<div
					className={cn("flex flex-grow flex-col overflow-hidden", className)}
					style={
						{
							"--table-border-color": tableBorderColor,
							"--table-border-width": `${tableBorderWidth}px`,
						} as CSSProperties
					}
				>
					{showToolbar && (
						<div
							className={cn(
								"flex-shrink-0",
								collapsibleToolbar ? "px-2 py-1.5" : "px-4 py-2 bg-card/30 border-b border-border",
							)}
							style={collapsibleToolbar ? { minHeight: 42 } : undefined}
							data-testid="tiptap-toolbar"
						>
							{collapsibleToolbar && toolbarCollapsed ? (
								/* Collapsed: thin bar with hover-reveal expand button */
								<div className="flex items-center justify-center h-full group">
									<button
										type="button"
										onClick={() => onToolbarCollapsedChange?.(false)}
										className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground rounded-md border border-transparent hover:border-border hover:bg-muted transition-all opacity-0 group-hover:opacity-100"
										data-testid="toolbar-expand-button"
									>
										<ChevronDown className="h-3.5 w-3.5" />
										{i18n.showToolbar.value}
									</button>
								</div>
							) : (
								/* Expanded: standard or pill-styled toolbar */
								<div
									className={cn(
										"flex items-center",
										collapsibleToolbar
											? "mx-auto w-fit rounded-lg border border-border bg-muted shadow-sm px-2 py-0.5"
											: "justify-between",
									)}
								>
									<div className="flex items-center gap-1">
										{renderToolbarGroups()}
										{showViewToggle && (
											<>
												<Separator orientation="vertical" className="h-6 mx-1" />
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<button
															type="button"
															className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
															data-testid="view-mode-dropdown"
														>
															{viewMode === "markdown" ? (
																<Hash className="h-4 w-4" />
															) : viewMode === "brain" ? (
																<BrainIcon className="h-4 w-4" />
															) : (
																<FileText className="h-4 w-4" />
															)}
														</button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onSelect={() => onViewModeChange?.("article")}
															data-testid="view-mode-article"
														>
															<FileText className="h-4 w-4 mr-2" />
															{i18n.viewMode.article.value}
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={() => {
																if (editor) {
																	// Cast to access getMarkdown which is not in the public Editor type
																	const editorWithMarkdown = editor as unknown as {
																		getMarkdown?: () => string;
																	};
																	const markdown = (
																		editorWithMarkdown.getMarkdown?.() ??
																		editor.getHTML()
																	)
																		.replace(/&nbsp;/g, " ")
																		.replace(/&amp;/g, "&")
																		.replace(/&lt;/g, "<")
																		.replace(/&gt;/g, ">")
																		.replace(/&quot;/g, '"')
																		.replace(/&#39;/g, "'");
																	onViewModeChange?.("markdown", markdown);
																} else {
																	onViewModeChange?.("markdown");
																}
															}}
															data-testid="view-mode-markdown"
														>
															<Hash className="h-4 w-4 mr-2" />
															{i18n.viewMode.markdown.value}
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={() => onViewModeChange?.("brain")}
															data-testid="view-mode-brain"
														>
															<BrainIcon className="h-4 w-4 mr-2" />
															{i18n.viewMode.brain.value}
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</>
										)}
										{collapsibleToolbar && (
											<>
												<Separator orientation="vertical" className="h-6 mx-1" />
												<button
													type="button"
													onClick={() => onToolbarCollapsedChange?.(true)}
													title={i18n.collapseToolbar.value}
													aria-label={i18n.collapseToolbar.value}
													className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
													data-testid="toolbar-collapse-button"
												>
													<ChevronUp className="h-4 w-4" />
												</button>
											</>
										)}
									</div>
								</div>
							)}
						</div>
					)}
					<div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin bg-background">
						<div className={cn("relative", narrowContent && "max-w-3xl mx-auto")}>
							<EditorContent editor={editor} className={cn("min-h-[600px] h-full", "bg-background")} />
							{showDragHandle && editor && editable && (
								<Suspense fallback={null}>
									<LazyDragHandleMenu editor={editor} />
								</Suspense>
							)}
							{showFloatingToolbar && editor && editable && (
								<Suspense fallback={null}>
									<LazyFloatingToolbar editor={editor} />
								</Suspense>
							)}
							{/* v8 ignore next 9 -- article link menu rendering */}
							{editor && articleLinkMenuVisible && (
								<ArticleLinkMenu
									editor={editor}
									active={articleLinkMenuVisible}
									query={articleLinkState.query}
									onClose={handleArticleLinkClose}
									onSelect={handleArticleLinkSelect}
								/>
							)}
						</div>
					</div>
				</div>
			</TooltipProvider>
		);
	},
);

TiptapEdit.displayName = "TiptapEdit";
