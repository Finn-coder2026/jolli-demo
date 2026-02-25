/**
 * OnboardingJobsPanel - Right panel showing jobs in the onboarding dialog.
 *
 * Displays a list of running, queued, completed, and failed jobs with
 * a summary header showing counts.
 */

import { OnboardingJobItem } from "./OnboardingJobItem";
import type { OnboardingJob } from "jolli-common";
import { Minus } from "lucide-react";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Props for OnboardingJobsPanel.
 */
export interface OnboardingJobsPanelProps {
	/** List of jobs to display */
	jobs: Array<OnboardingJob>;
	/** Called when the minimize button is clicked */
	onMinimize?: (() => void) | undefined;
}

export function OnboardingJobsPanel({ jobs, onMinimize }: OnboardingJobsPanelProps): ReactElement {
	const content = useIntlayer("onboarding");

	// Calculate job counts for the header summary
	const { runningCount, queuedCount } = useMemo(() => {
		let running = 0;
		let queued = 0;

		for (const job of jobs) {
			if (job.status === "running") {
				running++;
			} else if (job.status === "queued") {
				queued++;
			}
		}

		return { runningCount: running, queuedCount: queued };
	}, [jobs]);

	/**
	 * Build the summary text showing active job counts.
	 */
	function getSummaryText(): string {
		const parts: Array<string> = [];

		if (runningCount > 0) {
			parts.push(`${runningCount} ${content.jobsRunning.value}`);
		}

		if (queuedCount > 0) {
			parts.push(`${queuedCount} ${content.jobsQueued.value}`);
		}

		return parts.join(", ");
	}

	const summaryText = getSummaryText();

	return (
		<div className="flex flex-col h-full" data-testid="onboarding-jobs-panel">
			{/* Header */}
			<div className="p-4 border-b flex items-start justify-between">
				<div>
					<h2 className="font-semibold">{content.jobsPanelTitle.value}</h2>
					{summaryText && (
						<p className="text-sm text-muted-foreground mt-0.5" data-testid="jobs-summary">
							{summaryText}
						</p>
					)}
				</div>
				{onMinimize && (
					<button
						type="button"
						onClick={onMinimize}
						className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors -mt-1 -mr-1"
						title={content.minimizePanel.value}
						data-testid="minimize-jobs-panel-button"
					>
						<Minus className="h-4 w-4 text-muted-foreground" />
					</button>
				)}
			</div>

			{/* Jobs list */}
			<div className="flex-1 overflow-y-auto p-4 space-y-3">
				{jobs.length === 0 ? (
					<p className="text-sm text-muted-foreground text-center py-8" data-testid="no-jobs-message">
						{content.noJobs.value}
					</p>
				) : (
					jobs.map(job => <OnboardingJobItem key={job.id} job={job} />)
				)}
			</div>
		</div>
	);
}
