import { cn } from "../../common/ClassNameUtils";
import type { BuildStreamState } from "../../hooks/useBuildStream";
import { formatTimestamp } from "../../util/DateTimeUtil";
import { copyToClipboard, formatDomainUrl, getPrimarySiteDomain } from "../../util/UrlUtil";
import { getStatusBadge } from "./SiteDetailUtils";
import type { SiteWithUpdate } from "jolli-common";
import { Check, ChevronRight, Copy, ExternalLink, FileText, Lock, RefreshCw, ScrollText, Settings } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface SiteOverviewTabProps {
	docsite: SiteWithUpdate;
	/** Build stream state for real-time progress display */
	buildStream?: BuildStreamState;
	/** Callback to switch to a different tab */
	onNavigateToTab?: (tab: "content" | "settings" | "logs") => void;
}

/** Height class for preview window - matches right side stats + actions */
const PREVIEW_HEIGHT = "h-[320px]";

/**
 * Gets the build progress text from build stream or docsite metadata.
 */
function getBuildProgress(docsite: SiteWithUpdate, buildStream?: BuildStreamState): string | null {
	if (buildStream && buildStream.currentStep > 0 && buildStream.totalSteps > 0 && buildStream.currentMessage) {
		return buildStream.currentMessage;
	}
	return docsite.metadata?.buildProgress || null;
}

interface PreviewContent {
	buildInProgress: React.ReactNode;
	deploymentBuilding: React.ReactNode;
	deploymentBuildingDescription: React.ReactNode;
	previewUnavailable: React.ReactNode;
	previewRequiresAuth: React.ReactNode;
}

interface PreviewActions {
	onCopy: () => void;
	copiedUrl: boolean;
}

/**
 * Renders the site preview window based on current docsite state.
 */
