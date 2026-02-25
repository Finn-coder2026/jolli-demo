import type { RememberMeService } from "../services/RememberMeService";
import type { JobDefinition } from "../types/JobTypes";
import { getLog } from "../util/Logger";
import type { JobScheduler } from "./JobScheduler.js";
import { z } from "zod";

const log = getLog(import.meta);

export const CLEANUP_EXPIRED_REMEMBER_ME_TOKENS = "rememberme:cleanup-expired-tokens";

/**
 * Remember-me cleanup jobs for removing expired tokens.
 */
export interface RememberMeCleanupJobs {
	/**
	 * Get all remember-me cleanup job definitions.
	 */
	getDefinitions(): Array<JobDefinition>;

	/**
	 * Register all remember-me cleanup jobs with the scheduler.
	 */
	registerJobs(jobScheduler: JobScheduler): void;

	/**
	 * Queue remember-me cleanup jobs that should be scheduled on startup.
	 */
	queueJobs(jobScheduler: JobScheduler): Promise<void>;
}

/**
 * Create remember-me cleanup jobs.
 * @param rememberMeService - Service for managing remember-me tokens.
 */
export function createRememberMeCleanupJobs(rememberMeService: RememberMeService): RememberMeCleanupJobs {
	/**
	 * Get all job definitions.
	 */
	function getDefinitions(): Array<JobDefinition> {
		/**
		 * Job to clean up expired remember-me tokens.
		 * Runs daily to remove tokens that have passed their expiration date.
		 */
		const cleanupExpiredTokensDefinition: JobDefinition<Record<string, never>> = {
			name: CLEANUP_EXPIRED_REMEMBER_ME_TOKENS,
			description: "Removes expired remember-me tokens from the database",
			category: "auth",
			schema: z.object({}),
			statsSchema: z.object({
				deletedCount: z.number(),
			}),
			handler: async (_params, context) => {
				context.log("starting", {}, "info");

				const deletedCount = await rememberMeService.cleanupExpiredTokens();

				context.log("cleanup-complete", { deletedCount }, "info");

				await context.setCompletionInfo({
					messageKey: "success",
					context: {
						deleted: deletedCount,
					},
				});

				await context.updateStats({
					deletedCount,
				});
			},
			showInDashboard: true,
		};

		return [cleanupExpiredTokensDefinition] as Array<JobDefinition>;
	}

	function registerJobs(jobScheduler: JobScheduler): void {
		for (const definition of getDefinitions()) {
			jobScheduler.registerJob(definition);
		}
	}

	/**
	 * Queue remember-me cleanup jobs that should be scheduled on startup.
	 */
	async function queueJobs(jobScheduler: JobScheduler): Promise<void> {
		// Schedule the cleanup job to run daily at 2 AM
		await jobScheduler.queueJob({
			name: CLEANUP_EXPIRED_REMEMBER_ME_TOKENS,
			params: {},
			options: {
				cron: "0 2 * * *",
				singletonKey: CLEANUP_EXPIRED_REMEMBER_ME_TOKENS,
			},
		});
		log.debug("Scheduled %s to run daily at 2 AM", CLEANUP_EXPIRED_REMEMBER_ME_TOKENS);
	}

	return {
		getDefinitions,
		registerJobs,
		queueJobs,
	};
}
