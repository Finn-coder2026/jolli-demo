import type { RunState, ToolDef } from "../../Types";

const DEFAULT_EXTRACT_DEPTH = "basic";
const DEFAULT_FORMAT = "markdown";
const DEFAULT_ENDPOINT = "https://api.tavily.com/extract";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const web_extract_tool_def: ToolDef = {
	name: "web_extract",
	description: [
		"Extract full content from one or more URLs. Requires TAVILY_API_KEY in env or passed in env_vars.",
		`Defaults: extract_depth='${DEFAULT_EXTRACT_DEPTH}', format='${DEFAULT_FORMAT}'.`,
		"Returns raw page content in markdown or text format.",
	].join(" "),
	parameters: {
		type: "object",
		properties: {
			urls: {
				oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
				description: "Single URL or array of URLs to extract content from.",
			},
			extract_depth: {
				type: "string",
				description:
					"Extraction depth ('basic' or 'advanced'). Advanced retrieves more data including tables and embedded content. Defaults to 'basic'.",
			},
			format: {
				type: "string",
				description: "Content format ('markdown' or 'text'). Defaults to 'markdown'.",
			},
			include_images: {
				type: "boolean",
				description: "Include extracted images in response. Defaults to false.",
			},
			timeout: {
				type: "number",
				description: "Maximum wait time in seconds (1.0-60.0) before extraction times out.",
			},
		},
		required: ["urls"],
	},
};

type WebExtractArgs = {
	urls?: string | Array<string>;
	extract_depth?: string;
	format?: string;
	include_images?: boolean;
	timeout?: number;
	api_key?: string;
	endpoint?: string;
};

type WebExtractResult = {
	url?: string;
	raw_content?: string;
	images?: Array<string>;
	favicon?: string;
};

type WebExtractFailedResult = {
	url?: string;
	error?: string;
};

type WebExtractResponse = {
	results?: Array<WebExtractResult>;
	failed_results?: Array<WebExtractFailedResult>;
	response_time?: number;
	request_id?: string;
	error?: string;
	message?: string;
};

function normalizeExtractDepth(raw?: string): string {
	const depth = raw?.trim().toLowerCase();
	if (depth === "advanced") {
		return "advanced";
	}
	return DEFAULT_EXTRACT_DEPTH;
}

function normalizeFormat(raw?: string): string {
	const format = raw?.trim().toLowerCase();
	if (format === "text") {
		return "text";
	}
	return DEFAULT_FORMAT;
}

function normalizeUrls(raw?: string | Array<string>): Array<string> {
	if (!raw) {
		return [];
	}
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		return trimmed ? [trimmed] : [];
	}
	if (Array.isArray(raw)) {
		return raw.map(url => (typeof url === "string" ? url.trim() : "")).filter(Boolean);
	}
	return [];
}

function normalizeTimeout(raw?: number): number | undefined {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1.0) {
		return;
	}
	return Math.min(n, 60.0);
}

function formatResult(result: WebExtractResult): string {
	const url = result.url?.trim() || "Unknown URL";
	const content = result.raw_content?.trim() || "(No content extracted)";
	const imageCount = result.images?.length || 0;
	const imageInfo = imageCount > 0 ? `\n[${imageCount} image(s) extracted]` : "";
	return `## ${url}${imageInfo}\n\n${content}`;
}

function formatFailedResult(result: WebExtractFailedResult): string {
	const url = result.url?.trim() || "Unknown URL";
	const error = result.error?.trim() || "Unknown error";
	return `- ${url}: ${error}`;
}

function getApiKey(runState: RunState, args: WebExtractArgs): string {
	return args.api_key?.trim() || runState.env_vars?.TAVILY_API_KEY || process.env.TAVILY_API_KEY || "";
}

async function executeWebExtract(runState: RunState, args: WebExtractArgs): Promise<string> {
	const urls = normalizeUrls(args.urls);
	if (urls.length === 0) {
		return "Error: Missing required parameter 'urls' for web_extract.";
	}

	const apiKey = getApiKey(runState, args);
	if (!apiKey) {
		return "Error: Missing TAVILY_API_KEY. Set it in the environment or runState.env_vars.";
	}

	const extractDepth = normalizeExtractDepth(args.extract_depth);
	const format = normalizeFormat(args.format);
	const endpoint = args.endpoint?.trim() || DEFAULT_ENDPOINT;
	const timeout = normalizeTimeout(args.timeout);

	const payload: Record<string, unknown> = {
		urls,
		extract_depth: extractDepth,
		format,
	};

	if (args.include_images === true) {
		payload.include_images = true;
	}
	if (timeout !== undefined) {
		payload.timeout = timeout;
	}

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(payload),
		});

		const text = await response.text();
		if (!response.ok) {
			return `Web extract API error (${response.status}): ${text || response.statusText}`;
		}

		const data = (text ? JSON.parse(text) : {}) as WebExtractResponse;
		if (data.error || data.message) {
			return `Web extract API error: ${data.error || data.message}`;
		}

		const results = data.results || [];
		const failedResults = data.failed_results || [];

		if (results.length === 0 && failedResults.length === 0) {
			return `No content extracted from ${urls.length} URL(s).`;
		}

		const parts: Array<string> = [];
		const header = `Web extract results (extract_depth=${extractDepth}, format=${format}):`;
		parts.push(header);

		if (results.length > 0) {
			parts.push(`\n### Successfully extracted (${results.length} URL(s)):\n`);
			for (const result of results) {
				parts.push(formatResult(result));
				parts.push("\n---\n");
			}
		}

		if (failedResults.length > 0) {
			parts.push(`\n### Failed extractions (${failedResults.length} URL(s)):\n`);
			for (const failed of failedResults) {
				parts.push(formatFailedResult(failed));
			}
		}

		return parts.join("\n");
	} catch (error) {
		const err = error as { message?: string };
		return `Error calling web extract API: ${err.message ?? String(error)}`;
	}
}

export const webExtractExecutor: ToolExecutor = async (runState, args) => {
	const parsedArgs = (args || {}) as WebExtractArgs;
	return await executeWebExtract(runState, parsedArgs);
};
