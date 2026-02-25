import { SectionChangePanel } from "./SectionChangePanel";
import type * as RadixTooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, waitFor } from "@testing-library/preact";
import type { DocDraftSectionChanges } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @radix-ui/react-tooltip to work with Preact test environment
vi.mock("@radix-ui/react-tooltip", () => ({
	Provider: vi.fn(({ children }: RadixTooltip.TooltipProviderProps) => <div>{children}</div>),
	Root: vi.fn(({ children }: RadixTooltip.TooltipProps) => <div>{children}</div>),
	Trigger: vi.fn(({ children, asChild }: RadixTooltip.TooltipTriggerProps) =>
		asChild ? children : <button type="button">{children}</button>,
	),
	Portal: vi.fn(({ children }: RadixTooltip.TooltipPortalProps) => <div>{children}</div>),
	Content: vi.fn(({ children, className, sideOffset, ...props }: RadixTooltip.TooltipContentProps) => (
		<div className={className} data-side-offset={sideOffset} {...props}>
			{children}
		</div>
	)),
	Arrow: vi.fn(({ className }: { className?: string }) => <div className={className} data-radix-tooltip="Arrow" />),
}));

// Mock the markdown-to-jsx library since it doesn't work well with Preact testing
vi.mock("markdown-to-jsx", () => ({
	default: ({ children }: { children: string }) => <div data-testid="markdown-mock">{children}</div>,
}));

