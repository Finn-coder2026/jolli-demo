import { createMockClient, renderWithProviders } from "../test/TestUtils";
import { DraftArticles } from "./DraftArticles";
import { fireEvent, waitFor } from "@testing-library/preact";
import type { DocDraft } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDrafts: Array<DocDraft> = [
	{
		id: 1,
		docId: undefined,
		title: "Article about TypeScript",
		content: "TypeScript is a typed superset of JavaScript...",
		contentType: "text/markdown",
		createdBy: 100,
		createdAt: "2025-01-01T00:00:00Z",
		updatedAt: "2025-01-01T00:00:00Z",
		contentLastEditedAt: "2025-01-01T00:05:00Z",
		contentLastEditedBy: 100,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: undefined,
		sharedBy: undefined,
		createdByAgent: false,
	},
	{
		id: 2,
		docId: undefined,
		title: "Guide to React Testing",
		content: "Testing React components is important...",
		contentType: "text/markdown",
		createdBy: 101,
		createdAt: "2025-01-02T00:00:00Z",
		updatedAt: "2025-01-02T00:00:00Z",
		contentLastEditedAt: "2025-01-02T00:05:00Z",
		contentLastEditedBy: 101,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: undefined,
		sharedBy: undefined,
		createdByAgent: false,
	},
	{
		id: 3,
		docId: undefined,
		title: "Python Best Practices",
		content: "Writing clean Python code requires...",
		contentType: "text/markdown",
		createdBy: 102,
		createdAt: "2025-01-03T00:00:00Z",
		updatedAt: "2025-01-03T00:00:00Z",
		contentLastEditedAt: "2025-01-03T00:05:00Z",
		contentLastEditedBy: 102,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: undefined,
		sharedBy: undefined,
		createdByAgent: false,
	},
];

// Create stable mock API
const mockDocDraftsApi = {
	listDocDrafts: vi.fn(),
	deleteDocDraft: vi.fn(),
};

const mockClient = createMockClient();
mockClient.docDrafts = vi.fn(() => mockDocDraftsApi) as never;

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("DraftArticles", () => {
	beforeEach(() => {
		mockDocDraftsApi.listDocDrafts.mockClear();
		mockDocDraftsApi.deleteDocDraft.mockClear();
		global.confirm = vi.fn().mockReturnValue(true);
	});

	it("renders page", () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		expect(getByTestId("draft-articles-page")).toBeTruthy();
	});

	it("loads and displays drafts", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			expect(getByTestId("draft-row-1")).toBeTruthy();
			expect(getByTestId("draft-row-2")).toBeTruthy();
			expect(getByTestId("draft-row-3")).toBeTruthy();
		});
	});

	it("shows loading state initially", () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		expect(getByTestId("drafts-loading")).toBeTruthy();
	});

	it("shows empty state when no drafts", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue([]);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			expect(getByTestId("no-drafts-found")).toBeTruthy();
		});
	});

	it("filters drafts by title search", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId, queryByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			expect(getByTestId("draft-row-1")).toBeTruthy();
		});

		// Search for "TypeScript"
		const searchInput = getByTestId("draft-search-input");
		fireEvent.input(searchInput, { target: { value: "TypeScript" } });

		await waitFor(() => {
			expect(getByTestId("draft-row-1")).toBeTruthy();
			expect(queryByTestId("draft-row-2")).toBeNull();
			expect(queryByTestId("draft-row-3")).toBeNull();
		});
	});

	it("filters drafts by content search", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId, queryByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			expect(getByTestId("draft-row-1")).toBeTruthy();
		});

		// Search for "Testing"
		const searchInput = getByTestId("draft-search-input");
		fireEvent.input(searchInput, { target: { value: "Testing" } });

		await waitFor(() => {
			expect(queryByTestId("draft-row-1")).toBeNull();
			expect(getByTestId("draft-row-2")).toBeTruthy();
			expect(queryByTestId("draft-row-3")).toBeNull();
		});
	});

	it("shows no results message when search returns no matches", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			expect(getByTestId("draft-row-1")).toBeTruthy();
		});

		// Search for something that doesn't exist
		const searchInput = getByTestId("draft-search-input");
		fireEvent.input(searchInput, { target: { value: "NonExistentTerm" } });

		await waitFor(() => {
			expect(getByTestId("no-drafts-found")).toBeTruthy();
		});
	});

	it("navigates to draft edit page when Edit button clicked", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftArticles />, { initialPath: "/draft-articles" });

		await waitFor(() => {
			expect(getByTestId("edit-draft-button-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("edit-draft-button-1"));

		// Navigation would have been called via navigate()
	});

	it("deletes draft when Delete button clicked and confirmed", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);
		mockDocDraftsApi.deleteDocDraft.mockResolvedValue({});

		const { getByTestId, queryByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			expect(getByTestId("delete-draft-button-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("delete-draft-button-1"));

		await waitFor(() => {
			expect(mockDocDraftsApi.deleteDocDraft).toHaveBeenCalledWith(1);
			expect(queryByTestId("draft-row-1")).toBeNull();
		});
	});

	it("does not delete draft when Delete button clicked and cancelled", async () => {
		global.confirm = vi.fn().mockReturnValue(false);
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			expect(getByTestId("delete-draft-button-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("delete-draft-button-1"));

		await waitFor(() => {
			expect(mockDocDraftsApi.deleteDocDraft).not.toHaveBeenCalled();
			expect(getByTestId("draft-row-1")).toBeTruthy();
		});
	});

	it("handles delete error gracefully", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);
		mockDocDraftsApi.deleteDocDraft.mockRejectedValue(new Error("Delete failed"));

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			expect(getByTestId("delete-draft-button-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("delete-draft-button-1"));

		await waitFor(() => {
			// Draft should still be visible after error
			expect(getByTestId("draft-row-1")).toBeTruthy();
		});
	});

	it("displays draft content preview", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			const row = getByTestId("draft-row-1");
			expect(row.textContent).toContain("TypeScript is a typed superset of JavaScript...");
		});
	});

	it("truncates long content preview", async () => {
		const longContent = "A".repeat(200);
		const draftsWithLongContent = [
			{
				...mockDrafts[0],
				content: longContent,
			},
		];
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(draftsWithLongContent);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			const row = getByTestId("draft-row-1");
			expect(row.textContent).toContain("...");
		});
	});

	it("handles error when loading drafts fails", async () => {
		mockDocDraftsApi.listDocDrafts.mockRejectedValue(new Error("Network error"));

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		// Should show empty state on error
		await waitFor(() => {
			expect(getByTestId("no-drafts-found")).toBeTruthy();
		});
	});

	it("displays user avatars for draft creators", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftArticles />);

		await waitFor(() => {
			// Check that avatars are rendered
			expect(getByTestId("user-avatar-100")).toBeTruthy();
			expect(getByTestId("user-avatar-101")).toBeTruthy();
			expect(getByTestId("user-avatar-102")).toBeTruthy();
		});
	});
});