function renderPreviewWindow(
	docsite: SiteWithUpdate,
	previewUrl: string | undefined,
	content: PreviewContent,
	buildStream?: BuildStreamState,
	actions?: PreviewActions,
): ReactElement | null {
	// Common container classes for preview window
	const containerClasses =
		"border border-border/60 rounded-xl overflow-hidden bg-background shadow-sm transition-shadow hover:shadow-md";

	// Show building status when site is building or pending
	if (docsite.status === "building" || docsite.status === "pending") {
		const buildProgress = getBuildProgress(docsite, buildStream);
		return (
			<div className={cn(containerClasses, `w-full ${PREVIEW_HEIGHT} flex items-center justify-center`)}>
				<div className="text-center p-6">
					<div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/50 mb-3">
						<RefreshCw className="h-6 w-6 text-blue-600 dark:text-blue-400 animate-spin" />
					</div>
					<p className="text-sm font-medium text-foreground">{content.buildInProgress}</p>
					{buildProgress && (
						<p className="text-xs text-muted-foreground mt-1.5 max-w-[200px]">{buildProgress}</p>
					)}
				</div>
			</div>
		);
	}

	if (!previewUrl) {
		// Show placeholder when no URL available
		return (
			<div className={cn(containerClasses, `w-full ${PREVIEW_HEIGHT} flex items-center justify-center`)}>
				<div className="text-center p-6">
					<div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
						<Lock className="h-6 w-6 text-muted-foreground" />
					</div>
					<p className="text-sm font-medium text-foreground">{content.previewUnavailable}</p>
				</div>
			</div>
		);
	}

	// Check if deployment is still building
	const isDeploymentBuilding = docsite.metadata?.deploymentStatus === "building";

	if (isDeploymentBuilding) {
		return (
			<div className={cn(containerClasses, `w-full ${PREVIEW_HEIGHT} flex items-center justify-center`)}>
				<div className="text-center p-6">
					<div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/50 mb-3">
						<RefreshCw className="h-6 w-6 text-blue-600 dark:text-blue-400 animate-spin" />
					</div>
					<p className="text-sm font-medium text-foreground">{content.deploymentBuilding}</p>
					<p className="text-xs text-muted-foreground mt-1.5">{content.deploymentBuildingDescription}</p>
				</div>
			</div>
		);
	}

	// Check if site has JWT authentication enabled
	const hasAuthEnabled = docsite.metadata?.jwtAuth?.enabled === true;

	if (hasAuthEnabled) {
		// Format URL for link
		const iframeSrc = formatDomainUrl(previewUrl);
		return (
			<div className={cn(containerClasses, "flex flex-col w-full")}>
				{/* Browser chrome header with URL and actions */}
				<div className="bg-muted/50 px-3 py-2 border-b border-border/60 flex items-center gap-2 flex-shrink-0">
					<div className="flex gap-1.5">
						<div className="w-2.5 h-2.5 rounded-full bg-red-400/80 dark:bg-red-500/60" />
						<div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80 dark:bg-yellow-500/60" />
						<div className="w-2.5 h-2.5 rounded-full bg-green-400/80 dark:bg-green-500/60" />
					</div>
					<div className="flex-1 flex items-center justify-center min-w-0">
						<div className="bg-background/80 border border-border/40 rounded-md px-3 py-1 text-xs text-muted-foreground truncate max-w-[280px]">
							{previewUrl}
						</div>
					</div>
					{/* Action buttons in browser chrome */}
					{actions && (
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={actions.onCopy}
								className="p-1.5 rounded-md hover:bg-background/80 transition-colors"
								data-testid="copy-url-button"
								title="Copy URL"
							>
								{actions.copiedUrl ? (
									<Check className="h-3.5 w-3.5 text-green-500" />
								) : (
									<Copy className="h-3.5 w-3.5 text-muted-foreground" />
								)}
							</button>
							<a
								href={iframeSrc}
								target="_blank"
								rel="noopener noreferrer"
								className="p-1.5 rounded-md hover:bg-background/80 transition-colors"
								data-testid="open-site-button"
								title="Open site"
							>
								<ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
							</a>
						</div>
					)}
				</div>
				{/* Auth placeholder content */}
				<div className={`w-full ${PREVIEW_HEIGHT} flex items-center justify-center`}>
					<div className="text-center p-6">
						<div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
							<Lock className="h-6 w-6 text-muted-foreground" />
						</div>
						<p className="text-sm font-medium text-foreground">{content.previewUnavailable}</p>
						<p className="text-xs text-muted-foreground mt-1.5">{content.previewRequiresAuth}</p>
					</div>
				</div>
			</div>
		);
	}

	// Format URL for iframe src
	const iframeSrc = formatDomainUrl(previewUrl);

	// Normal preview iframe with browser chrome header
	return (
		<div className={cn(containerClasses, "flex flex-col w-full")}>
			{/* Browser chrome header with integrated actions */}
			<div className="bg-muted/50 px-3 py-2 border-b border-border/60 flex items-center gap-2 flex-shrink-0">
				<div className="flex gap-1.5">
					<div className="w-2.5 h-2.5 rounded-full bg-red-400/80 dark:bg-red-500/60" />
					<div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80 dark:bg-yellow-500/60" />
					<div className="w-2.5 h-2.5 rounded-full bg-green-400/80 dark:bg-green-500/60" />
				</div>
				<div className="flex-1 flex items-center justify-center min-w-0">
					<div className="bg-background/80 border border-border/40 rounded-md px-3 py-1 text-xs text-muted-foreground truncate max-w-[280px]">
						{previewUrl}
					</div>
				</div>
				{/* Action buttons in browser chrome */}
				{actions && (
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={actions.onCopy}
							className="p-1.5 rounded-md hover:bg-background/80 transition-colors"
							data-testid="copy-url-button"
							title="Copy URL"
						>
							{actions.copiedUrl ? (
								<Check className="h-3.5 w-3.5 text-green-500" />
							) : (
								<Copy className="h-3.5 w-3.5 text-muted-foreground" />
							)}
						</button>
						<a
							href={iframeSrc}
							target="_blank"
							rel="noopener noreferrer"
							className="p-1.5 rounded-md hover:bg-background/80 transition-colors"
							data-testid="open-site-button"
							title="Open site"
						>
							<ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
						</a>
					</div>
				)}
			</div>
			<div className={`relative w-full ${PREVIEW_HEIGHT} overflow-hidden bg-white`}>
				<iframe
					src={iframeSrc}
					className="absolute top-0 left-0 bg-white"
					style={{
						width: "250%",
						height: "250%",
						transform: "scale(0.4)",
						transformOrigin: "top left",
					}}
					title="Site Preview"
					sandbox="allow-same-origin"
				/>
			</div>
		</div>
	);
}

