/**
 * Tool definition and executor for the list_spaces agent hub tool.
 * Lists all documentation spaces the user has access to.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import type { AgentHubToolDeps } from "./AgentHubTools";

/** Returns the tool definition for list_spaces. */
export function createListSpacesToolDefinition(): ToolDef {
	return {
		name: "list_spaces",
		description: "Lists all documentation spaces the user has access to.",
		parameters: { type: "object", properties: {}, required: [] },
	};
}

/** Executes the list_spaces tool. */
export async function executeListSpacesTool(deps: AgentHubToolDeps, userId: number): Promise<string> {
	const canView = await deps.permissionService.hasPermission(userId, "spaces.view");
	if (!canView) {
		return "You do not have permission to view spaces.";
	}

	const spaceDao = deps.spaceDaoProvider.getDao(getTenantContext());
	const spaces = await spaceDao.listSpaces(userId);

	if (spaces.length === 0) {
		return "No spaces found. You may need to create a space first.";
	}

	const items = spaces.map(s => ({
		id: s.id,
		name: s.name,
		slug: s.slug,
		description: s.description ?? null,
	}));

	return JSON.stringify(items);
}
