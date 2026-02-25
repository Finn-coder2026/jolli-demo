/**
 * Tool definition and executor for the find_relevant_articles agent hub tool.
 * Searches for articles by content and title across all spaces, returning
 * rich results with content snippets, relevance scores, and space context.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { z } from "zod";

/** Default number of results to return across all spaces. */
const DEFAULT_MAX_RESULTS = 20;

/** Absolute ceiling for the maxResults parameter. */
const LIMIT_MAX_RESULTS = 50;

/** Zod schema for find_relevant_articles arguments. */
export const findRelevantArticlesArgsSchema = z.object({
	query: z.string().min(1),
	spaceId: z.number().optional(),
	maxResults: z.number().int().min(1).max(LIMIT_MAX_RESULTS).optional(),
});

/** Returns the tool definition for find_relevant_articles. */
export function createFindRelevantArticlesToolDefinition(): ToolDef {
	return {
		name: "find_relevant_articles",
		description:
			"Search for articles by content and title across all spaces. Returns content snippets and relevance scores to help identify existing articles related to a topic. Optionally filter to a specific space.",
		parameters: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search query for article content and titles" },
				spaceId: {
					type: "number",
					description: "Optional space ID to restrict the search to a single space",
				},
				maxResults: {
					type: "number",
					description: `Maximum number of results to return (1-${LIMIT_MAX_RESULTS}, default ${DEFAULT_MAX_RESULTS})`,
				},
			},
			required: ["query"],
		},
	};
}

/** Executes the find_relevant_articles tool. */
export async function executeFindRelevantArticlesTool(
	deps: AgentHubToolDeps,
	userId: number,
	args: z.infer<typeof findRelevantArticlesArgsSchema>,
): Promise<string> {
	const canView = await deps.permissionService.hasPermission(userId, "articles.view");
	if (!canView) {
		return "You do not have permission to view articles.";
	}

	const tenantCtx = getTenantContext();
	const docDao = deps.docDaoProvider.getDao(tenantCtx);
	const spaceDao = deps.spaceDaoProvider.getDao(tenantCtx);
	const limit = args.maxResults ?? DEFAULT_MAX_RESULTS;

	if (args.spaceId) {
		return await searchSingleSpace(docDao, args.spaceId, args.query, limit);
	}

	return await searchAllSpaces(docDao, spaceDao, args.query, limit, userId);
}

/** Searches a single space and returns rich results. */
async function searchSingleSpace(
	docDao: {
		searchInSpace: (
			spaceId: number,
			query: string,
		) => Promise<{ results: Array<SpaceSearchResultLike>; total: number }>;
	},
	spaceId: number,
	query: string,
	limit: number,
): Promise<string> {
	const result = await docDao.searchInSpace(spaceId, query);
	const items = result.results.slice(0, limit).map(r => formatResult(r, spaceId, ""));
	return JSON.stringify({ results: items, total: result.total });
}

/** Searches all spaces and merges results sorted by relevance. */
async function searchAllSpaces(
	docDao: {
		searchInSpace: (
			spaceId: number,
			query: string,
		) => Promise<{ results: Array<SpaceSearchResultLike>; total: number }>;
	},
	spaceDao: { listSpaces: (userId?: number) => Promise<Array<{ id: number; name: string }>> },
	query: string,
	limit: number,
	userId: number,
): Promise<string> {
	const spaces = await spaceDao.listSpaces(userId);
	if (spaces.length === 0) {
		return JSON.stringify({ results: [], total: 0, message: "No spaces found." });
	}

	const spaceNameMap = new Map(spaces.map(s => [s.id, s.name]));
	const searchResults = await Promise.all(spaces.map(s => docDao.searchInSpace(s.id, query)));

	const merged: Array<{ result: SpaceSearchResultLike; spaceId: number; spaceName: string }> = [];
	for (let i = 0; i < spaces.length; i++) {
		const spaceName = spaceNameMap.get(spaces[i].id) as string;
		for (const r of searchResults[i].results) {
			merged.push({ result: r, spaceId: spaces[i].id, spaceName });
		}
	}

	merged.sort((a, b) => b.result.relevance - a.result.relevance);
	const capped = merged.slice(0, limit);
	const items = capped.map(({ result, spaceId, spaceName }) => formatResult(result, spaceId, spaceName));

	return JSON.stringify({ results: items, total: merged.length });
}

/** Formats a single search result into the rich output shape. */
function formatResult(
	r: SpaceSearchResultLike,
	spaceId: number,
	spaceName: string,
): {
	id: number;
	title: string;
	spaceId: number;
	spaceName: string;
	jrn: string;
	path: string;
	contentSnippet: string;
	matchType: string;
	relevance: number;
} {
	return {
		id: r.doc.id,
		title: (r.doc.contentMetadata as { title?: string } | undefined)?.title ?? r.doc.slug,
		spaceId,
		spaceName,
		jrn: r.doc.jrn,
		path: r.doc.path,
		contentSnippet: r.contentSnippet,
		matchType: r.matchType,
		relevance: r.relevance,
	};
}

/** Minimal shape of SpaceSearchResult used by this tool. */
interface SpaceSearchResultLike {
	doc: {
		id: number;
		slug: string;
		jrn: string;
		path: string;
		spaceId: number | undefined;
		contentMetadata: unknown;
	};
	contentSnippet: string;
	matchType: "title" | "content" | "both";
	relevance: number;
}
