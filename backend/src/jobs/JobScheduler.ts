import type { JobDao } from "../dao/JobDao.js";
import type {
	JobContext,
	JobDefinition,
	JobEvent,
	JobExecution,
	JobListing,
	JobLog,
	JobPriority,
	JobScheduleOptions,
	LoopPreventionConfig,
	QueueJobRequest,
	QueueJobResponse,
} from "../types/JobTypes";
import { CompletionInfoSchema } from "../types/JobTypes.js";
import { getLog } from "../util/Logger";
import { getPgBossPostgresConfiguration } from "../util/Sequelize";
import { createJobEventEmitter, type JobEventEmitter } from "./JobEventEmitter.js";
import PgBoss from "pg-boss";
import { zodToJsonSchema } from "zod-to-json-schema";

const log = getLog(import.meta);

/**
 * Job scheduler using pg-boss
 */
export interface JobScheduler {
	/**
	 * Register a job definition
	 */
	registerJob<T = unknown>(definition: JobDefinition<T>): void;

	/**
	 * Queue a job for execution
	 */
	queueJob(request: QueueJobRequest): Promise<QueueJobResponse>;

	/**
	 * Get all registered job listings
	 */
	listJobs(): Array<JobListing>;

	/**
	 * Get job execution history
	 */
	getJobHistory(filters?: {
		name?: string;
		status?: string;
		limit?: number;
		offset?: number;
	}): Promise<Array<JobExecution>>;

	/**
	 * Get job execution by ID
	 */
	getJobExecution(jobId: string): Promise<JobExecution | undefined>;

	/**
	 * Cancel a running job
	 */
	cancelJob(jobId: string): Promise<void>;

	/**
	 * Retry a failed job
	 */
	retryJob(jobId: string): Promise<QueueJobResponse>;

	/**
	 * Start the job scheduler
	 */
	start(): Promise<void>;

	/**
	 * Stop the job scheduler
	 */
	stop(): Promise<void>;

	/**
	 * Get the event emitter for job chaining
	 */
	getEventEmitter(): JobEventEmitter;
}

/**
 * Configuration for pg-boss connection.
 * Either use connectionString OR let the scheduler use default env-based config.
 */
export interface PgBossConnectionConfig {
	/**
	 * PostgreSQL connection string for pg-boss.
	 * If not provided, uses the default configuration from environment.
	 */
	connectionString?: string;

	/**
	 * Whether to use SSL for the connection.
	 */
	ssl?: boolean;
}

/**
 * Configuration for job scheduler
 */
export interface JobSchedulerConfig {
	/**
	 * Job DAO for storing execution metadata
	 */
	jobDao: JobDao;

	/**
	 * Schema name for pg-boss (default: "pgboss")
	 */
	schema?: string;

	/**
	 * Archive completed jobs after this duration in hours (default: 24)
	 */
	archiveCompletedAfterHours?: number;

	/**
	 * Delete archived jobs after this duration in days (default: 7)
	 */
	deleteArchivedAfterDays?: number;

	/**
	 * Optional pg-boss connection configuration.
	 * If not provided, uses the default configuration from environment.
	 */
	connection?: PgBossConnectionConfig;

	/**
	 * Whether to run workers that process jobs.
	 * - true (default): Workers run inline, processing jobs in this process
	 * - false: Only queue jobs, don't process them (for Vercel serverless)
	 */
	workerMode?: boolean;
}

/**
 * Create a new job scheduler
 */