/**
 * Stat card component for displaying a labeled metric.
 */
function StatCard({
	label,
	children,
	className,
}: {
	label: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}): ReactElement {
	return (
		<div
			className={cn(
				"p-4 bg-background border border-border/60 rounded-xl transition-colors hover:border-border",
				className,
			)}
		>
			<div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{label}</div>
			{children}
		</div>
	);
}

/**
 * Action button for quick navigation actions.
 */
function QuickActionButton({
	icon: Icon,
	label,
	onClick,
	testId,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: React.ReactNode;
	onClick: () => void;
	testId?: string;
}): ReactElement {
	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-background hover:bg-muted/50 hover:border-border transition-all text-left group"
			data-testid={testId}
		>
			<Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
			<span className="flex-1 text-sm font-medium text-foreground">{label}</span>
			<ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
		</button>
	);
}

/**
 * Site Overview Tab - Summary view with preview, stats, and quick actions.
 */
export function SiteOverviewTab({ docsite, buildStream, onNavigateToTab }: SiteOverviewTabProps): ReactElement {
	const content = useIntlayer("site-overview-tab");
	const dateTimeContent = useIntlayer("date-time");
	const [copiedUrl, setCopiedUrl] = useState(false);

	// Get the primary site URL
	const primaryUrl = getPrimarySiteDomain(docsite);

	// Get article count from metadata
	const articleCount = docsite.metadata?.articleCount ?? 0;

	async function handleCopyUrl() {
		if (!primaryUrl) {
			return;
		}
		const success = await copyToClipboard(primaryUrl);
		if (success) {
			setCopiedUrl(true);
			setTimeout(() => setCopiedUrl(false), 2000);
		}
	}

	return (
		<div className="space-y-6">
			{/* Main content grid: Preview + Stats (50-50 split, equal heights) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
				{/* Left: Preview Window */}
				<div className="flex flex-col">
					{renderPreviewWindow(
						docsite,
						primaryUrl,
						{
							buildInProgress: content.buildInProgress,
							deploymentBuilding: content.deploymentBuilding,
							deploymentBuildingDescription: content.deploymentBuildingDescription,
							previewUnavailable: content.previewUnavailable,
							previewRequiresAuth: content.previewRequiresAuth,
						},
						buildStream,
						primaryUrl && docsite.status === "active" ? { onCopy: handleCopyUrl, copiedUrl } : undefined,
					)}
				</div>

				{/* Right: Stats & Quick Actions */}
				<div className="flex flex-col space-y-5">
					{/* Stats Cards - 2x2 grid */}
					<div className="grid grid-cols-2 gap-3">
						<StatCard label={content.buildStatus}>
							{getStatusBadge(docsite.status, {
								active: content.statusActive,
								building: content.statusBuilding,
								pending: content.statusPending,
								error: content.statusError,
							})}
						</StatCard>

						<StatCard label={content.articlesCount}>
							<div className="text-2xl font-semibold text-foreground tabular-nums">{articleCount}</div>
						</StatCard>

						<StatCard label={content.lastBuilt}>
							<div className="text-sm font-medium text-foreground">
								{docsite.lastGeneratedAt
									? formatTimestamp(dateTimeContent, docsite.lastGeneratedAt)
									: "—"}
							</div>
						</StatCard>

						<StatCard label={content.created}>
							<div className="text-sm font-medium text-foreground">
								{docsite.createdAt ? formatTimestamp(dateTimeContent, docsite.createdAt) : "—"}
							</div>
						</StatCard>
					</div>

					{/* Quick Actions */}
					{onNavigateToTab && (
						<div className="space-y-3">
							<div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1">
								{content.quickActions}
							</div>
							<div className="space-y-2">
								<QuickActionButton
									icon={FileText}
									label={content.editContent}
									onClick={() => onNavigateToTab("content")}
									testId="quick-action-content"
								/>
								<QuickActionButton
									icon={Settings}
									label={content.configureSettings}
									onClick={() => onNavigateToTab("settings")}
									testId="quick-action-settings"
								/>
								<QuickActionButton
									icon={ScrollText}
									label={content.viewLogs}
									onClick={() => onNavigateToTab("logs")}
									testId="quick-action-logs"
								/>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
