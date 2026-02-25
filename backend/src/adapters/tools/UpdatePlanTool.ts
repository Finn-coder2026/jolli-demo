/**
 * Tool definition for the update_plan agent hub tool.
 * Updates the plan markdown and phase for a conversation.
 * Execution is handled at the router level (not in executeAgentHubTool)
 * because it needs access to the convo ID and SSE broadcast.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { z } from "zod";

/** Zod schema for update_plan arguments. */
export const updatePlanArgsSchema = z.object({
	plan: z.string().min(1),
	phase: z.enum(["planning", "executing", "complete"]).optional().default("planning"),
});

/** Returns the tool definition for update_plan. */
export function createUpdatePlanToolDefinition(): ToolDef {
	return {
		name: "update_plan",
		description:
			"Update the plan for this conversation. Call this whenever you create, revise, or advance the plan. Include the full plan markdown each time.",
		parameters: {
			type: "object",
			properties: {
				plan: {
					type: "string",
					description: "The full plan content in markdown format",
				},
				phase: {
					type: "string",
					enum: ["planning", "executing", "complete"],
					description:
						"The current phase of the plan. Use 'planning' while building, 'executing' when the user approves, 'complete' when done. Defaults to 'planning'.",
				},
			},
			required: ["plan"],
		},
	};
}
