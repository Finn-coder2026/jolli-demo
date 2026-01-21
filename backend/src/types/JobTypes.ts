import { z } from "zod";

/**
 * Zod schema for job completion link types
 */
export const JobCompletionLinkTypeSchema = z.enum([
	"articles-tab",
	"sites-tab",
	"integrations-tab",
	"article",
	"docsite",
	"github-repo",
]);

/**
 * Zod schema for localized job completion information
 */
export const LocalizedCompletionInfoSchema = z.object({
	messageKey: z.string().min(1),
	context: z.record(z.unknown()).optional(),
	linkType: JobCompletionLinkTypeSchema.optional(),
	articleJrn: z.string().optional(),
	docsiteId: z.number().int().positive().optional(),
	orgName: z.string().optional(),
	repoName: z.string().optional(),
	containerType: z.enum(["org", "user"]).optional(),
});

/**
 * Zod schema for job completion information (legacy - uses plain message string)
 * @deprecated Use LocalizedCompletionInfoSchema for new jobs
 */
export const JobCompletionInfoSchema = z.object({
	message: z.string().min(1),
	linkType: JobCompletionLinkTypeSchema.optional(),
	articleJrn: z.string().optional(),
	docsiteId: z.number().int().positive().optional(),
	orgName: z.string().optional(),
	repoName: z.string().optional(),
	containerType: z.enum(["org", "user"]).optional(),
});

/**
 * Union schema supporting both old and new completion info formats
 */
export const CompletionInfoSchema = z.union([LocalizedCompletionInfoSchema, JobCompletionInfoSchema]);

/**
 * Job execution status
 */
export type JobStatus = "queued" | "active" | "completed" | "failed" | "cancelled";

/**
 * Job execution priority
 */
export type JobPriority = "low" | "normal" | "high";

/**
 * Loop prevention configuration for event-triggered jobs
 *
 * This configuration helps prevent infinite loops that can occur when jobs trigger
 * other jobs through events, potentially creating circular dependencies.
 *
 * @example
 * ```typescript
 * // Prevent deep chains - max 5 levels
 * const jobDef: JobDefinition = {
 *   name: "my-job",
 *   loopPrevention: {
 *     maxChainDepth: 5,
 *     maxJobRepetitions: 2
 *   },
 *   triggerEvents: ["my-event"],
 *   // ... other properties
 * };
 * ```
 */
export interface LoopPreventionConfig {
	/**
	 * Maximum depth of job event chains (default: 10)
	 *
	 * Prevents jobs from being triggered beyond this depth in an event chain.
	 * For example, if Job A triggers Job B, which triggers Job C, the chain depth is 3.
	 * If a job would exceed this depth, it will be queued but immediately failed.
	 *
	 * @default 10
	 */
	maxChainDepth?: number;

	/**
	 * Maximum times the same job can appear in an event chain (default: 2)
	 *
	 * Prevents the same job from being triggered multiple times in a single chain.
	 * For example, if Job A triggers Job B, which triggers Job A again, that's 2 occurrences.
	 * A third occurrence would exceed the default limit and be prevented.
	 *
	 * This helps catch both direct loops (A → A) and indirect loops (A → B → A).
	 *
	 * @default 2
	 */
	maxJobRepetitions?: number;
}

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

	/**
	 * Source job ID that triggered this job via an event
	 * @internal
	 */
	sourceJobId?: string;

	/**
	 * Name of the Event that triggered this job, if the job was triggered by an event.
	 * @internal
	 */
	sourceEventName?: string;

	/**
	 * Internal flag to mark jobs that should fail immediately due to loop prevention
	 * @internal
	 */
	loopPrevented?: boolean;

	/**
	 * Reason why the job was marked for loop prevention
	 * @internal
	 */
	loopReason?: string;
}

/**
 * Job execution context provided to job handlers
 */
export interface JobContext<S = unknown> {
	/**
	 * Job execution ID
	 */
	jobId: string;

	/**
	 * Job name
	 */
	jobName: string;

