/**
 * CollapsibleBreadcrumb - Context-aware breadcrumb navigation for articles.
 *
 * Features:
 * - When sidebar is collapsed: shows space name as root (with space icon)
 * - When sidebar is expanded: shows top-level folder as root (space visible in sidebar)
 * - Intermediate folders collapse into "..." dropdown with nested indentation
 * - Current article shown bold with FileText icon
 * - Parent folder always visible as clickable link
 */

import { cn } from "../../common/ClassNameUtils";
import { SpaceIcon } from "../../components/SpaceIcon";
import type { TreeNode } from "../../hooks/useSpaceTree";
import type { Doc } from "jolli-common";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface BreadcrumbPathItem {
	id: number;
	name: string;
	type: "folder" | "article";
}

export interface CollapsibleBreadcrumbProps {
	/** Current space name */
	spaceName: string;
	/** Full path from root to the current article */
	path: Array<BreadcrumbPathItem>;
	/** Whether the sidebar is collapsed */
	sidebarCollapsed: boolean;
	/** Callback when clicking a folder in the breadcrumb */
	onNavigate?: (item: BreadcrumbPathItem) => void;
	/** Hide the space name root (when it's already shown separately, e.g., in collapsed panel header) */
	hideSpaceName?: boolean;
}

/**
 * Builds the breadcrumb path from a tree and selected doc ID.
 * Traverses parent chain to construct the full path from root to the selected document.
 */
export function buildBreadcrumbPath(treeData: Array<TreeNode>, docId: number): Array<BreadcrumbPathItem> {
	// Flatten tree into a doc lookup map
	const docMap = new Map<number, Doc>();
	function flatten(nodes: Array<TreeNode>): void {
		for (const node of nodes) {
			docMap.set(node.doc.id, node.doc);
			flatten(node.children);
		}
	}
	flatten(treeData);

	// Build path by traversing up the parent chain
	const path: Array<BreadcrumbPathItem> = [];
	let currentId: number | undefined = docId;
	while (currentId !== undefined) {
		const doc = docMap.get(currentId);
		if (!doc) {
			break;
		}
		path.unshift({
			id: doc.id,
			name: doc.contentMetadata?.title ?? "Untitled",
			type: doc.docType === "folder" ? "folder" : "article",
		});
		currentId = doc.parentId ?? undefined;
	}
	return path;
}

/**
 * Collapsible breadcrumb navigation for the article view.
 * Adapts its root element based on sidebar state for context-aware navigation.
 */
export function CollapsibleBreadcrumb({
	spaceName,
	path,
	sidebarCollapsed,
	onNavigate,
	hideSpaceName = false,
}: CollapsibleBreadcrumbProps): ReactElement {
	const content = useIntlayer("collapsible-breadcrumb");
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLLIElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		if (!dropdownOpen) {
			return;
		}
		function handleClickOutside(event: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setDropdownOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [dropdownOpen]);

	// Determine root and remaining path based on sidebar state.
	// When hideSpaceName is true, skip the space root (it's shown separately).
	// Only treat the first path item as a folder root if it's actually a folder;
	// a root-level article should not be rendered with a folder icon and folder styling.
	const showSpace = !hideSpaceName && (sidebarCollapsed || path.length === 0);
	const firstIsFolder = path.length > 0 && path[0].type === "folder";
	const rootFolder = !showSpace && firstIsFolder ? path[0] : null;
	const remainingPath = rootFolder ? path.slice(1) : path;

	// Split remaining path into: collapsed folders, parent folder, current item
	const currentItem = remainingPath.length >= 1 ? remainingPath[remainingPath.length - 1] : null;
	const parentFolder = remainingPath.length >= 2 ? remainingPath[remainingPath.length - 2] : null;
	const collapsedFolders = remainingPath.length > 2 ? remainingPath.slice(0, remainingPath.length - 2) : [];

	// Whether any breadcrumb element precedes the current item (to conditionally show the chevron separator)
	const hasPrecedingBreadcrumb = showSpace || !!rootFolder || collapsedFolders.length > 0 || !!parentFolder;

	return (
		<nav aria-label={content.breadcrumbNavigation.value} data-testid="collapsible-breadcrumb">
			<ol className="flex items-center gap-1 text-sm">
				{/* Root: Space name (collapsed sidebar) or top-most folder (expanded sidebar) */}
				{showSpace ? (
					<li className="flex items-center gap-1">
						<span
							className="flex items-center gap-1.5 text-muted-foreground"
							data-testid="breadcrumb-space-root"
						>
							<SpaceIcon name={spaceName} size={5} />
							<span>{spaceName}</span>
						</span>
					</li>
				) : rootFolder ? (
					<li className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => onNavigate?.(rootFolder)}
							className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
							data-testid="breadcrumb-folder-root"
						>
							<Folder className="h-3.5 w-3.5 shrink-0" />
							<span>{rootFolder.name}</span>
						</button>
					</li>
				) : null}

				{/* Collapsed folders dropdown ("..." trigger) */}
				{collapsedFolders.length > 0 && (
					<>
						<li className="flex items-center" aria-hidden="true">
							<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
						</li>
						<li className="relative flex items-center" ref={dropdownRef}>
							<button
								type="button"
								onClick={() => setDropdownOpen(!dropdownOpen)}
								className="flex items-center px-1.5 py-0.5 rounded hover:bg-accent transition-colors text-sm text-muted-foreground hover:text-foreground"
								aria-label={content.collapsedFolders.value}
								data-testid="breadcrumb-ellipsis"
							>
								...
							</button>
							{dropdownOpen && (
								<div
									className="absolute top-full left-0 mt-1 min-w-[200px] rounded-md border border-border bg-popover shadow-md z-50"
									data-testid="breadcrumb-ellipsis-dropdown"
								>
									{collapsedFolders.map((item, index) => (
										<button
											key={item.id}
											type="button"
											onClick={() => {
												onNavigate?.(item);
												setDropdownOpen(false);
											}}
											className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
											style={{ paddingLeft: `${12 + index * 16}px` }}
											data-testid={`breadcrumb-collapsed-folder-${item.id}`}
										>
											{index > 0 && <span className="text-muted-foreground mr-1">&#8627;</span>}
											<Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
											<span>{item.name}</span>
										</button>
									))}
								</div>
							)}
						</li>
					</>
				)}

				{/* Parent folder */}
				{parentFolder && (
					<>
						<li className="flex items-center" aria-hidden="true">
							<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
						</li>
						<li className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => onNavigate?.(parentFolder)}
								className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
								data-testid="breadcrumb-parent-folder"
							>
								<Folder className="h-3.5 w-3.5 shrink-0" />
								<span>{parentFolder.name}</span>
							</button>
						</li>
					</>
				)}

				{/* Current item (article or folder) — only show separator when there's a preceding breadcrumb */}
				{currentItem && (
					<>
						{hasPrecedingBreadcrumb && (
							<li className="flex items-center" aria-hidden="true">
								<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
							</li>
						)}
						<li className="flex items-center gap-1" data-testid="breadcrumb-current-item">
							<span
								className={cn(
									"flex items-center gap-1.5 font-semibold",
									currentItem.type === "article" ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{currentItem.type === "article" ? (
									<FileText className="h-3.5 w-3.5 shrink-0" />
								) : (
									<Folder className="h-3.5 w-3.5 shrink-0" />
								)}
								<span>{currentItem.name}</span>
							</span>
						</li>
					</>
				)}
			</ol>
		</nav>
	);
}
