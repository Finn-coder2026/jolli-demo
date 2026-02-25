import type { FlattenedItem } from "../../hooks/useFlattenedTree";
import { TreeItemDragOverlay } from "./TreeItemDragOverlay";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

function createMockItem(overrides: Partial<FlattenedItem> = {}): FlattenedItem {
	return {
		id: 1,
		doc: {
			id: 1,
			jrn: "test-doc-jrn",
			slug: "test-doc",
			path: "/test-doc",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
			updatedBy: "user",
			source: undefined,
			sourceMetadata: undefined,
			content: "",
			contentType: "text/markdown",
			contentMetadata: {
				title: "Test Document",
			},
			version: 1,
			spaceId: 1,
			parentId: undefined,
			docType: "document",
			sortOrder: 0,
			createdBy: undefined,
			deletedAt: undefined,
			explicitlyDeleted: false,
		},
		depth: 0,
		parentId: undefined,
		index: 0,
		isFolder: false,
		expanded: false,
		descendantIds: new Set(),
		...overrides,
	};
}

describe("TreeItemDragOverlay", () => {
	it("should render document item with FileText icon", () => {
		const item = createMockItem({ isFolder: false });

		render(<TreeItemDragOverlay item={item} />);

		expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
		expect(screen.getByText("Test Document")).toBeDefined();
	});

	it("should render folder item with Folder icon", () => {
		const item = createMockItem({
			isFolder: true,
			doc: {
				...createMockItem().doc,
				docType: "folder",
				contentMetadata: { title: "Test Folder" },
			},
		});

		render(<TreeItemDragOverlay item={item} />);

		expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
		expect(screen.getByText("Test Folder")).toBeDefined();
	});

	it("should use jrn as fallback when title is missing", () => {
		const item = createMockItem({
			doc: {
				...createMockItem().doc,
				jrn: "fallback-jrn",
				contentMetadata: undefined,
			},
		});

		render(<TreeItemDragOverlay item={item} />);

		expect(screen.getByText("fallback-jrn")).toBeDefined();
	});

	it("should show child count badge for folder with children", () => {
		const item = createMockItem({
			isFolder: true,
			doc: {
				...createMockItem().doc,
				docType: "folder",
				contentMetadata: { title: "Folder with Children" },
			},
		});

		render(<TreeItemDragOverlay item={item} childCount={5} />);

		expect(screen.getByText("Folder with Children")).toBeDefined();
		expect(screen.getByText("5")).toBeDefined();
	});

	it("should not show child count badge for folder with zero children", () => {
		const item = createMockItem({
			isFolder: true,
			doc: {
				...createMockItem().doc,
				docType: "folder",
				contentMetadata: { title: "Empty Folder" },
			},
		});

		render(<TreeItemDragOverlay item={item} childCount={0} />);

		expect(screen.getByText("Empty Folder")).toBeDefined();
		expect(screen.queryByText("0")).toBeNull();
	});

	it("should not show child count badge for document even with childCount", () => {
		const item = createMockItem({
			isFolder: false,
			doc: {
				...createMockItem().doc,
				docType: "document",
				contentMetadata: { title: "Regular Document" },
			},
		});

		render(<TreeItemDragOverlay item={item} childCount={3} />);

		expect(screen.getByText("Regular Document")).toBeDefined();
		expect(screen.queryByText("3")).toBeNull();
	});

	it("should default childCount to 0 when not provided", () => {
		const item = createMockItem({
			isFolder: true,
			doc: {
				...createMockItem().doc,
				docType: "folder",
				contentMetadata: { title: "Folder Default" },
			},
		});

		render(<TreeItemDragOverlay item={item} />);

		expect(screen.getByText("Folder Default")).toBeDefined();
		// Should not have any number badge
		const overlay = screen.getByTestId("tree-item-drag-overlay");
		expect(overlay.querySelectorAll(".bg-muted").length).toBe(0);
	});
});
