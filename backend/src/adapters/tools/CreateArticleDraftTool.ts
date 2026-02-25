/**
 * Tool definition and executor for the create_article_draft agent hub tool.
 * Creates a new article with a draft for editing.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import { getLog } from "../../util/Logger";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { z } from "zod";

/** Zod schema for create_article_draft arguments. */
export const createArticleDraftArgsSchema = z.object({
	title: z.string().min(1),
	spaceId: z.number(),
	folderId: z.number().optional(),
	content: z.string().optional(),
});

const log = getLog(import.meta);

/** Returns the tool definition for create_article_draft. */
export function createCreateArticleDraftToolDefinition(): ToolDef {
	return {
		name: "create_article_draft",
		description:
			"Create a new article with a draft for editing. Returns the draft ID so the user can be navigated to the editor.",
		parameters: {
			type: "object",
			properties: {
				title: { type: "string", description: "Article title" },
				spaceId: { type: "number", description: "The space to create the article in" },
				folderId: {
					type: "number",
					description: "Optional folder ID to place the article in",
				},
				content: {
					type: "string",
					description: "Optional initial markdown content for the article",
				},
			},
			required: ["title", "spaceId"],
		},
	};
}

/**
 * Executes the create_article_draft tool.
 * Mirrors the doc creation flow from DocRouter POST /docs.
 */
export async function executeCreateArticleDraftTool(
	deps: AgentHubToolDeps,
	userId: number,
	args: z.infer<typeof createArticleDraftArgsSchema>,
): Promise<string> {
	const canEdit = await deps.permissionService.hasPermission(userId, "articles.edit");
	if (!canEdit) {
		return "You do not have permission to create articles.";
	}

	const docDao = deps.docDaoProvider.getDao(getTenantContext());
	const docDraftDao = deps.docDraftDaoProvider.getDao(getTenantContext());
	const userIdStr = userId.toString();
	const articleContent = args.content ?? "";

	// Create the Doc (mirrors DocRouter POST / logic for web-created docs)
	const doc = await docDao.createDoc({
		docType: "document",
		contentType: "text/markdown",
		content: articleContent,
		contentMetadata: { title: args.title },
		spaceId: args.spaceId,
		parentId: args.folderId,
		source: undefined,
		sourceMetadata: undefined,
		createdBy: userIdStr,
		updatedBy: userIdStr,
	});

	// Create the DocDraft for editing
	const draft = await docDraftDao.createDocDraft({
		docId: doc.id,
		title: args.title,
		content: articleContent,
		createdBy: userId,
		createdByAgent: true,
		isShared: true,
	});

	log.info("Agent created article draft %d (doc %d) '%s' in space %d", draft.id, doc.id, args.title, args.spaceId);
	return JSON.stringify({ draftId: draft.id, docId: doc.id, title: args.title, spaceId: args.spaceId });
}
