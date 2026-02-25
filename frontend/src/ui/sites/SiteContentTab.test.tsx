import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SiteContentTab } from "./SiteContentTab";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { Client, SiteMetadata, SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock toast - use vi.hoisted to ensure mock functions are available when vi.mock runs
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
}));
vi.mock("../../components/ui/Sonner", () => ({
	toast: {
		success: mockToastSuccess,
		error: mockToastError,
	},
}));

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Info: () => <div data-testid="info-icon" />,
	};
});

// Mock ArticlePicker
vi.mock("./ArticlePicker", () => ({
	ArticlePicker: ({
		articles,
		selectedJrns,
		onSelectionChange,
		includeAll,
		onIncludeAllChange,
		disabled,
	}: {
		articles: Array<{ jrn: string }>;
		selectedJrns: Set<string>;
		onSelectionChange: (jrns: Set<string>) => void;
		includeAll: boolean;
		onIncludeAllChange: (includeAll: boolean) => void;
		disabled?: boolean;
	}) => (
		<div data-testid="article-picker">
			<span data-testid="article-count">{articles.length}</span>
			<span data-testid="selected-count">{selectedJrns.size}</span>
			<span data-testid="include-all">{includeAll.toString()}</span>
			<span data-testid="disabled">{disabled?.toString()}</span>
			<button type="button" data-testid="toggle-include-all" onClick={() => onIncludeAllChange(!includeAll)}>
				Toggle Include All
			</button>
			<button
				type="button"
				data-testid="select-article"
				onClick={() => {
					const newSet = new Set(selectedJrns);
					newSet.add("jrn:article:new");
					onSelectionChange(newSet);
				}}
			>
				Select Article
			</button>
			<button
				type="button"
				data-testid="replace-article"
				onClick={() => {
					const newSet = new Set(selectedJrns);
					const first = [...newSet][0];
					if (first) {
						newSet.delete(first);
					}
					newSet.add("jrn:article:replaced");
					onSelectionChange(newSet);
				}}
			>
				Replace Article
			</button>
		</div>
	),
}));

const mockDocsClient = {
	listDocs: vi.fn(),
};

const mockSitesClient = {
	updateSiteArticles: vi.fn(),
};

const mockSpacesClient = {
	listSpaces: vi.fn(),
};

