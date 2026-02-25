/**
 * Tool definition and executor for the list_folder_contents agent hub tool.
 * Browses folders and articles within a space.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { z } from "zod";

/** Zod schema for list_folder_contents arguments. */
export const listFolderContentsArgsSchema = z.object({
	spaceId: z.number(),
	parentId: z.number().optional(),
});

/** Returns the tool definition for list_folder_contents. */
export function createListFolderContentsToolDefinition(): ToolDef {
	return {
		name: "list_folder_contents",
		description:
			"Browse folders and articles within a space. Use parentId to navigate into subfolders, or omit for root level.",
		parameters: {
			type: "object",
			properties: {
				spaceId: { type: "number", description: "The space ID to browse" },
				parentId: {
					type: "number",
					description: "Parent folder ID. Omit or null for root level.",
				},
			},
			required: ["spaceId"],
		},
	};
}

/** Executes the list_folder_contents tool. */
export async function executeListFolderContentsTool(
	deps: AgentHubToolDeps,
	userId: number,
	args: z.infer<typeof listFolderContentsArgsSchema>,
): Promise<string> {
	const canView = await deps.permissionService.hasPermission(userId, "articles.view");
	if (!canView) {
		return "You do not have permission to view articles.";
	}

	const docDao = deps.docDaoProvider.getDao(getTenantContext());
	const docs = await docDao.getTreeContent(args.spaceId, args.parentId ?? null);

	const items = docs.map(d => ({
		id: d.id,
		title: (d.contentMetadata as { title?: string } | undefined)?.title ?? d.slug,
		type: d.docType,
		slug: d.slug,
	}));

	// Also get linked sources for the space
	const sourceDao = deps.sourceDaoProvider.getDao(getTenantContext());
	const sources = await sourceDao.listSourcesForSpace(args.spaceId);
	const sourceSummary =
		sources.length > 0
			? `This space has ${sources.length} linked source(s): ${sources.map(s => s.name).join(", ")}.`
			: "This space has no linked sources.";

	return JSON.stringify({ items, sourceSummary });
}
