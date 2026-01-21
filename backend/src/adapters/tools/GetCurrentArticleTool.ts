import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import { getLog } from "../../util/Logger";

const log = getLog(import.meta);

/**
 * Creates a get_current_article tool definition for a specific draft or article
 * @param draftId - Optional draft ID to bind to this tool
 * @param articleId - Optional article ARN to bind to this tool
 */
export function createGetCurrentArticleToolDefinition(draftId?: number, articleId?: string): ToolDef {
	const idInfo =
		draftId !== undefined ? `Draft ID: ${draftId}` : articleId ? `Article ID: ${articleId}` : "No ID bound";
	return {
		name: "get_current_article",
		description: `Retrieves the current full content of the article. Use this to see the latest state of the article after making edits, or to read specific sections before modifying them. ${idInfo}`,
		parameters: {
			type: "object",
			properties: {},
			required: [],
		},
	};
}

/**
 * Executes the get_current_article tool
 * @param draftId - Optional draft ID
 * @param articleId - Optional article ARN
 * @param docDraftDao - DAO for draft operations
 * @param docDao - Optional DAO for article operations
 */
export async function executeGetCurrentArticleTool(
	draftId: number | undefined,
	articleId: string | undefined,
	docDraftDao: DocDraftDao,
	docDao?: DocDao,
): Promise<string> {
	if (draftId !== undefined) {
		log.info("get_current_article tool called for draft %d", draftId);

		// Get current draft content
		const draft = await docDraftDao.getDocDraft(draftId);
		if (!draft) {
			const errorMsg = `Draft ${draftId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}

		const currentContent = draft.content;
		log.debug("Retrieved draft content length: %d", currentContent.length);

		// Return the full article content with markdown formatting
		return `CURRENT ARTICLE CONTENT:
---
${currentContent}
---

The article contains ${currentContent.length} characters.`;
	}

	if (articleId !== undefined) {
		if (!docDao) {
			const errorMsg = "DocDao is required for article operations";
			log.error(errorMsg);
			return errorMsg;
		}

		log.info("get_current_article tool called for article %s", articleId);

		// Get current article content
		const article = await docDao.readDoc(articleId);
		if (!article) {
			const errorMsg = `Article ${articleId} not found`;
			log.error(errorMsg);
			return errorMsg;
		}

		const currentContent = article.content;
		log.debug("Retrieved article content length: %d", currentContent.length);

		// Return the full article content with markdown formatting
		return `CURRENT ARTICLE CONTENT:
---
${currentContent}
---

The article contains ${currentContent.length} characters.`;
	}

	const errorMsg = "Either draftId or articleId must be provided";
	log.error(errorMsg);
	return errorMsg;
}
