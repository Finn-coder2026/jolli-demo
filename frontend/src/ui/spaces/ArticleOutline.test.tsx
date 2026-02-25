import { ArticleOutline, extractHeadingsFromEditor, type OutlineHeading } from "./ArticleOutline";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		onThisPage: "On this page",
	}),
}));

// Mock only the specific lucide icon used in this component, keeping all others real
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		ChevronRight: () => <span data-testid="chevron-right-icon" />,
	};
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function createHeading(id: string, text: string, level: OutlineHeading["level"]): OutlineHeading {
	return { id, text, level };
}

function createDefaultHeadings(): Array<OutlineHeading> {
	return [
		createHeading("heading-introduction", "Introduction", 1),
		createHeading("heading-overview", "Overview", 2),
		createHeading("heading-details", "Details", 3),
		createHeading("heading-notes", "Notes", 4),
	];
}

// ─── ArticleOutline component ────────────────────────────────────────────────

describe("ArticleOutline", () => {
	const mockOnHeadingClick = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ─── Null / empty state ──────────────────────────────────────────────────

	describe("empty headings", () => {
		it("should return null when headings array is empty", () => {
			const { container } = render(
				<ArticleOutline headings={[]} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />,
			);

			expect(container.firstChild).toBeNull();
		});
	});

	// ─── Minimized bar rendering ─────────────────────────────────────────────

	describe("minimized bar view", () => {
		it("should render the outline container when headings are present", () => {
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			expect(screen.getByTestId("article-outline")).toBeDefined();
		});

		it("should only render bars for H1 and H2 headings", () => {
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			// H1 and H2 bars should be visible
			expect(screen.getByTestId("outline-bar-heading-introduction")).toBeDefined();
			expect(screen.getByTestId("outline-bar-heading-overview")).toBeDefined();

			// H3 and H4 bars should not appear in the minimized view
			expect(screen.queryByTestId("outline-bar-heading-details")).toBeNull();
			expect(screen.queryByTestId("outline-bar-heading-notes")).toBeNull();
		});

		it("should render only H1 bars when all headings are H1", () => {
			const headings: Array<OutlineHeading> = [
				createHeading("heading-first", "First", 1),
				createHeading("heading-second", "Second", 1),
			];

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			expect(screen.getByTestId("outline-bar-heading-first")).toBeDefined();
			expect(screen.getByTestId("outline-bar-heading-second")).toBeDefined();
		});

		it("should render no bars when all headings are H3 or H4", () => {
			const headings: Array<OutlineHeading> = [
				createHeading("heading-details", "Details", 3),
				createHeading("heading-notes", "Notes", 4),
			];

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			// Container still renders because headings.length > 0
			expect(screen.getByTestId("article-outline")).toBeDefined();
			// But no bar buttons for H3/H4
			expect(screen.queryByTestId("outline-bar-heading-details")).toBeNull();
			expect(screen.queryByTestId("outline-bar-heading-notes")).toBeNull();
		});

		it("should apply w-6 width class to H1 bar buttons", () => {
			const headings: Array<OutlineHeading> = [createHeading("heading-title", "Title", 1)];

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			const bar = screen.getByTestId("outline-bar-heading-title");
			expect(bar.className).toContain("w-6");
		});

		it("should apply w-4 width class to H2 bar buttons", () => {
			const headings: Array<OutlineHeading> = [createHeading("heading-section", "Section", 2)];

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			const bar = screen.getByTestId("outline-bar-heading-section");
			expect(bar.className).toContain("w-4");
		});
	});

	// ─── Active heading highlighting ─────────────────────────────────────────

	describe("active heading highlighting", () => {
		it("should apply bg-primary class to the active heading bar", () => {
			const headings: Array<OutlineHeading> = [
				createHeading("heading-intro", "Intro", 1),
				createHeading("heading-body", "Body", 2),
			];

			render(
				<ArticleOutline
					headings={headings}
					activeHeadingId="heading-intro"
					onHeadingClick={mockOnHeadingClick}
				/>,
			);

			const activeBar = screen.getByTestId("outline-bar-heading-intro");
			const inactiveBar = screen.getByTestId("outline-bar-heading-body");

			expect(activeBar.className).toContain("bg-primary");
			expect(inactiveBar.className).not.toContain("bg-primary");
		});

		it("should not apply bg-primary to any bar when activeHeadingId is null", () => {
			const headings: Array<OutlineHeading> = [
				createHeading("heading-intro", "Intro", 1),
				createHeading("heading-body", "Body", 2),
			];

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			const bars = screen.getByTestId("article-outline").querySelectorAll("[data-testid^='outline-bar-']");

			for (const bar of bars) {
				expect(bar.className).not.toContain("bg-primary");
			}
		});

		it("should apply bg-primary only to the matching active heading bar", () => {
			const headings: Array<OutlineHeading> = [
				createHeading("heading-one", "One", 1),
				createHeading("heading-two", "Two", 2),
			];

			render(
				<ArticleOutline
					headings={headings}
					activeHeadingId="heading-two"
					onHeadingClick={mockOnHeadingClick}
				/>,
			);

			expect(screen.getByTestId("outline-bar-heading-two").className).toContain("bg-primary");
			expect(screen.getByTestId("outline-bar-heading-one").className).not.toContain("bg-primary");
		});
	});

	// ─── Bar click interaction ───────────────────────────────────────────────

	describe("bar click interaction", () => {
		it("should call onHeadingClick with the heading ID when a bar is clicked", () => {
			const headings: Array<OutlineHeading> = [createHeading("heading-intro", "Intro", 1)];

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			fireEvent.click(screen.getByTestId("outline-bar-heading-intro"));

			expect(mockOnHeadingClick).toHaveBeenCalledTimes(1);
			expect(mockOnHeadingClick).toHaveBeenCalledWith("heading-intro");
		});

		it("should call onHeadingClick with the correct ID for each bar clicked", () => {
			const headings: Array<OutlineHeading> = [
				createHeading("heading-first", "First", 1),
				createHeading("heading-second", "Second", 2),
			];

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			fireEvent.click(screen.getByTestId("outline-bar-heading-second"));

			expect(mockOnHeadingClick).toHaveBeenCalledWith("heading-second");
		});
	});

	// ─── Expanded overlay — show / hide ──────────────────────────────────────

	describe("expanded overlay visibility", () => {
		it("should not render the overlay by default", () => {
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			expect(screen.queryByTestId("article-outline-expanded")).toBeNull();
		});

		it("should show the expanded overlay on mouse enter", () => {
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			const outline = screen.getByTestId("article-outline");

			// Wrap in act so the useEffect that sets overlayPos flushes synchronously
			act(() => {
				fireEvent.mouseEnter(outline);
			});

			// Overlay is rendered into a portal on document.body
			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).not.toBeNull();
		});

		it("should hide the overlay after 300ms on mouse leave", () => {
			vi.useFakeTimers();
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			const outline = screen.getByTestId("article-outline");

			// Show the overlay — wrap in act so useEffect for overlayPos flushes
			act(() => {
				fireEvent.mouseEnter(outline);
			});
			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).not.toBeNull();

			// Trigger hide
			fireEvent.mouseLeave(outline);

			// Before timeout fires, overlay is still visible
			act(() => {
				vi.advanceTimersByTime(299);
			});
			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).not.toBeNull();

			// After 300ms, overlay disappears
			act(() => {
				vi.advanceTimersByTime(1);
			});
			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).toBeNull();
		});

		it("should cancel the hide timeout when mouse re-enters the bars", () => {
			vi.useFakeTimers();
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			const outline = screen.getByTestId("article-outline");

			// Open overlay — wrap in act so useEffect for overlayPos flushes
			act(() => {
				fireEvent.mouseEnter(outline);
			});
			fireEvent.mouseLeave(outline);

			// Advance partially — within debounce window
			act(() => {
				vi.advanceTimersByTime(150);
			});

			// Re-enter should cancel the hide timer
			fireEvent.mouseEnter(outline);

			// Let the original timeout expire (had 300ms, started at t=0)
			act(() => {
				vi.advanceTimersByTime(300);
			});

			// Overlay should still be visible
			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).not.toBeNull();
		});
	});

	// ─── Expanded overlay content ────────────────────────────────────────────

	describe("expanded overlay content", () => {
		function openOverlay(headings: Array<OutlineHeading>): void {
			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);
			// Wrap in act so the useEffect that sets overlayPos flushes before assertions
			act(() => {
				fireEvent.mouseEnter(screen.getByTestId("article-outline"));
			});
		}

		it("should render the 'On this page' header in the overlay", () => {
			openOverlay(createDefaultHeadings());

			const overlay = document.body.querySelector("[data-testid='article-outline-expanded']");
			expect(overlay).not.toBeNull();
			expect(overlay?.textContent).toContain("On this page");
		});

		it("should display all heading levels (H1-H4) in the expanded overlay", () => {
			const headings = createDefaultHeadings();
			openOverlay(headings);

			expect(screen.getByTestId("outline-item-heading-introduction")).toBeDefined();
			expect(screen.getByTestId("outline-item-heading-overview")).toBeDefined();
			expect(screen.getByTestId("outline-item-heading-details")).toBeDefined();
			expect(screen.getByTestId("outline-item-heading-notes")).toBeDefined();
		});

		it("should show heading text in the overlay items", () => {
			openOverlay(createDefaultHeadings());

			const introItem = screen.getByTestId("outline-item-heading-introduction");
			expect(introItem.textContent).toContain("Introduction");
		});

		it("should apply pl-5 and text-xs classes to H3 heading items", () => {
			const headings: Array<OutlineHeading> = [createHeading("heading-sub", "Sub Section", 3)];
			openOverlay(headings);

			const item = screen.getByTestId("outline-item-heading-sub");
			expect(item.className).toContain("pl-5");
			expect(item.className).toContain("text-xs");
		});

		it("should apply pl-8 and text-xs classes to H4 heading items", () => {
			const headings: Array<OutlineHeading> = [createHeading("heading-deep", "Deep Note", 4)];
			openOverlay(headings);

			const item = screen.getByTestId("outline-item-heading-deep");
			expect(item.className).toContain("pl-8");
			expect(item.className).toContain("text-xs");
		});

		it("should apply font-semibold class to H1 heading items", () => {
			const headings: Array<OutlineHeading> = [createHeading("heading-title", "Main Title", 1)];
			openOverlay(headings);

			const item = screen.getByTestId("outline-item-heading-title");
			expect(item.className).toContain("font-semibold");
		});

		it("should not apply deep-indent classes to H1 or H2 items", () => {
			const headings: Array<OutlineHeading> = [
				createHeading("heading-h1", "H1 Item", 1),
				createHeading("heading-h2", "H2 Item", 2),
			];
			openOverlay(headings);

			const h1Item = screen.getByTestId("outline-item-heading-h1");
			const h2Item = screen.getByTestId("outline-item-heading-h2");

			expect(h1Item.className).not.toContain("pl-5");
			expect(h1Item.className).not.toContain("pl-8");
			expect(h2Item.className).not.toContain("pl-5");
			expect(h2Item.className).not.toContain("pl-8");
		});

		it("should highlight the active heading in the overlay with bg-primary/10", () => {
			const headings: Array<OutlineHeading> = [
				createHeading("heading-active", "Active Heading", 2),
				createHeading("heading-inactive", "Inactive Heading", 2),
			];

			render(
				<ArticleOutline
					headings={headings}
					activeHeadingId="heading-active"
					onHeadingClick={mockOnHeadingClick}
				/>,
			);
			act(() => {
				fireEvent.mouseEnter(screen.getByTestId("article-outline"));
			});

			const activeItem = screen.getByTestId("outline-item-heading-active");
			const inactiveItem = screen.getByTestId("outline-item-heading-inactive");

			expect(activeItem.className).toContain("bg-primary/10");
			expect(inactiveItem.className).not.toContain("bg-primary/10");
		});
	});

	// ─── Overlay click interactions ──────────────────────────────────────────

	describe("overlay click interactions", () => {
		it("should call onHeadingClick with the heading ID when an overlay item is clicked", () => {
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			act(() => {
				fireEvent.mouseEnter(screen.getByTestId("article-outline"));
			});

			fireEvent.click(screen.getByTestId("outline-item-heading-details"));

			expect(mockOnHeadingClick).toHaveBeenCalledTimes(1);
			expect(mockOnHeadingClick).toHaveBeenCalledWith("heading-details");
		});

		it("should close the overlay when an overlay item is clicked", () => {
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			act(() => {
				fireEvent.mouseEnter(screen.getByTestId("article-outline"));
			});
			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).not.toBeNull();

			fireEvent.click(screen.getByTestId("outline-item-heading-introduction"));

			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).toBeNull();
		});

		it("should call onHeadingClick with H1 heading ID from overlay", () => {
			const headings: Array<OutlineHeading> = [createHeading("heading-main", "Main Heading", 1)];

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			act(() => {
				fireEvent.mouseEnter(screen.getByTestId("article-outline"));
			});
			fireEvent.click(screen.getByTestId("outline-item-heading-main"));

			expect(mockOnHeadingClick).toHaveBeenCalledWith("heading-main");
		});
	});

	// ─── Overlay mouse enter keeps it open ───────────────────────────────────

	describe("overlay mouse enter / leave behaviour", () => {
		it("should keep the overlay open when mouse moves from bars into the overlay", () => {
			vi.useFakeTimers();
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			const outline = screen.getByTestId("article-outline");

			// Open overlay — wrap in act so useEffect for overlayPos flushes
			act(() => {
				fireEvent.mouseEnter(outline);
			});
			fireEvent.mouseLeave(outline);

			// Simulate mouse entering the overlay before the timeout fires
			const overlay = document.body.querySelector<HTMLElement>("[data-testid='article-outline-expanded']");
			expect(overlay).not.toBeNull();
			if (overlay) {
				fireEvent.mouseEnter(overlay);
			}

			// Advance past the 300ms window
			act(() => {
				vi.advanceTimersByTime(500);
			});

			// Overlay should still be visible because overlay mouseEnter cancelled the timer
			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).not.toBeNull();
		});

		it("should hide the overlay 300ms after mouse leaves the overlay", () => {
			vi.useFakeTimers();
			const headings = createDefaultHeadings();

			render(<ArticleOutline headings={headings} activeHeadingId={null} onHeadingClick={mockOnHeadingClick} />);

			const outline = screen.getByTestId("article-outline");

			// Open overlay — wrap in act so useEffect for overlayPos flushes
			act(() => {
				fireEvent.mouseEnter(outline);
			});

			const overlay = document.body.querySelector<HTMLElement>("[data-testid='article-outline-expanded']");
			expect(overlay).not.toBeNull();

			if (overlay) {
				fireEvent.mouseLeave(overlay);
			}

			act(() => {
				vi.advanceTimersByTime(300);
			});

			expect(document.body.querySelector("[data-testid='article-outline-expanded']")).toBeNull();
		});
	});
});

