import { GitHubStyleDiff } from "../../components/GitHubStyleDiff";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/Sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/Tabs";
import { useClient } from "../../contexts/ClientContext";
import { formatDateTimeOrUnknown } from "../../util/DateTimeUtil";
import { countLineChanges, type SyncChangesetFile, type SyncChangesetWithSummary, threeWayMerge } from "jolli-common";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type CompareView = "diff" | "current" | "base" | "incoming" | "merge";

export interface ChangesetReviewWorkbenchProps {
	changeset: SyncChangesetWithSummary;
	spaceSlug?: string | undefined;
	onCloseReview?: () => void;
	onChangesetMutated?: () => void;
}

interface AffectedTreeNode {
	segment: string;
	path: string;
	children: Map<string, AffectedTreeNode>;
	file: SyncChangesetFile | null;
}

const EMPTY_LINE_CHANGES = { additions: 0, deletions: 0 } as const;

function buildAffectedFileTree(files: Array<SyncChangesetFile>): Array<AffectedTreeNode> {
	const root = new Map<string, AffectedTreeNode>();

	for (const file of files) {
		const rawParts = file.serverPath.split("/").filter(Boolean);
		const parts = rawParts.length > 0 ? rawParts : [file.serverPath];
		let current = root;
		let accumulated = "";
		for (let index = 0; index < parts.length; index++) {
			const segment = parts[index];
			accumulated = accumulated.length > 0 ? `${accumulated}/${segment}` : segment;
			const existing = current.get(segment);
			if (existing) {
				if (index === parts.length - 1) {
					existing.file = file;
				}
				current = existing.children;
				continue;
			}
			const created: AffectedTreeNode = {
				segment,
				path: accumulated,
				children: new Map<string, AffectedTreeNode>(),
				file: index === parts.length - 1 ? file : null,
			};
			current.set(segment, created);
			current = created.children;
		}
	}

	function toSortedArray(map: Map<string, AffectedTreeNode>): Array<AffectedTreeNode> {
		return [...map.values()]
			.sort((a, b) => a.segment.localeCompare(b.segment))
			.map(node => ({
				...node,
				children: new Map(toSortedArray(node.children).map(child => [child.segment, child])),
			}));
	}

	return toSortedArray(root);
}

/** Renders the recursive file tree for the affected-files panel. */
function AffectedFileTree({
	nodes,
	selectedFileId,
	onSelectFile,
}: {
	nodes: Array<AffectedTreeNode>;
	selectedFileId: number | undefined;
	onSelectFile: (id: number | undefined) => void;
}): ReactElement {
	return (
		<ul className="space-y-1">
			{nodes.map(node => {
				const hasChildren = node.children.size > 0;
				const isLeaf = Boolean(node.file);
				return (
					<li key={node.path}>
						{isLeaf && node.file ? (
							<button
								type="button"
								className={`w-full text-left rounded px-2 py-1 text-xs ${
									selectedFileId === node.file.id
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
								}`}
								onClick={() => onSelectFile(node.file?.id)}
								data-testid={`affected-file-node-${node.file.id}`}
							>
								{node.segment}
							</button>
						) : (
							<div className="px-2 py-1 text-xs font-medium text-foreground/80">{node.segment}</div>
						)}
						{hasChildren && (
							<div className="ml-3 border-l pl-2">
								<AffectedFileTree
									nodes={[...node.children.values()]}
									selectedFileId={selectedFileId}
									onSelectFile={onSelectFile}
								/>
							</div>
						)}
					</li>
				);
			})}
		</ul>
	);
}

function getReviewBadge(file: SyncChangesetFile): { label: string; variant: "secondary" | "outline" | "destructive" } {
	const decision = file.latestReview?.decision;
	if (decision === "accept") {
		return { label: "accepted", variant: "secondary" };
	}
	if (decision === "reject") {
		return { label: "rejected", variant: "destructive" };
	}
	if (decision === "amend") {
		return { label: "amended", variant: "secondary" };
	}
	return { label: "pending", variant: "outline" };
}

