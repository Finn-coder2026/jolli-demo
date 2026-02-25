import { formatTimestamp } from "../../../util/DateTimeUtil";
import { formatDomainUrl } from "../../../util/UrlUtil";
import { SectionHeader } from "../SectionHeader";
import { getStatusBadge } from "../SiteDetailUtils";
import type { DocsiteStatus, SiteWithUpdate } from "jolli-common";
import { Check, Copy, ExternalLink, Globe, Info, Lock, RefreshCw } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useIntlayer } from "react-intlayer";

interface SiteInfoSectionProps {
	docsite: SiteWithUpdate;
	primaryUrl: string | null;
	copiedUrl: boolean;
	onCopyUrl: () => void;
}

export function SiteInfoSection({ docsite, primaryUrl, copiedUrl, onCopyUrl }: SiteInfoSectionProps): ReactElement {
	const content = useIntlayer("site-settings-tab");
	const dateTimeContent = useIntlayer("date-time");

	const articleCount = docsite.metadata?.articleCount ?? 0;
	const hasAuthEnabled = docsite.metadata?.jwtAuth?.enabled === true;
	const isBuilding = docsite.status === "building" || docsite.status === "pending";
	const isDeploymentBuilding = docsite.metadata?.deploymentStatus === "building";

	return (
		<section className="space-y-4" data-testid="site-info-section">
			<SectionHeader icon={Info} title={content.siteInfoTitle} description={content.siteInfoDescription} />

			<div className="border rounded-lg overflow-hidden">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
					<div className="p-4 border-r border-b lg:border-b-0">
						<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
							{content.previewLabel}
						</div>
						<div className="border border-border/60 rounded-lg overflow-hidden bg-background">
							{primaryUrl && docsite.status === "active" && !isDeploymentBuilding && (
								<PreviewBrowserChrome
									primaryUrl={primaryUrl}
									copiedUrl={copiedUrl}
									onCopyUrl={onCopyUrl}
									copyUrlTitle={content.copyUrl.value}
									openSiteTitle={content.openSite.value}
								/>
							)}
							<PreviewContent
								primaryUrl={primaryUrl}
								status={docsite.status}
								isBuilding={isBuilding}
								isDeploymentBuilding={isDeploymentBuilding}
								hasAuthEnabled={hasAuthEnabled}
							/>
						</div>
					</div>

					<div className="p-4">
						<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
							{content.statsLabel}
						</div>
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<span className="text-sm text-muted-foreground">{content.statusLabel}</span>
								{getStatusBadge(docsite.status, {
									active: content.statusActive,
									building: content.statusBuilding,
									pending: content.statusPending,
									error: content.statusError,
								})}
							</div>
							<div className="flex items-center justify-between">
								<span className="text-sm text-muted-foreground">{content.articlesLabel}</span>
								<span className="text-sm font-medium">{articleCount}</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-sm text-muted-foreground">{content.lastBuiltLabel}</span>
								<span className="text-sm">
									{docsite.lastGeneratedAt
										? formatTimestamp(dateTimeContent, docsite.lastGeneratedAt)
										: "\u2014"}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-sm text-muted-foreground">{content.createdLabel}</span>
								<span className="text-sm">
									{docsite.createdAt ? formatTimestamp(dateTimeContent, docsite.createdAt) : "\u2014"}
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

interface PreviewBrowserChromeProps {
	primaryUrl: string;
	copiedUrl: boolean;
	onCopyUrl: () => void;
	copyUrlTitle: string;
	openSiteTitle: string;
}

function PreviewBrowserChrome({
	primaryUrl,
	copiedUrl,
	onCopyUrl,
	copyUrlTitle,
	openSiteTitle,
}: PreviewBrowserChromeProps): ReactElement {
	return (
		<div className="bg-muted/50 px-2 py-1.5 border-b border-border/60 flex items-center gap-2">
			<div className="flex gap-1">
				<div className="w-2 h-2 rounded-full bg-red-400/80" />
				<div className="w-2 h-2 rounded-full bg-yellow-400/80" />
				<div className="w-2 h-2 rounded-full bg-green-400/80" />
			</div>
			<div className="flex-1 text-center">
				<span className="text-[10px] text-muted-foreground truncate block px-2">{primaryUrl}</span>
			</div>
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={onCopyUrl}
					className="p-1 rounded hover:bg-background/80 transition-colors"
					title={copyUrlTitle}
				>
					{copiedUrl ? (
						<Check className="h-3 w-3 text-green-500" />
					) : (
						<Copy className="h-3 w-3 text-muted-foreground" />
					)}
				</button>
				<a
					href={formatDomainUrl(primaryUrl)}
					target="_blank"
					rel="noopener noreferrer"
					className="p-1 rounded hover:bg-background/80 transition-colors"
					title={openSiteTitle}
				>
					<ExternalLink className="h-3 w-3 text-muted-foreground" />
				</a>
			</div>
		</div>
	);
}

interface PreviewContentProps {
	primaryUrl: string | null;
	status: DocsiteStatus;
	isBuilding: boolean;
	isDeploymentBuilding: boolean | undefined;
	hasAuthEnabled: boolean;
}

function PreviewFrame({ children, className }: { children: ReactNode; className?: string }): ReactElement {
	return (
		<div className="h-32 bg-background relative overflow-hidden">
			<div className={`h-full flex items-center justify-center ${className ?? ""}`}>{children}</div>
		</div>
	);
}

function PreviewContent({
	primaryUrl,
	status,
	isBuilding,
	isDeploymentBuilding,
	hasAuthEnabled,
}: PreviewContentProps): ReactElement {
	if (isBuilding || isDeploymentBuilding) {
		return (
			<PreviewFrame>
				<RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
			</PreviewFrame>
		);
	}

	if (hasAuthEnabled) {
		return (
			<PreviewFrame>
				<Lock className="h-5 w-5 text-muted-foreground/50" />
			</PreviewFrame>
		);
	}

	if (primaryUrl && status === "active") {
		return (
			<PreviewFrame className="bg-muted/20">
				<div className="flex flex-col items-center gap-1.5">
					<Globe className="h-5 w-5 text-muted-foreground/50" />
					<a
						href={formatDomainUrl(primaryUrl)}
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs text-primary hover:underline"
					>
						{primaryUrl}
					</a>
				</div>
			</PreviewFrame>
		);
	}

	return (
		<PreviewFrame>
			<Globe className="h-5 w-5 text-muted-foreground/50" />
		</PreviewFrame>
	);
}
