import { renderWithProviders } from "../../test/TestUtils";
import { ArticlePicker } from "./ArticlePicker";
import { fireEvent, screen } from "@testing-library/preact";
import type { Doc, Space } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Search: () => <div data-testid="search-icon" />,
		Check: () => <div data-testid="check-icon" />,
		ChevronDown: () => <div data-testid="chevron-down-icon" />,
		ChevronRight: () => <div data-testid="chevron-right-icon" />,
		Layers: () => <div data-testid="layers-icon" />,
		Minus: () => <div data-testid="minus-icon" />,
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
			spaceId: 1,
			sortOrder: 0,
			docType: "document",
		} as Doc,
		{
			id: 2,
			jrn: "jrn:article:api-reference",
			contentMetadata: { title: "API Reference" },
			contentType: "text/markdown",
			content: "",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-03T00:00:00Z",
			spaceId: 1,
			sortOrder: 1,
			docType: "document",
		} as Doc,
		{
			id: 3,
			jrn: "jrn:article:troubleshooting",
			contentMetadata: { title: "Troubleshooting Guide" },
			contentType: "text/markdown",
			content: "",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-04T00:00:00Z",
			spaceId: 2,
			sortOrder: 0,
			docType: "document",
		} as Doc,
	];

	const mockSpaces: Array<Space> = [
		{ id: 1, name: "Documentation", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" } as Space,
		{ id: 2, name: "Support", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" } as Space,
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
			spaces: mockSpaces,
		};

		return renderWithProviders(<ArticlePicker {...defaultProps} {...props} />);
	}

	describe("loading state", () => {
		it("should show loading state when isLoading is true", () => {
			renderPicker({ isLoading: true });
			expect(screen.getByTestId("article-picker-loading")).toBeDefined();
		});
	});

	describe("include all mode", () => {
		it("should show include all toggle", () => {
			renderPicker();
			expect(screen.getByTestId("include-all-toggle")).toBeDefined();
		});

		it("should not show search or bulk actions when include all is enabled", () => {
			renderPicker({ includeAll: true });
			expect(screen.queryByTestId("article-search-input")).toBeNull();
			expect(screen.queryByTestId("select-all-button")).toBeNull();
		});

		it("should call onIncludeAllChange when toggle is clicked", () => {
			renderPicker({ includeAll: true });
			const toggle = screen.getByTestId("include-all-toggle");
			fireEvent.click(toggle);
			expect(mockOnIncludeAllChange).toHaveBeenCalledWith(false);
			expect(mockOnSelectionChange).toHaveBeenCalled();
		});
	});

	describe("specific selection mode", () => {
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

		it("should render space groups", () => {
			renderPicker({ includeAll: false });
			expect(screen.getByTestId("space-groups")).toBeDefined();
			expect(screen.getByTestId("space-group-1")).toBeDefined();
			expect(screen.getByTestId("space-group-2")).toBeDefined();
		});
	});

	describe("space selection", () => {
		it("should call onSelectionChange when space checkbox is clicked", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(),
			});

			const checkbox = screen.getByTestId("space-checkbox-1");
			fireEvent.click(checkbox);

			expect(mockOnSelectionChange).toHaveBeenCalled();
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			// Space 1 has 2 articles
			expect(newSelection.has("jrn:article:getting-started")).toBe(true);
			expect(newSelection.has("jrn:article:api-reference")).toBe(true);
		});

		it("should deselect all articles in space when fully selected space is clicked", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started", "jrn:article:api-reference"]),
			});

			const checkbox = screen.getByTestId("space-checkbox-1");
			fireEvent.click(checkbox);

			expect(mockOnSelectionChange).toHaveBeenCalled();
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.has("jrn:article:getting-started")).toBe(false);
			expect(newSelection.has("jrn:article:api-reference")).toBe(false);
		});
	});

	describe("bulk actions", () => {
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

	describe("disabled state", () => {
		it("should disable include all toggle when disabled", () => {
			renderPicker({ disabled: true });
			const toggle = screen.getByTestId("include-all-toggle") as HTMLButtonElement;
			expect(toggle.disabled).toBe(true);
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

	describe("no spaces", () => {
		it("should show flat article list when no spaces provided", () => {
			renderPicker({ includeAll: false, spaces: [] });
			expect(screen.getByTestId("article-list")).toBeDefined();
			expect(screen.queryByTestId("space-groups")).toBeNull();
		});

		it("should not show flat article tree when includeAll is true and no spaces", () => {
			renderPicker({ includeAll: true, spaces: [] });
			expect(screen.queryByTestId("article-list")).toBeNull();
			expect(screen.queryByTestId("space-groups")).toBeNull();
		});
	});

	describe("handleIncludeAllToggle - previousSelection restoration", () => {
		it("should save current selection when switching TO include-all", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started"]),
			});

			// Click include-all toggle to switch TO include-all
			fireEvent.click(screen.getByTestId("include-all-toggle"));

			// Should call onIncludeAllChange(true) and clear the selection
			expect(mockOnIncludeAllChange).toHaveBeenCalledWith(true);
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.size).toBe(0);
		});

		it("should restore previous selection when switching FROM include-all with saved selection", () => {
			// Step 1: Render with a selection and switch TO include-all to save previousSelection
			const { rerender } = renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started"]),
			});

			// Click include-all to save selection and switch to include-all mode
			fireEvent.click(screen.getByTestId("include-all-toggle"));
			expect(mockOnIncludeAllChange).toHaveBeenCalledWith(true);
			vi.clearAllMocks();

			// Step 2: Re-render with includeAll=true (simulating the parent updating state)
			rerender(
				<ArticlePicker
					articles={mockArticles}
					selectedJrns={new Set<string>()}
					onSelectionChange={mockOnSelectionChange}
					includeAll={true}
					onIncludeAllChange={mockOnIncludeAllChange}
					spaces={mockSpaces}
				/>,
			);

			// Step 3: Click include-all toggle again to switch FROM include-all
			fireEvent.click(screen.getByTestId("include-all-toggle"));

			// Should restore the previously saved selection
			expect(mockOnIncludeAllChange).toHaveBeenCalledWith(false);
			const restoredSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(restoredSelection.has("jrn:article:getting-started")).toBe(true);
			expect(restoredSelection.size).toBe(1);
		});

		it("should select all articles when switching FROM include-all with no saved selection", () => {
			// Render directly in include-all mode (no previousSelection saved)
			renderPicker({
				includeAll: true,
				selectedJrns: new Set<string>(),
			});

			// Click toggle to switch FROM include-all with empty previousSelection
			fireEvent.click(screen.getByTestId("include-all-toggle"));

			expect(mockOnIncludeAllChange).toHaveBeenCalledWith(false);
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			// Should select all articles since no previous selection was saved
			expect(newSelection.size).toBe(mockArticles.length);
		});
	});

	describe("handleSpaceExpandClick - expand/collapse toggle", () => {
		it("should expand a collapsed space group when header is clicked", () => {
			renderPicker({ includeAll: false });

			// Initially collapsed - no article-tree inside the space group
			expect(screen.queryByTestId("article-tree")).toBeNull();

			// Click space header to expand
			fireEvent.click(screen.getByTestId("space-header-1"));

			// After expanding, ArticleTree should render inside the space group
			expect(screen.getByTestId("article-tree")).toBeDefined();
		});

		it("should collapse an expanded space group when header is clicked again", () => {
			renderPicker({ includeAll: false });

			// Click to expand
			fireEvent.click(screen.getByTestId("space-header-1"));
			expect(screen.getByTestId("article-tree")).toBeDefined();

			// Click again to collapse
			fireEvent.click(screen.getByTestId("space-header-1"));
			expect(screen.queryByTestId("article-tree")).toBeNull();
		});

		it("should not expand space when in includeAll mode", () => {
			renderPicker({ includeAll: true });

			// Click space header in include-all mode
			fireEvent.click(screen.getByTestId("space-header-1"));

			// Should NOT expand because includeAll disables clicking
			expect(screen.queryByTestId("article-tree")).toBeNull();
		});
	});

	describe("renderSpaceGroup checkboxState", () => {
		it("should show partial state when some but not all articles in a space are selected", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started"]),
			});

			// Space 1 has 2 articles, only 1 selected -> partial state shows minus icon
			const checkbox = screen.getByTestId("space-checkbox-1");
			const minusIcon = checkbox.querySelector("[data-testid='minus-icon']");
			expect(minusIcon).toBeDefined();
			expect(minusIcon).not.toBeNull();
		});

		it("should show checked state when all articles in a space are selected", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started", "jrn:article:api-reference"]),
			});

			// Space 1 has 2 articles, both selected -> checked state shows check icon
			const checkbox = screen.getByTestId("space-checkbox-1");
			const checkIcon = checkbox.querySelector("[data-testid='check-icon']");
			expect(checkIcon).toBeDefined();
			expect(checkIcon).not.toBeNull();
		});

		it("should show unchecked state when no articles in a space are selected", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set<string>(),
			});

			// Space 1 has 2 articles, none selected -> unchecked state
			const checkbox = screen.getByTestId("space-checkbox-1");
			const checkIcon = checkbox.querySelector("[data-testid='check-icon']");
			const minusIcon = checkbox.querySelector("[data-testid='minus-icon']");
			expect(checkIcon).toBeNull();
			expect(minusIcon).toBeNull();
		});

		it("should show checked state when includeAll is true regardless of selection", () => {
			renderPicker({
				includeAll: true,
				selectedJrns: new Set<string>(),
			});

			// In includeAll mode, checkboxState is always "checked"
			const checkbox = screen.getByTestId("space-checkbox-1");
			const checkIcon = checkbox.querySelector("[data-testid='check-icon']");
			expect(checkIcon).toBeDefined();
			expect(checkIcon).not.toBeNull();
		});
	});

	describe("changedJrns indicator", () => {
		it("should show amber dot on collapsed space header when it has changed articles", () => {
			renderPicker({
				includeAll: false,
				changedJrns: new Set(["jrn:article:getting-started"]),
			});

			// Space 1 is collapsed and has a changed article
			expect(screen.getByTestId("space-changed-indicator-1")).toBeDefined();
		});

		it("should not show amber dot when space is expanded even with changed articles", () => {
			renderPicker({
				includeAll: false,
				changedJrns: new Set(["jrn:article:getting-started"]),
			});

			// Expand space 1
			fireEvent.click(screen.getByTestId("space-header-1"));

			// Indicator should NOT appear when expanded
			expect(screen.queryByTestId("space-changed-indicator-1")).toBeNull();
		});

		it("should not show amber dot when no changed articles in space", () => {
			renderPicker({
				includeAll: false,
				changedJrns: new Set<string>(),
			});

			// No changed articles, no indicator
			expect(screen.queryByTestId("space-changed-indicator-1")).toBeNull();
			expect(screen.queryByTestId("space-changed-indicator-2")).toBeNull();
		});

		it("should not show amber dot when changedJrns is undefined", () => {
			renderPicker({
				includeAll: false,
				changedJrns: undefined,
			});

			expect(screen.queryByTestId("space-changed-indicator-1")).toBeNull();
			expect(screen.queryByTestId("space-changed-indicator-2")).toBeNull();
		});
	});

	describe("spaceGroups memo - article without matching space", () => {
		it("should group articles with unknown spaceId into the Other group", () => {
			const articleWithUnknownSpace = {
				...mockArticles[0],
				id: 99,
				jrn: "jrn:article:orphan",
				spaceId: 999,
			} as Doc;

			renderPicker({
				includeAll: false,
				articles: [...mockArticles, articleWithUnknownSpace],
			});

			// The article with spaceId 999 should fall into the "Other" group
			expect(screen.getByTestId("space-group-other")).toBeDefined();
		});
	});

	describe("empty space filtering", () => {
		it("should not render space group when space has no articles", () => {
			const emptySpace: Space = {
				id: 3,
				name: "Empty Space",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			} as Space;

			renderPicker({
				includeAll: false,
				spaces: [...mockSpaces, emptySpace],
			});

			// Space 3 has no articles so it should not appear
			expect(screen.queryByTestId("space-group-3")).toBeNull();
			// But spaces 1 and 2 should still be present
			expect(screen.getByTestId("space-group-1")).toBeDefined();
			expect(screen.getByTestId("space-group-2")).toBeDefined();
		});
	});

	describe("keyboard handler on space header", () => {
		it("should expand space when Enter key is pressed on space header", () => {
			renderPicker({ includeAll: false });

			// Press Enter on space header
			fireEvent.keyDown(screen.getByTestId("space-header-1"), { key: "Enter" });

			// Should expand and show ArticleTree
			expect(screen.getByTestId("article-tree")).toBeDefined();
		});

		it("should expand space when Space key is pressed on space header", () => {
			renderPicker({ includeAll: false });

			// Press Space on space header
			fireEvent.keyDown(screen.getByTestId("space-header-1"), { key: " " });

			// Should expand and show ArticleTree
			expect(screen.getByTestId("article-tree")).toBeDefined();
		});

		it("should not expand space when other keys are pressed on space header", () => {
			renderPicker({ includeAll: false });

			// Press Tab on space header
			fireEvent.keyDown(screen.getByTestId("space-header-1"), { key: "Tab" });

			// Should NOT expand
			expect(screen.queryByTestId("article-tree")).toBeNull();
		});

		it("should not expand space via keyboard when disabled", () => {
			renderPicker({ includeAll: false, disabled: true });

			// Press Enter on space header when disabled
			fireEvent.keyDown(screen.getByTestId("space-header-1"), { key: "Enter" });

			// Should NOT expand because disabled
			expect(screen.queryByTestId("article-tree")).toBeNull();
		});

		it("should not expand space via keyboard when in includeAll mode", () => {
			renderPicker({ includeAll: true });

			// Press Enter on space header when includeAll
			fireEvent.keyDown(screen.getByTestId("space-header-1"), { key: "Enter" });

			// Should NOT expand because includeAll disables the keyboard handler
			expect(screen.queryByTestId("article-tree")).toBeNull();
		});
	});

	describe("isExpanded && !includeAll rendering", () => {
		it("should show ArticleTree when expanded and not includeAll", () => {
			renderPicker({ includeAll: false });

			// Expand space 1
			fireEvent.click(screen.getByTestId("space-header-1"));

			// ArticleTree should be visible
			expect(screen.getByTestId("article-tree")).toBeDefined();
		});

		it("should not show ArticleTree when expanded then includeAll is enabled", () => {
			const { rerender } = renderPicker({ includeAll: false });

			// Expand space 1
			fireEvent.click(screen.getByTestId("space-header-1"));
			expect(screen.getByTestId("article-tree")).toBeDefined();

			// Now re-render with includeAll=true
			rerender(
				<ArticlePicker
					articles={mockArticles}
					selectedJrns={new Set<string>()}
					onSelectionChange={mockOnSelectionChange}
					includeAll={true}
					onIncludeAllChange={mockOnIncludeAllChange}
					spaces={mockSpaces}
				/>,
			);

			// ArticleTree should NOT show even though space was expanded
			expect(screen.queryByTestId("article-tree")).toBeNull();
		});
	});

	describe("space groups in includeAll mode", () => {
		it("should show total count without selected/total format when includeAll is true", () => {
			renderPicker({
				includeAll: true,
				selectedJrns: new Set<string>(),
			});

			// In includeAll mode, the count should just be the total (e.g., "2"), not "0/2"
			const spaceHeader1 = screen.getByTestId("space-header-1");
			// Space 1 has 2 articles. In includeAll mode it should NOT show "0/2"
			expect(spaceHeader1.textContent).not.toContain("/");
		});

		it("should show selected/total format when includeAll is false", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set(["jrn:article:getting-started"]),
			});

			// In specific mode, should show "1/2" format
			const spaceHeader1 = screen.getByTestId("space-header-1");
			expect(spaceHeader1.textContent).toContain("1/2");
		});
	});

	describe("handleSelectAll", () => {
		it("should call onIncludeAllChange(false) when select all is clicked", () => {
			renderPicker({
				includeAll: false,
				selectedJrns: new Set<string>(),
			});

			fireEvent.click(screen.getByTestId("select-all-button"));

			// Should call both callbacks
			expect(mockOnSelectionChange).toHaveBeenCalled();
			expect(mockOnIncludeAllChange).toHaveBeenCalledWith(false);
		});
	});

	describe("Other articles group", () => {
		it("should group articles with null spaceId under Other", () => {
			const articleWithNoSpace = {
				...mockArticles[0],
				id: 100,
				jrn: "jrn:article:no-space",
				spaceId: null,
				contentMetadata: { title: "No Space Article" },
			} as unknown as Doc;

			renderPicker({
				includeAll: false,
				articles: [...mockArticles, articleWithNoSpace],
			});

			// Should render an "Other" group
			expect(screen.getByTestId("space-group-other")).toBeDefined();
		});

		it("should not show Other group when all articles belong to a space", () => {
			renderPicker({
				includeAll: false,
			});

			// All mockArticles have a spaceId that matches, so no "Other" group
			expect(screen.queryByTestId("space-group-other")).toBeNull();
		});

		it("should group articles with undefined spaceId under Other", () => {
			const articleWithUndefinedSpace = {
				...mockArticles[0],
				id: 101,
				jrn: "jrn:article:undefined-space",
				spaceId: undefined,
				contentMetadata: { title: "Undefined Space Article" },
			} as unknown as Doc;

			renderPicker({
				includeAll: false,
				articles: [...mockArticles, articleWithUndefinedSpace],
			});

			// spaceId undefined is treated as null via ?? null, so goes to Other
			expect(screen.getByTestId("space-group-other")).toBeDefined();
		});

		it("should allow selecting all articles in the Other group via checkbox", () => {
			const articleWithNoSpace = {
				...mockArticles[0],
				id: 100,
				jrn: "jrn:article:no-space",
				spaceId: null,
				contentMetadata: { title: "No Space Article" },
			} as unknown as Doc;

			renderPicker({
				includeAll: false,
				articles: [...mockArticles, articleWithNoSpace],
				selectedJrns: new Set<string>(),
			});

			// Click the Other group checkbox
			fireEvent.click(screen.getByTestId("space-checkbox-other"));

			expect(mockOnSelectionChange).toHaveBeenCalled();
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.has("jrn:article:no-space")).toBe(true);
		});
	});

	describe("space checkbox in includeAll mode", () => {
		it("should disable space checkboxes when includeAll is true", () => {
			renderPicker({
				includeAll: true,
			});

			const checkbox = screen.getByTestId("space-checkbox-1") as HTMLButtonElement;
			expect(checkbox.disabled).toBe(true);
		});
	});
});
