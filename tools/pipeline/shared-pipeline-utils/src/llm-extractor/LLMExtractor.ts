/**
 * LLM-based API route extraction.
 *
 * Uses Claude to analyze code and extract HTTP API endpoints when
 * AST-based extraction yields poor results.
 */

import type {
	CodeChunk,
	LLMExtractedRoute,
	LLMExtractionResult,
	LLMExtractorConfig,
} from "./types.js";
import { estimateLLMCost, findRouteFiles, prepareChunks } from "./CodeChunker.js";

/** Prompt for LLM extraction */
const EXTRACTION_PROMPT = `Analyze the following code and extract all HTTP API endpoints.

For each endpoint, provide:
- path: The URL path (use {param} format for path parameters, e.g., /users/{id})
- method: HTTP method (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
- summary: Brief description of what this endpoint does
- parameters: Array of { name, in, type, required, description } for path/query/header params
- requestBody: { contentType, schema: { type, properties } } if applicable
- responses: { statusCode: { description, schema } }

Look for:
1. Explicit route registrations (app.get, router.post, @GetMapping, @app.get, r.GET, etc.)
2. Dynamic/programmatic route registration
3. Route configuration objects
4. Middleware that defines routes
5. Framework-specific patterns (decorators, annotations, etc.)

IMPORTANT: Return ONLY valid JSON matching this schema, with no markdown or explanation:
{
  "routes": [
    {
      "path": "/users/{id}",
      "method": "GET",
      "summary": "Get user by ID",
      "parameters": [
        { "name": "id", "in": "path", "type": "string", "required": true }
      ],
      "responses": {
        "200": { "description": "User found" }
      }
    }
  ]
}`;

/** Default configuration */
const DEFAULT_CONFIG: Required<LLMExtractorConfig> = {
	apiKey: process.env.ANTHROPIC_API_KEY ?? "",
	model: "claude-sonnet-4-20250514",
	maxChunkTokens: 8000,
	maxConcurrency: 2,
};

/**
 * Extracts API routes from a repository using LLM analysis.
 * @param repoPath - Path to the repository
 * @param config - Extractor configuration
 * @returns Extraction result with routes and cost info
 */
export async function extractWithLLM(
	repoPath: string,
	config?: Partial<LLMExtractorConfig>,
): Promise<LLMExtractionResult> {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	if (!cfg.apiKey) {
		throw new Error("ANTHROPIC_API_KEY environment variable or apiKey config is required for LLM extraction");
	}

	// Find route files
	const files = await findRouteFiles(repoPath);
	if (files.length === 0) {
		return {
			routes: [],
			cost: { inputTokens: 0, outputTokens: 0, estimatedCost: 0, chunksProcessed: 0 },
			warnings: ["No route files found in repository"],
		};
	}

	// Prepare chunks
	const chunks = await prepareChunks(repoPath, files, cfg.maxChunkTokens);

	// Extract routes from each chunk
	const allRoutes: Array<LLMExtractedRoute> = [];
	const warnings: Array<string> = [];
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	// Process chunks with concurrency limit
	for (let i = 0; i < chunks.length; i += cfg.maxConcurrency) {
		const batch = chunks.slice(i, i + cfg.maxConcurrency);
		const results = await Promise.all(
			batch.map(async (chunk, batchIndex) => {
				try {
					return await extractFromChunk(chunk, cfg, i + batchIndex + 1, chunks.length);
				} catch (error) {
					const msg = error instanceof Error ? error.message : String(error);
					warnings.push(`Chunk ${i + batchIndex + 1} failed: ${msg}`);
					return null;
				}
			}),
		);

		for (const result of results) {
			if (result) {
				allRoutes.push(...result.routes);
				totalInputTokens += result.inputTokens;
				totalOutputTokens += result.outputTokens;
			}
		}
	}

	// Deduplicate routes
	const deduplicated = deduplicateRoutes(allRoutes);

	// Validate routes
	const validated = validateRoutes(deduplicated);

	// Calculate cost
	const inputCostPer1K = 0.003;
	const outputCostPer1K = 0.015;
	const estimatedCost =
		(totalInputTokens / 1000) * inputCostPer1K + (totalOutputTokens / 1000) * outputCostPer1K;

	return {
		routes: validated,
		cost: {
			inputTokens: totalInputTokens,
			outputTokens: totalOutputTokens,
			estimatedCost: Math.round(estimatedCost * 10000) / 10000,
			chunksProcessed: chunks.length,
		},
		warnings,
	};
}

/**
 * Extracts routes from a single code chunk using the LLM.
 */