	/**
	 * Emit an event that can trigger other jobs
	 */
	emitEvent<T = unknown>(eventName: string, eventData: T): Promise<void>;

	/**
	 * Log a message with optional context for localization
	 * Supports both legacy plain message format and new messageKey + context format
	 *
	 * @param messageOrKey - Plain message string (legacy) or message key for localization
	 * @param contextOrLevel - Context object for localization OR log level (for legacy signature)
	 * @param level - Log level (when using new signature with context)
	 *
	 * @example
	 * // Legacy format (still supported)
	 * context.log("Processing file: example.txt", "info");
	 *
	 * @example
	 * // New localized format
	 * context.log("processing-file", { fileName: "example.txt" }, "info");
	 */
	log(
		messageOrKey: string,
		contextOrLevel?: Record<string, unknown> | "info" | "warn" | "error",
		level?: "info" | "warn" | "error",
	): void;

	/**
	 * Update job progress/stats (stored with job execution and emits SSE event)
	 */
	updateStats(stats: S): Promise<void>;

	/**
	 * Set completion information with optional navigation link
	 * This will be displayed when the job completes successfully
	 * Supports both legacy message format and new messageKey + context format
	 */
	setCompletionInfo(info: z.infer<typeof CompletionInfoSchema>): Promise<void>;
}

/**
 * Job handler function type
 */
export type JobHandler<T = unknown, S = unknown> = (params: T, context: JobContext<S>) => Promise<void>;

/**
 * Converter function for converting from event params to params expected by a Job.
 */
export type JobEventParamsConverter<T = unknown> = (params: unknown) => T | undefined;

/**
 * Predicate which takes an event name and event params and determines whether a job should be queued for event.
 */
export type JobEventTriggerPredicate<T = unknown> = (name: string, params: T) => Promise<boolean>;

/**
 * Job definition with schema validation
 */
export interface JobDefinition<T = unknown, S = unknown> {
	/**
	 * Unique job name
	 */
	name: string;

	/**
	 * Human-readable description
	 */
	description: string;

	/**
	 * Optional display title (shown instead of name in UI)
	 */
	title?: string;

	/**
	 * Zod schema for parameter validation
	 */
	schema: z.ZodSchema<T>;

	/**
	 * Job handler function
	 */
	handler: JobHandler<T, S>;

	/**
	 * Default schedule options
	 */
	defaultOptions?: JobScheduleOptions;

	/**
	 * Events that trigger this job
	 */
	triggerEvents?: Array<string>;

	/**
	 * A converter to convert event parames to job params (for cases where there is a difference between the two).
	 */
	triggerEventParamsConverter?: JobEventParamsConverter<T>;

	/**
	 * Determine whether a job should be triggred for a given trigger event.
	 */
	shouldTriggerEvent?: JobEventTriggerPredicate<T>;

	/**
	 * Loop prevention configuration for this job
	 * Overrides global defaults if specified
	 */
	loopPrevention?: LoopPreventionConfig;

	/**
	 * Category for grouping jobs (e.g., "core", "github", etc.)
	 */
	category?: string;

	/**
	 * Whether to show this job in the dashboard when it's running
	 */
	showInDashboard?: boolean;

	/**
	 * Whether to exclude this job from statistics, history, and active jobs views
	 */
	excludeFromStats?: boolean;

	/**
	 * Whether to keep the job card visible after completion until manually dismissed
	 * Only applies when showInDashboard is true
	 */
	keepCardAfterCompletion?: boolean;

	/**
	 * Optional Zod schema for stats/progress validation
	 */
	statsSchema?: z.ZodSchema<S>;
}

/**
 * Provides a functional builder mechanism for defining a Job.
 */
