import { renderWithProviders, waitForLoadingToFinish } from "../../../test/TestUtils";
import { SuggestedUpdatesCard } from "./SuggestedUpdatesCard";
import { fireEvent, waitFor } from "@testing-library/preact";
import type { DocDraft, DocDraftWithPendingChanges } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockNavigationState = {
	navigate: mockNavigate,
};

vi.mock("../../../contexts/NavigationContext", async () => {
	const actual = await vi.importActual("../../../contexts/NavigationContext");
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

describe("SuggestedUpdatesCard", () => {
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

		const { getByText } = renderWithProviders(<SuggestedUpdatesCard />);

		expect(getByText("Loading...")).toBeTruthy();
	});

	it("returns null when no drafts with changes after loading", async () => {
		mockGetDraftsWithPendingChanges.mockResolvedValue([]);

		const { container } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			// The component returns null when there are no drafts
			expect(container.querySelector("[data-testid='draft-item-1']")).toBeNull();
		});
	});

	it("renders list of drafts with pending changes", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [
			createMockDraftWithChanges(1, "Article One", 3),
			createMockDraftWithChanges(2, "Article Two", 5),
		];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByText, getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByText("Article One")).toBeTruthy();
		});
		expect(getByText("Article Two")).toBeTruthy();
		expect(getByTestId("draft-item-1")).toBeTruthy();
		expect(getByTestId("draft-item-2")).toBeTruthy();
	});

	it("shows only 5 most recent drafts", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [
			createMockDraftWithChanges(1, "Article One", 1),
			createMockDraftWithChanges(2, "Article Two", 2),
			createMockDraftWithChanges(3, "Article Three", 3),
			createMockDraftWithChanges(4, "Article Four", 4),
			createMockDraftWithChanges(5, "Article Five", 5),
			createMockDraftWithChanges(6, "Article Six", 6),
		];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId, queryByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});
		// Should show first 5
		expect(getByTestId("draft-item-5")).toBeTruthy();
		// Should not show the 6th
		expect(queryByTestId("draft-item-6")).toBeNull();
	});

	it("shows View All button when more than 5 drafts", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [
			createMockDraftWithChanges(1, "Article One", 1),
			createMockDraftWithChanges(2, "Article Two", 2),
			createMockDraftWithChanges(3, "Article Three", 3),
			createMockDraftWithChanges(4, "Article Four", 4),
			createMockDraftWithChanges(5, "Article Five", 5),
			createMockDraftWithChanges(6, "Article Six", 6),
		];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("view-all-button")).toBeTruthy();
		});
	});

	it("does not show View All button when 5 or fewer drafts", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [
			createMockDraftWithChanges(1, "Article One", 1),
			createMockDraftWithChanges(2, "Article Two", 2),
		];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { queryByTestId, getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});
		expect(queryByTestId("view-all-button")).toBeNull();
	});

	it("navigates to suggested updates page when View All is clicked", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [
			createMockDraftWithChanges(1, "Article One", 1),
			createMockDraftWithChanges(2, "Article Two", 2),
			createMockDraftWithChanges(3, "Article Three", 3),
			createMockDraftWithChanges(4, "Article Four", 4),
			createMockDraftWithChanges(5, "Article Five", 5),
			createMockDraftWithChanges(6, "Article Six", 6),
		];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("view-all-button")).toBeTruthy();
		});

		fireEvent.click(getByTestId("view-all-button"));

		expect(mockNavigate).toHaveBeenCalledWith("/articles/suggested-updates");
	});

	it("navigates to draft when card is clicked", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});

		fireEvent.click(getByTestId("draft-item-1"));

		expect(mockNavigate).toHaveBeenCalledWith("/article-draft/1");
	});

	it("navigates to draft on Enter key press", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});

		fireEvent.keyDown(getByTestId("draft-item-1"), { key: "Enter" });

		expect(mockNavigate).toHaveBeenCalledWith("/article-draft/1");
	});

	it("navigates to draft on Space key press", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});

		fireEvent.keyDown(getByTestId("draft-item-1"), { key: " " });

		expect(mockNavigate).toHaveBeenCalledWith("/article-draft/1");
	});

	it("does not navigate on other key presses", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});

		fireEvent.keyDown(getByTestId("draft-item-1"), { key: "Tab" });

		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("displays suggestion count for each draft", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [createMockDraftWithChanges(1, "Article One", 3)];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { getByText } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByText(/3\s*suggestions/)).toBeTruthy();
		});
	});

	it("handles error loading drafts gracefully", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Silence console errors in test
		});
		mockGetDraftsWithPendingChanges.mockRejectedValue(new Error("API error"));

		const { container } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			// Component returns null on error (no drafts)
			expect(container.querySelector("[data-testid='draft-item-1']")).toBeNull();
		});
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it("renders with exactly 5 drafts and no View All button", async () => {
		const mockDrafts: Array<DocDraftWithPendingChanges> = [
			createMockDraftWithChanges(1, "Article One", 1),
			createMockDraftWithChanges(2, "Article Two", 2),
			createMockDraftWithChanges(3, "Article Three", 3),
			createMockDraftWithChanges(4, "Article Four", 4),
			createMockDraftWithChanges(5, "Article Five", 5),
		];

		mockGetDraftsWithPendingChanges.mockResolvedValue(mockDrafts);

		const { queryByTestId, getByTestId } = renderWithProviders(<SuggestedUpdatesCard />);

		await waitForLoadingToFinish();
		await waitFor(() => {
			expect(getByTestId("draft-item-1")).toBeTruthy();
		});
		expect(getByTestId("draft-item-5")).toBeTruthy();
		expect(queryByTestId("view-all-button")).toBeNull();
	});
});
