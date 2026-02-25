/**
 * OnboardingWebhookListener - Listens for GitHub push events to detect sync.
 *
 * When a user is in the SYNC_WAITING or SYNC_EXPLAIN FSM state, this listener
 * detects incoming github:push events and sets stepData.syncTriggered = true
 * for matching onboarding records. Capturing events in SYNC_EXPLAIN handles
 * the race condition where a webhook arrives before the user confirms.
 */

import type { UserOnboardingDao } from "../dao/UserOnboardingDao";
import { GITHUB_PUSH } from "../events/GithubEvents";
import type { JobEventEmitter } from "../jobs/JobEventEmitter";
import { createMercureService } from "../services/MercureService";
import type { JobEvent } from "../types/JobTypes";
import { getLog } from "../util/Logger";

const log = getLog(import.meta);

/**
 * GitHub push webhook payload (relevant fields only).
 */
interface GitHubPushPayload {
	repository?: {
		full_name?: string;
		name?: string;
	};
	ref?: string;
}

/**
 * Disposable listener handle.
 */
export interface OnboardingWebhookListenerHandle {
	/** Stop listening for webhook events */
	dispose: () => void;
}

/**
 * Creates a webhook listener for onboarding sync detection.
 *
 * Listens for GITHUB_PUSH events on the shared event emitter. When a push
 * event arrives for a repo that matches a user's connected repo, and that
 * user is in SYNC_WAITING or SYNC_EXPLAIN state, the listener sets
 * syncTriggered = true.
 *
 * @param eventEmitter the shared event emitter for GitHub events
 * @param userOnboardingDao the tenant-scoped user onboarding DAO
 * @returns a handle with a dispose() method to stop listening
 */
export function createOnboardingWebhookListener(
	eventEmitter: JobEventEmitter,
	userOnboardingDao: UserOnboardingDao,
): OnboardingWebhookListenerHandle {
	const mercure = createMercureService();

	function handlePushEvent(event: JobEvent): void {
		const payload = event.data as GitHubPushPayload;
		const repoFullName = payload?.repository?.full_name;

		if (!repoFullName) {
			log.debug("Push event without repository full_name, ignoring");
			return;
		}

		log.info("Onboarding webhook listener: push event for repo %s", repoFullName);

		// Process asynchronously (fire and forget from event handler)
		processPushForOnboarding(repoFullName).catch(err => {
			log.warn(err, "Failed to process push event for onboarding sync detection");
		});
	}

	/**
	 * Find onboarding records in SYNC_WAITING or SYNC_EXPLAIN state with
	 * matching repo and mark them as sync triggered.
	 */
	async function processPushForOnboarding(repoFullName: string): Promise<void> {
		try {
			// Find users awaiting sync detection (SYNC_WAITING or SYNC_EXPLAIN)
			const waitingRecords = await userOnboardingDao.findByFsmStateAndRepo(
				["SYNC_WAITING", "SYNC_EXPLAIN"],
				repoFullName,
			);

			if (waitingRecords.length === 0) {
				log.debug("No onboarding records awaiting sync for repo %s", repoFullName);
				return;
			}

			log.info("Found %d onboarding records awaiting sync for repo %s", waitingRecords.length, repoFullName);

			for (const record of waitingRecords) {
				try {
					await userOnboardingDao.updateStepData(record.userId, {
						syncTriggered: true,
						lastSyncTime: new Date().toISOString(),
					});

					// Publish Mercure event so frontend can notify the user
					if (mercure.isEnabled()) {
						mercure
							.publishOnboardingEvent(record.userId, "webhook_received", {
								type: "webhook_received",
								repo: repoFullName,
							})
							.catch(err => {
								log.warn(err, "Failed to publish onboarding webhook event to Mercure");
							});
					}

					log.info("Set syncTriggered=true for user %d (repo %s)", record.userId, repoFullName);
				} catch (err) {
					log.warn(err, "Failed to update sync status for user %d", record.userId);
				}
			}
		} catch (error) {
			log.error(error, "Error processing push event for onboarding");
		}
	}

	// Register the listener
	eventEmitter.on(GITHUB_PUSH, handlePushEvent);
	log.info("Onboarding webhook listener registered for %s events", GITHUB_PUSH);

	return {
		dispose(): void {
			eventEmitter.off(GITHUB_PUSH, handlePushEvent);
			log.info("Onboarding webhook listener disposed");
		},
	};
}
