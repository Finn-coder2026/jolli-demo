import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import { RepositoryViewer } from "./RepositoryViewer";
import { act, fireEvent, screen, waitFor } from "@testing-library/preact";
import type { Site } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
	};
});

// Mock useMercureSubscription hook
vi.mock("../../hooks/useMercureSubscription", () => ({
	useMercureSubscription: vi.fn(() => {
		return { connected: true, reconnecting: false, usingMercure: false };
	}),
}));

// Mock toast for verifying error notifications
const mockToastError = vi.fn();
vi.mock("../../components/ui/Sonner", () => ({
	toast: {
		error: (message: string) => mockToastError(message),
		success: vi.fn(),
		info: vi.fn(),
		warning: vi.fn(),
	},
}));

/**
 * Helper function to get the content from a NumberEdit editor element.
 * NumberEdit uses contentEditable div, so we need to access innerText instead of value.
 */
function getEditorContent(testId: string): string {
	// NumberEdit applies the testId to the wrapper, and appends "-editor" for the actual editor div
	const editor = screen.getByTestId(`${testId}-editor`);
	return editor.innerText;
}

/**
 * Helper function to set the content in a NumberEdit editor element.
 * Simulates user input by setting innerText and firing input event.
 */
function setEditorContent(testId: string, content: string): void {
	// NumberEdit applies the testId to the wrapper, and appends "-editor" for the actual editor div
	const editor = screen.getByTestId(`${testId}-editor`);
	editor.innerText = content;
	fireEvent.input(editor);
}

// Create mock site client functions
const mockGetRepositoryTree = vi.fn();
const mockGetFileContent = vi.fn();
const mockUpdateRepositoryFile = vi.fn();
const mockFormatCode = vi.fn();
const mockCreateFolder = vi.fn();
const mockDeleteFolder = vi.fn();
const mockRenameFolder = vi.fn();
const mockMoveFile = vi.fn();
const mockListFolderContents = vi.fn();

const mockSiteClient = {
	listSites: vi.fn(),
	getSite: vi.fn(),
	createSite: vi.fn(),
	regenerateSite: vi.fn(),
	updateRepositoryFile: mockUpdateRepositoryFile,
	deleteSite: vi.fn(),
	updateSiteArticles: vi.fn(),
	cancelBuild: vi.fn(),
	getChangedConfigFiles: vi.fn().mockResolvedValue([]),
	formatCode: mockFormatCode,
	createFolder: mockCreateFolder,
	deleteFolder: mockDeleteFolder,
	renameFolder: mockRenameFolder,
	moveFile: mockMoveFile,
	listFolderContents: mockListFolderContents,
	checkSubdomainAvailability: vi.fn(),
	addCustomDomain: vi.fn(),
	removeCustomDomain: vi.fn(),
	getCustomDomainStatus: vi.fn(),
	verifyCustomDomain: vi.fn(),
	refreshDomainStatuses: vi.fn(),
	updateJwtAuthConfig: vi.fn(),
	updateBranding: vi.fn(),
	getRepositoryTree: mockGetRepositoryTree,
	getFileContent: mockGetFileContent,
	executeBatchOperations: vi.fn(),
	updateFolderStructure: vi.fn(),
	syncTree: vi.fn().mockResolvedValue({ success: true, commitSha: "mock-commit-sha" }),
	getSitesForArticle: vi.fn().mockResolvedValue([]),
};

const mockDocsite: Site = {
	id: 1,
	name: "test-site",
	displayName: "Test Site",
	userId: 1,
	visibility: "internal",
	status: "active",
	metadata: {
		githubRepo: "test-org/test-repo",
		githubUrl: "https://github.com/test-org/test-repo",
		framework: "docusaurus-2",
		articleCount: 5,
	},
	lastGeneratedAt: "2024-01-15T10:00:00Z",
	createdAt: "2024-01-15T08:00:00Z",
	updatedAt: "2024-01-15T10:00:00Z",
};

const mockGitHubTreeResponse = {
	tree: [
		{
			path: "content",
			mode: "040000",
			type: "tree",
			sha: "content1",
			url: "https://api.github.com/repos/test-org/test-repo/git/trees/content1",
		},
		{
			path: "content/_meta.ts",
			mode: "100644",
			type: "blob",
			sha: "meta1",
			size: 1234,
			url: "https://api.github.com/repos/test-org/test-repo/git/blobs/meta1",
		},
		{
			path: "content/intro.mdx",
			mode: "100644",
			type: "blob",
			sha: "intro1",
			size: 567,
			url: "https://api.github.com/repos/test-org/test-repo/git/blobs/intro1",
		},
		{
			path: "content/guide",
			mode: "040000",
			type: "tree",
			sha: "guide1",
			url: "https://api.github.com/repos/test-org/test-repo/git/trees/guide1",
		},
		{
			path: "content/guide/setup.mdx",
			mode: "100644",
			type: "blob",
			sha: "setup1",
			size: 890,
			url: "https://api.github.com/repos/test-org/test-repo/git/blobs/setup1",
		},
	],
};

const mockFileContentResponse = {
	name: "intro.mdx",
	path: "content/intro.mdx",
	sha: "intro1",
	type: "file",
	content: btoa("# Test Content\n\nThis is test content."),
	encoding: "base64",
};

