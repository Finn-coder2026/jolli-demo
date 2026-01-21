import { cn } from "../../common/ClassNameUtils";
import type { AutocompleteContext, AutocompleteSuggestion } from "./autocomplete";
import styles from "./NumberEdit.module.css";
import {
	type ClipboardEvent,
	forwardRef,
	type KeyboardEvent,
	type ReactElement,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

/**
 * Line decoration for showing errors/warnings on specific lines
 */
export interface LineDecoration {
	/** 1-based line number */
	line: number;
	/** Type of decoration - affects color (error=red, warning=blue) */
	type: "error" | "warning";
	/** Message to show on hover or in tooltip */
	message?: string;
}

export interface NumberEditProps {
	/** The text content to display/edit */
	value: string;
	/** Callback when content changes */
	onChange?: (value: string) => void;
	/** Whether the editor is read-only */
	readOnly?: boolean;
	/** Additional CSS classes for the wrapper */
	className?: string;
	/** Line numbers to highlight (1-based) */
	highlightedLines?: Array<number>;
	/** Line decorations for errors/warnings with wavy underlines */
	lineDecorations?: Array<LineDecoration>;
	/** Callback when a line number is clicked in the gutter */
	onLineClick?: (lineNumber: number) => void;
	/** Line height in pixels (default: 20) */
	lineHeight?: number;
	/** Font size in pixels (default: 14) */
	fontSize?: number;
	/** Number of spaces for tab (default: 4) */
	tabSize?: number;
	/** Autocomplete context provider for suggestions */
	autocompleteContext?: AutocompleteContext | undefined;
	/** data-testid for testing */
	"data-testid"?: string;
}

export interface NumberEditRef {
	/** Focus the editor */
	focus: () => void;
	/** Scroll to a specific line (1-based) */
	scrollToLine: (lineNumber: number) => void;
	/** Get the editor DOM element */
	getEditorElement: () => HTMLDivElement | null;
	/** Select a specific line (1-based) */
	selectLine: (lineNumber: number) => void;
	/** Select all content in the editor */
	selectAll: () => void;
	/** Insert text at the current cursor position */
	insertTextAtCursor: (text: string) => void;
	/** Get the current/last known cursor position (useful for saving before focus loss) */
	getCursorPosition: () => number;
}

/**
 * A line number editor component with gutter, scrollable edit area, and line highlighting.
 * Converted from the NumberEdit JavaScript library to TypeScript React.
 */
export const NumberEdit = forwardRef<NumberEditRef, NumberEditProps>(function NumberEdit(
	{
		value,
		onChange,
		readOnly = false,
		className,
		highlightedLines = [],
		lineDecorations = [],
		onLineClick,
		lineHeight = 20,
		fontSize = 14,
		tabSize = 4,
		autocompleteContext,
		"data-testid": testId,
	},
	ref,
): ReactElement {
	const editorRef = useRef<HTMLDivElement>(null);
	const editorContainerRef = useRef<HTMLDivElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);
	const ghostTextRef = useRef<HTMLSpanElement>(null);
	const [isDarkMode, setIsDarkMode] = useState(false);
	const [currentSuggestion, setCurrentSuggestion] = useState<AutocompleteSuggestion | null>(null);
	const [ghostTextPosition, setGhostTextPosition] = useState<{ top: number; left: number } | null>(null);
	// Flag to skip suggestion update after accepting a suggestion (prevents ghost text residue)
	const justAcceptedRef = useRef(false);
	// Flag to track when user dismissed suggestion with Escape (prevents ghost text from reappearing)
	// Track last cursor position for insertTextAtCursor when focus is lost
	// Initialize to -1 to detect if cursor was never set (vs explicitly at position 0)
	const lastCursorPositionRef = useRef<number>(-1);
	const dismissedRef = useRef(false);

	// Parse lines from value - compute directly for synchronous rendering
	const lines = value ? value.split("\n") : [""];

	// Detect dark mode from the document
	useEffect(() => {
		const checkDarkMode = () => {
			const isDark = document.documentElement.classList.contains("dark");
			setIsDarkMode(isDark);
		};

		// Check initially
		checkDarkMode();

		// Watch for changes to the class attribute
		const observer = new MutationObserver(checkDarkMode);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => observer.disconnect();
	}, []);

	// Sync scroll between gutter and editor
	const handleScroll = useCallback(() => {
		if (editorContainerRef.current && gutterRef.current) {
			gutterRef.current.scrollTop = editorContainerRef.current.scrollTop;
		}
	}, []);

	/**
	 * Count characters in a text node up to a specified offset, excluding zero-width spaces.
	 */
	/* v8 ignore next 9 - internal helper called from getCursorPositionForInnerText, tested indirectly */
	const countTextCharsUpToOffset = useCallback((text: string, maxOffset: number): number => {
		let count = 0;
		for (let i = 0; i < maxOffset && i < text.length; i++) {
			if (text[i] !== "\u200B") {
				count++;
			}
		}
		return count;
	}, []);

	/**
	 * Count all non-zero-width-space characters in a text string.
	 */
	const countTextChars = useCallback((text: string): number => {
		let count = 0;
		for (const char of text) {
			if (char !== "\u200B") {
				count++;
			}
		}
		return count;
	}, []);

	/**
	 * Get cursor position by walking the DOM and counting characters the same way innerText does.
	 * This is necessary because innerText collapses sequences and inserts newlines for block elements,
	 * while Range.toString() does not.
	 */
	const getCursorPositionForInnerText = useCallback((): number => {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !editorRef.current) {
			return 0;
		}

		const range = selection.getRangeAt(0);
		const cursorContainer = range.startContainer;
		const cursorOffset = range.startOffset;

		let position = 0;
		let foundCursor = false;
		let hasContent = false;

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: DOM cursor position tracking requires nested conditionals for different node types
		function handleCursorNode(node: Node): void {
			if (node.nodeType === Node.TEXT_NODE) {
				position += countTextCharsUpToOffset(node.textContent || "", cursorOffset);
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				// Cursor is directly in an element (e.g., empty div after Enter)
				// Check if this is the editor element itself (cursor at root level)
				if (node === editorRef.current) {
					// Cursor is directly in the editor - count children up to cursorOffset
					const children = Array.from(node.childNodes);
					/* v8 ignore start - cursor at editor root level, children iteration tested indirectly */
					for (let i = 0; i < cursorOffset && i < children.length; i++) {
						const child = children[i];
						if (child.nodeType === Node.TEXT_NODE) {
							position += countTextChars(child.textContent || "");
						} else if (child.nodeType === Node.ELEMENT_NODE) {
							const el = child as Element;
							if (el.tagName.toLowerCase() === "br") {
								position++;
							} else {
								// For divs, count content + newline
								position += countTextChars(el.textContent || "");
								if (i > 0 || hasContent) {
									position++; // newline for the div
								}
							}
						}
					}
					/* v8 ignore stop */
				} else {
					// Cursor is inside a child element (e.g., a div for a line)
					// Count children within this element up to cursorOffset
					const children = Array.from(node.childNodes);
					for (let i = 0; i < cursorOffset && i < children.length; i++) {
						const child = children[i];
						if (child.nodeType === Node.TEXT_NODE) {
							position += countTextChars(child.textContent || "");
						} else if (child.nodeType === Node.ELEMENT_NODE) {
							const el = child as Element;
							if (el.tagName.toLowerCase() === "br") {
								position++;
							} else {
								position += countTextChars(el.textContent || "");
							}
						}
					}
				}
			}
			foundCursor = true;
		}

		function handleTextNode(node: Node): void {
			const charCount = countTextChars(node.textContent || "");
			if (charCount > 0) {
				position += charCount;
				hasContent = true;
			}
		}

		/* v8 ignore next 4 - internal helper for BR elements in getCursorPositionForInnerText */
		function handleBrElement(): void {
			position++;
			hasContent = true;
		}

		function handleDivElement(element: Element): void {
			// Only count a div as a newline if:
			// 1. We've seen content before (hasContent)
			// 2. The div is a direct child of the editor (not nested inside another div)
			// This prevents nested divs from being counted as extra newlines
			if (hasContent && element.parentElement === editorRef.current) {
				position++;
			}
		}

		function walkNode(node: Node): boolean {
			/* v8 ignore start -- defensive guard: foundCursor triggers immediate return, re-entry not possible */
			if (foundCursor) {
				return true;
			}
			/* v8 ignore stop */

			if (node === cursorContainer) {
				handleCursorNode(node);
				return true;
			}

			if (node.nodeType === Node.TEXT_NODE) {
				handleTextNode(node);
				return false;
			}

			if (node.nodeType === Node.ELEMENT_NODE) {
				const element = node as Element;
				const tagName = element.tagName.toLowerCase();

				/* v8 ignore next 4 - BR element handling in DOM walking, tested indirectly */
				if (tagName === "br") {
					handleBrElement();
					return false;
				}

				if (tagName === "div") {
					handleDivElement(element);
				}

				for (const child of Array.from(node.childNodes)) {
					if (walkNode(child)) {
						return true;
					}
				}
			}

			return false;
		}

		// First check if cursor is directly in the editor root (not in a child)
		if (cursorContainer === editorRef.current) {
			handleCursorNode(cursorContainer);
		} else {
			for (const child of Array.from(editorRef.current.childNodes)) {
				if (walkNode(child)) {
					break;
				}
			}
		}

		return position;
	}, [countTextCharsUpToOffset, countTextChars]);

	/**
	 * Get the visual position for ghost text using the browser's Selection API.
	 * This gets the actual pixel position of the cursor, which is more reliable
	 * than calculating from line numbers.
	 */
	const getCursorVisualPosition = useCallback((): { top: number; left: number } | null => {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !editorContainerRef.current) {
			return null;
		}

		const range = selection.getRangeAt(0);
		const containerRect = editorContainerRef.current.getBoundingClientRect();
		const scrollTop = editorContainerRef.current.scrollTop;

		// Try to get position from the range's client rects
		const rects = range.getClientRects();
		if (rects.length > 0) {
			const rect = rects[0];
			return {
				top: rect.top - containerRect.top + scrollTop,
				left: rect.left - containerRect.left,
			};
		}

		// Fallback: use bounding rect (may be zero for empty positions)
		const boundingRect = range.getBoundingClientRect();
		if (boundingRect.width > 0 || boundingRect.height > 0) {
			return {
				top: boundingRect.top - containerRect.top + scrollTop,
				left: boundingRect.left - containerRect.left,
			};
		}

		// Last resort for empty lines: insert a temporary span to get position
		const span = document.createElement("span");
		span.textContent = "\u200B"; // zero-width space
		range.insertNode(span);
		const spanRect = span.getBoundingClientRect();
		const result = {
			top: spanRect.top - containerRect.top + scrollTop,
			left: spanRect.left - containerRect.left,
		};
		span.remove();
		// Restore selection
		selection.removeAllRanges();
		selection.addRange(range);
		return result;
	}, []);

	/**
	 * Get current line number from cursor position using the value prop.
	 * Calculates line number by counting newlines before the cursor offset.
	 * Note: Only called from updateSuggestion which validates editorRef.current first.
	 */
	const getCurrentLineNumber = useCallback((): number => {
		// Get cursor position from innerText-based calculation
		const cursorPos = getCursorPositionForInnerText();

		// Count newlines before cursor in value
		const textBeforeCursor = value.slice(0, cursorPos);
		return (textBeforeCursor.match(/\n/g) || []).length;
	}, [value, getCursorPositionForInnerText]);

	/**
	 * Update autocomplete suggestion based on current cursor position.
	 */
	const updateSuggestion = useCallback(() => {
		// Skip if we just accepted a suggestion (prevents ghost text residue from appearing)
		if (justAcceptedRef.current) {
			justAcceptedRef.current = false;
			return;
		}

		// Skip if user dismissed suggestion with Escape (until they type something new)
		if (dismissedRef.current) {
			return;
		}

		if (!autocompleteContext || readOnly || !editorRef.current) {
			setCurrentSuggestion(null);
			setGhostTextPosition(null);
			return;
		}

		const currentLineNumber = getCurrentLineNumber();

		// Get content and check if current line is empty
		const allLines = value.split("\n");
		const currentLineText = allLines[currentLineNumber] ?? "";

		// Don't show on lines with content
		if (currentLineText.trim()) {
			setCurrentSuggestion(null);
			setGhostTextPosition(null);
			return;
		}

		// Calculate cursor position for getSuggestion
		let cursorPos = 0;
		for (let i = 0; i < currentLineNumber; i++) {
			cursorPos += (allLines[i]?.length ?? 0) + 1; // +1 for newline
		}

		const suggestion = autocompleteContext.getSuggestion(value, cursorPos);

		if (suggestion) {
			const position = getCursorVisualPosition();
			if (position) {
				setCurrentSuggestion(suggestion);
				setGhostTextPosition(position);
			} else {
				setCurrentSuggestion(null);
				setGhostTextPosition(null);
			}
		} else {
			setCurrentSuggestion(null);
			setGhostTextPosition(null);
		}
	}, [autocompleteContext, readOnly, value, getCursorVisualPosition, getCurrentLineNumber]);

	/**
	 * Accept the current autocomplete suggestion.
	 */
	const acceptSuggestion = useCallback(() => {
		if (!currentSuggestion || !editorRef.current || !onChange) {
			return false;
		}

		// Set flag to skip the next suggestion update (prevents ghost text residue)
		justAcceptedRef.current = true;
		// Insert the suggestion text at cursor position
		document.execCommand("insertText", false, currentSuggestion.text);
		setCurrentSuggestion(null);
		setGhostTextPosition(null);
		return true;
	}, [currentSuggestion, onChange]);

	/**
	 * Dismiss the current autocomplete suggestion.
	 * Sets a flag to prevent ghost text from reappearing until user types something new.
	 */
	const dismissSuggestion = useCallback(() => {
		dismissedRef.current = true;
		setCurrentSuggestion(null);
		setGhostTextPosition(null);
	}, []);

	// Handle content input
	const handleInput = useCallback(() => {
		// Clear dismissed flag when user types (allow ghost text to appear again)
		dismissedRef.current = false;

		if (editorRef.current && onChange) {
			let content = editorRef.current.innerText;
			// Normalize all types of line endings to LF and remove zero-width spaces:
			// - CRLF (Windows)
			// - CR (old Mac)
			// - Unicode line separator (U+2028)
			// - Unicode paragraph separator (U+2029)
			// - Zero-width space (U+200B) left from cursor positioning
			content = content
				.replace(/\r\n/g, "\n")
				.replace(/\r/g, "\n")
				.replace(/\u2028/g, "\n")
				.replace(/\u2029/g, "\n")
				.replace(/\u200B/g, "");
			onChange(content);
		}
		// Save cursor position for insertTextAtCursor
		lastCursorPositionRef.current = getCursorPositionForInnerText();
		// Update suggestions after input - use double rAF to ensure DOM is fully settled
		requestAnimationFrame(() => {
			requestAnimationFrame(updateSuggestion);
		});
	}, [onChange, updateSuggestion, getCursorPositionForInnerText]);

	// Handle paste to strip formatting and normalize line endings
	const handlePaste = useCallback(
		(e: ClipboardEvent<HTMLDivElement>) => {
			e.preventDefault();
			let text = e.clipboardData?.getData("text/plain") ?? "";
			// Normalize all types of line endings to LF
			text = text
				.replace(/\r\n/g, "\n")
				.replace(/\r/g, "\n")
				.replace(/\u2028/g, "\n")
				.replace(/\u2029/g, "\n");

			// Use Selection API for more reliable text insertion
			const selection = window.getSelection();
			if (selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0);
				range.deleteContents();

				// Create a text node with the pasted content
				const textNode = document.createTextNode(text);
				range.insertNode(textNode);

				// Move cursor to end of inserted text
				range.setStartAfter(textNode);
				range.setEndAfter(textNode);
				selection.removeAllRanges();
				selection.addRange(range);

				// Trigger onChange
				if (editorRef.current && onChange) {
					let content = editorRef.current.innerText;
					content = content
						.replace(/\r\n/g, "\n")
						.replace(/\r/g, "\n")
						.replace(/\u2028/g, "\n")
						.replace(/\u2029/g, "\n");
					onChange(content);
				}
			}
		},
		[onChange],
	);

	// Handle keyboard shortcuts (Tab, Escape, Ctrl+A)
	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLDivElement>) => {
			if (e.key === "Tab") {
				// If there's a suggestion, accept it with Tab
				if (currentSuggestion) {
					e.preventDefault();
					acceptSuggestion();
					return;
				}
				// Otherwise, insert tab spaces
				e.preventDefault();
				const spaces = " ".repeat(tabSize);
				document.execCommand("insertText", false, spaces);
			} else if (e.key === "Escape") {
				// Dismiss suggestion with Escape
				if (currentSuggestion) {
					e.preventDefault();
					dismissSuggestion();
				}
			} else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
				// Ctrl+A / Cmd+A: Select all content
				e.preventDefault();
				if (editorRef.current) {
					const selection = window.getSelection();
					const range = document.createRange();
					range.selectNodeContents(editorRef.current);
					selection?.removeAllRanges();
					selection?.addRange(range);
				}
			}
		},
		[tabSize, currentSuggestion, acceptSuggestion, dismissSuggestion],
	);

	/**
	 * Select the text of a specific line (1-based line number).
	 * Clicking on a line number in the gutter will select that entire line.
	 */
	const selectLine = useCallback(
		(lineNumber: number) => {
			if (!editorRef.current || lineNumber < 1 || lineNumber > lines.length) {
				return;
			}

			const selection = window.getSelection();
			if (!selection) {
				return;
			}

			// Calculate character positions for the line
			let startOffset = 0;
			for (let i = 0; i < lineNumber - 1; i++) {
				startOffset += lines[i].length + 1; // +1 for newline
			}
			const endOffset = startOffset + lines[lineNumber - 1].length;

			// Get the text node inside the editor
			const textNode = editorRef.current.firstChild;
			if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
				// If content is empty or structured differently, select all as fallback
				const range = document.createRange();
				range.selectNodeContents(editorRef.current);
				selection.removeAllRanges();
				selection.addRange(range);
				return;
			}

			const range = document.createRange();
			const textLength = textNode.textContent?.length ?? 0;

			// Clamp offsets to valid range
			const clampedStart = Math.min(startOffset, textLength);
			const clampedEnd = Math.min(endOffset, textLength);

			range.setStart(textNode, clampedStart);
			range.setEnd(textNode, clampedEnd);
			selection.removeAllRanges();
			selection.addRange(range);

			// Focus the editor to show the selection
			editorRef.current.focus();
		},
		[lines],
	);

	// Track cursor position changes for insertTextAtCursor
	// Only save position if the selection is actually inside the editor
	const handleCursorChange = useCallback(() => {
		if (editorRef.current) {
			const selection = window.getSelection();
			// Only update if there's a valid selection inside our editor
			if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
				lastCursorPositionRef.current = getCursorPositionForInnerText();
			}
		}
	}, [getCursorPositionForInnerText]);

	// Save cursor position on blur - this is critical for insertTextAtCursor
	// when focus moves to another element (like an image picker button)
	/* v8 ignore start - blur handler timing varies between browsers/JSDOM, tested indirectly via insertTextAtCursor */
	const handleBlur = useCallback(() => {
		if (editorRef.current) {
			// On blur, the selection may still be valid for a brief moment
			// Try to capture it before it's completely gone
			const selection = window.getSelection();
			if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
				lastCursorPositionRef.current = getCursorPositionForInnerText();
			}
			// If selection is already gone but we have no saved position, save current position
			// This handles the edge case where the user clicked in the editor but never typed
			else if (lastCursorPositionRef.current < 0) {
				lastCursorPositionRef.current = 0;
			}
		}
	}, [getCursorPositionForInnerText]);
	/* v8 ignore stop */

	// Handle line number click - selects the line and calls onLineClick if provided
	const handleGutterClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const target = e.target as HTMLElement;
			const lineElement = target.closest(`.${styles.lineNumber}`);
			if (lineElement) {
				const lineNum = Number.parseInt(lineElement.getAttribute("data-line") || "0", 10);
				if (lineNum > 0) {
					// Select the line text
					selectLine(lineNum);
					// Call the optional callback
					onLineClick?.(lineNum);
				}
			}
		},
		[onLineClick, selectLine],
	);

	// Expose methods via ref
	useImperativeHandle(
		ref,
		() => ({
			focus: () => {
				editorRef.current?.focus();
			},
			scrollToLine: (lineNumber: number) => {
				if (editorContainerRef.current && lineNumber >= 1 && lineNumber <= lines.length) {
					const scrollTop = (lineNumber - 1) * lineHeight;
					editorContainerRef.current.scrollTop = scrollTop;
				}
			},
			getEditorElement: () => editorRef.current,
			selectLine,
			selectAll: () => {
				if (editorRef.current) {
					const selection = window.getSelection();
					const range = document.createRange();
					range.selectNodeContents(editorRef.current);
					selection?.removeAllRanges();
					selection?.addRange(range);
					editorRef.current.focus();
				}
			},
			getCursorPosition: () => {
				if (!editorRef.current) {
					return 0;
				}
				const selection = window.getSelection();
				if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
					return getCursorPositionForInnerText();
				}
				return lastCursorPositionRef.current >= 0 ? lastCursorPositionRef.current : 0;
			},
			insertTextAtCursor: (text: string) => {
				if (!editorRef.current) {
					return;
				}

				const currentContent = editorRef.current.innerText;

				// Try to get current cursor position, fallback to last saved position
				let cursorPos: number;
				const selection = window.getSelection();
				const hasSelectionInEditor =
					selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode);

				if (hasSelectionInEditor) {
					// Editor has focus or selection, use current position
					cursorPos = getCursorPositionForInnerText();
				} else if (lastCursorPositionRef.current >= 0) {
					// Editor lost focus, use last saved position (if it was ever set)
					cursorPos = lastCursorPositionRef.current;
				} else {
					// Cursor was never set - insert at end of content
					cursorPos = currentContent.length;
				}

				// Insert text at cursor position
				const before = currentContent.slice(0, cursorPos);
				const after = currentContent.slice(cursorPos);

				// Ensure we're on a new line before and after the inserted text
				const needsNewlineBefore = before.length > 0 && !before.endsWith("\n");
				const needsNewlineAfter = after.length > 0 && !after.startsWith("\n");

				const insertedText = (needsNewlineBefore ? "\n" : "") + text + (needsNewlineAfter ? "\n" : "");
				const newContent = before + insertedText + after;

				// Calculate where the cursor should be after insertion (at the end of inserted text)
				const newCursorPos = before.length + insertedText.length;

				// Update the saved cursor position for next insertion
				lastCursorPositionRef.current = newCursorPos;

				// Trigger onChange with new content
				if (onChange) {
					onChange(newContent);
				}

				// Re-focus the editor and restore cursor position after React updates the DOM
				requestAnimationFrame(() => {
					if (!editorRef.current) {
						return;
					}
					editorRef.current.focus();

					// Set cursor to end of inserted text
					const sel = window.getSelection();
					if (sel && editorRef.current.firstChild) {
						try {
							const range = document.createRange();
							// For contenteditable, we need to find the correct text node position
							// The innerText has been updated, so we need to walk the DOM
							const result = { node: null as Node | null, offset: 0 };
							let currentPos = 0;

							// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: DOM position finding requires nested conditionals for different node types
							function findPosition(node: Node): boolean {
								if (node.nodeType === Node.TEXT_NODE) {
									const textLen = (node.textContent || "").length;
									if (currentPos + textLen >= newCursorPos) {
										result.node = node;
										result.offset = newCursorPos - currentPos;
										return true;
									}
									currentPos += textLen;
								} else if (node.nodeType === Node.ELEMENT_NODE) {
									const el = node as Element;
									if (el.tagName.toLowerCase() === "br") {
										/* v8 ignore next 9 - edge case: cursor lands exactly at BR position, difficult to trigger in JSDOM */
										if (currentPos + 1 >= newCursorPos) {
											// Position cursor after the BR
											result.node = node.parentNode;
											result.offset =
												Array.from(node.parentNode?.childNodes || []).indexOf(
													node as ChildNode,
												) + 1;
											return true;
										}
										currentPos += 1;
									} else if (el.tagName.toLowerCase() === "div" && currentPos > 0) {
										// DIVs represent newlines (except the first)
										/* v8 ignore next 5 - edge case: cursor lands exactly at DIV boundary, difficult to trigger in JSDOM */
										if (currentPos + 1 >= newCursorPos) {
											result.node = node;
											result.offset = 0;
											return true;
										}
										currentPos += 1;
									}
									for (const child of Array.from(node.childNodes)) {
										if (findPosition(child)) {
											return true;
										}
									}
								}
								return false;
							}

							findPosition(editorRef.current);

							if (result.node) {
								const maxOffset =
									result.node.nodeType === Node.TEXT_NODE
										? (result.node.textContent || "").length
										: /* v8 ignore next */ result.node.childNodes.length;
								range.setStart(result.node, Math.min(result.offset, maxOffset));
								range.collapse(true);
								sel.removeAllRanges();
								sel.addRange(range);
							}
						} catch {
							/* v8 ignore next - defensive error handling for edge cases */
						}
					}
				});
			},
		}),
		[lines.length, lineHeight, selectLine, getCursorPositionForInnerText, onChange],
	);

	// Set initial content when value changes
	useEffect(() => {
		if (editorRef.current) {
			// Only update if the content is actually different to avoid cursor jumping
			const currentContent = editorRef.current.innerText;
			if (currentContent !== value) {
				editorRef.current.innerText = value;
			}
		}
	}, [value]);

	// Update suggestions when value changes (ensures ghost text appears after Enter)
	useEffect(() => {
		// Use double rAF to ensure DOM and selection are fully settled after React updates
		let cancelled = false;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (!cancelled) {
					updateSuggestion();
				}
			});
		});
		return () => {
			cancelled = true;
		};
	}, [value, updateSuggestion]);

	// Track selection changes globally to capture cursor position before focus is lost
	// This is more reliable than relying on individual event handlers
	useEffect(() => {
		function handleSelectionChange() {
			if (editorRef.current) {
				const selection = window.getSelection();
				// Only save position if selection is inside our editor
				if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
					lastCursorPositionRef.current = getCursorPositionForInnerText();
				}
			}
		}

		document.addEventListener("selectionchange", handleSelectionChange);
		return () => {
			document.removeEventListener("selectionchange", handleSelectionChange);
		};
	}, [getCursorPositionForInnerText]);

	// Calculate gutter width based on line count
	const gutterWidth = Math.max(40, `${lines.length}`.length * 10 + 20);

	// Create set of highlighted lines for O(1) lookup
	const highlightedSet = new Set(highlightedLines);

	// Create map of line decorations for O(1) lookup
	const decorationMap = new Map<number, LineDecoration>();
	for (const decoration of lineDecorations) {
		decorationMap.set(decoration.line, decoration);
	}

	return (
		<div
			className={cn(styles.wrapper, isDarkMode && styles.dark, readOnly && styles.readOnly, className)}
			style={
				{
					"--line-height": `${lineHeight}px`,
					"--font-size": `${fontSize}px`,
				} as React.CSSProperties
			}
			data-testid={testId}
		>
			{/* Gutter with line numbers */}
			<div
				ref={gutterRef}
				className={styles.gutter}
				style={{ width: `${gutterWidth}px` }}
				onClick={handleGutterClick}
				data-testid={testId ? `${testId}-gutter` : undefined}
			>
				{lines.map((_, index) => {
					const lineNum = index + 1;
					const isHighlighted = highlightedSet.has(lineNum);
					const decoration = decorationMap.get(lineNum);
					return (
						<div
							key={lineNum}
							className={cn(
								styles.lineNumber,
								isHighlighted && styles.highlighted,
								decoration?.type === "error" && styles.errorLine,
								decoration?.type === "warning" && styles.warningLine,
							)}
							data-line={lineNum}
							title={decoration?.message}
						>
							{lineNum}
						</div>
					);
				})}
			</div>

			{/* Editor container (for scrolling) */}
			<div ref={editorContainerRef} className={styles.editorContainer} onScroll={handleScroll}>
				{/* Editable area */}
				<div
					ref={editorRef}
					className={styles.editor}
					contentEditable={!readOnly}
					suppressContentEditableWarning
					// Disable browser spellcheck and text correction
					spellCheck={false}
					autoCorrect="off"
					autoCapitalize="off"
					// Disable Grammarly and other text correction extensions
					data-gramm="false"
					data-gramm_editor="false"
					data-enable-grammarly="false"
					// Disable Microsoft Editor and other writing assistants
					data-ms-editor="false"
					onInput={handleInput}
					onPaste={handlePaste}
					onKeyDown={handleKeyDown}
					onSelect={() => {
						updateSuggestion();
						handleCursorChange();
					}}
					onClick={() => {
						updateSuggestion();
						handleCursorChange();
					}}
					onFocus={() => {
						updateSuggestion();
						handleCursorChange();
					}}
					onBlur={handleBlur}
					onKeyUp={handleCursorChange}
					style={{ tabSize }}
					data-testid={testId ? `${testId}-editor` : undefined}
				/>

				{/* Ghost text overlay for autocomplete suggestion */}
				{currentSuggestion && ghostTextPosition && (
					<span
						ref={ghostTextRef}
						className={styles.ghostText}
						style={{
							top: `${ghostTextPosition.top}px`,
							left: `${ghostTextPosition.left}px`,
						}}
						data-testid={testId ? `${testId}-ghost-text` : undefined}
					>
						{currentSuggestion.text}
					</span>
				)}
			</div>
		</div>
	);
});
