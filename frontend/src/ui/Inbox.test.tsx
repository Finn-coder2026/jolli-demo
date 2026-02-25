import { Inbox } from "./Inbox";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { DocDraft, DraftCounts } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create intlayer-style mock values (must be defined before mocks)
function createMockIntlayerValue(value: string) {
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Need String object for .value property
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper returns any to match Intlayer's flexible types
	const str = new String(value) as any;
	str.value = value;
	return str;
}

// Mock contexts
const mockNavigate = vi.fn();
vi.mock("../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
	}),
}));

// Mock intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		title: createMockIntlayerValue("Inbox"),
		subtitle: createMockIntlayerValue("Recent activity and items requiring your attention"),
		searchPlaceholder: createMockIntlayerValue("Search inbox..."),
		loading: createMockIntlayerValue("Loading inbox..."),
		noItems: createMockIntlayerValue("No items in your inbox"),
		empty: createMockIntlayerValue("Your inbox is empty. New drafts and shared items will appear here."),
		sectionNewDrafts: createMockIntlayerValue("My New Drafts"),
		sectionSharedWithMe: createMockIntlayerValue("Shared with Me"),
		sectionSuggestedUpdates: createMockIntlayerValue("Suggested Updates"),
		lastUpdated: createMockIntlayerValue("Updated"),
		draft: createMockIntlayerValue("Draft"),
		shared: createMockIntlayerValue("Shared"),
		aiDraft: createMockIntlayerValue("AI Draft"),
		editing: createMockIntlayerValue("Editing article"),
		editButton: createMockIntlayerValue("Edit"),
		viewButton: createMockIntlayerValue("View"),
		deleteButton: createMockIntlayerValue("Delete"),
		confirmDelete: createMockIntlayerValue(
			"Are you sure you want to delete '{{title}}'? This action cannot be undone.",
		),
	}),
}));

// Mock icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Edit: () => <div data-testid="edit-icon" />,
		Inbox: () => <div data-testid="inbox-icon" />,
		Search: () => <div data-testid="search-icon" />,
		Share2: () => <div data-testid="share2-icon" />,
		Sparkles: () => <div data-testid="sparkles-icon" />,
		Trash2: () => <div data-testid="trash2-icon" />,
	};
});

// Mock client
const mockGetDraftCounts = vi.fn();
const mockListDocDraftsFiltered = vi.fn();
const mockDeleteDraft = vi.fn();

vi.mock("../contexts/ClientContext", () => ({
	useClient: () => ({
		docDrafts: () => ({
			getDraftCounts: mockGetDraftCounts,
			listDocDraftsFiltered: mockListDocDraftsFiltered,
			deleteDocDraft: mockDeleteDraft,
		}),
	}),
}));

// Mock formatTimestamp
vi.mock("../util/DateTimeUtil", () => ({
	formatTimestamp: (_dateTimeContent: unknown, dateString: string) => dateString,
}));

// Mock logger
vi.mock("../util/Logger", () => ({
	getLog: () => ({
		debug: vi.fn(),
		error: vi.fn(),
	}),
}));

