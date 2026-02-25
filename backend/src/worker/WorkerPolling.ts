/**
 * Worker polling logic for discovering and processing tenant/org jobs.
 * Polls the registry for active tenant/org pairs and starts workers for each.
 */
import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager.js";
import type { TenantOrgJobScheduler } from "../jobs/TenantOrgJobScheduler.js";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient.js";
import { getLog } from "../util/Logger.js";
import { calculateBackoffDelay } from "../util/Retry.js";

const log = getLog(import.meta);

/**
 * Configuration for worker polling.
 */
export interface WorkerPollingConfig {
	/** Interval in milliseconds to poll for new tenant/org pairs */
	pollIntervalMs: number;
	/** Maximum number of concurrent schedulers (limits memory usage) */
	maxConcurrentSchedulers: number;
	/** Maximum number of consecutive failures before giving up on a tenant-org */
	retryMaxRetries: number;
	/** Base delay in milliseconds for exponential backoff */
	retryBaseDelayMs: number;
	/** Maximum delay in milliseconds for backoff */
	retryMaxDelayMs: number;
	/** Time in milliseconds after which to reset the failure count */
	retryResetAfterMs: number;
}

/**
 * State for tracking active schedulers.
 */
interface WorkerPollingState {
	activeSchedulers: Map<string, TenantOrgJobScheduler>;
	pollInterval: ReturnType<typeof setInterval> | null;
	isShuttingDown: boolean;
	/** Tracks failed initialization attempts for exponential backoff */
	failedAttempts: Map<string, { count: number; lastAttemptTime: number }>;
}

/**
 * Extracts a meaningful error message from an error, handling pg-boss assertion errors.
 */
function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		// pg-boss assertion errors may have the original error as a cause
		if ("code" in error && error.code === "ERR_ASSERTION") {
			// The assertion error message might contain the original error
			return `Assertion failure during pg-boss initialization: ${error.message}`;
		}
		return error.message;
	}
	return String(error);
}

/**
 * Creates a unique key for a tenant-org pair.
 */
function getTenantOrgKey(tenantId: string, orgId: string): string {
	return `${tenantId}:${orgId}`;
}

/**
 * Result of checking if a tenant-org is in backoff period.
 */
interface BackoffCheckResult {
	shouldSkip: boolean;
	reason?: "in_backoff" | "max_retries_exceeded";
}

/**
 * Configuration for retry behavior checks.
 */
interface RetryCheckConfig {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
	resetAfterMs: number;
}

/**
 * Checks if a tenant-org should be skipped due to backoff or max retries exceeded.
 */
function checkBackoffStatus(
	key: string,
	failedAttempts: Map<string, { count: number; lastAttemptTime: number }>,
	retryConfig: RetryCheckConfig,
): BackoffCheckResult {
	const failedInfo = failedAttempts.get(key);
	if (!failedInfo) {
		return { shouldSkip: false };
	}

	const now = Date.now();
	const timeSinceLastAttempt = now - failedInfo.lastAttemptTime;

	// Reset failure count if enough time has passed
	if (timeSinceLastAttempt >= retryConfig.resetAfterMs) {
		failedAttempts.delete(key);
		return { shouldSkip: false };
	}

	// Check if max retries exceeded (give up on this tenant-org until reset period)
	if (failedInfo.count >= retryConfig.maxRetries) {
		log.debug(
			{ key, attemptCount: failedInfo.count, maxRetries: retryConfig.maxRetries },
			"Skipping tenant-org %s (max retries exceeded, will retry after reset period)",
			key,
		);
		return { shouldSkip: true, reason: "max_retries_exceeded" };
	}

	// Check if still in backoff period
	const backoffDelay = calculateBackoffDelay(failedInfo.count, retryConfig.baseDelayMs, retryConfig.maxDelayMs);
	if (timeSinceLastAttempt < backoffDelay) {
		log.debug(
			{ key, backoffMs: backoffDelay - timeSinceLastAttempt },
			"Skipping tenant-org %s (in backoff period)",
			key,
		);
		return { shouldSkip: true, reason: "in_backoff" };
	}

	return { shouldSkip: false };
}

/**
 * Records a failure for a tenant-org and logs it.
 */
function recordFailure(
	key: string,
	tenantId: string,
	orgId: string,
	error: unknown,
	failedAttempts: Map<string, { count: number; lastAttemptTime: number }>,
	retryConfig: RetryCheckConfig,
): void {
	const currentFailure = failedAttempts.get(key);
	const newCount = (currentFailure?.count ?? 0) + 1;
	failedAttempts.set(key, {
		count: newCount,
		lastAttemptTime: Date.now(),
	});

	const errorMessage = extractErrorMessage(error);

	// Check if this was the last retry
	if (newCount >= retryConfig.maxRetries) {
		log.error(
			{
				error,
				tenantId,
				orgId,
				attemptCount: newCount,
				maxRetries: retryConfig.maxRetries,
				resetAfterMs: retryConfig.resetAfterMs,
				errorMessage,
			},
			"Max retries reached for tenant/org (attempt %d/%d, giving up until reset period): %s",
			newCount,
			retryConfig.maxRetries,
			errorMessage,
		);
	} else {
		const backoffDelay = calculateBackoffDelay(newCount, retryConfig.baseDelayMs, retryConfig.maxDelayMs);
		log.error(
			{
				error,
				tenantId,
				orgId,
				attemptCount: newCount,
				maxRetries: retryConfig.maxRetries,
				nextRetryMs: backoffDelay,
				errorMessage,
			},
			"Failed to start scheduler for tenant/org (attempt %d/%d, retry in %dms): %s",
			newCount,
			retryConfig.maxRetries,
			backoffDelay,
			errorMessage,
		);
	}
}

