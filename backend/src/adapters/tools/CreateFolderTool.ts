/**
 * Tool definition and executor for the create_folder agent hub tool.
 * Creates a new folder in a space.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import { getLog } from "../../util/Logger";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { z } from "zod";

/** Zod schema for create_folder arguments. */
export const createFolderArgsSchema = z.object({
	name: z.string().min(1),
	spaceId: z.number(),
	parentId: z.number().optional(),
});

const log = getLog(import.meta);

/** Returns the tool definition for create_folder. */
export function createCreateFolderToolDefinition(): ToolDef {
	return {
		name: "create_folder",
		description: "Create a new folder in a space.",
		parameters: {
			type: "object",
			properties: {
				name: { type: "string", description: "Folder name" },
				spaceId: { type: "number", description: "The space ID to create the folder in" },
				parentId: {
					type: "number",
					description: "Parent folder ID. Omit or null for root level.",
				},
			},
			required: ["name", "spaceId"],
		},
	};
}

/** Executes the create_folder tool. */
export async function executeCreateFolderTool(
	deps: AgentHubToolDeps,
	userId: number,
	args: z.infer<typeof createFolderArgsSchema>,
): Promise<string> {
	const canEdit = await deps.permissionService.hasPermission(userId, "articles.edit");
	if (!canEdit) {
		return "You do not have permission to create folders.";
	}

	const docDao = deps.docDaoProvider.getDao(getTenantContext());
	const userIdStr = userId.toString();

	const doc = await docDao.createDoc({
		docType: "folder",
		contentType: "application/folder",
		content: "",
		contentMetadata: { title: args.name },
		spaceId: args.spaceId,
		parentId: args.parentId,
		source: undefined,
		sourceMetadata: undefined,
		createdBy: userIdStr,
		updatedBy: userIdStr,
	});

	log.info("Agent created folder %d '%s' in space %d", doc.id, args.name, args.spaceId);
	return JSON.stringify({ id: doc.id, name: args.name });
}
