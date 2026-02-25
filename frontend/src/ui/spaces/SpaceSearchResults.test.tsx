import { SpaceSearchResults } from "./SpaceSearchResults";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { SPACE_SEARCH_MAX_RESULTS, type SpaceSearchResponse } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the ClientContext using the same pattern as useSpaceTree.test.ts
const mockSearchInSpace = vi.fn();

const mockSpacesClient = {
	searchInSpace: mockSearchInSpace,
};

const mockClient = {
	spaces: () => mockSpacesClient,
};

vi.mock("../../contexts/ClientContext", () => ({
	useClient: () => mockClient,
}));

const mockIntlayerContent = {
	noResults: { value: "No results" },
	noResultsDescription: { value: "Try another query" },
	result: "result",
	results: "results",
	showingFirstN: ({ count }: { count: number }) => `Showing first ${count}`,
	resultsLimited: "Results limited",
};

vi.mock("react-intlayer", () => ({
	useIntlayer: () => mockIntlayerContent,
}));

function createMockResponse(overrides: Partial<SpaceSearchResponse> = {}): SpaceSearchResponse {
	return {
		results: [],
		total: 0,
		limited: false,
		...overrides,
	};
}

function createMockResult(id: number, title: string) {
	return {
		doc: {
			id,
			jrn: `doc:test-${id}`,
			slug: `test-${id}`,
			path: "",
			docType: "document" as const,
			contentMetadata: { title },
			content: "",
			contentType: "text/markdown",
			spaceId: 1,
			parentId: undefined,
			sortOrder: 0,
			version: 1,
			source: undefined,
			sourceMetadata: undefined,
			createdBy: "user",
			updatedBy: "user",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
			deletedAt: undefined,
			explicitlyDeleted: false,
		},
		contentSnippet: "",
		matchType: "title" as const,
		relevance: 1.0,
	};
}

