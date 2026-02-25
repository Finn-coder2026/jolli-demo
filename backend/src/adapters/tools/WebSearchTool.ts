/**
 * Tool definition and executor for the web_search agent hub tool.
 * Searches the web using the Tavily API for external information.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getConfig } from "../../config/Config";
import { z } from "zod";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS = 10;
const DEFAULT_SEARCH_DEPTH = "basic";
const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";

/** Zod schema for web_search arguments. */
export const webSearchArgsSchema = z.object({
	query: z.string().min(1),
	max_results: z.number().int().min(1).max(MAX_RESULTS).optional().default(DEFAULT_MAX_RESULTS),
	search_depth: z.enum(["basic", "advanced"]).optional().default(DEFAULT_SEARCH_DEPTH),
});

/** Shape of a single result from the Tavily API. */
interface TavilySearchResult {
	readonly title?: string;
	readonly url?: string;
	readonly content?: string;
}

/** Shape of the Tavily search API response. */
interface TavilySearchResponse {
	readonly results?: ReadonlyArray<TavilySearchResult>;
	readonly answer?: string;
	readonly error?: string;
	readonly message?: string;
}

/** Formats a single search result as a numbered line. */
function formatResult(idx: number, result: TavilySearchResult): string {
	const title = result.title?.trim() || "Untitled";
	const url = result.url?.trim() || "";
	const snippet = result.content?.trim() || "";
	const snippetLine = snippet ? ` — ${snippet}` : "";
	return `${idx}. ${title}${url ? ` (${url})` : ""}${snippetLine}`;
}

/** Returns the tool definition for web_search. */
export function createWebSearchToolDefinition(): ToolDef {
	return {
		name: "web_search",
		description:
			"Search the web for current information. Use when the user asks about external topics, recent events, or information not in the documentation.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query in natural language",
				},
				max_results: {
					type: "integer",
					description: `Number of results to return (1-${MAX_RESULTS}). Defaults to ${DEFAULT_MAX_RESULTS}.`,
				},
				search_depth: {
					type: "string",
					enum: ["basic", "advanced"],
					description: "Search depth. 'basic' is faster, 'advanced' is more thorough. Defaults to 'basic'.",
				},
			},
			required: ["query"],
		},
	};
}

/**
 * Executes the web_search tool.
 * Posts to the Tavily search API and returns formatted results.
 */
export async function executeWebSearchTool(args: z.infer<typeof webSearchArgsSchema>): Promise<string> {
	const apiKey = getConfig().TAVILY_API_KEY;
	if (!apiKey) {
		return "Web search is not available — the TAVILY_API_KEY is not configured.";
	}

	const payload = {
		api_key: apiKey,
		query: args.query,
		search_depth: args.search_depth,
		max_results: args.max_results,
	};

	try {
		const response = await fetch(TAVILY_SEARCH_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		const text = await response.text();
		if (!response.ok) {
			return `Web search API error (${response.status}): ${text || response.statusText}`;
		}

		const data = (text ? JSON.parse(text) : {}) as TavilySearchResponse;
		if (data.error || data.message) {
			return `Web search API error: ${data.error || data.message}`;
		}

		const results = data.results ?? [];
		if (results.length === 0) {
			return `No web search results found for "${args.query}".`;
		}

		const formatted = results.slice(0, args.max_results).map((r, idx) => formatResult(idx + 1, r));
		const header = `Web search results for "${args.query}":`;
		return [header, ...formatted].join("\n");
	} catch (error) {
		const err = error as { message?: string };
		return `Error calling web search API: ${err.message ?? String(error)}`;
	}
}
