import { ArticleTreeItem, type ArticleTreeNode, computeFolderStats, getAllDocumentJrns } from "./ArticleTreeItem";
import type { Doc } from "jolli-common";
import { type ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface ArticleTreeProps {
	articles: Array<Doc>;
	selectedJrns: Set<string>;
	onSelectionChange: (jrns: Set<string>) => void;
	searchQuery?: string;
	disabled?: boolean;
	changedJrns?: Set<string> | undefined;
}

function buildArticleTree(articles: Array<Doc>): Array<ArticleTreeNode> {
	// Create nodes and organize by parent
	const nodeMap = new Map<number, ArticleTreeNode>();
	const rootNodes: Array<ArticleTreeNode> = [];

	// First pass: create all nodes
	for (const article of articles) {
		nodeMap.set(article.id, {
			doc: article,
			children: [],
			expanded: article.docType === "folder", // Folders start expanded
		});
	}

	// Second pass: organize hierarchy
	for (const article of articles) {
		const node = nodeMap.get(article.id);
		if (!node) {
			continue;
		}

		if (article.parentId === undefined || article.parentId === null) {
			// Root level item
			rootNodes.push(node);
		} else {
			// Child item - add to parent's children
			const parentNode = nodeMap.get(article.parentId);
			if (parentNode) {
				parentNode.children.push(node);
			} else {
				// Parent not found, add to root
				rootNodes.push(node);
			}
		}
	}

	// Sort each level by sortOrder — matches the space tree's default sort (no folders-first)
	function sortChildren(nodes: Array<ArticleTreeNode>): void {
		nodes.sort((a, b) => a.doc.sortOrder - b.doc.sortOrder);
		for (const node of nodes) {
			sortChildren(node.children);
		}
	}

	sortChildren(rootNodes);
	return rootNodes;
}

function filterTree(nodes: Array<ArticleTreeNode>, query: string): Array<ArticleTreeNode> {
	if (!query.trim()) {
		return nodes;
	}

	const lowerQuery = query.toLowerCase();

	function nodeMatches(node: ArticleTreeNode): boolean {
		const title = (node.doc.contentMetadata?.title || node.doc.slug || node.doc.jrn).toLowerCase();
		return title.includes(lowerQuery);
	}

	function filterNode(node: ArticleTreeNode): ArticleTreeNode | null {
		// Check if this node matches
		const selfMatches = nodeMatches(node);

		// Filter children recursively
		const filteredChildren = node.children
			.map(child => filterNode(child))
			.filter((child): child is ArticleTreeNode => child !== null);

		// Keep node if it matches or has matching descendants
		if (selfMatches || filteredChildren.length > 0) {
			return {
				...node,
				children: filteredChildren,
				expanded: true, // Auto-expand when filtering
			};
		}

		return null;
	}

	return nodes.map(node => filterNode(node)).filter((node): node is ArticleTreeNode => node !== null);
}

export function ArticleTree({
	articles,
	selectedJrns,
	onSelectionChange,
	searchQuery = "",
	disabled = false,
	changedJrns,
}: ArticleTreeProps): ReactElement {
	const content = useIntlayer("article-tree");

	// Track expanded state separately so it persists across re-renders
	const [expandedIds, setExpandedIds] = useState<Set<number>>(() => {
		const ids = new Set<number>();
		for (const article of articles) {
			if (article.docType === "folder") {
				ids.add(article.id);
			}
		}
		return ids;
	});

	// Auto-expand newly-appearing folders so they are visible immediately
	useEffect(() => {
		const newFolderIds: Array<number> = [];
		for (const article of articles) {
			if (article.docType === "folder" && !expandedIds.has(article.id)) {
				newFolderIds.push(article.id);
			}
		}
		if (newFolderIds.length > 0) {
			setExpandedIds(prev => {
				const next = new Set(prev);
				for (const id of newFolderIds) {
					next.add(id);
				}
				return next;
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [articles]);

	// Build and filter tree
	const tree = useMemo(() => {
		const builtTree = buildArticleTree(articles);

		// Apply expanded state
		function applyExpanded(nodes: Array<ArticleTreeNode>): Array<ArticleTreeNode> {
			return nodes.map(node => ({
				...node,
				expanded: expandedIds.has(node.doc.id),
				children: applyExpanded(node.children),
			}));
		}

		const expandedTree = applyExpanded(builtTree);
		return filterTree(expandedTree, searchQuery);
	}, [articles, expandedIds, searchQuery]);

	const handleToggle = useCallback(
		(jrn: string) => {
			const newSelection = new Set(selectedJrns);
			if (newSelection.has(jrn)) {
				newSelection.delete(jrn);
			} else {
				newSelection.add(jrn);
			}
			onSelectionChange(newSelection);
		},
		[selectedJrns, onSelectionChange],
	);

	const handleToggleExpand = useCallback((docId: number) => {
		setExpandedIds(prev => {
			const next = new Set(prev);
			if (next.has(docId)) {
				next.delete(docId);
			} else {
				next.add(docId);
			}
			return next;
		});
	}, []);

	const handleSelectFolder = useCallback(
		(node: ArticleTreeNode, select: boolean) => {
			const folderJrns = getAllDocumentJrns(node);
			const newSelection = new Set(selectedJrns);

			for (const jrn of folderJrns) {
				if (select) {
					newSelection.add(jrn);
				} else {
					newSelection.delete(jrn);
				}
			}

			onSelectionChange(newSelection);
		},
		[selectedJrns, onSelectionChange],
	);

	// Pre-compute folder selection states and descendant counts in a single pass
	const folderStats = useMemo(() => computeFolderStats(tree, selectedJrns), [tree, selectedJrns]);

	// Stable formatter function for folder item count tooltips
	const itemCountFormatter = useCallback(
		(count: number) => content.itemCount({ count: String(count) }).value,
		[content],
	);

	if (tree.length === 0) {
		return (
			<div className="p-4 text-sm text-center text-muted-foreground" data-testid="article-tree-empty">
				{content.noArticlesFound}
			</div>
		);
	}

	return (
		<div role="tree" data-testid="article-tree">
			{tree.map(node => (
				<ArticleTreeItem
					key={node.doc.id}
					node={node}
					depth={0}
					selectedJrns={selectedJrns}
					onToggle={handleToggle}
					onToggleExpand={handleToggleExpand}
					onSelectFolder={handleSelectFolder}
					disabled={disabled}
					folderStats={folderStats}
					changedJrns={changedJrns}
					pendingChangesLabel={content.hasPendingChanges.value}
					itemCountFormatter={itemCountFormatter}
				/>
			))}
		</div>
	);
}
