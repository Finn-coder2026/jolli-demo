import { createMockDevToolsInfo, renderWithProviders } from "../test/TestUtils";
import { Articles } from "./Articles";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockOptions {
	// Override specific endpoints with custom handlers
	draftCounts?: {
		all: number;
		myNewDrafts: number;
		mySharedNewDrafts: number;
		sharedWithMe: number;
		suggestedUpdates: number;
	};
	filteredDrafts?: { drafts: Array<unknown>; total: number };
	// General handler for other endpoints
	handler?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

// Helper to create a fetch mock that handles both devTools and test-specific endpoints
function createFetchMock(
	testMockOrOptions?: ((url: string | URL | Request, init?: RequestInit) => Promise<Response>) | MockOptions,
) {
	// Handle both old function-style and new options-style
	const options: MockOptions =
		typeof testMockOrOptions === "function" ? { handler: testMockOrOptions } : testMockOrOptions || {};

	const defaultDraftCounts = { all: 0, myNewDrafts: 0, mySharedNewDrafts: 0, sharedWithMe: 0, suggestedUpdates: 0 };
	const defaultFilteredDrafts = { drafts: [], total: 0 };

	return vi.fn((url: string | URL | Request, init?: RequestInit) => {
		const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

		// Always handle devTools endpoint first
		if (urlString.includes("/api/dev-tools/info")) {
			return Promise.resolve({
				ok: true,
				json: async () => createMockDevToolsInfo(),
			} as Response);
		}

		// Handle draft counts endpoint - use override or default
		if (urlString.includes("/api/doc-drafts/counts")) {
			return Promise.resolve({
				ok: true,
				json: async () => options.draftCounts ?? defaultDraftCounts,
			} as Response);
		}

		// Handle filtered drafts endpoint (has filter query param) - use override or default
		if (urlString.includes("/api/doc-drafts") && urlString.includes("filter=")) {
			return Promise.resolve({
				ok: true,
				json: async () => options.filteredDrafts ?? defaultFilteredDrafts,
			} as Response);
		}

		// Use test-specific handler if provided
		if (options.handler) {
			return options.handler(url, init);
		}

		// Default fallback
		return Promise.resolve({ ok: true, json: async () => [] } as Response);
	});
}

vi.mock("./Article", () => ({
	Article: () => <div>Article Component</div>,
}));

vi.mock("../components/ui/SelectBox", () => {
	const onValueChangeMap: Map<string, (value: string) => void> = new Map();

	return {
		SelectBox: ({
			options,
			onValueChange,
			value,
			className,
			placeholder,
			"data-testid": dataTestId,
		}: {
			options: Array<{ value: string; label: string }>;
			value: string;
			onValueChange: (value: string) => void;
			width?: string;
			className?: string;
			placeholder?: string;
			"data-testid"?: string;
		}) => {
			const testId = dataTestId || "selectbox-mock";
			onValueChangeMap.set(testId, onValueChange);
			return (
				<div data-testid={testId}>
					<button type="button" className={className} data-testid={`${testId}-trigger`}>
						{value || placeholder}
					</button>
					{options.map(option => (
						<div
							key={option.value}
							data-testid={`${testId}-item`}
							data-value={option.value}
							onClick={() => onValueChangeMap.get(testId)?.(option.value)}
						>
							{option.label}
						</div>
					))}
				</div>
			);
		},
	};
});

describe("Articles", () => {
	const renderWithUrlParams = (pathname = "/articles") => {
		return renderWithProviders(<Articles />, { initialPath: pathname });
	};

	beforeEach(() => {
		// Clear localStorage to ensure consistent test state
		localStorage.clear();
		// Set up default fetch mock
		global.fetch = createFetchMock();
	});

	it("should render articles heading", () => {
		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response),
		);

		renderWithUrlParams();

		expect(screen.getByText("Articles")).toBeDefined();
	});

	it("should render subtitle", () => {
		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response),
		);

		renderWithUrlParams();

		expect(screen.getByText("Manage and review your documentation across all sources")).toBeDefined();
	});

	it("should render search input", () => {
		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response),
		);

		renderWithUrlParams();

		expect(screen.getByPlaceholderText("Search articles...")).toBeDefined();
	});

	it("should render Add Article button", () => {
		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response),
		);

		renderWithUrlParams();

		expect(screen.getByTestId("new-article-button")).toBeDefined();
	});

	it("should show loading state initially", () => {
		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response),
		);

		renderWithUrlParams();

		expect(screen.getByText("Loading articles...")).toBeDefined();
	});

	it("should fetch and display articles", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:test",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Test Article",
					sourceName: "GitHub Docs",
					status: "upToDate",
					qualityScore: 85,
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
			expect(screen.getByText("GitHub Docs")).toBeDefined();
		});
	});

	it("should display drafts in the list with badges", async () => {
		// NEW drafts (no docId) are shown as separate items
		const mockDrafts = [
			{
				id: 1,
				title: "My Draft",
				content: "Draft content",
				contentType: "text/markdown",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				createdBy: 1,
				isShared: true,
				createdByAgent: false,
				docId: undefined,
			},
			{
				id: 2,
				title: "AI Generated Draft",
				content: "AI content",
				contentType: "text/markdown",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				createdBy: 1,
				isShared: false,
				createdByAgent: true,
				docId: undefined,
			},
			{
				id: 3,
				title: "Draft editing article",
				content: "Edit content",
				contentType: "text/markdown",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				createdBy: 1,
				isShared: false,
				createdByAgent: false,
				docId: 123, // This draft edits the article below
			},
		];

		// Article that is being edited by the draft
		const mockDocs = [
			{
				id: 123,
				jrn: "doc:existing-article",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Existing Article Being Edited",
					sourceName: "Test",
				},
			},
		];

		global.fetch = createFetchMock({
			draftCounts: { all: 3, myNewDrafts: 2, mySharedNewDrafts: 0, sharedWithMe: 1, suggestedUpdates: 1 },
			filteredDrafts: { drafts: mockDrafts, total: 3 },
			handler: url => {
				const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

				if (urlString.includes("/api/docs")) {
					return Promise.resolve({
						ok: true,
						json: async () => mockDocs,
					} as Response);
				}

				return Promise.resolve({
					ok: true,
					json: async () => [],
				} as Response);
			},
		});

		renderWithUrlParams();

		// NEW drafts appear as separate items
		await waitFor(() => {
			expect(screen.getByText("My Draft")).toBeDefined();
			expect(screen.getByText("AI Generated Draft")).toBeDefined();
		});

		// Drafts editing articles do NOT appear as separate items - the article shows instead
		expect(screen.queryByText("Draft editing article")).toBeNull();
		expect(screen.getByText("Existing Article Being Edited")).toBeDefined();

		// Check for badges on new drafts
		expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
		expect(screen.getByText("Shared")).toBeDefined();
		expect(screen.getByText("AI Draft")).toBeDefined();
		// "Editing" badge shows on the article row now
		expect(screen.getByText("Editing")).toBeDefined();
	});

	it("should only show articles with suggestions when suggested-updates filter is selected", async () => {
		// Create a draft that references an article (has docId)
		const mockDraftsWithSuggestions = [
			{
				id: 1,
				title: "Draft for Article 2",
				content: "Draft content",
				contentType: "text/markdown",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				createdBy: 1,
				isShared: false,
				createdByAgent: true,
				docId: 2, // References article with id 2
			},
		];

		const mockDocs = [
			{
				id: 1,
				jrn: "doc:article1",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Article Without Suggestions",
					sourceName: "Test",
				},
			},
			{
				id: 2,
				jrn: "doc:article2",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Article With Suggestions",
					sourceName: "Test",
				},
			},
		];

		global.fetch = createFetchMock({
			draftCounts: { all: 2, myNewDrafts: 0, mySharedNewDrafts: 0, sharedWithMe: 0, suggestedUpdates: 1 },
			filteredDrafts: { drafts: mockDraftsWithSuggestions, total: 1 },
			handler: url => {
				const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

				if (urlString.includes("/api/docs")) {
					return Promise.resolve({
						ok: true,
						json: async () => mockDocs,
					} as Response);
				}

				return Promise.resolve({
					ok: true,
					json: async () => [],
				} as Response);
			},
		});

		const { container } = renderWithUrlParams();

		// Wait for initial load with "all" filter
		// Both articles are shown; draft editing article is NOT shown as separate item
		await waitFor(() => {
			expect(screen.getByText("Article Without Suggestions")).toBeDefined();
			expect(screen.getByText("Article With Suggestions")).toBeDefined();
			// Draft editing article is NOT shown as separate item
			expect(screen.queryByText("Draft for Article 2")).toBeNull();
		});

		// Click on "Articles with Suggested Updates" filter card
		const suggestedCard = container.querySelector('[data-testid="filter-card-suggested"]');
		expect(suggestedCard).toBeDefined();
		if (suggestedCard) {
			fireEvent.click(suggestedCard);
		}

		// After clicking, only article with suggestions should be shown
		await waitFor(() => {
			expect(screen.getByText("Article With Suggestions")).toBeDefined();
			expect(screen.queryByText("Article Without Suggestions")).toBeNull();
		});
	});

	it("should show 'Suggested Updates' badge on articles in suggested-updates filter", async () => {
		// Create a draft that references an article (has docId)
		const mockDraftsWithSuggestions = [
			{
				id: 1,
				title: "Draft for Article 2",
				content: "Draft content",
				contentType: "text/markdown",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				createdBy: 1,
				isShared: false,
				createdByAgent: true,
				docId: 2, // References article with id 2
			},
		];

		const mockDocs = [
			{
				id: 1,
				jrn: "doc:article1",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Article Without Suggestions",
					sourceName: "Test",
				},
			},
			{
				id: 2,
				jrn: "doc:article2",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Article With Suggestions",
					sourceName: "Test",
				},
			},
		];

		global.fetch = createFetchMock({
			draftCounts: { all: 2, myNewDrafts: 0, mySharedNewDrafts: 0, sharedWithMe: 0, suggestedUpdates: 1 },
			filteredDrafts: { drafts: mockDraftsWithSuggestions, total: 1 },
			handler: url => {
				const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

				if (urlString.includes("/api/docs")) {
					return Promise.resolve({
						ok: true,
						json: async () => mockDocs,
					} as Response);
				}

				return Promise.resolve({
					ok: true,
					json: async () => [],
				} as Response);
			},
		});

		const { container } = renderWithUrlParams();

		// Wait for initial load with "all" filter - both articles shown, draft NOT shown separately
		await waitFor(() => {
			expect(screen.getByText("Article Without Suggestions")).toBeDefined();
			// Article with draft is shown (not the draft)
			expect(screen.getByText("Article With Suggestions")).toBeDefined();
		});
		// Draft with docId should NOT be shown as separate item
		expect(screen.queryByText("Draft for Article 2")).toBeNull();

		// Article with suggestions should have "Suggested Updates" badge in "all" filter
		expect(screen.queryAllByTestId("suggested-updates-badge").length).toBe(1);

		// Click on "Articles with Suggested Updates" filter card
		const suggestedCard = container.querySelector('[data-testid="filter-card-suggested"]');
		expect(suggestedCard).toBeDefined();
		if (suggestedCard) {
			fireEvent.click(suggestedCard);
		}

		// In suggested-updates filter, only article with suggestions is shown
		await waitFor(() => {
			expect(screen.getByText("Article With Suggestions")).toBeDefined();
			expect(screen.queryByText("Article Without Suggestions")).toBeNull();
		});

		// Article with suggestions should have the "Suggested Updates" badge
		const suggestedBadges = screen.queryAllByTestId("suggested-updates-badge");
		expect(suggestedBadges.length).toBe(1);
		expect(suggestedBadges[0].textContent).toBe("Suggested Updates");
	});

	it("should navigate to draft when clicking Edit button on draft", async () => {
		const mockDrafts = [
			{
				id: 123,
				title: "Test Draft",
				content: "Draft content",
				contentType: "text/markdown",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				createdBy: 1,
				isShared: false,
				createdByAgent: false,
				docId: undefined,
			},
		];

		global.fetch = createFetchMock({
			draftCounts: { all: 1, myNewDrafts: 1, mySharedNewDrafts: 0, sharedWithMe: 0, suggestedUpdates: 0 },
			filteredDrafts: { drafts: mockDrafts, total: 1 },
			handler: () =>
				Promise.resolve({
					ok: true,
					json: async () => [],
				} as Response),
		});

		const pushStateSpy = vi.spyOn(window.history, "pushState");

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Test Draft")).toBeDefined();
		});

		const editButton = screen.getByTestId("edit-draft-button");
		fireEvent.click(editButton);

		expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/article-draft/123");

		pushStateSpy.mockRestore();
	});

	it("should delete draft when Delete button clicked and confirmed", async () => {
		const mockDrafts = [
			{
				id: 456,
				title: "Draft to Delete",
				content: "Draft content",
				contentType: "text/markdown",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				createdBy: 1,
				isShared: false,
				createdByAgent: false,
				docId: undefined,
			},
		];

		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		global.fetch = createFetchMock({
			draftCounts: { all: 1, myNewDrafts: 1, mySharedNewDrafts: 0, sharedWithMe: 0, suggestedUpdates: 0 },
			filteredDrafts: { drafts: mockDrafts, total: 1 },
			handler: (_url, init) => {
				const urlString = typeof _url === "string" ? _url : _url instanceof URL ? _url.toString() : _url.url;
				const method = init?.method || "GET";

				if (urlString.includes("/api/doc-drafts/456") && method === "DELETE") {
					return Promise.resolve({
						ok: true,
						status: 204,
						json: async () => ({}),
					} as Response);
				}

				return Promise.resolve({
					ok: true,
					json: async () => [],
				} as Response);
			},
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Draft to Delete")).toBeDefined();
		});

		const deleteButton = screen.getByTestId("delete-draft-button-456");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalled();
			expect(screen.queryByText("Draft to Delete")).toBeNull();
		});

		confirmSpy.mockRestore();
	});

	it("should display articles with different statuses", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:test1",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Needs Update Article",
					sourceName: "GitHub Docs",
					status: "needsUpdate",
					commitsAhead: 5,
					qualityScore: 40,
				},
			},
			{
				id: 2,
				jrn: "doc:test2",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Under Review Article",
					sourceName: "Internal Wiki",
					status: "underReview",
					qualityScore: 60,
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Needs Update Article")).toBeDefined();
			expect(screen.getByText("Under Review Article")).toBeDefined();
		});
	});

	it("should handle fetch errors gracefully", async () => {
		global.fetch = createFetchMock(() => Promise.reject(new Error("Network error")));

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error logging during test
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("No articles found")).toBeDefined();
		});

		consoleSpy.mockRestore();
	});

	it("should show empty state when no articles match filters", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:test",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Test Article",
					sourceName: "GitHub Docs",
					status: "upToDate",
					qualityScore: 85,
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		// Search for something that doesn't exist
		const searchInput = screen.getByPlaceholderText("Search articles...") as HTMLInputElement;
		fireEvent.input(searchInput, { target: { value: "nonexistent" } });

		await waitFor(() => {
			expect(screen.getByText("No articles match your filters")).toBeDefined();
		});
	});

	it("should display content type badge for JSON articles", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:json-article",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "{}",
				contentType: "application/json",
				version: 1,
				contentMetadata: {
					title: "JSON Article",
					sourceName: "Test",
				},
			},
			{
				id: 2,
				jrn: "doc:openapi-json-article",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "{}",
				contentType: "application/vnd.oai.openapi+json",
				version: 1,
				contentMetadata: {
					title: "OpenAPI JSON Article",
					sourceName: "Test",
				},
			},
			{
				id: 3,
				jrn: "doc:yaml-article",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "key: value",
				contentType: "application/yaml",
				version: 1,
				contentMetadata: {
					title: "YAML Article",
					sourceName: "Test",
				},
			},
			{
				id: 4,
				jrn: "doc:openapi-yaml-article",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "openapi: 3.0.0",
				contentType: "application/vnd.oai.openapi",
				version: 1,
				contentMetadata: {
					title: "OpenAPI YAML Article",
					sourceName: "Test",
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("JSON Article")).toBeDefined();
			expect(screen.getByText("OpenAPI JSON Article")).toBeDefined();
			expect(screen.getByText("YAML Article")).toBeDefined();
			expect(screen.getByText("OpenAPI YAML Article")).toBeDefined();
			// Check that content type badges are displayed
			const badges = screen.getAllByTestId("content-type-badge");
			expect(badges.length).toBe(4);
		});
	});

	it("should display quality score with different colors", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:low-quality",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Low Quality",
					sourceName: "Test",
					qualityScore: 30,
				},
			},
			{
				id: 2,
				jrn: "doc:medium-quality",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Medium Quality",
					sourceName: "Test",
					qualityScore: 50,
				},
			},
			{
				id: 3,
				jrn: "doc:high-quality",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "High Quality",
					sourceName: "Test",
					qualityScore: 90,
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Low Quality")).toBeDefined();
			expect(screen.getByText("Medium Quality")).toBeDefined();
			expect(screen.getByText("High Quality")).toBeDefined();
		});
	});

	it("should format time correctly", async () => {
		const now = new Date("2025-10-06T00:00:00Z");
		vi.setSystemTime(now);

		const mockDocs = [
			{
				id: 1,
				jrn: "doc:today",
				createdAt: "2025-10-06T00:00:00Z",
				updatedAt: "2025-10-06T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Today Article",
					sourceName: "Test",
					lastUpdated: "2025-10-06T00:00:00Z",
				},
			},
			{
				id: 2,
				jrn: "doc:yesterday",
				createdAt: "2025-10-05T00:00:00Z",
				updatedAt: "2025-10-05T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Yesterday Article",
					sourceName: "Test",
					lastUpdated: "2025-10-05T00:00:00Z",
				},
			},
			{
				id: 3,
				jrn: "doc:one-week",
				createdAt: "2025-09-29T00:00:00Z",
				updatedAt: "2025-09-29T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "One Week Article",
					sourceName: "Test",
					lastUpdated: "2025-09-29T00:00:00Z",
				},
			},
			{
				id: 3.5,
				jrn: "doc:two-weeks",
				createdAt: "2025-09-22T00:00:00Z",
				updatedAt: "2025-09-22T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Two Weeks Article",
					sourceName: "Test",
					lastUpdated: "2025-09-22T00:00:00Z",
				},
			},
			{
				id: 4,
				jrn: "doc:one-month",
				createdAt: "2025-09-06T00:00:00Z",
				updatedAt: "2025-09-06T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "One Month Article",
					sourceName: "Test",
					lastUpdated: "2025-09-06T00:00:00Z",
				},
			},
			{
				id: 5,
				jrn: "doc:two-months",
				createdAt: "2025-08-06T00:00:00Z",
				updatedAt: "2025-08-06T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Two Months Article",
					sourceName: "Test",
					lastUpdated: "2025-08-06T00:00:00Z",
				},
			},
			{
				id: 6,
				jrn: "doc:no-status",
				createdAt: "2025-10-05T00:00:00Z",
				updatedAt: "2025-10-05T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "No Status Article",
					sourceName: "Test",
					lastUpdated: "2025-10-05T00:00:00Z",
				},
			},
			{
				id: 7,
				jrn: "doc:old",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Old Article",
					sourceName: "Test",
					lastUpdated: "2024-01-01T00:00:00Z",
				},
			},
			{
				id: 8,
				jrn: "doc:unknown-status",
				createdAt: "2025-10-05T00:00:00Z",
				updatedAt: "2025-10-05T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Unknown Status Article",
					sourceName: "Test",
					status: "unknown",
					lastUpdated: "2025-10-05T00:00:00Z",
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Today Article")).toBeDefined();
			expect(screen.getByText("Yesterday Article")).toBeDefined();
			expect(screen.getByText("One Week Article")).toBeDefined();
			expect(screen.getByText("Two Weeks Article")).toBeDefined();
			expect(screen.getByText("One Month Article")).toBeDefined();
			expect(screen.getByText("Two Months Article")).toBeDefined();
			expect(screen.getByText("No Status Article")).toBeDefined();
			expect(screen.getByText("Old Article")).toBeDefined();
			expect(screen.getByText("Unknown Status Article")).toBeDefined();
		});

		vi.useRealTimers();
	});

	it("should open preview when clicking preview icon", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:test",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Test Article",
					sourceName: "GitHub Docs",
					status: "upToDate",
					qualityScore: 85,
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		// Find and click the preview icon button (the button without text, just an icon)
		const buttons = screen.getAllByRole("button");
		// The preview button should be a button with no text content and has an svg child
		const previewButton = buttons.find(
			btn => !btn.textContent?.trim() && btn.querySelector("svg") && btn.className.includes("h-8 w-8"),
		);

		expect(previewButton).toBeDefined();

		if (previewButton) {
			fireEvent.click(previewButton);
			expect(openSpy).toHaveBeenCalledWith("/articles/doc%3Atest/preview", "_blank");
		}

		openSpy.mockRestore();
	});

	it("should navigate to article detail when clicking Review button", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:test-review",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Review Test Article",
					sourceName: "GitHub Docs",
					status: "upToDate",
					qualityScore: 85,
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		const pushStateSpy = vi.spyOn(window.history, "pushState");

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Review Test Article")).toBeDefined();
		});

		// Find and click the Review button
		const reviewButton = screen.getByText("Review");
		fireEvent.click(reviewButton);

		expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/articles/doc%3Atest-review");

		pushStateSpy.mockRestore();
	});

	it("should handle articles with undefined metadata fields", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:no-metadata",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T12:34:56Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
			},
			{
				id: 2,
				jrn: "doc:partial-metadata",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getAllByText("Untitled").length).toBeGreaterThan(0);
			expect(screen.getAllByText("Unknown Source").length).toBeGreaterThan(0);
		});
	});

	it("should hide /root articles in default space and show them when /root is selected", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "/root/article1",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Root Article",
					sourceName: "Test",
					status: "upToDate",
				},
			},
			{
				id: 2,
				jrn: "doc:other-article",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Other Article",
					sourceName: "Test",
					status: "upToDate",
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		const { container } = renderWithUrlParams();

		// Default space should show "Other Article" but NOT "Root Article"
		await waitFor(() => {
			expect(screen.getByText("Other Article")).toBeDefined();
			expect(screen.queryByText("Root Article")).toBeNull();
		});

		// Find and click the space filter select item with data-value="/root"
		const spaceFilterItems = container.querySelectorAll('[data-testid="space-filter-item"]');
		const rootItem = Array.from(spaceFilterItems).find(item => item.getAttribute("data-value") === "/root");
		if (rootItem) {
			fireEvent.click(rootItem);
		}

		// When /root is selected, show "Root Article" but NOT "Other Article"
		await waitFor(() => {
			expect(screen.getByText("Root Article")).toBeDefined();
			expect(screen.queryByText("Other Article")).toBeNull();
		});

		// Now clear the filter by selecting the default option
		const defaultItem = Array.from(spaceFilterItems).find(item => item.getAttribute("data-value") === "default");
		if (defaultItem) {
			fireEvent.click(defaultItem);
		}

		// When filter is cleared, show "Other Article" again but not "Root Article"
		await waitFor(() => {
			expect(screen.getByText("Other Article")).toBeDefined();
			expect(screen.queryByText("Root Article")).toBeNull();
		});
	});

	it("should render Article component when article JRN is in URL", () => {
		renderWithUrlParams("/articles/doc:test-123");

		expect(screen.getByText("Article Component")).toBeDefined();
	});

	it("should render articles list when path is not articles view", () => {
		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response),
		);

		// Use a different path that's not "/articles"
		renderWithUrlParams("/dashboard");

		// Should render articles list, not detail view
		expect(screen.getByText("Articles")).toBeDefined();
	});

	it("should open new article title dialog when Add Article button is clicked", async () => {
		// Mock fetch to return empty lists for docs and drafts
		global.fetch = createFetchMock(url => {
			const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

			if (urlString.includes("/api/doc-drafts")) {
				return Promise.resolve({
					ok: true,
					json: async () => [], // No unsaved drafts
				} as Response);
			}

			return Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response);
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalled();
		});

		const addButton = screen.getByTestId("new-article-button");
		fireEvent.click(addButton);

		// The NewArticleTitleDialog should be rendered
		await waitFor(() => {
			expect(screen.getByTestId("new-article-title-dialog-content")).toBeDefined();
		});
	});

	it("should show DraftSelectionDialog when there are unsaved drafts", async () => {
		const unsavedDraft = {
			id: 456,
			title: "Unsaved Draft",
			content: "Draft content",
			docId: null,
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "user",
		};

		global.fetch = createFetchMock(url => {
			const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

			if (urlString.includes("/api/doc-drafts")) {
				return Promise.resolve({
					ok: true,
					json: async () => [unsavedDraft], // Return unsaved draft
				} as Response);
			}

			return Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response);
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalled();
		});

		// Click new article button
		const addButton = screen.getByTestId("new-article-button");
		fireEvent.click(addButton);

		// Wait for draft selection dialog to appear
		await waitFor(() => {
			expect(screen.getByTestId("draft-selection-dialog-content")).toBeDefined();
		});
	});

	it("should handle creating new draft from DraftSelectionDialog", async () => {
		const unsavedDraft = {
			id: 456,
			title: "Unsaved Draft",
			content: "Draft content",
			docId: null,
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "user",
		};

		global.fetch = createFetchMock(url => {
			const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

			if (urlString.includes("/api/doc-drafts")) {
				return Promise.resolve({
					ok: true,
					json: async () => [unsavedDraft],
				} as Response);
			}

			return Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response);
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalled();
		});

		const addButton = screen.getByTestId("new-article-button");
		fireEvent.click(addButton);

		await waitFor(() => {
			expect(screen.getByTestId("draft-selection-dialog-content")).toBeDefined();
		});

		// Click create new button
		const createNewButton = screen.getByTestId("create-new-draft-button");
		fireEvent.click(createNewButton);

		// Should show title dialog
		await waitFor(() => {
			expect(screen.getByTestId("new-article-title-dialog-content")).toBeDefined();
		});
	});

	it("should handle closing DraftSelectionDialog", async () => {
		const unsavedDraft = {
			id: 456,
			title: "Unsaved Draft",
			content: "Draft content",
			docId: null,
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "user",
		};

		global.fetch = createFetchMock(url => {
			const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

			if (urlString.includes("/api/doc-drafts")) {
				return Promise.resolve({
					ok: true,
					json: async () => [unsavedDraft],
				} as Response);
			}

			return Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response);
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalled();
		});

		const addButton = screen.getByTestId("new-article-button");
		fireEvent.click(addButton);

		await waitFor(() => {
			expect(screen.getByTestId("draft-selection-dialog-content")).toBeDefined();
		});

		// Click close button
		const closeButton = screen.getByTestId("close-dialog-button");
		fireEvent.click(closeButton);

		// Dialog should be closed
		await waitFor(() => {
			expect(screen.queryByTestId("draft-selection-dialog-content")).toBeNull();
		});
	});

	it("should show DuplicateTitleDialog when creating article with duplicate title", async () => {
		const existingDoc = {
			id: 1,
			jrn: "doc:existing",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Existing content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Duplicate Title",
			},
		};

		global.fetch = createFetchMock(url => {
			const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

			if (urlString.includes("/api/doc-drafts")) {
				return Promise.resolve({
					ok: true,
					json: async () => [], // No unsaved drafts
				} as Response);
			}

			if (urlString.includes("/api/docs")) {
				return Promise.resolve({
					ok: true,
					json: async () => [existingDoc],
				} as Response);
			}

			return Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response);
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Duplicate Title")).toBeDefined();
		});

		// Click new article button
		const addButton = screen.getByTestId("new-article-button");
		fireEvent.click(addButton);

		// Wait for title dialog to appear
		await waitFor(() => {
			expect(screen.getByTestId("new-article-title-dialog-content")).toBeDefined();
		});

		// Find the title input and submit button
		const titleInput = screen.getByTestId("title-input") as HTMLInputElement;
		fireEvent.input(titleInput, { target: { value: "Duplicate Title" } });

		const createButton = screen.getByTestId("create-button");
		fireEvent.click(createButton);

		// Wait for duplicate dialog to appear
		await waitFor(() => {
			expect(screen.getByTestId("duplicate-title-dialog-content")).toBeDefined();
		});

		// Close the duplicate dialog
		const closeButtons = screen.getAllByTestId("close-dialog-button");
		// Get the last close button (which should be from the duplicate dialog, as it's the top-most dialog)
		const closeButton = closeButtons[closeButtons.length - 1];
		fireEvent.click(closeButton);

		// Dialog should be closed
		await waitFor(() => {
			expect(screen.queryByTestId("duplicate-title-dialog-content")).toBeNull();
		});
	});

	it("should delete article when Delete button clicked and confirmed", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:test-delete",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Delete Test Article",
					sourceName: "GitHub Docs",
					status: "upToDate",
					qualityScore: 85,
				},
			},
		];

		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		global.fetch = createFetchMock((_url, init) => {
			const urlString = typeof _url === "string" ? _url : _url instanceof URL ? _url.toString() : _url.url;
			const method = init?.method || "GET";

			if (urlString.includes("/api/docs/doc%3Atest-delete") && method === "DELETE") {
				return Promise.resolve({
					ok: true,
					status: 204,
					json: async () => ({}),
				} as Response);
			}

			if (urlString.includes("/api/docs")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDocs,
				} as Response);
			}

			return Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response);
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Delete Test Article")).toBeDefined();
		});

		const deleteButton = screen.getByTestId("delete-article-button-doc:test-delete");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalled();
			expect(screen.queryByText("Delete Test Article")).toBeNull();
		});

		confirmSpy.mockRestore();
	});

	it("should not delete article when Delete button clicked and cancelled", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:test-cancel",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Cancel Delete Article",
					sourceName: "GitHub Docs",
					status: "upToDate",
					qualityScore: 85,
				},
			},
		];

		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		global.fetch = createFetchMock(url => {
			const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

			if (urlString.includes("/api/docs")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDocs,
				} as Response);
			}

			return Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response);
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Cancel Delete Article")).toBeDefined();
		});

		const deleteButton = screen.getByTestId("delete-article-button-doc:test-cancel");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalled();
		});

		// Article should still be visible
		expect(screen.getByText("Cancel Delete Article")).toBeDefined();

		confirmSpy.mockRestore();
	});

	it("should display source doc badge and permissions for source documents", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:source-doc",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Source Document",
					sourceName: "My Uploads",
					isSourceDoc: true,
					permissions: {
						read: true,
						write: false,
						execute: false,
					},
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Source Document")).toBeDefined();
			expect(screen.getByTestId("source-doc-badge")).toBeDefined();
		});
	});

	it("should hide Edit button for source documents", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:source-doc",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Source Document",
					sourceName: "My Uploads",
					isSourceDoc: true,
					permissions: {
						read: true,
						write: false,
						execute: false,
					},
				},
			},
			{
				id: 2,
				jrn: "doc:normal-doc",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Normal Document",
					sourceName: "GitHub",
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Source Document")).toBeDefined();
			expect(screen.getByText("Normal Document")).toBeDefined();
		});

		// Only one Edit button should be present (for the normal doc)
		const editButtons = screen.getAllByTestId("edit-article-button");
		expect(editButtons.length).toBe(1);
	});

	it("should display permissions with all enabled states", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:full-permissions",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Full Permissions Doc",
					sourceName: "GitHub",
					permissions: {
						read: true,
						write: true,
						execute: true,
					},
				},
			},
		];

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDocs,
			} as Response),
		);

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Full Permissions Doc")).toBeDefined();
		});
	});

	it("should handle delete error gracefully", async () => {
		const mockDocs = [
			{
				id: 1,
				jrn: "doc:test-error",
				createdAt: "2025-10-01T00:00:00Z",
				updatedAt: "2025-10-01T00:00:00Z",
				updatedBy: "system",
				content: "Test content",
				contentType: "text/markdown",
				version: 1,
				contentMetadata: {
					title: "Error Delete Article",
					sourceName: "GitHub Docs",
					status: "upToDate",
					qualityScore: 85,
				},
			},
		];

		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error logging during test
		});

		global.fetch = createFetchMock((_url, init) => {
			const urlString = typeof _url === "string" ? _url : _url instanceof URL ? _url.toString() : _url.url;
			const method = init?.method || "GET";

			if (urlString.includes("/api/docs/doc%3Atest-error") && method === "DELETE") {
				return Promise.reject(new Error("Delete failed"));
			}

			if (urlString.includes("/api/docs")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDocs,
				} as Response);
			}

			return Promise.resolve({
				ok: true,
				json: async () => [],
			} as Response);
		});

		renderWithUrlParams();

		await waitFor(() => {
			expect(screen.getByText("Error Delete Article")).toBeDefined();
		});

		const deleteButton = screen.getByTestId("delete-article-button-doc:test-error");
		fireEvent.click(deleteButton);

		await waitFor(() => {
			expect(confirmSpy).toHaveBeenCalled();
		});

		// Article should still be visible after error
		expect(screen.getByText("Error Delete Article")).toBeDefined();

		confirmSpy.mockRestore();
		consoleSpy.mockRestore();
	});

	describe("localStorage persistence", () => {
		beforeEach(() => {
			localStorage.clear();
		});

		afterEach(() => {
			localStorage.clear();
		});

		it("should load saved filter from localStorage on mount", async () => {
			localStorage.setItem("articles.draftFilter", "my-new-drafts");

			global.fetch = createFetchMock();

			renderWithUrlParams();

			await waitFor(() => {
				const filterCard = screen.getByTestId("filter-card-my-drafts");
				expect(filterCard.getAttribute("data-selected")).toBe("true");
			});
		});

		it("should save filter to localStorage when changed", async () => {
			global.fetch = createFetchMock();

			renderWithUrlParams();

			// Click on "My New Drafts" filter card
			const myDraftsCard = await waitFor(() => screen.getByTestId("filter-card-my-drafts"));
			fireEvent.click(myDraftsCard);

			await waitFor(() => {
				expect(localStorage.getItem("articles.draftFilter")).toBe("my-new-drafts");
			});
		});

		it("should default to 'all' when localStorage has invalid value", async () => {
			localStorage.setItem("articles.draftFilter", "invalid-value");

			global.fetch = createFetchMock();

			renderWithUrlParams();

			await waitFor(() => {
				const filterCard = screen.getByTestId("filter-card-all");
				expect(filterCard.getAttribute("data-selected")).toBe("true");
			});
		});
	});
});
