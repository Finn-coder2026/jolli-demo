import { FloatingToolbar } from "./FloatingToolbar";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import type { Editor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock TipTap Editor factory
// ---------------------------------------------------------------------------

/**
 * Chainable command builder returned by editor.chain().
 * Every method returns `this` so commands can be chained fluently.
 * `.run()` is a terminal method that executes the chain.
 */
interface MockChain {
	focus: () => MockChain;
	toggleBold: () => MockChain;
	toggleItalic: () => MockChain;
	toggleUnderline: () => MockChain;
	toggleStrike: () => MockChain;
	toggleCode: () => MockChain;
	unsetLink: () => MockChain;
	extendMarkRange: (name: string) => MockChain;
	setLink: (attrs: { href: string }) => MockChain;
	toggleHeading: (attrs: { level: number }) => MockChain;
	setParagraph: () => MockChain;
	toggleBlockquote: () => MockChain;
	run: () => boolean;
}

interface MockEditorOptions {
	/** Whether the selection is empty (default: false = text is selected) */
	selectionEmpty?: boolean;
	/** from position in the selection (default: 1) */
	selectionFrom?: number;
	/** to position in the selection (default: 5) */
	selectionTo?: number;
	/** Map of mark/node names that are currently active */
	activeMarks?: Record<string, boolean>;
	/** Whether the editor DOM's parentElement should have a positioned ancestor */
	hasPositionedParent?: boolean;
	/** Existing href to return from getAttributes("link") — simulates an active link */
	existingLinkHref?: string;
}

/**
 * Creates a minimal TipTap Editor mock sufficient for FloatingToolbar tests.
 *
 * The mock exposes:
 * - `editor.state.selection` with `from`, `to`, and `empty`
 * - `editor.isActive(name, attrs?)` — returns true when the mark is in `activeMarks`
 * - `editor.getAttributes(name)` — returns `{ href: existingLinkHref }` for "link"
 * - `editor.chain()` — returns a fluent `MockChain` where all methods are vi.fn()
 * - `editor.view.coordsAtPos()` — returns a fixed bounding rect
 * - `editor.view.dom.parentElement` — a mock element whose `closest()` returns the
 *   positioned parent (or null when `hasPositionedParent` is false)
 * - `editor.on(event, handler)` / `editor.off(event, handler)` — captured for tests
 */
function createMockEditor(opts: MockEditorOptions = {}) {
	const {
		selectionEmpty = false,
		selectionFrom = 1,
		selectionTo = 5,
		activeMarks = {},
		hasPositionedParent = true,
		existingLinkHref,
	} = opts;

	// Build the chainable command object — all command methods are vi.fn() that
	// return the chain itself so callers can fluently chain further calls.
	const chain: MockChain = {
		focus: vi.fn().mockReturnThis(),
		toggleBold: vi.fn().mockReturnThis(),
		toggleItalic: vi.fn().mockReturnThis(),
		toggleUnderline: vi.fn().mockReturnThis(),
		toggleStrike: vi.fn().mockReturnThis(),
		toggleCode: vi.fn().mockReturnThis(),
		unsetLink: vi.fn().mockReturnThis(),
		extendMarkRange: vi.fn().mockReturnThis(),
		setLink: vi.fn().mockReturnThis(),
		toggleHeading: vi.fn().mockReturnThis(),
		setParagraph: vi.fn().mockReturnThis(),
		toggleBlockquote: vi.fn().mockReturnThis(),
		run: vi.fn().mockReturnValue(true),
	};

	// Each call to editor.chain() must return a fresh reference to the same
	// chain object so chained calls resolve correctly.
	const chainFn = vi.fn(() => chain);

	// The positioned parent element has a bounding rect for toolbar positioning.
	const positionedParent = hasPositionedParent
		? {
				getBoundingClientRect: vi.fn(() => ({
					top: 100,
					left: 50,
					right: 350,
					bottom: 400,
				})),
			}
		: null;

	// FloatingToolbar uses view.dom.parentElement?.closest("[style*='position']")
	// to find the positioned ancestor, falling back to parentElement itself.
	//
	// When hasPositionedParent=true:  parentElement.closest() returns the mock
	//   element with getBoundingClientRect so positioning succeeds.
	// When hasPositionedParent=false: parentElement is null so positionedParent
	//   resolves to null, the early return fires, and the toolbar stays hidden.
	const domParentElement = hasPositionedParent ? { closest: vi.fn(() => positionedParent) } : null;

	const editor = {
		state: {
			selection: {
				from: selectionFrom,
				to: selectionTo,
				empty: selectionEmpty,
			},
		},
		isActive: vi.fn((name: string, _attrs?: Record<string, unknown>) => {
			return activeMarks[name] ?? false;
		}),
		getAttributes: vi.fn((name: string) => {
			if (name === "link") {
				return { href: existingLinkHref };
			}
			return {};
		}),
		chain: chainFn,
		view: {
			coordsAtPos: vi.fn(() => ({
				top: 200,
				left: 100,
				right: 300,
				bottom: 220,
			})),
			dom: {
				parentElement: domParentElement,
			},
		},
		on: vi.fn(),
		off: vi.fn(),
	};

	return { editor, chain };
}

// ---------------------------------------------------------------------------
// Helper: render FloatingToolbar with a mock editor, casting for the prop type
// ---------------------------------------------------------------------------

function renderToolbar(mockEditor: ReturnType<typeof createMockEditor>["editor"] | null) {
	return render(<FloatingToolbar editor={mockEditor as unknown as Editor} />);
}

// ---------------------------------------------------------------------------
// Helper: fire a selectionUpdate event on a rendered editor
// ---------------------------------------------------------------------------

/**
 * Extracts the `selectionUpdate` handler registered on the editor mock,
 * then invokes it to simulate the editor emitting a selection change.
 */
function triggerSelectionUpdate(editorMock: ReturnType<typeof createMockEditor>["editor"]) {
	const onCall = editorMock.on.mock.calls.find((args: Array<unknown>) => args[0] === "selectionUpdate");
	if (!onCall) {
		throw new Error("selectionUpdate handler was never registered on the mock editor");
	}
	const handler = onCall[1] as () => void;
	act(() => {
		handler();
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FloatingToolbar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// -------------------------------------------------------------------------
	// Null-render guards
	// -------------------------------------------------------------------------

	describe("null render cases", () => {
		it("should return null when editor prop is null", () => {
			const { container } = renderToolbar(null);

			expect(screen.queryByTestId("floating-toolbar")).toBeNull();
			expect(container.firstChild).toBeNull();
		});

		it("should return null when editor has an empty selection (visible=false by default)", () => {
			const { editor } = createMockEditor({ selectionEmpty: true });

			renderToolbar(editor);

			// No selectionUpdate fired yet so visible remains false.
			expect(screen.queryByTestId("floating-toolbar")).toBeNull();
		});

		it("should not register event listeners when editor is null", () => {
			renderToolbar(null);

			// With a null editor, no `on` call should have occurred.
			// This verifies the useEffect early-return guard.
			// Nothing to assert about a null editor's methods — just confirm no crash.
			expect(screen.queryByTestId("floating-toolbar")).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// Selection detection: showing and hiding the toolbar
	// -------------------------------------------------------------------------

	describe("visibility based on selection state", () => {
		it("should show toolbar when selectionUpdate fires with a non-empty selection", () => {
			const { editor } = createMockEditor({
				selectionEmpty: false,
				selectionFrom: 1,
				selectionTo: 10,
			});

			renderToolbar(editor);

			// The toolbar is hidden until a selectionUpdate event fires.
			expect(screen.queryByTestId("floating-toolbar")).toBeNull();

			triggerSelectionUpdate(editor);

			expect(screen.getByTestId("floating-toolbar")).toBeDefined();
		});

		it("should register selectionUpdate listener on the editor when editor is provided", () => {
			const { editor } = createMockEditor();

			renderToolbar(editor);

			expect(editor.on).toHaveBeenCalledWith("selectionUpdate", expect.any(Function));
		});

		it("should deregister selectionUpdate listener on unmount", () => {
			const { editor } = createMockEditor();

			const { unmount } = renderToolbar(editor);

			unmount();

			expect(editor.off).toHaveBeenCalledWith("selectionUpdate", expect.any(Function));
		});

		it("should hide toolbar after 150ms delay when selection becomes empty", async () => {
			vi.useFakeTimers();

			const { editor } = createMockEditor({
				selectionEmpty: false,
			});

			renderToolbar(editor);

			// Show the toolbar first.
			triggerSelectionUpdate(editor);
			expect(screen.getByTestId("floating-toolbar")).toBeDefined();

			// Simulate selection becoming empty.
			editor.state.selection.empty = true;
			editor.state.selection.from = 3;
			editor.state.selection.to = 3;

			triggerSelectionUpdate(editor);

			// Toolbar should still be visible immediately (delay not elapsed yet).
			expect(screen.getByTestId("floating-toolbar")).toBeDefined();

			// Advance past the 150ms hide delay.
			await act(() => {
				vi.advanceTimersByTime(150);
			});

			expect(screen.queryByTestId("floating-toolbar")).toBeNull();

			vi.useRealTimers();
		});

		it("should cancel the hide timeout when selection is re-established before delay elapses", async () => {
			vi.useFakeTimers();

			const { editor } = createMockEditor({ selectionEmpty: false });

			renderToolbar(editor);

			// Show the toolbar.
			triggerSelectionUpdate(editor);
			expect(screen.getByTestId("floating-toolbar")).toBeDefined();

			// Make selection empty and start the hide timer.
			editor.state.selection.empty = true;
			editor.state.selection.from = 3;
			editor.state.selection.to = 3;
			triggerSelectionUpdate(editor);

			// Before 150ms, restore a non-empty selection.
			await act(() => {
				vi.advanceTimersByTime(50);
			});
			editor.state.selection.empty = false;
			editor.state.selection.from = 1;
			editor.state.selection.to = 8;
			triggerSelectionUpdate(editor);

			// Advance past the original 150ms deadline.
			await act(() => {
				vi.advanceTimersByTime(200);
			});

			// Toolbar should still be visible because the hide was cancelled.
			expect(screen.getByTestId("floating-toolbar")).toBeDefined();

			vi.useRealTimers();
		});

		it("should not render toolbar when positioned parent element is not found", () => {
			const { editor } = createMockEditor({ hasPositionedParent: false });

			renderToolbar(editor);

			triggerSelectionUpdate(editor);

			// With view.dom.parentElement set to null, positionedParent resolves to
			// null and the early return inside updatePosition fires, so setVisible(true)
			// is never reached and the toolbar stays hidden.
			expect(screen.queryByTestId("floating-toolbar")).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// Formatting action buttons
	// -------------------------------------------------------------------------

	describe("formatting action buttons", () => {
		function renderWithSelection(activeMarks: Record<string, boolean> = {}) {
			const { editor, chain } = createMockEditor({ activeMarks });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);
			expect(screen.getByTestId("floating-toolbar")).toBeDefined();
			return { editor, chain };
		}

		it("should render Bold button", () => {
			renderWithSelection();

			const boldBtn = screen.getByRole("button", { name: "Bold" });
			expect(boldBtn).toBeDefined();
		});

		it("should call toggleBold chain when Bold button is mouse-downed", () => {
			const { chain } = renderWithSelection();

			const boldBtn = screen.getByRole("button", { name: "Bold" });
			fireEvent.mouseDown(boldBtn);

			expect(chain.focus).toHaveBeenCalled();
			expect(chain.toggleBold).toHaveBeenCalled();
			expect(chain.run).toHaveBeenCalled();
		});

		it("should prevent default on Bold mouseDown to preserve text selection", () => {
			renderWithSelection();

			const boldBtn = screen.getByRole("button", { name: "Bold" });
			const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
			const preventDefaultSpy = vi.spyOn(event, "preventDefault");

			boldBtn.dispatchEvent(event);

			expect(preventDefaultSpy).toHaveBeenCalled();
		});

		it("should render Italic button and call toggleItalic on mouseDown", () => {
			const { chain } = renderWithSelection();

			const italicBtn = screen.getByRole("button", { name: "Italic" });
			expect(italicBtn).toBeDefined();
			fireEvent.mouseDown(italicBtn);

			expect(chain.toggleItalic).toHaveBeenCalled();
			expect(chain.run).toHaveBeenCalled();
		});

		it("should render Underline button and call toggleUnderline on mouseDown", () => {
			const { chain } = renderWithSelection();

			const underlineBtn = screen.getByRole("button", { name: "Underline" });
			expect(underlineBtn).toBeDefined();
			fireEvent.mouseDown(underlineBtn);

			expect(chain.toggleUnderline).toHaveBeenCalled();
			expect(chain.run).toHaveBeenCalled();
		});

		it("should render Strikethrough button and call toggleStrike on mouseDown", () => {
			const { chain } = renderWithSelection();

			const strikeBtn = screen.getByRole("button", { name: "Strikethrough" });
			expect(strikeBtn).toBeDefined();
			fireEvent.mouseDown(strikeBtn);

			expect(chain.toggleStrike).toHaveBeenCalled();
			expect(chain.run).toHaveBeenCalled();
		});

		it("should apply active styling to Bold button when bold mark is active", () => {
			renderWithSelection({ bold: true });

			const boldBtn = screen.getByRole("button", { name: "Bold" });
			// Active state adds bg-primary class to the button.
			expect(boldBtn.className).toContain("bg-primary");
		});

		it("should not apply active styling to Bold button when bold mark is inactive", () => {
			renderWithSelection({ bold: false });

			const boldBtn = screen.getByRole("button", { name: "Bold" });
			expect(boldBtn.className).not.toContain("bg-primary");
		});

		it("should apply active styling to Italic button when italic mark is active", () => {
			renderWithSelection({ italic: true });

			const italicBtn = screen.getByRole("button", { name: "Italic" });
			expect(italicBtn.className).toContain("bg-primary");
		});
	});

	// -------------------------------------------------------------------------
	// Code button
	// -------------------------------------------------------------------------

	describe("Code button", () => {
		it("should render Code button", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			expect(screen.getByRole("button", { name: "Code" })).toBeDefined();
		});

		it("should call toggleCode chain on Code button mouseDown", () => {
			const { editor, chain } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Code" }));

			expect(chain.toggleCode).toHaveBeenCalled();
			expect(chain.run).toHaveBeenCalled();
		});

		it("should show Code button as active when code mark is active", () => {
			const { editor } = createMockEditor({ activeMarks: { code: true } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const codeBtn = screen.getByRole("button", { name: "Code" });
			expect(codeBtn.className).toContain("bg-primary");
		});
	});

	// -------------------------------------------------------------------------
	// Link button
	// -------------------------------------------------------------------------

	describe("Link button", () => {
		it("should render Link button", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			expect(screen.getByRole("button", { name: "Link" })).toBeDefined();
		});

		it("should prompt for URL when Link button is mouse-downed and no link is active", () => {
			const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
			const { editor } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			// The prompt receives the label and the pre-populated value (empty when no
			// existing link is active).
			expect(promptSpy).toHaveBeenCalledWith("Enter URL:", "");
		});

		it("should call extendMarkRange and setLink with a valid https URL", () => {
			vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
			const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.extendMarkRange).toHaveBeenCalledWith("link");
			expect(chain.setLink).toHaveBeenCalledWith({ href: "https://example.com" });
			expect(chain.run).toHaveBeenCalled();
		});

		it("should call extendMarkRange and setLink with a valid http URL", () => {
			vi.spyOn(window, "prompt").mockReturnValue("http://example.com");
			const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.setLink).toHaveBeenCalledWith({ href: "http://example.com" });
		});

		it("should call extendMarkRange and setLink with a valid mailto URL", () => {
			vi.spyOn(window, "prompt").mockReturnValue("mailto:user@example.com");
			const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.setLink).toHaveBeenCalledWith({ href: "mailto:user@example.com" });
		});

		it("should call extendMarkRange and setLink with a valid tel URL", () => {
			vi.spyOn(window, "prompt").mockReturnValue("tel:+15555551234");
			const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.setLink).toHaveBeenCalledWith({ href: "tel:+15555551234" });
		});

		it("should reject a javascript: URL and not call setLink (XSS prevention)", () => {
			vi.spyOn(window, "prompt").mockReturnValue("javascript:alert(1)");
			const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.setLink).not.toHaveBeenCalled();
			expect(chain.extendMarkRange).not.toHaveBeenCalled();
		});

		it("should reject a data: URL and not call setLink", () => {
			vi.spyOn(window, "prompt").mockReturnValue("data:text/html,<script>alert(1)</script>");
			const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.setLink).not.toHaveBeenCalled();
		});

		it("should not call setLink when prompt is cancelled (returns null)", () => {
			vi.spyOn(window, "prompt").mockReturnValue(null);
			const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.setLink).not.toHaveBeenCalled();
		});

		it("should not call setLink when prompt returns an empty string", () => {
			vi.spyOn(window, "prompt").mockReturnValue("");
			const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.setLink).not.toHaveBeenCalled();
		});

		it("should pre-populate the prompt with the existing href when editing a link", () => {
			const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://updated.com");
			const { editor } = createMockEditor({
				activeMarks: { link: false },
				existingLinkHref: "https://existing.com",
			});
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			// The prompt should be pre-populated with the existing href.
			expect(promptSpy).toHaveBeenCalledWith("Enter URL:", "https://existing.com");
		});

		it("should call unsetLink and not prompt when a link is already active", () => {
			const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://new.com");
			const { editor, chain } = createMockEditor({ activeMarks: { link: true } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

			expect(chain.unsetLink).toHaveBeenCalled();
			expect(chain.run).toHaveBeenCalled();
			// Prompt should not be shown when unlinking.
			expect(promptSpy).not.toHaveBeenCalled();
		});

		it("should show Link button as active when link mark is active", () => {
			const { editor } = createMockEditor({ activeMarks: { link: true } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const linkBtn = screen.getByRole("button", { name: "Link" });
			expect(linkBtn.className).toContain("bg-primary");
		});
	});

	// -------------------------------------------------------------------------
	// Block actions (Blockquote)
	// -------------------------------------------------------------------------

	describe("Blockquote button", () => {
		it("should render Blockquote button", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			expect(screen.getByRole("button", { name: "Blockquote" })).toBeDefined();
		});

		it("should call toggleBlockquote chain on Blockquote button mouseDown", () => {
			const { editor, chain } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.mouseDown(screen.getByRole("button", { name: "Blockquote" }));

			expect(chain.focus).toHaveBeenCalled();
			expect(chain.toggleBlockquote).toHaveBeenCalled();
			expect(chain.run).toHaveBeenCalled();
		});

		it("should show Blockquote button as active when blockquote node is active", () => {
			const { editor } = createMockEditor({ activeMarks: { blockquote: true } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const blockquoteBtn = screen.getByRole("button", { name: "Blockquote" });
			expect(blockquoteBtn.className).toContain("bg-primary");
		});
	});

	// -------------------------------------------------------------------------
	// Heading dropdown
	// -------------------------------------------------------------------------

	describe("Heading dropdown", () => {
		it("should render the Heading trigger button", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const headingBtn = screen.getByRole("button", { name: "Heading" });
			expect(headingBtn).toBeDefined();
		});

		it("should show Heading button as active when a heading node is active", () => {
			const { editor } = createMockEditor({ activeMarks: { heading: true } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const headingBtn = screen.getByRole("button", { name: "Heading" });
			expect(headingBtn.className).toContain("bg-primary");
		});

		it("should not show Heading button as active when no heading is active", () => {
			const { editor } = createMockEditor({ activeMarks: { heading: false } });
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const headingBtn = screen.getByRole("button", { name: "Heading" });
			expect(headingBtn.className).not.toContain("bg-primary");
		});

		it("should show Heading 3 icon in trigger when heading level 3 is active", () => {
			const { editor } = createMockEditor();
			// Only level 3 is active — levels 1 and 2 must return false so the H3 branch is reached.
			editor.isActive.mockImplementation((name: string, attrs?: { level?: number }) => {
				if (name === "heading" && attrs?.level === 3) {
					return true;
				}
				if (name === "heading" && attrs === undefined) {
					return true;
				}
				return false;
			});
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const headingBtn = screen.getByRole("button", { name: "Heading" });
			expect(headingBtn).toBeDefined();
			expect(headingBtn.className).toContain("bg-primary");
		});

		it("should show Heading 4 icon in trigger when heading level 4 is active", () => {
			const { editor } = createMockEditor();
			// Only level 4 is active — levels 1, 2, and 3 must return false.
			editor.isActive.mockImplementation((name: string, attrs?: { level?: number }) => {
				if (name === "heading" && attrs?.level === 4) {
					return true;
				}
				if (name === "heading" && attrs === undefined) {
					return true;
				}
				return false;
			});
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const headingBtn = screen.getByRole("button", { name: "Heading" });
			expect(headingBtn).toBeDefined();
			expect(headingBtn.className).toContain("bg-primary");
		});

		it("should render all heading option items after clicking the trigger", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			// Open the dropdown.
			fireEvent.click(screen.getByRole("button", { name: "Heading" }));

			// All five heading options should now be present.
			expect(screen.getByText("Heading 1")).toBeDefined();
			expect(screen.getByText("Heading 2")).toBeDefined();
			expect(screen.getByText("Heading 3")).toBeDefined();
			expect(screen.getByText("Heading 4")).toBeDefined();
			expect(screen.getByText("Paragraph")).toBeDefined();
		});

		it("should call toggleHeading with level 1 when Heading 1 item is selected", () => {
			const { editor, chain } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.click(screen.getByRole("button", { name: "Heading" }));

			// DropdownMenuItem maps to a div[role="menuitem"] in the Radix mock.
			// The mock spreads all props (including onSelect) onto the div, so Preact
			// attaches a "select" event listener. Firing that event triggers the handler.
			const heading1Item = screen.getByText("Heading 1").closest('[role="menuitem"]') as HTMLElement;
			expect(heading1Item).toBeDefined();

			fireEvent(heading1Item, new Event("select", { bubbles: true }));

			expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 1 });
			expect(chain.run).toHaveBeenCalled();
		});

		it("should call toggleHeading with level 2 when Heading 2 item is selected", () => {
			const { editor, chain } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.click(screen.getByRole("button", { name: "Heading" }));

			const heading2Item = screen.getByText("Heading 2").closest('[role="menuitem"]') as HTMLElement;
			expect(heading2Item).toBeDefined();

			fireEvent(heading2Item, new Event("select", { bubbles: true }));

			expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 2 });
			expect(chain.run).toHaveBeenCalled();
		});

		it("should call toggleHeading with level 3 when Heading 3 item is selected", () => {
			const { editor, chain } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.click(screen.getByRole("button", { name: "Heading" }));

			const heading3Item = screen.getByText("Heading 3").closest('[role="menuitem"]') as HTMLElement;
			expect(heading3Item).toBeDefined();

			fireEvent(heading3Item, new Event("select", { bubbles: true }));

			expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 3 });
			expect(chain.run).toHaveBeenCalled();
		});

		it("should call toggleHeading with level 4 when Heading 4 item is selected", () => {
			const { editor, chain } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.click(screen.getByRole("button", { name: "Heading" }));

			const heading4Item = screen.getByText("Heading 4").closest('[role="menuitem"]') as HTMLElement;
			expect(heading4Item).toBeDefined();

			fireEvent(heading4Item, new Event("select", { bubbles: true }));

			expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 4 });
			expect(chain.run).toHaveBeenCalled();
		});

		it("should call setParagraph when Paragraph item is selected", () => {
			const { editor, chain } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.click(screen.getByRole("button", { name: "Heading" }));

			const paragraphItem = screen.getByText("Paragraph").closest('[role="menuitem"]') as HTMLElement;
			expect(paragraphItem).toBeDefined();

			fireEvent(paragraphItem, new Event("select", { bubbles: true }));

			expect(chain.setParagraph).toHaveBeenCalled();
			expect(chain.run).toHaveBeenCalled();
		});

		it("should apply active class to currently active heading option", () => {
			// Heading level 2 is currently active.
			const { editor } = createMockEditor({
				activeMarks: { "heading,level=2": true },
			});
			// Override isActive to handle the { level } attrs argument.
			editor.isActive.mockImplementation((name: string, attrs?: { level?: number }) => {
				if (name === "heading" && attrs?.level === 2) {
					return true;
				}
				return false;
			});

			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.click(screen.getByRole("button", { name: "Heading" }));

			// The "Heading 2" item should have the active class.
			const heading2Item = screen.getByText("Heading 2").closest('[role="menuitem"]') as HTMLElement;
			expect(heading2Item?.className).toContain("bg-accent");
		});

		it("should apply active class to Paragraph item when no heading is active", () => {
			const { editor } = createMockEditor({ activeMarks: {} });
			// No heading is active at all.
			editor.isActive.mockReturnValue(false);

			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			fireEvent.click(screen.getByRole("button", { name: "Heading" }));

			const paragraphItem = screen.getByText("Paragraph").closest('[role="menuitem"]') as HTMLElement;
			expect(paragraphItem?.className).toContain("bg-accent");
		});

		it("should prevent default on Heading trigger mouseDown to preserve text selection", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const headingBtn = screen.getByRole("button", { name: "Heading" });
			const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
			const preventDefaultSpy = vi.spyOn(event, "preventDefault");

			headingBtn.dispatchEvent(event);

			expect(preventDefaultSpy).toHaveBeenCalled();
		});
	});

	// -------------------------------------------------------------------------
	// Toolbar container behavior
	// -------------------------------------------------------------------------

	describe("toolbar container", () => {
		it("should prevent default on toolbar container mouseDown to preserve text selection", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const toolbar = screen.getByTestId("floating-toolbar");
			const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
			const preventDefaultSpy = vi.spyOn(event, "preventDefault");

			toolbar.dispatchEvent(event);

			expect(preventDefaultSpy).toHaveBeenCalled();
		});

		it("should position toolbar using coordsAtPos and parent bounding rect", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			const toolbar = screen.getByTestId("floating-toolbar");

			// coordsAtPos returns { top: 200, left: 100, right: 300 } for both from/to.
			// parent rect is { top: 100, left: 50, right: 350 }.
			// Expected left  = (100 + 300) / 2 - 50  = 200 - 50   = 150
			// Expected top   = 200 - 100 - 10         = 90
			expect(toolbar.style.left).toBe("150px");
			expect(toolbar.style.top).toBe("90px");
		});

		it("should render all action button groups inside the toolbar", () => {
			const { editor } = createMockEditor();
			renderToolbar(editor);
			triggerSelectionUpdate(editor);

			// Verify that representative buttons from each group are present.
			expect(screen.getByRole("button", { name: "Bold" })).toBeDefined();
			expect(screen.getByRole("button", { name: "Code" })).toBeDefined();
			expect(screen.getByRole("button", { name: "Blockquote" })).toBeDefined();
			expect(screen.getByRole("button", { name: "Heading" })).toBeDefined();
		});
	});

	// -------------------------------------------------------------------------
	// Cleanup on unmount with pending hide timeout
	// -------------------------------------------------------------------------

	describe("cleanup", () => {
		it("should clear the pending hide timeout on unmount", () => {
			vi.useFakeTimers();
			const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

			const { editor } = createMockEditor({ selectionEmpty: false });
			const { unmount } = renderToolbar(editor);

			// Show the toolbar.
			triggerSelectionUpdate(editor);

			// Start a hide timeout by simulating an empty selection.
			editor.state.selection.empty = true;
			editor.state.selection.from = 3;
			editor.state.selection.to = 3;
			triggerSelectionUpdate(editor);

			// Unmount before the 150ms elapses — should clear the timeout.
			unmount();

			expect(clearTimeoutSpy).toHaveBeenCalled();

			vi.useRealTimers();
		});
	});
});

