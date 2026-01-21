/**
 * Worker polling logic for discovering and processing tenant/org jobs.
 * Polls the registry for active tenant/org pairs and starts workers for each.
 */
import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager.js";
import type { TenantOrgJobScheduler } from "../jobs/TenantOrgJobScheduler.js";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient.js";
import { getLog } from "../util/Logger.js";

const log = getLog(import.meta);

/**
 * Configuration for worker polling.
 */
export interface WorkerPollingConfig {
	/** Interval in milliseconds to poll for new tenant/org pairs */
	pollIntervalMs: number;
	/** Maximum number of concurrent schedulers (limits memory usage) */
	maxConcurrentSchedulers: number;
}

/**
 * State for tracking active schedulers.
 */
interface WorkerPollingState {
	activeSchedulers: Map<string, TenantOrgJobScheduler>;
	pollInterval: ReturnType<typeof setInterval> | null;
	isShuttingDown: boolean;
}

/**
 * Creates a unique key for a tenant-org pair.
 */
function getTenantOrgKey(tenantId: string, orgId: string): string {
	return `${tenantId}:${orgId}`;
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

						// Create and start scheduler for this tenant-org
						const scheduler = await schedulerManager.getScheduler(fullTenant, fullOrg);
						await scheduler.start();
						state.activeSchedulers.set(key, scheduler);

						log.info(
							{ tenant: tenantSummary.slug, org: orgSummary.slug },
							"Started worker for %s/%s",
							tenantSummary.slug,
							orgSummary.slug,
						);
					} catch (error) {
						log.error(
							{ error, tenantId: tenantSummary.id, orgId: orgSummary.id },
							"Failed to start scheduler for tenant/org",
						);
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
