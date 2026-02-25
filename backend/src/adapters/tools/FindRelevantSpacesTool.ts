/**
 * Tool definition and executor for the find_relevant_spaces agent hub tool.
 * Two modes:
 * - Cross-space (no spaceId): Ranks all accessible spaces by relevance to a topic.
 * - Intra-space (with spaceId): Finds folders containing matching articles within a space.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { z } from "zod";

/** Default number of spaces/folders returned. */
const DEFAULT_MAX_RESULTS = 10;

/** Absolute ceiling for the maxResults parameter. */
const LIMIT_MAX_RESULTS = 50;

/** Default number of sample article titles per folder in intra-space mode. */
const DEFAULT_MAX_SAMPLE_ARTICLES = 3;

/** Absolute ceiling for the maxSampleArticles parameter. */
const LIMIT_MAX_SAMPLE_ARTICLES = 10;

/** Zod schema for find_relevant_spaces arguments. */
export const findRelevantSpacesArgsSchema = z.object({
	query: z.string().min(1),
	spaceId: z.number().optional(),
	maxResults: z.number().int().min(1).max(LIMIT_MAX_RESULTS).optional(),
	maxSampleArticles: z.number().int().min(1).max(LIMIT_MAX_SAMPLE_ARTICLES).optional(),
});

/** Returns the tool definition for find_relevant_spaces. */
export function createFindRelevantSpacesToolDefinition(): ToolDef {
	return {
		name: "find_relevant_spaces",
		description:
			"Find spaces or folders relevant to a topic. Without spaceId, ranks all spaces by relevance (name/description match + content hits). With spaceId, finds folders within that space containing matching articles.",
		parameters: {
			type: "object",
			properties: {
				query: { type: "string", description: "Topic or search query to find relevant spaces or folders" },
				spaceId: {
					type: "number",
					description: "Optional space ID to find relevant folders within a specific space",
				},
				maxResults: {
					type: "number",
					description: `Maximum number of spaces or folders to return (1-${LIMIT_MAX_RESULTS}, default ${DEFAULT_MAX_RESULTS})`,
				},
				maxSampleArticles: {
					type: "number",
					description: `Maximum sample article titles per folder in intra-space mode (1-${LIMIT_MAX_SAMPLE_ARTICLES}, default ${DEFAULT_MAX_SAMPLE_ARTICLES})`,
				},
			},
			required: ["query"],
		},
	};
}

/** Executes the find_relevant_spaces tool. */
export async function executeFindRelevantSpacesTool(
	deps: AgentHubToolDeps,
	userId: number,
	args: z.infer<typeof findRelevantSpacesArgsSchema>,
): Promise<string> {
	const [canViewSpaces, canViewArticles] = await Promise.all([
		deps.permissionService.hasPermission(userId, "spaces.view"),
		deps.permissionService.hasPermission(userId, "articles.view"),
	]);
	if (!canViewSpaces) {
		return "You do not have permission to view spaces.";
	}
	if (!canViewArticles) {
		return "You do not have permission to view articles.";
	}

	const tenantCtx = getTenantContext();
	const spaceDao = deps.spaceDaoProvider.getDao(tenantCtx);
	const docDao = deps.docDaoProvider.getDao(tenantCtx);
	const resultLimit = args.maxResults ?? DEFAULT_MAX_RESULTS;
	const sampleLimit = args.maxSampleArticles ?? DEFAULT_MAX_SAMPLE_ARTICLES;

	if (args.spaceId) {
		return await findRelevantFolders(spaceDao, docDao, args.spaceId, args.query, resultLimit, sampleLimit, userId);
	}

	return await rankSpaces(spaceDao, docDao, args.query, resultLimit, userId);
}

/** Cross-space mode: ranks all spaces by relevance to the query. */
async function rankSpaces(
	spaceDao: SpaceDaoLike,
	docDao: DocDaoLike,
	query: string,
	limit: number,
	userId: number,
): Promise<string> {
	const spaces = await spaceDao.listSpaces(userId);
	if (spaces.length === 0) {
		return JSON.stringify({ spaces: [], total: 0, message: "No spaces found." });
	}

	const queryLower = query.toLowerCase();
	const ranked = await Promise.all(
		spaces.map(async space => {
			const nameMatch =
				space.name.toLowerCase().includes(queryLower) ||
				(space.description ?? "").toLowerCase().includes(queryLower);
			const searchResult = await docDao.searchInSpace(space.id, query);
			const contentHits = searchResult.total;
			const stats = await spaceDao.getSpaceStats(space.id);

			return {
				id: space.id,
				name: space.name,
				slug: space.slug,
				description: space.description ?? null,
				relevance: { nameMatch, contentHits },
				stats: { docCount: stats.docCount, folderCount: stats.folderCount },
			};
		}),
	);

	// Filter out spaces with zero relevance (no name match AND no content hits)
	const relevant = ranked.filter(s => s.relevance.nameMatch || s.relevance.contentHits > 0);

	// Sort: name-match first, then by content hits descending
	relevant.sort((a, b) => {
		if (a.relevance.nameMatch !== b.relevance.nameMatch) {
			return a.relevance.nameMatch ? -1 : 1;
		}
		return b.relevance.contentHits - a.relevance.contentHits;
	});

	const capped = relevant.slice(0, limit);
	return JSON.stringify({ spaces: capped, total: relevant.length });
}