export interface JobDefinitionBuilder<T = unknown, S = unknown> {
	/**
	 * Category for grouping jobs (e.g., "core", "github", etc.)
	 */
	category(category: string): JobDefinitionBuilder<T>;
	/**
	 * Unique job name
	 */
	name(name: string): JobDefinitionBuilder<T>;
	/**
	 * Human-readable description
	 */
	description(description: string): JobDefinitionBuilder<T>;
	/**
	 * Optional display title (shown instead of name in UI)
	 */
	title(title: string): JobDefinitionBuilder<T>;
	/**
	 * Zod schema for parameter validation
	 */
	schema(schema: z.ZodSchema<T>): JobDefinitionBuilder<T>;
	/**
	 * Job handler function
	 */
	handler(handler: JobHandler<T>): JobDefinitionBuilder<T>;
	/**
	 * Default schedule options
	 */
	defaultOptions(defaultOptions: JobScheduleOptions): JobDefinitionBuilder<T>;
	/**
	 * Events that trigger this job
	 */
	triggerEvents(triggerEvents: Array<string>): JobDefinitionBuilder<T>;
	/**
	 * Adds a converter function that converts between trigger event params and expecteed job params.
	 */
	triggerEventParamsConverter(converter: JobEventParamsConverter<T>): JobDefinitionBuilder<T>;
	/**
	 * Adds a should trigger event predicate.
	 */
	shouldTriggerEvent(shouldTriggerEvent: JobEventTriggerPredicate<T>): JobDefinitionBuilder<T>;
	/**
	 * Loop prevention configuration for this job
	 */
	loopPrevention(loopPrevention: LoopPreventionConfig): JobDefinitionBuilder<T>;
	/**
	 * Show this job in the UI Dashboard when it's running
	 */
	showInDashboard(): JobDefinitionBuilder<T>;
	/**
	 * Exclude this job from statistics, history, and active jobs views in the UI
	 */
	excludeFromStats(): JobDefinitionBuilder<T>;
	/**
	 * Keep the job card visible after completion until manually dismissed
	 * Only applies when showInDashboard is true
	 */
	keepCardAfterCompletion(): JobDefinitionBuilder<T>;
	/**
	 * Optional Zod schema for stats/progress validation
	 */
	statsSchema(schema: z.ZodSchema<S>): JobDefinitionBuilder<T>;
	/**
	 * Build and return the job definition from the builder info added.
	 */
	build(): JobDefinition<T>;
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
	 * Source job ID that triggered this job via an event
	 */
	sourceJobId?: string;

	/**
	 * Flag indicating this job should fail immediately due to loop prevention
	 */
	loopPrevented?: boolean;

	/**
	 * Reason why the job was marked for loop prevention
	 */
	loopReason?: string;

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
	logs: Array<JobLog>;

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
	completionInfo?: unknown;

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

export interface JobExecutionsFilter {
	name?: string;
	status?: string;
	limit?: number;
	offset?: number;
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
	 * Status message (deprecated - use messageKey instead)
	 */
	message?: string;

	/**
	 * Localization message key
	 */
	messageKey?: string;

	/**
	 * Message context variables for localization
	 */
	messageContext?: Record<string, unknown>;
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
	 * Category
	 */
	category: string;

	/**
	 * JSON schema for parameters (derived from Zod schema)
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
 * Event data for job events
 */
export interface JobEvent<T = unknown> {
	/**
	 * Event name
	 */
	name: string;

	/**
	 * Event data
	 */
	data: T;

	/**
	 * Source job ID that emitted the event
	 */
	sourceJobId?: string;

	/**
	 * Timestamp
	 */
	timestamp: Date;
}

/**
 * Job Log Data.
 * Supports both legacy plain message format and new localized format.
 */
export interface JobLog {
	/**
	 * Timestamp of the log
	 */
	timestamp: Date;
	/**
	 * Log Level
	 */
	level: string;
	/**
	 * Log message (legacy format - plain string)
	 * @deprecated Use messageKey + context for new logs
	 */
	message?: string;
	/**
	 * Message key for localization (new format)
	 */
	messageKey?: string;
	/**
	 * Context data for message interpolation (new format)
	 */
	context?: Record<string, unknown>;
}
