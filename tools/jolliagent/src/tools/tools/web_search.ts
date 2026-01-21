import type { RunState, ToolDef } from "../../Types";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS = 10;
const DEFAULT_SEARCH_DEPTH = "basic";
const DEFAULT_ENDPOINT = "https://api.tavily.com/search";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const web_search_tool_def: ToolDef = {
	name: "web_search",
	description: [
		"Search the web. Requires TAVILY_API_KEY in env or passed in env_vars.",
		`Defaults: search_depth='${DEFAULT_SEARCH_DEPTH}', max_results=${DEFAULT_MAX_RESULTS}. Returns top results with title, URL, and content snippets when available.`,
	].join(" "),
	parameters: {
		type: "object",
		properties: {
			query: { type: "string", description: "Search query (natural language)." },
			search_depth: {
				type: "string",
				description: "Search depth ('basic' or 'advanced'). Defaults to 'basic'.",
			},
			max_results: {
				type: "integer",
				description: `Number of results to return (1-${MAX_RESULTS}). Defaults to ${DEFAULT_MAX_RESULTS}.`,
			},
			include_domains: {
				type: "array",
				items: { type: "string" },
				description: "Optional list of domains to include (e.g., ['example.com']).",
			},
			exclude_domains: {
				type: "array",
				items: { type: "string" },
				description: "Optional list of domains to exclude (e.g., ['twitter.com']).",
			},
			include_answer: {
				type: "boolean",
				description: "Request a short direct answer when available.",
			},
			include_raw_content: {
				type: "boolean",
				description: "Include raw page content in results when available.",
			},
		},
		required: ["query"],
	},
};

type WebSearchArgs = {
	query?: string;
	search_depth?: string;
	max_results?: number;
	include_domains?: Array<string>;
	exclude_domains?: Array<string>;
	include_answer?: boolean;
	include_raw_content?: boolean;
	include_images?: boolean;
	api_key?: string;
	endpoint?: string;
};

type WebSearchResult = {
	title?: string;
	url?: string;
	content?: string;
	score?: number;
};

type WebSearchResponse = {
	results?: Array<WebSearchResult>;
	answer?: string;
	error?: string;
	message?: string;
};

function normalizeMaxResults(raw?: number): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) {
		return DEFAULT_MAX_RESULTS;
	}
	return Math.min(Math.floor(n), MAX_RESULTS);
}

function normalizeSearchDepth(raw?: string): string {
	const depth = raw?.trim().toLowerCase();
	if (depth === "advanced") {
		return "advanced";
	}
	return DEFAULT_SEARCH_DEPTH;
}

function coerceStringArray(raw?: Array<string>): Array<string> | undefined {
	if (!Array.isArray(raw)) {
		return;
	}
	const cleaned = raw.map(item => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
	return cleaned.length > 0 ? cleaned : undefined;
}

function formatResult(idx: number, result: WebSearchResult): string {
	const title = result.title?.trim() || "Untitled";
	const url = result.url?.trim() || "";
	const snippet = result.content?.trim() || "";
	const snippetLine = snippet ? ` — ${snippet}` : "";
	return `${idx}. ${title}${url ? ` (${url})` : ""}${snippetLine}`;
}

function getApiKey(runState: RunState, args: WebSearchArgs): string {
	return args.api_key?.trim() || runState.env_vars?.TAVILY_API_KEY || process.env.TAVILY_API_KEY || "";
}

async function executeWebSearch(runState: RunState, args: WebSearchArgs): Promise<string> {
	const query = args.query?.trim() || "";
	if (!query) {
		return "Error: Missing required parameter 'query' for web_search.";
	}

	const apiKey = getApiKey(runState, args);
	if (!apiKey) {
		return "Error: Missing TAVILY_API_KEY. Set it in the environment or runState.env_vars.";
	}

	const maxResults = normalizeMaxResults(args.max_results);
	const searchDepth = normalizeSearchDepth(args.search_depth);
	const endpoint = args.endpoint?.trim() || DEFAULT_ENDPOINT;
	const includeDomains = coerceStringArray(args.include_domains);
	const excludeDomains = coerceStringArray(args.exclude_domains);

	const payload: Record<string, unknown> = {
		api_key: apiKey,
		query,
		search_depth: searchDepth,
		max_results: maxResults,
	};

	if (includeDomains) {
		payload.include_domains = includeDomains;
	}
	if (excludeDomains) {
		payload.exclude_domains = excludeDomains;
	}
	if (args.include_answer === true) {
		payload.include_answer = true;
	}
	if (args.include_raw_content === true) {
		payload.include_raw_content = true;
	}
	if (args.include_images === true) {
		payload.include_images = true;
	}

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		const text = await response.text();
		if (!response.ok) {
			return `Web search API error (${response.status}): ${text || response.statusText}`;
		}

		const data = (text ? JSON.parse(text) : {}) as WebSearchResponse;
		if (data.error || data.message) {
			return `Web search API error: ${data.error || data.message}`;
		}

		const results = data.results || [];
		const answer = data.answer?.trim();

		if (results.length === 0 && answer) {
			return [`Web search answer for "${query}" (search_depth=${searchDepth}):`, answer].join("\n");
		}

		if (results.length === 0) {
			return `No web search results for "${query}".`;
		}

		const formatted = results.slice(0, maxResults).map((r, idx) => formatResult(idx + 1, r));
		const header = `Web search results for "${query}" (search_depth=${searchDepth}, max_results=${maxResults}):`;
		return answer ? [header, `Answer: ${answer}`, ...formatted].join("\n") : [header, ...formatted].join("\n");
	} catch (error) {
		const err = error as { message?: string };
		return `Error calling web search API: ${err.message ?? String(error)}`;
	}
}

export const webSearchExecutor: ToolExecutor = async (runState, args) => {
	const parsedArgs = (args || {}) as WebSearchArgs;
	return await executeWebSearch(runState, parsedArgs);
};
