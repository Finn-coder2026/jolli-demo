import { renderWithProviders, waitForLoadingToFinish } from "../test/TestUtils";
import { ArticlesWithSuggestedUpdates } from "./ArticlesWithSuggestedUpdates";
import { fireEvent, waitFor } from "@testing-library/preact";
import type { DocDraft, DocDraftWithPendingChanges } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockNavigationState = {
	navigate: mockNavigate,
};

vi.mock("../contexts/NavigationContext", async () => {
	const actual = await vi.importActual("../contexts/NavigationContext");
	return {
		...actual,
		useNavigation: () => mockNavigationState,
	};
});

const mockGetDraftsWithPendingChanges = vi.fn();

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: () => ({
			docDrafts: () => ({
				getDraftsWithPendingChanges: mockGetDraftsWithPendingChanges,
			}),
		}),
	};
});

describe("ArticlesWithSuggestedUpdates", () => {
	const createMockDraft = (id: number, title: string): DocDraft => ({
		id,
		docId: undefined,
		title,
		content: "Test content",
		contentType: "text/markdown",
		createdBy: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		contentLastEditedAt: new Date().toISOString(),
		contentLastEditedBy: 1,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: undefined,
		sharedBy: undefined,
		createdByAgent: false,
	});

	const createMockDraftWithChanges = (
		id: number,
		title: string,
		pendingCount: number,
	): DocDraftWithPendingChanges => ({
		draft: createMockDraft(id, title),
		pendingChangesCount: pendingCount,
		lastChangeUpdatedAt: new Date().toISOString(),
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders loading state initially", () => {
		mockGetDraftsWithPendingChanges.mockImplementation(
			() =>
				new Promise(() => {
					// Never resolves - intentionally for testing loading state
				}),
		);

		const { getByText } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		expect(getByText("Loading articles...")).toBeTruthy();
	});

	it("renders empty state when no drafts with changes", async () => {
		mockGetDraftsWithPendingChanges.mockResolvedValue([]);

		const { getByText } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByText("No articles with suggested updates")).toBeTruthy();
		});
	});

	it("renders list of drafts with pending changes", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [
			createMockDraftWithChanges(1, "Article One", 3),
			createMockDraftWithChanges(2, "Article Two", 5),
		];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByText, getByTestId } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByText("Article One")).toBeTruthy();
		});
		expect(getByText("Article Two")).toBeTruthy();
		expect(getByTestId("draft-card-1")).toBeTruthy();
		expect(getByTestId("draft-card-2")).toBeTruthy();
	});

	it("displays suggestion count for each draft", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByText } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByText(/3\s*suggestions/)).toBeTruthy();
		});
	});

	it("navigates to draft when card is clicked", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-card-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("draft-card-1"));

		expect(mockNavigate).toHaveBeenCalledWith("/article-draft/1");
	});

	it("navigates to draft on Enter key press", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-card-1")).toBeTruthy();
		});

		fireEvent.keyDown(getByTestId("draft-card-1"), { key: "Enter" });

		expect(mockNavigate).toHaveBeenCalledWith("/article-draft/1");
	});

	it("navigates to draft on Space key press", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-card-1")).toBeTruthy();
		});

		fireEvent.keyDown(getByTestId("draft-card-1"), { key: " " });

		expect(mockNavigate).toHaveBeenCalledWith("/article-draft/1");
	});

	it("does not navigate on other key presses", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-card-1")).toBeTruthy();
		});

		fireEvent.keyDown(getByTestId("draft-card-1"), { key: "Tab" });

		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("navigates back to dashboard when back button is clicked", async () => {
		mockGetDraftsWithPendingChanges.mockResolvedValue([]);

		const { getByText } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByText("Back to Dashboard")).toBeTruthy();
		});

		fireEvent.click(getByText("Back to Dashboard"));

		expect(mockNavigate).toHaveBeenCalledWith("/");
	});

	it("renders title and subtitle", async () => {
		mockGetDraftsWithPendingChanges.mockResolvedValue([]);

		const { getByText } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByText("Articles with Suggested Updates")).toBeTruthy();
		});
		expect(getByText("Review and apply suggested edits to your articles")).toBeTruthy();
	});

	it("handles error loading drafts gracefully", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Silence console errors in test
		});
		mockGetDraftsWithPendingChanges.mockRejectedValue(new Error("API error"));

		const { getByText } = renderWithProviders(<ArticlesWithSuggestedUpdates />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			// Should show empty state on error
			expect(getByText("No articles with suggested updates")).toBeTruthy();
		});
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});
