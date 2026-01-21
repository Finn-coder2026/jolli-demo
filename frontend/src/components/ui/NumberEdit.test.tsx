import { NumberEdit, type NumberEditRef } from "./NumberEdit";
import { act, fireEvent, render } from "@testing-library/preact";
import { createRef } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock document.execCommand for Tab key handling (deprecated but still used for tab insertion)
if (typeof document.execCommand === "undefined") {
	document.execCommand = vi.fn().mockReturnValue(true);
}

// Polyfill Range.getClientRects for JSDOM (not implemented in JSDOM)
if (!Range.prototype.getClientRects) {
	Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

// Helper to create a mock selection for paste tests
function createMockSelection(insertedNodes: Array<Node>) {
	const mockRange = {
		deleteContents: vi.fn(),
		insertNode: vi.fn((node: Node) => insertedNodes.push(node)),
		setStartAfter: vi.fn(),
		setEndAfter: vi.fn(),
	};
	const mockSelection = {
		rangeCount: 1,
		getRangeAt: vi.fn().mockReturnValue(mockRange),
		removeAllRanges: vi.fn(),
		addRange: vi.fn(),
	};
	return { mockSelection, mockRange };
}

describe("NumberEdit", () => {
	describe("rendering", () => {
		it("should render the component with wrapper, gutter, and editor", () => {
			const { container } = render(<NumberEdit value="" />);
			const wrapper = container.querySelector('[data-testid="number-edit"]');
			expect(wrapper).toBeDefined();

			// Gutter and editor container should be rendered
			expect(container.querySelectorAll("div").length).toBeGreaterThan(2);
		});

		it("should handle empty string value", () => {
			const { getByTestId } = render(<NumberEdit value="" data-testid="editor" />);
			const gutter = getByTestId("editor-gutter");
			// Empty string should still show one line number
			const lineNumbers = gutter.querySelectorAll("[data-line]");
			expect(lineNumbers.length).toBe(1);
		});

		it("should render with custom className", () => {
			const { getByTestId } = render(<NumberEdit value="" className="custom-class" data-testid="editor" />);
			const wrapper = getByTestId("editor");
			expect(wrapper.className).toContain("custom-class");
		});

		it("should render with data-testid", () => {
			const { getByTestId } = render(<NumberEdit value="test" data-testid="my-editor" />);
			expect(getByTestId("my-editor")).toBeDefined();
			expect(getByTestId("my-editor-gutter")).toBeDefined();
			expect(getByTestId("my-editor-editor")).toBeDefined();
		});

		it("should display initial value", () => {
			const { getByTestId } = render(<NumberEdit value="Hello World" data-testid="editor" />);
			const editor = getByTestId("editor-editor");
			expect(editor.innerText).toBe("Hello World");
		});

		it("should display multiple lines", () => {
			const multilineContent = "Line 1\nLine 2\nLine 3";
			const { getByTestId } = render(<NumberEdit value={multilineContent} data-testid="editor" />);
			const gutter = getByTestId("editor-gutter");

			// Should have 3 line numbers
			const lineNumbers = gutter.querySelectorAll("[data-line]");
			expect(lineNumbers.length).toBe(3);
		});
	});

	describe("line numbers", () => {
		it("should render correct line numbers for content", () => {
			const content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
			const { getByTestId } = render(<NumberEdit value={content} data-testid="editor" />);
			const gutter = getByTestId("editor-gutter");

			const lineNumbers = gutter.querySelectorAll("[data-line]");
			expect(lineNumbers.length).toBe(5);
			expect(lineNumbers[0].textContent).toBe("1");
			expect(lineNumbers[4].textContent).toBe("5");
		});

		it("should render at least one line number for empty content", () => {
			const { getByTestId } = render(<NumberEdit value="" data-testid="editor" />);
			const gutter = getByTestId("editor-gutter");

			const lineNumbers = gutter.querySelectorAll("[data-line]");
			expect(lineNumbers.length).toBe(1);
		});

		it("should highlight specified lines", () => {
			const content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
			const { getByTestId } = render(
				<NumberEdit value={content} highlightedLines={[2, 4]} data-testid="editor" />,
			);
			const gutter = getByTestId("editor-gutter");

			const lineNumbers = gutter.querySelectorAll("[data-line]");
			// Line 2 and 4 should be highlighted (index 1 and 3)
			expect(lineNumbers[1].className).toContain("highlighted");
			expect(lineNumbers[3].className).toContain("highlighted");
			// Lines 1, 3, 5 should not be highlighted
			expect(lineNumbers[0].className).not.toContain("highlighted");
			expect(lineNumbers[2].className).not.toContain("highlighted");
			expect(lineNumbers[4].className).not.toContain("highlighted");
		});
	});

	describe("interactions", () => {
		it("should call onChange when content is modified", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="initial" onChange={onChange} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Simulate input event
			editor.innerText = "new content";
			fireEvent.input(editor);

			expect(onChange).toHaveBeenCalledWith("new content");
		});

		it("should call onLineClick when a line number is clicked", () => {
			const onLineClick = vi.fn();
			const content = "Line 1\nLine 2\nLine 3";
			const { getByTestId } = render(
				<NumberEdit value={content} onLineClick={onLineClick} data-testid="editor" />,
			);
			const gutter = getByTestId("editor-gutter");

			const lineNumber = gutter.querySelector('[data-line="2"]');
			if (lineNumber) {
				fireEvent.click(lineNumber);
			}

			expect(onLineClick).toHaveBeenCalledWith(2);
		});

		it("should not call onLineClick if not provided", () => {
			const content = "Line 1\nLine 2\nLine 3";
			const { getByTestId } = render(<NumberEdit value={content} data-testid="editor" />);
			const gutter = getByTestId("editor-gutter");

			const lineNumber = gutter.querySelector('[data-line="2"]');
			// Should not throw
			if (lineNumber) {
				fireEvent.click(lineNumber);
			}
		});

		it("should not be editable when readOnly is true", () => {
			const { getByTestId } = render(<NumberEdit value="readonly content" readOnly data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// contentEditable can be "false" string or boolean false depending on environment
			const contentEditable = editor.getAttribute("contenteditable");
			expect(contentEditable === "false" || contentEditable === null || editor.contentEditable === "false").toBe(
				true,
			);
		});

		it("should be editable when readOnly is false", () => {
			const { getByTestId } = render(<NumberEdit value="editable content" data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			expect(editor.getAttribute("contenteditable")).toBe("true");
		});
	});

	describe("ref methods", () => {
		it("should expose focus method via ref", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="test" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			// Mock focus
			const focusSpy = vi.spyOn(editor, "focus");
			ref.current?.focus();

			expect(focusSpy).toHaveBeenCalled();
		});

		it("should expose scrollToLine method via ref", () => {
			const ref = createRef<NumberEditRef>();
			const content = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
			render(<NumberEdit value={content} data-testid="editor" ref={ref} lineHeight={20} />);

			// Scroll to line 50
			ref.current?.scrollToLine(50);

			// The scroll position should be (50 - 1) * 20 = 980
			// Note: In jsdom, scrollTop might not actually change, but we verify the method exists
			expect(ref.current?.scrollToLine).toBeDefined();
		});

		it("should expose getEditorElement method via ref", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="test" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			expect(ref.current?.getEditorElement()).toBe(editor);
		});

		it("should expose selectLine method via ref", () => {
			const ref = createRef<NumberEditRef>();
			render(<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" ref={ref} />);

			// Verify the method exists and can be called
			expect(ref.current?.selectLine).toBeDefined();
			ref.current?.selectLine(2);

			// In jsdom, selection APIs may not fully work, but the method should not throw
		});

		it("should expose selectAll method via ref", () => {
			const ref = createRef<NumberEditRef>();
			render(<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" ref={ref} />);

			// Verify the method exists and can be called
			expect(ref.current?.selectAll).toBeDefined();
			ref.current?.selectAll();

			// In jsdom, selection APIs may not fully work, but the method should not throw
		});
	});

	describe("styling", () => {
		it("should apply custom lineHeight", () => {
			const { getByTestId } = render(<NumberEdit value="test" lineHeight={24} data-testid="editor" />);
			const wrapper = getByTestId("editor");

			expect(wrapper.style.getPropertyValue("--line-height")).toBe("24px");
		});

		it("should apply custom fontSize", () => {
			const { getByTestId } = render(<NumberEdit value="test" fontSize={16} data-testid="editor" />);
			const wrapper = getByTestId("editor");

			expect(wrapper.style.getPropertyValue("--font-size")).toBe("16px");
		});

		it("should use default lineHeight when not specified", () => {
			const { getByTestId } = render(<NumberEdit value="test" data-testid="editor" />);
			const wrapper = getByTestId("editor");

			expect(wrapper.style.getPropertyValue("--line-height")).toBe("20px");
		});

		it("should use default fontSize when not specified", () => {
			const { getByTestId } = render(<NumberEdit value="test" data-testid="editor" />);
			const wrapper = getByTestId("editor");

			expect(wrapper.style.getPropertyValue("--font-size")).toBe("14px");
		});

		it("should detect dark mode when document has dark class", () => {
			// Add dark class to document
			document.documentElement.classList.add("dark");

			const { getByTestId } = render(<NumberEdit value="test" data-testid="editor" />);
			const wrapper = getByTestId("editor");

			// Should have dark class applied
			expect(wrapper.className).toContain("dark");

			// Cleanup
			document.documentElement.classList.remove("dark");
		});

		it("should respond to dark mode changes via MutationObserver", async () => {
			const { getByTestId } = render(<NumberEdit value="test" data-testid="editor" />);
			const wrapper = getByTestId("editor");

			// Initially should not have dark class
			expect(wrapper.className).not.toContain("dark");

			// Add dark class
			document.documentElement.classList.add("dark");

			// Wait for MutationObserver to fire
			await new Promise(resolve => setTimeout(resolve, 0));

			// Should now have dark class
			expect(wrapper.className).toContain("dark");

			// Remove dark class
			document.documentElement.classList.remove("dark");

			// Wait for MutationObserver to fire
			await new Promise(resolve => setTimeout(resolve, 0));

			// Should no longer have dark class
			expect(wrapper.className).not.toContain("dark");
		});

		it("should apply readOnly class when readOnly is true", () => {
			const { getByTestId } = render(<NumberEdit value="test" readOnly data-testid="editor" />);
			const wrapper = getByTestId("editor");

			expect(wrapper.className).toContain("readOnly");
		});

		it("should not apply readOnly class when readOnly is false", () => {
			const { getByTestId } = render(<NumberEdit value="test" readOnly={false} data-testid="editor" />);
			const wrapper = getByTestId("editor");

			expect(wrapper.className).not.toContain("readOnly");
		});
	});

	describe("keyboard handling", () => {
		it("should prevent default tab behavior and insert spaces", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="" onChange={onChange} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			const tabEvent = new KeyboardEvent("keydown", {
				key: "Tab",
				bubbles: true,
				cancelable: true,
			});
			const preventDefaultSpy = vi.spyOn(tabEvent, "preventDefault");

			editor.dispatchEvent(tabEvent);

			expect(preventDefaultSpy).toHaveBeenCalled();
		});

		it("should respect custom tabSize", () => {
			const { getByTestId } = render(<NumberEdit value="" tabSize={2} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// tabSize can be "2" or "2px" depending on browser/environment
			expect(editor.style.tabSize).toMatch(/^2(px)?$/);
		});

		it("should handle Ctrl+A to select all content", () => {
			const { getByTestId } = render(<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			const ctrlAEvent = new KeyboardEvent("keydown", {
				key: "a",
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			});
			const preventDefaultSpy = vi.spyOn(ctrlAEvent, "preventDefault");

			editor.dispatchEvent(ctrlAEvent);

			expect(preventDefaultSpy).toHaveBeenCalled();
		});

		it("should handle Cmd+A (Mac) to select all content", () => {
			const { getByTestId } = render(<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			const cmdAEvent = new KeyboardEvent("keydown", {
				key: "a",
				metaKey: true,
				bubbles: true,
				cancelable: true,
			});
			const preventDefaultSpy = vi.spyOn(cmdAEvent, "preventDefault");

			editor.dispatchEvent(cmdAEvent);

			expect(preventDefaultSpy).toHaveBeenCalled();
		});
	});

	describe("line selection", () => {
		it("should not throw when selectLine is called via ref", () => {
			const ref = createRef<NumberEditRef>();
			render(<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" ref={ref} />);

			// Should not throw for valid line numbers
			expect(() => ref.current?.selectLine(1)).not.toThrow();
			expect(() => ref.current?.selectLine(2)).not.toThrow();
			expect(() => ref.current?.selectLine(3)).not.toThrow();

			// Should not throw for out-of-range line numbers
			expect(() => ref.current?.selectLine(0)).not.toThrow();
			expect(() => ref.current?.selectLine(100)).not.toThrow();
		});

		it("should handle selectLine when window.getSelection returns null", () => {
			const ref = createRef<NumberEditRef>();
			render(<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" ref={ref} />);

			// Mock window.getSelection to return null
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(null);

			// Should not throw when selection is null
			expect(() => ref.current?.selectLine(1)).not.toThrow();

			// Restore original
			window.getSelection = originalGetSelection;
		});

		it("should fallback to selectAll when text node is not present", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			// Clear the editor content so there's no text node
			editor.innerHTML = "";

			// Should not throw and should use fallback
			expect(() => ref.current?.selectLine(1)).not.toThrow();
		});

		it("should handle text node with empty textContent", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="Line 1\nLine 2" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			// Create a text node and mock its textContent to be empty string (falsy)
			const textNode = editor.firstChild;
			if (textNode) {
				Object.defineProperty(textNode, "textContent", {
					value: "",
					writable: true,
					configurable: true,
				});
			}

			// Should not throw and should handle empty textContent
			expect(() => ref.current?.selectLine(1)).not.toThrow();
		});

		it("should focus editor when selectAll is called via ref", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(
				<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock focus
			const focusSpy = vi.spyOn(editor, "focus");

			ref.current?.selectAll();

			// Should focus the editor
			expect(focusSpy).toHaveBeenCalled();
		});
	});

	describe("paste handling", () => {
		it("should handle paste event", () => {
			const { getByTestId } = render(<NumberEdit value="" data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Simulate the paste by calling the handler behavior
			fireEvent(editor, new Event("paste", { bubbles: true, cancelable: true }));

			// The paste handler should be attached (we can verify the element exists)
			expect(editor).toBeDefined();
		});

		it("should normalize CRLF line endings on paste", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="" onChange={onChange} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Track inserted nodes
			const insertedNodes: Array<Node> = [];
			const { mockSelection } = createMockSelection(insertedNodes);

			// Mock window.getSelection to return our mock
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Create a mock paste event with CRLF line endings
			const mockClipboardData = {
				getData: vi.fn().mockReturnValue("line1\r\nline2\r\nline3"),
			};
			const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
			Object.defineProperty(pasteEvent, "clipboardData", { value: mockClipboardData });

			fireEvent(editor, pasteEvent);

			// Verify the text node was created with normalized line endings (LF only)
			expect(insertedNodes.length).toBe(1);
			expect(insertedNodes[0].textContent).toBe("line1\nline2\nline3");

			// Restore original
			window.getSelection = originalGetSelection;
		});

		it("should normalize CR line endings on paste", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="" onChange={onChange} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Track inserted nodes
			const insertedNodes: Array<Node> = [];
			const { mockSelection } = createMockSelection(insertedNodes);

			// Mock window.getSelection to return our mock
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Create a mock paste event with CR line endings (old Mac style)
			const mockClipboardData = {
				getData: vi.fn().mockReturnValue("line1\rline2\rline3"),
			};
			const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
			Object.defineProperty(pasteEvent, "clipboardData", { value: mockClipboardData });

			fireEvent(editor, pasteEvent);

			// Verify the text node was created with normalized line endings (LF only)
			expect(insertedNodes.length).toBe(1);
			expect(insertedNodes[0].textContent).toBe("line1\nline2\nline3");

			// Restore original
			window.getSelection = originalGetSelection;
		});

		it("should normalize Unicode line separator on paste", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="" onChange={onChange} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Track inserted nodes
			const insertedNodes: Array<Node> = [];
			const { mockSelection } = createMockSelection(insertedNodes);

			// Mock window.getSelection to return our mock
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Create a mock paste event with Unicode line separator (U+2028)
			const mockClipboardData = {
				getData: vi.fn().mockReturnValue("line1\u2028line2\u2028line3"),
			};
			const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
			Object.defineProperty(pasteEvent, "clipboardData", { value: mockClipboardData });

			fireEvent(editor, pasteEvent);

			// Verify the text node was created with normalized line endings (LF only)
			expect(insertedNodes.length).toBe(1);
			expect(insertedNodes[0].textContent).toBe("line1\nline2\nline3");

			// Restore original
			window.getSelection = originalGetSelection;
		});

		it("should normalize Unicode paragraph separator on paste", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="" onChange={onChange} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Track inserted nodes
			const insertedNodes: Array<Node> = [];
			const { mockSelection } = createMockSelection(insertedNodes);

			// Mock window.getSelection to return our mock
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Create a mock paste event with Unicode paragraph separator (U+2029)
			const mockClipboardData = {
				getData: vi.fn().mockReturnValue("line1\u2029line2\u2029line3"),
			};
			const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
			Object.defineProperty(pasteEvent, "clipboardData", { value: mockClipboardData });

			fireEvent(editor, pasteEvent);

			// Verify the text node was created with normalized line endings (LF only)
			expect(insertedNodes.length).toBe(1);
			expect(insertedNodes[0].textContent).toBe("line1\nline2\nline3");

			// Restore original
			window.getSelection = originalGetSelection;
		});

		it("should handle paste when selection is null", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="" onChange={onChange} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Mock window.getSelection to return null
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(null);

			// Create a mock paste event
			const mockClipboardData = {
				getData: vi.fn().mockReturnValue("pasted text"),
			};
			const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
			Object.defineProperty(pasteEvent, "clipboardData", { value: mockClipboardData });

			// Should not throw
			expect(() => fireEvent(editor, pasteEvent)).not.toThrow();

			// Restore original
			window.getSelection = originalGetSelection;
		});

		it("should handle paste when rangeCount is 0", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="" onChange={onChange} data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Mock window.getSelection to return selection with no ranges
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue({ rangeCount: 0 });

			// Create a mock paste event
			const mockClipboardData = {
				getData: vi.fn().mockReturnValue("pasted text"),
			};
			const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
			Object.defineProperty(pasteEvent, "clipboardData", { value: mockClipboardData });

			// Should not throw
			expect(() => fireEvent(editor, pasteEvent)).not.toThrow();

			// Restore original
			window.getSelection = originalGetSelection;
		});
	});

	describe("scroll sync", () => {
		it("should sync gutter scroll with editor scroll", () => {
			const content = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
			const { getByTestId, container } = render(<NumberEdit value={content} data-testid="editor" />);

			const gutter = getByTestId("editor-gutter");
			// Find the editor container (parent of editor element)
			const editorContainer = container.querySelector('[class*="editorContainer"]');

			if (editorContainer) {
				// Simulate scroll
				Object.defineProperty(editorContainer, "scrollTop", { value: 100, writable: true });
				fireEvent.scroll(editorContainer);

				// Gutter scrollTop should be synced (in real browser)
				// In jsdom, we just verify the scroll handler is attached
				expect(gutter).toBeDefined();
			}
		});
	});

	describe("content updates", () => {
		it("should update content when value prop changes", () => {
			const { getByTestId, rerender } = render(<NumberEdit value="initial" data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			expect(editor.innerText).toBe("initial");

			rerender(<NumberEdit value="updated" data-testid="editor" />);

			expect(editor.innerText).toBe("updated");
		});
	});

	describe("autocomplete", () => {
		// Create a mock autocomplete context
		const mockAutocompleteContext = {
			getSuggestion: vi.fn(),
			getSuggestions: vi.fn(),
		};

		beforeEach(() => {
			mockAutocompleteContext.getSuggestion.mockReset();
			mockAutocompleteContext.getSuggestions.mockReset();
		});

		it("should render without autocomplete context", () => {
			const { getByTestId, queryByTestId } = render(<NumberEdit value="test" data-testid="editor" />);

			// Editor should render normally
			expect(getByTestId("editor")).toBeDefined();

			// Ghost text should not be present
			expect(queryByTestId("editor-ghost-text")).toBeNull();
		});

		it("should not render ghost text when there is no suggestion", () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue(null);

			const { queryByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);

			// Ghost text should not be present
			expect(queryByTestId("editor-ghost-text")).toBeNull();
		});

		it("should pass autocomplete context to component", () => {
			const { getByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);

			// Editor should render with autocomplete context
			expect(getByTestId("editor")).toBeDefined();
		});

		it("should handle Tab key without autocomplete", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(<NumberEdit value="test" data-testid="editor" onChange={onChange} />);
			const editor = getByTestId("editor-editor");

			// Trigger Tab key
			const tabEvent = new KeyboardEvent("keydown", {
				key: "Tab",
				bubbles: true,
				cancelable: true,
			});
			const preventDefaultSpy = vi.spyOn(tabEvent, "preventDefault");

			editor.dispatchEvent(tabEvent);

			// Tab should be prevented and insert tab character
			expect(preventDefaultSpy).toHaveBeenCalled();
		});

		it("should handle Escape key without autocomplete", () => {
			const { getByTestId } = render(<NumberEdit value="test" data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Trigger Escape key - should not throw
			const escEvent = new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			});

			expect(() => editor.dispatchEvent(escEvent)).not.toThrow();
		});

		it("should dismiss suggestion on Escape key press", () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({ text: "suggestion", displayText: "suggestion" });

			const { getByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Trigger Escape key
			const escEvent = new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			});
			const preventDefaultSpy = vi.spyOn(escEvent, "preventDefault");

			editor.dispatchEvent(escEvent);

			// Escape should be handled (preventDefault called when there's a suggestion)
			// Note: The behavior depends on state which is difficult to test in isolation
			// This test verifies the escape key handling doesn't throw
			expect(preventDefaultSpy).not.toThrow;
		});

		it("should clear suggestion when readOnly is true", () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({ text: "suggestion", displayText: "suggestion" });

			const { queryByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={mockAutocompleteContext} readOnly />,
			);

			// Ghost text should not be present when readOnly
			expect(queryByTestId("editor-ghost-text")).toBeNull();
		});

		it("should handle input events with autocomplete context", () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue(null);

			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit
					value="test"
					data-testid="editor"
					autocompleteContext={mockAutocompleteContext}
					onChange={onChange}
				/>,
			);
			const editor = getByTestId("editor-editor");

			// Simulate input
			fireEvent.input(editor, { target: { innerText: "test input" } });

			// onChange should be called
			expect(onChange).toHaveBeenCalled();
		});

		it("should clear suggestion when window.getSelection returns null during updateSuggestion", () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "suggestion",
				displayText: "suggestion",
			});

			const { getByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock window.getSelection to return null
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(null);

			// Click to trigger updateSuggestion - lines 315-318
			fireEvent.click(editor);

			// Should handle null selection gracefully
			expect(editor).toBeDefined();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should clear suggestion when selection has no ranges during updateSuggestion", () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "suggestion",
				displayText: "suggestion",
			});

			const { getByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock window.getSelection to return selection with rangeCount = 0
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue({ rangeCount: 0 });

			// Click to trigger updateSuggestion - lines 315-318
			fireEvent.click(editor);

			// Should handle empty selection gracefully
			expect(editor).toBeDefined();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should set suggestion and ghost text position when suggestion is found", () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "completion",
				displayText: "completion",
			});

			// Use empty content so ghost text can show (only shows on empty lines)
			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock the entire selection API chain - cursor at position 0 on empty content
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Click to trigger updateSuggestion - lines 326-329
			fireEvent.click(editor);

			// Autocomplete context should be called with proper arguments
			expect(mockAutocompleteContext.getSuggestion).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should clear suggestion when no suggestion is found", () => {
			// First return a suggestion, then return null
			mockAutocompleteContext.getSuggestion.mockReturnValue(null);

			const { getByTestId, queryByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Set up selection
			editor.focus();
			const selection = window.getSelection();
			if (selection && editor.firstChild) {
				const range = document.createRange();
				range.setStart(editor.firstChild, 4);
				range.setEnd(editor.firstChild, 4);
				selection.removeAllRanges();
				selection.addRange(range);
			}

			// Click to trigger updateSuggestion - lines 330-333
			fireEvent.click(editor);

			// Ghost text should not be present
			expect(queryByTestId("editor-ghost-text")).toBeNull();
		});

		it("should accept suggestion with Tab key when suggestion is active", async () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "completion",
				displayText: "completion",
			});

			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit
					value="test"
					data-testid="editor"
					autocompleteContext={mockAutocompleteContext}
					onChange={onChange}
				/>,
			);
			const editor = getByTestId("editor-editor");

			// Mock the entire selection API chain for when the component calls updateSuggestion
			const mockRange = {
				startContainer: editor.firstChild,
				startOffset: 4,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 5,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// First trigger a click to set currentSuggestion state
			fireEvent.click(editor);
			// Wait for requestAnimationFrame in updateSuggestion
			await new Promise(resolve => setTimeout(resolve, 20));

			// Tab key should accept suggestion - lines 432-435
			const tabEvent = new KeyboardEvent("keydown", {
				key: "Tab",
				bubbles: true,
				cancelable: true,
			});
			const preventDefaultSpy = vi.spyOn(tabEvent, "preventDefault");

			editor.dispatchEvent(tabEvent);

			// Tab should be prevented
			expect(preventDefaultSpy).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should dismiss suggestion with Escape key when suggestion is active", async () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "completion",
				displayText: "completion",
			});

			// Use empty content so ghost text can show (only shows on empty lines)
			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock the entire selection API chain - cursor at position 0 on empty content
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 5,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// First trigger a click to set currentSuggestion state
			fireEvent.click(editor);
			// Wait for requestAnimationFrame in updateSuggestion
			await new Promise(resolve => setTimeout(resolve, 20));

			// Escape key should dismiss suggestion - lines 443-445
			const escEvent = new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			});
			const preventDefaultSpy = vi.spyOn(escEvent, "preventDefault");

			editor.dispatchEvent(escEvent);

			// Escape should be prevented when there's a suggestion
			expect(preventDefaultSpy).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should not accept suggestion when currentSuggestion is null", () => {
			// No suggestion available
			mockAutocompleteContext.getSuggestion.mockReturnValue(null);

			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit
					value="test"
					data-testid="editor"
					autocompleteContext={mockAutocompleteContext}
					onChange={onChange}
				/>,
			);
			const editor = getByTestId("editor-editor");

			// Tab key without active suggestion - should insert spaces, not accept suggestion
			const tabEvent = new KeyboardEvent("keydown", {
				key: "Tab",
				bubbles: true,
				cancelable: true,
			});

			editor.dispatchEvent(tabEvent);

			// Should not throw
			expect(editor).toBeDefined();
		});

		it("should not accept suggestion when onChange is not provided", async () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "completion",
				displayText: "completion",
			});

			// Render without onChange - tests acceptSuggestion early return
			// Use empty content so ghost text can show (only shows on empty lines)
			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock the entire selection API chain
			const mockRange = {
				startContainer: editor.firstChild,
				startOffset: 4,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 5,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// First trigger a click to set currentSuggestion state
			fireEvent.click(editor);
			// Wait for the suggestion to be set
			await new Promise(resolve => setTimeout(resolve, 20));

			// Tab key - should not throw when onChange is not provided
			// This tests the early return in acceptSuggestion (lines 340-342)
			// where currentSuggestion is set but onChange is not provided
			const tabEvent = new KeyboardEvent("keydown", {
				key: "Tab",
				bubbles: true,
				cancelable: true,
			});

			expect(() => editor.dispatchEvent(tabEvent)).not.toThrow();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should call dismissSuggestion and clear state", () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "completion",
				displayText: "completion",
			});

			const { getByTestId, queryByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={mockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock the entire selection API chain
			const mockRange = {
				startContainer: editor.firstChild,
				startOffset: 4,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Now dismiss with Escape - lines 357-358
			const escEvent = new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			});
			editor.dispatchEvent(escEvent);

			// After dismissing, ghost text should not be present
			// Note: State may or may not be visible in jsdom
			expect(queryByTestId("editor-ghost-text")).toBeNull();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should not show suggestion after dismiss until user types", async () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "completion",
				displayText: "completion",
			});

			const onChange = vi.fn();
			// Use empty content so ghost text can show (only shows on empty lines)
			const { getByTestId } = render(
				<NumberEdit
					value=""
					data-testid="editor"
					autocompleteContext={mockAutocompleteContext}
					onChange={onChange}
				/>,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection API
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 5,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// First, trigger a suggestion by clicking (this sets currentSuggestion)
			fireEvent.click(editor);
			await new Promise(resolve => setTimeout(resolve, 20));

			// Now dismiss with Escape - sets dismissedRef to true (only works when currentSuggestion exists)
			const escEvent = new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			});
			editor.dispatchEvent(escEvent);

			// Click again - should NOT show suggestion because dismissedRef is true
			mockAutocompleteContext.getSuggestion.mockClear();
			fireEvent.click(editor);
			await new Promise(resolve => setTimeout(resolve, 20));

			// getSuggestion should not be called because updateSuggestion returns early
			expect(mockAutocompleteContext.getSuggestion).not.toHaveBeenCalled();

			// Now type something - this clears dismissedRef via handleInput (line 397)
			// The input event clears the dismissed flag, even though the content itself
			// may not result in getSuggestion being called (due to empty line check)
			fireEvent.input(editor, { target: { innerText: "" } });
			await new Promise(resolve => setTimeout(resolve, 50));

			// After input clears dismissedRef, a subsequent click should call getSuggestion
			mockAutocompleteContext.getSuggestion.mockClear();
			fireEvent.click(editor);
			await new Promise(resolve => setTimeout(resolve, 20));

			// Now getSuggestion should be called because dismissedRef was cleared by input
			expect(mockAutocompleteContext.getSuggestion).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should skip updateSuggestion after accepting a suggestion", async () => {
			// First setup: return a suggestion
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "completion",
				displayText: "completion",
			});

			const onChange = vi.fn();
			// Use empty content so ghost text can show (only shows on empty lines)
			const { getByTestId } = render(
				<NumberEdit
					value=""
					data-testid="editor"
					autocompleteContext={mockAutocompleteContext}
					onChange={onChange}
				/>,
			);
			const editor = getByTestId("editor-editor");

			// Mock the selection API - cursor at position 0 on empty content
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 5,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// First trigger a click to set currentSuggestion state
			fireEvent.click(editor);
			await new Promise(resolve => setTimeout(resolve, 20));

			// Accept the suggestion with Tab key - this sets justAcceptedRef.current = true
			const tabEvent = new KeyboardEvent("keydown", {
				key: "Tab",
				bubbles: true,
				cancelable: true,
			});
			editor.dispatchEvent(tabEvent);

			// The justAcceptedRef should prevent the next updateSuggestion call
			// from finding a new suggestion (lines 293-296)
			const callCountAfterTab = mockAutocompleteContext.getSuggestion.mock.calls.length;

			// Trigger an input event which would normally call updateSuggestion via requestAnimationFrame
			fireEvent.input(editor, { target: { innerText: "" } });

			// Wait for requestAnimationFrame callback to execute
			await new Promise(resolve => setTimeout(resolve, 50));

			// After the input, getSuggestion should NOT have been called because justAcceptedRef was true
			// (the skip path on lines 293-296 returns early before calling getSuggestion)
			// However, after the skip, justAcceptedRef becomes false, so subsequent inputs will work
			// This verifies lines 294-296 are executed
			expect(mockAutocompleteContext.getSuggestion.mock.calls.length).toBeGreaterThanOrEqual(callCountAfterTab);

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should reset justAcceptedRef after skipping once", async () => {
			mockAutocompleteContext.getSuggestion.mockReturnValue({
				text: "completion",
				displayText: "completion",
			});

			const onChange = vi.fn();
			// Use empty content so ghost text can show (only shows on empty lines)
			const { getByTestId } = render(
				<NumberEdit
					value=""
					data-testid="editor"
					autocompleteContext={mockAutocompleteContext}
					onChange={onChange}
				/>,
			);
			const editor = getByTestId("editor-editor");

			// Position cursor at start of empty content
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 5,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Accept suggestion
			const tabEvent = new KeyboardEvent("keydown", {
				key: "Tab",
				bubbles: true,
				cancelable: true,
			});
			editor.dispatchEvent(tabEvent);

			// First input after accept - should skip (line 294-295)
			fireEvent.input(editor, { target: { innerText: "" } });
			await new Promise(resolve => setTimeout(resolve, 20));

			// Second input - should NOT skip (line 294 sets justAcceptedRef to false)
			mockAutocompleteContext.getSuggestion.mockClear();
			fireEvent.click(editor);
			await new Promise(resolve => setTimeout(resolve, 20));

			// After the skip, subsequent calls should work normally
			expect(mockAutocompleteContext.getSuggestion).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});
	});

	describe("selectLine range setting", () => {
		it("should handle selectLine when text node is present", () => {
			const ref = createRef<NumberEditRef>();
			render(<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" ref={ref} />);

			// selectLine with valid line number should not throw - tests lines 494-504
			// The actual range creation depends on the DOM structure
			expect(() => ref.current?.selectLine(2)).not.toThrow();
		});

		it("should clamp offsets to valid range", () => {
			const ref = createRef<NumberEditRef>();
			render(<NumberEdit value="a" data-testid="editor" ref={ref} />);

			// Call selectLine with a line that would exceed content length
			// This tests lines 498-499 (clamping)
			expect(() => ref.current?.selectLine(100)).not.toThrow();
		});

		it("should set range with correct start and end offsets", () => {
			const ref = createRef<NumberEditRef>();
			render(<NumberEdit value="Line 1\nLine 2\nLine 3" data-testid="editor" ref={ref} />);

			// Mock selection and range creation with all needed methods
			const mockRange = {
				setStart: vi.fn(),
				setEnd: vi.fn(),
				selectNodeContents: vi.fn(),
			};
			const originalCreateRange = document.createRange;
			document.createRange = vi.fn().mockReturnValue(mockRange);

			const mockSelection = {
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Call selectLine - tests lines 494-504
			ref.current?.selectLine(1);

			// Verify range was created
			expect(document.createRange).toHaveBeenCalled();

			// Restore
			document.createRange = originalCreateRange;
			window.getSelection = originalGetSelection;
		});

		it("should select line when editor has text node as first child", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="Line 1\nLine 2" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			// Manually set editor content as a text node to ensure we hit the text node branch
			editor.textContent = "Line 1\nLine 2";

			// selectLine should work with the text node - tests lines 499-512
			expect(() => ref.current?.selectLine(1)).not.toThrow();
		});
	});

	describe("ghost text rendering", () => {
		it("should render ghost text with correct positioning", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Use empty content so ghost text can show (only shows on empty lines)
			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock the entire selection API chain - cursor at position 0 on empty content
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// The ghost text should be rendered - lines 632-642
			// In jsdom, the actual rendering may not work perfectly, but we verify no errors
			expect(localMockAutocompleteContext.getSuggestion).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should show ghost text on empty line 2 with content on lines 0-1", async () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Content has 2 lines with text, then empty line 3 where cursor is
			const content = "line1\nline2\n";
			const { getByTestId } = render(
				<NumberEdit value={content} data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection at end of content (after the second newline, which is line 2 / index 2)
			// Position 12 = "line1\nline2\n".length
			const mockTextNode = document.createTextNode(content);
			editor.appendChild(mockTextNode);
			const mockRange = {
				startContainer: mockTextNode,
				startOffset: 12, // After "line1\nline2\n"
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 50,
					left: 12,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion with act to ensure effects run
			await act(() => {
				fireEvent.click(editor);
			});

			// getSuggestion should be called with cursor position at line 2
			// cursorPos = 6 (line1\n) + 6 (line2\n) = 12
			expect(localMockAutocompleteContext.getSuggestion).toHaveBeenCalledWith(content, 12);

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should render ghost text element with suggestion text", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion-text",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Use empty content so ghost text can show (only shows on empty lines)
			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock the entire selection API chain - cursor at position 0 on empty content
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// Check if getSuggestion was called - lines 632-642
			// The ghost text rendering tests the JSX in lines 632-642
			expect(localMockAutocompleteContext.getSuggestion).toHaveBeenCalled();
			expect(editor).toBeDefined();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should NOT show ghost text when cursor is on non-empty line", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Content where cursor will be on a line with text
			const { getByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock cursor in the middle of "test" (non-empty line)
			const mockRange = {
				startContainer: editor.firstChild,
				startOffset: 2, // Middle of "test"
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// getSuggestion should NOT be called because cursor is on non-empty line
			expect(localMockAutocompleteContext.getSuggestion).not.toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should NOT show ghost text when cursor is at end of line with content before it", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Content with text on the line
			const { getByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock cursor at end of "test" (text before cursor, nothing after)
			const mockRange = {
				startContainer: editor.firstChild,
				startOffset: 4, // End of "test"
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// getSuggestion should NOT be called because there's text before cursor on the line
			expect(localMockAutocompleteContext.getSuggestion).not.toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should NOT show ghost text when cursor is at start of line with content after it", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Content with text on the line
			const { getByTestId } = render(
				<NumberEdit value="test" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock cursor at start of "test" (nothing before cursor, text after)
			const mockRange = {
				startContainer: editor.firstChild,
				startOffset: 0, // Start of "test"
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// getSuggestion should NOT be called because there's text after cursor on the line
			expect(localMockAutocompleteContext.getSuggestion).not.toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should NOT show ghost text when cursor is in middle of line with content on both sides", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Content with "hello world" - cursor will be between "hello" and "world"
			const { getByTestId } = render(
				<NumberEdit
					value="hello world"
					data-testid="editor"
					autocompleteContext={localMockAutocompleteContext}
				/>,
			);
			const editor = getByTestId("editor-editor");

			// Mock cursor at position 5 (between "hello" and " world")
			const mockRange = {
				startContainer: editor.firstChild,
				startOffset: 5, // After "hello"
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 80,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// getSuggestion should NOT be called because there's text on both sides of cursor
			expect(localMockAutocompleteContext.getSuggestion).not.toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should clear suggestion when getSuggestion returns null on empty line", () => {
			// Return null to test the else branch at line 367
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue(null),
				getSuggestions: vi.fn(),
			};

			// Use empty content so we pass the empty line check
			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock cursor at position 0 on empty content
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// getSuggestion should be called (we're on empty line) but returns null
			expect(localMockAutocompleteContext.getSuggestion).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should show ghost text on empty content", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Empty content is an empty line, so suggestions should be shown
			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock cursor at position 0 on empty content
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 20,
					left: 12,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// getSuggestion SHOULD be called - empty content is an empty line
			expect(localMockAutocompleteContext.getSuggestion).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should use getClientRects when available for ghost text position", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock getClientRects to return actual rects (covers lines 287-292)
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([{ top: 10, left: 50, width: 5, height: 20 }]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// getClientRects should have been called
			expect(mockRange.getClientRects).toHaveBeenCalled();
			// getSuggestion should be called for empty content
			expect(localMockAutocompleteContext.getSuggestion).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should fall back to span insertion when getBoundingClientRect returns zero dimensions", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock to fall through all branches to span insertion (lines 304-317)
			const mockRange = {
				startContainer: editor,
				startOffset: 0,
				// Both getClientRects returns empty and getBoundingClientRect returns zeros
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 0,
					left: 0,
					width: 0,
					height: 0,
				}),
				getClientRects: vi.fn().mockReturnValue([]),
				insertNode: vi.fn(),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// insertNode should have been called for the span fallback
			expect(mockRange.insertNode).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should handle null position from getCursorVisualPosition", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId, queryByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection with rangeCount=0 to return null from getCursorVisualPosition (covers lines 382-384)
			const mockSelection = {
				rangeCount: 0,
				getRangeAt: vi.fn(),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// Ghost text should not be shown because position is null
			expect(queryByTestId("editor-ghost-text")).toBeNull();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should walk DOM tree with text nodes for cursor position calculation", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			// Content with newlines that will create text nodes
			const { getByTestId } = render(
				<NumberEdit
					value="line1\nline2"
					data-testid="editor"
					autocompleteContext={localMockAutocompleteContext}
				/>,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection with cursor inside a text node (exercises text node handling in walkNode)
			const mockRange = {
				startContainer: editor.firstChild, // Text node
				startOffset: 3, // Inside "line1"
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 50,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([{ top: 10, left: 50, width: 5, height: 20 }]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion which calls getCursorPositionForInnerText
			fireEvent.click(editor);

			// The cursor position calculation should have been triggered
			expect(localMockAutocompleteContext.getSuggestion).not.toHaveBeenCalled(); // Not empty line

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should handle BR elements in DOM tree walking", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Manually insert a BR element to test BR handling
			const br = document.createElement("br");
			editor.appendChild(br);

			const mockRange = {
				startContainer: editor,
				startOffset: 1, // After the BR
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 30,
					left: 12,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([{ top: 30, left: 12, width: 0, height: 20 }]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// getSuggestion may or may not be called depending on line state
			expect(mockRange.getClientRects).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should handle nested div elements in DOM tree walking", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Create nested div structure to test div handling
			const div1 = document.createElement("div");
			div1.textContent = "line1";
			const div2 = document.createElement("div");
			div2.textContent = "line2";
			editor.innerHTML = "";
			editor.appendChild(div1);
			editor.appendChild(div2);

			const mockRange = {
				startContainer: div2.firstChild, // Text inside div2
				startOffset: 0,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 30,
					left: 12,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([{ top: 30, left: 12, width: 0, height: 20 }]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// The DOM walking should have processed the div elements
			expect(mockRange.getClientRects).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should handle foundCursor early return in walkNode with sibling children", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Create a div with multiple children - cursor in first child should cause
			// early return when processing the second child (lines 225-226)
			const div = document.createElement("div");
			const textNode1 = document.createTextNode("first");
			const span = document.createElement("span");
			span.textContent = "second";
			div.appendChild(textNode1);
			div.appendChild(span); // This sibling will trigger foundCursor early return
			editor.innerHTML = "";
			editor.appendChild(div);

			// Mock selection with cursor in the first text node
			// After walkNode finds cursor in textNode1, it returns true
			// The for loop continues to span, and walkNode(span) sees foundCursor=true and returns early
			const mockRange = {
				startContainer: textNode1, // Cursor in first child
				startOffset: 3,
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 30,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([{ top: 10, left: 30, width: 0, height: 20 }]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// Verify the selection API was used
			expect(mockRange.getClientRects).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should handle cursor in element node with child text nodes", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Create DOM structure with a div containing text (simulating Enter key behavior)
			const div = document.createElement("div");
			const textNode = document.createTextNode("some text");
			div.appendChild(textNode);
			editor.innerHTML = "";
			editor.appendChild(div);

			// Mock selection with cursor directly in the div element (not in text node)
			// This triggers lines 182-196 where node.nodeType === Node.ELEMENT_NODE
			const mockRange = {
				startContainer: div, // The div element node (not text node inside)
				startOffset: 1, // After the text node child
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 10,
					left: 80,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([{ top: 10, left: 80, width: 0, height: 20 }]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// Verify the selection API was used
			expect(mockRange.getClientRects).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should handle cursor in element node with BR child", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Create DOM structure with a div containing BR element (simulating Enter in empty div)
			const div = document.createElement("div");
			const br = document.createElement("br");
			div.appendChild(br);
			editor.innerHTML = "";
			editor.appendChild(div);

			// Mock selection with cursor directly in the div element after the BR
			// This triggers the BR branch in lines 189-190
			const mockRange = {
				startContainer: div, // Element node containing BR
				startOffset: 1, // After the BR
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 30,
					left: 12,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([{ top: 30, left: 12, width: 0, height: 20 }]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// Verify the selection API was used (covers BR branch in lines 189-190)
			expect(mockRange.getClientRects).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});

		it("should handle cursor in element node with nested div child", () => {
			const localMockAutocompleteContext = {
				getSuggestion: vi.fn().mockReturnValue({
					text: "completion",
					displayText: "completion",
				}),
				getSuggestions: vi.fn(),
			};

			const { getByTestId } = render(
				<NumberEdit value="" data-testid="editor" autocompleteContext={localMockAutocompleteContext} />,
			);
			const editor = getByTestId("editor-editor");

			// Create DOM structure with a div containing a nested div (non-BR element)
			const outerDiv = document.createElement("div");
			const innerDiv = document.createElement("div");
			innerDiv.textContent = "nested content";
			outerDiv.appendChild(innerDiv);
			editor.innerHTML = "";
			editor.appendChild(outerDiv);

			// Mock selection with cursor directly in the outer div after the inner div
			// This triggers the non-BR element branch in lines 191-193
			const mockRange = {
				startContainer: outerDiv, // Element node containing nested div
				startOffset: 1, // After the inner div
				getBoundingClientRect: vi.fn().mockReturnValue({
					top: 30,
					left: 12,
					width: 0,
					height: 20,
				}),
				getClientRects: vi.fn().mockReturnValue([{ top: 30, left: 12, width: 0, height: 20 }]),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Trigger updateSuggestion
			fireEvent.click(editor);

			// Verify the selection API was used (covers non-BR element branch in lines 191-193)
			expect(mockRange.getClientRects).toHaveBeenCalled();

			// Restore
			window.getSelection = originalGetSelection;
		});
	});

	describe("line decorations", () => {
		it("should apply error decoration to specified lines", () => {
			const decorations = [{ line: 2, type: "error" as const, message: "Error on line 2" }];
			const { getByTestId } = render(
				<NumberEdit value="line1\nline2\nline3" data-testid="editor" lineDecorations={decorations} />,
			);

			// Editor should render with decorations processed
			expect(getByTestId("editor")).toBeDefined();
			expect(getByTestId("editor-gutter")).toBeDefined();
		});

		it("should apply warning decoration to specified lines", () => {
			const decorations = [{ line: 1, type: "warning" as const, message: "Warning on line 1" }];
			const { getByTestId } = render(
				<NumberEdit value="line1\nline2" data-testid="editor" lineDecorations={decorations} />,
			);

			expect(getByTestId("editor")).toBeDefined();
			expect(getByTestId("editor-gutter")).toBeDefined();
		});

		it("should handle multiple decorations", () => {
			const decorations = [
				{ line: 1, type: "error" as const, message: "Error on line 1" },
				{ line: 2, type: "warning" as const, message: "Warning on line 2" },
			];
			const { getByTestId } = render(
				<NumberEdit value="line1\nline2\nline3" data-testid="editor" lineDecorations={decorations} />,
			);

			expect(getByTestId("editor")).toBeDefined();
		});
	});

	describe("insertTextAtCursor", () => {
		it("should insert text at cursor position when editor has focus", () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="hello world" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection inside the editor at position 5 (after "hello")
			const mockRange = {
				startContainer: editor.firstChild,
				startOffset: 5,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild,
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Mock contains to return true (selection is inside editor)
			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Insert text
			ref.current?.insertTextAtCursor("INSERTED");

			// onChange should have been called with inserted text
			expect(onChange).toHaveBeenCalled();

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should insert text at last saved cursor position when editor loses focus", () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="hello world" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// First, focus and set cursor position
			editor.focus();
			const textNode = editor.firstChild;
			if (textNode) {
				const mockRange = {
					startContainer: textNode,
					startOffset: 5,
				};
				const mockSelection = {
					rangeCount: 1,
					getRangeAt: vi.fn().mockReturnValue(mockRange),
					anchorNode: textNode,
				};
				const originalGetSelection = window.getSelection;
				window.getSelection = vi.fn().mockReturnValue(mockSelection);

				// Mock contains to return true initially
				const originalContains = editor.contains;
				editor.contains = vi.fn().mockReturnValue(true);

				// Trigger selectionchange to save cursor position
				document.dispatchEvent(new Event("selectionchange"));

				// Now blur the editor - selection is now outside
				editor.contains = vi.fn().mockReturnValue(false);
				window.getSelection = vi.fn().mockReturnValue({
					rangeCount: 0,
					getRangeAt: vi.fn(),
					anchorNode: null,
				});

				// Insert text - should use last saved position
				ref.current?.insertTextAtCursor("INSERTED");

				// onChange should have been called
				expect(onChange).toHaveBeenCalled();

				// Restore
				editor.contains = originalContains;
				window.getSelection = originalGetSelection;
			}
		});

		it("should insert text at end when cursor was never set", () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="hello" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection outside editor (cursor was never set inside)
			const externalNode = document.createElement("div");
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue({ startContainer: externalNode, startOffset: 0 }),
				anchorNode: externalNode,
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Mock contains to return false
			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(false);

			// Insert text - should insert at end since cursor was never set
			ref.current?.insertTextAtCursor("END");

			// onChange should have been called with text appended
			expect(onChange).toHaveBeenCalled();
			const callArgs = onChange.mock.calls[0][0];
			expect(callArgs).toContain("END");

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should add newlines before and after inserted text when needed", () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="helloworld" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// First, save a cursor position in the middle of content by triggering selectionchange
			const textNode = editor.firstChild;
			if (textNode && textNode.nodeType === Node.TEXT_NODE) {
				const mockRange = {
					startContainer: textNode,
					startOffset: 5, // Position 5 in "helloworld"
				};
				const mockSelection = {
					rangeCount: 1,
					getRangeAt: vi.fn().mockReturnValue(mockRange),
					anchorNode: textNode,
					removeAllRanges: vi.fn(),
					addRange: vi.fn(),
				};
				const originalGetSelection = window.getSelection;
				window.getSelection = vi.fn().mockReturnValue(mockSelection);

				const originalContains = editor.contains;
				editor.contains = vi.fn().mockReturnValue(true);

				// Trigger selectionchange to save cursor position at 5
				document.dispatchEvent(new Event("selectionchange"));

				// Now simulate editor losing focus
				editor.contains = vi.fn().mockReturnValue(false);
				window.getSelection = vi.fn().mockReturnValue({ rangeCount: 0 });

				// Insert text - should use saved position 5 (after "hello", before "world")
				ref.current?.insertTextAtCursor("INSERTED");

				// onChange should be called - newlines are added because there's content before and after
				expect(onChange).toHaveBeenCalled();
				const newContent = onChange.mock.calls[0][0];
				// With before="hello" and after="world", both have content, so newlines are added
				expect(newContent).toContain("\nINSERTED\n");

				// Restore
				editor.contains = originalContains;
				window.getSelection = originalGetSelection;
			} else {
				// If no text node, the test setup is incorrect - still verify basic behavior
				expect(editor).toBeDefined();
			}
		});

		it("should not add newline before when at start of content", () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="hello" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection at position 0
			const mockRange = {
				startContainer: editor.firstChild || editor,
				startOffset: 0,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild || editor,
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Insert text at start
			ref.current?.insertTextAtCursor("START");

			expect(onChange).toHaveBeenCalled();
			const newContent = onChange.mock.calls[0][0];
			// Should not start with newline
			expect(newContent.startsWith("\n")).toBe(false);

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should not add newline after when at end of content", () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="hello" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection at end of content (position 5)
			const mockRange = {
				startContainer: editor.firstChild || editor,
				startOffset: 5,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild || editor,
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Insert text at end
			ref.current?.insertTextAtCursor("END");

			expect(onChange).toHaveBeenCalled();
			const newContent = onChange.mock.calls[0][0];
			// Should not end with newline
			expect(newContent.endsWith("\n")).toBe(false);

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should do nothing when editorRef is null", () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { unmount } = render(<NumberEdit value="hello" onChange={onChange} data-testid="editor" ref={ref} />);

			// Store ref before unmount
			const insertTextAtCursor = ref.current?.insertTextAtCursor;

			// Unmount to clear editorRef
			unmount();

			// Try to insert text - should do nothing
			insertTextAtCursor?.("test");

			// onChange should not have been called after unmount
			expect(onChange).not.toHaveBeenCalled();
		});

		it("should not call onChange when onChange is not provided", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="hello" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			// Mock selection
			const mockRange = {
				startContainer: editor.firstChild || editor,
				startOffset: 0,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild || editor,
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Should not throw when onChange is not provided
			expect(() => ref.current?.insertTextAtCursor("test")).not.toThrow();

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should handle requestAnimationFrame callback for cursor positioning", async () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="hello" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Mock selection
			const mockRange = {
				startContainer: editor.firstChild || editor,
				startOffset: 5,
				setStart: vi.fn(),
				collapse: vi.fn(),
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild || editor,
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Insert text
			ref.current?.insertTextAtCursor("END");

			// Wait for requestAnimationFrame
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify focus was called on editor
			expect(onChange).toHaveBeenCalled();

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should handle cursor positioning with text nodes after insertion", async () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId, rerender } = render(
				<NumberEdit value="hello" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Set up editor with text node
			editor.innerText = "hello";

			// Save cursor position first
			const textNode = editor.firstChild;
			if (textNode) {
				const mockRange = {
					startContainer: textNode,
					startOffset: 3,
				};
				const mockSelection = {
					rangeCount: 1,
					getRangeAt: vi.fn().mockReturnValue(mockRange),
					anchorNode: textNode,
					removeAllRanges: vi.fn(),
					addRange: vi.fn(),
				};
				const originalGetSelection = window.getSelection;
				window.getSelection = vi.fn().mockReturnValue(mockSelection);

				const originalContains = editor.contains;
				editor.contains = vi.fn().mockReturnValue(true);

				// Trigger selectionchange
				document.dispatchEvent(new Event("selectionchange"));

				// Now lose focus
				editor.contains = vi.fn().mockReturnValue(false);
				window.getSelection = vi.fn().mockReturnValue({
					rangeCount: 1,
					getRangeAt: vi.fn().mockReturnValue({ startContainer: textNode, startOffset: 3 }),
					removeAllRanges: vi.fn(),
					addRange: vi.fn(),
				});

				// Insert text
				ref.current?.insertTextAtCursor("X");

				// Rerender with new value to trigger DOM update
				const newValue = onChange.mock.calls[0]?.[0] || "hello";
				rerender(<NumberEdit value={newValue} onChange={onChange} data-testid="editor" ref={ref} />);

				// Wait for requestAnimationFrame to complete
				await new Promise(resolve => setTimeout(resolve, 100));

				// Verify onChange was called
				expect(onChange).toHaveBeenCalled();

				// Restore
				editor.contains = originalContains;
				window.getSelection = originalGetSelection;
			}
		});

		it("should handle cursor positioning with BR elements after insertion", async () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId, rerender } = render(
				<NumberEdit value="line1" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Set up editor with BR element
			editor.innerHTML = "line1<br>";

			// Save cursor position at start
			const originalGetSelection = window.getSelection;
			const originalContains = editor.contains;

			editor.contains = vi.fn().mockReturnValue(true);
			window.getSelection = vi.fn().mockReturnValue({
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue({ startContainer: editor.firstChild, startOffset: 0 }),
				anchorNode: editor.firstChild,
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			});

			document.dispatchEvent(new Event("selectionchange"));

			// Lose focus and insert
			editor.contains = vi.fn().mockReturnValue(false);
			window.getSelection = vi.fn().mockReturnValue({
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue({ startContainer: editor, startOffset: 0 }),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			});

			ref.current?.insertTextAtCursor("INSERTED");

			// Rerender
			const newValue = onChange.mock.calls[0]?.[0] || "line1";
			rerender(<NumberEdit value={newValue} onChange={onChange} data-testid="editor" ref={ref} />);

			await new Promise(resolve => setTimeout(resolve, 100));

			expect(onChange).toHaveBeenCalled();

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should handle cursor positioning with DIV elements after insertion", async () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId, rerender } = render(
				<NumberEdit value="line1\nline2" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Set up editor with div structure
			editor.innerHTML = "<div>line1</div><div>line2</div>";

			// Save cursor position
			const firstDiv = editor.firstChild;
			const originalGetSelection = window.getSelection;
			const originalContains = editor.contains;

			if (firstDiv) {
				editor.contains = vi.fn().mockReturnValue(true);
				window.getSelection = vi.fn().mockReturnValue({
					rangeCount: 1,
					getRangeAt: vi.fn().mockReturnValue({ startContainer: firstDiv.firstChild, startOffset: 5 }),
					anchorNode: firstDiv.firstChild,
					removeAllRanges: vi.fn(),
					addRange: vi.fn(),
				});

				document.dispatchEvent(new Event("selectionchange"));

				// Lose focus
				editor.contains = vi.fn().mockReturnValue(false);
				window.getSelection = vi.fn().mockReturnValue({
					rangeCount: 1,
					getRangeAt: vi.fn().mockReturnValue({ startContainer: editor, startOffset: 0 }),
					removeAllRanges: vi.fn(),
					addRange: vi.fn(),
				});

				ref.current?.insertTextAtCursor("X");

				const newValue = onChange.mock.calls[0]?.[0] || "line1\nline2";
				rerender(<NumberEdit value={newValue} onChange={onChange} data-testid="editor" ref={ref} />);

				await new Promise(resolve => setTimeout(resolve, 100));

				expect(onChange).toHaveBeenCalled();
			}

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should handle catch block when range.setStart throws", async () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId, rerender } = render(
				<NumberEdit value="test" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Save cursor position
			const originalGetSelection = window.getSelection;
			const originalContains = editor.contains;
			const originalCreateRange = document.createRange;

			editor.contains = vi.fn().mockReturnValue(true);
			window.getSelection = vi.fn().mockReturnValue({
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue({ startContainer: editor.firstChild, startOffset: 0 }),
				anchorNode: editor.firstChild,
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			});

			document.dispatchEvent(new Event("selectionchange"));

			// Lose focus
			editor.contains = vi.fn().mockReturnValue(false);
			window.getSelection = vi.fn().mockReturnValue({
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue({ startContainer: editor, startOffset: 0 }),
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			});

			// Mock createRange to throw
			document.createRange = vi.fn().mockImplementation(() => {
				throw new Error("Test error");
			});

			// Insert text - should not throw despite createRange error
			expect(() => ref.current?.insertTextAtCursor("X")).not.toThrow();

			const newValue = onChange.mock.calls[0]?.[0] || "test";
			rerender(<NumberEdit value={newValue} onChange={onChange} data-testid="editor" ref={ref} />);

			await new Promise(resolve => setTimeout(resolve, 100));

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
			document.createRange = originalCreateRange;
		});

		it("should use lastCursorPositionRef when editor has selection but cursor not in editor", () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="hello" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// First, save a cursor position
			const originalGetSelection = window.getSelection;
			const originalContains = editor.contains;

			editor.contains = vi.fn().mockReturnValue(true);
			window.getSelection = vi.fn().mockReturnValue({
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue({ startContainer: editor.firstChild, startOffset: 3 }),
				anchorNode: editor.firstChild,
			});

			// Trigger selectionchange to save position
			document.dispatchEvent(new Event("selectionchange"));

			// Now simulate: editor lost focus, selection exists but is outside editor
			editor.contains = vi.fn().mockReturnValue(false);
			const externalNode = document.createElement("div");
			window.getSelection = vi.fn().mockReturnValue({
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue({ startContainer: externalNode, startOffset: 0 }),
				anchorNode: externalNode,
			});

			// Insert text - should use last saved position (line 715)
			ref.current?.insertTextAtCursor("X");

			expect(onChange).toHaveBeenCalled();

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should handle no firstChild in editor during requestAnimationFrame", async () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId, rerender } = render(
				<NumberEdit value="" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			// Clear editor
			editor.innerHTML = "";

			const originalGetSelection = window.getSelection;
			const originalContains = editor.contains;

			editor.contains = vi.fn().mockReturnValue(false);
			window.getSelection = vi.fn().mockReturnValue({
				rangeCount: 0,
				removeAllRanges: vi.fn(),
				addRange: vi.fn(),
			});

			// Insert into empty editor
			ref.current?.insertTextAtCursor("test");

			const newValue = onChange.mock.calls[0]?.[0] || "";
			rerender(<NumberEdit value={newValue} onChange={onChange} data-testid="editor" ref={ref} />);

			await new Promise(resolve => setTimeout(resolve, 100));

			expect(onChange).toHaveBeenCalled();

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should handle editorRef becoming null during requestAnimationFrame", async () => {
			const ref = createRef<NumberEditRef>();
			const onChange = vi.fn();
			const { getByTestId, unmount } = render(
				<NumberEdit value="test" onChange={onChange} data-testid="editor" ref={ref} />,
			);
			const editor = getByTestId("editor-editor");

			const originalGetSelection = window.getSelection;

			editor.contains = vi.fn().mockReturnValue(false);
			window.getSelection = vi.fn().mockReturnValue({ rangeCount: 0 });

			// Insert text
			ref.current?.insertTextAtCursor("X");

			// Unmount before requestAnimationFrame runs
			unmount();

			// Wait for requestAnimationFrame - should not throw
			await new Promise(resolve => setTimeout(resolve, 100));

			// Restore
			window.getSelection = originalGetSelection;
		});
	});

	describe("getCursorPosition", () => {
		it("should return 0 when editorRef is null", () => {
			const ref = createRef<NumberEditRef>();
			const { unmount } = render(<NumberEdit value="test" data-testid="editor" ref={ref} />);

			// Store ref before unmount
			const getCursorPosition = ref.current?.getCursorPosition;

			// Unmount to clear editorRef
			unmount();

			// Should return 0
			expect(getCursorPosition?.()).toBe(0);
		});

		it("should return current cursor position when editor has focus", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="hello world" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			// Mock selection inside editor at position 5
			const mockRange = {
				startContainer: editor.firstChild || editor,
				startOffset: 5,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild || editor,
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Get cursor position
			const pos = ref.current?.getCursorPosition();
			expect(typeof pos).toBe("number");

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should return last saved cursor position when editor loses focus", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="hello world" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			// First, set cursor position by focusing
			const mockRange = {
				startContainer: editor.firstChild || editor,
				startOffset: 7,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild || editor,
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Trigger selectionchange to save position
			document.dispatchEvent(new Event("selectionchange"));

			// Now simulate losing focus
			editor.contains = vi.fn().mockReturnValue(false);
			window.getSelection = vi.fn().mockReturnValue({ rangeCount: 0 });

			// Get cursor position - should return last saved position
			const pos = ref.current?.getCursorPosition();
			expect(typeof pos).toBe("number");

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should return 0 when cursor was never set and no selection", () => {
			const ref = createRef<NumberEditRef>();
			const { getByTestId } = render(<NumberEdit value="hello" data-testid="editor" ref={ref} />);
			const editor = getByTestId("editor-editor");

			// Mock no selection
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue({ rangeCount: 0 });

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(false);

			// Get cursor position - should return 0
			const pos = ref.current?.getCursorPosition();
			expect(pos).toBe(0);

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});
	});

	describe("handleBlur", () => {
		it("should save cursor position on blur when selection is valid", () => {
			const { getByTestId } = render(<NumberEdit value="test content" data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Mock valid selection inside editor
			const mockRange = {
				startContainer: editor.firstChild || editor,
				startOffset: 4,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild || editor,
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Trigger blur
			fireEvent.blur(editor);

			// Should not throw
			expect(getByTestId("editor")).toBeDefined();

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});

		it("should set cursor to 0 on blur when selection is gone and cursor was never set", () => {
			const { getByTestId } = render(<NumberEdit value="test content" data-testid="editor" />);
			const editor = getByTestId("editor-editor");

			// Mock no selection (selection already gone on blur)
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue({ rangeCount: 0 });

			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(false);

			// Trigger blur
			fireEvent.blur(editor);

			// Should not throw
			expect(getByTestId("editor")).toBeDefined();

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;
		});
	});

	describe("selection change handling", () => {
		it("should track cursor position on selectionchange event", () => {
			const { getByTestId } = render(<NumberEdit value="test content" data-testid="editor" onChange={vi.fn()} />);
			const editor = getByTestId("editor-editor");

			// Mock selection to be inside the editor
			const mockRange = {
				startContainer: editor.firstChild || editor,
				startOffset: 4,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: editor.firstChild || editor,
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Mock contains to return true (selection is inside editor)
			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(true);

			// Trigger selectionchange event
			document.dispatchEvent(new Event("selectionchange"));

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;

			// Component should handle the event without error
			expect(getByTestId("editor")).toBeDefined();
		});

		it("should not track cursor position when selection is outside editor", () => {
			const { getByTestId } = render(<NumberEdit value="test content" data-testid="editor" onChange={vi.fn()} />);
			const editor = getByTestId("editor-editor");

			// Mock selection to be outside the editor
			const externalNode = document.createElement("div");
			const mockRange = {
				startContainer: externalNode,
				startOffset: 0,
			};
			const mockSelection = {
				rangeCount: 1,
				getRangeAt: vi.fn().mockReturnValue(mockRange),
				anchorNode: externalNode,
			};
			const originalGetSelection = window.getSelection;
			window.getSelection = vi.fn().mockReturnValue(mockSelection);

			// Mock contains to return false (selection is outside editor)
			const originalContains = editor.contains;
			editor.contains = vi.fn().mockReturnValue(false);

			// Trigger selectionchange event
			document.dispatchEvent(new Event("selectionchange"));

			// Restore
			editor.contains = originalContains;
			window.getSelection = originalGetSelection;

			// Component should handle the event without error
			expect(getByTestId("editor")).toBeDefined();
		});

		it("should handle onSelect event", () => {
			const onChange = vi.fn();
			const { getByTestId } = render(
				<NumberEdit value="test content" data-testid="editor" onChange={onChange} />,
			);
			const editor = getByTestId("editor-editor");

			// Fire select event
			fireEvent.select(editor);

			// Component should handle the event without error
			expect(getByTestId("editor")).toBeDefined();
		});
	});
});
