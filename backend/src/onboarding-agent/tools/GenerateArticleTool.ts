/**
 * GenerateArticle Tool - Generates a new article using AI (placeholder for now).
 */

import { getLog } from "../../util/Logger";
import type { OnboardingTool } from "../types";
import { jrnParser } from "jolli-common";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

export const generateArticleTool: OnboardingTool = {
	definition: {
		name: "generate_article",
		description: "Generate a new documentation article using AI based on the repository content.",
		parameters: {
			type: "object",
			properties: {
				article_type: {
					type: "string",
					description: "Type of article to generate",
					enum: ["readme", "architecture", "getting-started", "api-reference"],
				},
				title: {
					type: "string",
					description: "Title for the generated article",
				},
			},
			required: ["article_type", "title"],
		},
	},
	handler: async (args, context) => {
		const articleType = args.article_type as string;
		const title = args.title as string;

		try {
			const slug = generateSlug(title);

			// Get or create default space
			let space = await context.spaceDao.getDefaultSpace();
			if (!space) {
				space = await context.spaceDao.createDefaultSpaceIfNeeded(context.userId);
			}

			// Create a placeholder article
			const placeholderContent = `# ${title}\n\n> This ${articleType} article was generated during onboarding.\n\nPlease edit this article to add your content.`;

			const doc = await context.docDao.createDoc({
				updatedBy: "onboarding",
				content: placeholderContent,
				contentType: "text/markdown",
				contentMetadata: {
					title,
				},
				docType: "document",
				spaceId: space.id,
				parentId: undefined,
				createdBy: "onboarding",
				source: undefined,
				sourceMetadata: undefined,
			});

			const docJrn = doc.jrn || jrnParser.document(slug);

			// Update step data
			const currentCount = context.stepData.generatedCount || 0;
			await context.updateStepData({
				generatedCount: currentCount + 1,
				spaceId: space.id,
			});

			return {
				success: true,
				content: `Successfully created "${title}" (${articleType}).\n\nArticle JRN: ${docJrn}\nSpace: ${space.name || "Default Space"}\n\nYou can now edit this article to add your actual content.`,
			};
		} catch (error) {
			log.error(error, "Error in generate_article tool");
			return {
				success: false,
				content: `Failed to generate article: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};