function getCurrentStatusLabel(file: SyncChangesetFile): string {
	if (file.currentStatus === "missing") {
		return "missing";
	}
	if (file.currentStatus === "moved") {
		return "moved";
	}
	return "current";
}

function renderContentBlock(content: string | null, testId: string): ReactElement {
	return (
		<pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words" data-testid={testId}>
			{content ?? ""}
		</pre>
	);
}

export function ChangesetReviewWorkbench({
	changeset,
	spaceSlug,
	onCloseReview,
	onChangesetMutated,
}: ChangesetReviewWorkbenchProps): ReactElement {
	const client = useClient();
	const [files, setFiles] = useState<Array<SyncChangesetFile>>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | undefined>();
	const [selectedFileId, setSelectedFileId] = useState<number | undefined>();
	const [expandedFileIds, setExpandedFileIds] = useState<Set<number>>(new Set());
	const [compareView, setCompareView] = useState<CompareView>("diff");
	const [reviewingFileId, setReviewingFileId] = useState<number | undefined>();
	const [isPublishing, setIsPublishing] = useState(false);

	/** Scope options for space-scoped API calls, only including spaceSlug when defined */
	const scopeOptions = useMemo(() => (spaceSlug ? { spaceSlug } : undefined), [spaceSlug]);

	const loadChangesetFiles = useCallback(async () => {
		setIsLoading(true);
		setLoadError(undefined);
		try {
			const response = await client.syncChangesets().getChangesetFiles(changeset.id, scopeOptions);
			setFiles(response);
			setSelectedFileId(previous => {
				if (previous && response.some(file => file.id === previous)) {
					return previous;
				}
				return response[0]?.id;
			});
			setExpandedFileIds(new Set(response.map(file => file.id)));
		} catch {
			setLoadError("Failed to load bundle files");
			setFiles([]);
			setSelectedFileId(undefined);
			setExpandedFileIds(new Set());
		} finally {
			setIsLoading(false);
		}
	}, [changeset.id, client, scopeOptions]);

	useEffect(() => {
		loadChangesetFiles();
	}, [loadChangesetFiles]);

	const selectedFile = useMemo(() => files.find(file => file.id === selectedFileId), [files, selectedFileId]);
	const selectedMergePreview = useMemo(() => {
		if (!selectedFile) {
			return { merged: "", hasConflict: false };
		}
		return threeWayMerge(
			selectedFile.baseContent,
			selectedFile.currentContent ?? "",
			selectedFile.incomingContent ?? "",
			"CURRENT",
			"INCOMING",
		);
	}, [selectedFile]);
	const affectedTree = useMemo(() => buildAffectedFileTree(files), [files]);
	const diffStatsByFileId = useMemo(() => {
		const byFileId = new Map<number, { additions: number; deletions: number }>();
		for (const file of files) {
			byFileId.set(file.id, countLineChanges(file.currentContent ?? "", file.incomingContent ?? ""));
		}
		return byFileId;
	}, [files]);

	const handleToggleFileExpansion = useCallback((fileId: number) => {
		setExpandedFileIds(previous => {
			const next = new Set(previous);
			if (next.has(fileId)) {
				next.delete(fileId);
			} /* v8 ignore next 2 - covered by toggle test; v8 loses track inside Set callback */ else {
				next.add(fileId);
			}
			return next;
		});
	}, []);

	const handleReview = useCallback(
		async (decision: "accept" | "reject" | "amend") => {
			/* v8 ignore next 3 - defensive: review buttons only render when selectedFile exists */
			if (!selectedFile) {
				return;
			}
			try {
				setReviewingFileId(selectedFile.id);
				await client.syncChangesets().reviewChangesetFile(
					changeset.id,
					selectedFile.id,
					{
						decision,
						...(decision === "amend" ? { amendedContent: selectedMergePreview.merged } : {}),
					},
					scopeOptions,
				);
				onChangesetMutated?.();
				toast.success(`Marked ${selectedFile.serverPath} as ${decision}`);
				await loadChangesetFiles();
			} catch {
				toast.error("Failed to record review decision");
			} finally {
				setReviewingFileId(undefined);
			}
		},
		[
			changeset.id,
			client,
			loadChangesetFiles,
			onChangesetMutated,
			selectedFile,
			selectedMergePreview.merged,
			scopeOptions,
		],
	);

	const handlePublish = useCallback(async () => {
		try {
			setIsPublishing(true);
			const result = await client.syncChangesets().publishChangeset(changeset.id, scopeOptions);
			onChangesetMutated?.();
			if (result.hasConflicts) {
				toast.error("Publish completed with conflicts");
			} else {
				toast.success("Changeset published");
			}
			await loadChangesetFiles();
		} catch {
			toast.error("Failed to publish changeset");
		} finally {
			setIsPublishing(false);
		}
	}, [changeset.id, client, loadChangesetFiles, onChangesetMutated, scopeOptions]);

	return (
		<div className="h-full flex flex-col" data-testid="changeset-review-workbench">
			<div className="border-b px-4 py-2 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-sm font-semibold truncate">Bundle #{changeset.id}</div>
					<div className="text-xs text-muted-foreground">
						{changeset.status} • {formatDateTimeOrUnknown(changeset.createdAt)} •{" "}
						{changeset.summary.totalFiles} files
					</div>
					{changeset.message && (
						<div className="text-xs text-muted-foreground truncate">{changeset.message}</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					{onCloseReview && (
						<Button
							size="sm"
							variant="outline"
							onClick={onCloseReview}
							data-testid="close-review-workbench-button"
						>
							Close review
						</Button>
					)}
					<Button
						size="sm"
						onClick={handlePublish}
						disabled={isPublishing || isLoading}
						data-testid="publish-changeset-button"
					>
						{isPublishing ? "Publishing..." : "Publish"}
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-[22rem_minmax(0,1fr)_18rem] flex-1 min-h-0">
				<div className="border-r overflow-y-auto p-2 space-y-2" data-testid="changeset-left-pane">
					{isLoading && <div className="text-xs text-muted-foreground p-2">Loading file diffs...</div>}
					{!isLoading && loadError && <div className="text-xs text-destructive p-2">{loadError}</div>}
					{!isLoading && !loadError && files.length === 0 && (
						<div className="text-xs text-muted-foreground p-2">No file changes in this bundle.</div>
					)}
					{!isLoading &&
						!loadError &&
						files.map(file => {
							const isSelected = selectedFileId === file.id;
							const isExpanded = expandedFileIds.has(file.id);
							const reviewBadge = getReviewBadge(file);
							const stats = diffStatsByFileId.get(file.id) ?? EMPTY_LINE_CHANGES;
							return (
								<div
									key={file.id}
									className={`rounded-md border ${isSelected ? "border-primary/50 bg-accent/40" : "border-border"}`}
									data-testid={`changeset-file-card-${file.id}`}
								>
									<button
										type="button"
										className="w-full px-2 py-1.5 text-left"
										onClick={() => setSelectedFileId(file.id)}
										data-testid={`changeset-select-file-${file.id}`}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="text-xs font-medium truncate">{file.serverPath}</span>
											<Badge variant={reviewBadge.variant} className="text-[10px] px-2 py-0">
												{reviewBadge.label}
											</Badge>
										</div>
										<div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
											<span>{getCurrentStatusLabel(file)}</span>
											<span>
												+{stats.additions} / -{stats.deletions}
											</span>
										</div>
									</button>
									<div className="px-2 pb-2">
										<button
											type="button"
											className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
											onClick={() => handleToggleFileExpansion(file.id)}
											data-testid={`changeset-toggle-diff-${file.id}`}
										>
											{/* v8 ignore next 5 - covered by toggle test; v8 struggles with JSX ternary icons */}
											{isExpanded ? (
												<ChevronDown className="h-3.5 w-3.5" />
											) : (
												<ChevronRight className="h-3.5 w-3.5" />
											)}
											Staged diff
										</button>
										{isExpanded && (
											<div className="mt-1">
												<GitHubStyleDiff
													oldContent={file.currentContent ?? ""}
													newContent={file.incomingContent ?? ""}
													testId={`changeset-left-diff-${file.id}`}
												/>
											</div>
										)}
									</div>
								</div>
							);
						})}
				</div>

				<div className="min-w-0 flex flex-col overflow-hidden">
					{!selectedFile ? (
						<div className="h-full flex items-center justify-center text-sm text-muted-foreground">
							Select a changed file to review.
						</div>
					) : (
						<>
							<div className="border-b px-4 py-2 flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="text-sm font-medium truncate">{selectedFile.serverPath}</div>
									<div className="text-xs text-muted-foreground">
										Current v{selectedFile.currentVersion ?? "?"} • Base v{selectedFile.baseVersion}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										variant="secondary"
										onClick={() => handleReview("accept")}
										disabled={reviewingFileId === selectedFile.id}
										data-testid="review-accept-button"
									>
										<Check className="h-3.5 w-3.5" />
										Accept
									</Button>
									<Button
										size="sm"
										variant="destructive"
										onClick={() => handleReview("reject")}
										disabled={reviewingFileId === selectedFile.id}
										data-testid="review-reject-button"
									>
										<X className="h-3.5 w-3.5" />
										Reject
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => handleReview("amend")}
										disabled={reviewingFileId === selectedFile.id}
										data-testid="review-amend-button"
									>
										Amend
									</Button>
								</div>
							</div>

							<Tabs
								value={compareView}
								onValueChange={value => setCompareView(value as CompareView)}
								className="flex-1 min-h-0 flex flex-col"
							>
								<div className="px-4 pt-3">
									<TabsList data-testid="changeset-compare-tabs">
										<TabsTrigger value="diff">Current → Incoming</TabsTrigger>
										<TabsTrigger value="current">Current</TabsTrigger>
										<TabsTrigger value="base">Base</TabsTrigger>
										<TabsTrigger value="incoming">Incoming</TabsTrigger>
										<TabsTrigger value="merge">3-way Preview</TabsTrigger>
									</TabsList>
								</div>
								<TabsContent value="diff" className="mt-0 px-4 pb-4 overflow-auto">
									<GitHubStyleDiff
										oldContent={selectedFile.currentContent ?? ""}
										newContent={selectedFile.incomingContent ?? ""}
										testId="changeset-main-diff"
										viewMode="side-by-side"
									/>
								</TabsContent>
								<TabsContent value="current" className="mt-0 px-4 pb-4 overflow-auto">
									{renderContentBlock(selectedFile.currentContent, "changeset-current-content")}
								</TabsContent>
								<TabsContent value="base" className="mt-0 px-4 pb-4 overflow-auto">
									{renderContentBlock(selectedFile.baseContent, "changeset-base-content")}
								</TabsContent>
								<TabsContent value="incoming" className="mt-0 px-4 pb-4 overflow-auto">
									{renderContentBlock(selectedFile.incomingContent, "changeset-incoming-content")}
								</TabsContent>
								<TabsContent value="merge" className="mt-0 px-4 pb-4 overflow-auto">
									{renderContentBlock(selectedMergePreview.merged, "changeset-three-way-preview")}
									{selectedMergePreview.hasConflict && (
										<div
											className="mt-2 text-xs text-amber-600"
											data-testid="changeset-three-way-conflict"
										>
											Merge preview contains conflict markers.
										</div>
									)}
								</TabsContent>
							</Tabs>
						</>
					)}
				</div>

				<div className="border-l p-3 overflow-y-auto" data-testid="affected-file-tree-pane">
					<div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase text-muted-foreground">
						Affected Files
					</div>
					<div data-testid="affected-file-tree">
						{affectedTree.length === 0 ? (
							<div className="text-xs text-muted-foreground">No affected files</div>
						) : (
							<AffectedFileTree
								nodes={affectedTree}
								selectedFileId={selectedFileId}
								onSelectFile={setSelectedFileId}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
