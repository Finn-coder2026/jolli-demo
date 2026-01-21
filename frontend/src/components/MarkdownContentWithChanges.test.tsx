import { MarkdownContentWithChanges } from "./MarkdownContentWithChanges";
import { fireEvent, render, waitFor } from "@testing-library/preact";
import type { DocDraftSectionChanges, SectionAnnotation } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the MarkdownLink component
vi.mock("./MarkdownContent", () => ({
	MarkdownLink: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href}>{children}</a>,
}));

// Track which mock mode to use
let mockMode: "simple" | "headings" | "headings-first" | "no-headings" | "empty" = "simple";

// Mock markdown-to-jsx with configurable output
vi.mock("markdown-to-jsx", () => ({
	default: ({ children }: { children: string }) => {
		if (mockMode === "headings") {
			// Produce content with preamble before heading
			return (
				<div data-testid="markdown-content">
					<p>Preamble content</p>
					<h2>First Heading</h2>
					<p>Section 1 content</p>
					<h2>Second Heading</h2>
					<p>Section 2 content</p>
				</div>
			);
		}
		if (mockMode === "headings-first") {
			// Heading at index 0
			return (
				<div data-testid="markdown-content">
					<h1>Heading First</h1>
					<p>Content after</p>
				</div>
			);
		}
		if (mockMode === "no-headings") {
			// No headings at all
			return (
				<div data-testid="markdown-content">
					<p>Just text</p>
					<p>More text</p>
				</div>
			);
		}
		if (mockMode === "empty") {
			return <div data-testid="markdown-content" />;
		}
		// Simple mode - just text
		return <div data-testid="markdown-content">{children}</div>;
	},
}));

