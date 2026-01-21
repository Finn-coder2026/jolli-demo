/**
 * Job execution status
 */
export type JobStatus = "queued" | "active" | "completed" | "failed" | "cancelled";

/**
 * Type of navigation link for job completion
 */
export type JobCompletionLinkType =
	| "articles-tab"
	| "sites-tab"
	| "integrations-tab"
	| "article"
	| "docsite"
	| "github-repo";

/**
 * Job completion information with optional navigation link
 */
export interface JobCompletionInfo {
	/**
	 * Completion message to display
	 */
	message: string;

	/**
	 * Type of navigation link (optional)
	 */
	linkType?: JobCompletionLinkType;

	/**
	 * Article JRN (required if linkType is "article")
	 */
	articleJrn?: string;

	/**
	 * Docsite ID (required if linkType is "docsite")
	 */
	docsiteId?: number;

	/**
	 * GitHub organization or user name (required if linkType is "github-repo")
	 */
	orgName?: string;

	/**
	 * GitHub repository name (required if linkType is "github-repo")
	 */
	repoName?: string;

	/**
	 * Container type for GitHub (required if linkType is "github-repo")
	 */
	containerType?: "org" | "user";
}

/**
 * Job execution priority
 */
export type JobPriority = "low" | "normal" | "high";

/**
 * Job schedule options
 */
export interface JobScheduleOptions {
	/**
	 * Cron expression for recurring jobs (e.g., "0 0 * * *" for daily at midnight)
	 */
	cron?: string;

	/**
	 * Delay in milliseconds before starting the job
	 */
	startAfter?: number;

	/**
	 * Job priority (default: normal)
	 */
	priority?: JobPriority;

	/**
	 * Number of retry attempts on failure (default: 0)
	 */
	retryLimit?: number;

	/**
	 * Delay in milliseconds between retries (default: 0)
	 */
	retryDelay?: number;

	/**
	 * Exponential backoff for retries (default: false)
	 */
	retryBackoff?: boolean;

	/**
	 * Job expiration time in milliseconds
	 */
	expireInMs?: number;

	/**
	 * Singleton key - only one job with this key can be queued at a time
	 */
	singletonKey?: string;
}

/**
 * Job execution record
 */
export interface JobExecution {
	/**
	 * Unique execution ID
	 */
	id: string;

	/**
	 * Job name
	 */
	name: string;

	/**
	 * Optional display title (shown instead of name in UI)
	 */
	title?: string;

	/**
	 * Job parameters (JSON)
	 */
	params: unknown;

	/**
	 * Execution status
	 */
	status: JobStatus;

	/**
	 * Start time
	 */
	startedAt?: Date;

	/**
	 * Completion time
	 */
	completedAt?: Date;

	/**
	 * Error message (if failed)
	 */
	error?: string;

	/**
	 * Error stack trace (if failed)
	 */
	errorStack?: string;

	/**
	 * Log messages from execution
	 */
	logs: Array<{ timestamp: Date; level: string; message: string }>;

	/**
	 * Number of retry attempts
	 */
	retryCount: number;

	/**
	 * Job progress/stats data (JSON)
	 */
	stats?: unknown;

	/**
	 * Job completion information with optional navigation link
	 */
	completionInfo?: JobCompletionInfo;

	/**
	 * Timestamp when job was pinned (pinned jobs stay visible indefinitely)
	 */
	pinnedAt?: Date;

	/**
	 * Timestamp when job was dismissed (dismissed jobs are hidden from dashboard)
	 */
	dismissedAt?: Date;

	/**
	 * Whether the job is currently pinned (computed field)
	 */
	isPinned?: boolean;

	/**
	 * Created timestamp
	 */
	createdAt: Date;
}

/**
 * Request to queue a job
 */
export interface QueueJobRequest {
	/**
	 * Job name to queue
	 */
	name: string;

	/**
	 * Job parameters
	 */
	params: unknown;

	/**
	 * Schedule options
	 */
	options?: JobScheduleOptions;
}

/**
 * Response from queuing a job
 */
export interface QueueJobResponse {
	/**
	 * Job execution ID
	 */
	jobId: string;

	/**
	 * Job name
	 */
	name: string;

	/**
	 * Status message
	 */
	message: string;
}

/**
 * Job listing entry (available job types)
 */
export interface JobListing {
	/**
	 * Job name
	 */
	name: string;

	/**
	 * Description
	 */
	description: string;

	/**
	 * Optional display title (shown instead of name in UI)
	 */
	title?: string;

	/**
	 * Category
	 */
	category: string;

	/**
	 * JSON schema for parameters
	 */
	parameterSchema: unknown;

	/**
	 * Trigger events
	 */
	triggerEvents: Array<string>;

	/**
	 * Whether to show this job in the dashboard when it's running
	 */
	showInDashboard: boolean;

	/**
	 * Whether to exclude this job from statistics, history, and active jobs views
	 */
	excludeFromStats: boolean;

	/**
	 * Whether to keep the job card visible after completion until manually dismissed
	 */
	keepCardAfterCompletion: boolean;
}

/**
 * Job statistics
 */
export interface JobStats {
	/**
	 * Number of currently active jobs
	 */
	activeCount: number;

	/**
	 * Number of completed jobs in the configured time period
	 */
	completedCount: number;

	/**
	 * Number of failed jobs in the configured time period
	 */
	failedCount: number;

	/**
	 * Total number of retries in the configured time period
	 */
	totalRetries: number;
}

/**
 * Job event types
 */
export type JobEventType =
	| "job:started"
	| "job:completed"
	| "job:failed"
	| "job:cancelled"
	| "job:stats-updated"
	| "connected";

/**
 * Job event from SSE
 */
export interface JobEvent {
	/**
	 * Event type
	 */
	type: JobEventType;

	/**
	 * Job ID (if applicable)
	 */
	jobId?: string;

	/**
	 * Job name (if applicable)
	 */
	name?: string;

	/**
	 * Whether this job should be shown in the dashboard
	 */
	showInDashboard?: boolean;

	/**
	 * Whether to keep the job card visible after completion until manually dismissed
	 */
	keepCardAfterCompletion?: boolean;

	/**
	 * Error message (for failed events)
	 */
	error?: string;

	/**
	 * Job stats/progress data (for stats-updated events)
	 */
	stats?: unknown;

	/**
	 * Job completion information (for completed events)
	 */
	completionInfo?: JobCompletionInfo;

	/**
	 * Event timestamp
	 */
	timestamp?: string;
}

/**
 * Job history filters
 */
export interface JobHistoryFilters {
	/**
	 * Filter by job name
	 */
	name?: string;

	/**
	 * Filter by status
	 */
	status?: string;

	/**
	 * Maximum number of results
	 */
	limit?: number;

	/**
	 * Offset for pagination
	 */
	offset?: number;
}