describe("SectionChangePanel", () => {
	const mockOnApply = vi.fn();
	const mockOnDismiss = vi.fn();
	const mockOnClose = vi.fn();

	const singleChange: Array<DocDraftSectionChanges> = [
		{
			id: 1,
			draftId: 100,
			path: "## Authentication",
			changeType: "update",
			content: "Original authentication content",
			proposed: [
				{
					for: "content",
					who: { type: "agent" },
					description: "Update the section content",
					value: "New authentication content with improvements",
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

	const multipleChanges: Array<DocDraftSectionChanges> = [
		{
			id: 1,
			draftId: 100,
			path: "## Section One",
			changeType: "update",
			content: "Original content 1",
			proposed: [
				{
					for: "content",
					who: { type: "agent" },
					description: "First update",
					value: "New content 1",
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
			path: "## Section Two",
			changeType: "delete",
			content: "Content to be deleted",
			proposed: [
				{
					for: "content",
					who: { type: "agent" },
					description: "Delete this section",
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

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Basic Rendering", () => {
		it("renders panel with single change", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("section-change-panel")).toBeTruthy();
			expect(getByTestId("panel-title")).toBeTruthy();
			expect(getByTestId("change-card-0")).toBeTruthy();
			expect(getByTestId("apply-button-0")).toBeTruthy();
			expect(getByTestId("dismiss-button-0")).toBeTruthy();
		});

		it("renders multiple change cards in scrollable list", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={multipleChanges}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("change-card-0")).toBeTruthy();
			expect(getByTestId("change-card-1")).toBeTruthy();
			expect(getByTestId("apply-button-0")).toBeTruthy();
			expect(getByTestId("apply-button-1")).toBeTruthy();
		});

		it("shows no changes message when changes array is empty", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={[]}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("section-change-panel")).toBeTruthy();
			expect(getByTestId("no-changes-message")).toBeTruthy();
		});

		it("applies custom className", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
					className="custom-class"
				/>,
			);

			expect(getByTestId("section-change-panel").className).toContain("custom-class");
		});
	});

	describe("Action Buttons", () => {
		it("calls onApply with correct changeId when apply button is clicked", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("apply-button-0"));
			expect(mockOnApply).toHaveBeenCalledWith(1);
		});

		it("calls onDismiss with correct changeId when dismiss button is clicked", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("dismiss-button-0"));
			expect(mockOnDismiss).toHaveBeenCalledWith(1);
		});

		it("calls onClose when close button is clicked", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("close-button"));
			expect(mockOnClose).toHaveBeenCalled();
		});

		it("calls onClose when Escape key is pressed", async () => {
			render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.keyDown(document, { key: "Escape" });
			await waitFor(() => {
				expect(mockOnClose).toHaveBeenCalled();
			});
		});

		it("calls correct onApply for each change in multiple changes", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={multipleChanges}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("apply-button-0"));
			expect(mockOnApply).toHaveBeenCalledWith(1);

			fireEvent.click(getByTestId("apply-button-1"));
			expect(mockOnApply).toHaveBeenCalledWith(2);
		});
	});

	describe("View Tabs", () => {
		it("renders three view tabs for each change", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("tab-original-0")).toBeTruthy();
			expect(getByTestId("tab-suggestion-0")).toBeTruthy();
			expect(getByTestId("tab-change-view-0")).toBeTruthy();
		});

		it("shows original content by default", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("content-display-0").textContent).toContain("Original authentication content");
		});

		it("shows suggested content when suggestion tab is clicked", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-suggestion-0"));
			expect(getByTestId("content-display-0").textContent).toContain(
				"New authentication content with improvements",
			);
		});

		it("shows description in suggestion tab when available", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-suggestion-0"));
			expect(getByTestId("description-0").textContent).toBe("Update the section content");
		});

		it("hides description in suggestion tab when not available", () => {
			const changeWithoutDescription: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Section",
					changeType: "update",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "",
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

			const { getByTestId, queryByTestId } = render(
				<SectionChangePanel
					changes={changeWithoutDescription}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-suggestion-0"));
			// Should not show a description paragraph
			expect(queryByTestId("description-0")).toBeNull();
			// But should still show the suggested content
			expect(getByTestId("change-card-0")).toBeTruthy();
		});

		it("handles empty proposed value in suggestion tab", () => {
			const changeWithEmptyProposedValue: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Section",
					changeType: "update",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Some description",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={changeWithEmptyProposedValue}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-suggestion-0"));
			// Should still show the card and description
			expect(getByTestId("change-card-0")).toBeTruthy();
			expect(getByTestId("description-0").textContent).toBe("Some description");
		});

		it("shows diff content when change view tab is clicked", () => {
			const { getByTestId, container } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-change-view-0"));
			// diff2html renders with d2h- class prefixed elements
			expect(container.querySelector(".d2h-wrapper")).toBeTruthy();
		});

		it("maintains independent view tab state for each change", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={multipleChanges}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			// Switch first change to suggestion tab
			fireEvent.click(getByTestId("tab-suggestion-0"));
			expect(getByTestId("content-display-0").textContent).toContain("New content 1");

			// Second change should still show original
			expect(getByTestId("content-display-1").textContent).toContain("Content to be deleted");
		});

		it("defaults new changes to original tab when changes array updates", () => {
			const initialChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## First",
					changeType: "update",
					content: "First content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "First update",
							value: "New first",
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

			const updatedChanges: Array<DocDraftSectionChanges> = [
				...initialChange,
				{
					id: 2,
					draftId: 100,
					path: "## Second",
					changeType: "update",
					content: "Second content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Second update",
							value: "New second",
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

			const { getByTestId, rerender } = render(
				<SectionChangePanel
					changes={initialChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			// Switch first change to suggestion tab
			fireEvent.click(getByTestId("tab-suggestion-0"));
			expect(getByTestId("content-display-0").textContent).toContain("New first");

			// Re-render with new changes array (simulating new change added)
			rerender(
				<SectionChangePanel
					changes={updatedChanges}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			// First change should maintain its suggestion tab state
			expect(getByTestId("content-display-0").textContent).toContain("New first");

			// Second change should default to original tab
			expect(getByTestId("content-display-1").textContent).toContain("Second content");
		});
	});

	describe("Change Type Labels", () => {
		it("shows correct change type badge for update", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("change-type-0").textContent).toBe("Update");
		});

		it("shows correct change type badge for delete", () => {
			const deleteChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Section",
					changeType: "delete",
					content: "Content to delete",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Delete section",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={deleteChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("change-type-0").textContent).toBe("Delete");
		});

		it("shows correct change type badge for insert-after", () => {
			const insertAfterChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Section",
					changeType: "insert-after",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert after",
							value: "New section content",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={insertAfterChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("change-type-0").textContent).toBe("Insert After");
		});

		it("shows correct change type badge for insert-before", () => {
			const insertBeforeChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Section",
					changeType: "insert-before",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert before",
							value: "New section content",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={insertBeforeChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("change-type-0").textContent).toBe("Insert Before");
		});

		it("shows fallback label for unknown change type", () => {
			const unknownChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Section",
					changeType: "unknown" as "update",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Unknown type",
							value: "Content",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={unknownChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("change-type-0").textContent).toBe("Change");
		});
	});

	describe("Section Title for Insert Operations", () => {
		it("displays new section title from proposed content for insert-after", () => {
			const insertChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Anchor Section",
					changeType: "insert-after",
					content: "Anchor content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert new section",
							value: "## Brand New Section\n\nNew content here",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={insertChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("section-title-0").textContent).toBe("Brand New Section");
		});

		it("displays new section title from proposed content for insert-before", () => {
			const insertChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Next Section",
					changeType: "insert-before",
					content: "Next section content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert before",
							value: "## Prerequisite\n\nPrereq content",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={insertChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("section-title-0").textContent).toBe("Prerequisite");
		});

		it("strips heading from suggestion content for insert operations to avoid title duplication", () => {
			const insertChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Anchor Section",
					changeType: "insert-after",
					content: "Anchor content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert new section",
							value: "## Brand New Section\n\nNew content body",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={insertChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-suggestion-0"));
			const markdownMock = getByTestId("markdown-mock");
			expect(markdownMock.textContent).toBe("New content body");
			expect(markdownMock.textContent).not.toContain("## Brand New Section");
		});

		it("falls back to path title when proposed content has no heading for insert", () => {
			const insertChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Fallback Path",
					changeType: "insert-after",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert plain content",
							value: "Just plain content without heading",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={insertChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("section-title-0").textContent).toBe("Fallback Path");
		});

		it("shows path title for update operations even if proposed has different heading", () => {
			const updateChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Original Path Title",
					changeType: "update",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Update",
							value: "## Different Heading\n\nNew content",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={updateChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("section-title-0").textContent).toBe("Original Path Title");
		});
	});

	describe("Edge Cases", () => {
		it("shows no original content message for insert operations", () => {
			const insertChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## New Section",
					changeType: "insert-after",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert new section",
							value: "New section content",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={insertChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			// Original tab should show "no original content" message for insert operations
			expect(getByTestId("empty-message-0")).toBeTruthy();
		});

		it("ignores anchor section content in change-view for insert-after operations", () => {
			const insertChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## New Section",
					changeType: "insert-after",
					content: "Previous section content that should be ignored in diff",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert new section",
							value: "## New Section\n\nBrand new content",
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

			const { getByTestId, container } = render(
				<SectionChangePanel
					changes={insertChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-change-view-0"));
			const diffWrapper = container.querySelector(".d2h-wrapper");
			expect(diffWrapper).toBeTruthy();
			// The diff should not contain the anchor section's content
			expect(diffWrapper?.textContent).not.toContain("Previous section content");
		});

		it("ignores anchor section content in change-view for insert-before operations", () => {
			const insertChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## New Section",
					changeType: "insert-before",
					content: "Next section content that should be ignored in diff",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Insert before section",
							value: "## Inserted Before\n\nNew content here",
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

			const { getByTestId, container } = render(
				<SectionChangePanel
					changes={insertChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-change-view-0"));
			const diffWrapper = container.querySelector(".d2h-wrapper");
			expect(diffWrapper).toBeTruthy();
			expect(diffWrapper?.textContent).not.toContain("Next section content");
		});

		it("shows section will be deleted message for delete operations on suggestion tab", () => {
			const deleteChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Section to Delete",
					changeType: "delete",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Delete this section",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={deleteChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(getByTestId("tab-suggestion-0"));
			expect(getByTestId("empty-message-0")).toBeTruthy();
		});

		it("extracts section title from path correctly", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			// Path is "## Authentication", should show just "Authentication"
			expect(getByTestId("section-title-0").textContent).toBe("Authentication");
		});

		it("handles empty proposed array gracefully", () => {
			const emptyProposedChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Section",
					changeType: "update",
					content: "Original",
					proposed: [],
					comments: [],
					applied: false,
					dismissed: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			];

			const { getByTestId } = render(
				<SectionChangePanel
					changes={emptyProposedChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			// Should render without crashing
			expect(getByTestId("section-change-panel")).toBeTruthy();
		});

		it("shows no changes message in change-view when both original and proposed are empty", () => {
			const emptyContentChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Empty Section",
					changeType: "update",
					content: "",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Empty change",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={emptyContentChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			// Switch to change-view tab
			fireEvent.click(getByTestId("tab-change-view-0"));
			// Should show "No changes to display" message when diff is empty
			expect(getByTestId("empty-message-0")).toBeTruthy();
		});

		it("shows no changes message in change-view when original and proposed are identical", () => {
			const identicalContentChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "## Same Section",
					changeType: "update",
					content: "Identical content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "No actual change",
							value: "Identical content",
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

			const { getByTestId } = render(
				<SectionChangePanel
					changes={identicalContentChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			// Switch to change-view tab
			fireEvent.click(getByTestId("tab-change-view-0"));
			// Should show "No changes to display" message when original and proposed are identical
			expect(getByTestId("empty-message-0")).toBeTruthy();
		});
	});

	describe("Help Button", () => {
		it("renders help button for each change", () => {
			const { getByTestId } = render(
				<SectionChangePanel
					changes={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("help-button-0")).toBeTruthy();
		});
	});

	describe("Empty Section Title", () => {
		it("handles empty path resulting in no section title", () => {
			const emptyPathChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "",
					changeType: "update",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Update content",
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

			const { getByTestId, container } = render(
				<SectionChangePanel
					changes={emptyPathChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("section-change-panel")).toBeTruthy();
			// No h3 should be rendered when section title is empty
			expect(container.querySelector("h3")).toBeNull();
		});

		it("handles path with only hashes and whitespace", () => {
			const hashOnlyChange: Array<DocDraftSectionChanges> = [
				{
					id: 1,
					draftId: 100,
					path: "##   ",
					changeType: "update",
					content: "Original content",
					proposed: [
						{
							for: "content",
							who: { type: "agent" },
							description: "Update content",
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

			const { getByTestId, container } = render(
				<SectionChangePanel
					changes={hashOnlyChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					onClose={mockOnClose}
				/>,
			);

			expect(getByTestId("section-change-panel")).toBeTruthy();
			// No h3 should be rendered when section title is empty after stripping hashes
			expect(container.querySelector("h3")).toBeNull();
		});
	});
});