/** Intra-space mode: finds folders containing matching articles within a space. */
async function findRelevantFolders(
	spaceDao: SpaceDaoLike,
	docDao: DocDaoLike,
	spaceId: number,
	query: string,
	resultLimit: number,
	sampleLimit: number,
	userId: number,
): Promise<string> {
	const space = await spaceDao.getSpace(spaceId, userId);
	if (!space) {
		return JSON.stringify({ error: `Space with id ${spaceId} not found.` });
	}

	const searchResult = await docDao.searchInSpace(spaceId, query);
	if (searchResult.results.length === 0) {
		return JSON.stringify({ folders: [], totalArticleMatches: 0 });
	}

	// Group results by parentId
	const folderMap = new Map<number | null, Array<{ id: number; title: string }>>();
	for (const r of searchResult.results) {
		const parentId = r.doc.parentId ?? null;
		const title = (r.doc.contentMetadata as { title?: string } | undefined)?.title ?? r.doc.slug;
		const existing = folderMap.get(parentId);
		if (existing) {
			existing.push({ id: r.doc.id, title });
		} else {
			folderMap.set(parentId, [{ id: r.doc.id, title }]);
		}
	}

	// Look up folder names in parallel
	const parentIds = [...folderMap.keys()].filter((id): id is number => id !== null);
	const folderDocs = await Promise.all(parentIds.map(id => docDao.readDocById(id)));
	const folderNameMap = new Map<number, { name: string; path: string }>();
	for (let i = 0; i < parentIds.length; i++) {
		const doc = folderDocs[i];
		if (doc) {
			const name = (doc.contentMetadata as { title?: string } | undefined)?.title ?? doc.slug;
			folderNameMap.set(parentIds[i], { name, path: doc.path });
		} else {
			folderNameMap.set(parentIds[i], { name: `Folder ${parentIds[i]}`, path: "" });
		}
	}

	// Build folder list
	const folders: Array<{
		folderId: number | null;
		folderName: string;
		folderPath: string;
		articleHits: number;
		sampleArticles: Array<string>;
	}> = [];

	for (const [parentId, articles] of folderMap) {
		const folderInfo = parentId !== null ? folderNameMap.get(parentId) : undefined;
		const folderName = folderInfo ? folderInfo.name : parentId !== null ? `Folder ${parentId}` : "(root)";
		const folderPath = folderInfo ? folderInfo.path : "";
		folders.push({
			folderId: parentId,
			folderName,
			folderPath,
			articleHits: articles.length,
			sampleArticles: articles.slice(0, sampleLimit).map(a => a.title),
		});
	}

	// Sort by article hits descending, cap at resultLimit
	folders.sort((a, b) => b.articleHits - a.articleHits);
	const cappedFolders = folders.slice(0, resultLimit);

	return JSON.stringify({ folders: cappedFolders, totalArticleMatches: searchResult.results.length });
}

/** Minimal shape of SpaceDao used by this tool. */
interface SpaceDaoLike {
	listSpaces(
		userId?: number,
	): Promise<Array<{ id: number; name: string; slug: string; description: string | null | undefined }>>;
	getSpace(id: number, userId?: number): Promise<{ id: number; name: string } | undefined>;
	getSpaceStats(spaceId: number): Promise<{ docCount: number; folderCount: number }>;
}

/** Minimal shape of DocDao used by this tool. */
interface DocDaoLike {
	searchInSpace(
		spaceId: number,
		query: string,
	): Promise<{
		results: Array<{
			doc: {
				id: number;
				slug: string;
				path: string;
				parentId: number | undefined;
				contentMetadata: unknown;
			};
			contentSnippet: string;
			matchType: "title" | "content" | "both";
			relevance: number;
		}>;
		total: number;
	}>;
	readDocById(id: number): Promise<{ slug: string; path: string; contentMetadata: unknown } | undefined>;
}