const mockClient = {
	docs: () => mockDocsClient,
	sites: () => mockSitesClient,
	spaces: () => mockSpacesClient,
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("SiteContentTab", () => {
	const mockOnDocsiteUpdate = vi.fn();

	const mockArticles = [
		{ id: 1, jrn: "jrn:article:1", contentMetadata: { title: "Article 1" } },
		{ id: 2, jrn: "jrn:article:2", contentMetadata: { title: "Article 2" } },
		{ id: 3, jrn: "jrn:article:3", contentMetadata: { title: "Article 3" } },
	];

	const defaultMetadata = {
		githubRepo: "owner/repo",
		githubUrl: "https://github.com/owner/repo",
		framework: "nextra",
		articleCount: 5,
	};

	function createMockDocsite(
		overrides: Omit<Partial<SiteWithUpdate>, "metadata"> & { metadata?: Partial<SiteMetadata> } = {},
	): SiteWithUpdate {
		const { metadata: metadataOverrides, ...rest } = overrides;
		return {
			id: 1,
			name: "test-site",
			displayName: "Test Site",
			status: "active",
			visibility: "external",
			framework: "nextra",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-02T00:00:00Z",
			metadata: { ...defaultMetadata, ...metadataOverrides },
			...rest,
		} as SiteWithUpdate;
	}

	/**
	 * Waits for articles to load and the selection effect to fully settle.
	 * Checks both article-count (articles loaded) and selected-count (selection initialized).
	 */
	async function waitForArticlesReady(expectedSelectedCount: string) {
		await waitFor(() => {
			expect(screen.getByTestId("article-count").textContent).toBe("3");
			expect(screen.getByTestId("selected-count").textContent).toBe(expectedSelectedCount);
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockDocsClient.listDocs.mockResolvedValue(mockArticles);
		mockSpacesClient.listSpaces.mockResolvedValue([]);
		mockSitesClient.updateSiteArticles.mockResolvedValue({ id: 1, name: "test-site" });
	});

	function renderContentTab(
		docsite: SiteWithUpdate,
		props: Partial<React.ComponentProps<typeof SiteContentTab>> = {},
	) {
		return renderWithProviders(
			<SiteContentTab docsite={docsite} onDocsiteUpdate={mockOnDocsiteUpdate} {...props} />,
			{
				initialPath: createMockIntlayerValue("/sites/1"),
				client: mockClient as unknown as Client,
			},
		);
	}

	describe("articles view", () => {
		it("should show article picker by default", async () => {
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitFor(() => {
				expect(screen.getByTestId("article-picker")).toBeDefined();
			});
		});
	});

	describe("articles loading", () => {
		it("should show loading state initially", () => {
			mockDocsClient.listDocs.mockImplementation(
				() => new Promise(resolve => setTimeout(() => resolve(mockArticles), 100)),
			);
			mockSpacesClient.listSpaces.mockImplementation(
				() => new Promise(resolve => setTimeout(() => resolve([]), 100)),
			);
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			expect(screen.getByTestId("articles-loading")).toBeDefined();
		});

		it("should show article picker after loading", async () => {
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitFor(() => {
				expect(screen.getByTestId("article-picker")).toBeDefined();
			});

			expect(screen.getByTestId("article-count").textContent).toBe("3");
		});
	});

	describe("article selection state", () => {
		it("should initialize with all articles individually selected by default", async () => {
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitFor(() => {
				// Include-all toggle is OFF; all articles are selected individually
				expect(screen.getByTestId("include-all").textContent).toBe("false");
				expect(screen.getByTestId("selected-count").textContent).toBe("3");
			});
		});

		it("should initialize with selected JRNs from metadata", async () => {
			const docsite = createMockDocsite({
				metadata: {
					selectedArticleJrns: ["jrn:article:1", "jrn:article:2"],
				},
			});
			renderContentTab(docsite);

			await waitFor(() => {
				expect(screen.getByTestId("include-all").textContent).toBe("false");
				expect(screen.getByTestId("selected-count").textContent).toBe("2");
			});
		});
	});

	describe("article changes detection", () => {
		it("should show unsaved changes when include all changes", async () => {
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitForArticlesReady("3");

			// Toggle include all on (was off by default)
			fireEvent.click(screen.getByTestId("toggle-include-all"));

			await waitFor(() => {
				expect(screen.getByText("Unsaved changes")).toBeDefined();
			});
		});

		it("should show unsaved changes when selection changes", async () => {
			const docsite = createMockDocsite({
				metadata: {
					selectedArticleJrns: ["jrn:article:1"],
				},
			});
			renderContentTab(docsite);

			await waitForArticlesReady("1");

			// Add a new article to selection
			fireEvent.click(screen.getByTestId("select-article"));

			await waitFor(() => {
				expect(screen.getByText("Unsaved changes")).toBeDefined();
			});
		});
	});

	describe("save articles", () => {
		it("should save article selection when save button clicked", async () => {
			const docsite = createMockDocsite({
				metadata: {
					selectedArticleJrns: ["jrn:article:1"],
				},
			});
			renderContentTab(docsite);

			await waitForArticlesReady("1");

			// Add an article to trigger a change
			fireEvent.click(screen.getByTestId("select-article"));

			await waitFor(() => {
				expect(screen.getByTestId("save-articles-button")).toBeDefined();
			});

			// Click save
			fireEvent.click(screen.getByTestId("save-articles-button"));

			await waitFor(() => {
				expect(mockSitesClient.updateSiteArticles).toHaveBeenCalledWith(1, expect.any(Array));
			});
		});

		it("should show success message after save", async () => {
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitForArticlesReady("3");

			// Make a change
			fireEvent.click(screen.getByTestId("toggle-include-all"));

			// Click save
			fireEvent.click(screen.getByTestId("save-articles-button"));

			await waitFor(() => {
				expect(mockToastSuccess).toHaveBeenCalled();
			});
		});

		it("should call onDocsiteUpdate after successful save", async () => {
			const updatedDocsite = createMockDocsite({ id: 1, name: "updated-site" });
			mockSitesClient.updateSiteArticles.mockResolvedValue(updatedDocsite);

			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitForArticlesReady("3");

			// Make a change
			fireEvent.click(screen.getByTestId("toggle-include-all"));

			// Click save
			fireEvent.click(screen.getByTestId("save-articles-button"));

			await waitFor(() => {
				expect(mockOnDocsiteUpdate).toHaveBeenCalledWith(updatedDocsite);
			});
		});

		it("should show error message on save failure", async () => {
			mockSitesClient.updateSiteArticles.mockRejectedValue(new Error("Save failed"));

			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitForArticlesReady("3");

			// Make a change
			fireEvent.click(screen.getByTestId("toggle-include-all"));

			// Click save
			fireEvent.click(screen.getByTestId("save-articles-button"));

			await waitFor(() => {
				expect(mockToastError).toHaveBeenCalled();
			});
		});

		it("should disable save button when no changes", async () => {
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitForArticlesReady("3");

			const saveButton = screen.getByTestId("save-articles-button") as HTMLButtonElement;
			expect(saveButton.disabled).toBe(true);
		});

		it("should show rebuild note after save", async () => {
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitForArticlesReady("3");

			// Make a change
			fireEvent.click(screen.getByTestId("toggle-include-all"));

			// Rebuild note should appear when there are changes
			await waitFor(() => {
				expect(screen.getByTestId("articles-rebuild-note")).toBeDefined();
			});
		});
	});

	describe("include all toggle behavior", () => {
		it("should toggle include all on and back off with all articles still selected", async () => {
			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitForArticlesReady("3");

			// Toggle include-all ON
			fireEvent.click(screen.getByTestId("toggle-include-all"));
			await waitFor(() => {
				expect(screen.getByTestId("include-all").textContent).toBe("true");
			});

			// Toggle include-all back OFF — should still have all articles selected
			fireEvent.click(screen.getByTestId("toggle-include-all"));
			await waitFor(() => {
				expect(screen.getByTestId("include-all").textContent).toBe("false");
				expect(screen.getByTestId("selected-count").textContent).toBe("3");
			});
		});
	});

	describe("error handling", () => {
		it("should handle article loading error gracefully", async () => {
			mockDocsClient.listDocs.mockRejectedValue(new Error("Network error"));

			const docsite = createMockDocsite();
			renderContentTab(docsite);

			await waitFor(() => {
				expect(screen.queryByTestId("articles-loading")).toBeNull();
			});

			expect(screen.getByTestId("article-count").textContent).toBe("0");
		});
	});

	describe("article changes detection - specific JRN diff", () => {
		it("should detect changes when selected JRN set differs from original by content", async () => {
			const docsite = createMockDocsite({
				metadata: {
					selectedArticleJrns: ["jrn:article:1"],
				},
			});
			renderContentTab(docsite);

			await waitForArticlesReady("1");

			fireEvent.click(screen.getByTestId("select-article"));

			await waitFor(() => {
				expect(screen.getByText("Unsaved changes")).toBeDefined();
			});

			const saveButton = screen.getByTestId("save-articles-button") as HTMLButtonElement;
			expect(saveButton.disabled).toBe(false);
		});

		it("should detect changes when JRN set has same size but different content", async () => {
			const docsite = createMockDocsite({
				metadata: {
					selectedArticleJrns: ["jrn:article:1"],
				},
			});
			renderContentTab(docsite);

			await waitForArticlesReady("1");

			fireEvent.click(screen.getByTestId("replace-article"));

			await waitFor(() => {
				expect(screen.getByText("Unsaved changes")).toBeDefined();
			});

			const saveButton = screen.getByTestId("save-articles-button") as HTMLButtonElement;
			expect(saveButton.disabled).toBe(false);
		});
	});
});
