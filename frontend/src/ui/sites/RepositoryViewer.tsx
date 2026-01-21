import {
	type ArticleInfo,
	type AutocompleteContext,
	NextraMetaAutocompleteContext,
} from "../../components/ui/autocomplete";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { NumberEdit, type NumberEditRef } from "../../components/ui/NumberEdit";
import { ResizablePanels } from "../../components/ui/ResizablePanels";
import { useClient } from "../../contexts/ClientContext";
import { formatTimestamp } from "../../util/DateTimeUtil";
import { loadTypeScript, type ValidationIssue, validateMetaContent } from "../../util/MetaValidator";
import type { Site } from "jolli-common";
import {
	AlignLeft,
	ChevronDown,
	ChevronRight,
	Edit,
	File,
	Folder,
	FolderPlus,
	GitBranch,
	Lock,
	MoveHorizontal,
	Pencil,
	Plus,
	RefreshCw,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface GitHubTreeItem {
	path: string;
	mode: string;
	type: "blob" | "tree";
	sha: string;
	size?: number;
	url: string;
}

interface FileTreeNode {
	name: string;
	path: string;
	type: "file" | "folder";
	size?: number;
	children?: Array<FileTreeNode>;
	expanded?: boolean;
}

interface RepositoryViewerProps {
	docsite: Site;
	/** Callback when a file is successfully saved (to refresh parent state) */
	onFileSave?: (() => void) | undefined;
	/** When true, only show _meta.ts files for navigation editing (simplified view) */
	metaFilesOnly?: boolean;
}

/** Validation issue with line/column info for navigation */
interface ValidationDisplayItem {
	message: string;
	type: "error" | "warning";
	line?: number;
	column?: number;
	slug?: string;
	/** Category of the issue: syntax, orphaned (entry without file), or missing (file without entry) */
	category?: "syntax" | "orphaned" | "missing";
}

// ========== Pure utility functions extracted outside component to reduce cognitive complexity ==========

/**
 * Check if the path is a Nextra _meta.ts file that should have autocomplete.
 */
function isNextraMetaFile(path: string | null): boolean {
	if (!path) {
		return false;
	}
	const fileName = path.split("/").pop() || "";
	return path.startsWith("content/") && /^_meta\.(js|jsx|ts|tsx)$/.test(fileName);
}

/**
 * Creates implicit parent folders for a nested file path.
 * This handles cases where GitHub API doesn't include folder entries.
 */
function ensureParentFolders(
	parts: Array<string>,
	nodeMap: Map<string, FileTreeNode>,
	root: Map<string, FileTreeNode>,
): void {
	let currentPath = "";
	for (let i = 0; i < parts.length - 1; i++) {
		const partPath = parts.slice(0, i + 1).join("/");
		if (!nodeMap.has(partPath)) {
			const folderNode: FileTreeNode = {
				name: parts[i],
				path: partPath,
				type: "folder",
				children: [],
				expanded: false,
			};
			nodeMap.set(partPath, folderNode);
			if (i === 0) {
				root.set(partPath, folderNode);
			} else {
				const parentFolder = nodeMap.get(currentPath);
				parentFolder?.children?.push(folderNode);
			}
		}
		currentPath = partPath;
	}
}

/**
 * Checks if a path is relevant for documentation management.
 */
function isRelevantPath(path: string): boolean {
	// Hide .gitkeep files (used to create empty folders in Git)
	if (path.endsWith("/.gitkeep") || path === ".gitkeep") {
		return false;
	}
	// Root level config files
	if (path.match(/^next\.config\.(js|mjs|ts)$/)) {
		return true;
	}
	if (path.match(/^mdx-components\.(jsx?|tsx?)$/)) {
		return true;
	}
	if (path.match(/^theme\.config\.(jsx?|tsx?)$/)) {
		return true;
	}
	// Content folder (Nextra 4.x) - include all files and subfolders
	if (path === "content" || path.startsWith("content/")) {
		return true;
	}
	// App folder (for layout.tsx)
	if (path === "app" || path.startsWith("app/")) {
		return true;
	}
	// Public folder (static assets: images, fonts, CSS, etc.)
	if (path === "public" || path.startsWith("public/")) {
		return true;
	}
	// Pages folder (legacy Nextra 3.x support)
	if (path === "pages" || path.startsWith("pages/")) {
		return true;
	}
	// Components folder (custom React components)
	if (path === "components" || path.startsWith("components/")) {
		return true;
	}
	return false;
}

/**
 * Get allowed file extensions for a given folder path based on Nextra 4 conventions.
 * - Root level: Only config files (theme.config, mdx-components, etc.)
 * - content/: MDX/MD content files
 * - app/: React components and pages
 * - public/: Static assets (images, fonts, CSS, etc.)
 */
function getAllowedExtensions(folderPath: string): Array<{ value: string; label: string }> {
	if (folderPath === "") {
		// Root level - only allow config file extensions (handled by dropdown)
		return [
			{ value: ".tsx", label: ".tsx" },
			{ value: ".ts", label: ".ts" },
			{ value: ".js", label: ".js" },
			{ value: ".jsx", label: ".jsx" },
		];
	}

	// Content folder - MDX/MD content files
	if (folderPath === "content" || folderPath.startsWith("content/")) {
		return [
			{ value: ".mdx", label: ".mdx" },
			{ value: ".md", label: ".md" },
		];
	}

	// App folder - React components and Next.js app router files
	if (folderPath === "app" || folderPath.startsWith("app/")) {
		return [
			{ value: ".tsx", label: ".tsx" },
			{ value: ".ts", label: ".ts" },
			{ value: ".jsx", label: ".jsx" },
			{ value: ".js", label: ".js" },
			{ value: ".mdx", label: ".mdx" },
			{ value: ".css", label: ".css" },
		];
	}

	// Public folder - text-based static assets only (binary files like images/fonts cannot be created via text editor)
	if (folderPath === "public" || folderPath.startsWith("public/")) {
		return [
			{ value: ".css", label: ".css" },
			{ value: ".svg", label: ".svg" },
			{ value: ".json", label: ".json" },
			{ value: ".xml", label: ".xml" },
			{ value: ".txt", label: ".txt" },
		];
	}

	// Pages folder (legacy) - similar to content
	if (folderPath === "pages" || folderPath.startsWith("pages/")) {
		return [
			{ value: ".mdx", label: ".mdx" },
			{ value: ".md", label: ".md" },
			{ value: ".tsx", label: ".tsx" },
			{ value: ".jsx", label: ".jsx" },
		];
	}

	// Default fallback
	return [
		{ value: ".mdx", label: ".mdx" },
		{ value: ".md", label: ".md" },
	];
}

/**
 * Nextra 4 allowed root-level config file options.
 * These are the only files that can be created at the root level.
 */
const ROOT_CONFIG_FILE_OPTIONS = [
	{ name: "theme.config", extensions: [".tsx", ".ts", ".jsx", ".js"] },
	{ name: "mdx-components", extensions: [".tsx", ".ts", ".jsx", ".js"] },
	{ name: "tailwind.config", extensions: [".ts", ".js"] },
	{ name: "postcss.config", extensions: [".js", ".cjs", ".mjs"] },
] as const;

/**
 * Protected root-level folders in Nextra 4.
 * These folders cannot be renamed or deleted.
 */
const PROTECTED_ROOT_FOLDERS = ["content", "app", "public", "pages", "components"] as const;

/**
 * Check if a folder path is a protected root folder.
 */
function isProtectedRootFolder(path: string): boolean {
	return PROTECTED_ROOT_FOLDERS.includes(path as (typeof PROTECTED_ROOT_FOLDERS)[number]);
}

/**
 * Folders where file/folder creation is restricted.
 * These folders are auto-generated and should not have user-created content.
 */
const CREATION_RESTRICTED_FOLDERS = ["app", "public", "components"] as const;
/** * Folders where context menus are allowed for folder/file operations. */ const MANAGED_FOLDERS = [
	"content",
	"app",
	"public",
	"pages",
	"components",
] as const; /** * Check if a path is within a managed folder where context menus are allowed. */
function isManagedFolderPath(path: string): boolean {
	for (const folder of MANAGED_FOLDERS) {
		if (path === folder || path.startsWith(`${folder}/`)) {
			return true;
		}
	}
	return false;
}

/**
 * Check if a path is within a folder where file/folder creation is restricted.
 * This includes the folder itself and all subpaths.
 */
function isCreationRestrictedPath(path: string): boolean {
	for (const folder of CREATION_RESTRICTED_FOLDERS) {
		if (path === folder || path.startsWith(`${folder}/`)) {
			return true;
		}
	}
	return false;
}

/**
 * Get available root config files that don't already exist in the file tree.
 */
function getAvailableRootConfigFiles(existingFiles: Array<string>): Array<string> {
	const available: Array<string> = [];
	for (const config of ROOT_CONFIG_FILE_OPTIONS) {
		for (const ext of config.extensions) {
			const fileName = `${config.name}${ext}`;
			// Check if any variant of this config file exists
			const configExists = existingFiles.some(f => f.startsWith(`${config.name}.`));
			if (!configExists) {
				available.push(fileName);
				break; // Only add one extension per config type
			}
		}
	}
	return available;
}

/**
 * Get available _meta files that don't already exist in a content folder.
 */
function getAvailableContentMetaFiles(existingFilesInFolder: Array<string>): Array<string> {
	// Check if any _meta file variant already exists in this folder
	const metaExists = existingFilesInFolder.some(f => f.startsWith("_meta."));
	if (metaExists) {
		return [];
	}
	// Return all variants if no _meta file exists yet
	return ["_meta.ts", "_meta.tsx", "_meta.js", "_meta.jsx"];
}

/**
 * Recursively toggles the expanded state of a folder node.
 */
function toggleNodeExpanded(nodes: Array<FileTreeNode>, path: string): Array<FileTreeNode> {
	return nodes.map(node => {
		if (node.path === path) {
			return { ...node, expanded: !node.expanded };
		}
		if (node.children) {
			return { ...node, children: toggleNodeExpanded(node.children, path) };
		}
		return node;
	});
}

/**
 * Determines if a file is user-editable (not auto-generated by Jolli).
 */
function isFileEditable(path: string): boolean {
	const fileName = path.split("/").pop() || "";

	// Nextra 4.x (App Router) config files at root level
	if (/^next\.config\.(js|mjs|ts)$/.test(path)) {
		return true;
	}
	if (/^mdx-components\.(jsx?|tsx?)$/.test(path)) {
		return true;
	}

	// Nextra 4.x app/layout.tsx (theme configuration)
	if (/^app\/layout\.(jsx?|tsx?)$/.test(path)) {
		return true;
	}

	// Nextra 4.x app/page.tsx (root redirect - user editable)
	if (/^app\/page\.(jsx?|tsx?)$/.test(path)) {
		return true;
	}

	// Nextra 4.x app/icon.tsx (dynamic favicon - user editable)
	if (/^app\/icon\.(jsx?|tsx?)$/.test(path)) {
		return true;
	}

	// Nextra 4.x _meta files (sidebar navigation) in content directory
	if (path.startsWith("content/") && /^_meta\.(js|jsx|ts|tsx|json)$/.test(fileName)) {
		return true;
	}

	// Legacy Nextra 3.x support - theme.config
	if (/^theme\.config\.(jsx?|tsx?)$/.test(path)) {
		return true;
	}

	// Legacy Nextra 3.x _meta files in pages directory
	if (path.startsWith("pages/") && /^_meta\.(js|jsx|ts|tsx|json)$/.test(fileName)) {
		return true;
	}

	// Legacy Nextra 3.x _meta.global files
	if (path.startsWith("pages/") && /^_meta\.global\.(js|jsx|ts|tsx)$/.test(fileName)) {
		return true;
	}

	// Legacy Nextra 3.x Next.js customization files
	if (/^pages\/_app\.(jsx?|tsx?)$/.test(path)) {
		return true;
	}
	if (/^pages\/_document\.(jsx?|tsx?)$/.test(path)) {
		return true;
	}

	// Everything else (including .md, .mdx content files) is not editable
	return false;
}

/**
 * Checks if a path is a _meta file (for metaFilesOnly mode).
 */
function isMetaFilePath(path: string): boolean {
	const fileName = path.split("/").pop() || "";
	// Include the file itself or the content folder structure leading to it
	if (/^_meta\.(js|jsx|ts|tsx|json)$/.test(fileName)) {
		return true;
	}
	// Include content folder to show structure
	if (path === "content") {
		return true;
	}
	return false;
}

/**
 * Builds a file tree structure from GitHub tree items.
 * @param metaOnly When true, only include _meta files and their parent folders
 */
function buildFileTree(items: Array<GitHubTreeItem>, metaOnly = false): Array<FileTreeNode> {
	const nodeMap: Map<string, FileTreeNode> = new Map();
	const root: Map<string, FileTreeNode> = new Map();

	// First pass: find all meta files to determine which folders to include
	const metaFilePaths = new Set<string>();
	if (metaOnly) {
		for (const item of items) {
			if (item.type === "blob" && item.path.startsWith("content/") && isMetaFilePath(item.path)) {
				metaFilePaths.add(item.path);
				// Also add all parent folders
				const parts = item.path.split("/");
				for (let i = 1; i < parts.length; i++) {
					metaFilePaths.add(parts.slice(0, i).join("/"));
				}
			}
		}
	}

	const relevantItems = items.filter(item => {
		if (metaOnly) {
			return metaFilePaths.has(item.path);
		}
		return isRelevantPath(item.path);
	});
	const sortedItems = [...relevantItems].sort((a, b) => a.path.localeCompare(b.path));

	for (const item of sortedItems) {
		const parts = item.path.split("/");
		const name = parts[parts.length - 1];
		const shouldAutoExpand = item.type === "tree" && item.path === "content";

		const node: FileTreeNode = {
			name,
			path: item.path,
			type: item.type === "tree" ? "folder" : "file",
			...(item.size !== undefined ? { size: item.size } : {}),
			...(item.type === "tree" ? { children: [], expanded: shouldAutoExpand } : {}),
		};

		nodeMap.set(item.path, node);

		if (parts.length === 1) {
			root.set(item.path, node);
		} else {
			const parentPath = parts.slice(0, -1).join("/");
			const parent = nodeMap.get(parentPath);
			if (parent?.children) {
				parent.children.push(node);
			} else {
				ensureParentFolders(parts, nodeMap, root);
				const parentFolder = nodeMap.get(parentPath);
				parentFolder?.children?.push(node);
			}
		}
	}

	return Array.from(root.values());
}

/**
 * Checks if the path is a _meta.ts/.tsx file that needs syntax validation.
 * (Slightly different from isNextraMetaFile - only ts/tsx, no js/jsx)
 */
function isMetaTsFile(path: string): boolean {
	const fileName = path.split("/").pop() || "";
	return path.startsWith("content/") && /^_meta\.(ts|tsx)$/.test(fileName);
}

/**
 * Get the folder path from a _meta.ts file path.
 */
function getMetaFileFolder(metaFilePath: string): string {
	return metaFilePath.substring(0, metaFilePath.lastIndexOf("/"));
}

/**
 * Find the line number of the last entry in _meta.ts content.
 * Returns the line before the closing brace.
 */
function findLastEntryLine(content: string): number {
	const lines = content.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].includes("}")) {
			return Math.max(1, i);
		}
	}
	return lines.length;
}

