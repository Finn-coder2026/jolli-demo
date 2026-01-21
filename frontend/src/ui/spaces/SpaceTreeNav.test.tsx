import type { SpaceTreeActions, SpaceTreeState } from "../../hooks/useSpaceTree";
import { SpaceTreeNav } from "./SpaceTreeNav";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Doc, Space } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockDoc(overrides: Partial<Doc> = {}): Doc {
	return {
		id: 1,
		jrn: "doc:test-doc",
		slug: "test-doc",
		path: "",
		content: "# Test\n\nContent",
		contentType: "text/markdown",
		source: undefined,
		sourceMetadata: undefined,
		contentMetadata: { title: "Test Document" },
		updatedBy: "user",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		version: 1,
		spaceId: 1,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "user",
		deletedAt: undefined,
		explicitlyDeleted: false,
		...overrides,
	};
}

function createMockSpace(overrides: Partial<Space> = {}): Space {
	return {
		id: 1,
		name: "default",
		slug: "default",
		jrn: "space:default",
		description: undefined,
		ownerId: 1,
		defaultSort: "default",
		defaultFilters: {},
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

describe("SpaceTreeNav", () => {
	const mockActions: SpaceTreeActions = {
		loadSpace: vi.fn().mockResolvedValue(createMockSpace()),
		loadTree: vi.fn().mockResolvedValue(undefined),
		loadTrash: vi.fn().mockResolvedValue(undefined),
		toggleExpanded: vi.fn(),
		selectDoc: vi.fn(),
		setShowTrash: vi.fn(),
		createFolder: vi.fn().mockResolvedValue(createMockDoc({ docType: "folder" })),
		createDoc: vi.fn().mockResolvedValue(createMockDoc()),
		softDelete: vi.fn().mockResolvedValue(undefined),
		restore: vi.fn().mockResolvedValue(undefined),
		refreshTree: vi.fn().mockResolvedValue(undefined),
		rename: vi.fn().mockResolvedValue(createMockDoc()),
	};

	function createMockState(overrides: Partial<SpaceTreeState> = {}): SpaceTreeState {
		return {
			space: createMockSpace(),
			treeData: [],
			trashData: [],
			loading: false,
			hasTrash: false,
			selectedDocId: undefined,
			showTrash: false,
			...overrides,
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render space name", () => {
		const state = createMockState({
			space: createMockSpace({ name: "My Knowledge Base" }),
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("space-name")).toBeDefined();
		expect(screen.getByText("My Knowledge Base")).toBeDefined();
	});

	it("should not render space name when space is undefined", () => {
		const state = createMockState({ space: undefined });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.queryByTestId("space-name")).toBeNull();
	});

	it("should render loading state", () => {
		const state = createMockState({ loading: true });

		const { container } = render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Verify Skeleton components are rendered
		const skeletons = container.querySelectorAll(".animate-pulse");
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("should render empty state when no documents", () => {
		const state = createMockState({ treeData: [], loading: false });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByText("No documents yet")).toBeDefined();
	});

	it("should render tree items when documents exist", () => {
		const doc = createMockDoc({ contentMetadata: { title: "My Document" } });
		const state = createMockState({
			treeData: [{ doc, children: [], expanded: false }],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByText("My Document")).toBeDefined();
	});

	it("should render create item menu", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("create-item-menu-trigger")).toBeDefined();
	});

	it("should show trash menu when hasTrash is true", () => {
		const state = createMockState({ hasTrash: true });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("space-more-menu-trigger")).toBeDefined();
	});

	it("should not show trash menu when hasTrash is false", () => {
		const state = createMockState({ hasTrash: false });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.queryByTestId("space-more-menu-trigger")).toBeNull();
	});

	it("should call loadTrash and setShowTrash when clicking trash option", async () => {
		const state = createMockState({ hasTrash: true });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open menu
		fireEvent.click(screen.getByTestId("space-more-menu-trigger"));

		// Click trash option
		await waitFor(() => {
			const trashOption = screen.getByTestId("show-trash-option");
			fireEvent.click(trashOption);
		});

		expect(mockActions.loadTrash).toHaveBeenCalled();
		expect(mockActions.setShowTrash).toHaveBeenCalledWith(true);
	});

	it("should render TrashView when showTrash is true", () => {
		const trashDoc = createMockDoc({
			id: 2,
			deletedAt: "2024-01-02T00:00:00Z",
			explicitlyDeleted: false,
			contentMetadata: { title: "Deleted Document" },
		});
		const state = createMockState({
			showTrash: true,
			trashData: [trashDoc],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("trash-back-button")).toBeDefined();
		expect(screen.getByText("Deleted Document")).toBeDefined();
	});

	it("should call setShowTrash(false) when clicking back in TrashView", () => {
		const state = createMockState({
			showTrash: true,
			trashData: [],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		fireEvent.click(screen.getByTestId("trash-back-button"));

		expect(mockActions.setShowTrash).toHaveBeenCalledWith(false);
	});

	it("should call createFolder with correct parentId", async () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open create menu
		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		// Click create folder option
		await waitFor(() => {
			const folderOption = screen.getByTestId("create-folder-option");
			fireEvent.click(folderOption);
		});

		// Fill in the folder name
		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "New Folder" } });
		});

		// Confirm creation
		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(mockActions.createFolder).toHaveBeenCalledWith(undefined, "New Folder");
		});
	});

	it("should call createDoc with correct parentId", async () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open create menu
		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		// Click create doc option
		await waitFor(() => {
			const docOption = screen.getByTestId("create-doc-option");
			fireEvent.click(docOption);
		});

		// Fill in the doc name
		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "New Document" } });
		});

		// Confirm creation
		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(mockActions.createDoc).toHaveBeenCalledWith(undefined, "New Document", "text/markdown");
		});
	});

	it("should render with correct tree structure", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByRole("tree")).toBeDefined();
		expect(screen.getByTestId("space-tree")).toBeDefined();
	});

	it("should call restore from trash view", async () => {
		const trashDoc = createMockDoc({
			id: 2,
			deletedAt: "2024-01-02T00:00:00Z",
			explicitlyDeleted: false,
			contentMetadata: { title: "Deleted Document" },
		});
		const state = createMockState({
			showTrash: true,
			trashData: [trashDoc],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Click restore button
		const restoreButton = screen.getByTestId("restore-item-2");
		fireEvent.click(restoreButton);

		await waitFor(() => {
			expect(mockActions.restore).toHaveBeenCalledWith(2);
		});
	});

	it("should call softDelete when delete is triggered from tree item", async () => {
		const doc = createMockDoc({
			id: 3,
			contentMetadata: { title: "Document to Delete" },
		});
		const state = createMockState({
			treeData: [{ doc, children: [], expanded: false }],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open the tree item action menu
		const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTrigger);

		// Click delete option
		await waitFor(() => {
			const deleteOption = screen.getByTestId("delete-item-option");
			fireEvent.click(deleteOption);
		});

		// Confirm deletion in the alert dialog
		await waitFor(() => {
			const confirmButton = screen.getByTestId("delete-confirm-button");
			fireEvent.click(confirmButton);
		});

		await waitFor(() => {
			expect(mockActions.softDelete).toHaveBeenCalledWith(3);
		});
	});
});
