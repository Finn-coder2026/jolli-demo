/**
 * Type definitions for LLM-based API extraction.
 */

/**
 * Configuration for the LLM extractor.
 */
export interface LLMExtractorConfig {
	/** API key for Anthropic API (reads from ANTHROPIC_API_KEY env if not provided) */
	apiKey?: string;
	/** Model to use (default: claude-sonnet-4-20250514) */
	model?: string;
	/** Maximum tokens per chunk (default: 8000) */
	maxChunkTokens?: number;
	/** Maximum concurrent LLM requests (default: 2) */
	maxConcurrency?: number;
}

/**
 * A chunk of code to send to the LLM.
 */
export interface CodeChunk {
	/** Files included in this chunk */
	files: Array<string>;
	/** Combined content of all files */
	content: string;
	/** Estimated token count */
	tokenCount: number;
}

/**
 * Cost estimate for LLM extraction.
 */
export interface LLMCostEstimate {
	/** Total input tokens to be processed */
	inputTokens: number;
	/** Estimated output tokens */
	outputTokens: number;
	/** Estimated cost in USD */
	estimatedCost: number;
	/** Number of chunks to process */
	chunksToProcess: number;
	/** Files to be analyzed */
	filesToAnalyze: number;
}

/**
 * Route extracted by the LLM.
 */
export interface LLMExtractedRoute {
	/** URL path (using {param} format for path parameters) */
	path: string;
	/** HTTP method */
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
	/** Brief description */
	summary?: string;
	/** Parameters */
	parameters?: Array<LLMExtractedParameter>;
	/** Request body */
	requestBody?: LLMExtractedRequestBody;
	/** Responses */
	responses?: Record<string, LLMExtractedResponse>;
	/** Confidence in this extraction (0.0 - 1.0) */
	confidence?: number;
	/** Source file where route was found */
	sourceFile?: string;
}

/**
 * Parameter extracted by the LLM.
 */
export interface LLMExtractedParameter {
	/** Parameter name */
	name: string;
	/** Parameter location */
	in: "query" | "header" | "path" | "cookie";
	/** Parameter type */
	type?: string;
	/** Whether parameter is required */
	required?: boolean;
	/** Description */
	description?: string;
}

/**
 * Request body extracted by the LLM.
 */
export interface LLMExtractedRequestBody {
	/** Content type */
	contentType?: string;
	/** Schema description */
	schema?: {
		type?: string;
		properties?: Record<string, unknown>;
	};
}

/**
 * Response extracted by the LLM.
 */
export interface LLMExtractedResponse {
	/** Response description */
	description?: string;
	/** Schema description */
	schema?: {
		type?: string;
		properties?: Record<string, unknown>;
	};
}

/**
 * Result from LLM extraction.
 */
export interface LLMExtractionResult {
	/** Extracted routes */
	routes: Array<LLMExtractedRoute>;
	/** Cost information */
	cost: {
		inputTokens: number;
		outputTokens: number;
		estimatedCost: number;
		chunksProcessed: number;
	};
	/** Any warnings or issues */
	warnings: Array<string>;
}