/**
 * Check if a file can be formatted (TypeScript/JavaScript/JSON files).
 */
function isFileFormattable(path: string | null): boolean {
	if (!path) {
		return false;
	}
	const extension = path.split(".").pop()?.toLowerCase();
	return ["ts", "tsx", "js", "jsx", "json"].includes(extension || "");
}

/**
 * Format bytes into a human-readable string.
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/**
 * Find a folder node in the file tree by path.
 */
function findFolderInTree(nodes: Array<FileTreeNode>, folderPath: string): FileTreeNode | undefined {
	for (const node of nodes) {
		if (node.path === folderPath) {
			return node;
		}
		if (node.children) {
			const found = findFolderInTree(node.children, folderPath);
			if (found) {
				return found;
			}
		}
	}
	return;
}

/**
 * Collect content folders from the file tree.
 */
function collectContentFolders(
	nodes: Array<FileTreeNode>,
	depth = 0,
): Array<{ path: string; name: string; depth: number }> {
	const folders: Array<{ path: string; name: string; depth: number }> = [];
	for (const node of nodes) {
		if (node.type === "folder" && (node.path === "content" || node.path.startsWith("content/"))) {
			folders.push({ path: node.path, name: node.name, depth });
			if (node.children) {
				folders.push(...collectContentFolders(node.children, depth + 1));
			}
		}
	}
	return folders;
}

/**
 * Collect content files from a specific folder in the file tree.
 */
function collectContentFilesFromFolder(nodes: Array<FileTreeNode>, normalizedFolder: string): Array<string> {
	const contentFiles: Array<string> = [];
	for (const node of nodes) {
		if (node.type === "file") {
			const fileFolderPath = node.path.substring(0, node.path.lastIndexOf("/"));
			if (fileFolderPath === normalizedFolder) {
				const fileName = node.path.split("/").pop() || "";
				if ((fileName.endsWith(".mdx") || fileName.endsWith(".md")) && !fileName.includes("_meta")) {
					contentFiles.push(fileName);
				}
			}
		}
		if (node.children) {
			contentFiles.push(...collectContentFilesFromFolder(node.children, normalizedFolder));
		}
	}
	return contentFiles;
}