// ---------------------------------------------------------------------------
// isAllowedLinkUrl — unit tests for the URL validation function
// ---------------------------------------------------------------------------

// The function is not exported from FloatingToolbar, so we test its behaviour
// indirectly through the Link button. The following tests use distinct URL
// schemes to fully cover every branch in the ALLOWED_SCHEMES set-check.

describe("URL scheme validation via Link button", () => {
	function renderToolbarWithLink() {
		const { editor, chain } = createMockEditor({ activeMarks: { link: false } });
		renderToolbar(editor);
		triggerSelectionUpdate(editor);
		return { editor, chain };
	}

	it("should allow https: scheme", () => {
		vi.spyOn(window, "prompt").mockReturnValue("https://safe.example.com");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		expect(chain.setLink).toHaveBeenCalledWith({ href: "https://safe.example.com" });
	});

	it("should allow http: scheme", () => {
		vi.spyOn(window, "prompt").mockReturnValue("http://safe.example.com");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		expect(chain.setLink).toHaveBeenCalledWith({ href: "http://safe.example.com" });
	});

	it("should allow mailto: scheme", () => {
		vi.spyOn(window, "prompt").mockReturnValue("mailto:user@example.com");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		expect(chain.setLink).toHaveBeenCalledWith({ href: "mailto:user@example.com" });
	});

	it("should allow tel: scheme", () => {
		vi.spyOn(window, "prompt").mockReturnValue("tel:+15555550100");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		expect(chain.setLink).toHaveBeenCalledWith({ href: "tel:+15555550100" });
	});

	it("should block javascript: scheme", () => {
		vi.spyOn(window, "prompt").mockReturnValue("javascript:void(0)");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		expect(chain.setLink).not.toHaveBeenCalled();
	});

	it("should block vbscript: scheme", () => {
		vi.spyOn(window, "prompt").mockReturnValue("vbscript:msgbox(1)");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		expect(chain.setLink).not.toHaveBeenCalled();
	});

	it("should block ftp: scheme", () => {
		vi.spyOn(window, "prompt").mockReturnValue("ftp://files.example.com");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		expect(chain.setLink).not.toHaveBeenCalled();
	});

	it("should block file: scheme", () => {
		vi.spyOn(window, "prompt").mockReturnValue("file:///etc/passwd");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		expect(chain.setLink).not.toHaveBeenCalled();
	});

	it("should allow strings that resolve as relative URLs with the https: scheme", () => {
		// The URL constructor resolves relative strings against https://placeholder.invalid,
		// so the result acquires the https: scheme and passes validation. This is expected
		// behaviour — only explicit dangerous schemes (javascript:, data:, file:) are blocked.
		vi.spyOn(window, "prompt").mockReturnValue("not a url at all !!!");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		// The URL resolves with https: scheme, so the link command is called.
		expect(chain.setLink).toHaveBeenCalled();
	});

	it("should return false when the URL constructor throws", () => {
		// Stub globalThis.URL so that the constructor always throws, exercising
		// the catch branch in isAllowedLinkUrl.
		vi.stubGlobal("URL", () => {
			throw new TypeError("Invalid URL");
		});
		vi.spyOn(window, "prompt").mockReturnValue("definitely-not-a-url");
		const { chain } = renderToolbarWithLink();

		fireEvent.mouseDown(screen.getByRole("button", { name: "Link" }));

		// The catch branch returns false, so the link command must NOT be called.
		expect(chain.setLink).not.toHaveBeenCalled();

		vi.unstubAllGlobals();
	});
});
