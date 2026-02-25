import type { Doc } from "./Doc";

/**
 * Maximum number of search results returned by space search API.
 * This is a hard limit to prevent performance issues.
 */
export const SPACE_SEARCH_MAX_RESULTS = 50;

/**
 * Request parameters for space search
 */
export interface SpaceSearchRequest {
	query: string;
}

/**
 * Response from space search API
 */
export interface SpaceSearchResponse {
	/** Search results (up to SPACE_SEARCH_MAX_RESULTS) */
	results: Array<SpaceSearchResult>;
	/** Total number of matches (may exceed SPACE_SEARCH_MAX_RESULTS) */
	total: number;
	/** Whether results were truncated due to limit */
	limited: boolean;
}

/**
 * A single search result item
 */
export interface SpaceSearchResult {
	/** The matching document */
	doc: Doc;
	/** Content snippet with highlighted matches (HTML from ts_headline) */
	contentSnippet: string;
	/** Where the match was found */
	matchType: "title" | "content" | "both";
	/** Relevance score (0-1) */
	relevance: number;
}