async function extractFromChunk(
	chunk: CodeChunk,
	config: Required<LLMExtractorConfig>,
	chunkNum: number,
	totalChunks: number,
): Promise<{ routes: Array<LLMExtractedRoute>; inputTokens: number; outputTokens: number }> {
	console.log(`  Processing chunk ${chunkNum}/${totalChunks} (${chunk.files.length} files)...`);

	const response = await callAnthropic(config.apiKey, config.model, EXTRACTION_PROMPT, chunk.content);

	// Parse the response
	let parsed: { routes?: Array<LLMExtractedRoute> };
	try {
		// Try to extract JSON from the response
		const jsonMatch = response.content.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error("No JSON found in response");
		}
		parsed = JSON.parse(jsonMatch[0]) as { routes?: Array<LLMExtractedRoute> };
	} catch {
		console.log(`    Warning: Could not parse LLM response for chunk ${chunkNum}`);
		return { routes: [], inputTokens: response.inputTokens, outputTokens: response.outputTokens };
	}

	// Add source file info to routes
	const routes = (parsed.routes ?? []).map((route) => ({
		...route,
		sourceFile: chunk.files[0], // Use first file as source
	}));

	console.log(`    Found ${routes.length} routes in chunk ${chunkNum}`);

	return {
		routes,
		inputTokens: response.inputTokens,
		outputTokens: response.outputTokens,
	};
}

/**
 * Calls the Anthropic API.
 */
async function callAnthropic(
	apiKey: string,
	model: string,
	systemPrompt: string,
	userMessage: string,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model,
			max_tokens: 4000,
			system: systemPrompt,
			messages: [{ role: "user", content: userMessage }],
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Anthropic API error: ${response.status} - ${error}`);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text?: string }>;
		usage?: { input_tokens?: number; output_tokens?: number };
	};
	const textContent = data.content.find((c) => c.type === "text");

	return {
		content: textContent?.text ?? "",
		inputTokens: data.usage?.input_tokens ?? 0,
		outputTokens: data.usage?.output_tokens ?? 0,
	};
}

/**
 * Removes duplicate routes based on path and method.
 */
function deduplicateRoutes(routes: Array<LLMExtractedRoute>): Array<LLMExtractedRoute> {
	const seen = new Map<string, LLMExtractedRoute>();

	for (const route of routes) {
		const key = `${route.method}:${route.path}`;
		const existing = seen.get(key);

		// Keep the route with more information
		if (!existing || hasMoreInfo(route, existing)) {
			seen.set(key, route);
		}
	}

	return Array.from(seen.values());
}

/**
 * Checks if route a has more information than route b.
 */
function hasMoreInfo(a: LLMExtractedRoute, b: LLMExtractedRoute): boolean {
	const infoA =
		(a.summary ? 1 : 0) + (a.parameters?.length ?? 0) + (a.requestBody ? 1 : 0) + Object.keys(a.responses ?? {}).length;
	const infoB =
		(b.summary ? 1 : 0) + (b.parameters?.length ?? 0) + (b.requestBody ? 1 : 0) + Object.keys(b.responses ?? {}).length;
	return infoA > infoB;
}

/**
 * Validates and filters extracted routes.
 */
function validateRoutes(routes: Array<LLMExtractedRoute>): Array<LLMExtractedRoute> {
	const validMethods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]);

	return routes.filter((route) => {
		// Validate path
		if (!route.path || typeof route.path !== "string") return false;
		if (!route.path.startsWith("/")) return false;

		// Validate method
		if (!route.method || !validMethods.has(route.method.toUpperCase())) return false;

		// Normalize method to uppercase
		route.method = route.method.toUpperCase() as LLMExtractedRoute["method"];

		// Normalize path parameters from :param to {param}
		route.path = route.path.replace(/:([^/]+)/g, "{$1}");

		// Set confidence based on completeness
		const hasParams = (route.parameters?.length ?? 0) > 0;
		const hasResponses = Object.keys(route.responses ?? {}).length > 0;
		const hasSummary = !!route.summary;

		route.confidence = 0.6 + (hasParams ? 0.1 : 0) + (hasResponses ? 0.1 : 0) + (hasSummary ? 0.1 : 0);

		return true;
	});
}

/**
 * Estimates the cost of LLM extraction without actually calling the API.
 * @param repoPath - Path to the repository
 * @param maxChunkTokens - Maximum tokens per chunk
 * @returns Cost estimate
 */
export async function estimateExtractionCost(
	repoPath: string,
	maxChunkTokens = 8000,
): Promise<{
	files: Array<string>;
	chunks: Array<CodeChunk>;
	estimate: ReturnType<typeof estimateLLMCost>;
}> {
	const files = await findRouteFiles(repoPath);
	const chunks = await prepareChunks(repoPath, files, maxChunkTokens);
	const estimate = estimateLLMCost(chunks, files);

	return { files, chunks, estimate };
}

// Re-export utilities
export { findRouteFiles, prepareChunks, estimateLLMCost } from "./CodeChunker.js";
