import { renderWithProviders } from "../../test/TestUtils";
import { ArticlePicker, filterArticles, getArticleTitle } from "./ArticlePicker";
import { fireEvent, screen } from "@testing-library/preact";
import type { Doc } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Search: () => <div data-testid="search-icon" />,
	};
});

describe("ArticlePicker", () => {
	const mockOnSelectionChange = vi.fn();
	const mockOnIncludeAllChange = vi.fn();

	const mockArticles: Array<Doc> = [
		{
			id: 1,
			jrn: "jrn:article:getting-started",
			contentMetadata: { title: "Getting Started" },
			contentType: "text/markdown",
			content: "",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-02T00:00:00Z",
		} as Doc,
		{
			id: 2,
			jrn: "jrn:article:api-reference",
			contentMetadata: { title: "API Reference" },
			contentType: "text/markdown",
			content: "",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-03T00:00:00Z",
		} as Doc,
		{
			id: 3,
			jrn: "jrn:article:troubleshooting",
			contentMetadata: { title: "Troubleshooting Guide" },
			contentType: "text/markdown",
			content: "",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-04T00:00:00Z",
		} as Doc,
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function renderPicker(props: Partial<React.ComponentProps<typeof ArticlePicker>> = {}) {
		const defaultProps = {
			articles: mockArticles,
			selectedJrns: new Set<string>(),
			onSelectionChange: mockOnSelectionChange,
			includeAll: true,
			onIncludeAllChange: mockOnIncludeAllChange,
		};

		return renderWithProviders(<ArticlePicker {...defaultProps} {...props} />);
	}

	describe("getArticleTitle", () => {
		it("should return content metadata title when available", () => {
			const article = { contentMetadata: { title: "Test Title" }, jrn: "jrn:article:test" } as Doc;
			expect(getArticleTitle(article)).toBe("Test Title");
		});

		it("should return jrn when content metadata title is missing", () => {
			const article = { jrn: "jrn:article:test" } as Doc;
			expect(getArticleTitle(article)).toBe("jrn:article:test");
		});

		it("should return jrn when content metadata is undefined", () => {
			const article = { contentMetadata: undefined, jrn: "jrn:article:test" } as Doc;
			expect(getArticleTitle(article)).toBe("jrn:article:test");
		});
	});

	describe("filterArticles", () => {
		it("should return all articles when query is empty", () => {
			const result = filterArticles(mockArticles, "");
			expect(result).toEqual(mockArticles);
		});

		it("should return all articles when query is whitespace only", () => {
			const result = filterArticles(mockArticles, "   ");
			expect(result).toEqual(mockArticles);
		});

		it("should filter by title (case insensitive)", () => {
			const result = filterArticles(mockArticles, "getting");
			expect(result).toHaveLength(1);
			expect(result[0].jrn).toBe("jrn:article:getting-started");
		});

		it("should filter by jrn (case insensitive)", () => {
			const result = filterArticles(mockArticles, "api-reference");
			expect(result).toHaveLength(1);
			expect(result[0].jrn).toBe("jrn:article:api-reference");
		});

		it("should return empty array when no match", () => {
			const result = filterArticles(mockArticles, "nonexistent");
			expect(result).toHaveLength(0);
		});

		it("should match partial strings", () => {
			const result = filterArticles(mockArticles, "guide");
			expect(result).toHaveLength(1);
			expect(result[0].jrn).toBe("jrn:article:troubleshooting");
		});
	});

	describe("loading state", () => {
		it("should show loading state when isLoading is true", () => {
			renderPicker({ isLoading: true });
			expect(screen.getByTestId("article-picker-loading")).toBeDefined();
		});
	});

	describe("include all mode", () => {
		it("should show mode toggle buttons", () => {
			renderPicker();
			expect(screen.getByTestId("mode-toggle")).toBeDefined();
			expect(screen.getByTestId("mode-all-button")).toBeDefined();
			expect(screen.getByTestId("mode-select-button")).toBeDefined();
		});

		it("should show include all info when enabled", () => {
			renderPicker({ includeAll: true });
			expect(screen.getByTestId("include-all-info")).toBeDefined();
		});

		it("should hide article selection UI when include all is enabled", () => {
			renderPicker({ includeAll: true });
			expect(screen.queryByTestId("article-list")).toBeNull();
			expect(screen.queryByTestId("article-search-input")).toBeNull();
		});

		it("should call onIncludeAllChange when mode button is clicked", () => {
			renderPicker({ includeAll: true });
			const selectButton = screen.getByTestId("mode-select-button");
			fireEvent.click(selectButton);
			expect(mockOnIncludeAllChange).toHaveBeenCalledWith(false);
		});
	});

	describe("specific selection mode", () => {
		it("should show article list when include all is false", () => {
			renderPicker({ includeAll: false });
			expect(screen.getByTestId("article-list")).toBeDefined();
		});

		it("should show search input when include all is false", () => {
			renderPicker({ includeAll: false });
			expect(screen.getByTestId("article-search-input")).toBeDefined();
		});

		it("should show selection count", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started"]),
			});
			expect(screen.getByTestId("selection-count")).toBeDefined();
		});

		it("should show select all button", () => {
			renderPicker({ includeAll: false });
			expect(screen.getByTestId("select-all-button")).toBeDefined();
		});

		it("should show deselect all button", () => {
			renderPicker({ includeAll: false });
			expect(screen.getByTestId("deselect-all-button")).toBeDefined();
		});

		it("should render all articles in list", () => {
			renderPicker({ includeAll: false });
			expect(screen.getByTestId("article-item-jrn:article:getting-started")).toBeDefined();
			expect(screen.getByTestId("article-item-jrn:article:api-reference")).toBeDefined();
			expect(screen.getByTestId("article-item-jrn:article:troubleshooting")).toBeDefined();
		});
	});

	describe("article selection", () => {
		it("should call onSelectionChange when article is selected", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(),
			});

			const checkbox = screen.getByTestId("article-checkbox-jrn:article:getting-started");
			fireEvent.click(checkbox);

			expect(mockOnSelectionChange).toHaveBeenCalled();
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.has("jrn:article:getting-started")).toBe(true);
		});

		it("should call onSelectionChange when article is deselected", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started"]),
			});

			const checkbox = screen.getByTestId("article-checkbox-jrn:article:getting-started");
			fireEvent.click(checkbox);

			expect(mockOnSelectionChange).toHaveBeenCalled();
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.has("jrn:article:getting-started")).toBe(false);
		});

		it("should select all articles when select all is clicked", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(),
			});

			const selectAllButton = screen.getByTestId("select-all-button");
			fireEvent.click(selectAllButton);

			expect(mockOnSelectionChange).toHaveBeenCalled();
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.size).toBe(3);
			expect(newSelection.has("jrn:article:getting-started")).toBe(true);
			expect(newSelection.has("jrn:article:api-reference")).toBe(true);
			expect(newSelection.has("jrn:article:troubleshooting")).toBe(true);
		});

		it("should deselect all articles when deselect all is clicked", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started", "jrn:article:api-reference"]),
			});

			const deselectAllButton = screen.getByTestId("deselect-all-button");
			fireEvent.click(deselectAllButton);

			expect(mockOnSelectionChange).toHaveBeenCalled();
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.size).toBe(0);
		});
	});

	describe("search functionality", () => {
		it("should filter articles based on search query", () => {
			renderPicker({ includeAll: false });

			const searchInput = screen.getByTestId("article-search-input");
			fireEvent.input(searchInput, { target: { value: "getting" } });

			expect(screen.getByTestId("article-item-jrn:article:getting-started")).toBeDefined();
			expect(screen.queryByTestId("article-item-jrn:article:api-reference")).toBeNull();
			expect(screen.queryByTestId("article-item-jrn:article:troubleshooting")).toBeNull();
		});

		it("should show no articles message when search has no results", () => {
			renderPicker({ includeAll: false });

			const searchInput = screen.getByTestId("article-search-input");
			fireEvent.input(searchInput, { target: { value: "nonexistent" } });

			expect(screen.getByTestId("no-articles")).toBeDefined();
		});
	});

	describe("disabled state", () => {
		it("should disable mode buttons when disabled", () => {
			renderPicker({ disabled: true });
			const allButton = screen.getByTestId("mode-all-button") as HTMLButtonElement;
			const selectButton = screen.getByTestId("mode-select-button") as HTMLButtonElement;
			expect(allButton.disabled).toBe(true);
			expect(selectButton.disabled).toBe(true);
		});

		it("should disable article buttons when disabled", () => {
			renderPicker({ includeAll: false, disabled: true });
			const articleButton = screen.getByTestId("article-item-jrn:article:getting-started") as HTMLButtonElement;
			expect(articleButton.disabled).toBe(true);
		});

		it("should disable select all button when disabled", () => {
			renderPicker({ includeAll: false, disabled: true });
			const button = screen.getByTestId("select-all-button") as HTMLButtonElement;
			expect(button.disabled).toBe(true);
		});

		it("should disable deselect all button when disabled", () => {
			renderPicker({ includeAll: false, disabled: true });
			const button = screen.getByTestId("deselect-all-button") as HTMLButtonElement;
			expect(button.disabled).toBe(true);
		});

		it("should disable search input when disabled", () => {
			renderPicker({ includeAll: false, disabled: true });
			const input = screen.getByTestId("article-search-input") as HTMLInputElement;
			expect(input.disabled).toBe(true);
		});
	});

	describe("empty articles", () => {
		it("should show no articles message when articles array is empty", () => {
			renderPicker({ includeAll: false, articles: [] });
			expect(screen.getByTestId("no-articles")).toBeDefined();
		});
	});
});
