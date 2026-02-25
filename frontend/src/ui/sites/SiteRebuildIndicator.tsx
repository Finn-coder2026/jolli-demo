import { cn } from "../../common/ClassNameUtils";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/Popover";
import { getChangeCount, needsRebuild } from "./SiteDetailUtils";
import {
	ArticleChangeItem,
	AuthChangeItem,
	BrandingChangeItem,
	ConfigChangesItem,
	FolderStructureChangeItem,
} from "./SitePendingChangeItems";
import type { SiteWithUpdate } from "jolli-common";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

const MAX_POPOVER_ARTICLES = 5;

export interface SiteRebuildIndicatorProps {
	site: SiteWithUpdate;
	rebuilding: boolean;
	hasUnsavedChanges: boolean;
	onRebuild: () => void;
	onReviewChanges?: () => void;
	buildProgress?: number | undefined;
}

export function SiteRebuildIndicator({
	site,
	rebuilding,
	hasUnsavedChanges,
	onRebuild,
	onReviewChanges,
	buildProgress,
}: SiteRebuildIndicatorProps): ReactElement {
	const content = useIntlayer("site-rebuild-indicator");
	const [open, setOpen] = useState(false);

	const hasChanges = needsRebuild(site);
	const isError = site.status === "error";
	const isBuilding = site.status === "building" || site.status === "pending";
	const changeCount = getChangeCount(site);

	const badges = useMemo(
		() => ({
			new: content.new,
			updated: content.updated,
			deleted: content.deleted,
		}),
		[content.new, content.updated, content.deleted],
	);

	if (isBuilding) {
		const progress = Number(buildProgress ?? site.metadata?.buildProgress ?? 0);
		return (
			<div className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
				<RefreshCw className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
				<div className="flex flex-col gap-1 min-w-0">
					<span
						className="text-sm font-medium text-blue-600 dark:text-blue-400"
						data-testid="build-status-label"
					>
						{content.building}
					</span>
					<div className="h-1.5 w-24 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
						<div
							className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
							style={{ width: `${Math.max(5, progress)}%` }}
						/>
					</div>
				</div>
				{progress > 0 && (
					<span
						className="text-xs text-blue-500 dark:text-blue-400 tabular-nums"
						data-testid="build-progress-percent"
					>
						{Math.round(progress)}%
					</span>
				)}
			</div>
		);
	}

	if (!hasChanges && !isError) {
		return (
			<div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-500/10 border border-green-500/20">
				<CheckCircle className="h-4 w-4 text-green-500" />
				<span className="text-sm font-medium text-green-600 dark:text-green-400" data-testid="up-to-date-label">
					{content.upToDate}
				</span>
			</div>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors",
						isError
							? "bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
							: "bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20",
					)}
					data-testid="rebuild-indicator-trigger"
				>
					{isError ? (
						<AlertCircle className="h-4 w-4 text-red-500" />
					) : (
						<AlertCircle className="h-4 w-4 text-amber-500" />
					)}
					<span
						className={cn(
							"text-sm font-medium",
							isError ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
						)}
						data-testid="trigger-status-label"
					>
						{isError ? content.buildError : content.changesAvailable}
					</span>
					{changeCount > 0 && (
						<Badge
							variant="secondary"
							className="h-5 min-w-5 px-1.5 text-xs"
							data-testid="change-count-badge"
						>
							{changeCount}
						</Badge>
					)}
				</button>
			</PopoverTrigger>

			<PopoverContent align="end" className="w-96 p-0" data-testid="rebuild-indicator-popover">
				{/* Header */}
				<div className="px-4 py-3 border-b">
					<h3 className="font-medium" data-testid="popover-header-title">
						{isError ? content.buildErrorTitle : content.pendingChangesTitle}
					</h3>
					<p className="text-sm text-muted-foreground mt-0.5" data-testid="popover-header-description">
						{isError ? content.buildErrorDescription : content.pendingChangesDescription}
					</p>
				</div>

				{/* Changes list */}
				<div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
					{/* Branding changes */}
					{site.brandingChanged && <BrandingChangeItem label={content.brandingChanged} compact />}

					{/* Folder structure changes */}
					{site.folderStructureChanged && (
						<FolderStructureChangeItem label={content.folderStructureChanged} compact />
					)}

					{/* Auth changes */}
					{site.authChange && (
						<AuthChangeItem
							headerLabel={content.authChanged}
							fromEnabled={site.authChange.from}
							toEnabled={site.authChange.to}
							enabledLabel={content.enabled}
							disabledLabel={content.disabled}
							compact
						/>
					)}

					{/* Config file changes */}
					{site.changedConfigFiles && site.changedConfigFiles.length > 0 && (
						<ConfigChangesItem
							files={site.changedConfigFiles}
							headerLabel={content.configChanges}
							compact
						/>
					)}

					{/* Article changes */}
					{site.changedArticles && site.changedArticles.length > 0 && (
						<div className="px-4 py-2">
							<div
								className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2"
								data-testid="article-changes-header"
							>
								{content.articleChanges} ({site.changedArticles.length})
							</div>
							<div className="space-y-1">
								{site.changedArticles.slice(0, MAX_POPOVER_ARTICLES).map(article => (
									<ArticleChangeItem
										key={article.id !== -1 ? article.id : article.jrn}
										title={article.title}
										changeType={article.changeType}
										contentType={article.contentType}
										badges={badges}
										compact
										docType={article.docType}
									/>
								))}
								{site.changedArticles.length > MAX_POPOVER_ARTICLES && (
									<div className="text-xs text-muted-foreground pl-5" data-testid="and-more-text">
										{content.andMore({ count: site.changedArticles.length - MAX_POPOVER_ARTICLES })}
									</div>
								)}
							</div>
						</div>
					)}

					{/* Build error details */}
					{isError && site.metadata?.lastBuildError && (
						<div className="px-4 py-2 bg-red-50 dark:bg-red-950/20" data-testid="error-details-section">
							<div
								className="text-xs font-medium text-red-600 dark:text-red-400 mb-1"
								data-testid="error-details-label"
							>
								{content.errorDetails}
							</div>
							<p
								className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap"
								data-testid="error-details-message"
							>
								{site.metadata.lastBuildError}
							</p>
						</div>
					)}
				</div>

				{/* Footer with rebuild button and review link */}
				<div className="px-4 py-3 border-t bg-muted/30 space-y-2">
					<Button
						onClick={() => {
							setOpen(false);
							onRebuild();
						}}
						disabled={rebuilding || hasUnsavedChanges}
						className="w-full"
						data-testid="rebuild-button"
					>
						<RefreshCw className={cn("h-4 w-4 mr-2", rebuilding && "animate-spin")} />
						{hasUnsavedChanges
							? content.savingChanges
							: rebuilding
								? content.rebuilding
								: content.rebuildNow}
					</Button>
					{onReviewChanges && changeCount > 0 && (
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								onReviewChanges();
							}}
							className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
							data-testid="review-all-link"
						>
							{content.reviewAll}
						</button>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
