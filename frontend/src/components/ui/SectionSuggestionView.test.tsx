import { SectionSuggestionView } from "./SectionSuggestionView";
import type * as RadixTooltip from "@radix-ui/react-tooltip";
import { fireEvent, render } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("markdown-to-jsx", () => ({
	default: ({ children }: { children: string }) => <div data-testid="markdown-mock">{children}</div>,
}));

vi.mock("@tiptap/react", () => ({
	NodeViewWrapper: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div className={className} data-testid="node-view-wrapper">
			{children}
		</div>
	),
}));

describe("SectionSuggestionView", () => {
	const mockDeleteNode = vi.fn();
	const mockOnApply = vi.fn();
	const mockOnDismiss = vi.fn();

	const createMockNode = (attrs: Record<string, unknown> = {}) => ({
		attrs: {
			changeId: 1,
			draftId: 100,
			sectionPath: "/sections/0",
			sectionTitle: "Authentication",
			originalContent: "Original content",
			suggestedContent: "Suggested content with improvements",
			changeType: "update",
			description: "Update the section",
			...attrs,
		},
	});

	const createMockEditor = (
		onApply: ((changeId: number) => void) | null = null,
		onDismiss: ((changeId: number) => void) | null = null,
	) => ({
		storage: {
			sectionSuggestion: {
				onApply,
				onDismiss,
			},
		},
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Basic Rendering", () => {
		it("renders with NodeViewWrapper", () => {
			const { getByTestId } = render(
				<SectionSuggestionView
					node={createMockNode() as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor() as never}
				/>,
			);

			expect(getByTestId("node-view-wrapper")).toBeTruthy();
		});

		it("renders InlineSectionChange component", () => {
			const { getByTestId } = render(
				<SectionSuggestionView
					node={createMockNode() as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor() as never}
				/>,
			);

			expect(getByTestId("tiptap-suggestion-1-1")).toBeTruthy();
		});

		it("uses changeId for testIdPrefix", () => {
			const { getByTestId } = render(
				<SectionSuggestionView
					node={createMockNode({ changeId: 42 }) as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor() as never}
				/>,
			);

			expect(getByTestId("tiptap-suggestion-42-42")).toBeTruthy();
		});
	});

	describe("Action Callbacks", () => {
		it("calls onApply and deleteNode when apply button is clicked", () => {
			const { getByTestId } = render(
				<SectionSuggestionView
					node={createMockNode() as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor(mockOnApply, mockOnDismiss) as never}
				/>,
			);

			fireEvent.click(getByTestId("tiptap-suggestion-1-apply-button"));

			expect(mockOnApply).toHaveBeenCalledWith(1);
			expect(mockDeleteNode).toHaveBeenCalled();
		});

		it("calls onDismiss and deleteNode when dismiss button is clicked", () => {
			const { getByTestId } = render(
				<SectionSuggestionView
					node={createMockNode() as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor(mockOnApply, mockOnDismiss) as never}
				/>,
			);

			fireEvent.click(getByTestId("tiptap-suggestion-1-dismiss-button"));

			expect(mockOnDismiss).toHaveBeenCalledWith(1);
			expect(mockDeleteNode).toHaveBeenCalled();
		});

		it("still deletes node even when callbacks are null", () => {
			const { getByTestId } = render(
				<SectionSuggestionView
					node={createMockNode() as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor(null, null) as never}
				/>,
			);

			fireEvent.click(getByTestId("tiptap-suggestion-1-apply-button"));

			expect(mockDeleteNode).toHaveBeenCalled();
		});
	});

	describe("Change Data Construction", () => {
		it("constructs DocDraftSectionChanges from node attributes", () => {
			const { getByText } = render(
				<SectionSuggestionView
					node={createMockNode() as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor() as never}
				/>,
			);

			expect(getByText("Authentication")).toBeTruthy();
		});

		it("displays description when provided", () => {
			const { getByText } = render(
				<SectionSuggestionView
					node={createMockNode({ description: "This is a custom description" }) as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor() as never}
				/>,
			);

			expect(getByText("This is a custom description")).toBeTruthy();
		});
	});

	describe("Edge Cases", () => {
		it("handles missing storage gracefully", () => {
			const editorWithoutStorage = {
				storage: {},
			};

			const { getByTestId } = render(
				<SectionSuggestionView
					node={createMockNode() as never}
					deleteNode={mockDeleteNode}
					editor={editorWithoutStorage as never}
				/>,
			);

			expect(getByTestId("node-view-wrapper")).toBeTruthy();
		});

		it("handles empty description", () => {
			const { getByTestId } = render(
				<SectionSuggestionView
					node={createMockNode({ description: "" }) as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor() as never}
				/>,
			);

			expect(getByTestId("tiptap-suggestion-1-1")).toBeTruthy();
		});

		it("handles null section title (preamble)", () => {
			const { getByTestId, queryByText } = render(
				<SectionSuggestionView
					node={createMockNode({ sectionTitle: null }) as never}
					deleteNode={mockDeleteNode}
					editor={createMockEditor() as never}
				/>,
			);

			expect(getByTestId("tiptap-suggestion-1-1")).toBeTruthy();
			expect(queryByText("Authentication")).toBeNull();
		});
	});
});
