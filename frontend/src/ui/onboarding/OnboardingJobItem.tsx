/**
 * OnboardingJobItem - Individual job row in the onboarding jobs panel.
 *
 * Displays a job with icon, title, subtitle, status badge, and progress bar.
 */

import type { OnboardingJob, OnboardingJobIcon, OnboardingJobStatus } from "jolli-common";
import { FileText, GitBranch, Search, Upload } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Props for OnboardingJobItem.
 */
export interface OnboardingJobItemProps {
	/** Job data to display */
	job: OnboardingJob;
}

/**
 * Get the appropriate icon component for a job.
 */
function getJobIcon(icon: OnboardingJobIcon | undefined): ReactElement {
	const iconClass = "h-4 w-4 shrink-0";

	switch (icon) {
		case "document":
			return <FileText className={iconClass} data-testid="job-icon-document" />;
		case "sync":
			return <GitBranch className={iconClass} data-testid="job-icon-sync" />;
		case "analysis":
			return <Search className={iconClass} data-testid="job-icon-analysis" />;
		case "import":
			return <Upload className={iconClass} data-testid="job-icon-import" />;
		default:
			return <FileText className={iconClass} data-testid="job-icon-default" />;
	}
}

/**
 * Style mappings for different job statuses.
 */
const statusStyles: Record<OnboardingJobStatus, string> = {
	running: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
	queued: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
	completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
	failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export function OnboardingJobItem({ job }: OnboardingJobItemProps): ReactElement {
	const content = useIntlayer("onboarding");

	/** Get the localized status label. */
	function getStatusLabel(status: OnboardingJobStatus): string {
		const labels: Record<OnboardingJobStatus, string> = {
			running: content.jobStatusRunning.value,
			queued: content.jobStatusQueued.value,
			completed: content.jobStatusCompleted.value,
			failed: content.jobStatusFailed.value,
		};
		return labels[status];
	}

	return (
		<div
			className="flex flex-col gap-2 p-3 rounded-lg border bg-card"
			data-testid={`onboarding-job-item-${job.id}`}
		>
			<div className="flex items-start gap-3">
				{/* Icon */}
				<div className="mt-0.5 text-muted-foreground">{getJobIcon(job.icon)}</div>

				{/* Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between gap-2">
						{/* Title */}
						<span className="font-medium text-sm truncate" data-testid="job-title">
							{job.title}
						</span>

						{/* Status badge */}
						<span
							className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${statusStyles[job.status]}`}
							data-testid="job-status-badge"
						>
							{getStatusLabel(job.status)}
						</span>
					</div>

					{/* Subtitle */}
					{job.subtitle && (
						<p className="text-xs text-muted-foreground mt-0.5 truncate" data-testid="job-subtitle">
							{job.subtitle}
						</p>
					)}
				</div>
			</div>

			{/* Progress bar for running jobs */}
			{job.status === "running" && job.progress !== undefined && (
				<div className="flex items-center gap-2">
					<div
						className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"
						data-testid="job-progress-container"
					>
						<div
							className="h-full bg-blue-500 rounded-full transition-all duration-300"
							style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
							data-testid="job-progress-bar"
						/>
					</div>
					<span className="text-xs text-muted-foreground shrink-0" data-testid="job-progress-text">
						{Math.round(job.progress)}%
					</span>
				</div>
			)}
		</div>
	);
}
