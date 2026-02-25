import { InlineSectionChange } from "./InlineSectionChange";
import type * as RadixTooltip from "@radix-ui/react-tooltip";
import { fireEvent, render } from "@testing-library/preact";
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

// Mock markdown-to-jsx
vi.mock("markdown-to-jsx", () => ({
	default: ({ children }: { children: string }) => <div data-testid="markdown-mock">{children}</div>,
}));

interface MockGitHubStyleDiffProps {
	oldContent: string;
	newContent: string;
	className?: string;
	testId?: string;
	viewMode?: string;
}

vi.mock("./GitHubStyleDiff", () => ({
	GitHubStyleDiff: ({ oldContent, newContent, className, testId, viewMode }: MockGitHubStyleDiffProps) => {
		const normalizedOld = oldContent.trim();
		const normalizedNew = newContent.trim();
		const hasChanges = normalizedOld !== normalizedNew;

		return (
			<div
				className={className}
				data-testid={testId ?? "github-diff"}
				data-view-mode={viewMode ?? "line-by-line"}
			>
				{hasChanges ? (
					<div data-testid="diff-content">
						Diff: {normalizedOld} → {normalizedNew}
					</div>
				) : (
					<p data-testid="no-changes-message">No changes</p>
				)}
			</div>
		);
	},
}));

