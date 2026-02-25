import { DragHandleMenu } from "./DragHandleMenu";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { useEditor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", () => {
	const createMockIcon = (testId: string) => {
		const MockIcon = ({ className }: { className?: string }) => <div data-testid={testId} className={className} />;
		MockIcon.displayName = testId;
		return MockIcon;
	};

	return {
		Bold: createMockIcon("bold-icon"),
		CodeSquare: createMockIcon("code-square-icon"),
		GripVertical: createMockIcon("grip-vertical-icon"),
		Heading1: createMockIcon("heading1-icon"),
		Heading2: createMockIcon("heading2-icon"),
		Italic: createMockIcon("italic-icon"),
		List: createMockIcon("list-icon"),
		ListOrdered: createMockIcon("list-ordered-icon"),
		Trash2: createMockIcon("trash2-icon"),
	};
});

// Mock the DragHandle component from @tiptap/extension-drag-handle-react
let mockDragHandleOnNodeChange: ((params: { node: unknown }) => void) | null = null;
vi.mock("@tiptap/extension-drag-handle-react", () => ({
	DragHandle: vi.fn(({ children, onNodeChange }) => {
		mockDragHandleOnNodeChange = onNodeChange;
		return <div data-testid="drag-handle-wrapper">{children}</div>;
	}),
}));

vi.mock("react-intlayer", () => ({
	useIntlayer: vi.fn(() => ({
		dragHandle: {
			heading1: { value: "Heading 1" },
			heading2: { value: "Heading 2" },
			bold: { value: "Bold" },
			italic: { value: "Italic" },
			bulletList: { value: "Bullet List" },
			orderedList: { value: "Ordered List" },
			codeBlock: { value: "Code Block" },
			deleteBlock: { value: "Delete" },
		},
	})),
}));

function createMockEditor(): NonNullable<ReturnType<typeof useEditor>> {
	return {
		chain: vi.fn(() => ({
			focus: vi.fn(() => ({
				toggleHeading: vi.fn(() => ({ run: vi.fn() })),
				toggleBold: vi.fn(() => ({ run: vi.fn() })),
				toggleItalic: vi.fn(() => ({ run: vi.fn() })),
				toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
				toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
				toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
				deleteNode: vi.fn(() => ({ run: vi.fn() })),
			})),
		})),
	} as unknown as NonNullable<ReturnType<typeof useEditor>>;
}

function createMockEditorForDeleteAction(): {
	editor: NonNullable<ReturnType<typeof useEditor>>;
	deleteNode: ReturnType<typeof vi.fn>;
	run: ReturnType<typeof vi.fn>;
} {
	const run = vi.fn();
	const deleteNode = vi.fn(() => ({ run }));

	const editor = {
		chain: vi.fn(() => ({
			focus: vi.fn(() => ({
				deleteNode,
			})),
		})),
	} as unknown as NonNullable<ReturnType<typeof useEditor>>;

	return { editor, deleteNode, run };
}