describe("RepositoryViewer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset the toast mock before each test
		mockToastError.mockClear();
		// Set up default mocks - NO jobId by default (for immediate success/error tests)
		// Tests that need job-based behavior should set jobId explicitly
		mockGetRepositoryTree.mockResolvedValue(mockGitHubTreeResponse);
		// Return generic response for all files
		// Syntax errors only block navigation AWAY from the errored file, not initial clicks
		mockGetFileContent.mockResolvedValue(mockFileContentResponse);
		mockUpdateRepositoryFile.mockResolvedValue({});
		mockFormatCode.mockResolvedValue({ formatted: "" });
		mockCreateFolder.mockResolvedValue({ success: true, path: "" });
		mockDeleteFolder.mockResolvedValue({ success: true });
		mockRenameFolder.mockResolvedValue({ success: true, newPath: "" });
		mockMoveFile.mockResolvedValue({ success: true, newPath: "" });
		mockListFolderContents.mockResolvedValue({ files: [] });
	});

	const mockOnFileSave = vi.fn();

	const renderWithProvider = (
		docsite: Site,
		{ onFileSave = mockOnFileSave }: { onFileSave?: (() => void) | undefined } = {},
	) => {
		const mockClient = createMockClient();
		mockClient.sites = vi.fn(() => mockSiteClient);
		return renderWithProviders(<RepositoryViewer docsite={docsite} onFileSave={onFileSave} />, {
			client: mockClient,
		});
	};

	it("should not render if githubRepo is not defined", () => {
		const docsiteWithoutRepo = { ...mockDocsite, metadata: undefined };
		const { container } = renderWithProvider(docsiteWithoutRepo);
		expect(container.textContent).toBe("");
	});

	it("should render repository viewer with branch info", () => {
		renderWithProvider(mockDocsite);

		expect(screen.getByText("Branch:")).toBeDefined();
		expect(screen.getByText("main")).toBeDefined();
		expect(screen.getByText("Last synced:")).toBeDefined();
	});

	it("should load and display file tree on mount", async () => {
		renderWithProvider(mockDocsite);

		await waitFor(() => {
			expect(mockGetRepositoryTree).toHaveBeenCalledWith(1, "main");
		});

		await waitFor(() => {
			// content folder should be visible and auto-expanded
			expect(screen.getByText("content")).toBeDefined();
			// Files inside content should be visible since content is auto-expanded
			expect(screen.getByText("_meta.ts")).toBeDefined();
		});
	});

	it("should display loading state while fetching tree", async () => {
		mockGetRepositoryTree.mockImplementationOnce(
			() => new Promise(resolve => setTimeout(() => resolve(mockGitHubTreeResponse), 100)),
		);

		renderWithProvider(mockDocsite);

		expect(screen.getByText("Loading repository contents...")).toBeDefined();

		await waitFor(() => {
			expect(screen.getByText("content")).toBeDefined();
		});
	});

	it("should display error message when tree fetch fails", async () => {
		mockGetRepositoryTree.mockRejectedValueOnce(new Error("Not Found"));

		renderWithProvider(mockDocsite);

		await waitFor(() => {
			expect(screen.getByText("Failed to load repository contents")).toBeDefined();
		});
	});

	it("should display no files message when tree is empty", async () => {
		mockGetRepositoryTree.mockResolvedValueOnce({ sha: "", tree: [], truncated: false });

		renderWithProvider(mockDocsite);

		await waitFor(() => {
			expect(screen.getByText("No files found")).toBeDefined();
		});
	});

	it("should display select file message when no file is selected", async () => {
		renderWithProvider(mockDocsite);

		await waitFor(() => {
			expect(screen.getByText("Select a file to view its contents")).toBeDefined();
		});
	});

	it("should load and display file content when file is clicked", async () => {
		renderWithProvider(mockDocsite);

		// content folder is auto-expanded, so _meta.ts should be visible
		await waitFor(() => {
			expect(screen.getByText("_meta.ts")).toBeDefined();
		});

		const fileButton = screen.getByText("_meta.ts");
		fireEvent.click(fileButton);

		await waitFor(() => {
			expect(mockGetFileContent).toHaveBeenCalledWith(1, "content/_meta.ts", "main");
		});

		await waitFor(() => {
			// File content is now displayed in NumberEdit editor
			expect(getEditorContent("file-content-editor")).toContain("Test Content");
		});
	});

	it("should expand and collapse folders when clicked", async () => {
		renderWithProvider(mockDocsite);

		// content folder is auto-expanded
		await waitFor(() => {
			expect(screen.getByText("content")).toBeDefined();
		});

		// The guide subfolder should be visible but collapsed
		await waitFor(() => {
			expect(screen.getByText("guide")).toBeDefined();
		});

		// Initially, the nested file should not be visible (guide is collapsed)
		expect(screen.queryByText("setup.mdx")).toBeNull();

		// Click guide folder to expand
		const folderButton = screen.getByText("guide");
		fireEvent.click(folderButton);

		// Now the nested file should be visible
		await waitFor(() => {
			expect(screen.getByText("setup.mdx")).toBeDefined();
		});

		// Click folder again to collapse
		fireEvent.click(folderButton);

		// File should be hidden again
		await waitFor(() => {
			expect(screen.queryByText("setup.mdx")).toBeNull();
		});
	});

	it("should reload tree when Sync Now button is clicked", async () => {
		renderWithProvider(mockDocsite);

		await waitFor(() => {
			expect(mockGetRepositoryTree).toHaveBeenCalledTimes(1);
		});

		const syncButton = screen.getByText("Sync Now");
		fireEvent.click(syncButton);

		await waitFor(() => {
			expect(mockGetRepositoryTree).toHaveBeenCalledTimes(2);
		});
	});

	it("should preserve expanded folder states after Sync Now", async () => {
		renderWithProvider(mockDocsite);

		// Wait for initial tree load
		await waitFor(() => {
			expect(screen.getByText("guide")).toBeDefined();
		});

		// The guide folder starts collapsed, setup.mdx should not be visible
		expect(screen.queryByText("setup.mdx")).toBeNull();

		// Expand the guide folder
		const folderButton = screen.getByText("guide");
		fireEvent.click(folderButton);

		// setup.mdx should now be visible
		await waitFor(() => {
			expect(screen.getByText("setup.mdx")).toBeDefined();
		});

		// Click Sync Now to refetch the tree
		const syncButton = screen.getByText("Sync Now");
		fireEvent.click(syncButton);

		// Wait for refetch to complete
		await waitFor(() => {
			expect(mockGetRepositoryTree).toHaveBeenCalledTimes(2);
		});

		// The guide folder should still be expanded, setup.mdx should still be visible
		await waitFor(() => {
			expect(screen.getByText("setup.mdx")).toBeDefined();
		});
	});

	it("should handle file fetch errors gracefully", async () => {
		mockGetFileContent.mockRejectedValueOnce(new Error("Not Found"));

		renderWithProvider(mockDocsite);

		// content folder is auto-expanded, so _meta.ts should be visible
		await waitFor(() => {
			expect(screen.getByText("_meta.ts")).toBeDefined();
		});

		const fileButton = screen.getByText("_meta.ts");
		fireEvent.click(fileButton);

		await waitFor(() => {
			// Error message is now displayed in NumberEdit viewer
			expect(getEditorContent("file-content-editor")).toContain("Error loading file");
		});
	});

	it("should display file sizes when available", async () => {
		renderWithProvider(mockDocsite);

		await waitFor(() => {
			// content/_meta.ts size is 1234 bytes = 1.2 KB
			expect(screen.getByText("1.2 KB")).toBeDefined();
		});
	});

	it("should use lastGeneratedAt for sync time if available", async () => {
		renderWithProvider(mockDocsite);

		await waitFor(() => {
			// Should display formatted timestamp from lastGeneratedAt
			expect(screen.getByText(/2024/)).toBeDefined();
		});
	});

	it("should use createdAt for sync time if lastGeneratedAt is undefined", async () => {
		const docsiteWithoutLastGen = {
			...mockDocsite,
			lastGeneratedAt: undefined,
		};

		renderWithProvider(docsiteWithoutLastGen);

		await waitFor(() => {
			// Should display formatted timestamp from createdAt
			expect(screen.getByText(/2024/)).toBeDefined();
		});
	});

	it("should highlight selected file", async () => {
		renderWithProvider(mockDocsite);

		// content folder is auto-expanded, so _meta.ts should be visible
		await waitFor(() => {
			expect(screen.getByText("_meta.ts")).toBeDefined();
		});

		const fileButton = screen.getByText("_meta.ts");
		fireEvent.click(fileButton);

		await waitFor(() => {
			const button = fileButton.closest("button");
			expect(button?.className).toContain("bg-accent");
		});
	});

	it("should handle deeply nested folder structures", async () => {
		const deeplyNestedTree = {
			sha: "abc123",
			truncated: false,
			tree: [
				{
					path: "content",
					mode: "040000",
					type: "tree",
					sha: "sha1",
					url: "url1",
				},
				{
					path: "content/guides",
					mode: "040000",
					type: "tree",
					sha: "sha2",
					url: "url2",
				},
				{
					path: "content/guides/advanced",
					mode: "040000",
					type: "tree",
					sha: "sha3",
					url: "url3",
				},
				{
					path: "content/guides/advanced/deep-topic.mdx",
					mode: "100644",
					type: "blob",
					sha: "sha4",
					size: 100,
					url: "url4",
				},
			],
		};

		mockGetRepositoryTree.mockResolvedValueOnce(deeplyNestedTree);

		renderWithProvider(mockDocsite);

		// content is auto-expanded, so guides should be visible
		await waitFor(() => {
			expect(screen.getByText("guides")).toBeDefined();
		});

		// Expand guides level
		fireEvent.click(screen.getByText("guides"));
		await waitFor(() => {
			expect(screen.getByText("advanced")).toBeDefined();
		});

		// Expand advanced level
		fireEvent.click(screen.getByText("advanced"));
		await waitFor(() => {
			expect(screen.getByText("deep-topic.mdx")).toBeDefined();
		});
	});

	describe("file editability", () => {
		const editableFilesTree = {
			sha: "abc123",
			truncated: false,
			tree: [
				// Root config files - should be editable
				{ path: "next.config.js", mode: "100644", type: "blob", sha: "s1", size: 100, url: "u1" },
				{ path: "next.config.mjs", mode: "100644", type: "blob", sha: "s2", size: 100, url: "u2" },
				{ path: "theme.config.jsx", mode: "100644", type: "blob", sha: "s3", size: 100, url: "u3" },
				{ path: "mdx-components.tsx", mode: "100644", type: "blob", sha: "s4", size: 100, url: "u4" },
				// Nextra 4.x app/layout.tsx - should be editable
				{ path: "app", mode: "040000", type: "tree", sha: "s4a", url: "u4a" },
				{ path: "app/layout.tsx", mode: "100644", type: "blob", sha: "s4b", size: 100, url: "u4b" },
				// Pages config files (legacy Nextra 3.x) - should be editable
				{ path: "pages", mode: "040000", type: "tree", sha: "s5", url: "u5" },
				{ path: "pages/_meta.js", mode: "100644", type: "blob", sha: "s6", size: 100, url: "u6" },
				{ path: "pages/_meta.global.js", mode: "100644", type: "blob", sha: "s7", size: 100, url: "u7" },
				{ path: "pages/_app.jsx", mode: "100644", type: "blob", sha: "s8", size: 100, url: "u8" },
				{ path: "pages/_document.tsx", mode: "100644", type: "blob", sha: "s9", size: 100, url: "u9" },
				// Nextra 4.x content/_meta.ts - should be editable
				{ path: "content", mode: "040000", type: "tree", sha: "s9a", url: "u9a" },
				{ path: "content/_meta.ts", mode: "100644", type: "blob", sha: "s9b", size: 100, url: "u9b" },
				// Nested _meta files - should be editable
				{ path: "pages/docs", mode: "040000", type: "tree", sha: "s10", url: "u10" },
				{ path: "pages/docs/_meta.json", mode: "100644", type: "blob", sha: "s11", size: 100, url: "u11" },
				// Nextra 4.x nested content/_meta.ts - should be editable
				{ path: "content/api-reference", mode: "040000", type: "tree", sha: "s11a", url: "u11a" },
				{
					path: "content/api-reference/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "s11b",
					size: 100,
					url: "u11b",
				},
				// Content files - should NOT be editable
				{ path: "pages/index.mdx", mode: "100644", type: "blob", sha: "s12", size: 100, url: "u12" },
				{ path: "pages/getting-started.md", mode: "100644", type: "blob", sha: "s13", size: 100, url: "u13" },
				{ path: "content/index.mdx", mode: "100644", type: "blob", sha: "s13a", size: 100, url: "u13a" },
				// Public folder - should be shown (for static assets)
				{ path: "public", mode: "040000", type: "tree", sha: "s15", url: "u15" },
				{ path: "public/favicon.ico", mode: "100644", type: "blob", sha: "s16", size: 100, url: "u16" },
				// Other files - should NOT be shown (filtered out)
				{ path: "package.json", mode: "100644", type: "blob", sha: "s14", size: 100, url: "u14" },
			],
		};

		it("should show edit button for editable config files", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFilesTree);

			renderWithProvider(mockDocsite);

			await waitFor(() => {
				expect(screen.getByText("theme.config.jsx")).toBeDefined();
			});

			// Click on an editable config file
			fireEvent.click(screen.getByText("theme.config.jsx"));

			await waitFor(() => {
				// Editable files open directly in the editable editor
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});
		});

		it("should show read-only indicator for MDX content files", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFilesTree);

			renderWithProvider(mockDocsite);

			// Expand pages folder first
			await waitFor(() => {
				expect(screen.getByText("pages")).toBeDefined();
			});
			fireEvent.click(screen.getByText("pages"));

			// Wait for pages content to load
			await waitFor(() => {
				expect(screen.getByText("getting-started.md")).toBeDefined();
			});

			// Click on MD file (unique in pages folder)
			fireEvent.click(screen.getByText("getting-started.md"));

			await waitFor(() => {
				expect(screen.getByText("Read only - managed by Jolli")).toBeDefined();
			});
		});

		it("should filter out irrelevant files like package.json but show public folder", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFilesTree);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("content")).toBeDefined();
			});

			// package.json should not be visible (filtered out)
			expect(screen.queryByText("package.json")).toBeNull();
			// public folder should be visible (for static assets like images, fonts, CSS)
			expect(screen.getByText("public")).toBeDefined();
		});

		it("should show edit button for nested _meta.json files", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFilesTree);

			renderWithProvider(mockDocsite);

			// Expand pages folder
			await waitFor(() => {
				expect(screen.getByText("pages")).toBeDefined();
			});
			fireEvent.click(screen.getByText("pages"));

			// Expand docs folder
			await waitFor(() => {
				expect(screen.getByText("docs")).toBeDefined();
			});
			fireEvent.click(screen.getByText("docs"));

			await waitFor(() => {
				expect(screen.getByText("_meta.json")).toBeDefined();
			});

			// Click on _meta.json
			fireEvent.click(screen.getByText("_meta.json"));

			await waitFor(() => {
				// Editable files open directly in the editable editor
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});
		});

		it("should show edit button for _meta.global.js files", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFilesTree);

			renderWithProvider(mockDocsite);

			// Expand pages folder
			await waitFor(() => {
				expect(screen.getByText("pages")).toBeDefined();
			});
			fireEvent.click(screen.getByText("pages"));

			await waitFor(() => {
				expect(screen.getByText("_meta.global.js")).toBeDefined();
			});

			// Click on _meta.global.js
			fireEvent.click(screen.getByText("_meta.global.js"));

			await waitFor(() => {
				// Editable files open directly in the editable editor
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});
		});

		it("should show edit button for Nextra 4.x app/layout.tsx", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFilesTree);

			renderWithProvider(mockDocsite);

			// Expand app folder
			await waitFor(() => {
				expect(screen.getByText("app")).toBeDefined();
			});
			fireEvent.click(screen.getByText("app"));

			await waitFor(() => {
				expect(screen.getByText("layout.tsx")).toBeDefined();
			});

			// Click on layout.tsx
			fireEvent.click(screen.getByText("layout.tsx"));

			await waitFor(() => {
				// Editable files open directly in the editable editor
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});
		});

		it("should show edit button for Nextra 4.x content/_meta.ts", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFilesTree);

			renderWithProvider(mockDocsite);

			// content folder is auto-expanded, so _meta.ts should be visible
			await waitFor(() => {
				expect(screen.getByText("_meta.ts")).toBeDefined();
			});

			// Click on _meta.ts
			fireEvent.click(screen.getByText("_meta.ts"));

			await waitFor(() => {
				// Editable files open directly in the editable editor
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});
		});

		it("should show read-only indicator for Nextra 4.x content/index.mdx", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFilesTree);

			renderWithProvider(mockDocsite);

			// content folder is auto-expanded, so we can find elements inside
			// Use getAllByText since there are multiple index.mdx files (content and pages)
			await waitFor(() => {
				expect(screen.getAllByText("index.mdx").length).toBeGreaterThan(0);
			});

			// Click on the first index.mdx (should be in content folder)
			const indexFiles = screen.getAllByText("index.mdx");
			fireEvent.click(indexFiles[0]);

			await waitFor(() => {
				expect(screen.getByText("Read only - managed by Jolli")).toBeDefined();
			});
		});
	});

	describe("_meta.ts validation (client-side)", () => {
		// Tree with content folder, _meta.ts, and some mdx files for consistency checking
		const metaFilesTree = {
			sha: "abc123",
			truncated: false,
			tree: [
				{ path: "content", mode: "040000", type: "tree", sha: "s1", url: "u1" },
				{ path: "content/_meta.ts", mode: "100644", type: "blob", sha: "s2", size: 100, url: "u2" },
				{ path: "content/intro.mdx", mode: "100644", type: "blob", sha: "s3", size: 200, url: "u3" },
				{ path: "content/guide.mdx", mode: "100644", type: "blob", sha: "s4", size: 200, url: "u4" },
			],
		};

		const validMetaContent = btoa('export default { intro: "Introduction", guide: "Guide" }');

		const validMetaFileContentResponse = {
			name: "_meta.ts",
			path: "content/_meta.ts",
			sha: "s2",
			type: "file",
			content: validMetaContent,
			encoding: "base64",
		};

		/** Helper to get the file tree button for a specific file */
		function getFileTreeButton(filename: string): HTMLElement {
			const buttons = screen.getAllByRole("button");
			const fileButton = buttons.find(btn => {
				const span = btn.querySelector("span.truncate");
				return span?.textContent === filename;
			});
			if (!fileButton) {
				throw new Error(`File button for "${filename}" not found`);
			}
			return fileButton;
		}

		/** Helper to open _meta.ts in edit mode */
		async function openMetaTsInEditMode() {
			// content folder is auto-expanded, so _meta.ts should be visible
			await waitFor(() => {
				expect(getFileTreeButton("_meta.ts")).toBeDefined();
			});
			fireEvent.click(getFileTreeButton("_meta.ts"));

			// Wait for file to load (editable files open directly in edit mode)
			await waitFor(() => {
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});
		}

		it("should show validation error banner when _meta.ts has syntax errors", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(metaFilesTree);
			mockGetFileContent.mockResolvedValueOnce(validMetaFileContentResponse);

			renderWithProvider(mockDocsite);

			// content folder is auto-expanded, so _meta.ts should be visible
			await waitFor(() => {
				expect(getFileTreeButton("_meta.ts")).toBeDefined();
			});
			fireEvent.click(getFileTreeButton("_meta.ts"));

			// Wait for file to load (editable files open directly in edit mode)
			await waitFor(() => {
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});

			// Modify content (introduce syntax error - missing closing brace)
			setEditorContent("file-content-editor", 'export default { intro: "Introduction"');

			// Click Save - client-side validation will catch the syntax error
			fireEvent.click(screen.getByText("Save"));

			// Should show validation error banner (client-side validation)
			await waitFor(() => {
				expect(screen.getByTestId("validation-error-banner")).toBeDefined();
				expect(screen.getByText(/Issues/)).toBeDefined();
			});
		});

		describe("debounced validation (client-side)", () => {
			beforeEach(() => {
				vi.useFakeTimers();
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			it("should validate _meta.ts content after 500ms debounce while typing", async () => {
				mockGetRepositoryTree.mockResolvedValueOnce(metaFilesTree);
				mockGetFileContent.mockResolvedValueOnce(validMetaFileContentResponse);

				renderWithProvider(mockDocsite);

				await openMetaTsInEditMode();

				// Type invalid content (missing closing brace - will trigger client-side syntax error)
				setEditorContent("file-content-editor", 'export default { intro: "Test"');

				// Error banner should not appear immediately (debounced)
				expect(screen.queryByTestId("validation-error-banner")).toBeNull();

				// Advance timer by 500ms (debounce time)
				await act(() => {
					vi.advanceTimersByTime(500);
				});

				// Error banner should appear after debounce (client-side validation)
				await waitFor(() => {
					expect(screen.getByTestId("validation-error-banner")).toBeDefined();
				});
			});

			it("should clear previous validation errors when new content is valid", async () => {
				mockGetRepositoryTree.mockResolvedValueOnce(metaFilesTree);
				mockGetFileContent.mockResolvedValueOnce(validMetaFileContentResponse);

				renderWithProvider(mockDocsite);

				await openMetaTsInEditMode();

				// Type invalid content (will trigger client-side syntax error)
				setEditorContent("file-content-editor", "not valid javascript at all");

				// Advance timer to trigger validation
				await act(() => {
					vi.advanceTimersByTime(500);
				});

				// Error should appear
				await waitFor(() => {
					expect(screen.getByTestId("validation-error-banner")).toBeDefined();
				});

				// Type valid content
				setEditorContent("file-content-editor", 'export default { intro: "Introduction", guide: "Guide" }');

				// Advance timer to trigger validation
				await act(() => {
					vi.advanceTimersByTime(500);
				});

				// Error should be cleared (syntax is now valid)
				await waitFor(() => {
					expect(screen.queryByTestId("validation-error-banner")).toBeNull();
				});
			});

			it("should show orphaned entry errors for entries without matching files", async () => {
				mockGetRepositoryTree.mockResolvedValueOnce(metaFilesTree);
				mockGetFileContent.mockResolvedValueOnce(validMetaFileContentResponse);

				renderWithProvider(mockDocsite);

				await openMetaTsInEditMode();

				// Type content with an entry that doesn't have a matching file
				setEditorContent(
					"file-content-editor",
					'export default { intro: "Introduction", orphanedPage: "This page does not exist" }',
				);

				// Advance timer to trigger validation
				await act(() => {
					vi.advanceTimersByTime(500);
				});

				// Should show error banner for orphaned entry
				await waitFor(() => {
					expect(screen.getByTestId("validation-error-banner")).toBeDefined();
					expect(screen.getByText(/orphanedPage/)).toBeDefined();
					expect(screen.getByText(/error/i)).toBeDefined();
				});
			});
		});

		describe("error navigation", () => {
			it("should navigate to error line when clicking on error item", async () => {
				mockGetRepositoryTree.mockResolvedValueOnce(metaFilesTree);
				mockGetFileContent.mockResolvedValueOnce(validMetaFileContentResponse);

				renderWithProvider(mockDocsite);

				// content folder is auto-expanded, so _meta.ts should be visible
				await waitFor(() => {
					expect(getFileTreeButton("_meta.ts")).toBeDefined();
				});
				fireEvent.click(getFileTreeButton("_meta.ts"));

				await waitFor(() => {
					expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
				});

				// Edit and try to save (client-side validation will catch the syntax error)
				setEditorContent("file-content-editor", "not valid javascript code");
				fireEvent.click(screen.getByText("Save"));

				// Wait for error banner (client-side validation)
				await waitFor(() => {
					expect(screen.getByTestId("validation-error-banner")).toBeDefined();
				});

				// Click on the error item
				const errorItem = screen.getByTestId("validation-error-item-0");
				expect(errorItem).toBeDefined();

				// Click the error item (this should scroll to line and select it)
				fireEvent.click(errorItem);

				// The editor should still be visible (click doesn't close it)
				expect(screen.getByTestId("file-content-editor")).toBeDefined();
			});

			it("should show line decorations in editor for validation errors", async () => {
				mockGetRepositoryTree.mockResolvedValueOnce(metaFilesTree);
				mockGetFileContent.mockResolvedValueOnce(validMetaFileContentResponse);

				renderWithProvider(mockDocsite);

				// content folder is auto-expanded, so _meta.ts should be visible
				await waitFor(() => {
					expect(getFileTreeButton("_meta.ts")).toBeDefined();
				});
				fireEvent.click(getFileTreeButton("_meta.ts"));

				await waitFor(() => {
					expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
				});

				// Edit and try to save (client-side validation will catch the missing brace)
				setEditorContent("file-content-editor", "export default {\n  test: 'value'\n");
				fireEvent.click(screen.getByText("Save"));

				// Wait for error banner (client-side validation)
				await waitFor(() => {
					expect(screen.getByTestId("validation-error-banner")).toBeDefined();
				});

				// Check that at least one line decoration is applied (has error styling)
				const gutter = screen.getByTestId("file-content-editor-gutter");
				const errorLines = gutter.querySelectorAll(".errorLine");
				// Should have at least one error line decoration
				expect(errorLines.length).toBeGreaterThan(0);
			});
		});

		describe("missing entry click to add", () => {
			beforeEach(() => {
				vi.useFakeTimers();
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			// Tree with content folder, _meta.ts, and mdx files - one not in _meta.ts
			const treeWithExtraFile = {
				sha: "abc123",
				truncated: false,
				tree: [
					{ path: "content", mode: "040000", type: "tree", sha: "s1", url: "u1" },
					{ path: "content/_meta.ts", mode: "100644", type: "blob", sha: "s2", size: 100, url: "u2" },
					{ path: "content/intro.mdx", mode: "100644", type: "blob", sha: "s3", size: 200, url: "u3" },
					{ path: "content/guide.mdx", mode: "100644", type: "blob", sha: "s4", size: 200, url: "u4" },
					{ path: "content/newpage.mdx", mode: "100644", type: "blob", sha: "s5", size: 200, url: "u5" },
				],
			};

			// _meta.ts content that only has intro and guide (missing newpage)
			const metaContentMissingEntry = btoa('export default { intro: "Introduction", guide: "Guide" }');

			it("should add missing entry to content when double-clicking on missing entry warning", async () => {
				mockGetRepositoryTree.mockResolvedValueOnce(treeWithExtraFile);
				mockGetFileContent.mockResolvedValueOnce({
					name: "_meta.ts",
					path: "content/_meta.ts",
					sha: "s2",
					type: "file",
					content: metaContentMissingEntry,
					encoding: "base64",
				});

				renderWithProvider(mockDocsite);

				// content folder is auto-expanded, so _meta.ts should be visible
				await vi.waitFor(() => {
					expect(getFileTreeButton("_meta.ts")).toBeDefined();
				});
				fireEvent.click(getFileTreeButton("_meta.ts"));

				// Wait for file to load (editable files open directly in edit mode)
				await vi.waitFor(() => {
					expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
				});

				// Type content to trigger validation (with missing entry)
				setEditorContent("file-content-editor", 'export default { intro: "Introduction", guide: "Guide" }');

				// Advance timer to trigger debounced validation
				await act(() => {
					vi.advanceTimersByTime(500);
				});

				// Wait for validation banner to show missing entry warning
				await vi.waitFor(() => {
					const banner = screen.getByTestId("validation-error-banner");
					expect(banner).toBeDefined();
					// Check that the warning is about newpage.mdx missing from navigation
					expect(banner.textContent).toContain("newpage");
				});

				// Double-click on the first validation error item (which should be the missing entry warning)
				const missingEntryItem = screen.getByTestId("validation-error-item-0");
				fireEvent.dblClick(missingEntryItem);

				// Advance timer to trigger re-validation
				await act(() => {
					vi.advanceTimersByTime(200);
				});

				// The editor content should now include the newpage entry with single-quoted key
				await vi.waitFor(() => {
					const editorContent = getEditorContent("file-content-editor");
					expect(editorContent).toContain("'newpage'"); // Key should be single-quoted
					expect(editorContent).toContain("Newpage"); // Title should be capitalized
				});
			});
		});
	});

	describe("format code functionality", () => {
		const editableFileTree = {
			sha: "abc123",
			truncated: false,
			tree: [
				{
					path: "content",
					mode: "040000",
					type: "tree",
					sha: "folder1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/folder1",
				},
				{
					path: "content/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "meta1",
					size: 100,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/meta1",
				},
			],
		};

		const metaFileContentResponse = {
			name: "_meta.ts",
			path: "content/_meta.ts",
			sha: "meta1",
			type: "file",
			content: btoa('export default {\n  "getting-started": "Getting Started",\n};'),
			encoding: "base64",
		};

		it("should show Format button when editing a TypeScript file", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFileTree);
			mockGetFileContent.mockResolvedValueOnce(metaFileContentResponse);

			renderWithProvider(mockDocsite);

			// content folder is auto-expanded, so _meta.ts should be visible
			await waitFor(() => {
				expect(screen.getByText("_meta.ts")).toBeDefined();
			});
			fireEvent.click(screen.getByText("_meta.ts"));

			// Wait for file to load (editable files open directly in edit mode)
			await waitFor(() => {
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});

			// Format button should be visible in edit mode
			await waitFor(() => {
				expect(screen.getByText("Format")).toBeDefined();
			});
		});

		it("should call formatCode API when Format button is clicked", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(editableFileTree);
			mockGetFileContent.mockResolvedValueOnce(metaFileContentResponse);
			mockFormatCode.mockResolvedValueOnce({
				formatted: 'export default {\n\t"getting-started": "Getting Started",\n};\n',
			});

			renderWithProvider(mockDocsite);

			// content folder is auto-expanded, so _meta.ts should be visible
			await waitFor(() => {
				expect(screen.getByText("_meta.ts")).toBeDefined();
			});
			fireEvent.click(screen.getByText("_meta.ts"));

			// Wait for file to load (editable files open directly in edit mode)
			await waitFor(() => {
				expect(screen.getByTestId("file-content-editor-editor")).toBeDefined();
			});

			// Click Format button
			await waitFor(() => {
				expect(screen.getByText("Format")).toBeDefined();
			});
			fireEvent.click(screen.getByText("Format"));

			// Verify the format API was called
			await waitFor(() => {
				expect(mockFormatCode).toHaveBeenCalled();
			});
		});
	});

	describe("file context menu", () => {
		const fileTreeWithSubfolders = {
			sha: "abc123",
			truncated: false,
			tree: [
				{
					path: "content",
					mode: "040000",
					type: "tree",
					sha: "content1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/content1",
				},
				{
					path: "content/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "meta1",
					size: 100,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/meta1",
				},
				{
					path: "content/intro.mdx",
					mode: "100644",
					type: "blob",
					sha: "intro1",
					size: 200,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/intro1",
				},
				{
					path: "content/guide",
					mode: "040000",
					type: "tree",
					sha: "guide1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/guide1",
				},
				{
					path: "content/guide/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "guidemeta1",
					size: 50,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/guidemeta1",
				},
				{
					path: "content/guide/setup.mdx",
					mode: "100644",
					type: "blob",
					sha: "setup1",
					size: 300,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/setup1",
				},
			],
		};

		it("should show file context menu on right-click on MDX file", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithSubfolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content is auto-expanded
			await waitFor(() => {
				expect(screen.getByText("intro.mdx")).toBeDefined();
			});

			// Right-click on the MDX file
			const mdxFile = screen.getByTestId("file-intro.mdx");
			fireEvent.contextMenu(mdxFile);

			// Context menu should appear
			await waitFor(() => {
				expect(screen.getByTestId("file-context-menu")).toBeDefined();
			});

			// Move to... option should be visible
			expect(screen.getByTestId("context-menu-move-file")).toBeDefined();
		});

		it("should not show file context menu on right-click on non-MDX file", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithSubfolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content is auto-expanded
			await waitFor(() => {
				expect(screen.getByText("_meta.ts")).toBeDefined();
			});

			// Right-click on _meta.ts (not movable)
			const metaFile = screen.getByTestId("file-_meta.ts");
			fireEvent.contextMenu(metaFile);

			// No file context menu should appear
			expect(screen.queryByTestId("file-context-menu")).toBeNull();
		});

		it("should close file context menu when clicking outside", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithSubfolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("intro.mdx")).toBeDefined();
			});

			// Right-click on the MDX file
			const mdxFile = screen.getByTestId("file-intro.mdx");
			fireEvent.contextMenu(mdxFile);

			// Context menu should appear
			await waitFor(() => {
				expect(screen.getByTestId("file-context-menu")).toBeDefined();
			});

			// Click outside (on the backdrop)
			fireEvent.click(screen.getByTestId("file-context-menu-backdrop"));

			// Context menu should be gone
			await waitFor(() => {
				expect(screen.queryByTestId("file-context-menu")).toBeNull();
			});
		});

		it("should open move file dialog when clicking Move to...", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithSubfolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("intro.mdx")).toBeDefined();
			});

			// Right-click on the MDX file
			const mdxFile = screen.getByTestId("file-intro.mdx");
			fireEvent.contextMenu(mdxFile);

			// Click Move to...
			await waitFor(() => {
				expect(screen.getByTestId("context-menu-move-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-move-file"));

			// Move file dialog should appear
			await waitFor(() => {
				expect(screen.getByTestId("move-file-dialog")).toBeDefined();
			});

			// Should show current location
			expect(screen.getByText(/content\/intro.mdx/)).toBeDefined();

			// Should have destination selector
			expect(screen.getByTestId("move-destination-select")).toBeDefined();
		});

		it("should show all content folders in destination dropdown", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithSubfolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("intro.mdx")).toBeDefined();
			});

			// Right-click on the MDX file and open move dialog
			fireEvent.contextMenu(screen.getByTestId("file-intro.mdx"));
			await waitFor(() => {
				expect(screen.getByTestId("context-menu-move-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-move-file"));

			// Check destination dropdown options
			await waitFor(() => {
				const select = screen.getByTestId("move-destination-select");
				expect(select).toBeDefined();
			});

			const select = screen.getByTestId("move-destination-select") as HTMLSelectElement;
			const options = Array.from(select.options).map(opt => opt.value);

			// Should include content and content/guide folders
			expect(options).toContain("content");
			expect(options).toContain("content/guide");
		});

		it("should update working tree when Move button is clicked", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithSubfolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("intro.mdx")).toBeDefined();
			});

			// Right-click on the MDX file and open move dialog
			fireEvent.contextMenu(screen.getByTestId("file-intro.mdx"));
			await waitFor(() => {
				expect(screen.getByTestId("context-menu-move-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-move-file"));

			// Wait for dialog
			await waitFor(() => {
				expect(screen.getByTestId("move-file-dialog")).toBeDefined();
			});

			// Select a different destination folder
			const select = screen.getByTestId("move-destination-select") as HTMLSelectElement;
			fireEvent.change(select, { target: { value: "content/guide" } });

			// Click Move button - updates working tree only (no API call)
			const moveButton = screen.getByTestId("move-file-button");
			fireEvent.click(moveButton);

			// Dialog should close
			await waitFor(() => {
				expect(screen.queryByTestId("move-file-dialog")).toBeNull();
			});

			// Backend API should NOT be called (changes saved in batch later)
			expect(mockMoveFile).not.toHaveBeenCalled();
		});

		it("should disable Move button when destination is the same as current location", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithSubfolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("intro.mdx")).toBeDefined();
			});

			// Right-click on the MDX file and open move dialog
			fireEvent.contextMenu(screen.getByTestId("file-intro.mdx"));
			await waitFor(() => {
				expect(screen.getByTestId("context-menu-move-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-move-file"));

			// Wait for dialog - by default the destination should be the current folder
			await waitFor(() => {
				expect(screen.getByTestId("move-file-dialog")).toBeDefined();
			});

			// Move button should be disabled when destination is same as current
			const moveButton = screen.getByTestId("move-file-button");
			expect(moveButton.hasAttribute("disabled")).toBe(true);
		});

		it("should close move dialog when Cancel is clicked", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithSubfolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("intro.mdx")).toBeDefined();
			});

			// Right-click on the MDX file and open move dialog
			fireEvent.contextMenu(screen.getByTestId("file-intro.mdx"));
			await waitFor(() => {
				expect(screen.getByTestId("context-menu-move-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-move-file"));

			// Wait for dialog
			await waitFor(() => {
				expect(screen.getByTestId("move-file-dialog")).toBeDefined();
			});

			// Click Cancel
			fireEvent.click(screen.getByText("Cancel"));

			// Dialog should be gone
			await waitFor(() => {
				expect(screen.queryByTestId("move-file-dialog")).toBeNull();
			});
		});
	});

	describe("folder context menu", () => {
		const fileTreeWithAppAndContent = {
			sha: "abc123",
			truncated: false,
			tree: [
				{
					path: "app",
					mode: "040000",
					type: "tree",
					sha: "app1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/app1",
				},
				{
					path: "app/page.tsx",
					mode: "100644",
					type: "blob",
					sha: "page1",
					size: 100,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/page1",
				},
				{
					path: "content",
					mode: "040000",
					type: "tree",
					sha: "content1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/content1",
				},
				{
					path: "content/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "meta1",
					size: 100,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/meta1",
				},
				{
					path: "content/guide",
					mode: "040000",
					type: "tree",
					sha: "guide1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/guide1",
				},
				{
					path: "content/guide/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "guidemeta1",
					size: 50,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/guidemeta1",
				},
				{
					path: "pages",
					mode: "040000",
					type: "tree",
					sha: "pages1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/pages1",
				},
				{
					path: "pages/index.mdx",
					mode: "100644",
					type: "blob",
					sha: "pagesindex1",
					size: 150,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/pagesindex1",
				},
			],
		};

		it("should show limited options on protected root folder (content)", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithAppAndContent);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("content")).toBeDefined();
			});

			// Right-click on content folder
			const contentFolder = screen.getByTestId("folder-content");
			fireEvent.contextMenu(contentFolder);

			// Context menu should appear
			await waitFor(() => {
				expect(screen.getByTestId("folder-context-menu")).toBeDefined();
			});

			// New file and new folder should be visible
			expect(screen.getByTestId("context-menu-new-file")).toBeDefined();
			expect(screen.getByTestId("context-menu-new-folder")).toBeDefined();
			// Rename and delete should NOT be visible for protected root folders
			expect(screen.queryByTestId("context-menu-rename-folder")).toBeNull();
			expect(screen.queryByTestId("context-menu-delete-folder")).toBeNull();
		});

		it("should show empty context menu on creation-restricted protected folder (app)", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithAppAndContent);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("app")).toBeDefined();
			});

			// Right-click on app folder
			const appFolder = screen.getByTestId("folder-app");
			fireEvent.contextMenu(appFolder);

			// Context menu container appears but has no action buttons for creation-restricted folders
			await waitFor(() => {
				expect(screen.getByTestId("folder-context-menu")).toBeDefined();
			});

			// No action buttons should be visible for creation-restricted protected folders
			expect(screen.queryByTestId("context-menu-new-file")).toBeNull();
			expect(screen.queryByTestId("context-menu-new-folder")).toBeNull();
			expect(screen.queryByTestId("context-menu-rename-folder")).toBeNull();
			expect(screen.queryByTestId("context-menu-delete-folder")).toBeNull();
		});

		it("should show all options on subfolder", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithAppAndContent);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content is auto-expanded so guide should be visible
			await waitFor(() => {
				expect(screen.getByText("guide")).toBeDefined();
			});

			// Right-click on guide subfolder
			const guideFolder = screen.getByTestId("folder-guide");
			fireEvent.contextMenu(guideFolder);

			// Context menu should appear
			await waitFor(() => {
				expect(screen.getByTestId("folder-context-menu")).toBeDefined();
			});

			// All options should be visible
			expect(screen.getByTestId("context-menu-new-file")).toBeDefined();
			expect(screen.getByTestId("context-menu-new-folder")).toBeDefined();
			expect(screen.getByTestId("context-menu-rename-folder")).toBeDefined();
			expect(screen.getByTestId("context-menu-delete-folder")).toBeDefined();
		});

		it("should close folder context menu when clicking backdrop", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithAppAndContent);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByText("guide")).toBeDefined();
			});

			// Right-click on guide subfolder
			const guideFolder = screen.getByTestId("folder-guide");
			fireEvent.contextMenu(guideFolder);

			// Context menu should appear
			await waitFor(() => {
				expect(screen.getByTestId("folder-context-menu")).toBeDefined();
			});

			// Click backdrop to close
			fireEvent.click(screen.getByTestId("context-menu-backdrop"));

			// Context menu should be gone
			await waitFor(() => {
				expect(screen.queryByTestId("folder-context-menu")).toBeNull();
			});
		});

		it("should show context menu with New File and New Folder options when right-clicking on empty space (root level)", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithAppAndContent);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByTestId("file-tree-container")).toBeDefined();
			});

			// Right-click on the tree container (empty space)
			const treeContainer = screen.getByTestId("file-tree-container");
			fireEvent.contextMenu(treeContainer);

			// Context menu should appear
			await waitFor(() => {
				expect(screen.getByTestId("folder-context-menu")).toBeDefined();
			});

			// Should show New File and New Folder options for root level
			expect(screen.getByTestId("context-menu-new-file")).toBeDefined();
			expect(screen.getByTestId("context-menu-new-folder")).toBeDefined();
			// Rename/delete should NOT show at root level (no folder path)
			expect(screen.queryByTestId("context-menu-rename-folder")).toBeNull();
			expect(screen.queryByTestId("context-menu-delete-folder")).toBeNull();
		});

		it("should show dropdown for config files in new file dialog when opened from root level", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithAppAndContent);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByTestId("file-tree-container")).toBeDefined();
			});

			// Right-click on the tree container (empty space)
			const treeContainer = screen.getByTestId("file-tree-container");
			fireEvent.contextMenu(treeContainer);

			// Click New File option
			await waitFor(() => {
				expect(screen.getByTestId("context-menu-new-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-new-file"));

			// New file dialog should appear
			await waitFor(() => {
				expect(screen.getByTestId("new-file-dialog")).toBeDefined();
			});

			// Should show dropdown for config file selection (not text input)
			expect(screen.getByTestId("new-file-name-select")).toBeDefined();
			expect(screen.queryByTestId("new-file-name-input")).toBeNull();
			// Should indicate that only Nextra config files are allowed at root level
			expect(screen.getByText("Only Nextra config files can be created at root level")).toBeDefined();
			// Should have available config file options
			expect(screen.getByText("Select a config file...")).toBeDefined();
		});

		it("should show dropdown for _meta files in new file dialog when opened from content folder", async () => {
			// File tree without _meta.ts in the content folder (but has one in guide subfolder)
			const fileTreeWithoutContentMeta = {
				sha: "abc123",
				truncated: false,
				url: "https://api.github.com/repos/test-org/test-repo/git/trees/abc123",
				tree: [
					{
						path: "content",
						mode: "040000",
						type: "tree" as const,
						sha: "content1",
						url: "https://api.github.com/repos/test-org/test-repo/git/trees/content1",
					},
					{
						path: "content/intro.mdx",
						mode: "100644",
						type: "blob" as const,
						sha: "intro1",
						size: 100,
						url: "https://api.github.com/repos/test-org/test-repo/git/blobs/intro1",
					},
					{
						path: "content/guide",
						mode: "040000",
						type: "tree" as const,
						sha: "guide1",
						url: "https://api.github.com/repos/test-org/test-repo/git/trees/guide1",
					},
					{
						path: "content/guide/_meta.ts",
						mode: "100644",
						type: "blob" as const,
						sha: "guidemeta1",
						size: 50,
						url: "https://api.github.com/repos/test-org/test-repo/git/blobs/guidemeta1",
					},
				],
			};

			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithoutContentMeta);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByTestId("folder-content")).toBeDefined();
			});

			// Right-click on content folder
			const contentFolder = screen.getByTestId("folder-content");
			fireEvent.contextMenu(contentFolder);

			// Click New File option
			await waitFor(() => {
				expect(screen.getByTestId("context-menu-new-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-new-file"));

			// New file dialog should appear
			await waitFor(() => {
				expect(screen.getByTestId("new-file-dialog")).toBeDefined();
			});

			// Should show dropdown for _meta file selection (not text input)
			expect(screen.getByTestId("new-file-name-select")).toBeDefined();
			expect(screen.queryByTestId("new-file-name-input")).toBeNull();
			// Should have _meta file option
			expect(screen.getByText("Select a _meta file...")).toBeDefined();

			// Dropdown should contain _meta file options
			const select = screen.getByTestId("new-file-name-select") as HTMLSelectElement;
			const options = Array.from(select.options).map(opt => opt.value);
			expect(options).toContain("_meta.ts");
			expect(options).toContain("_meta.tsx");
			expect(options).toContain("_meta.js");
			expect(options).toContain("_meta.jsx");
			// Should NOT contain .mdx or .md options
			expect(options.every(opt => !opt.endsWith(".mdx") && !opt.endsWith(".md"))).toBe(true);
		});

		it("should show message when _meta file already exists in content folder", async () => {
			// File tree with _meta.ts already existing in content folder
			const fileTreeWithExistingMeta = {
				sha: "abc123",
				truncated: false,
				url: "https://api.github.com/repos/test-org/test-repo/git/trees/abc123",
				tree: [
					{
						path: "content",
						mode: "040000",
						type: "tree" as const,
						sha: "content1",
						url: "https://api.github.com/repos/test-org/test-repo/git/blobs/content1",
					},
					{
						path: "content/_meta.ts",
						mode: "100644",
						type: "blob" as const,
						sha: "meta1",
						size: 50,
						url: "https://api.github.com/repos/test-org/test-repo/git/blobs/meta1",
					},
					{
						path: "content/intro.mdx",
						mode: "100644",
						type: "blob" as const,
						sha: "intro1",
						size: 100,
						url: "https://api.github.com/repos/test-org/test-repo/git/blobs/intro1",
					},
				],
			};

			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithExistingMeta);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByTestId("folder-content")).toBeDefined();
			});

			// Right-click on content folder
			const contentFolder = screen.getByTestId("folder-content");
			fireEvent.contextMenu(contentFolder);

			// Click New File option
			await waitFor(() => {
				expect(screen.getByTestId("context-menu-new-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-new-file"));

			// New file dialog should appear
			await waitFor(() => {
				expect(screen.getByTestId("new-file-dialog")).toBeDefined();
			});

			// Should show warning that _meta file already exists
			expect(screen.getByText("A _meta file already exists in this folder")).toBeDefined();
		});

		it("should show New File option for pages folder (not creation-restricted)", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithAppAndContent);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - pages folder should be visible at root level
			await waitFor(() => {
				expect(screen.getByText("pages")).toBeDefined();
			});

			// Right-click on pages folder
			const pagesFolder = screen.getByTestId("folder-pages");
			fireEvent.contextMenu(pagesFolder);

			// Context menu should appear with New File option (pages is not creation-restricted)
			await waitFor(() => {
				expect(screen.getByTestId("folder-context-menu")).toBeDefined();
			});

			// New file should be visible (pages is not in CREATION_RESTRICTED_FOLDERS)
			expect(screen.getByTestId("context-menu-new-file")).toBeDefined();
			// New folder should be visible
			expect(screen.getByTestId("context-menu-new-folder")).toBeDefined();
			// Rename and delete should NOT be visible for protected root folders
			expect(screen.queryByTestId("context-menu-rename-folder")).toBeNull();
			expect(screen.queryByTestId("context-menu-delete-folder")).toBeNull();
		});
	});

	describe("working tree updates (manual save workflow)", () => {
		const fileTreeWithFolders = {
			sha: "abc123",
			truncated: false,
			tree: [
				{
					path: "content",
					mode: "040000",
					type: "tree",
					sha: "content1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/content1",
				},
				{
					path: "content/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "meta1",
					size: 100,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/meta1",
				},
				{
					path: "content/intro.mdx",
					mode: "100644",
					type: "blob",
					sha: "intro1",
					size: 200,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/intro1",
				},
				{
					path: "content/guides",
					mode: "040000",
					type: "tree",
					sha: "guides1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/guides1",
				},
			],
		};

		it("should add folder to working tree without calling backend API", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("folder-content")).toBeDefined();
			});

			// Right-click on content folder to open context menu
			fireEvent.contextMenu(screen.getByTestId("folder-content"));

			await waitFor(() => {
				expect(screen.getByTestId("context-menu-new-folder")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-new-folder"));

			// Wait for new folder dialog
			await waitFor(() => {
				expect(screen.getByTestId("new-folder-dialog")).toBeDefined();
			});

			// Enter folder name
			const input = screen.getByTestId("new-folder-name-input") as HTMLInputElement;
			fireEvent.change(input, { target: { value: "new-folder" } });

			// Click Create - this updates working tree only (no backend call)
			fireEvent.click(screen.getByTestId("create-folder-button"));

			// Folder should appear in the tree
			await waitFor(() => {
				expect(screen.getByText("new-folder")).toBeDefined();
			});

			// Backend API should NOT be called (changes saved in batch later)
			expect(mockCreateFolder).not.toHaveBeenCalled();
		});

		it("should move file in working tree without calling backend API", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
				expect(screen.getByTestId("folder-guides")).toBeDefined();
			});

			// Right-click on intro.mdx to open context menu
			fireEvent.contextMenu(screen.getByTestId("file-intro.mdx"));

			await waitFor(() => {
				expect(screen.getByTestId("context-menu-move-file")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-move-file"));

			// Wait for move file dialog
			await waitFor(() => {
				expect(screen.getByTestId("move-file-dialog")).toBeDefined();
			});

			// Select guides as destination
			const select = screen.getByTestId("move-destination-select") as HTMLSelectElement;
			fireEvent.change(select, { target: { value: "content/guides" } });

			// Click Move - this updates working tree only (no backend call)
			fireEvent.click(screen.getByTestId("move-file-button"));

			// Dialog should close
			await waitFor(() => {
				expect(screen.queryByTestId("move-file-dialog")).toBeNull();
			});

			// Backend API should NOT be called (changes saved in batch later)
			expect(mockMoveFile).not.toHaveBeenCalled();
		});

		it("should delete folder from working tree without calling backend API", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("folder-guides")).toBeDefined();
			});

			// Right-click on guides folder
			fireEvent.contextMenu(screen.getByTestId("folder-guides"));

			await waitFor(() => {
				expect(screen.getByTestId("context-menu-delete-folder")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-delete-folder"));

			// Wait for delete folder dialog
			await waitFor(() => {
				expect(screen.getByTestId("delete-folder-dialog")).toBeDefined();
			});

			// Confirm delete - this updates working tree only (no backend call)
			fireEvent.click(screen.getByTestId("delete-folder-button"));

			// Folder should disappear from tree
			await waitFor(() => {
				expect(screen.queryByTestId("folder-guides")).toBeNull();
			});

			// Backend API should NOT be called (changes saved in batch later)
			expect(mockDeleteFolder).not.toHaveBeenCalled();
		});

		it("should rename folder in working tree without calling backend API", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByTestId("folder-guides")).toBeDefined();
			});

			// Right-click on guides folder
			fireEvent.contextMenu(screen.getByTestId("folder-guides"));

			await waitFor(() => {
				expect(screen.getByTestId("context-menu-rename-folder")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-rename-folder"));

			// Wait for rename folder dialog
			await waitFor(() => {
				expect(screen.getByTestId("rename-folder-dialog")).toBeDefined();
			});

			// Enter new name
			const input = screen.getByTestId("rename-folder-name-input") as HTMLInputElement;
			fireEvent.change(input, { target: { value: "tutorials" } });

			// Click Rename - this updates working tree only (no backend call)
			fireEvent.click(screen.getByTestId("rename-folder-button"));

			// Folder should be renamed in tree
			await waitFor(() => {
				expect(screen.getByText("tutorials")).toBeDefined();
			});

			// Backend API should NOT be called (changes saved in batch later)
			expect(mockRenameFolder).not.toHaveBeenCalled();
		});

		it("should move file via drag-and-drop without calling backend API", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
				expect(screen.getByTestId("folder-guides")).toBeDefined();
			});

			const mdxFile = screen.getByTestId("file-intro.mdx");
			const guidesFolder = screen.getByTestId("folder-guides");

			// Simulate drag and drop
			const dataTransfer = {
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue("content/intro.mdx"),
				effectAllowed: "",
				dropEffect: "",
			};

			// Start dragging
			fireEvent.dragStart(mdxFile, { dataTransfer });

			// Drop on guides folder - this updates working tree only (no backend call)
			fireEvent.drop(guidesFolder.parentElement as HTMLElement, { dataTransfer });

			// Backend API should NOT be called (changes saved in batch later)
			expect(mockMoveFile).not.toHaveBeenCalled();
		});
	});

	describe("drag and drop file moving", () => {
		const fileTreeWithMultipleFolders = {
			sha: "abc123",
			truncated: false,
			tree: [
				{
					path: "content",
					mode: "040000",
					type: "tree",
					sha: "content1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/content1",
				},
				{
					path: "content/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "meta1",
					size: 100,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/meta1",
				},
				{
					path: "content/intro.mdx",
					mode: "100644",
					type: "blob",
					sha: "intro1",
					size: 200,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/intro1",
				},
				{
					path: "content/guides",
					mode: "040000",
					type: "tree",
					sha: "guides1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/guides1",
				},
				{
					path: "content/guides/setup.mdx",
					mode: "100644",
					type: "blob",
					sha: "setup1",
					size: 300,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/setup1",
				},
				{
					path: "app",
					mode: "040000",
					type: "tree",
					sha: "app1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/app1",
				},
				{
					path: "app/layout.tsx",
					mode: "100644",
					type: "blob",
					sha: "layout1",
					size: 400,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/layout1",
				},
			],
		};

		it("should make MDX files in content folder draggable", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithMultipleFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
			});

			// MDX file should be draggable
			const mdxFile = screen.getByTestId("file-intro.mdx");
			expect(mdxFile.getAttribute("draggable")).toBe("true");
		});

		it("should not make non-MDX files draggable", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithMultipleFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("file-_meta.ts")).toBeDefined();
			});

			// _meta.ts file should not be draggable
			const metaFile = screen.getByTestId("file-_meta.ts");
			expect(metaFile.getAttribute("draggable")).not.toBe("true");
		});

		it("should not make files outside content folder draggable", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithMultipleFolders);

			renderWithProvider(mockDocsite);

			await waitFor(() => {
				expect(screen.getByTestId("folder-app")).toBeDefined();
			});

			// Expand app folder
			fireEvent.click(screen.getByTestId("folder-app"));

			await waitFor(() => {
				expect(screen.getByTestId("file-layout.tsx")).toBeDefined();
			});

			// layout.tsx in app folder should not be draggable
			const layoutFile = screen.getByTestId("file-layout.tsx");
			expect(layoutFile.getAttribute("draggable")).not.toBe("true");
		});

		it("should reduce opacity when dragging starts", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithMultipleFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
			});

			const mdxFile = screen.getByTestId("file-intro.mdx");

			// Create a mock dataTransfer object
			const dataTransfer = {
				setData: vi.fn(),
				effectAllowed: "",
			};

			// Fire drag start event
			fireEvent.dragStart(mdxFile, { dataTransfer });

			// The file should have opacity-50 class (visual feedback)
			await waitFor(() => {
				expect(mdxFile.className).toContain("opacity-50");
			});
		});

		it("should update working tree when file is dropped on a different folder", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithMultipleFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
				expect(screen.getByTestId("folder-guides")).toBeDefined();
			});

			const mdxFile = screen.getByTestId("file-intro.mdx");
			const guidesFolder = screen.getByTestId("folder-guides");

			// Simulate drag and drop
			const dataTransfer = {
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue("content/intro.mdx"),
				effectAllowed: "",
				dropEffect: "",
			};

			// Start dragging
			fireEvent.dragStart(mdxFile, { dataTransfer });

			// Drop on guides folder - updates working tree without API call
			fireEvent.drop(guidesFolder.parentElement as HTMLElement, { dataTransfer });

			// Backend API should NOT be called (changes saved in batch later)
			expect(mockMoveFile).not.toHaveBeenCalled();
		});

		it("should not update tree when file is dropped on the same folder", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithMultipleFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
			});

			const mdxFile = screen.getByTestId("file-intro.mdx");
			const contentFolder = screen.getByTestId("folder-content");

			// Simulate drag and drop on same folder
			const dataTransfer = {
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue("content/intro.mdx"),
				effectAllowed: "",
				dropEffect: "",
			};

			fireEvent.dragStart(mdxFile, { dataTransfer });
			fireEvent.drop(contentFolder.parentElement as HTMLElement, { dataTransfer });

			// File should still be in content folder (no change)
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
			});
		});

		it("should highlight folder when dragging over it", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithMultipleFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
				expect(screen.getByTestId("folder-guides")).toBeDefined();
			});

			const mdxFile = screen.getByTestId("file-intro.mdx");
			const guidesFolder = screen.getByTestId("folder-guides");

			// Start dragging
			const dataTransfer = {
				setData: vi.fn(),
				getData: vi.fn().mockReturnValue("content/intro.mdx"),
				effectAllowed: "",
				dropEffect: "",
			};

			fireEvent.dragStart(mdxFile, { dataTransfer });

			// Drag over guides folder
			fireEvent.dragEnter(guidesFolder.parentElement as HTMLElement, { dataTransfer });
			fireEvent.dragOver(guidesFolder.parentElement as HTMLElement, { dataTransfer });

			// The folder button should have the drop target highlight
			await waitFor(() => {
				expect(guidesFolder.className).toContain("ring-blue-500");
			});
		});

		it("should clear drag state when drag ends", async () => {
			mockGetRepositoryTree.mockResolvedValueOnce(fileTreeWithMultipleFolders);

			renderWithProvider(mockDocsite);

			// Wait for tree to load - content folder is auto-expanded
			await waitFor(() => {
				expect(screen.getByTestId("file-intro.mdx")).toBeDefined();
			});

			const mdxFile = screen.getByTestId("file-intro.mdx");

			const dataTransfer = {
				setData: vi.fn(),
				effectAllowed: "",
			};

			// Start and end drag
			fireEvent.dragStart(mdxFile, { dataTransfer });
			expect(mdxFile.className).toContain("opacity-50");

			fireEvent.dragEnd(mdxFile, { dataTransfer });

			// Opacity should be restored
			await waitFor(() => {
				expect(mdxFile.className).not.toContain("opacity-50");
			});
		});
	});

	describe("save and discard buttons", () => {
		const fileTreeWithFolder = {
			sha: "abc123",
			truncated: false,
			tree: [
				{
					path: "content",
					mode: "040000",
					type: "tree",
					sha: "content1",
					url: "https://api.github.com/repos/test-org/test-repo/git/trees/content1",
				},
				{
					path: "content/_meta.ts",
					mode: "100644",
					type: "blob",
					sha: "meta1",
					size: 100,
					url: "https://api.github.com/repos/test-org/test-repo/git/blobs/meta1",
				},
			],
		};

		it("should render Save and Discard buttons", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolder);

			renderWithProvider(mockDocsite);

			await waitFor(() => {
				expect(screen.getByTestId("folder-content")).toBeDefined();
			});

			// Verify buttons are rendered
			expect(screen.getByTestId("save-changes-button")).toBeDefined();
			expect(screen.getByTestId("discard-changes-button")).toBeDefined();
		});

		it("should have Save and Discard buttons disabled when no changes", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolder);

			renderWithProvider(mockDocsite);

			await waitFor(() => {
				expect(screen.getByTestId("folder-content")).toBeDefined();
			});

			// Buttons should be disabled when there are no changes
			const saveButton = screen.getByTestId("save-changes-button");
			const discardButton = screen.getByTestId("discard-changes-button");

			expect(saveButton).toHaveProperty("disabled", true);
			expect(discardButton).toHaveProperty("disabled", true);
		});

		it("should enable Save and Discard buttons when tree is modified", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolder);

			renderWithProvider(mockDocsite);

			await waitFor(() => {
				expect(screen.getByTestId("folder-content")).toBeDefined();
			});

			// Initially buttons should be disabled
			expect(screen.getByTestId("save-changes-button")).toHaveProperty("disabled", true);
			expect(screen.getByTestId("discard-changes-button")).toHaveProperty("disabled", true);

			// Create a new folder to modify the working tree
			fireEvent.contextMenu(screen.getByTestId("folder-content"));

			await waitFor(() => {
				expect(screen.getByTestId("context-menu-new-folder")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-new-folder"));

			await waitFor(() => {
				expect(screen.getByTestId("new-folder-dialog")).toBeDefined();
			});

			const input = screen.getByTestId("new-folder-name-input") as HTMLInputElement;
			fireEvent.change(input, { target: { value: "new-folder" } });
			fireEvent.click(screen.getByTestId("create-folder-button"));

			// Folder should appear
			await waitFor(() => {
				expect(screen.getByText("new-folder")).toBeDefined();
			});

			// Buttons should now be enabled
			await waitFor(() => {
				expect(screen.getByTestId("save-changes-button")).toHaveProperty("disabled", false);
				expect(screen.getByTestId("discard-changes-button")).toHaveProperty("disabled", false);
			});
		});

		it("should discard changes and disable buttons when Discard is clicked", async () => {
			mockGetRepositoryTree.mockResolvedValue(fileTreeWithFolder);

			renderWithProvider(mockDocsite);

			await waitFor(() => {
				expect(screen.getByTestId("folder-content")).toBeDefined();
			});

			// Create a new folder to modify the working tree
			fireEvent.contextMenu(screen.getByTestId("folder-content"));

			await waitFor(() => {
				expect(screen.getByTestId("context-menu-new-folder")).toBeDefined();
			});
			fireEvent.click(screen.getByTestId("context-menu-new-folder"));

			await waitFor(() => {
				expect(screen.getByTestId("new-folder-dialog")).toBeDefined();
			});

			const input = screen.getByTestId("new-folder-name-input") as HTMLInputElement;
			fireEvent.change(input, { target: { value: "new-folder" } });
			fireEvent.click(screen.getByTestId("create-folder-button"));

			// Folder should appear
			await waitFor(() => {
				expect(screen.getByText("new-folder")).toBeDefined();
			});

			// Click Discard button
			fireEvent.click(screen.getByTestId("discard-changes-button"));

			// New folder should be removed (reverted to original tree)
			await waitFor(() => {
				expect(screen.queryByText("new-folder")).toBeNull();
			});

			// Buttons should be disabled again
			await waitFor(() => {
				expect(screen.getByTestId("save-changes-button")).toHaveProperty("disabled", true);
				expect(screen.getByTestId("discard-changes-button")).toHaveProperty("disabled", true);
			});
		});
	});
});
