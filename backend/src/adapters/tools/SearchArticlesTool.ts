/**
 * Tool definition and executor for the search_articles agent hub tool.
 * Searches for articles by title, optionally filtered to a specific space.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { z } from "zod";

/** Zod schema for search_articles arguments. */
export const searchArticlesArgsSchema = z.object({
	query: z.string().min(1),
	spaceId: z.number().optional(),
});

/** Returns the tool definition for search_articles. */
export function createSearchArticlesToolDefinition(): ToolDef {
	return {
		name: "search_articles",
		description: "Search for articles by title. Optionally filter to a specific space.",
		parameters: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search query for article titles" },
				spaceId: {
					type: "number",
					description: "Optional space ID to restrict the search",
				},
			},
			required: ["query"],
		},
	};
}

/** Executes the search_articles tool. */
export async function executeSearchArticlesTool(
	deps: AgentHubToolDeps,
	userId: number,
	args: z.infer<typeof searchArticlesArgsSchema>,
): Promise<string> {
	const canView = await deps.permissionService.hasPermission(userId, "articles.view");
	if (!canView) {
		return "You do not have permission to view articles.";
	}

	const docDao = deps.docDaoProvider.getDao(getTenantContext());

	if (args.spaceId) {
		const result = await docDao.searchInSpace(args.spaceId, args.query);
		const items = result.results.map(r => ({
			id: r.doc.id,
			title: (r.doc.contentMetadata as { title?: string } | undefined)?.title ?? r.doc.slug,
			spaceId: r.doc.spaceId,
			jrn: r.doc.jrn,
		}));
		return JSON.stringify({ results: items, total: result.total });
	}

	const docs = await docDao.searchDocsByTitle(args.query, userId);
	const items = docs.map(d => ({
		id: d.id,
		title: (d.contentMetadata as { title?: string } | undefined)?.title ?? d.slug,
		spaceId: d.spaceId,
		jrn: d.jrn,
	}));
	return JSON.stringify({ results: items });
}