describe("DragHandleMenu", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDragHandleOnNodeChange = null;
	});

	it("should render the drag handle wrapper", () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);
		expect(screen.getByTestId("drag-handle-wrapper")).toBeTruthy();
	});

	it("should not show drag handle button initially", () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);
		expect(screen.queryByTestId("drag-handle")).toBeFalsy();
	});

	it("should show drag handle button when node has content", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Some content" },
		});

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});
	});

	it("should hide drag handle when node is null", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		// First show it
		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});
		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		// Then hide it
		mockDragHandleOnNodeChange?.({ node: null });
		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle")).toBeFalsy();
		});
	});

	it("should always show drag handle for table nodes", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "table" }, textContent: "" },
		});

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});
	});

	it("should always show drag handle for codeBlock nodes", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "codeBlock" }, textContent: "" },
		});

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});
	});

	it("should always show drag handle for image nodes", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "image" }, textContent: "" },
		});

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});
	});

	it("should hide drag handle for empty paragraph", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "" },
		});

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle")).toBeFalsy();
		});
	});

	it("should toggle menu when drag handle is clicked", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		// Open menu
		fireEvent.click(screen.getByTestId("drag-handle"));
		await waitFor(() => {
			expect(screen.getByTestId("drag-handle-menu")).toBeTruthy();
		});

		// Close menu
		fireEvent.click(screen.getByTestId("drag-handle"));
		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should not open menu for image nodes", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "image" }, textContent: "" },
		});

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("drag-handle"));
		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should render all menu items", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => {
			expect(screen.getByTestId("drag-handle")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => {
			const menu = screen.getByTestId("drag-handle-menu");
			const menuScope = within(menu);
			expect(menuScope.getByText("Heading 1")).toBeTruthy();
			expect(menuScope.getByText("Heading 2")).toBeTruthy();
			expect(menuScope.getByText("Bold")).toBeTruthy();
			expect(menuScope.getByText("Italic")).toBeTruthy();
			expect(menuScope.getByText("Bullet List")).toBeTruthy();
			expect(menuScope.getByText("Ordered List")).toBeTruthy();
			expect(menuScope.getByText("Code Block")).toBeTruthy();
		});
	});

	it("should close menu when heading 1 is clicked", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());
		fireEvent.click(within(screen.getByTestId("drag-handle-menu")).getByText("Heading 1"));

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close menu when heading 2 is clicked", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());
		fireEvent.click(within(screen.getByTestId("drag-handle-menu")).getByText("Heading 2"));

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close menu when bold is clicked", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());
		fireEvent.click(within(screen.getByTestId("drag-handle-menu")).getByText("Bold"));

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close menu when italic is clicked", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());
		fireEvent.click(within(screen.getByTestId("drag-handle-menu")).getByText("Italic"));

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close menu when bullet list is clicked", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());
		fireEvent.click(within(screen.getByTestId("drag-handle-menu")).getByText("Bullet List"));

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close menu when ordered list is clicked", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());
		fireEvent.click(within(screen.getByTestId("drag-handle-menu")).getByText("Ordered List"));

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close menu when code block is clicked", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());
		fireEvent.click(within(screen.getByTestId("drag-handle-menu")).getByText("Code Block"));

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close menu when clicking outside", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());

		// Click outside
		fireEvent.mouseDown(document.body);

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should close menu when node becomes empty", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		// Show with content
		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "Content" },
		});
		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());

		// Open menu
		fireEvent.click(screen.getByTestId("drag-handle"));
		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());

		// Node becomes empty
		mockDragHandleOnNodeChange?.({
			node: { type: { name: "paragraph" }, textContent: "" },
		});

		await waitFor(() => {
			expect(screen.queryByTestId("drag-handle")).toBeFalsy();
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should show delete button for mermaid codeBlock instead of formatting menu", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "codeBlock" }, textContent: "graph TD;", attrs: { language: "mermaid" } },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => {
			const menu = screen.getByTestId("drag-handle-menu");
			expect(within(menu).getByText("Delete")).toBeTruthy();
			expect(within(menu).queryByText("Heading 1")).toBeFalsy();
			expect(within(menu).queryByText("Bold")).toBeFalsy();
		});
	});

	it("should call deleteNode and close menu when delete is clicked for mermaid block", async () => {
		const { editor, deleteNode, run } = createMockEditorForDeleteAction();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "codeBlock" }, textContent: "graph TD;", attrs: { language: "mermaid" } },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => expect(screen.getByTestId("drag-handle-menu")).toBeTruthy());
		fireEvent.click(within(screen.getByTestId("drag-handle-menu")).getByText("Delete"));

		await waitFor(() => {
			expect(deleteNode).toHaveBeenCalledWith("codeBlock");
			expect(run).toHaveBeenCalled();
			expect(screen.queryByTestId("drag-handle-menu")).toBeFalsy();
		});
	});

	it("should show delete menu for non-mermaid codeBlock", async () => {
		const editor = createMockEditor();
		render(<DragHandleMenu editor={editor} />);

		mockDragHandleOnNodeChange?.({
			node: { type: { name: "codeBlock" }, textContent: "const x = 1;", attrs: { language: "javascript" } },
		});

		await waitFor(() => expect(screen.getByTestId("drag-handle")).toBeTruthy());
		fireEvent.click(screen.getByTestId("drag-handle"));

		await waitFor(() => {
			const menu = screen.getByTestId("drag-handle-menu");
			expect(within(menu).getByText("Delete")).toBeTruthy();
			expect(within(menu).queryByText("Heading 1")).toBeFalsy();
		});
	});
});
