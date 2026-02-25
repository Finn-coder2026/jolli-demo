/**
 * Tool definition and executor for the check_permissions agent hub tool.
 * Checks what permissions the current user has.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { AgentHubToolDeps } from "./AgentHubTools";

/** Returns the tool definition for check_permissions. */
export function createCheckPermissionsToolDefinition(): ToolDef {
	return {
		name: "check_permissions",
		description: "Check what permissions the current user has.",
		parameters: { type: "object", properties: {}, required: [] },
	};
}

/** Executes the check_permissions tool. */
export async function executeCheckPermissionsTool(deps: AgentHubToolDeps, userId: number): Promise<string> {
	const permissions = await deps.permissionService.getUserPermissions(userId);
	return JSON.stringify({ permissions });
}
