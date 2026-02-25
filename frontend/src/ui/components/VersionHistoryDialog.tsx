import { UserAvatar } from "../../components/UserAvatar";
import { Button } from "../../components/ui/Button";
import { DiffDialog } from "../../components/ui/DiffDialog";
import { type FetchResult, InfiniteScroll } from "../../components/ui/InfiniteScroll";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/Popover";
import { useVersionHistoryOptional } from "../../contexts/VersionHistoryContext";
import { createUnifiedDiff } from "../../util/DiffUtil";
import { getLog } from "../../util/Logger";
import { AlertTriangle, Clock } from "lucide-react";
import { type ReactElement, type ReactNode, useCallback, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

/**
 * Summary of a doc history entry (without the snapshot content)
 */
export interface DocHistorySummary {
	id: number;
	docId: number;
	userId: number;
	version: number;
	createdAt: string;
}

/**
 * Paginated result from the doc-histories API
 */
export interface DocHistoryPaginatedResult {
	items: Array<DocHistorySummary>;
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

/**
 * Document snapshot from history detail API
 */
export interface DocSnapshot {
	id: number;
	jrn: string;
	content: string;
	contentType: string;
	contentMetadata?: {
		title?: string;
		[key: string]: unknown;
	};
	version: number;
}

/**
 * Response from GET /api/doc-histories/:id
 */
export interface DocHistoryDetailResponse {
	id: number;
	docId: number;
	userId: number;
	version: number;
	createdAt: string;
	docSnapshot: DocSnapshot;
}

/**
 * Current document info for comparison
 */
export interface CurrentDocInfo {
	title: string;
	content: string;
	version: number;
}

export interface VersionHistoryDialogProps {
	/** Trigger element rendered as the popover toggle (e.g. a History button) */
	children: ReactNode;
	docId: number;
	currentDoc: CurrentDocInfo;
	currentReferVersion?: number | undefined;
	onSelectVersion?: (historyItem: DocHistorySummary) => void;
	onConfirmRestore?: (historyDetail: DocHistoryDetailResponse) => void;
}

/**
 * Version history popover — renders a compact dropdown anchored to the trigger element.
 * Clicking a version opens a full-screen DiffDialog; restoring uses a confirmation modal.
 */
export function VersionHistoryDialog({
	children,
	docId,
	currentDoc,
	currentReferVersion,
	onSelectVersion,
	onConfirmRestore,
}: VersionHistoryDialogProps): ReactElement {
	const content = useIntlayer("version-history-dialog");
	const versionHistoryContext = useVersionHistoryOptional();

	// Popover open state
	const [open, setOpen] = useState(false);

	// State for DiffDialog
	const [showDiffDialog, setShowDiffDialog] = useState(false);
	const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<DocHistoryDetailResponse | null>(null);
	const [loadingDetail, setLoadingDetail] = useState(false);

	// State for confirm restore dialog
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);
	const [restoring, setRestoring] = useState(false);

	const fetchVersionHistory = useCallback(
		async (pageNo: number, pageSize: number): Promise<FetchResult<DocHistorySummary>> => {
			try {
				const params = new URLSearchParams({
					docId: String(docId),
					page: String(pageNo),
					pageSize: String(pageSize),
				});

				const response = await fetch(`/api/doc-histories?${params.toString()}`, {
					credentials: "include",
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch version history: ${response.statusText}`);
				}

				const result = (await response.json()) as DocHistoryPaginatedResult;
				return {
					list: result.items,
					total: result.total,
				};
			} catch (error) {
				log.error(error, "Error fetching version history");
				throw error;
			}
		},
		[docId],
	);

	/**
	 * Fetch history detail and show diff dialog.
	 * Closes the popover first so the DiffDialog takes over the screen.
	 */
	async function handleVersionClick(item: DocHistorySummary) {
		// Call external handler if provided
		onSelectVersion?.(item);

		// Close popover — the DiffDialog will take over
		setOpen(false);

		// Fetch full history detail
		setLoadingDetail(true);
		try {
			const response = await fetch(`/api/doc-histories/${item.id}`, {
				credentials: "include",
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch history detail: ${response.statusText}`);
			}

			const detail = (await response.json()) as DocHistoryDetailResponse;
			setSelectedHistoryDetail(detail);
			setShowDiffDialog(true);
		} catch (error) {
			log.error(error, "Error fetching history detail");
		} finally {
			setLoadingDetail(false);
		}
	}

	/**
	 * Handle confirm from DiffDialog - show secondary confirmation
	 */
	function handleDiffConfirm() {
		setShowConfirmDialog(true);
	}

	/**
	 * Handle confirmed restore - call API
	 */
	async function handleConfirmRestore() {
		if (!selectedHistoryDetail) {
			return;
		}

		setRestoring(true);
		try {
			const response = await fetch(`/api/doc-histories/${selectedHistoryDetail.id}/restore`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to restore version: ${response.statusText}`);
			}

			log.debug("Version restored successfully, historyId=%d", selectedHistoryDetail.id);

			// Call external handler if provided
			onConfirmRestore?.(selectedHistoryDetail);

			// Notify parent component to refresh document data
			versionHistoryContext?.onVersionRestored();

			// Close all dialogs
			setShowConfirmDialog(false);
			setShowDiffDialog(false);
			setSelectedHistoryDetail(null);
		} catch (error) {
			log.error(error, "Error restoring version");
		} finally {
			setRestoring(false);
		}
	}

	/**
	 * Cancel restore confirmation
	 */
	function handleCancelConfirm() {
		setShowConfirmDialog(false);
	}

	/**
	 * Close diff dialog
	 */
	function handleDiffClose() {
		setShowDiffDialog(false);
		setSelectedHistoryDetail(null);
		setShowConfirmDialog(false);
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString();
	}

	// Generate diff title: "Current Version (title(vX)) vs Historical Version (title(vY))"
	function getDiffTitle(): string {
		if (!selectedHistoryDetail) {
			return "";
		}
		const historyTitle = selectedHistoryDetail.docSnapshot.contentMetadata?.title ?? "Untitled";
		const historyVersion = selectedHistoryDetail.version;
		return `${currentDoc.title} (v${currentDoc.version}) vs ${historyTitle} (v${historyVersion})`;
	}

	// Generate unified diff content (historical as "old", current as "new" so additions show what changed)
	function getDiffContent(): string {
		if (!selectedHistoryDetail) {
			return "";
		}
		return createUnifiedDiff(
			selectedHistoryDetail.docSnapshot.content,
			currentDoc.content,
			`Historical (v${selectedHistoryDetail.version})`,
			`Current (v${currentDoc.version})`,
		);
	}

	function renderHistoryItem(item: DocHistorySummary): ReactElement {
		const isCurrentVersion = currentReferVersion !== undefined && item.version === currentReferVersion;
		return (
			<div
				className={`flex items-center justify-between p-3 rounded-md transition-colors border-b border-border last:border-b-0 ${
					isCurrentVersion
						? "bg-primary/5 border-l-2 border-l-primary cursor-default"
						: "hover:bg-muted/50 cursor-pointer"
				}`}
				onClick={() => {
					if (!isCurrentVersion) {
						handleVersionClick(item);
					}
				}}
				data-testid={`version-item-${item.version}`}
			>
				<div className="flex items-center gap-3">
					<div
						className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${isCurrentVersion ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
					>
						v{item.version}
					</div>
					<div className="flex flex-col">
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Clock className="h-3 w-3" />
							<span>{formatDate(item.createdAt)}</span>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{isCurrentVersion && (
						<span
							className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground"
							data-testid={`current-version-badge-${item.version}`}
						>
							{content.currentVersion}
						</span>
					)}
					<UserAvatar userId={item.userId} size="small" />
				</div>
			</div>
		);
	}

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>{children}</PopoverTrigger>
				<PopoverContent className="w-80 p-0" align="end" data-testid="version-history-dialog">
					{/* Header */}
					<div className="flex items-center px-3 py-2 border-b shrink-0">
						<h2 className="text-sm font-semibold" data-testid="version-history-title">
							{content.title}
						</h2>
					</div>

					{/* Loading indicator for detail fetch */}
					{loadingDetail && (
						<div
							className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-md z-10"
							data-testid="loading-detail"
						>
							<div className="bg-card px-4 py-2 rounded-md shadow-lg text-sm">{content.loading}</div>
						</div>
					)}

					{/* Scrollable version list */}
					<div className="h-80">
						<InfiniteScroll
							fetchData={fetchVersionHistory}
							pageSize={20}
							threshold="20"
							renderItem={renderHistoryItem}
							keyExtractor={item => item.id}
							className="h-full"
							padding="sm"
							testId="version-history-list"
						/>
					</div>
				</PopoverContent>
			</Popover>

			{/* Diff Dialog — renders as a full-screen modal */}
			<DiffDialog
				isOpen={showDiffDialog}
				title={getDiffTitle()}
				diffContent={getDiffContent()}
				size="xl"
				onClose={handleDiffClose}
				onConfirm={handleDiffConfirm}
			/>

			{/* Confirm Restore Dialog — renders as a modal */}
			{showConfirmDialog && (
				<div
					className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
					onClick={e => {
						if (e.target === e.currentTarget && !restoring) {
							handleCancelConfirm();
						}
					}}
					data-testid="confirm-restore-dialog"
				>
					<div className="bg-card rounded-lg border shadow-lg w-full max-w-sm m-4">
						<div className="p-6">
							<div className="flex items-center gap-3 mb-4">
								<div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30">
									<AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
								</div>
								<h3 className="text-lg font-semibold" data-testid="confirm-restore-title">
									{content.confirmRestoreTitle}
								</h3>
							</div>
							<p className="text-sm text-muted-foreground mb-6">{content.confirmRestoreMessage}</p>
							<div className="flex justify-end gap-3">
								<Button
									variant="outline"
									size="sm"
									onClick={handleCancelConfirm}
									disabled={restoring}
									data-testid="confirm-restore-cancel"
								>
									{content.confirmRestoreCancel}
								</Button>
								<Button
									size="sm"
									onClick={handleConfirmRestore}
									disabled={restoring}
									data-testid="confirm-restore-confirm"
								>
									{restoring ? content.restoring : content.confirmRestoreConfirm}
								</Button>
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
