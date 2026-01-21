import type { SpaceTreeActions, SpaceTreeState } from "../hooks/useSpaceTree";
import { Spaces } from "./Spaces";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Article component
vi.mock("./Article", () => ({
	Article: ({ jrn }: { jrn: string }) => <div data-testid="article">Article: {jrn}</div>,
}));

// Mock useSpaceTree hook
const mockTreeActions: SpaceTreeActions = {
	loadSpace: vi.fn(),
	loadTree: vi.fn(),
	loadTrash: vi.fn(),
	toggleExpanded: vi.fn(),
	selectDoc: vi.fn(),
	setShowTrash: vi.fn(),
	createFolder: vi.fn(),
	createDoc: vi.fn(),
	softDelete: vi.fn(),
	restore: vi.fn(),
	refreshTree: vi.fn(),
	rename: vi.fn(),
};

const mockTreeState: SpaceTreeState = {
	space: {
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: "space:test",
		description: undefined,
		ownerId: 1,
		defaultSort: "default",
		defaultFilters: {},
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
	treeData: [],
	trashData: [],
	loading: false,
	hasTrash: false,
	selectedDocId: undefined,
	showTrash: false,
};

const mockUseSpaceTree = vi.fn();

vi.mock("../hooks/useSpaceTree", () => ({
	useSpaceTree: () => mockUseSpaceTree() as [SpaceTreeState, SpaceTreeActions],
}));

describe("Spaces", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUseSpaceTree.mockReturnValue([mockTreeState, mockTreeActions]);
	});

	it("should render ResizablePanelGroup with correct structure", () => {
		const { container } = render(<Spaces />);

		// Verify ResizablePanelGroup is rendered with id
		const group = container.querySelector('[data-resizable-group="Group"]');
		expect(group).toBeDefined();

		// Verify empty state is shown when no document selected
		expect(screen.getByText("No document selected")).toBeDefined();
	});

	it("should render two panels with correct ids", () => {
		const { container } = render(<Spaces />);

		// Verify both panels are rendered
		const panels = container.querySelectorAll('[data-resizable-panel="Panel"]');
		expect(panels.length).toBe(2);
	});

	it("should render ResizableHandle", () => {
		const { container } = render(<Spaces />);

		// Verify handle is rendered
		const handle = container.querySelector('[data-resizable-handle="PanelResizeHandle"]');
		expect(handle).toBeDefined();
	});

	it("should render empty state with title and description", () => {
		render(<Spaces />);

		expect(screen.getByText("No document selected")).toBeDefined();
		expect(screen.getByText("Select a document from the tree to view and edit its content.")).toBeDefined();
	});

	it("should render SpaceTreeNav component", () => {
		const { container } = render(<Spaces />);

		// Verify SpaceTreeNav is rendered (it should be in the left panel)
		// SpaceTreeNav has a data-testid="space-tree"
		expect(container.querySelector('[data-testid="space-tree"]')).toBeDefined();
	});

	it("should render Article component when a document is selected", () => {
		const mockStateWithSelection = {
			...mockTreeState,
			selectedDocId: 123,
			treeData: [
				{
					doc: {
						id: 123,
						jrn: "test:doc1",
						slug: "test-doc1",
						title: "Test Document",
						contentType: "text/markdown",
					},
					children: [],
					expanded: false,
				},
			],
		};

		mockUseSpaceTree.mockReturnValueOnce([mockStateWithSelection, mockTreeActions]);

		render(<Spaces />);

		// Verify Article component is rendered with correct jrn
		expect(screen.getByTestId("article")).toBeDefined();
		expect(screen.getByText("Article: test:doc1")).toBeDefined();
	});

	it("should handle nested tree structure with children", () => {
		const mockStateWithNestedTree = {
			...mockTreeState,
			selectedDocId: 456,
			treeData: [
				{
					doc: {
						id: 123,
						jrn: "test:doc1",
						slug: "test-doc1",
						title: "Parent Document",
						contentType: "text/markdown",
					},
					children: [
						{
							doc: {
								id: 456,
								jrn: "test:doc2",
								slug: "test-doc2",
								title: "Child Document",
								contentType: "text/markdown",
							},
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
			],
		};

		mockUseSpaceTree.mockReturnValueOnce([mockStateWithNestedTree, mockTreeActions]);

		render(<Spaces />);

		// Verify Article component is rendered with the selected nested document jrn
		expect(screen.getByTestId("article")).toBeDefined();
		expect(screen.getByText("Article: test:doc2")).toBeDefined();
	});
});