/**
 * Starts polling for tenant/org pairs and managing workers.
 * Returns a function to stop polling.
 *
 * @param schedulerManager - The scheduler manager to use for creating schedulers
 * @param registryClient - The registry client to query for tenant/org pairs
 * @param config - Polling configuration
 * @returns A function to stop polling and clean up
 */
export async function startWorkerPolling(
	schedulerManager: MultiTenantJobSchedulerManager,
	registryClient: TenantRegistryClient,
	config: WorkerPollingConfig,
): Promise<() => Promise<void>> {
	const state: WorkerPollingState = {
		activeSchedulers: new Map(),
		pollInterval: null,
		isShuttingDown: false,
		failedAttempts: new Map(),
	};

	// Build retry config from polling config
	const retryConfig: RetryCheckConfig = {
		maxRetries: config.retryMaxRetries,
		baseDelayMs: config.retryBaseDelayMs,
		maxDelayMs: config.retryMaxDelayMs,
		resetAfterMs: config.retryResetAfterMs,
	};

	/**
	 * Refreshes the list of active schedulers based on registry state.
	 */
	async function refreshSchedulers(): Promise<void> {
		if (state.isShuttingDown) {
			return;
		}

		try {
			// Get all tenants from registry (filter to active ones)
			const tenantSummaries = await registryClient.listTenants();
			const activeTenants = tenantSummaries.filter(t => t.status === "active");

			for (const tenantSummary of activeTenants) {
				// Skip if we've reached max schedulers
				if (state.activeSchedulers.size >= config.maxConcurrentSchedulers) {
					log.warn(
						{ maxSchedulers: config.maxConcurrentSchedulers },
						"Reached max scheduler limit of %d",
						config.maxConcurrentSchedulers,
					);
					break;
				}

				// Get orgs for this tenant
				const orgSummaries = await registryClient.listOrgs(tenantSummary.id);
				const activeOrgs = orgSummaries.filter(o => o.status === "active");

				for (const orgSummary of activeOrgs) {
					const key = getTenantOrgKey(tenantSummary.id, orgSummary.id);

					// Skip if already active
					if (state.activeSchedulers.has(key)) {
						continue;
					}

					// Check if this tenant-org is in backoff period or has exceeded max retries
					const backoffCheck = checkBackoffStatus(key, state.failedAttempts, retryConfig);
					if (backoffCheck.shouldSkip) {
						continue;
					}

					try {
						// Get full tenant and org objects
						const fullTenant = await registryClient.getTenant(tenantSummary.id);
						const fullOrg = await registryClient.getOrg(orgSummary.id);

						if (!fullTenant || !fullOrg) {
							log.warn(
								{ tenantId: tenantSummary.id, orgId: orgSummary.id },
								"Could not fetch full tenant/org details",
							);
							continue;
						}

						// Get scheduler for this tenant-org (getScheduler already starts it)
						const scheduler = await schedulerManager.getScheduler(fullTenant, fullOrg);
						state.activeSchedulers.set(key, scheduler);

						// Clear any previous failure tracking on success
						state.failedAttempts.delete(key);

						log.info(
							{ tenant: tenantSummary.slug, org: orgSummary.slug },
							"Started worker for %s/%s",
							tenantSummary.slug,
							orgSummary.slug,
						);
					} catch (error) {
						recordFailure(key, tenantSummary.id, orgSummary.id, error, state.failedAttempts, retryConfig);
					}
				}
			}

			// Log current state
			log.debug(
				{ activeCount: state.activeSchedulers.size },
				"Currently managing %d active schedulers",
				state.activeSchedulers.size,
			);
		} catch (error) {
			log.error(error, "Failed to refresh schedulers");
		}
	}

	// Initial refresh
	await refreshSchedulers();

	// Start periodic refresh
	state.pollInterval = setInterval(() => {
		refreshSchedulers().catch(error => {
			log.error(error, "Error in periodic scheduler refresh");
		});
	}, config.pollIntervalMs);

	log.info(
		{ pollIntervalMs: config.pollIntervalMs },
		"Worker polling started with %dms interval",
		config.pollIntervalMs,
	);

	// Return stop function
	return async function stopPolling(): Promise<void> {
		state.isShuttingDown = true;

		// Stop the polling interval
		if (state.pollInterval) {
			clearInterval(state.pollInterval);
			state.pollInterval = null;
		}

		// Stop all active schedulers
		const stopPromises: Array<Promise<void>> = [];
		for (const [key, scheduler] of state.activeSchedulers) {
			stopPromises.push(
				scheduler.stop().catch(error => {
					log.error({ error, key }, "Error stopping scheduler");
				}),
			);
		}

		await Promise.all(stopPromises);
		state.activeSchedulers.clear();

		log.info("Worker polling stopped");
	};
}
