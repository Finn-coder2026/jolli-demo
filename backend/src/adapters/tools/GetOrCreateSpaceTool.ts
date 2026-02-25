/**
 * Tool definition and executor for the get_or_create_space agent hub tool.
 * Gets an existing space by name or creates a new one.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import { getLog } from "../../util/Logger";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { DEFAULT_SPACE_FILTERS } from "jolli-common";
import { generateSlug } from "jolli-common/server";
import { z } from "zod";

const log = getLog(import.meta);

/** Zod schema for get_or_create_space arguments. */
export const getOrCreateSpaceArgsSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
});

/** Returns the tool definition for get_or_create_space. */
export function createGetOrCreateSpaceToolDefinition(): ToolDef {
	return {
		name: "get_or_create_space",
		description: "Get an existing documentation space by name, or create a new one if it doesn't exist.",
		parameters: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description: "The name of the space to find or create",
				},
				description: {
					type: "string",
					description: "Optional description for the space (used only when creating)",
				},
			},
			required: ["name"],
		},
	};
}

/** Executes the get_or_create_space tool. */
export async function executeGetOrCreateSpaceTool(
	deps: AgentHubToolDeps,
	userId: number,
	args: z.infer<typeof getOrCreateSpaceArgsSchema>,
): Promise<string> {
	const canEdit = await deps.permissionService.hasPermission(userId, "spaces.edit");
	if (!canEdit) {
		return "You do not have permission to create or manage spaces.";
	}

	const spaceDao = deps.spaceDaoProvider.getDao(getTenantContext());
	const baseSlug = generateSlug(args.name);

	// Check for existing space by slug
	const existing = await spaceDao.getSpaceBySlug(baseSlug);
	if (existing) {
		log.info("Found existing space '%s' (id=%d) for name '%s'", existing.name, existing.id, args.name);
		return JSON.stringify({ id: existing.id, name: existing.name, created: false });
	}

	// Use timestamp suffix to avoid slug collisions on concurrent creates
	const uniqueSlug = `${baseSlug}-${Date.now()}`;

	// Create new space
	const newSpace = await spaceDao.createSpace({
		name: args.name,
		slug: uniqueSlug,
		description: args.description ?? `Documentation space for ${args.name}`,
		ownerId: userId,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { ...DEFAULT_SPACE_FILTERS },
	});

	log.info("Created space '%s' (id=%d) for user %d", newSpace.name, newSpace.id, userId);
	return JSON.stringify({ id: newSpace.id, name: newSpace.name, created: true });
}
