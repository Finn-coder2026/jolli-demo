import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import { getLog } from "../../util/Logger";

const log = getLog(import.meta);

/**
 * Creates a create_article tool definition for a specific draft or article
 * @param draftId - Optional draft ID to bind to this tool
 * @param articleId - Optional article ARN to bind to this tool
 */
export function createCreateArticleToolDefinition(draftId?: number, articleId?: string): ToolDef {
	const idInfo =
		draftId !== undefined ? `Draft ID: ${draftId}` : articleId ? `Article ID: ${articleId}` : "No ID bound";
	return {
		name: "create_article",
		description: `Create or completely replace the article content. Use this when writing a new article or doing a complete rewrite. ${idInfo}`,
		parameters: {
			type: "object",
			properties: {
				content: {
					type: "string",
					description:
						"The complete markdown content for the entire article, including all headings, sections, and text",
				},
			},
			required: ["content"],
		},
	};
}

/**
 * Executes the create_article tool
 * @param draftId - Optional draft ID
 * @param articleId - Optional article ARN
 * @param args - Tool arguments
 * @param docDraftDao - DAO for draft operations
 * @param userId - ID of the user executing the tool
 * @param docDao - Optional DAO for article operations
 */
export async function executeCreateArticleTool(
	draftId: number | undefined,
	articleId: string | undefined,
	args: { content: string },
	docDraftDao: DocDraftDao,
	userId: number,
	docDao?: DocDao,
): Promise<string> {
	const { content } = args;

	if (draftId !== undefined) {
		log.info("create_article tool called for draft %d, content length: %d", draftId, content.length);

		// Get current draft to verify it exists
		const draft = await docDraftDao.getDocDraft(draftId);
		if (!draft) {
			const errorMsg = `Draft ${draftId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}

		// Update the draft with new content and metadata
		await docDraftDao.updateDocDraft(draftId, {
			content,
			contentLastEditedAt: new Date(),
			contentLastEditedBy: userId,
		});
		log.info("Draft %d updated with new article content", draftId);

		return "Article created successfully. The draft has been saved.";
	}

	if (articleId !== undefined) {
		if (!docDao) {
			const errorMsg = "DocDao is required for article operations";
			log.error(errorMsg);
			return errorMsg;
		}

		log.info("create_article tool called for article %s, content length: %d", articleId, content.length);

		// Get current article to verify it exists
		const article = await docDao.readDoc(articleId);
		if (!article) {
			const errorMsg = `Article ${articleId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}

		// Update the article with new content
		const updated = await docDao.updateDoc({ ...article, content, version: article.version + 1 });
		if (!updated) {
			const errorMsg = `Failed to update article ${articleId}`;
			log.error(errorMsg);
			return errorMsg;
		}

		log.info("Article %s updated with new content", articleId);

		return "Article created successfully. The article has been saved.";
	}

	const errorMsg = "Either draftId or articleId must be provided";
	log.error(errorMsg);
	return errorMsg;
}