describe("InlineSectionChange", () => {
	const mockOnApply = vi.fn();
	const mockOnDismiss = vi.fn();

	const singleChange: DocDraftSectionChanges = {
		id: 1,
		draftId: 100,
		path: "/sections/0",
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
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Basic Rendering", () => {
		it("renders inline change component", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(getByTestId("inline-change-1")).toBeTruthy();
		});

		it("renders view tabs", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(getByTestId("inline-change-tab-original")).toBeTruthy();
			expect(getByTestId("inline-change-tab-suggestion")).toBeTruthy();
			expect(getByTestId("inline-change-tab-change-view")).toBeTruthy();
		});

		it("renders accept and dismiss buttons", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(getByTestId("inline-change-apply-button")).toBeTruthy();
			expect(getByTestId("inline-change-dismiss-button")).toBeTruthy();
		});

		it("renders help button", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(getByTestId("inline-change-help-button")).toBeTruthy();
		});

		it("displays section title when provided", () => {
			const { getByTestId } = render(
				<InlineSectionChange
					change={singleChange}
					sectionTitle="Authentication"
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
				/>,
			);

			expect(getByTestId("inline-change-section-title").textContent).toBe("Authentication");
		});

		it("applies custom className", () => {
			const { getByTestId } = render(
				<InlineSectionChange
					change={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					className="custom-class"
				/>,
			);

			expect(getByTestId("inline-change-1").className).toContain("custom-class");
		});

		it("uses custom testIdPrefix", () => {
			const { getByTestId } = render(
				<InlineSectionChange
					change={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					testIdPrefix="custom-prefix"
				/>,
			);

			expect(getByTestId("custom-prefix-1")).toBeTruthy();
		});
	});

	describe("Action Buttons", () => {
		it("calls onApply with correct changeId when apply button is clicked", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-apply-button"));
			expect(mockOnApply).toHaveBeenCalledWith(1);
		});

		it("calls onDismiss with correct changeId when dismiss button is clicked", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-dismiss-button"));
			expect(mockOnDismiss).toHaveBeenCalledWith(1);
		});
	});

	describe("View Tabs", () => {
		it("shows suggested content by default", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(getByTestId("markdown-mock").textContent).toBe("New authentication content with improvements");
		});

		it("shows original content when original tab is clicked", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-original"));
			expect(getByTestId("markdown-mock").textContent).toBe("Original authentication content");
		});

		it("shows diff content when change view tab is clicked", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			expect(getByTestId("inline-change-diff")).toBeTruthy();
			expect(getByTestId("diff-content")).toBeTruthy();
		});

		it("shows description in suggestion tab when available", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(getByTestId("inline-change-description").textContent).toBe("Update the section content");
		});

		it("hides description when not available", () => {
			const changeWithoutDescription: DocDraftSectionChanges = {
				...singleChange,
				proposed: [{ ...singleChange.proposed[0], description: "" }],
			};

			const { getByTestId, queryByTestId } = render(
				<InlineSectionChange
					change={changeWithoutDescription}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
				/>,
			);

			// Should not show a description paragraph
			expect(queryByTestId("inline-change-description")).toBeNull();
			// But component should still render
			expect(getByTestId("inline-change-1")).toBeTruthy();
		});

		it("handles empty proposed value in suggestion tab", () => {
			const changeWithEmptyValue: DocDraftSectionChanges = {
				...singleChange,
				proposed: [{ ...singleChange.proposed[0], value: "" }],
			};

			const { getByTestId } = render(
				<InlineSectionChange change={changeWithEmptyValue} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			// Should still show the card with description
			expect(getByTestId("inline-change-1")).toBeTruthy();
			expect(getByTestId("inline-change-description").textContent).toBe("Update the section content");
		});
	});

	describe("Edge Cases", () => {
		it("shows no original content message for insert operations", () => {
			const insertChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "insert-after",
				content: "",
			};

			const { getByTestId } = render(
				<InlineSectionChange change={insertChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-original"));
			expect(getByTestId("inline-change-empty-message")).toBeTruthy();
		});

		it("shows all-new diff in change view for insert operations ignoring anchor content", () => {
			const insertChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "insert-after",
				content: "Previous section content that should be ignored",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Insert new section",
						value: "## New Section\n\nBrand new content",
						appliedAt: undefined,
					},
				],
			};

			const { getByTestId } = render(
				<InlineSectionChange change={insertChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			const diffContent = getByTestId("diff-content");
			expect(diffContent.textContent).toContain("## New Section");
			expect(diffContent.textContent).not.toContain("Previous section content");
		});

		it("displays new section title instead of anchor section title for insert operations", () => {
			const insertChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "insert-after",
				content: "Anchor section content",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Insert new section",
						value: "## Brand New Section\n\nNew content",
						appliedAt: undefined,
					},
				],
			};

			const { getByTestId } = render(
				<InlineSectionChange
					change={insertChange}
					sectionTitle="Anchor Section"
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
				/>,
			);

			const title = getByTestId("inline-change-section-title");
			expect(title.textContent).toBe("Brand New Section");
		});

		it("strips heading from suggestion content for insert operations to avoid title duplication", () => {
			const insertChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "insert-after",
				content: "Anchor section content",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Insert new section",
						value: "## Brand New Section\n\nNew content body",
						appliedAt: undefined,
					},
				],
			};

			const { getByTestId } = render(
				<InlineSectionChange
					change={insertChange}
					sectionTitle="Anchor Section"
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
				/>,
			);

			const markdownMock = getByTestId("markdown-mock");
			expect(markdownMock.textContent).toBe("New content body");
			expect(markdownMock.textContent).not.toContain("## Brand New Section");
		});

		it("falls back to anchor title when proposed content has no heading for insert operations", () => {
			const insertChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "insert-after",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Insert content",
						value: "Just plain content without heading",
						appliedAt: undefined,
					},
				],
			};

			const { getByTestId } = render(
				<InlineSectionChange
					change={insertChange}
					sectionTitle="Fallback Title"
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
				/>,
			);

			expect(getByTestId("inline-change-section-title").textContent).toBe("Fallback Title");
		});

		it("shows anchor section title for update operations regardless of proposed heading", () => {
			const updateChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Update section",
						value: "## Different Title\n\nNew content",
						appliedAt: undefined,
					},
				],
			};

			const { getByTestId } = render(
				<InlineSectionChange
					change={updateChange}
					sectionTitle="Original Title"
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
				/>,
			);

			const title = getByTestId("inline-change-section-title");
			expect(title.textContent).toBe("Original Title");
		});

		it("shows all-new diff in change view for insert-before operations", () => {
			const insertChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "insert-before",
				content: "Next section content that should be ignored",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Insert before",
						value: "## Inserted Before\n\nNew content here",
						appliedAt: undefined,
					},
				],
			};

			const { getByTestId } = render(
				<InlineSectionChange change={insertChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			const diffContent = getByTestId("diff-content");
			expect(diffContent.textContent).toContain("## Inserted Before");
			expect(diffContent.textContent).not.toContain("Next section content");
		});

		it("shows section will be deleted message for delete operations", () => {
			const deleteChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "delete",
				proposed: [{ ...singleChange.proposed[0], value: "" }],
			};

			const { getByTestId } = render(
				<InlineSectionChange change={deleteChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(getByTestId("inline-change-empty-message")).toBeTruthy();
		});

		it("handles empty proposed array gracefully", () => {
			const emptyProposedChange: DocDraftSectionChanges = {
				...singleChange,
				proposed: [],
			};

			const { getByTestId } = render(
				<InlineSectionChange change={emptyProposedChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(getByTestId("inline-change-1")).toBeTruthy();
		});

		it("shows no changes message when original and proposed are identical", () => {
			const identicalChange: DocDraftSectionChanges = {
				...singleChange,
				content: "Same content",
				proposed: [{ ...singleChange.proposed[0], value: "Same content" }],
			};

			const { getByTestId } = render(
				<InlineSectionChange change={identicalChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			expect(getByTestId("no-changes-message")).toBeTruthy();
		});

		it("handles empty original and proposed content in change view", () => {
			const emptyChange: DocDraftSectionChanges = {
				...singleChange,
				content: "",
				proposed: [{ ...singleChange.proposed[0], value: "" }],
			};

			const { getByTestId } = render(
				<InlineSectionChange change={emptyChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			expect(getByTestId("no-changes-message")).toBeTruthy();
		});

		it("handles empty original content on original tab for update operations", () => {
			const emptyOriginalChange: DocDraftSectionChanges = {
				...singleChange,
				changeType: "update",
				content: "",
			};

			const { getByTestId } = render(
				<InlineSectionChange change={emptyOriginalChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-original"));
			// Should render without crashing with empty original content
			expect(getByTestId("inline-change-1")).toBeTruthy();
		});

		it("handles empty path resulting in no section title", () => {
			const emptyPathChange: DocDraftSectionChanges = {
				...singleChange,
				path: "",
			};

			const { getByTestId, queryByTestId } = render(
				<InlineSectionChange change={emptyPathChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			// Should render without crashing with empty path
			expect(getByTestId("inline-change-1")).toBeTruthy();
			// Section title should not be rendered when path is empty
			expect(queryByTestId("inline-change-section-title")).toBeNull();
		});

		it("handles path with only hashes and whitespace", () => {
			const hashOnlyChange: DocDraftSectionChanges = {
				...singleChange,
				path: "##   ",
			};

			const { getByTestId, container } = render(
				<InlineSectionChange change={hashOnlyChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			// Should render without crashing
			expect(getByTestId("inline-change-1")).toBeTruthy();
			// No h3 should be rendered when section title is empty
			expect(container.querySelector("h3")).toBeNull();
		});
	});

	describe("Diff View Mode Toggle", () => {
		it("does not show diff mode toggle when not on change-view tab", () => {
			const { queryByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			expect(queryByTestId("inline-change-diff-mode-toggle")).toBeNull();
		});

		it("shows diff mode toggle when on change-view tab", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			expect(getByTestId("inline-change-diff-mode-toggle")).toBeTruthy();
			expect(getByTestId("inline-change-diff-mode-unified")).toBeTruthy();
			expect(getByTestId("inline-change-diff-mode-split")).toBeTruthy();
		});

		it("defaults to line-by-line diff mode", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			const diffEl = getByTestId("inline-change-diff");
			expect(diffEl.getAttribute("data-view-mode")).toBe("line-by-line");
		});

		it("switches to side-by-side mode when split button is clicked", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			fireEvent.click(getByTestId("inline-change-diff-mode-split"));

			const diffEl = getByTestId("inline-change-diff");
			expect(diffEl.getAttribute("data-view-mode")).toBe("side-by-side");
		});

		it("switches back to line-by-line mode when unified button is clicked", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			fireEvent.click(getByTestId("inline-change-diff-mode-split"));
			fireEvent.click(getByTestId("inline-change-diff-mode-unified"));

			const diffEl = getByTestId("inline-change-diff");
			expect(diffEl.getAttribute("data-view-mode")).toBe("line-by-line");
		});

		it("hides diff mode toggle when switching away from change-view tab", () => {
			const { getByTestId, queryByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			expect(getByTestId("inline-change-diff-mode-toggle")).toBeTruthy();

			fireEvent.click(getByTestId("inline-change-tab-original"));
			expect(queryByTestId("inline-change-diff-mode-toggle")).toBeNull();
		});

		it("preserves diff mode when switching tabs and returning to change-view", () => {
			const { getByTestId } = render(
				<InlineSectionChange change={singleChange} onApply={mockOnApply} onDismiss={mockOnDismiss} />,
			);

			fireEvent.click(getByTestId("inline-change-tab-change-view"));
			fireEvent.click(getByTestId("inline-change-diff-mode-split"));

			fireEvent.click(getByTestId("inline-change-tab-original"));
			fireEvent.click(getByTestId("inline-change-tab-change-view"));

			const diffEl = getByTestId("inline-change-diff");
			expect(diffEl.getAttribute("data-view-mode")).toBe("side-by-side");
		});

		it("uses custom testIdPrefix for diff mode toggle", () => {
			const { getByTestId } = render(
				<InlineSectionChange
					change={singleChange}
					onApply={mockOnApply}
					onDismiss={mockOnDismiss}
					testIdPrefix="custom-prefix"
				/>,
			);

			fireEvent.click(getByTestId("custom-prefix-tab-change-view"));
			expect(getByTestId("custom-prefix-diff-mode-toggle")).toBeTruthy();
			expect(getByTestId("custom-prefix-diff-mode-unified")).toBeTruthy();
			expect(getByTestId("custom-prefix-diff-mode-split")).toBeTruthy();
		});
	});
});
