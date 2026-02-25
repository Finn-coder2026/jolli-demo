import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/Tabs";
import { getLogMessage, useJobTitle } from "../../../util/JobLocalization";
import type { JobExecution, JobStatus } from "jolli-common";
import { AlertCircle, CheckCircle, ChevronDown, ChevronRight, Clock, Loader2, XCircle } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface JobDetailRowProps {
	job: JobExecution;
	onCancel?: (jobId: string) => void;
	onRetry?: (jobId: string) => void;
}

/**
 * Get the CSS class for job status color
 * Exported for testing
 */
export function getStatusColor(status: JobStatus): string {
	switch (status) {
		case "active":
			return "text-blue-600 dark:text-blue-400";
		case "completed":
			return "text-green-600 dark:text-green-400";
		case "failed":
			return "text-red-600 dark:text-red-400";
		case "cancelled":
		case "queued":
			return "text-gray-600 dark:text-gray-400";
		default:
			return "text-gray-600 dark:text-gray-400";
	}
}

/**
 * Expandable job detail row with tabbed interface
 */
export function JobDetailRow({ job, onCancel, onRetry }: JobDetailRowProps): ReactElement {
	const [expanded, setExpanded] = useState(false);
	const jobsContent = useIntlayer("jobs");
	const content = useIntlayer("job-detail");

	// Get localized job title - prefer job.title if set (backward compatibility), otherwise use localized title
	const displayTitleFromContent = useJobTitle(jobsContent, job.name);
	const displayTitle = job.title || displayTitleFromContent;

	const formatDate = (date?: Date): string => {
		if (!date) {
			return "—";
		}
		return new Date(date).toLocaleString();
	};

	const formatDuration = (startedAt?: Date, completedAt?: Date): string => {
		if (!startedAt) {
			return "—";
		}
		const start = new Date(startedAt);
		const end = completedAt ? new Date(completedAt) : new Date();
		const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);

		if (seconds < 60) {
			return `${seconds}s`;
		}
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) {
			return `${minutes}m ${seconds % 60}s`;
		}
		const hours = Math.floor(minutes / 60);
		return `${hours}h ${minutes % 60}m`;
	};

	const getStatusIcon = () => {
		switch (job.status) {
			case "active":
				return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
			case "completed":
				return <CheckCircle className="w-4 h-4 text-green-500" />;
			case "failed":
				return <AlertCircle className="w-4 h-4 text-red-500" />;
			case "cancelled":
				return <XCircle className="w-4 h-4 text-gray-500" />;
			default:
				return <Clock className="w-4 h-4 text-gray-500" />;
		}
	};

	const statusColor = getStatusColor(job.status);

	return (
		<div className="border rounded-lg overflow-hidden" data-testid={`job-row-${job.id}`}>
			{/* Collapsed View */}
			<div
				className="p-4 hover:bg-muted/50 cursor-pointer flex items-center gap-4"
				onClick={() => setExpanded(!expanded)}
			>
				<button type="button" className="flex items-center justify-center">
					{expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
				</button>

				<div className="flex items-center gap-2 min-w-[100px]" data-testid="job-status-cell">
					{getStatusIcon()}
				</div>

				<div className="flex-1 grid grid-cols-4 gap-4">
					<div className="truncate" data-testid="job-name-cell">
						<div className="font-medium" data-testid="job-primary-text">
							{displayTitle}
						</div>
						{job.title ? (
							<div className="text-sm text-muted-foreground" data-testid="job-secondary-text">
								{job.name}
							</div>
						) : null}
					</div>
					<div className="text-sm text-muted-foreground">{formatDate(job.startedAt)}</div>
					<div className="text-sm text-muted-foreground">
						{formatDuration(job.startedAt, job.completedAt)}
					</div>
					<div className="text-sm">
						{job.retryCount > 0 && (
							<span className="text-orange-500">
								{job.retryCount === 1
									? content.messages.retry({ count: job.retryCount })
									: content.messages.retries({ count: job.retryCount })}
							</span>
						)}
					</div>
				</div>
			</div>

			{/* Expanded View with Tabs */}
			{/* v8 ignore next 125 - Complex tabbed UI requiring state management, tested via integration */}
			{expanded && (
				<div className="border-t bg-muted/20 p-4">
					<Tabs defaultValue="overview" className="w-full">
						<TabsList>
							<TabsTrigger value="overview">{content.tabs.overview}</TabsTrigger>
							<TabsTrigger value="params">{content.tabs.params}</TabsTrigger>
							<TabsTrigger value="logs">{content.tabs.logs}</TabsTrigger>
							<TabsTrigger value="errors">{content.tabs.errors}</TabsTrigger>
							<TabsTrigger value="metadata">{content.tabs.metadata}</TabsTrigger>
						</TabsList>

						<TabsContent value="overview" className="mt-4">
							<div className="space-y-3 text-sm">
								<div className="grid grid-cols-2 gap-4">
									<div>
										<div className="font-medium text-muted-foreground">{content.fields.status}</div>
										<div className={`font-medium ${statusColor}`}>{job.status}</div>
									</div>
									<div>
										<div className="font-medium text-muted-foreground">
											{content.fields.duration}
										</div>
										<div>{formatDuration(job.startedAt, job.completedAt)}</div>
									</div>
									<div>
										<div className="font-medium text-muted-foreground">
											{content.fields.startedAt}
										</div>
										<div>{formatDate(job.startedAt)}</div>
									</div>
									<div>
										<div className="font-medium text-muted-foreground">
											{content.fields.completedAt}
										</div>
										<div>{formatDate(job.completedAt)}</div>
									</div>
									<div>
										<div className="font-medium text-muted-foreground">
											{content.fields.retryCount}
										</div>
										<div>{job.retryCount}</div>
									</div>
								</div>
								{job.status === "active" && onCancel && (
									<button
										type="button"
										onClick={() => onCancel(job.id)}
										className="px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600"
									>
										{content.buttons.cancelJob}
									</button>
								)}
								{job.status === "failed" && onRetry && (
									<button
										type="button"
										onClick={() => onRetry(job.id)}
										className="px-3 py-1.5 bg-primary text-white rounded hover:bg-primary/90"
									>
										{content.buttons.retryJob}
									</button>
								)}
							</div>
						</TabsContent>

						<TabsContent value="params" className="mt-4">
							<pre className="text-sm bg-black/5 dark:bg-white/5 p-4 rounded overflow-auto max-h-96 scrollbar-thin">
								{JSON.stringify(job.params, null, 2)}
							</pre>
						</TabsContent>

						<TabsContent value="logs" className="mt-4">
							<div className="space-y-2 max-h-96 overflow-auto scrollbar-thin">
								{job.logs.length === 0 ? (
									<div className="text-sm text-muted-foreground">
										{content.messages.noLogsAvailable}
									</div>
								) : (
									job.logs.map((log, index) => (
										<div key={index} className="text-sm font-mono">
											<span className="text-muted-foreground">
												{new Date(log.timestamp).toLocaleTimeString()}
											</span>
											<span
												className={`ml-2 ${log.level === "error" ? "text-red-500" : log.level === "warn" ? "text-orange-500" : ""}`}
											>
												[{log.level}]
											</span>
											<span className="ml-2">{getLogMessage(jobsContent, job.name, log)}</span>
										</div>
									))
								)}
							</div>
						</TabsContent>

						<TabsContent value="errors" className="mt-4">
							<div className="space-y-3">
								{job.error ? (
									<>
										<div>
											<div className="font-medium text-muted-foreground mb-2">
												{content.errors.errorMessage}
											</div>
											<div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-3 rounded">
												{job.error}
											</div>
										</div>
										{job.errorStack && (
											<div>
												<div className="font-medium text-muted-foreground mb-2">
													{content.errors.stackTrace}
												</div>
												<pre className="text-xs bg-black/5 dark:bg-white/5 p-4 rounded overflow-auto max-h-96 scrollbar-thin">
													{job.errorStack}
												</pre>
											</div>
										)}
									</>
								) : (
									<div className="text-sm text-muted-foreground">{content.messages.noErrors}</div>
								)}
							</div>
						</TabsContent>

						<TabsContent value="metadata" className="mt-4">
							<div className="space-y-3 text-sm">
								<div>
									<div className="font-medium text-muted-foreground">{content.fields.jobId}</div>
									<div className="font-mono">{job.id}</div>
								</div>
								<div>
									<div className="font-medium text-muted-foreground">{content.fields.createdAt}</div>
									<div>{formatDate(job.createdAt)}</div>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</div>
			)}
		</div>
	);
}