// ========== End of extracted utility functions ==========

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Large UI component with many features (file operations, dialogs, validation)
export function RepositoryViewer({ docsite, onFileSave, metaFilesOnly }: RepositoryViewerProps): ReactElement | null {
	const client = useClient();
	const content = useIntlayer("repository-viewer");
	const dateTimeContent = useIntlayer("date-time");
	const [fileTree, setFileTree] = useState<Array<FileTreeNode>>([]);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [fileContent, setFileContent] = useState<string>("");
	const [editedContent, setEditedContent] = useState<string>("");
	const [isEditing, setIsEditing] = useState(false);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [formatting, setFormatting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saveMessage, setSaveMessage] = useState<string | null>(null);
	const [validationIssues, setValidationIssues] = useState<Array<ValidationDisplayItem>>([]);
	const [branch] = useState("main");
	const lastSyncTime = docsite.lastGeneratedAt || docsite.createdAt;

	// Folder context menu state
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderPath: string } | null>(null);

	// File context menu state
	const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number; filePath: string } | null>(null);

	// Move file dialog state
	const [moveFileDialog, setMoveFileDialog] = useState<{ filePath: string; fileName: string } | null>(null);
	const [moveDestination, setMoveDestination] = useState<string>("content");

	// Folder operation dialog state
	const [newFolderDialog, setNewFolderDialog] = useState<{ parentPath: string } | null>(null);
	const [renameFolderDialog, setRenameFolderDialog] = useState<{ path: string; currentName: string } | null>(null);
	const [deleteFolderDialog, setDeleteFolderDialog] = useState<{ path: string; hasChildren: boolean } | null>(null);
	const [folderOperationLoading, setFolderOperationLoading] = useState(false);
	const [folderOperationError, setFolderOperationError] = useState<string | null>(null);
	const [newFolderName, setNewFolderName] = useState("");
	const [renameFolderName, setRenameFolderName] = useState("");
	// New file dialog state
	const [newFileDialog, setNewFileDialog] = useState<{ parentPath: string } | null>(null);
	const [newFileName, setNewFileName] = useState("");
	const [newFileExtension, setNewFileExtension] = useState(".mdx");
	// Cache for recently saved files to avoid GitHub API cache issues
	const [savedFilesCache, setSavedFilesCache] = useState<Map<string, string>>(new Map());
	// Ref to the editor for cursor positioning
	const editorRef = useRef<NumberEditRef>(null);
	// Ref for debounce timer
	const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Drag and drop state for moving files between folders
	const [draggedFile, setDraggedFile] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<string | null>(null);

	/**
	 * Extract articles from the file tree by finding MDX files in the content/ folder.
	 * This gives us the actual slugs (filenames) that exist in the repository.
	 */
	function getArticlesFromFileTree(): Array<ArticleInfo> {
		const articles: Array<ArticleInfo> = [];

		// Helper to recursively find MDX files in content/ folder
		function findMdxFiles(nodes: Array<FileTreeNode>, basePath = "") {
			for (const node of nodes) {
				const fullPath = basePath ? `${basePath}/${node.name}` : node.name;

				if (node.type === "folder" && node.children) {
					// Look in content/ folder and its subfolders
					if (fullPath === "content" || fullPath.startsWith("content/")) {
						findMdxFiles(node.children, fullPath);
					}
				} else if (
					node.type === "file" &&
					fullPath.startsWith("content/") &&
					node.name.endsWith(".mdx") &&
					node.name !== "index.mdx" &&
					!node.name.startsWith("_meta")
				) {
					// Extract slug from filename
					const slug = node.name.replace(/\.mdx$/, "");

					// Convert slug to title (capitalize, replace hyphens with spaces)
					const title = slug
						.split("-")
						.map(word => word.charAt(0).toUpperCase() + word.slice(1))
						.join(" ");

					articles.push({ slug, title });
				}
			}
		}

		findMdxFiles(fileTree);
		return articles;
	}

	/**
	 * Extract subfolder names from the file tree.
	 * Returns folder paths relative to content/ (e.g., "guides", "guides/advanced").
	 * Used for autocomplete suggestions when editing _meta.ts.
	 */
	function getFoldersFromFileTree(): Array<string> {
		const folders: Array<string> = [];

		// Helper to recursively find subfolders in content/ folder
		function findFolders(nodes: Array<FileTreeNode>, basePath = "") {
			for (const node of nodes) {
				const fullPath = basePath ? `${basePath}/${node.name}` : node.name;

				if (node.type === "folder" && node.children) {
					// Skip the root "content" folder itself, only collect subfolders
					if (fullPath.startsWith("content/")) {
						// Extract path relative to content/
						const relativePath = fullPath.replace(/^content\//, "");
						folders.push(relativePath);
					}
					// Recursively search subfolders
					if (fullPath === "content" || fullPath.startsWith("content/")) {
						findFolders(node.children, fullPath);
					}
				}
			}
		}

		findFolders(fileTree);
		return folders;
	}

	/**
	 * Create autocomplete context for the selected file.
	 * Extracts article slugs and folder names from the actual files in the repository.
	 */
	const autocompleteContext: AutocompleteContext | undefined = useMemo(() => {
		if (!isEditing || !selectedFile || fileTree.length === 0) {
			return;
		}

		if (isNextraMetaFile(selectedFile)) {
			const articlesFromRepo = getArticlesFromFileTree();
			const foldersFromRepo = getFoldersFromFileTree();
			// Create context if we have articles or folders to suggest
			if (articlesFromRepo.length > 0 || foldersFromRepo.length > 0) {
				return new NextraMetaAutocompleteContext({
					articles: articlesFromRepo,
					folders: foldersFromRepo,
				});
			}
		}

		return;
	}, [isEditing, selectedFile, fileTree]);

	// Extract org and repo from githubRepo (used for display)
	const githubRepo = docsite.metadata?.githubRepo;

	useEffect(() => {
		if (docsite.id && githubRepo) {
			loadRepositoryTree();
		}
	}, [docsite.id, githubRepo, branch]);

	// Cleanup validation timer on unmount
	useEffect(() => {
		return () => {
			if (validationTimerRef.current) {
				clearTimeout(validationTimerRef.current);
			}
		};
	}, []);

	async function loadRepositoryTree() {
		if (!docsite.id) {
			return;
		}

		setLoading(true);
		setError(null);
		// Clear the saved files cache when syncing to force fresh data from GitHub
		setSavedFilesCache(new Map());

		try {
			// Fetch repository tree via backend proxy (required for private repos)
			const data = await client.sites().getRepositoryTree(docsite.id, branch);
			const tree: Array<GitHubTreeItem> = (data.tree || []) as Array<GitHubTreeItem>;

			// Build file tree structure (filter to meta files only if metaFilesOnly prop is set)
			const rootNodes = buildFileTree(tree, metaFilesOnly);
			setFileTree(rootNodes);
		} catch (err) {
			console.error("Error loading repository tree:", err);
			setError(content.error as string);
		} finally {
			setLoading(false);
		}
	}

	function toggleFolder(path: string) {
		setFileTree(prev => toggleNodeExpanded(prev, path));
	}

	async function loadFileContent(path: string) {
		if (!docsite.id) {
			return;
		}

		setSelectedFile(path);
		setIsEditing(false);
		setSaveMessage(null);

		// Check if we have this file in our local cache (recently saved)
		const cachedContent = savedFilesCache.get(path);
		if (cachedContent !== undefined) {
			setFileContent(cachedContent);
			setEditedContent(cachedContent);
			return;
		}

		setLoading(true);

		try {
			// Fetch file content via backend proxy (required for private repos)
			const data = await client.sites().getFileContent(docsite.id, path, branch);

			// GitHub API returns base64 encoded content
			if (data.content) {
				const decoded = atob(data.content.replace(/\n/g, ""));
				setFileContent(decoded);
				setEditedContent(decoded);
			}
		} catch (err) {
			console.error("Error loading file content:", err);
			setFileContent(`Error loading file: ${err}`);
		} finally {
			setLoading(false);
		}
	}

	function handleEditClick() {
		if (selectedFile && isFileEditable(selectedFile)) {
			setIsEditing(true);
			setEditedContent(fileContent);

			// Preload TypeScript compiler for accurate syntax validation (for _meta.ts files)
			if (isMetaTsFile(selectedFile)) {
				loadTypeScript().catch(() => {
					// Silently fail - will fall back to Function constructor validation
				});
			}
		}
	}

	function handleCancelEdit() {
		setIsEditing(false);
		setEditedContent(fileContent);
		setSaveMessage(null);
		setValidationIssues([]);
		// Clear any pending validation timer
		if (validationTimerRef.current) {
			clearTimeout(validationTimerRef.current);
			validationTimerRef.current = null;
		}
	}

	/**
	 * Get files from a specific folder for consistency validation.
	 * Only returns files directly in the folder (not in subfolders).
	 */
	function getContentFilesInFolder(folderPath: string): Array<string> {
		const normalizedFolder = folderPath.replace(/\/$/, "");
		return collectContentFilesFromFolder(fileTree, normalizedFolder);
	}

	/**
	 * Validate _meta.ts content using client-side validation.
	 * Checks syntax errors, orphaned entries, and missing entries.
	 */
	const runValidation = useCallback(
		(contentToValidate: string) => {
			if (!selectedFile || !isMetaTsFile(selectedFile)) {
				return;
			}

			// Get content files from the same folder as the _meta.ts for consistency check
			const metaFolder = getMetaFileFolder(selectedFile);
			const contentFiles = getContentFilesInFolder(metaFolder);
			const foldersFromRepo = getFoldersFromFileTree();

			// Run client-side validation
			const result = validateMetaContent(contentToValidate, contentFiles, foldersFromRepo);

			// Helper to convert ValidationIssue to ValidationDisplayItem
			function toDisplayItem(
				issue: ValidationIssue,
				category: "syntax" | "orphaned" | "missing",
			): ValidationDisplayItem {
				const item: ValidationDisplayItem = {
					message: issue.message,
					type: issue.type,
					category,
				};
				if (issue.line !== undefined) {
					item.line = issue.line;
				}
				if (issue.column !== undefined) {
					item.column = issue.column;
				}
				if (issue.slug !== undefined) {
					item.slug = issue.slug;
				}
				return item;
			}

			// Convert ValidationIssue to ValidationDisplayItem with categories
			const displayItems: Array<ValidationDisplayItem> = [
				...result.syntaxErrors.map(issue => toDisplayItem(issue, "syntax")),
				...result.orphanedEntries.map(issue => toDisplayItem(issue, "orphaned")),
				...result.missingEntries.map(issue => toDisplayItem(issue, "missing")),
			];

			setValidationIssues(displayItems);
		},
		[selectedFile, fileTree],
	);

	/**
	 * Handle content change with debounced validation for _meta.ts files
	 */
	function handleContentChange(newContent: string) {
		setEditedContent(newContent);

		// Only validate _meta.ts files
		if (selectedFile && isMetaTsFile(selectedFile)) {
			// Clear existing timer
			if (validationTimerRef.current) {
				clearTimeout(validationTimerRef.current);
			}
			// Set new debounced validation (500ms)
			validationTimerRef.current = setTimeout(() => {
				runValidation(newContent);
			}, 500);
		}
	}

	/**
	 * Add a missing entry to the _meta.ts content.
	 * Inserts the entry before the closing brace of the export default object.
	 */
	function addEntryToMetaContent(slug: string): void {
		// Find the last closing brace position
		const lastBraceIndex = editedContent.lastIndexOf("}");
		if (lastBraceIndex === -1) {
			return;
		}

		// Check if we need a comma before the new entry
		const contentBeforeBrace = editedContent.substring(0, lastBraceIndex).trimEnd();
		const needsComma =
			contentBeforeBrace.length > 0 && !contentBeforeBrace.endsWith(",") && !contentBeforeBrace.endsWith("{");

		// Create the new entry with a capitalized title
		// Quote the key with single quotes for consistency (e.g., 'index': "Index")
		const title = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
		const newEntry = `${needsComma ? "," : ""}\n\t'${slug}': "${title}"`;

		// Insert the new entry before the closing brace
		const newContent = `${editedContent.substring(0, lastBraceIndex)}${newEntry}\n${editedContent.substring(lastBraceIndex)}`;

		setEditedContent(newContent);

		// Trigger validation after adding the entry
		if (validationTimerRef.current) {
			clearTimeout(validationTimerRef.current);
		}
		validationTimerRef.current = setTimeout(() => {
			runValidation(newContent);
		}, 100); // Shorter delay since user clicked to add
	}

	/**
	 * Handle single-clicking on an issue in the error list.
	 * For missing entries: navigates to the last entry (where new entry would be added).
	 * For other issues: navigates to the error line.
	 */
	function handleIssueClick(issue: ValidationDisplayItem) {
		// For missing entries, navigate to the last entry line (where new entry would be added)
		if (issue.category === "missing") {
			const lastEntryLine = findLastEntryLine(editedContent);
			if (editorRef.current) {
				editorRef.current.scrollToLine(lastEntryLine);
				editorRef.current.selectLine(lastEntryLine);
			}
			return;
		}

		// For other issues, navigate to the line
		if (issue.line && editorRef.current) {
			editorRef.current.scrollToLine(issue.line);
			editorRef.current.selectLine(issue.line);
		}
	}

	/**
	 * Handle double-clicking on a missing entry to add it to _meta.ts.
	 */
	function handleMissingEntryDoubleClick(issue: ValidationDisplayItem) {
		if (issue.category === "missing" && issue.slug) {
			addEntryToMetaContent(issue.slug);
		}
	}

	async function handleSaveFile() {
		if (!selectedFile || !docsite.id) {
			return;
		}

		setSaving(true);
		setSaveMessage(null);

		// Clear any pending validation timer
		if (validationTimerRef.current) {
			clearTimeout(validationTimerRef.current);
			validationTimerRef.current = null;
		}

		// Store the content to cache after tree reload
		const contentToCache = editedContent;
		const fileToCache = selectedFile;

		try {
			// Validate _meta.ts syntax before saving (final validation using client-side)
			if (isMetaTsFile(selectedFile)) {
				const metaFolder = getMetaFileFolder(selectedFile);
				const contentFiles = getContentFilesInFolder(metaFolder);
				const foldersFromRepo = getFoldersFromFileTree();
				const result = validateMetaContent(editedContent, contentFiles, foldersFromRepo);

				// Block save only if there are syntax errors (warnings are OK)
				if (result.syntaxErrors.length > 0) {
					const displayItems: Array<ValidationDisplayItem> = result.issues.map((issue: ValidationIssue) => {
						const item: ValidationDisplayItem = {
							message: issue.message,
							type: issue.type,
						};
						if (issue.line !== undefined) {
							item.line = issue.line;
						}
						if (issue.column !== undefined) {
							item.column = issue.column;
						}
						if (issue.slug !== undefined) {
							item.slug = issue.slug;
						}
						return item;
					});
					setValidationIssues(displayItems);
					setSaving(false);
					return; // Don't save if there are syntax errors
				}
			}

			await client.sites().updateRepositoryFile(docsite.id, selectedFile, editedContent);
			setValidationIssues([]);

			// Update the file content and exit edit mode
			setFileContent(editedContent);
			setIsEditing(false);
			setSaveMessage(content.saveSuccess as string);

			// Refresh the file tree to show updated timestamp
			// Note: This clears savedFilesCache, so we cache after this
			await loadRepositoryTree();

			// Cache the saved content locally to avoid GitHub API cache returning stale data
			// This must happen AFTER loadRepositoryTree since that clears the cache
			setSavedFilesCache(prev => {
				const newCache = new Map(prev);
				newCache.set(fileToCache, contentToCache);
				return newCache;
			});

			// Notify parent that a file was saved (for refreshing change detection)
			onFileSave?.();

			// Clear success message after 3 seconds
			setTimeout(() => {
				setSaveMessage(null);
			}, 3000);
		} catch (err) {
			console.error("Error saving file:", err);
			setSaveMessage(content.saveError as string);
		} finally {
			setSaving(false);
		}
	}

	async function handleFormatCode() {
		if (!selectedFile) {
			return;
		}

		setFormatting(true);
		setSaveMessage(null);

		try {
			const response = await client.sites().formatCode(editedContent, selectedFile);
			setEditedContent(response.formatted);
			setSaveMessage(content.formatSuccess as string);

			// Clear success message after 3 seconds
			setTimeout(() => {
				setSaveMessage(null);
			}, 3000);
		} catch (err) {
			console.error("Error formatting code:", err);
			setSaveMessage(content.formatError as string);
		} finally {
			setFormatting(false);
		}
	}

	// ========== Context Menu & Folder Operations ==========

	/**
	 * Handle right-click on a folder to show context menu
	 */
	function handleFolderContextMenu(e: React.MouseEvent, folderPath: string) {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY, folderPath });
	}

	/**
	 * Close the context menu
	 */
	function closeContextMenu() {
		setContextMenu(null);
	}

	/**
	 * Check if a folder has children (for delete warning)
	 */
	function folderHasChildren(folderPath: string): boolean {
		const folder = findFolderInTree(fileTree, folderPath);
		return Boolean(folder?.children && folder.children.length > 0);
	}

	/**
	 * Open new file dialog
	 */
	function openNewFileDialog(parentPath: string) {
		closeContextMenu();
		setNewFileName("");
		setNewFileExtension(".mdx");
		setFolderOperationError(null);
		setNewFileDialog({ parentPath });
	}

	/**
	 * Open new folder dialog
	 */
	function openNewFolderDialog(parentPath: string) {
		closeContextMenu();
		setNewFolderName("");
		setFolderOperationError(null);
		setNewFolderDialog({ parentPath });
	}

	/**
	 * Open rename folder dialog
	 */
	function openRenameFolderDialog(path: string) {
		closeContextMenu();
		const currentName = path.split("/").pop() || "";
		setRenameFolderName(currentName);
		setFolderOperationError(null);
		setRenameFolderDialog({ path, currentName });
	}

	/**
	 * Open delete folder dialog
	 */
	function openDeleteFolderDialog(path: string) {
		closeContextMenu();
		const hasChildren = folderHasChildren(path);
		setFolderOperationError(null);
		setDeleteFolderDialog({ path, hasChildren });
	}

	/**
	 * Create a new folder
	 */
	async function handleCreateFolder() {
		if (!newFolderDialog || !newFolderName.trim()) {
			return;
		}

		// Block creation in restricted folders (app, component, public)
		if (isCreationRestrictedPath(newFolderDialog.parentPath)) {
			setFolderOperationError(content.folderCreationRestricted as string);
			return;
		}

		setFolderOperationLoading(true);
		setFolderOperationError(null);

		try {
			const fullPath = newFolderDialog.parentPath
				? `${newFolderDialog.parentPath}/${newFolderName.trim()}`
				: newFolderName.trim();

			await client.sites().createFolder(docsite.id, fullPath);
			setSaveMessage(content.folderCreated as string);

			// Close dialog and refresh tree
			setNewFolderDialog(null);
			loadRepositoryTree();

			// Clear success message after 3 seconds
			setTimeout(() => {
				setSaveMessage(null);
			}, 3000);
		} catch (err) {
			console.error("Error creating folder:", err);
			setFolderOperationError(content.folderCreateError as string);
		} finally {
			setFolderOperationLoading(false);
		}
	}

	/**
	 * Get root-level files from the file tree
	 */
	function getRootLevelFiles(): Array<string> {
		return fileTree.filter(node => node.type === "file").map(node => node.name);
	}

	/**
	 * Get files in a specific folder from the file tree
	 */
	function getFilesInFolder(folderPath: string): Array<string> {
		const folder = findFolderInTree(fileTree, folderPath);
		if (!folder?.children) {
			return [];
		}
		return folder.children.filter(node => node.type === "file").map(node => node.name);
	}

	/**
	 * Check if a folder is in the content directory
	 */
	function isContentFolder(folderPath: string): boolean {
		return folderPath === "content" || folderPath.startsWith("content/");
	}

	/**
	 * Create a new file
	 */
	async function handleCreateFile() {
		if (!newFileDialog) {
			return;
		}

		// Block creation in restricted folders (app, component, public)
		if (isCreationRestrictedPath(newFileDialog.parentPath)) {
			setFolderOperationError(content.fileCreationRestricted as string);
			return;
		}

		// For root level and content folder, fileName is the full filename from dropdown
		// For other levels (app, public), fileName is the base name + extension
		const isRootLevel = newFileDialog.parentPath === "";
		const isContentPath = isContentFolder(newFileDialog.parentPath);
		const usesDropdown = isRootLevel || isContentPath;
		const fileName = usesDropdown ? newFileName : newFileName.trim() + newFileExtension;

		if (!fileName.trim()) {
			return;
		}

		setFolderOperationLoading(true);
		setFolderOperationError(null);

		try {
			const fullPath = newFileDialog.parentPath ? `${newFileDialog.parentPath}/${fileName}` : fileName;

			// Determine initial content based on file type
			const ext = fileName.substring(fileName.lastIndexOf("."));
			const isMetaFile = fileName.startsWith("_meta.");
			let initialContent = "";
			if (isMetaFile) {
				// Nextra _meta file for navigation configuration
				initialContent = "export default {\n};\n";
			} else if (ext === ".mdx" || ext === ".md") {
				const baseName = fileName.replace(/\.[^.]+$/, "");
				initialContent = `---\ntitle: ${baseName}\n---\n\n# ${baseName}\n`;
			} else if (ext === ".ts" || ext === ".tsx") {
				initialContent = "// TODO: Add content\n";
			} else if (ext === ".js" || ext === ".jsx" || ext === ".cjs" || ext === ".mjs") {
				initialContent = "// TODO: Add content\n";
			} else if (ext === ".css") {
				initialContent = "/* TODO: Add styles */\n";
			} else if (ext === ".json") {
				initialContent = "{\n}\n";
			} else if (ext === ".yaml" || ext === ".yml") {
				initialContent = "# TODO: Add configuration\n";
			}

			await client.sites().updateRepositoryFile(docsite.id, fullPath, initialContent);
			setSaveMessage(content.fileCreated as string);

			// Close dialog and refresh tree
			setNewFileDialog(null);
			await loadRepositoryTree();

			// Select the newly created file
			setSelectedFile(fullPath);
			setFileContent(initialContent);
			setEditedContent(initialContent);
			setIsEditing(true);

			// Clear success message after 3 seconds
			setTimeout(() => {
				setSaveMessage(null);
			}, 3000);
		} catch (err) {
			console.error("Error creating file:", err);
			setFolderOperationError(content.fileCreateError as string);
		} finally {
			setFolderOperationLoading(false);
		}
	}

	/**
	 * Rename a folder
	 */
	async function handleRenameFolder() {
		if (!renameFolderDialog || !renameFolderName.trim()) {
			return;
		}

		setFolderOperationLoading(true);
		setFolderOperationError(null);

		try {
			await client.sites().renameFolder(docsite.id, renameFolderDialog.path, renameFolderName.trim());
			setSaveMessage(content.folderRenamed as string);

			// Close dialog and refresh tree
			setRenameFolderDialog(null);
			loadRepositoryTree();

			// Clear success message after 3 seconds
			setTimeout(() => {
				setSaveMessage(null);
			}, 3000);
		} catch (err) {
			console.error("Error renaming folder:", err);
			setFolderOperationError(content.folderRenameError as string);
		} finally {
			setFolderOperationLoading(false);
		}
	}

	/**
	 * Delete a folder
	 */
	async function handleDeleteFolder() {
		if (!deleteFolderDialog) {
			return;
		}

		setFolderOperationLoading(true);
		setFolderOperationError(null);

		try {
			await client.sites().deleteFolder(docsite.id, deleteFolderDialog.path);
			setSaveMessage(content.folderDeleted as string);

			// Close dialog and refresh tree
			setDeleteFolderDialog(null);
			loadRepositoryTree();

			// Clear success message after 3 seconds
			setTimeout(() => {
				setSaveMessage(null);
			}, 3000);
		} catch (err) {
			console.error("Error deleting folder:", err);
			setFolderOperationError(content.folderDeleteError as string);
		} finally {
			setFolderOperationLoading(false);
		}
	}

	// ========== File Context Menu & Move Operations ==========

	/**
	 * Handle right-click on a file to show context menu
	 */
	function handleFileContextMenu(e: React.MouseEvent, filePath: string) {
		e.preventDefault();
		e.stopPropagation();
		setFileContextMenu({ x: e.clientX, y: e.clientY, filePath });
	}

	/**
	 * Close the file context menu
	 */
	function closeFileContextMenu() {
		setFileContextMenu(null);
	}

	/**
	 * Get all content folders from the file tree for move destination selection
	 */
	function getContentFolders(): Array<{ path: string; name: string; depth: number }> {
		return collectContentFolders(fileTree);
	}

	/**
	 * Open move file dialog
	 */
	function openMoveFileDialog(filePath: string) {
		closeFileContextMenu();
		const fileName = filePath.split("/").pop() || "";
		const currentFolder = filePath.substring(0, filePath.lastIndexOf("/")) || "content";
		setMoveDestination(currentFolder);
		setFolderOperationError(null);
		setMoveFileDialog({ filePath, fileName });
	}

	/**
	 * Move a file to a new destination folder
	 */
	async function handleMoveFile() {
		if (!moveFileDialog) {
			return;
		}

		setFolderOperationLoading(true);
		setFolderOperationError(null);

		try {
			await client.sites().moveFile(docsite.id, moveFileDialog.filePath, moveDestination);
			setSaveMessage(content.fileMoved as string);

			// Close dialog and refresh tree
			setMoveFileDialog(null);
			loadRepositoryTree();

			// Clear selected file if it was the one moved
			if (selectedFile === moveFileDialog.filePath) {
				setSelectedFile(null);
				setFileContent("");
				setEditedContent("");
			}

			// Clear success message after 3 seconds
			setTimeout(() => {
				setSaveMessage(null);
			}, 3000);
		} catch (err) {
			console.error("Error moving file:", err);
			setFolderOperationError(content.moveFileError as string);
		} finally {
			setFolderOperationLoading(false);
		}
	}

	// ========== Drag and Drop Handlers ==========

	/**
	 * Get the parent folder path from a file path.
	 * e.g., "content/guides/article.mdx" -> "content/guides"
	 *       "content/article.mdx" -> "content"
	 */
	function getParentFolder(filePath: string): string {
		const lastSlashIndex = filePath.lastIndexOf("/");
		return lastSlashIndex > 0 ? filePath.substring(0, lastSlashIndex) : "";
	}

	/**
	 * Handle drag start on a movable file.
	 * Sets the file path in dataTransfer and tracks dragged state.
	 */
	function handleDragStart(e: React.DragEvent, filePath: string) {
		e.dataTransfer.setData("text/plain", filePath);
		e.dataTransfer.effectAllowed = "move";
		setDraggedFile(filePath);
	}

	/**
	 * Handle drag end - clean up drag state.
	 */
	function handleDragEnd() {
		setDraggedFile(null);
		setDropTarget(null);
	}

	/**
	 * Handle drag over a folder - allow drop and highlight.
	 */
	function handleFolderDragOver(e: React.DragEvent, folderPath: string) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";

		// Only highlight if it's a valid drop target (different from source folder)
		if (draggedFile) {
			const sourceFolder = getParentFolder(draggedFile);
			if (sourceFolder !== folderPath) {
				setDropTarget(folderPath);
			}
		}
	}

	/**
	 * Handle drag enter a folder.
	 */
	function handleFolderDragEnter(e: React.DragEvent, folderPath: string) {
		e.preventDefault();
		if (draggedFile) {
			const sourceFolder = getParentFolder(draggedFile);
			if (sourceFolder !== folderPath) {
				setDropTarget(folderPath);
			}
		}
	}

	/**
	 * Handle drag leave a folder.
	 */
	function handleFolderDragLeave(e: React.DragEvent) {
		// Only clear if leaving the folder entirely (not entering a child)
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
			setDropTarget(null);
		}
	}

	/**
	 * Handle drop on a folder - move the file.
	 */
	async function handleFileDrop(e: React.DragEvent, folderPath: string) {
		e.preventDefault();
		const filePath = e.dataTransfer.getData("text/plain");

		// Clear drag state
		setDraggedFile(null);
		setDropTarget(null);

		// Validate the drop
		if (!filePath || !filePath.startsWith("content/") || !filePath.endsWith(".mdx")) {
			return;
		}

		// Don't move to the same folder
		const sourceFolder = getParentFolder(filePath);
		if (sourceFolder === folderPath) {
			return;
		}

		// Perform the move using existing move functionality
		setFolderOperationLoading(true);
		setFolderOperationError(null);

		try {
			await client.sites().moveFile(docsite.id, filePath, folderPath);
			setSaveMessage(content.fileMoved as string);

			// Refresh tree
			loadRepositoryTree();

			// Clear selected file if it was the one moved
			if (selectedFile === filePath) {
				setSelectedFile(null);
				setFileContent("");
				setEditedContent("");
			}

			// Clear success message after 3 seconds
			setTimeout(() => {
				setSaveMessage(null);
			}, 3000);
		} catch (err) {
			console.error("Error moving file:", err);
			setFolderOperationError(content.moveFileError as string);
			// Clear error message after 5 seconds
			setTimeout(() => {
				setFolderOperationError(null);
			}, 5000);
		} finally {
			setFolderOperationLoading(false);
		}
	}

	// ========== File Tree Rendering ==========
	function renderNodeIcon(isFolder: boolean, isExpanded: boolean, isProtected: boolean, isReadOnly: boolean) {
		if (isFolder) {
			return (
				<>
					{" "}
					{isExpanded ? (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}{" "}
					<div className="relative">
						{" "}
						<Folder className="h-4 w-4 text-blue-500" />{" "}
						{isProtected && (
							<Lock className="h-2.5 w-2.5 text-amber-600 absolute -bottom-0.5 -right-0.5" />
						)}{" "}
					</div>{" "}
				</>
			);
		}
		return (
			<>
				{" "}
				<span className="w-4" />{" "}
				<div className="relative">
					{" "}
					<File className="h-4 w-4 text-muted-foreground" />{" "}
					{isReadOnly && <Lock className="h-2.5 w-2.5 text-amber-600 absolute -bottom-0.5 -right-0.5" />}{" "}
				</div>{" "}
			</>
		);
	}

	function renderFileTreeNode(node: FileTreeNode, level = 0) {
		const isFolder = node.type === "folder";
		const isExpanded = node.expanded ?? false;
		const isSelected = selectedFile === node.path;
		const isReadOnly = !isFolder && !isFileEditable(node.path);

		// Allow context menu on content, app, public, and pages folders (and their subfolders)
		const isContentFolder = node.path === "content" || node.path.startsWith("content/");
		// Check if this is a protected root folder (can't rename/delete)
		const isProtectedFolder = isFolder && isProtectedRootFolder(node.path);
		// Files in content folder that are MDX can be moved
		const isMovableFile = !isFolder && node.path.startsWith("content/") && node.name.endsWith(".mdx");

		// Drag and drop state
		const isDragging = draggedFile === node.path;
		const isDroppableFolder = isFolder && isContentFolder;
		const isDropTargetFolder = isDroppableFolder && dropTarget === node.path;

		// Determine which context menu handler to use
		const showFolderMenu =
			isFolder && isManagedFolderPath(node.path) && !(isCreationRestrictedPath(node.path) && isProtectedFolder);
		function getContextMenuHandler(): ((e: React.MouseEvent) => void) | undefined {
			if (showFolderMenu) {
				return e => handleFolderContextMenu(e, node.path);
			}
			if (isMovableFile) {
				return e => handleFileContextMenu(e, node.path);
			}
			return;
		}

		// Build className for the button
		const buttonClassName = [
			"w-full text-left px-2 py-1 rounded flex items-center gap-2",
			isSelected ? "bg-accent" : "hover:bg-accent",
			isDragging ? "opacity-50" : "",
			isDropTargetFolder ? "bg-blue-500/20 ring-2 ring-dashed ring-blue-500" : "",
		]
			.filter(Boolean)
			.join(" ");

		return (
			<div
				key={node.path}
				onDragOver={isDroppableFolder ? e => handleFolderDragOver(e, node.path) : undefined}
				onDragEnter={isDroppableFolder ? e => handleFolderDragEnter(e, node.path) : undefined}
				onDragLeave={isDroppableFolder ? handleFolderDragLeave : undefined}
				onDrop={isDroppableFolder ? e => handleFileDrop(e, node.path) : undefined}
			>
				<button
					type="button"
					onClick={() => (isFolder ? toggleFolder(node.path) : loadFileContent(node.path))}
					onContextMenu={getContextMenuHandler()}
					draggable={isMovableFile}
					onDragStart={isMovableFile ? e => handleDragStart(e, node.path) : undefined}
					onDragEnd={isMovableFile ? handleDragEnd : undefined}
					className={buttonClassName}
					style={{ paddingLeft: `${level * 16 + 8}px` }}
					data-testid={isFolder ? `folder-${node.name}` : `file-${node.name}`}
				>
					{renderNodeIcon(isFolder, isExpanded, isProtectedFolder, isReadOnly)}
					<span className="text-sm truncate flex-1">{node.name}</span>
					{node.size !== undefined && (
						<span className="text-xs text-muted-foreground">{formatBytes(node.size)}</span>
					)}
				</button>
				{isFolder && isExpanded && node.children && (
					<div>{node.children.map(child => renderFileTreeNode(child, level + 1))}</div>
				)}
			</div>
		);
	}

	if (!githubRepo) {
		return null;
	}

	return (
		<div>
			<div className="pb-4 border-b mb-4">
				<div className="flex items-center gap-4 text-sm font-normal">
					<div className="flex items-center gap-2">
						<GitBranch className="h-4 w-4" />
						<span className="text-muted-foreground">{content.branch as string}:</span>
						<span>{branch}</span>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground">
						<span>{content.lastSynced as string}:</span>
						<span>{formatTimestamp(dateTimeContent, lastSyncTime)}</span>
					</div>
					<Button variant="outline" size="sm" onClick={() => loadRepositoryTree()}>
						<RefreshCw className="h-4 w-4 mr-2" />
						{content.syncNow as string}
					</Button>
				</div>
			</div>
			<div>
				<ResizablePanels
					className="h-[600px]"
					initialLeftWidth={25}
					minLeftWidth={15}
					maxLeftWidth={40}
					data-testid="repository-split"
					left={
						<div className="border rounded-lg overflow-auto bg-background h-full">
							{loading && fileTree.length === 0 && (
								<div className="p-4 text-center text-muted-foreground">{content.loading as string}</div>
							)}
							{error && <div className="p-4 text-center text-destructive">{error}</div>}
							{!loading && !error && fileTree.length === 0 && (
								<div className="p-4 text-center text-muted-foreground">{content.noFiles as string}</div>
							)}
							<div
								className="p-2 min-h-full"
								onContextMenu={e => {
									// Only show context menu if clicking on empty space (not on a file/folder)
									if ((e.target as HTMLElement).closest("button")) {
										return; // Let the button's own context menu handler take over
									}
									e.preventDefault();
									setContextMenu({ x: e.clientX, y: e.clientY, folderPath: "" });
								}}
								data-testid="file-tree-container"
							>
								{fileTree.map(node => renderFileTreeNode(node))}
							</div>
						</div>
					}
					right={
						<div className="border rounded-lg overflow-hidden bg-muted/50 h-full">
							{!selectedFile && (
								<div className="flex items-center justify-center h-full text-muted-foreground">
									{content.selectFile as string}
								</div>
							)}
							{selectedFile && (
								<div className="h-full">
									{loading ? (
										<div className="flex items-center justify-center h-full text-muted-foreground">
											{content.loading as string}
										</div>
									) : (
										<div className="h-full flex flex-col">
											<div className="bg-muted px-4 py-2 border-b font-mono text-sm flex items-center justify-between">
												<span>{selectedFile}</span>
												<div className="flex items-center gap-2">
													{saveMessage && (
														<span
															className={`text-xs ${saveMessage === content.saveSuccess || saveMessage === content.formatSuccess ? "text-green-600" : "text-destructive"}`}
														>
															{saveMessage}
														</span>
													)}
													{!isEditing && isFileEditable(selectedFile) && (
														<Button variant="outline" size="sm" onClick={handleEditClick}>
															<Edit className="h-4 w-4 mr-2" />
															{content.editFile as string}
														</Button>
													)}
													{!isEditing && !isFileEditable(selectedFile) && (
														<span className="text-xs text-muted-foreground">
															{content.readOnlyFile as string}
														</span>
													)}
													{isEditing && (
														<>
															{isFileFormattable(selectedFile) && (
																<Button
																	variant="outline"
																	size="sm"
																	onClick={handleFormatCode}
																	disabled={saving || formatting}
																>
																	<AlignLeft className="h-4 w-4 mr-2" />
																	{formatting
																		? (content.formatting as string)
																		: (content.formatCode as string)}
																</Button>
															)}
															<Button
																variant="outline"
																size="sm"
																onClick={handleCancelEdit}
																disabled={saving || formatting}
															>
																<X className="h-4 w-4 mr-2" />
																{content.cancel as string}
															</Button>
															<Button
																variant="default"
																size="sm"
																onClick={handleSaveFile}
																disabled={saving || formatting}
															>
																<Save className="h-4 w-4 mr-2" />
																{saving
																	? (content.saving as string)
																	: (content.saveFile as string)}
															</Button>
														</>
													)}
												</div>
											</div>
											<div className="flex-1 min-h-0 overflow-auto">
												{isEditing ? (
													<NumberEdit
														ref={editorRef}
														value={editedContent}
														onChange={handleContentChange}
														autocompleteContext={autocompleteContext}
														className="h-full"
														lineDecorations={validationIssues
															.filter(issue => issue.line !== undefined)
															.map(issue => ({
																line: issue.line as number,
																type: issue.type,
																message: issue.message,
															}))}
														data-testid="file-content-editor"
													/>
												) : (
													<NumberEdit
														value={fileContent}
														readOnly
														className="h-full"
														data-testid="file-content-viewer"
													/>
												)}
											</div>
											{/* Validation issues list at bottom */}
											{validationIssues.length > 0 && (
												<div
													className="border-t bg-muted/30 max-h-40 overflow-auto"
													data-testid="validation-error-banner"
												>
													<div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b bg-muted/50 sticky top-0">
														{content.issuesTitle as string} (
														{validationIssues.filter(i => i.type === "error").length}{" "}
														{content.errorCount as string},{" "}
														{validationIssues.filter(i => i.type === "warning").length}{" "}
														{content.warningCount as string})
													</div>
													<ul className="divide-y">
														{validationIssues.map((issue, index) => (
															<li key={index}>
																<button
																	type="button"
																	className={`text-left text-sm px-3 py-1.5 hover:bg-accent cursor-pointer w-full flex items-center gap-2 ${
																		issue.type === "error"
																			? "text-destructive"
																			: "text-amber-600 dark:text-amber-400"
																	}`}
																	onClick={() => handleIssueClick(issue)}
																	onDoubleClick={
																		issue.category === "missing"
																			? () => handleMissingEntryDoubleClick(issue)
																			: undefined
																	}
																	data-testid={`validation-error-item-${index}`}
																>
																	{/* Show + icon for missing entries (double-click to add) */}
																	{issue.category === "missing" && (
																		<Plus className="h-3.5 w-3.5 shrink-0" />
																	)}
																	{issue.line !== undefined && (
																		<span
																			className={`font-mono text-xs px-1.5 py-0.5 rounded shrink-0 ${
																				issue.type === "error"
																					? "bg-destructive/20"
																					: "bg-amber-500/20"
																			}`}
																		>
																			Line {issue.line}
																		</span>
																	)}
																	<span className="truncate">{issue.message}</span>
																</button>
															</li>
														))}
													</ul>
												</div>
											)}
										</div>
									)}
								</div>
							)}
						</div>
					}
				/>
			</div>

			{/* Context Menu */}
			{contextMenu && (
				<div
					className="fixed inset-0 z-50"
					onClick={closeContextMenu}
					onContextMenu={e => {
						e.preventDefault();
						closeContextMenu();
					}}
					data-testid="context-menu-backdrop"
				>
					<div
						className="absolute bg-popover border rounded-md shadow-md min-w-[160px] py-1"
						style={{ left: contextMenu.x, top: contextMenu.y }}
						onClick={e => e.stopPropagation()}
						data-testid="folder-context-menu"
					>
						{/* Hide New File for folders where creation is restricted (app, component, public) */}
						{!isCreationRestrictedPath(contextMenu.folderPath) && (
							<button
								type="button"
								className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
								onClick={() => openNewFileDialog(contextMenu.folderPath)}
								data-testid="context-menu-new-file"
							>
								<Plus className="h-4 w-4" />
								{content.newFile as string}
							</button>
						)}
						{/* Only show folder operations when NOT at root level, NOT a protected folder, and NOT restricted */}
						{contextMenu.folderPath !== "" && !isCreationRestrictedPath(contextMenu.folderPath) && (
							<>
								<button
									type="button"
									className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
									onClick={() => openNewFolderDialog(contextMenu.folderPath)}
									data-testid="context-menu-new-folder"
								>
									<FolderPlus className="h-4 w-4" />
									{content.newFolder as string}
								</button>
								{/* Hide rename/delete for protected root folders */}
								{!isProtectedRootFolder(contextMenu.folderPath) && (
									<>
										<div className="h-px bg-border my-1" />
										<button
											type="button"
											className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
											onClick={() => openRenameFolderDialog(contextMenu.folderPath)}
											data-testid="context-menu-rename-folder"
										>
											<Pencil className="h-4 w-4" />
											{content.renameFolder as string}
										</button>
										<div className="h-px bg-border my-1" />
										<button
											type="button"
											className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2 text-destructive"
											onClick={() => openDeleteFolderDialog(contextMenu.folderPath)}
											data-testid="context-menu-delete-folder"
										>
											<Trash2 className="h-4 w-4" />
											{content.deleteFolder as string}
										</button>
									</>
								)}
							</>
						)}
					</div>
				</div>
			)}

			{/* New Folder Dialog */}
			{newFolderDialog && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setNewFolderDialog(null)}
					data-testid="new-folder-dialog-backdrop"
				>
					<div
						className="bg-background border rounded-lg p-4 w-96"
						onClick={e => e.stopPropagation()}
						data-testid="new-folder-dialog"
					>
						<h3 className="text-lg font-semibold mb-4">{content.newFolderTitle as string}</h3>
						{folderOperationError && (
							<div className="bg-destructive/10 border border-destructive/20 text-destructive p-2 rounded text-sm mb-4">
								{folderOperationError}
							</div>
						)}
						<Input
							value={newFolderName}
							onChange={e => setNewFolderName(e.target.value)}
							placeholder={content.newFolderPlaceholder.value}
							disabled={folderOperationLoading}
							data-testid="new-folder-name-input"
							autoFocus
						/>
						<p className="text-xs text-muted-foreground mt-1 mb-4">
							{newFolderDialog.parentPath
								? `Creating in: ${newFolderDialog.parentPath}`
								: "Creating at root level"}
						</p>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setNewFolderDialog(null)}
								disabled={folderOperationLoading}
							>
								{content.cancel as string}
							</Button>
							<Button
								size="sm"
								onClick={handleCreateFolder}
								disabled={folderOperationLoading || !newFolderName.trim()}
								data-testid="create-folder-button"
							>
								{content.create as string}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* New File Dialog */}
			{newFileDialog && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setNewFileDialog(null)}
					data-testid="new-file-dialog-backdrop"
				>
					<div
						className="bg-background border rounded-lg p-4 w-96"
						onClick={e => e.stopPropagation()}
						data-testid="new-file-dialog"
					>
						<h3 className="text-lg font-semibold mb-4">{content.newFileTitle as string}</h3>
						{folderOperationError && (
							<div className="bg-destructive/10 border border-destructive/20 text-destructive p-2 rounded text-sm mb-4">
								{folderOperationError}
							</div>
						)}
						{/* Root level: dropdown of available config files */}
						{newFileDialog.parentPath === "" ? (
							<>
								<select
									value={newFileName}
									onChange={e => setNewFileName(e.target.value)}
									disabled={folderOperationLoading}
									className="w-full border rounded px-3 py-2 text-sm bg-background mb-2"
									data-testid="new-file-name-select"
								>
									<option value="">{content.selectConfigFile as string}</option>
									{getAvailableRootConfigFiles(getRootLevelFiles()).map(fileName => (
										<option key={fileName} value={fileName}>
											{fileName}
										</option>
									))}
								</select>
								{getAvailableRootConfigFiles(getRootLevelFiles()).length === 0 && (
									<p className="text-xs text-amber-600 mb-2">
										{content.allConfigFilesExist as string}
									</p>
								)}
							</>
						) : isContentFolder(newFileDialog.parentPath) ? (
							/* Content folder: dropdown of available _meta files only */
							<>
								<select
									value={newFileName}
									onChange={e => setNewFileName(e.target.value)}
									disabled={folderOperationLoading}
									className="w-full border rounded px-3 py-2 text-sm bg-background mb-2"
									data-testid="new-file-name-select"
								>
									<option value="">{content.selectMetaFile as string}</option>
									{getAvailableContentMetaFiles(getFilesInFolder(newFileDialog.parentPath)).map(
										fileName => (
											<option key={fileName} value={fileName}>
												{fileName}
											</option>
										),
									)}
								</select>
								{getAvailableContentMetaFiles(getFilesInFolder(newFileDialog.parentPath)).length ===
									0 && (
									<p className="text-xs text-amber-600 mb-2">{content.allMetaFilesExist as string}</p>
								)}
							</>
						) : (
							/* Other levels (app, public): text input + extension dropdown */
							<div className="flex gap-2 mb-2">
								<Input
									value={newFileName}
									onChange={e => setNewFileName(e.target.value)}
									placeholder={content.newFilePlaceholder.value}
									disabled={folderOperationLoading}
									data-testid="new-file-name-input"
									className="flex-1"
									autoFocus
								/>
								<select
									value={newFileExtension}
									onChange={e => setNewFileExtension(e.target.value)}
									disabled={folderOperationLoading}
									className="border rounded px-2 py-1 text-sm bg-background"
									data-testid="new-file-extension-select"
								>
									{getAllowedExtensions(newFileDialog.parentPath).map(ext => (
										<option key={ext.value} value={ext.value}>
											{ext.label}
										</option>
									))}
								</select>
							</div>
						)}
						<p className="text-xs text-muted-foreground mt-1 mb-4">
							{newFileDialog.parentPath
								? `Creating in: ${newFileDialog.parentPath}`
								: (content.creatingAtRootConfig as string)}
						</p>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setNewFileDialog(null)}
								disabled={folderOperationLoading}
							>
								{content.cancel as string}
							</Button>
							<Button
								size="sm"
								onClick={handleCreateFile}
								disabled={folderOperationLoading || !newFileName.trim()}
								data-testid="create-file-button"
							>
								{content.create as string}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Rename Folder Dialog */}
			{renameFolderDialog && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setRenameFolderDialog(null)}
					data-testid="rename-folder-dialog-backdrop"
				>
					<div
						className="bg-background border rounded-lg p-4 w-96"
						onClick={e => e.stopPropagation()}
						data-testid="rename-folder-dialog"
					>
						<h3 className="text-lg font-semibold mb-4">{content.renameFolderTitle as string}</h3>
						{folderOperationError && (
							<div className="bg-destructive/10 border border-destructive/20 text-destructive p-2 rounded text-sm mb-4">
								{folderOperationError}
							</div>
						)}
						<Input
							value={renameFolderName}
							onChange={e => setRenameFolderName(e.target.value)}
							disabled={folderOperationLoading}
							data-testid="rename-folder-name-input"
							autoFocus
						/>
						<div className="flex justify-end gap-2 mt-4">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setRenameFolderDialog(null)}
								disabled={folderOperationLoading}
							>
								{content.cancel as string}
							</Button>
							<Button
								size="sm"
								onClick={handleRenameFolder}
								disabled={folderOperationLoading || !renameFolderName.trim()}
								data-testid="rename-folder-button"
							>
								{content.rename as string}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Delete Folder Dialog */}
			{deleteFolderDialog && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setDeleteFolderDialog(null)}
					data-testid="delete-folder-dialog-backdrop"
				>
					<div
						className="bg-background border rounded-lg p-4 w-96"
						onClick={e => e.stopPropagation()}
						data-testid="delete-folder-dialog"
					>
						<h3 className="text-lg font-semibold mb-4">{content.deleteFolderTitle as string}</h3>
						{folderOperationError && (
							<div className="bg-destructive/10 border border-destructive/20 text-destructive p-2 rounded text-sm mb-4">
								{folderOperationError}
							</div>
						)}
						<p className="text-sm text-muted-foreground mb-2">{content.deleteFolderConfirm as string}</p>
						{deleteFolderDialog.hasChildren && (
							<p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
								⚠️ {content.deleteFolderNonEmpty as string}
							</p>
						)}
						<div className="flex justify-end gap-2 mt-4">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setDeleteFolderDialog(null)}
								disabled={folderOperationLoading}
							>
								{content.cancel as string}
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={handleDeleteFolder}
								disabled={folderOperationLoading}
								data-testid="delete-folder-button"
							>
								{content.delete as string}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* File Context Menu */}
			{fileContextMenu && (
				<div
					className="fixed inset-0 z-50"
					onClick={closeFileContextMenu}
					onContextMenu={e => {
						e.preventDefault();
						closeFileContextMenu();
					}}
					data-testid="file-context-menu-backdrop"
				>
					<div
						className="absolute bg-popover border rounded-md shadow-md min-w-[160px] py-1"
						style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
						onClick={e => e.stopPropagation()}
						data-testid="file-context-menu"
					>
						<button
							type="button"
							className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
							onClick={() => openMoveFileDialog(fileContextMenu.filePath)}
							data-testid="context-menu-move-file"
						>
							<MoveHorizontal className="h-4 w-4" />
							{content.moveFile as string}
						</button>
					</div>
				</div>
			)}

			{/* Move File Dialog */}
			{moveFileDialog && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setMoveFileDialog(null)}
					data-testid="move-file-dialog-backdrop"
				>
					<div
						className="bg-background border rounded-lg p-4 w-96"
						onClick={e => e.stopPropagation()}
						data-testid="move-file-dialog"
					>
						<h3 className="text-lg font-semibold mb-4">{content.moveFileTitle as string}</h3>
						{folderOperationError && (
							<div className="bg-destructive/10 border border-destructive/20 text-destructive p-2 rounded text-sm mb-4">
								{folderOperationError}
							</div>
						)}
						<p className="text-sm text-muted-foreground mb-2">
							{content.currentLocation as string}:{" "}
							<span className="font-mono">{moveFileDialog.filePath}</span>
						</p>
						<label className="text-sm font-medium mb-2 block">{content.selectDestination as string}</label>
						<select
							value={moveDestination}
							onChange={e => setMoveDestination(e.target.value)}
							disabled={folderOperationLoading}
							className="w-full border rounded-md p-2 text-sm bg-background"
							data-testid="move-destination-select"
						>
							{getContentFolders().map(folder => (
								<option key={folder.path} value={folder.path}>
									{"  ".repeat(folder.depth)}
									{folder.depth > 0 ? "└ " : ""}
									{folder.name}
								</option>
							))}
						</select>
						<div className="flex justify-end gap-2 mt-4">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setMoveFileDialog(null)}
								disabled={folderOperationLoading}
							>
								{content.cancel as string}
							</Button>
							<Button
								size="sm"
								onClick={handleMoveFile}
								disabled={
									folderOperationLoading ||
									moveDestination ===
										moveFileDialog.filePath.substring(0, moveFileDialog.filePath.lastIndexOf("/"))
								}
								data-testid="move-file-button"
							>
								{content.moveTo as string}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