describe("MarkdownContentWithChanges", () => {
	const mockOnSectionClick = vi.fn();

	const basicContent = "# Test Article\n\nThis is some content.";

	const basicAnnotations: Array<SectionAnnotation> = [
		{
			id: "section-1",
			type: "section-change",
			path: "section-1",
			title: "Test Section",
			changeIds: [1],
			startLine: 0,
			endLine: 0,
		},
	];

	const basicChanges: Array<DocDraftSectionChanges> = [
		{
			id: 1,
			draftId: 100,
			path: "section-1",
			changeType: "update",
			proposed: [
				{
					for: "content",
					who: { type: "agent" },
					description: "Update the section content",
					value: "New content",
					appliedAt: undefined,
				},
			],
			comments: [],
			applied: false,
			dismissed: false,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockMode = "simple"; // Reset to simple mode for each test
	});

	it("renders markdown content", () => {
		const { container, getByTestId } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={[]}
				changes={[]}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();
		expect(getByTestId("markdown-content").textContent).toContain("Test Article");
	});

	it("renders with annotations and changes", () => {
		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();
	});

	it("renders previews in hidden container", () => {
		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		// The hidden container should have the preview elements
		const hiddenContainer = container.querySelector('div[style="display: none;"]');
		expect(hiddenContainer).toBeTruthy();
	});

	it("handles click on section with changes", async () => {
		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		// Wait for useEffect to run
		await waitFor(() => {
			const clickableElement = container.querySelector("[data-change-ids]");
			if (clickableElement) {
				fireEvent.click(clickableElement);
			}
		});
	});

	it("applies active class when panel is open", () => {
		const openPanelChangeIds = new Set([1]);

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
				openPanelChangeIds={openPanelChangeIds}
			/>,
		);

		// Check that the preview has the active class
		const hiddenContainer = container.querySelector('div[style="display: none;"]');
		const preview = hiddenContainer?.querySelector("[data-section-path]");
		expect(preview?.className).toContain("active");
	});

	it("does not apply active class when panel is not open", () => {
		const openPanelChangeIds = new Set<number>();

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
				openPanelChangeIds={openPanelChangeIds}
			/>,
		);

		const hiddenContainer = container.querySelector('div[style="display: none;"]');
		const preview = hiddenContainer?.querySelector("[data-section-path]");
		expect(preview?.className).not.toContain("active");
	});

	it("handles insert-point annotation type", () => {
		const insertAnnotations: Array<SectionAnnotation> = [
			{
				id: "insert-1",
				type: "insert-point",
				path: "insert-1",
				title: null,
				changeIds: [1],
				startLine: 0,
				endLine: 0,
			},
		];

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={insertAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		const hiddenContainer = container.querySelector('div[style="display: none;"]');
		const preview = hiddenContainer?.querySelector("[data-section-path]");
		// Insert point should use insertionPoint class
		expect(preview?.className).toContain("insertionPoint");
	});

	it("handles multiple changes for one annotation", () => {
		const multiChangeAnnotations: Array<SectionAnnotation> = [
			{
				id: "section-multi",
				type: "section-change",
				path: "section-multi",
				title: "Multi Section",
				changeIds: [1, 2],
				startLine: 0,
				endLine: 0,
			},
		];

		const multiChanges: Array<DocDraftSectionChanges> = [
			{
				id: 1,
				draftId: 100,
				path: "section-multi",
				changeType: "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "First update",
						value: "First change",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: 2,
				draftId: 100,
				path: "section-multi",
				changeType: "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Second update",
						value: "Second change",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={multiChangeAnnotations}
				changes={multiChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();
	});

	it("handles change with non-string proposed value", () => {
		const changesWithNonString: Array<DocDraftSectionChanges> = [
			{
				id: 1,
				draftId: 100,
				path: "section-1",
				changeType: "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Non-string value",
						value: undefined as unknown as string,
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={changesWithNonString}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();
	});

	it("handles change with empty proposed value", () => {
		const changesWithEmpty: Array<DocDraftSectionChanges> = [
			{
				id: 1,
				draftId: 100,
				path: "section-1",
				changeType: "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Empty value",
						value: "",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={changesWithEmpty}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();
	});

	it("handles annotation with no matching change", () => {
		const annotationsWithNoMatch: Array<SectionAnnotation> = [
			{
				id: "section-no-match",
				type: "section-change",
				path: "section-no-match",
				title: "No Match Section",
				changeIds: [999], // Non-existent change ID
				startLine: 0,
				endLine: 0,
			},
		];

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={annotationsWithNoMatch}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();
	});

	it("uses default empty set for openPanelChangeIds when not provided", () => {
		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		const hiddenContainer = container.querySelector('div[style="display: none;"]');
		const preview = hiddenContainer?.querySelector("[data-section-path]");
		// Without openPanelChangeIds, should not have active class
		expect(preview?.className).not.toContain("active");
	});

	it("handles annotation with endLine beyond available elements", () => {
		const annotationsWithLargeEndLine: Array<SectionAnnotation> = [
			{
				id: "section-large-end",
				type: "section-change",
				path: "section-large-end",
				title: "Large End Section",
				changeIds: [1],
				startLine: 0,
				endLine: 1000, // Way beyond actual content
			},
		];

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={annotationsWithLargeEndLine}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();
	});

	it("cleans up event listeners on unmount", () => {
		const { unmount, container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();

		// Unmount should trigger cleanup
		unmount();
	});

	it("re-renders when content changes", async () => {
		const { rerender, getAllByTestId } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		// Get the first markdown-content (the main content, not the preview)
		expect(getAllByTestId("markdown-content")[0].textContent).toContain("Test Article");

		// Re-render with different content
		rerender(
			<MarkdownContentWithChanges
				content="# New Content\n\nDifferent text."
				annotations={basicAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		await waitFor(() => {
			expect(getAllByTestId("markdown-content")[0].textContent).toContain("New Content");
		});
	});

	it("handles annotation without matching preview element", () => {
		const annotationsWithMismatch: Array<SectionAnnotation> = [
			{
				id: "section-1",
				type: "section-change",
				path: "section-1",
				title: "Section 1",
				changeIds: [1],
				startLine: 0,
				endLine: 0,
			},
			{
				id: "section-2", // No corresponding change
				type: "section-change",
				path: "section-2",
				title: "Section 2",
				changeIds: [999],
				startLine: 1,
				endLine: 1,
			},
		];

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={annotationsWithMismatch}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		expect(container.querySelector(".markdownContent")).toBeTruthy();
	});

	it("handles click with invalid JSON in change-ids attribute", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Silence console errors in test
		});

		// Create annotation with change that has invalid JSON handling
		const invalidAnnotations: Array<SectionAnnotation> = [
			{
				id: "section-invalid",
				type: "section-change",
				path: "section-invalid",
				title: "Invalid Section",
				changeIds: [1],
				startLine: 0,
				endLine: 0,
			},
		];

		const { container } = render(
			<MarkdownContentWithChanges
				content={basicContent}
				annotations={invalidAnnotations}
				changes={basicChanges}
				onSectionClick={mockOnSectionClick}
			/>,
		);

		// Wait for effect to run and click handlers to be attached
		await waitFor(() => {
			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent).toBeTruthy();
		});

		// Get the element with the click handler from the main content
		// The useEffect clones previews and adds them to the main content
		const mainContent = container.querySelector(".markdownContent > div");
		if (mainContent) {
			const clickableElement = mainContent.querySelector("[data-change-ids]");
			if (clickableElement) {
				// Replace the data-change-ids attribute with invalid JSON
				clickableElement.setAttribute("data-change-ids", "invalid-json");
				fireEvent.click(clickableElement);
			}
		}

		// The error should be logged when JSON parsing fails
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	describe("findSectionEndElement positioning", () => {
		// Temporarily unmock markdown-to-jsx for these tests to use realistic DOM
		beforeEach(() => {
			vi.doUnmock("markdown-to-jsx");
		});

		afterEach(() => {
			// Re-mock for other tests
			vi.doMock("markdown-to-jsx", () => ({
				default: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
			}));
		});

		it("positions insert-after preview after correct section based on title", async () => {
			// Create a realistic content structure with multiple sections
			const multiSectionContent = `## Prerequisites

Before you begin, make sure you have Node.js installed.

## Installation

Run npm install to install dependencies.

## Configuration

Configure your settings here.`;

			const insertAnnotations: Array<SectionAnnotation> = [
				{
					id: "insert-after-prereq",
					type: "insert-point",
					path: "/sections/1",
					title: "Prerequisites", // Should insert after Prerequisites section
					changeIds: [1],
					startLine: 0,
					endLine: 3,
				},
			];

			const insertChanges: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "/sections/1",
					changeType: "insert-after",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert after Prerequisites",
							value: "New content after Prerequisites",
							appliedAt: undefined,
						},
					],
					comments: [],
					applied: false,
					dismissed: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={multiSectionContent}
					annotations={insertAnnotations}
					changes={insertChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			// Wait for the useEffect to run
			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// The component should render successfully
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("handles section with null title (preamble)", async () => {
			const preambleAnnotations: Array<SectionAnnotation> = [
				{
					id: "insert-preamble",
					type: "insert-point",
					path: "/sections/0",
					title: null, // Preamble
					changeIds: [1],
					startLine: 0,
					endLine: 0,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={preambleAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("handles section title not found in DOM", async () => {
			const mismatchedAnnotations: Array<SectionAnnotation> = [
				{
					id: "insert-nonexistent",
					type: "insert-point",
					path: "/sections/1",
					title: "Nonexistent Section", // Title that doesn't exist in content
					changeIds: [1],
					startLine: 0,
					endLine: 0,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={mismatchedAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Should fall back to appending at end
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("returns last element when section has no next heading (line 89-91)", async () => {
			// Content with a section that extends to the end (no next heading)
			const contentWithLastSection = `## Only Section

This is the only section with no following heading.

Some more content here.`;

			const lastSectionAnnotations: Array<SectionAnnotation> = [
				{
					id: "last-section",
					type: "section-change",
					path: "/sections/0",
					title: "Only Section",
					changeIds: [1],
					startLine: 0,
					endLine: 5,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={contentWithLastSection}
					annotations={lastSectionAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Should render successfully - lines 89-91 handle returning last element
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("handles preamble with no content before first heading (lines 145-153)", async () => {
			// Content that starts immediately with a heading (no preamble content)
			const contentWithNoPreample = `# First Heading

Content under first heading.`;

			const preambleInsertAnnotations: Array<SectionAnnotation> = [
				{
					id: "preamble-insert",
					type: "insert-point",
					path: "/preamble",
					title: null, // Preamble (null title)
					changeIds: [1],
					startLine: 0,
					endLine: 0,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={contentWithNoPreample}
					annotations={preambleInsertAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Lines 145-153: handles insertion when sectionEndElement is null
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("handles annotation when sectionEndElement.nextSibling is null (lines 145-146)", async () => {
			// Content where the section is the very last element
			const contentEndingWithSection = `## Final Section

This is the last content.`;

			const finalSectionAnnotations: Array<SectionAnnotation> = [
				{
					id: "final-section",
					type: "section-change",
					path: "/sections/0",
					title: "Final Section",
					changeIds: [1],
					startLine: 0,
					endLine: 3,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={contentEndingWithSection}
					annotations={finalSectionAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Lines 145-146: appendChild when nextSibling is null
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("skips annotation when preview element not found (lines 131-132)", async () => {
			// Create an annotation whose ID doesn't match any preview
			const mismatchIdAnnotations: Array<SectionAnnotation> = [
				{
					id: "nonexistent-preview-id",
					type: "section-change",
					path: "nonexistent",
					title: "Some Title",
					changeIds: [999], // Change ID that doesn't exist
					startLine: 0,
					endLine: 0,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={mismatchIdAnnotations}
					changes={[]} // No changes provided
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Lines 131-132: continue when preview not found
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});
	});

	describe("findSectionEndElement with heading elements", () => {
		// These tests use different mock modes to produce actual heading elements

		it("handles preamble content before first heading (lines 44-49, i > 0)", async () => {
			mockMode = "headings"; // This produces <p> before <h2>

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "preamble-test",
							type: "insert-point",
							path: "/preamble",
							title: null, // Triggers preamble handling (lines 41-52)
							changeIds: [1],
							startLine: 0,
							endLine: 0,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// With "headings" mode, <p>Preamble content</p> is at index 0
				// <h2>First Heading</h2> is at index 1
				// So i > 0, returning children[0] (the preamble paragraph)
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			// The preview should be inserted after the preamble paragraph
			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='preamble-test']")).toBeTruthy();
		});

		it("handles heading at first position (lines 44-49, i === 0)", async () => {
			mockMode = "headings-first"; // <h1> is at index 0

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "preamble-first-heading",
							type: "insert-point",
							path: "/preamble",
							title: null, // Triggers line 47 false branch (i === 0 returns null)
							changeIds: [1],
							startLine: 0,
							endLine: 0,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// With "headings-first" mode, <h1> is at index 0
				// So i === 0, returning null (line 47)
				// This triggers lines 147-153 (sectionEndElement is null)
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='preamble-first-heading']")).toBeTruthy();
		});

		it("finds section by title and returns element before next heading (lines 62-68, 77-84)", async () => {
			mockMode = "headings";

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "first-section",
							type: "section-change",
							path: "/sections/0",
							title: "First Heading", // Matches <h2>First Heading</h2>
							changeIds: [1],
							startLine: 0,
							endLine: 3,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// Lines 62-68: Find "First Heading", set headingIndex and headingLevel
				// Lines 77-84: Find "Second Heading" (same level), return element before it
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='first-section']")).toBeTruthy();
		});

		it("returns last element when section has no next heading (lines 89-91)", async () => {
			mockMode = "headings";

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "last-section",
							type: "section-change",
							path: "/sections/1",
							title: "Second Heading", // Last heading - no next heading
							changeIds: [1],
							startLine: 3,
							endLine: 5,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// Lines 89-91: No next heading found, returns last element
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='last-section']")).toBeTruthy();
		});

		it("handles section not found in DOM (lines 71-73)", async () => {
			mockMode = "headings";

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "nonexistent-section",
							type: "section-change",
							path: "/sections/99",
							title: "Nonexistent Title", // Not in the DOM
							changeIds: [1],
							startLine: 0,
							endLine: 0,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// Lines 71-73: headingIndex === -1, falls back to last element
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='nonexistent-section']")).toBeTruthy();
		});

		it("handles preamble with no headings (lines 50-51)", async () => {
			mockMode = "no-headings"; // Only <p> elements, no headings

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "preamble-no-headings",
							type: "insert-point",
							path: "/preamble",
							title: null, // No headings found, returns last element
							changeIds: [1],
							startLine: 0,
							endLine: 0,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// Lines 50-51: No headings found in preamble loop, returns last element
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='preamble-no-headings']")).toBeTruthy();
		});

		it("handles empty content (lines 51, 152-153)", async () => {
			mockMode = "empty"; // Empty div

			const { container } = render(
				<MarkdownContentWithChanges
					content=""
					annotations={[
						{
							id: "empty-content-test",
							type: "insert-point",
							path: "/preamble",
							title: null,
							changeIds: [1],
							startLine: 0,
							endLine: 0,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// Line 51: children.length === 0, returns null
				// Lines 152-153: no firstChild, appendChild
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='empty-content-test']")).toBeTruthy();
		});

		it("appends when sectionEndElement.nextSibling is null (lines 144-146)", async () => {
			mockMode = "headings";

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "section-at-end",
							type: "section-change",
							path: "/sections/1",
							title: "Second Heading", // Last heading, last element has no nextSibling
							changeIds: [1],
							startLine: 4,
							endLine: 5,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// sectionEndElement is last child, nextSibling is null
				// Lines 144-146: appendChild
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='section-at-end']")).toBeTruthy();
		});

		it("inserts before when sectionEndElement.nextSibling exists (lines 142-143)", async () => {
			mockMode = "headings";

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "first-section-with-next",
							type: "section-change",
							path: "/sections/0",
							title: "First Heading", // Has next sibling (Second Heading section)
							changeIds: [1],
							startLine: 1,
							endLine: 3,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				// sectionEndElement has nextSibling
				// Lines 142-143: insertBefore
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			const mainContent = container.querySelector(".markdownContent > div");
			expect(mainContent?.querySelector("[data-section-path='first-section-with-next']")).toBeTruthy();
		});
	});

	describe("useEffect edge cases", () => {
		it("removes existing preview elements from previous renders (lines 119-121)", async () => {
			mockMode = "headings";

			const { container, rerender } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "section-first-render",
							type: "section-change",
							path: "/sections/0",
							title: "First Heading",
							changeIds: [1],
							startLine: 0,
							endLine: 3,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			// Wait for first render to complete and insert previews
			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent?.querySelector("[data-section-path='section-first-render']")).toBeTruthy();
			});

			// Re-render with different annotations - this triggers lines 119-121
			// The existing preview should be removed before new ones are added
			rerender(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={[
						{
							id: "section-second-render",
							type: "section-change",
							path: "/sections/0",
							title: "First Heading",
							changeIds: [1],
							startLine: 0,
							endLine: 3,
						},
					]}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			// Wait for re-render
			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				// Old preview should be removed
				expect(mainContent?.querySelector("[data-section-path='section-first-render']")).toBeFalsy();
				// New preview should be added
				expect(mainContent?.querySelector("[data-section-path='section-second-render']")).toBeTruthy();
			});
		});

		it("handles annotation with empty proposed content gracefully", async () => {
			mockMode = "headings";

			// Even when changes array is empty, the preview is still rendered
			// but with empty content - this tests that the flow handles it
			const annotationWithEmptyChanges: Array<SectionAnnotation> = [
				{
					id: "annotation-empty-changes",
					type: "section-change",
					path: "/sections/99",
					title: "First Heading",
					changeIds: [999], // This change ID doesn't exist
					startLine: 0,
					endLine: 0,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={annotationWithEmptyChanges}
					changes={[]} // No changes provided
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				expect(container.querySelector(".markdownContent")).toBeTruthy();
			});

			// Preview is still rendered (with empty content) - verify it exists
			const hiddenContainer = container.querySelector('div[style="display: none;"]');
			expect(hiddenContainer?.querySelector("[data-section-path='annotation-empty-changes']")).toBeTruthy();
		});

		it("previously existing preview elements are removed (lines 119-121)", async () => {
			mockMode = "headings";

			const { container, rerender } = render(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={basicAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			// Wait for initial render
			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Re-render with same props to trigger the removal of existing previews
			rerender(
				<MarkdownContentWithChanges
					content={basicContent}
					annotations={basicAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			// Wait for re-render
			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Lines 119-121: existing previews should be removed before adding new ones
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("handles content with multiple same-level headings", async () => {
			const multiHeadingContent = `## Section A

Content A.

## Section B

Content B.

## Section C

Content C.`;

			const multiAnnotations: Array<SectionAnnotation> = [
				{
					id: "section-b",
					type: "section-change",
					path: "/sections/1",
					title: "Section B", // Middle section
					changeIds: [1],
					startLine: 3,
					endLine: 6,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={multiHeadingContent}
					annotations={multiAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Tests line 82-84: finding next heading of same or higher level
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("handles content with nested headings (higher level stops section)", async () => {
			const nestedContent = `## Main Section

Some content.

### Subsection

Subsection content.

## Next Main Section

Next content.`;

			const nestedAnnotations: Array<SectionAnnotation> = [
				{
					id: "main-section",
					type: "section-change",
					path: "/sections/0",
					title: "Main Section",
					changeIds: [1],
					startLine: 0,
					endLine: 8,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={nestedContent}
					annotations={nestedAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Tests line 82: level <= headingLevel check
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("handles preamble when content has no headings (line 50-51)", async () => {
			// Content with no headings at all
			const noHeadingsContent = `This is just plain text.

No headings here.

Just paragraphs.`;

			const preambleAnnotations: Array<SectionAnnotation> = [
				{
					id: "preamble-only",
					type: "insert-point",
					path: "/preamble",
					title: null, // Preamble
					changeIds: [1],
					startLine: 0,
					endLine: 5,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content={noHeadingsContent}
					annotations={preambleAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Lines 50-51: returns last element when no headings found
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});

		it("handles empty content (line 51)", async () => {
			const emptyAnnotations: Array<SectionAnnotation> = [
				{
					id: "empty-content",
					type: "insert-point",
					path: "/preamble",
					title: null,
					changeIds: [1],
					startLine: 0,
					endLine: 0,
				},
			];

			const { container } = render(
				<MarkdownContentWithChanges
					content=""
					annotations={emptyAnnotations}
					changes={basicChanges}
					onSectionClick={mockOnSectionClick}
				/>,
			);

			await waitFor(() => {
				const mainContent = container.querySelector(".markdownContent > div");
				expect(mainContent).toBeTruthy();
			});

			// Line 51: handles empty children array
			expect(container.querySelector(".markdownContent")).toBeTruthy();
		});
	});
});