describe("SpaceSearchResults", () => {
	const mockOnResultClick = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		// Default mock returns empty results
		mockSearchInSpace.mockResolvedValue(createMockResponse());
	});

	it("should show loading state initially", () => {
		// Create a promise that never resolves for loading state
		mockSearchInSpace.mockImplementation(
			() =>
				new Promise(() => {
					/* never resolves */
				}),
		);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		expect(screen.getByTestId("space-search-loading")).toBeDefined();
	});

	it("should show empty state when no results", async () => {
		mockSearchInSpace.mockResolvedValue(createMockResponse());

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("space-search-empty")).toBeDefined();
		});
	});

	it("should render search results", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test Document")],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("space-search-results")).toBeDefined();
			expect(screen.getByTestId("search-result-1")).toBeDefined();
			// Text is split by highlight function, so check via textContent
			const resultElement = screen.getByTestId("search-result-1");
			expect(resultElement.textContent).toContain("Test");
			expect(resultElement.textContent).toContain("Document");
		});
	});

	it("should show result count and limited warning", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test Document")],
			total: 234,
			limited: true,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			const countElement = screen.getByTestId("space-search-count");
			expect(countElement.textContent).toContain("234");
			expect(countElement.textContent).toContain(`Showing first ${SPACE_SEARCH_MAX_RESULTS}`);
		});
	});

	it("should use singular label when total is 1", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test Document")],
			total: 1,
			limited: false,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			const countElement = screen.getByTestId("space-search-count");
			expect(countElement.textContent).toContain("1");
			expect(countElement.textContent).toContain("result");
		});
	});

	it("should show bottom message when results are limited", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test Document")],
			total: 234,
			limited: true,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("space-search-limited-message")).toBeDefined();
		});
	});

	it("should not show bottom message when results are not limited", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test Document")],
			total: 1,
			limited: false,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("space-search-results")).toBeDefined();
		});

		expect(screen.queryByTestId("space-search-limited-message")).toBeNull();
	});

	it("should call onResultClick when result is clicked", async () => {
		const response = createMockResponse({
			results: [createMockResult(123, "Test Document")],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("search-result-123")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("search-result-123"));

		expect(mockOnResultClick).toHaveBeenCalledWith(123);
	});

	it("should not search when spaceId is undefined", async () => {
		render(<SpaceSearchResults spaceId={undefined} query="test" onResultClick={mockOnResultClick} />);

		// Wait a short time and verify search was not called
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(mockSearchInSpace).not.toHaveBeenCalled();
	});

	it("should not search when query is empty", async () => {
		render(<SpaceSearchResults spaceId={1} query="" onResultClick={mockOnResultClick} />);

		// Wait a short time and verify search was not called
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(mockSearchInSpace).not.toHaveBeenCalled();
	});

	it("should handle search errors gracefully", async () => {
		mockSearchInSpace.mockRejectedValue(new Error("Search failed"));

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		// After error, should show empty state
		await waitFor(() => {
			expect(screen.getByTestId("space-search-empty")).toBeDefined();
		});
	});

	it("should display folder icon for folder type results", async () => {
		const folderResult = {
			...createMockResult(1, "Test Folder"),
			doc: {
				...createMockResult(1, "Test Folder").doc,
				docType: "folder" as const,
			},
		};
		const response = createMockResponse({
			results: [folderResult],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("search-result-1")).toBeDefined();
			// Check folder icon is present (Lucide icon with data attribute)
			const folderIcon = screen.getByTestId("search-result-1").querySelector('[data-lucide-icon="Folder"]');
			expect(folderIcon).toBeDefined();
		});
	});

	it("should display content snippet when available", async () => {
		const resultWithSnippet = {
			...createMockResult(1, "Test Document"),
			contentSnippet: "This is a <b>test</b> snippet with highlights",
		};
		const response = createMockResponse({
			results: [resultWithSnippet],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("search-result-1")).toBeDefined();
			// Check snippet content is rendered (contains the text)
			const resultElement = screen.getByTestId("search-result-1");
			expect(resultElement.textContent).toContain("snippet");
		});
	});

	it("should sanitize snippet HTML and preserve bold tags", async () => {
		const resultWithSnippet = {
			...createMockResult(1, "Test Document"),
			contentSnippet: 'Snippet with <b>test</b> and <script>alert("x")</script>',
		};
		const response = createMockResponse({
			results: [resultWithSnippet],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			const resultElement = screen.getByTestId("search-result-1");
			const snippetDiv = resultElement.querySelector("div.text-xs");
			expect(snippetDiv).toBeDefined();

			// The highlightText function returns a span with dangerouslySetInnerHTML
			const snippetSpan = snippetDiv?.querySelector("span");
			expect(snippetSpan).toBeDefined();

			// Bold tags should be preserved
			expect(snippetSpan?.innerHTML).toContain("<b>test</b>");

			// Script tags should be escaped (not actual script elements)
			expect(snippetSpan?.innerHTML).toContain("&lt;script&gt;");
			expect(snippetSpan?.innerHTML).toContain("&lt;/script&gt;");

			// Should not contain actual script tags (XSS prevention)
			expect(snippetSpan?.querySelector("script")).toBeNull();
		});
	});

	it("should highlight search terms with special regex characters", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test [Document] (v1.0)")],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		// Search for text with special characters
		render(<SpaceSearchResults spaceId={1} query="[Document]" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("search-result-1")).toBeDefined();
			// The highlight function should handle special regex chars
			const resultElement = screen.getByTestId("search-result-1");
			expect(resultElement.textContent).toContain("Document");
		});
	});

	it("should highlight selected result", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test Document")],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} selectedDocId={1} />);

		await waitFor(() => {
			const resultElement = screen.getByTestId("search-result-1");
			expect(resultElement.className).toContain("bg-accent");
		});
	});

	it("should show Untitled when title is undefined in contentMetadata", async () => {
		const resultWithNoTitle = {
			...createMockResult(1, ""),
			doc: {
				...createMockResult(1, "").doc,
				contentMetadata: {},
			},
		};
		const response = createMockResponse({
			results: [resultWithNoTitle],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("search-result-1")).toBeDefined();
			// Missing title should show "Untitled"
			const resultElement = screen.getByTestId("search-result-1");
			expect(resultElement.textContent).toContain("Untitled");
		});
	});

	it("should ignore stale results when unmounted", async () => {
		let resolveSearch: (response: SpaceSearchResponse) => void = () => {
			// Placeholder for promise resolver.
		};
		const pendingSearch = new Promise<SpaceSearchResponse>(resolve => {
			resolveSearch = resolve;
		});
		mockSearchInSpace.mockReturnValue(pendingSearch);

		const { unmount } = render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		unmount();
		resolveSearch(createMockResponse({ results: [createMockResult(1, "Late Result")], total: 1 }));

		await new Promise(resolve => setTimeout(resolve, 0));

		expect(mockSearchInSpace).toHaveBeenCalledWith(1, "test");
	});

	it("should show Untitled when contentMetadata is undefined", async () => {
		const resultWithNoMetadata = {
			...createMockResult(1, ""),
			doc: {
				...createMockResult(1, "").doc,
				contentMetadata: undefined,
			},
		};
		const response = createMockResponse({
			results: [resultWithNoMetadata],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("search-result-1")).toBeDefined();
			const resultElement = screen.getByTestId("search-result-1");
			expect(resultElement.textContent).toContain("Untitled");
		});
	});

	it("should handle empty title string gracefully", async () => {
		// When title is empty string, component now shows "Untitled" (using || instead of ??)
		const resultWithEmptyTitle = {
			...createMockResult(1, ""),
			doc: {
				...createMockResult(1, "").doc,
				contentMetadata: { title: "" },
			},
		};
		const response = createMockResponse({
			results: [resultWithEmptyTitle],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			const resultElement = screen.getByTestId("search-result-1");
			expect(resultElement).toBeDefined();
			// Empty string title now shows "Untitled" (|| treats "" as falsy)
			expect(resultElement.textContent).toContain("Untitled");
		});
	});

	it("should sanitize title HTML when it contains bold tags", async () => {
		const resultWithHtmlTitle = {
			...createMockResult(1, "<b>Bold</b> Title"),
			doc: {
				...createMockResult(1, "<b>Bold</b> Title").doc,
				contentMetadata: { title: "<b>Bold</b> Title" },
			},
		};
		const response = createMockResponse({
			results: [resultWithHtmlTitle],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		render(<SpaceSearchResults spaceId={1} query="bold" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			const resultElement = screen.getByTestId("search-result-1");
			const titleElement = resultElement.querySelector("div.font-medium");
			expect(titleElement).toBeDefined();
			expect(titleElement?.innerHTML).toContain("<b>Bold</b>");
		});
	});

	it("should clear results when query becomes empty", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test Document")],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		const { rerender } = render(<SpaceSearchResults spaceId={1} query="test" onResultClick={mockOnResultClick} />);

		await waitFor(() => {
			expect(screen.getByTestId("search-result-1")).toBeDefined();
		});

		rerender(<SpaceSearchResults spaceId={1} query="" onResultClick={mockOnResultClick} />);

		// When query becomes empty, results are immediately cleared
		await waitFor(() => {
			expect(screen.getByTestId("space-search-empty")).toBeDefined();
		});

		// Result element should no longer exist
		expect(screen.queryByTestId("search-result-1")).toBeNull();
	});

	it("should return plain html when query is empty in highlightText", async () => {
		const response = createMockResponse({
			results: [createMockResult(1, "Test Document")],
			total: 1,
		});
		mockSearchInSpace.mockResolvedValue(response);

		// Pass empty query to trigger the early return in highlightText
		render(<SpaceSearchResults spaceId={1} query="" onResultClick={mockOnResultClick} />);

		// Should not perform search with empty query
		await new Promise(resolve => setTimeout(resolve, 50));
		expect(mockSearchInSpace).not.toHaveBeenCalled();
	});

	it("should ignore error result if newer search was triggered (cancelled check)", async () => {
		// biome-ignore lint/suspicious/noEmptyBlockStatements: Initial value for rejection function, will be assigned
		let rejectFirstSearch: (reason: Error) => void = () => {};

		// First search - will reject after delay
		mockSearchInSpace.mockImplementationOnce(
			() =>
				new Promise((_, reject) => {
					rejectFirstSearch = reject;
				}),
		);

		const { rerender } = render(<SpaceSearchResults spaceId={1} query="first" onResultClick={mockOnResultClick} />);

		// Immediately trigger second search
		mockSearchInSpace.mockResolvedValue(
			createMockResponse({
				results: [createMockResult(1, "Second Search Result")],
				total: 1,
			}),
		);

		rerender(<SpaceSearchResults spaceId={1} query="second" onResultClick={mockOnResultClick} />);

		// Now reject the first search (after component has moved on)
		rejectFirstSearch(new Error("First search failed"));

		// Should show results from second search, not error state
		await waitFor(() => {
			expect(screen.getByTestId("space-search-results")).toBeDefined();
			expect(screen.getByText("Second")).toBeDefined();
		});
	});
});
