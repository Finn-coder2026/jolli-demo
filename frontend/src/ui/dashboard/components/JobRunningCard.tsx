import { useNavigation } from "../../../contexts/NavigationContext";
import { getCompletionMessage, useJobTitle } from "../../../util/JobLocalization";
import { JobStatsDisplay } from "./JobStatsDisplay";
import type { JobCompletionInfo, JobExecution } from "jolli-common";
import { CheckCircle2, Clock, ExternalLink, Loader2, Pin, X, XCircle } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface JobRunningCardProps {
	job: JobExecution;
	onDismiss?: (jobId: string) => void;
	isPinned?: boolean;
	onPinToggle?: (jobId: string) => void;
}

/**
 * Card showing a currently running job on the dashboard
 */
export function JobRunningCard({ job, onDismiss, isPinned, onPinToggle }: JobRunningCardProps): ReactElement {
	const content = useIntlayer("dashboard");
	const jobsContent = useIntlayer("jobs");
	const { navigate } = useNavigation();
	const isCompleted = job.status === "completed" || job.status === "failed" || job.status === "cancelled";

	const displayTitleFromContent = useJobTitle(jobsContent, job.name);
	const displayTitle = job.title || displayTitleFromContent;

	const formatDuration = (startedAt?: Date): string => {
		if (!startedAt) {
			return content.justStarted.value;
		}
		const start = new Date(startedAt);
		const now = new Date();
		const seconds = Math.floor((now.getTime() - start.getTime()) / 1000);

		if (seconds < 60) {
			return `${seconds}s`;
		}
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) {
			return `${minutes}m`;
		}
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		return `${hours}h ${remainingMinutes}m`;
	};

	const getStatusIcon = () => {
		if (job.status === "completed") {
			return <CheckCircle2 className="w-5 h-5 text-green-500" />;
		}
		if (job.status === "failed" || job.status === "cancelled") {
			return <XCircle className="w-5 h-5 text-red-500" />;
		}
		return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
	};

	const getBorderColor = () => {
		if (job.status === "completed") {
			return "border-green-200 dark:border-green-800";
		}
		if (job.status === "failed" || job.status === "cancelled") {
			return "border-red-200 dark:border-red-800";
		}
		return "border-blue-200 dark:border-blue-800";
	};

	const getCompletionLink = (completionInfo: JobCompletionInfo): string | null => {
		switch (completionInfo.linkType) {
			case "articles-tab":
				return "/articles";
			case "sites-tab":
				return "/docsites";
			case "integrations-tab":
				return "/integrations";
			case "article":
				return completionInfo.articleJrn ? `/articles/${encodeURIComponent(completionInfo.articleJrn)}` : null;
			case "docsite":
				return completionInfo.docsiteId ? `/docsites/${completionInfo.docsiteId}` : null;
			case "github-repo":
				if (completionInfo.containerType && completionInfo.orgName) {
					return `/integrations/github/${completionInfo.containerType}/${encodeURIComponent(completionInfo.orgName)}`;
				}
				return null;
			default:
				return null;
		}
	};

	const handleCompletionLinkClick = () => {
		if (job.completionInfo) {
			const link = getCompletionLink(job.completionInfo);
			if (link) {
				navigate(link);
			}
		}
	};

	return (
		<div
			className={`bg-card rounded-lg p-4 border ${getBorderColor()} relative`}
			data-testid={`job-card-${job.id}`}
		>
			<div className="flex items-center gap-3">
				<div data-testid="job-status">{getStatusIcon()}</div>
				<div className="flex-1 min-w-0">
					<div className="font-medium truncate" data-testid="job-primary-text">
						{displayTitle}
					</div>
					{job.title ? (
						<div className="text-sm text-muted-foreground truncate" data-testid="job-secondary-text">
							{job.name}
						</div>
					) : null}
					<div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
						<Clock className="w-3 h-3" />
						<span>{formatDuration(job.startedAt)}</span>
					</div>
					{job.stats ? <JobStatsDisplay stats={job.stats} /> : null}
					{job.completionInfo && job.status === "completed" ? (
						<div className="mt-2">
							<div className="text-sm text-muted-foreground">
								{getCompletionMessage(jobsContent, job.name, job.completionInfo)}
							</div>
							{job.completionInfo.linkType && getCompletionLink(job.completionInfo) ? (
								<button
									type="button"
									onClick={handleCompletionLinkClick}
									className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-1"
								>
									<span>{content.view}</span>
									<ExternalLink className="w-3 h-3" />
								</button>
							) : null}
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-1">
					{isCompleted && onPinToggle ? (
						<button
							type="button"
							onClick={() => onPinToggle(job.id)}
							className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
							aria-label={isPinned ? content.unpinJob.value : content.pinJob.value}
						>
							<Pin
								className={`w-4 h-4 ${isPinned ? "text-blue-600 dark:text-blue-400 fill-current" : "text-muted-foreground hover:text-foreground"}`}
							/>
						</button>
					) : null}
					{isCompleted && onDismiss ? (
						<button
							type="button"
							onClick={() => onDismiss(job.id)}
							className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
							aria-label={content.dismissJob.value}
						>
							<X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}