describe("Inbox", () => {
	const mockDraftCounts: DraftCounts = {
		all: 5,
		myNewDrafts: 2,
		mySharedNewDrafts: 0,
		sharedWithMe: 1,
		suggestedUpdates: 2,
	};

	const mockNewDraft: DocDraft = {
		id: 1,
		title: "New Draft 1",
		docId: undefined,
		createdByAgent: false,
		isShared: false,
		updatedAt: "2026-01-22T10:00:00Z",
		content: "content",
		contentType: "text/markdown",
		createdBy: 1,
		createdAt: "2026-01-22T10:00:00Z",
		contentLastEditedAt: undefined,
		contentLastEditedBy: undefined,
		contentMetadata: undefined,
		sharedAt: undefined,
		sharedBy: undefined,
	};

	const mockAIDraft: DocDraft = {
		id: 2,
		title: "AI Draft 1",
		docId: undefined,
		createdByAgent: true,
		isShared: false,
		updatedAt: "2026-01-22T11:00:00Z",
		content: "content",
		contentType: "text/markdown",
		createdBy: 1,
		createdAt: "2026-01-22T11:00:00Z",
		contentLastEditedAt: undefined,
		contentLastEditedBy: undefined,
		contentMetadata: undefined,
		sharedAt: undefined,
		sharedBy: undefined,
	};

	const mockSharedDraft: DocDraft = {
		id: 3,
		title: "Shared Draft 1",
		docId: undefined,
		createdByAgent: false,
		isShared: true,
		updatedAt: "2026-01-22T12:00:00Z",
		content: "content",
		contentType: "text/markdown",
		createdBy: 2,
		createdAt: "2026-01-22T12:00:00Z",
		contentLastEditedAt: undefined,
		contentLastEditedBy: undefined,
		contentMetadata: undefined,
		sharedAt: "2026-01-22T12:00:00Z",
		sharedBy: 2,
	};

	const mockSuggestedUpdate: DocDraft = {
		id: 4,
		title: "Suggested Update 1",
		docId: 100,
		createdByAgent: false,
		isShared: false,
		updatedAt: "2026-01-22T13:00:00Z",
		content: "content",
		contentType: "text/markdown",
		createdBy: 1,
		createdAt: "2026-01-22T13:00:00Z",
		contentLastEditedAt: undefined,
		contentLastEditedBy: undefined,
		contentMetadata: undefined,
		sharedAt: undefined,
		sharedBy: undefined,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetDraftCounts.mockResolvedValue(mockDraftCounts);
		mockListDocDraftsFiltered.mockImplementation((filter: string) => {
			if (filter === "my-new-drafts") {
				return Promise.resolve({ drafts: [mockNewDraft, mockAIDraft], total: 2 });
			}
			if (filter === "shared-with-me") {
				return Promise.resolve({ drafts: [mockSharedDraft], total: 1 });
			}
			if (filter === "suggested-updates") {
				return Promise.resolve({ drafts: [mockSuggestedUpdate], total: 1 });
			}
			return Promise.resolve({ drafts: [], total: 0 });
		});
		mockDeleteDraft.mockResolvedValue(undefined);
	});

	it("should render loading state initially", () => {
		render(<Inbox />);
		expect(screen.getByText("Loading inbox...")).toBeDefined();
	});

	it("should render empty state when no drafts", async () => {
		mockGetDraftCounts.mockResolvedValue({
			all: 0,
			myNewDrafts: 0,
			mySharedNewDrafts: 0,
			sharedWithMe: 0,
			suggestedUpdates: 0,
		});
		mockListDocDraftsFiltered.mockResolvedValue({ drafts: [], total: 0 });

		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByText("No items in your inbox")).toBeDefined();
			expect(
				screen.getByText("Your inbox is empty. New drafts and shared items will appear here."),
			).toBeDefined();
		});
	});

	it("should render all sections with drafts", async () => {
		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByText("My New Drafts")).toBeDefined();
			expect(screen.getByText("Shared with Me")).toBeDefined();
			expect(screen.getByText("Suggested Updates")).toBeDefined();
		});

		// Verify draft items are rendered
		expect(screen.getByText("New Draft 1")).toBeDefined();
		expect(screen.getByText("AI Draft 1")).toBeDefined();
		expect(screen.getByText("Shared Draft 1")).toBeDefined();
		expect(screen.getByText("Suggested Update 1")).toBeDefined();
	});

	it("should show AI badge for AI-generated drafts", async () => {
		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByTestId("draft-ai-badge-2")).toBeDefined();
		});
	});

	it("should show shared badge for shared drafts", async () => {
		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByTestId("draft-shared-badge-3")).toBeDefined();
		});
	});

	it("should show editing badge for suggested updates", async () => {
		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByTestId("draft-editing-badge-4")).toBeDefined();
		});
	});

	it("should navigate to draft edit when edit button clicked", async () => {
		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByTestId("edit-draft-1")).toBeDefined();
		});

		const editButton = screen.getByTestId("edit-draft-1");
		fireEvent.click(editButton);

		expect(mockNavigate).toHaveBeenCalledWith("/article-draft/1");
	});

	it("should delete draft when delete button clicked and confirmed", async () => {
		const mockConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);

		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByTestId("delete-draft-1")).toBeDefined();
		});

		const deleteButton = screen.getByTestId("delete-draft-1");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(mockDeleteDraft).toHaveBeenCalledWith(1);
		});

		mockConfirm.mockRestore();
	});

	it("should not delete draft when delete is cancelled", async () => {
		const mockConfirm = vi.spyOn(window, "confirm").mockReturnValue(false);

		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByTestId("delete-draft-1")).toBeDefined();
		});

		const deleteButton = screen.getByTestId("delete-draft-1");
		fireEvent.click(deleteButton);

		expect(mockDeleteDraft).not.toHaveBeenCalled();

		mockConfirm.mockRestore();
	});

	it("should filter drafts by search query", async () => {
		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByText("New Draft 1")).toBeDefined();
			expect(screen.getByText("AI Draft 1")).toBeDefined();
		});

		const searchInput = screen.getByTestId("inbox-search");
		fireEvent.input(searchInput, { target: { value: "AI" } });

		// After filtering, "New Draft 1" should not be visible
		expect(screen.queryByText("New Draft 1")).toBeNull();
		// But "AI Draft 1" should still be visible
		expect(screen.getByText("AI Draft 1")).toBeDefined();
	});

	it("should show no results message when search has no matches", async () => {
		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByText("New Draft 1")).toBeDefined();
		});

		const searchInput = screen.getByTestId("inbox-search");
		fireEvent.input(searchInput, { target: { value: "nonexistent" } });

		expect(screen.getByText("No items in your inbox")).toBeDefined();
	});

	it("should hide sections with no drafts", async () => {
		mockListDocDraftsFiltered.mockImplementation((filter: string) => {
			if (filter === "my-new-drafts") {
				return Promise.resolve({ drafts: [mockNewDraft], total: 1 });
			}
			return Promise.resolve({ drafts: [], total: 0 });
		});

		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByText("My New Drafts")).toBeDefined();
		});

		// Shared and Suggested sections should not be visible
		expect(screen.queryByText("Shared with Me")).toBeNull();
		expect(screen.queryByText("Suggested Updates")).toBeNull();
	});

	it("should reload data after successful delete", async () => {
		const mockConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);
		mockDeleteDraft.mockResolvedValue(undefined);

		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByTestId("delete-draft-1")).toBeDefined();
		});

		const deleteButton = screen.getByTestId("delete-draft-1");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			// Should call getDraftCounts and listDocDraftsFiltered again after delete
			expect(mockGetDraftCounts).toHaveBeenCalledTimes(2);
		});

		mockConfirm.mockRestore();
	});

	it("should handle delete error gracefully", async () => {
		const mockConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);
		mockDeleteDraft.mockRejectedValue(new Error("Delete failed"));

		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByTestId("delete-draft-1")).toBeDefined();
		});

		const deleteButton = screen.getByTestId("delete-draft-1");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(mockDeleteDraft).toHaveBeenCalled();
		});

		// Should not crash, error is logged
		expect(screen.getByText("New Draft 1")).toBeDefined();

		mockConfirm.mockRestore();
	});

	it("should handle load error gracefully", async () => {
		mockGetDraftCounts.mockRejectedValue(new Error("Load failed"));

		render(<Inbox />);

		await waitFor(() => {
			// Should show empty state
			expect(screen.getByText("No items in your inbox")).toBeDefined();
		});
	});

	it("should show section badge counts", async () => {
		render(<Inbox />);

		await waitFor(() => {
			expect(screen.getByText("My New Drafts")).toBeDefined();
		});

		// Each section should have a badge showing the count
		// The badges show the count of drafts in each section
		expect(screen.getByText("2")).toBeDefined(); // My New Drafts has 2 drafts
		const onesCount = screen.getAllByText("1"); // Shared with Me and Suggested Updates each have 1
		expect(onesCount.length).toBe(2);
	});

	it("should render 'Untitled' for drafts without a title", async () => {
		const mockDraft: DocDraft = {
			id: 999,
			title: "", // Empty title
			docId: undefined,
			createdByAgent: false,
			isShared: false,
			updatedAt: "2026-01-22T13:00:00Z",
			content: "content",
			contentType: "text/markdown",
			createdBy: 1,
			createdAt: "2026-01-22T13:00:00Z",
			contentLastEditedAt: undefined,
			contentLastEditedBy: undefined,
			contentMetadata: undefined,
			sharedAt: undefined,
			sharedBy: undefined,
		};

		mockGetDraftCounts.mockResolvedValue({
			all: 1,
			myNewDrafts: 1,
			mySharedNewDrafts: 0,
			sharedWithMe: 0,
			suggestedUpdates: 0,
		});
		mockListDocDraftsFiltered.mockImplementation((filter: string) => {
			if (filter === "my-new-drafts") {
				return Promise.resolve({ drafts: [mockDraft], total: 1 });
			}
			return Promise.resolve({ drafts: [], total: 0 });
		});

		render(<Inbox />);

		await waitFor(() => {
			expect(screen.queryByText("Loading inbox...")).toBeNull();
		});

		// Should show "Untitled" for drafts without a title
		expect(screen.getByText("Untitled")).toBeDefined();
	});
});
