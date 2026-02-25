import { TrashView } from "./TrashView";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Doc } from "jolli-common";
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
		deletedAt: "2024-01-02T00:00:00Z",
		explicitlyDeleted: false,
		...overrides,
	};
}

describe("TrashView", () => {
	const mockOnRestore = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockOnRestore.mockResolvedValue(undefined);
	});

	it("should render empty state when no trash items", () => {
		render(<TrashView trashData={[]} onRestore={mockOnRestore} />);

		expect(screen.getByText("Trash is empty")).toBeDefined();
	});

	it("should render trash items", () => {
		const doc1 = createMockDoc({ id: 1, contentMetadata: { title: "Document 1" } });
		const doc2 = createMockDoc({ id: 2, contentMetadata: { title: "Document 2" } });

		render(<TrashView trashData={[doc1, doc2]} onRestore={mockOnRestore} />);

		expect(screen.getByText("Document 1")).toBeDefined();
		expect(screen.getByText("Document 2")).toBeDefined();
	});

	it("should render restore button for each item", () => {
		const doc = createMockDoc({ id: 42 });

		render(<TrashView trashData={[doc]} onRestore={mockOnRestore} />);

		expect(screen.getByTestId("restore-item-42")).toBeDefined();
	});

	it("should call onRestore with doc id when restore button is clicked", async () => {
		const doc = createMockDoc({ id: 42 });

		render(<TrashView trashData={[doc]} onRestore={mockOnRestore} />);

		fireEvent.click(screen.getByTestId("restore-item-42"));

		await waitFor(() => {
			expect(mockOnRestore).toHaveBeenCalledWith(42);
		});
	});

	it("should render folder icon for folders", () => {
		const folder = createMockDoc({ id: 1, docType: "folder" });

		const { container } = render(<TrashView trashData={[folder]} onRestore={mockOnRestore} />);

		const folderIcon = container.querySelector('[data-lucide-icon="Folder"]');
		expect(folderIcon).toBeDefined();
	});

	it("should render file icon for documents", () => {
		const doc = createMockDoc({ id: 1, docType: "document" });

		const { container } = render(<TrashView trashData={[doc]} onRestore={mockOnRestore} />);

		const fileIcon = container.querySelector('[data-lucide-icon="FileText"]');
		expect(fileIcon).toBeDefined();
	});

	it("should display jrn when no title in contentMetadata", () => {
		const doc = createMockDoc({
			id: 1,
			jrn: "doc:untitled-123",
			contentMetadata: undefined,
		});

		render(<TrashView trashData={[doc]} onRestore={mockOnRestore} />);

		expect(screen.getByText("doc:untitled-123")).toBeDefined();
	});

	it("should render multiple restore buttons for multiple items", () => {
		const doc1 = createMockDoc({ id: 1 });
		const doc2 = createMockDoc({ id: 2 });
		const doc3 = createMockDoc({ id: 3 });

		render(<TrashView trashData={[doc1, doc2, doc3]} onRestore={mockOnRestore} />);

		expect(screen.getByTestId("restore-item-1")).toBeDefined();
		expect(screen.getByTestId("restore-item-2")).toBeDefined();
		expect(screen.getByTestId("restore-item-3")).toBeDefined();
	});

	it("should render trash item with data-testid", () => {
		const doc = createMockDoc({ id: 123 });

		render(<TrashView trashData={[doc]} onRestore={mockOnRestore} />);

		expect(screen.getByTestId("trash-item-123")).toBeDefined();
	});
});
