import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import { DraftListSection } from "./DraftListSection";
import { fireEvent, waitFor } from "@testing-library/preact";
import type { Doc, DocDraft } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDrafts: Array<DocDraft> = [
	{
		id: 1,
		docId: undefined,
		title: "Draft 1",
		content: "Content 1",
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
		title: "Draft 2",
		content: "Content 2",
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
		title: "Draft 3",
		content: "Content 3",
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

const mockDraftsWithDocId: Array<DocDraft> = [
	{
		id: 1,
		docId: 10,
		title: "Draft editing article",
		content: "Content 1",
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
];

const mockDraftsWithContentType: Array<DocDraft> = [
	{
		id: 1,
		docId: undefined,
		title: "JSON Draft",
		content: '{"openapi": "3.0.0"}',
		contentType: "application/json",
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
		title: "YAML Draft",
		content: "openapi: '3.0.0'",
		contentType: "application/yaml",
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
		title: "Markdown Draft",
		content: "# Content",
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

const mockArticles: Array<Doc> = [
	{
		id: 10,
		jrn: "jrn:jolli:doc:original-article",
		slug: "original-article",
		path: "",
		content: "",
		contentType: "text/markdown",
		contentMetadata: { title: "Original Article Title" },
		source: undefined,
		sourceMetadata: undefined,
		version: 1,
		updatedBy: "test-user",
		createdAt: "2025-01-01T00:00:00Z",
		updatedAt: "2025-01-01T00:00:00Z",
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "test-user",
		deletedAt: undefined,
		explicitlyDeleted: false,
	},
];

// Create stable mock API
const mockDocDraftsApi = {
	listDocDrafts: vi.fn(),
	deleteDocDraft: vi.fn(),
	getSectionChanges: vi.fn(),
};

const mockDocsApi = {
	listDocs: vi.fn(),
};

const mockClient = createMockClient();
mockClient.docDrafts = vi.fn(() => mockDocDraftsApi) as never;
mockClient.docs = vi.fn(() => mockDocsApi) as never;

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("DraftListSection", () => {
	beforeEach(() => {
		mockDocDraftsApi.listDocDrafts.mockClear();
		mockDocDraftsApi.deleteDocDraft.mockClear();
		mockDocDraftsApi.getSectionChanges.mockClear();
		mockDocsApi.listDocs.mockClear();
		// Default mock for getSectionChanges - returns empty changes
		mockDocDraftsApi.getSectionChanges.mockResolvedValue({ changes: [] });
	});

	it("renders section header", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("drafts-section-toggle")).toBeTruthy();
		});
	});

	it("loads and displays drafts", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
			expect(getByTestId("draft-item-2")).toBeTruthy();
			expect(getByTestId("draft-item-3")).toBeTruthy();
		});
	});

	it("shows loading state initially", () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		expect(getByTestId("drafts-loading")).toBeTruthy();
	});

	it("shows empty state when no drafts", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue([]);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("no-drafts")).toBeTruthy();
		});
	});

	it("navigates to edit draft when Edit button clicked", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<DraftListSection />, { initialPath: "/" });

		await waitFor(() => {
			expect(getByTestId("edit-draft-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("edit-draft-1"));

		// Navigation would have been called via navigate()
		// We'd need to check the RouterContext mock to verify navigation
	});

	it("toggles expanded state when toggle button clicked", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { getByTestId, queryByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});

		// Click to collapse
		fireEvent.click(getByTestId("drafts-section-toggle"));

		await waitFor(() => {
			expect(queryByTestId("draft-item-1")).toBeNull();
		});

		// Click to expand
		fireEvent.click(getByTestId("drafts-section-toggle"));

		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});
	});

	it("shows View all drafts link when there are more drafts than limit", async () => {
		// Return 6 drafts when limit is 5
		mockDocDraftsApi.listDocDrafts.mockResolvedValue([...mockDrafts, ...mockDrafts]);

		const { getByTestId } = renderWithProviders(<DraftListSection limit={5} />);

		await waitFor(() => {
			expect(getByTestId("view-all-drafts")).toBeTruthy();
		});
	});

	it("does not show View all drafts link when drafts count is within limit", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		const { queryByTestId } = renderWithProviders(<DraftListSection limit={10} />);

		await waitFor(() => {
			expect(queryByTestId("view-all-drafts")).toBeNull();
		});
	});

	it("respects custom limit prop", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		renderWithProviders(<DraftListSection limit={2} />);

		await waitFor(() => {
			expect(mockDocDraftsApi.listDocDrafts).toHaveBeenCalledWith(3, 0);
		});
	});

	it("handles error when loading drafts fails", async () => {
		mockDocDraftsApi.listDocDrafts.mockRejectedValue(new Error("Network error"));

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		// Should show empty state on error
		await waitFor(() => {
			expect(getByTestId("no-drafts")).toBeTruthy();
		});
	});

	it("navigates to draft articles page when View all drafts clicked", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue([...mockDrafts, ...mockDrafts]);

		const { getByTestId } = renderWithProviders(<DraftListSection limit={5} />, { initialPath: "/" });

		await waitFor(() => {
			expect(getByTestId("view-all-drafts")).toBeTruthy();
		});

		fireEvent.click(getByTestId("view-all-drafts"));

		// Navigation would be handled by NavigationContext
	});

	it("deletes draft when Delete button clicked and confirmed", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);
		mockDocDraftsApi.deleteDocDraft.mockResolvedValue(undefined);

		// Mock window.confirm to return true
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("delete-draft-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("delete-draft-1"));

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalled();
			expect(mockDocDraftsApi.deleteDocDraft).toHaveBeenCalledWith(1);
		});

		confirmSpy.mockRestore();
	});

	it("does not delete draft when Delete button clicked and cancelled", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);

		// Mock window.confirm to return false
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("delete-draft-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("delete-draft-1"));

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalled();
		});

		// Delete should not have been called
		expect(mockDocDraftsApi.deleteDocDraft).not.toHaveBeenCalled();

		confirmSpy.mockRestore();
	});

	it("handles delete error gracefully", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDrafts);
		mockDocDraftsApi.deleteDocDraft.mockRejectedValue(new Error("Delete failed"));

		// Mock window.confirm to return true
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("delete-draft-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("delete-draft-1"));

		await waitFor(() => {
			expect(mockDocDraftsApi.deleteDocDraft).toHaveBeenCalled();
		});

		// Component should still be functional after error
		expect(getByTestId("drafts-section-toggle")).toBeTruthy();

		confirmSpy.mockRestore();
	});

	it("displays editing indicator when draft is editing an existing article", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDraftsWithDocId);
		mockDocsApi.listDocs.mockResolvedValue(mockArticles);

		const { container } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(mockDocsApi.listDocs).toHaveBeenCalled();
		});

		// Check for the editing indicator text
		await waitFor(() => {
			const editingText = container.textContent;
			expect(editingText).toContain("Original Article Title");
		});
	});

	it("handles error when fetching articles for drafts fails", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDraftsWithDocId);
		mockDocsApi.listDocs.mockRejectedValue(new Error("Failed to fetch articles"));

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		// Should still display the draft even if article fetch fails
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});

		// The editing indicator should not be displayed since article fetch failed
		await waitFor(() => {
			expect(mockDocsApi.listDocs).toHaveBeenCalled();
		});
	});

	it("displays 'Untitled' when article has no title in contentMetadata", async () => {
		const articlesWithoutTitle: Array<Doc> = [
			{
				id: 10,
				jrn: "jrn:jolli:doc:original-article",
				slug: "original-article",
				path: "",
				content: "",
				contentType: "text/markdown",
				contentMetadata: {},
				source: undefined,
				sourceMetadata: undefined,
				version: 1,
				updatedBy: "test-user",
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				sortOrder: 0,
				createdBy: "test-user",
				deletedAt: undefined,
				explicitlyDeleted: false,
			},
		];

		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDraftsWithDocId);
		mockDocsApi.listDocs.mockResolvedValue(articlesWithoutTitle);

		const { container } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(mockDocsApi.listDocs).toHaveBeenCalled();
		});

		// Check for the "Untitled" fallback text
		await waitFor(() => {
			const editingText = container.textContent;
			expect(editingText).toContain("Untitled");
		});
	});

	it("displays content type badge for JSON draft", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDraftsWithContentType);

		const { getAllByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			const badges = getAllByTestId("draft-content-type-badge");
			// JSON and YAML drafts should have badges, Markdown should not
			expect(badges.length).toBe(2);
		});
	});

	it("does not display content type badge for Markdown drafts", async () => {
		const markdownOnlyDrafts: Array<DocDraft> = [
			{
				id: 1,
				docId: undefined,
				title: "Markdown Only Draft",
				content: "# Content",
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
		];

		mockDocDraftsApi.listDocDrafts.mockResolvedValue(markdownOnlyDrafts);

		const { queryByTestId, getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});

		// Should not have content type badge for markdown
		expect(queryByTestId("draft-content-type-badge")).toBeNull();
	});

	it("displays suggested edits badge when draft has pending section changes", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDraftsWithDocId);
		mockDocsApi.listDocs.mockResolvedValue(mockArticles);
		mockDocDraftsApi.getSectionChanges.mockResolvedValue({
			changes: [
				{
					id: 1,
					docDraftId: 1,
					sectionHeading: "Section 1",
					newContent: "new",
					applied: false,
					dismissed: false,
				},
				{
					id: 2,
					docDraftId: 1,
					sectionHeading: "Section 2",
					newContent: "new2",
					applied: false,
					dismissed: false,
				},
			],
		});

		const { container } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(mockDocDraftsApi.getSectionChanges).toHaveBeenCalled();
		});

		// Check for suggested edits badge with count
		await waitFor(() => {
			const text = container.textContent;
			expect(text).toContain("2");
		});
	});

	it("does not display suggested edits badge when all changes are applied or dismissed", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDraftsWithDocId);
		mockDocsApi.listDocs.mockResolvedValue(mockArticles);
		mockDocDraftsApi.getSectionChanges.mockResolvedValue({
			changes: [
				{
					id: 1,
					docDraftId: 1,
					sectionHeading: "Section 1",
					newContent: "new",
					applied: true,
					dismissed: false,
				},
				{
					id: 2,
					docDraftId: 1,
					sectionHeading: "Section 2",
					newContent: "new2",
					applied: false,
					dismissed: true,
				},
			],
		});

		const { container, getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});

		// Wait for all API calls to complete
		await waitFor(() => {
			expect(mockDocDraftsApi.getSectionChanges).toHaveBeenCalled();
		});

		// The suggested edits badge should not be displayed since all are applied/dismissed
		// Check that "suggested" is not in the text (the badge would show "X suggested edits")
		const text = container.textContent;
		expect(text).not.toContain("suggested");
	});

	it("handles error when fetching section changes fails", async () => {
		mockDocDraftsApi.listDocDrafts.mockResolvedValue(mockDraftsWithDocId);
		mockDocsApi.listDocs.mockResolvedValue(mockArticles);
		mockDocDraftsApi.getSectionChanges.mockRejectedValue(new Error("Failed to fetch section changes"));

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		// Should still display the draft even if section changes fetch fails
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});
	});

	it("displays shared badge when draft is shared", async () => {
		const sharedDraft: Array<DocDraft> = [
			{
				id: 1,
				docId: undefined,
				title: "Shared Draft",
				content: "Content",
				contentType: "text/markdown",
				createdBy: 100,
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
				contentLastEditedAt: "2025-01-01T00:05:00Z",
				contentLastEditedBy: 100,
				contentMetadata: undefined,
				isShared: true,
				sharedAt: "2025-01-01T00:00:00Z",
				sharedBy: 100,
				createdByAgent: false,
			},
		];

		mockDocDraftsApi.listDocDrafts.mockResolvedValue(sharedDraft);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("draft-shared-badge")).toBeTruthy();
		});
	});

	it("displays AI badge when draft was created by agent", async () => {
		const aiDraft: Array<DocDraft> = [
			{
				id: 1,
				docId: undefined,
				title: "AI Generated Draft",
				content: "Content",
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
				createdByAgent: true,
			},
		];

		mockDocDraftsApi.listDocDrafts.mockResolvedValue(aiDraft);

		const { getByTestId } = renderWithProviders(<DraftListSection />);

		await waitFor(() => {
			expect(getByTestId("draft-ai-badge")).toBeTruthy();
		});
	});
});
