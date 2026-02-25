/**
 * Tool definition and executor for the navigate_user agent hub tool.
 * Navigates the user to a page in the app.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { NavigationActionResult } from "./AgentHubTools";
import { z } from "zod";

/** Zod schema for navigate_user arguments. */
export const navigateUserArgsSchema = z.object({
	target: z.enum(["article-draft", "articles"]),
	targetId: z.number(),
	label: z.string().min(1),
});

/** Returns the tool definition for navigate_user. */
export function createNavigateUserToolDefinition(): ToolDef {
	return {
		name: "navigate_user",
		description:
			"Navigate the user to a page in the app. IMPORTANT: Always ask the user for confirmation before calling this tool.",
		parameters: {
			type: "object",
			properties: {
				target: {
					type: "string",
					enum: ["article-draft", "articles"],
					description: "The type of page to navigate to",
				},
				targetId: {
					type: "number",
					description: "The ID of the target (draft ID for article-draft, doc ID for articles)",
				},
				label: {
					type: "string",
					description: "Human-readable link text for the navigation",
				},
			},
			required: ["target", "targetId", "label"],
		},
	};
}

/**
 * Executes the navigate_user tool.
 * Returns a special object flagged for navigation action emission.
 */
export function executeNavigateUserTool(args: z.infer<typeof navigateUserArgsSchema>): string {
	let path: string;
	switch (args.target) {
		case "article-draft":
			path = `/article-draft/${args.targetId}`;
			break;
		case "articles":
			path = `/articles?doc=${args.targetId}`;
			break;
		default:
			return `Unknown navigation target: ${args.target}`;
	}

	const result: NavigationActionResult = {
		__navigationAction: true,
		path,
		label: args.label,
	};
	return JSON.stringify(result);
}