// ─── extractHeadingsFromEditor ───────────────────────────────────────────────

describe("extractHeadingsFromEditor", () => {
	/** Creates a minimal DOM structure that mimics the TipTap editor output. */
	function createEditorDom(htmlContent: string): HTMLElement {
		const wrapper = document.createElement("div");
		const proseMirror = document.createElement("div");
		proseMirror.className = "ProseMirror";
		proseMirror.innerHTML = htmlContent;
		wrapper.appendChild(proseMirror);
		return wrapper;
	}

	// ─── Null / empty input ──────────────────────────────────────────────────

	describe("null and empty input", () => {
		it("should return an empty array for null input", () => {
			const result = extractHeadingsFromEditor(null);

			expect(result).toEqual([]);
		});

		it("should return an empty array when no headings are found", () => {
			const editorDom = createEditorDom("<p>No headings here</p>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toEqual([]);
		});

		it("should return an empty array for an empty ProseMirror container", () => {
			const editorDom = createEditorDom("");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toEqual([]);
		});
	});

	// ─── Heading extraction ──────────────────────────────────────────────────

	describe("heading extraction", () => {
		it("should extract an H1 heading with level 1", () => {
			const editorDom = createEditorDom("<h1>Introduction</h1>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(1);
			expect(result[0].level).toBe(1);
			expect(result[0].text).toBe("Introduction");
		});

		it("should extract an H2 heading with level 2", () => {
			const editorDom = createEditorDom("<h2>Overview</h2>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(1);
			expect(result[0].level).toBe(2);
		});

		it("should extract an H3 heading with level 3", () => {
			const editorDom = createEditorDom("<h3>Details</h3>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(1);
			expect(result[0].level).toBe(3);
		});

		it("should extract an H4 heading with level 4", () => {
			const editorDom = createEditorDom("<h4>Notes</h4>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(1);
			expect(result[0].level).toBe(4);
		});

		it("should extract multiple headings in document order", () => {
			const editorDom = createEditorDom("<h1>Title</h1><h2>Section One</h2><h3>Sub Section</h3><h4>Note</h4>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(4);
			expect(result[0].level).toBe(1);
			expect(result[1].level).toBe(2);
			expect(result[2].level).toBe(3);
			expect(result[3].level).toBe(4);
		});

		it("should extract only the heading text, not surrounding HTML", () => {
			const editorDom = createEditorDom("<h2><strong>Bold Section</strong></h2>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(1);
			expect(result[0].text).toBe("Bold Section");
		});

		it("should trim whitespace from heading text", () => {
			const editorDom = createEditorDom("<h1>  Spaced Title  </h1>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(1);
			expect(result[0].text).toBe("Spaced Title");
		});
	});

	// ─── ID generation ───────────────────────────────────────────────────────
	// IDs are derived from heading text: lowercased, non-alphanum runs replaced
	// with hyphens, and leading/trailing hyphens stripped.  The DOM element's
	// `id` attribute is NOT mutated — navigation uses index-based DOM matching.

	describe("ID generation", () => {
		it("should generate a lowercase ID from the heading text", () => {
			const editorDom = createEditorDom("<h1>Introduction</h1>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result[0].id).toBe("introduction");
		});

		it("should replace spaces with hyphens in the generated ID", () => {
			const editorDom = createEditorDom("<h2>Getting Started</h2>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result[0].id).toBe("getting-started");
		});

		it("should replace non-alphanumeric characters with hyphens", () => {
			const editorDom = createEditorDom("<h1>Hello, World!</h1>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result[0].id).toBe("hello-world");
		});

		it("should collapse consecutive non-alphanumeric characters into a single hyphen", () => {
			const editorDom = createEditorDom("<h2>One -- Two</h2>");

			const result = extractHeadingsFromEditor(editorDom);

			// "one -- two" → replace non-alphanum+ with "-" → "one-two"
			expect(result[0].id).toBe("one-two");
		});

		it("should strip leading and trailing hyphens from the generated ID", () => {
			const editorDom = createEditorDom("<h1>!Leading and trailing!</h1>");

			const result = extractHeadingsFromEditor(editorDom);

			// "!leading and trailing!" → "-leading-and-trailing-" → strip edges
			expect(result[0].id).toBe("leading-and-trailing");
		});

		it("should deduplicate IDs when two headings have the same text", () => {
			const editorDom = createEditorDom("<h1>Stable Title</h1><h1>Stable Title</h1>");

			const result = extractHeadingsFromEditor(editorDom);

			// First occurrence keeps the base ID; subsequent ones get a numeric suffix.
			expect(result[0].id).toBe("stable-title");
			expect(result[1].id).toBe("stable-title-2");
		});

		it("should deduplicate three headings with the same text using sequential suffixes", () => {
			const editorDom = createEditorDom("<h2>Overview</h2><h2>Overview</h2><h2>Overview</h2>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result[0].id).toBe("overview");
			expect(result[1].id).toBe("overview-2");
			expect(result[2].id).toBe("overview-3");
		});

		it("should not mutate the element's id attribute", () => {
			// extractHeadingsFromEditor no longer sets el.id — navigation uses
			// index-based DOM matching since TipTap re-renders nodes and strips custom IDs.
			const editorDom = createEditorDom('<h2 id="old-id">Section</h2>');
			const h2 = editorDom.querySelector("h2") as HTMLHeadingElement;

			extractHeadingsFromEditor(editorDom);

			// The original element ID must not be overwritten.
			expect(h2.id).toBe("old-id");
		});
	});

	// ─── Empty heading filtering ─────────────────────────────────────────────

	describe("empty heading filtering", () => {
		it("should skip headings with empty text content", () => {
			const editorDom = createEditorDom("<h1></h1><h2>Valid Heading</h2>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(1);
			expect(result[0].text).toBe("Valid Heading");
		});

		it("should skip headings containing only whitespace", () => {
			const editorDom = createEditorDom("<h1>   </h1><h2>Real Section</h2>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toHaveLength(1);
			expect(result[0].text).toBe("Real Section");
		});

		it("should return empty array when all headings are empty", () => {
			const editorDom = createEditorDom("<h1></h1><h2></h2><h3>  </h3>");

			const result = extractHeadingsFromEditor(editorDom);

			expect(result).toEqual([]);
		});
	});

	// ─── Scope to .ProseMirror ───────────────────────────────────────────────

	describe("ProseMirror scope", () => {
		it("should not extract headings outside the .ProseMirror container", () => {
			const wrapper = document.createElement("div");
			// Heading outside .ProseMirror
			const outsideH1 = document.createElement("h1");
			outsideH1.textContent = "Outside Heading";
			wrapper.appendChild(outsideH1);

			// Heading inside .ProseMirror
			const proseMirror = document.createElement("div");
			proseMirror.className = "ProseMirror";
			const insideH2 = document.createElement("h2");
			insideH2.textContent = "Inside Heading";
			proseMirror.appendChild(insideH2);
			wrapper.appendChild(proseMirror);

			const result = extractHeadingsFromEditor(wrapper);

			expect(result).toHaveLength(1);
			expect(result[0].text).toBe("Inside Heading");
		});

		it("should return empty array when editorDom has no .ProseMirror child", () => {
			const wrapper = document.createElement("div");
			const h1 = document.createElement("h1");
			h1.textContent = "No ProseMirror";
			wrapper.appendChild(h1);

			const result = extractHeadingsFromEditor(wrapper);

			expect(result).toEqual([]);
		});
	});
});
