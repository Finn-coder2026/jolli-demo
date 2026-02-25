/**
 * CheckSyncTriggered Tool - Verifies that a sync was triggered after user edit.
 */

import { getLog } from "../../util/Logger";
import type { OnboardingTool } from "../types";
import { getActiveGithubIntegration } from "./ToolUtils";

const log = getLog(import.meta);

/**
 * Time window in milliseconds to check for recent syncs (5 minutes).
 */
const SYNC_WINDOW_MS = 5 * 60 * 1000;

export const checkSyncTriggeredTool: OnboardingTool = {
	definition: {
		name: "check_sync_triggered",
		description:
			"Check if a sync was triggered after the user edited a file in GitHub. " +
			"This verifies that the webhook integration is working correctly. " +
			"Call this after instructing the user to make an edit in GitHub.",
		parameters: {
			type: "object",
			properties: {
				since_timestamp: {
					type: "string",
					description:
						"Optional ISO timestamp to check for syncs since. " +
						"If not provided, checks for syncs in the last 5 minutes.",
				},
			},
			required: [],
		},
	},
	handler: async (args, context) => {
		try {
			// Get the connected integration
			const githubIntegration = await getActiveGithubIntegration(context);

			if (!githubIntegration) {
				return {
					success: false,
					content:
						"No GitHub integration connected. Cannot check for sync events without an active integration.",
				};
			}

			// Determine the time window to check
			const sinceTimestamp = args.since_timestamp
				? new Date(args.since_timestamp as string)
				: new Date(Date.now() - SYNC_WINDOW_MS);

			// Check if the integration was updated recently (indicating a sync occurred)
			const integrationUpdatedAt = new Date(githubIntegration.updatedAt);

			// Check step data for last known sync time
			const lastSyncTime = context.stepData.lastSyncTime ? new Date(context.stepData.lastSyncTime) : null;

			// A sync was triggered if:
			// 1. Integration was updated after our check window started
			// 2. Integration was updated after the last known sync time (if we have one)
			const wasUpdatedRecently = integrationUpdatedAt > sinceTimestamp;
			const wasUpdatedSinceLastCheck = lastSyncTime ? integrationUpdatedAt > lastSyncTime : true;

			// Update the last sync time we've seen
			await context.updateStepData({
				lastSyncTime: new Date().toISOString(),
			});

			if (wasUpdatedRecently && wasUpdatedSinceLastCheck) {
				log.info(
					"Sync detected for integration %d, updated at %s",
					githubIntegration.id,
					integrationUpdatedAt.toISOString(),
				);

				return {
					success: true,
					content: JSON.stringify({
						syncDetected: true,
						integrationId: githubIntegration.id,
						lastSyncAt: integrationUpdatedAt.toISOString(),
						message:
							"Sync detected! The webhook is working correctly. " +
							"Changes from GitHub will automatically update your documentation.",
					}),
				};
			}

			// No sync detected yet
			log.info(
				"No sync detected for integration %d since %s (last update: %s)",
				githubIntegration.id,
				sinceTimestamp.toISOString(),
				integrationUpdatedAt.toISOString(),
			);

			return {
				success: true,
				content: JSON.stringify({
					syncDetected: false,
					integrationId: githubIntegration.id,
					lastSyncAt: integrationUpdatedAt.toISOString(),
					checkingSince: sinceTimestamp.toISOString(),
					message:
						"No sync detected yet. This could mean:\n" +
						"1. The user hasn't made an edit yet\n" +
						"2. The webhook hasn't fired yet (can take a few seconds)\n" +
						"3. The webhook may not be configured correctly\n\n" +
						"Ask the user to confirm they've pushed their changes, then check again.",
				}),
			};
		} catch (error) {
			log.error(error, "Error in check_sync_triggered tool");
			return {
				success: false,
				content: `Failed to check sync status: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};
