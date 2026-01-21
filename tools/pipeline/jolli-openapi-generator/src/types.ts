/**
 * Type definitions for the OpenAPI generator.
 */

/**
 * Options for generating OpenAPI specification.
 */
export interface GeneratorOptions {
	/** Path to the repository to scan */
	repo: string;
	/** Output file path (default: openapi.json or openapi.yaml) */
	output: string;
	/** Output format: json or yaml (default: json) */
	format: "json" | "yaml";
	/** API title (default: inferred from repo name) */
	title?: string;
	/** API version (default: 1.0.0) */
	version?: string;
	/** API description */
	description?: string;
	/** Server URL to include in the spec */
	serverUrl?: string;
	/** Path to operationId mapping file */
	operationIdMapping?: string;
	/** Include only specific paths (glob patterns) */
	includePaths?: Array<string>;
	/** Exclude specific paths (glob patterns) */
	excludePaths?: Array<string>;
	/** LLM options for fallback extraction */
	llm?: LLMOptions;
}

/**
 * Options for LLM-based extraction.
 */
export interface LLMOptions {
	/** Enable LLM fallback (default: false) */
	enabled: boolean;
	/** Coverage threshold below which to trigger LLM fallback (default: 20) */
	threshold: number;
	/** Force LLM extraction regardless of coverage */
	forceOnly?: boolean;
	/** API key for Anthropic API (reads from ANTHROPIC_API_KEY env if not provided) */
	apiKey?: string;
	/** Model to use (default: claude-sonnet-4-20250514) */
	model?: string;
	/** Maximum tokens per chunk (default: 8000) */
	maxChunkTokens?: number;
	/** Only estimate cost, don't actually call LLM */
	estimateCostOnly?: boolean;
}

/**
 * Result from the OpenAPI generation process.
 */
export interface GeneratorResult {
	/** The generated OpenAPI specification */
	spec: OpenApiSpec;
	/** Summary of what was generated */
	summary: GeneratorSummary;
}

/**
 * Summary of the generation process.
 */
export interface GeneratorSummary {
	/** Total number of routes found */
	totalRoutes: number;
	/** Number of routes with request bodies */
	routesWithRequestBody: number;
	/** Number of routes with responses defined */
	routesWithResponses: number;
	/** Frameworks detected */
	frameworksDetected: Array<string>;
	/** Routes by HTTP method */
	routesByMethod: Record<string, number>;
	/** Detection metadata (Phase 1-4 results) */
	detection?: DetectionMetadata;
}

/**
 * Metadata from the intelligent detection flow.
 */
export interface DetectionMetadata {
	/** How the spec was obtained */
	source: "existing_spec" | "ast_full" | "ast_jsdoc" | "ast_basic" | "llm_analysis" | "hybrid";
	/** Detected language */
	language: string;
	/** Detected framework */
	framework: string;
	/** Framework category (determines extraction strategy) */
	frameworkCategory: "schema-enforced" | "semi-structured" | "minimal";
	/** Confidence in the extraction (0.0 - 1.0) */
	confidence: number;
	/** Coverage metrics */
	coverage: {
		routesFound: number;
		estimatedTotal: number;
		percentage: number;
	};
	/** Whether existing OpenAPI spec was found */
	existingSpecFound: boolean;
	/** Path to existing spec if found */
	existingSpecPath?: string;
	/** Recommendation for the result */
	recommendation: "use" | "warn" | "fallback";
	/** Reason for recommendation */
	recommendationReason: string;
	/** Cost information if LLM was used */
	cost?: LLMCostInfo;
}

/**
 * Cost information for LLM usage.
 */
export interface LLMCostInfo {
	/** Total input tokens processed */
	inputTokens: number;
	/** Total output tokens generated */
	outputTokens: number;
	/** Estimated cost in USD */
	estimatedCost: number;
	/** Number of chunks processed */
	chunksProcessed: number;
}

/**
 * OpenAPI 3.0 Specification structure.
 */
export interface OpenApiSpec {
	openapi: "3.0.0" | "3.0.3" | "3.1.0";
	info: OpenApiInfo;
	servers?: Array<OpenApiServer>;
	paths: Record<string, OpenApiPathItem>;
	components?: OpenApiComponents;
	tags?: Array<OpenApiTag>;
	/** Support for x-* extensions */
	[key: `x-${string}`]: unknown;
}

/**
 * OpenAPI Info object.
 */
export interface OpenApiInfo {
	title: string;
	version: string;
	description?: string;
	termsOfService?: string;
	contact?: {
		name?: string;
		email?: string;
		url?: string;
	};
	license?: {
		name: string;
		url?: string;
	};
}

/**
 * OpenAPI Server object.
 */
export interface OpenApiServer {
	url: string;
	description?: string;
}

/**
 * OpenAPI Path Item object.
 */
export interface OpenApiPathItem {
	get?: OpenApiOperation;
	post?: OpenApiOperation;
	put?: OpenApiOperation;
	delete?: OpenApiOperation;
	patch?: OpenApiOperation;
	options?: OpenApiOperation;
	head?: OpenApiOperation;
	summary?: string;
	description?: string;
}

/**
 * OpenAPI Operation object.
 */
export interface OpenApiOperation {
	operationId: string;
	summary?: string;
	description?: string;
	tags?: Array<string>;
	parameters?: Array<OpenApiParameter>;
	requestBody?: OpenApiRequestBody;
	responses: Record<string, OpenApiResponse>;
	deprecated?: boolean;
}

/**
 * OpenAPI Parameter object.
 */
export interface OpenApiParameter {
	name: string;
	in: "query" | "header" | "path" | "cookie";
	description?: string;
	required?: boolean;
	schema: OpenApiSchema;
}

/**
 * OpenAPI Request Body object.
 */
export interface OpenApiRequestBody {
	description?: string;
	required?: boolean;
	content: Record<string, OpenApiMediaType>;
}

/**
 * OpenAPI Media Type object.
 */
export interface OpenApiMediaType {
	schema: OpenApiSchema;
}

/**
 * OpenAPI Response object.
 */
export interface OpenApiResponse {
	description: string;
	content?: Record<string, OpenApiMediaType>;
}

/**
 * OpenAPI Schema object (simplified).
 */
export interface OpenApiSchema {
	type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
	properties?: Record<string, OpenApiSchema>;
	items?: OpenApiSchema;
	required?: Array<string>;
	description?: string;
	format?: string;
	enum?: Array<string | number>;
	example?: unknown;
	title?: string;
	$ref?: string;
}

/**
 * OpenAPI Components object.
 */
export interface OpenApiComponents {
	schemas?: Record<string, OpenApiSchema>;
	securitySchemes?: Record<string, OpenApiSecurityScheme>;
}

/**
 * OpenAPI Security Scheme object.
 */
export interface OpenApiSecurityScheme {
	type: "apiKey" | "http" | "oauth2" | "openIdConnect";
	description?: string;
	name?: string;
	in?: "query" | "header" | "cookie";
	scheme?: string;
	bearerFormat?: string;
}

/**
 * OpenAPI Tag object.
 */
export interface OpenApiTag {
	name: string;
	description?: string;
	externalDocs?: {
		description?: string;
		url?: string;
	};
}