export function createJobScheduler(jobsConfig: JobSchedulerConfig): JobScheduler {
	const jobDefinitions = new Map<string, JobDefinition>();
	const eventEmitter = createJobEventEmitter();
	let isStarted = false;

	// Determine worker mode (default: true for backward compatibility)
	const workerMode = jobsConfig.workerMode ?? true;

	// Get connection configuration - either from config or from environment
	let connectionString: string;
	let ssl: boolean;

	if (jobsConfig.connection?.connectionString) {
		// Use provided connection configuration
		connectionString = jobsConfig.connection.connectionString;
		ssl = jobsConfig.connection.ssl ?? false;
	} else {
		// Fall back to environment-based configuration
		const pgBossPostgresConfig = getPgBossPostgresConfiguration();
		connectionString = pgBossPostgresConfig.connectionString;
		ssl = pgBossPostgresConfig.ssl;
	}

	const pgBossConfig: PgBoss.ConstructorOptions = {
		connectionString,
		schema: jobsConfig.schema || "pgboss",
		ssl: ssl && { rejectUnauthorized: false },
	};

	const boss = new PgBoss(pgBossConfig);

	// Global defaults for loop prevention
	const DEFAULT_MAX_CHAIN_DEPTH = 10;
	const DEFAULT_MAX_JOB_REPETITIONS = 2;

	/**
	 * Result of job chain analysis
	 */
	interface JobChainAnalysis {
		chainDepth: number;
		ancestorJobNames: Array<string>;
		chainDescription: string;
	}

	/**
	 * Check if a job should be prevented due to loop detection
	 * Returns loop information including whether it should be prevented and the reason
	 */
	async function checkLoopPrevention<T = unknown>(
		sourceJobId: string | undefined,
		definition: JobDefinition<T>,
	): Promise<{ loopPrevented: boolean; loopReason: string; chainDescription: string }> {
		const chainAnalysis = await analyzeJobChain(sourceJobId);

		// Get loop prevention config (per-job or global defaults)
		const loopConfig: LoopPreventionConfig = definition.loopPrevention || {};
		const maxChainDepth = loopConfig.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
		const maxJobRepetitions = loopConfig.maxJobRepetitions ?? DEFAULT_MAX_JOB_REPETITIONS;

		// Check if limits would be exceeded
		const newDepth = chainAnalysis.chainDepth + 1;
		const jobRepetitions = chainAnalysis.ancestorJobNames.filter(name => name === definition.name).length;
		const newRepetitions = jobRepetitions + 1;

		let loopPrevented = false;
		let loopReason = "";

		// Check chain depth limit
		if (newDepth > maxChainDepth) {
			loopPrevented = true;
			loopReason = `Chain depth (${newDepth}) exceeds maximum (${maxChainDepth})`;
		}

		// Check job repetition limit
		if (newRepetitions > maxJobRepetitions) {
			loopPrevented = true;
			if (loopReason) {
				loopReason += ` and repetition count (${newRepetitions}) exceeds maximum (${maxJobRepetitions})`;
			} else {
				loopReason = `Job repetition count (${newRepetitions}) exceeds maximum (${maxJobRepetitions})`;
			}
		}

		return {
			loopPrevented,
			loopReason,
			chainDescription: chainAnalysis.chainDescription,
		};
	}

	/**
	 * Analyze a job chain by walking backward through sourceJobId links
	 * Returns chain depth, ancestor job names, and a description for logging
	 */
	async function analyzeJobChain(sourceJobId: string | undefined): Promise<JobChainAnalysis> {
		const ancestorJobNames: Array<string> = [];
		let chainDepth = 0;
		let currentJobId = sourceJobId;

		// Walk backward through the chain
		while (currentJobId) {
			const job = await jobsConfig.jobDao.getJobExecution(currentJobId);

			if (!job) {
				// Job not found in database - chain ends here
				break;
			}

			chainDepth++;
			ancestorJobNames.push(job.name);

			// Move to the next ancestor
			currentJobId = job.sourceJobId;

			// Safety check to prevent infinite loops in case of data corruption
			if (chainDepth > 100) {
				log.warn("Chain analysis exceeded 100 levels, stopping to prevent infinite loop");
				break;
			}
		}

		// Create a description of the chain for logging
		const chainDescription = ancestorJobNames.length > 0 ? ancestorJobNames.reverse().join(" → ") : "(no chain)";

		return {
			chainDepth,
			ancestorJobNames,
			chainDescription,
		};
	}

	/**
	 * Create job context for a job execution
	 */
	function createJobContext<S = unknown>(jobId: string, jobName: string): JobContext<S> {
		const definition = jobDefinitions.get(jobName);
		return {
			jobId,
			jobName,
			emitEvent: <T = unknown>(eventName: string, eventData: T): Promise<void> => {
				eventEmitter.emit(eventName, eventData, jobId);
				return Promise.resolve();
			},
			log: (
				messageOrKey: string,
				contextOrLevel?: Record<string, unknown> | "info" | "warn" | "error",
				level?: "info" | "warn" | "error",
			): void => {
				// Determine which signature is being used
				const isNewSignature =
					contextOrLevel !== undefined &&
					typeof contextOrLevel === "object" &&
					!Array.isArray(contextOrLevel);

				let logEntry:
					| {
							timestamp: Date;
							level: string;
							messageKey: string;
							context: Record<string, unknown>;
					  }
					| {
							timestamp: Date;
							level: string;
							message: string;
					  };

				if (isNewSignature) {
					// New signature: messageKey, context, level
					logEntry = {
						timestamp: new Date(),
						level: level || "info",
						messageKey: messageOrKey,
						context: contextOrLevel as Record<string, unknown>,
					};
				} else {
					// Legacy signature: message, level
					logEntry = {
						timestamp: new Date(),
						level: (contextOrLevel as "info" | "warn" | "error" | undefined) || "info",
						message: messageOrKey,
					};
				}

				// Update job execution logs in database
				jobsConfig.jobDao.appendLog(jobId, logEntry).catch(err => log.error(err, "Failed to append job log."));
			},
			updateStats: async (stats: S): Promise<void> => {
				// Validate stats if schema is provided
				if (definition?.statsSchema) {
					const validationResult = definition.statsSchema.safeParse(stats);
					if (!validationResult.success) {
						throw new Error(`Invalid stats: ${validationResult.error.message}`);
					}
				}

				// Update stats in database
				await jobsConfig.jobDao.updateStats(jobId, stats);

				// Emit stats-updated event
				eventEmitter.emit("job:stats-updated", {
					jobId,
					name: jobName,
					stats,
					showInDashboard: definition?.showInDashboard,
				});
			},
			setCompletionInfo: async (info): Promise<void> => {
				// Validate completion info (supports both old and new formats)
				const validationResult = CompletionInfoSchema.safeParse(info);
				if (!validationResult.success) {
					throw new Error(`Invalid completion info: ${validationResult.error.message}`);
				}

				// Update completion info in database
				await jobsConfig.jobDao.updateCompletionInfo(jobId, validationResult.data);
			},
		};
	}

	/**
	 * Convert job schedule options to pg-boss send options
	 */
	function convertToPgBossOptions(jobOptions?: JobScheduleOptions): PgBoss.SendOptions {
		const options: PgBoss.SendOptions = {};
		if (!jobOptions) {
			return options;
		}

		if (jobOptions.startAfter) {
			options.startAfter = jobOptions.startAfter;
		}
		if (jobOptions.priority) {
			options.priority = jobOptions.priority === "high" ? 1 : jobOptions.priority === "low" ? -1 : 0;
		}
		if (jobOptions.retryLimit !== undefined) {
			options.retryLimit = jobOptions.retryLimit;
		}
		if (jobOptions.retryDelay !== undefined) {
			options.retryDelay = jobOptions.retryDelay;
		}
		if (jobOptions.retryBackoff !== undefined) {
			options.retryBackoff = jobOptions.retryBackoff;
		}
		if (jobOptions.expireInMs !== undefined) {
			options.expireInSeconds = Math.floor(jobOptions.expireInMs / 1000);
		}
		if (jobOptions.singletonKey) {
			options.singletonKey = jobOptions.singletonKey;
		}

		return options;
	}

	/**
	 * Schedule a cron job
	 */
	async function scheduleCronJob(
		jobName: string,
		cron: string,
		data: object,
		priority?: JobPriority,
	): Promise<QueueJobResponse> {
		const options: PgBoss.ScheduleOptions = {};
		if (priority) {
			options.priority = priority === "high" ? 1 : priority === "low" ? -1 : 0;
		}

		const jobId = await boss.schedule(jobName, cron, data, options);
		return {
			jobId: jobId ?? "scheduled",
			name: jobName,
			messageKey: "job-scheduled-with-cron",
			messageContext: { cron },
		};
	}

	/**
	 * Wrap a job handler with error handling and logging
	 */
	function wrapJobHandler(definition: JobDefinition): PgBoss.WorkHandler<object> {
		return async (jobs: Array<PgBoss.Job<object>>): Promise<void> => {
			// pg-boss can batch jobs, but we'll process them individually
			for (const job of jobs) {
				const jobId = job.id;
				const context = createJobContext(jobId, definition.name);
				try {
					context.log("job-starting", { jobName: definition.name });
					log.debug("starting job '%s' with data: %O", definition.name, job.data);

					// Check if this job was marked for loop prevention
					const execution = await jobsConfig.jobDao.getJobExecution(jobId);
					if (execution?.loopPrevented) {
						const errorMessage = `Infinite loop prevented: ${execution.loopReason || "Unknown reason"}`;
						context.log("loop-prevented", { reason: execution.loopReason || "Unknown reason" });
						log.warn(
							"Loop-prevented job %s (%s) failed immediately: %s",
							jobId,
							definition.name,
							errorMessage,
						);

						// Update job status to failed
						await jobsConfig.jobDao.updateJobStatus(
							jobId,
							"failed",
							new Date(),
							new Date(),
							errorMessage,
							undefined,
						);

						// Emit job failed event
						eventEmitter.emit("job:failed", {
							jobId,
							name: definition.name,
							error: errorMessage,
							showInDashboard: definition.showInDashboard,
							keepCardAfterCompletion: definition.keepCardAfterCompletion,
						});

						// Don't throw - just mark as failed and continue
						continue;
					}

					// Update job status to active
					await jobsConfig.jobDao.updateJobStatus(jobId, "active", new Date());
					// Emit job started event
					eventEmitter.emit("job:started", {
						jobId,
						name: definition.name,
						showInDashboard: definition.showInDashboard,
						keepCardAfterCompletion: definition.keepCardAfterCompletion,
					});
					// Execute the job handler
					await definition.handler(job.data, context);
					// Update job status to completed
					await jobsConfig.jobDao.updateJobStatus(jobId, "completed", undefined, new Date());
					context.log("job-completed", { jobName: definition.name });
					log.debug("Completed job: %s", definition.name);
					// Get job execution to retrieve completion info
					const jobExecution = await jobsConfig.jobDao.getJobExecution(jobId);
					// Emit job completed event
					eventEmitter.emit("job:completed", {
						jobId,
						name: definition.name,
						showInDashboard: definition.showInDashboard,
						keepCardAfterCompletion: definition.keepCardAfterCompletion,
						completionInfo: jobExecution?.completionInfo,
					});
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					const errorStack = error instanceof Error ? error.stack : undefined;
					context.log("job-failed", { jobName: definition.name, errorMessage });
					// Update job status to failed
					await jobsConfig.jobDao.updateJobStatus(
						jobId,
						"failed",
						undefined,
						new Date(),
						errorMessage,
						errorStack,
					);
					// Emit job failed event
					eventEmitter.emit("job:failed", {
						jobId,
						name: definition.name,
						error: errorMessage,
						showInDashboard: definition.showInDashboard,
						keepCardAfterCompletion: definition.keepCardAfterCompletion,
					});
					// Re-throw to let pg-boss handle retries
					throw error;
				}
			}
		};
	}

	const scheduler: JobScheduler = {
		registerJob,
		queueJob,
		listJobs,
		getJobHistory,
		getJobExecution,
		cancelJob,
		retryJob,
		start,
		stop,
		getEventEmitter,
	};

	/**
	 * Handle a job trigger event by checking loop prevention, converting params,
	 * checking if the event should trigger, and queueing the job.
	 */
	async function handleJobTriggerEvent<T = unknown>(
		event: JobEvent,
		definition: JobDefinition<T>,
		eventName: string,
	): Promise<void> {
		// Check for potential infinite loops
		const loopInfo = await checkLoopPrevention(event.sourceJobId, definition);
		const jobParams: T | undefined = definition.triggerEventParamsConverter
			? definition.triggerEventParamsConverter(event.data)
			: (event.data as T);

		if (!jobParams) {
			log.debug("event %s filtered out because parameters did not convert", eventName);
			return;
		}

		const shouldTrigger =
			!definition.shouldTriggerEvent || (await definition.shouldTriggerEvent(eventName, jobParams));

		if (!shouldTrigger) {
			log.debug("event %s filtered out by shouldTriggerEvent function", eventName);
			return;
		}

		// Queue the job when the event is emitted
		const queueRequest: { name: string; params: unknown; options: JobScheduleOptions } = {
			name: definition.name,
			params: jobParams,
			options: { ...definition.defaultOptions },
		};

		// Add sourceJobId and loop prevention info to options
		if (event.sourceJobId !== undefined) {
			queueRequest.options.sourceJobId = event.sourceJobId;
		}

		// Add sourcEventName to options
		queueRequest.options.sourceEventName = eventName;

		if (loopInfo.loopPrevented) {
			queueRequest.options.loopPrevented = true;
			queueRequest.options.loopReason = loopInfo.loopReason;
			log.warn(
				"Infinite loop prevented for job '%s': %s. Chain: %s",
				definition.name,
				loopInfo.loopReason,
				loopInfo.chainDescription,
			);
		}

		log.debug("queuing job for event: %O", queueRequest);
		await scheduler.queueJob(queueRequest);
	}

	/**
	 * Handle a job trigger event with fallback on error
	 */
	async function handleJobTriggerEventWithFallback<T = unknown>(
		event: JobEvent,
		definition: JobDefinition<T>,
		eventName: string,
	): Promise<void> {
		try {
			await handleJobTriggerEvent(event, definition, eventName);
		} catch (err) {
			log.error(err, "Failed to analyze job chain for %s", definition.name);
			// Fall back to queuing without loop prevention on analysis error
			const queueRequest: { name: string; params: unknown; options: JobScheduleOptions } = {
				name: definition.name,
				params: event.data,
				options: { ...definition.defaultOptions },
			};
			if (event.sourceJobId !== undefined) {
				queueRequest.options.sourceJobId = event.sourceJobId;
			}
			await scheduler.queueJob(queueRequest);
		}
	}

	function registerJob<T = unknown>(definition: JobDefinition<T>): void {
		if (jobDefinitions.has(definition.name)) {
			throw new Error(`Job already registered: ${definition.name}`);
		}
		const { category, name } = definition;
		log.debug("Registering job: %s (%s)", name, category);

		jobDefinitions.set(definition.name, definition as JobDefinition);

		// Set up event listeners for trigger events
		if (definition.triggerEvents && definition.triggerEvents.length > 0) {
			for (const eventName of definition.triggerEvents) {
				eventEmitter.on(eventName, async event => {
					await handleJobTriggerEventWithFallback(event, definition, eventName).catch(err =>
						log.error(err, "Failed to queue job %s from event", definition.name),
					);
				});
			}
		}

		// If already started and in worker mode, register with pg-boss immediately
		if (isStarted && workerMode) {
			const wrappedHandler = wrapJobHandler(definition as JobDefinition);
			boss.work(definition.name, wrappedHandler).catch(err => {
				log.error(err, "Failed to register job worker: %s", definition.name);
			});
		}
	}

	async function queueJob(request: QueueJobRequest): Promise<QueueJobResponse> {
		const definition = jobDefinitions.get(request.name);
		if (!definition) {
			throw new Error(`Unknown job: ${request.name}`);
		}

		// Validate parameters against schema
		const validationResult = definition.schema.safeParse(request.params);
		if (!validationResult.success) {
			throw new Error(`Invalid job parameters: ${validationResult.error.message}`);
		}

		const data = validationResult.data as object;

		// Handle cron jobs separately
		if (request.options?.cron) {
			return scheduleCronJob(request.name, request.options.cron, data, request.options.priority);
		}

		// Convert options to pg-boss options
		const options = convertToPgBossOptions(request.options);

		// Queue the job
		const jobId = await boss.send(request.name, data, options);

		// Create job execution record
		const executionData: Parameters<typeof jobsConfig.jobDao.createJobExecution>[0] = {
			id: jobId || "",
			name: request.name,
			params: validationResult.data,
			status: "queued",
			logs: [] as Array<JobLog>,
			retryCount: 0,
		};
		if (definition.title) {
			executionData.title = definition.title;
		}
		if (request.options?.sourceJobId) {
			executionData.sourceJobId = request.options.sourceJobId;
		}
		if (request.options?.sourceEventName) {
			const logEntry: JobLog = {
				timestamp: new Date(),
				level: "info",
				messageKey: "created-from-event",
				context: { eventName: request.options.sourceEventName },
			};
			executionData.logs.push(logEntry);
		}
		if (request.options?.loopPrevented) {
			executionData.loopPrevented = request.options.loopPrevented;
		}
		if (request.options?.loopReason) {
			executionData.loopReason = request.options.loopReason;
		}
		await jobsConfig.jobDao.createJobExecution(executionData);

		return {
			jobId: jobId || "",
			name: request.name,
			messageKey: "job-queued-successfully",
		};
	}

	function listJobs(): Array<JobListing> {
		return Array.from(jobDefinitions.values()).map(def => ({
			name: def.name,
			description: def.description,
			title: def.title,
			category: def.category || "core",
			parameterSchema: zodToJsonSchema(def.schema),
			triggerEvents: def.triggerEvents || [],
			showInDashboard: def.showInDashboard ?? false,
			excludeFromStats: def.excludeFromStats ?? false,
			keepCardAfterCompletion: def.keepCardAfterCompletion ?? false,
		}));
	}

	function getJobHistory(filters = {}): Promise<Array<JobExecution>> {
		return jobsConfig.jobDao.listJobExecutions(filters);
	}

	function getJobExecution(jobId: string): Promise<JobExecution | undefined> {
		return jobsConfig.jobDao.getJobExecution(jobId);
	}

	async function cancelJob(jobId: string): Promise<void> {
		// pg-boss cancel requires jobName and jobId
		// We'll need to get the job execution to find the job name
		const execution = await jobsConfig.jobDao.getJobExecution(jobId);
		if (!execution) {
			throw new Error(`Job execution not found: ${jobId}`);
		}

		await boss.cancel(execution.name, jobId);
		await jobsConfig.jobDao.updateJobStatus(jobId, "cancelled", undefined, new Date());

		// Get job definition to check showInDashboard
		const definition = jobDefinitions.get(execution.name);
		// Emit job cancelled event
		eventEmitter.emit("job:cancelled", {
			jobId,
			name: execution.name,
			showInDashboard: definition?.showInDashboard,
			keepCardAfterCompletion: definition?.keepCardAfterCompletion,
		});
	}

	async function retryJob(jobId: string): Promise<QueueJobResponse> {
		const execution = await jobsConfig.jobDao.getJobExecution(jobId);
		if (!execution) {
			throw new Error(`Job execution not found: ${jobId}`);
		}

		// Queue a new job with the same parameters
		return scheduler.queueJob({
			name: execution.name,
			params: execution.params,
		});
	}

	async function start(): Promise<void> {
		if (isStarted) {
			return;
		}

		// Start pg-boss
		await boss.start();

		// Create queues and optionally register workers for all job definitions
		// Note: In pg-boss v10+, queues must be explicitly created before workers can be registered
		for (const definition of jobDefinitions.values()) {
			// Create the queue with retry settings from job definition
			// Only include defined options to avoid validation errors
			const queueOptions: {
				retryLimit?: number;
				retryDelay?: number;
				retryBackoff?: boolean;
			} = {};
			if (definition.defaultOptions?.retryLimit !== undefined) {
				queueOptions.retryLimit = definition.defaultOptions.retryLimit;
			}
			if (definition.defaultOptions?.retryDelay !== undefined) {
				queueOptions.retryDelay = definition.defaultOptions.retryDelay;
			}
			if (definition.defaultOptions?.retryBackoff !== undefined) {
				queueOptions.retryBackoff = definition.defaultOptions.retryBackoff;
			}

			await boss.createQueue(definition.name, queueOptions);

			// Only register workers if in worker mode
			if (workerMode) {
				const wrappedHandler = wrapJobHandler(definition);
				await boss.work(definition.name, wrappedHandler);
			}
		}

		isStarted = true;
		log.info("Job scheduler started (workerMode: %s, schema: %s)", workerMode, jobsConfig.schema || "pgboss");
	}

	async function stop(): Promise<void> {
		if (!isStarted) {
			return;
		}

		await boss.stop();
		isStarted = false;
	}

	function getEventEmitter(): JobEventEmitter {
		return eventEmitter;
	}

	return scheduler;
}
