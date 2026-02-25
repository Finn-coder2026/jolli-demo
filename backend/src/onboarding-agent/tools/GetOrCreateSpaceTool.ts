/**
 * GetOrCreateSpace Tool - Gets or creates a space named after the repository.
 */

import { getLog } from "../../util/Logger";
import type { OnboardingTool, OnboardingToolContext } from "../types";
import { DEFAULT_SPACE_FILTERS } from "jolli-common";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

/**
 * Extracts the repository name from a full repo identifier.
 * For "owner/repo", returns "repo".
 * For forked repos like "my-username/repo", still returns "repo".
 */
function extractRepoName(repoFullName: string): string {
	const parts = repoFullName.split("/");
	return parts.length === 2 ? parts[1] : repoFullName;
}

/**
 * Add a space to the user's favorite spaces.
 * Reads existing favorites, appends if not already present, and upserts.
 */
async function addSpaceToFavorites(spaceId: number, context: OnboardingToolContext): Promise<void> {
	try {
		const existing = await context.userPreferenceDao.getPreference(context.userId);
		const currentFavorites = existing?.favoriteSpaces ?? [];
		if (currentFavorites.includes(spaceId)) {
			return;
		}
		await context.userPreferenceDao.upsertPreference(context.userId, {
			favoriteSpaces: [...currentFavorites, spaceId],
		});
		log.info("Added space id=%d to favorites for userId=%d", spaceId, context.userId);
	} catch (error) {
		// Non-fatal: log and continue even if favoriting fails
		log.warn(error, "Failed to add space id=%d to favorites for userId=%d", spaceId, context.userId);
	}
}

export const getOrCreateSpaceTool: OnboardingTool = {
	definition: {
		name: "get_or_create_space",
		description:
			"Get or create a space named after the connected repository. " +
			"If a space with that name already exists, returns it instead of creating a duplicate. " +
			"This ensures users don't end up with multiple spaces for the same project.",
		parameters: {
			type: "object",
			properties: {
				repository: {
					type: "string",
					description:
						"The repository name in format 'owner/repo'. The space will be named after the repo name.",
				},
			},
			required: ["repository"],
		},
	},
	handler: async (args, context) => {
		const repository = args.repository as string;

		try {
			// Extract just the repo name (without owner)
			const repoName = extractRepoName(repository);
			const spaceSlug = generateSlug(repoName);

			// Check if space already exists with this slug
			const existingSpace = await context.spaceDao.getSpaceBySlug(spaceSlug);
			if (existingSpace) {
				log.info("Found existing space with slug '%s' for repo '%s'", spaceSlug, repository);

				// Update step data with space info
				await context.updateStepData({
					spaceId: existingSpace.id,
					spaceName: existingSpace.name,
				});

				// Auto-add to favorites so it appears in the sidebar
				await addSpaceToFavorites(existingSpace.id, context);

				return {
					success: true,
					content: JSON.stringify({
						created: false,
						spaceId: existingSpace.id,
						name: existingSpace.name,
						slug: existingSpace.slug,
						message: `Using existing space "${existingSpace.name}" for ${repository}`,
					}),
				};
			}

			// Space doesn't exist, create it
			const newSpace = await context.spaceDao.createSpace({
				name: repoName,
				slug: spaceSlug,
				description: `Documentation space for ${repository}`,
				ownerId: context.userId,
				isPersonal: false,
				defaultSort: "default",
				defaultFilters: { ...DEFAULT_SPACE_FILTERS },
			});

			log.info("Created new space '%s' (id=%d) for repo '%s'", newSpace.name, newSpace.id, repository);

			// Update step data with space info
			await context.updateStepData({
				spaceId: newSpace.id,
				spaceName: newSpace.name,
			});

			// Auto-add to favorites so it appears in the sidebar
			await addSpaceToFavorites(newSpace.id, context);

			return {
				success: true,
				content: JSON.stringify({
					created: true,
					spaceId: newSpace.id,
					name: newSpace.name,
					slug: newSpace.slug,
					message: `Created new space "${newSpace.name}" for ${repository}`,
				}),
			};
		} catch (error) {
			log.error(error, "Error in get_or_create_space tool");
			return {
				success: false,
				content: `Failed to get or create space: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};
