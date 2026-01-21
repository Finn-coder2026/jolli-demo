/**
 * Main generator that scans a repository and produces an OpenAPI specification.
 *
 * Implements the intelligent extraction flow:
 * - Phase 1: Check for existing OpenAPI specs
 * - Phase 2: Detect programming language
 * - Phase 3: Detect web framework
 * - Phase 4: Extract routes with AST
 * - Phase 5: Assess coverage
 * - Phase 6: LLM fallback (when coverage is low)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CodeScanner } from "shared-pipeline-utils/code-scanner";
import {
	assessCoverage,
	detectExistingSpecs,
	detectFrameworkForLanguage,
	detectLanguage,
	isSupportedLanguage,
	readSpec,
} from "shared-pipeline-utils/detection";
import type { FrameworkCategory, FrameworkProfile } from "shared-pipeline-utils/detection";
import {
	estimateExtractionCost,
	extractWithLLM,
} from "shared-pipeline-utils/llm-extractor";
import type { LLMExtractedRoute } from "shared-pipeline-utils/llm-extractor";
import { buildOpenApiSpec } from "./OpenApiBuilder.js";
import type { DetectionMetadata, GeneratorOptions, GeneratorResult, LLMCostInfo, OpenApiSchema, OpenApiSpec } from "./types.js";

/** Default framework profile for unknown languages */
function getDefaultFramework(language: string): FrameworkProfile {
	return {
		name: "unknown",
		displayName: "Unknown",
		category: "minimal",
		language,
		dependencies: [],
		expectedCoverage: 20,
	};
}

/**
 * Generates an OpenAPI specification from a repository.
 * Uses intelligent detection to choose the best extraction strategy.
 * @param options - Generator options
 * @returns Generator result with spec and summary
 */
export async function generateOpenApiSpec(options: GeneratorOptions): Promise<GeneratorResult> {
	const repoPath = path.resolve(options.repo);

	// Verify repository exists
	try {
		await fs.access(repoPath);
	} catch {
		throw new Error(`Repository path does not exist: ${repoPath}`);
	}

	// Load operationId mapping if provided
	let operationIdMapping: Record<string, string> | undefined;
	if (options.operationIdMapping) {
		try {
			const mappingContent = await fs.readFile(options.operationIdMapping, "utf-8");
			operationIdMapping = JSON.parse(mappingContent);
		} catch {
			throw new Error(`Failed to load operationId mapping from: ${options.operationIdMapping}`);
		}
	}

	// Handle cost estimation only mode
	if (options.llm?.estimateCostOnly) {
		return await estimateCostOnly(repoPath, options);
	}

	// Handle LLM-only mode (skip AST extraction)
	if (options.llm?.forceOnly) {
		return await extractWithLLMOnly(repoPath, options, operationIdMapping);
	}

	// Phase 1: Check for existing OpenAPI specs
	const specDetection = await detectExistingSpecs(repoPath);

	// If existing spec found with good coverage, use it
	if (specDetection.found && specDetection.primary && specDetection.primary.pathCount > 0) {
		const existingSpec = await readSpec(path.join(repoPath, specDetection.primary.path));

		// Use existing spec as base but merge with AST extraction for completeness
		return await mergeWithAstExtraction(repoPath, existingSpec, specDetection.primary.path, options, operationIdMapping);
	}

	// Phase 2: Detect language
	const languageResult = await detectLanguage(repoPath);

	// Phase 3: Detect framework (for all supported languages)
	let framework = getDefaultFramework(languageResult.primary);

	if (isSupportedLanguage(languageResult.primary)) {
		const frameworkResult = await detectFrameworkForLanguage(repoPath, languageResult.primary);
		framework = frameworkResult.framework;
	}

	// Phase 4: Extract routes with AST
	const scanner = new CodeScanner();
	const scanResult = await scanner.scan(repoPath, {
		patterns: options.includePaths,
		excludeDirs: options.excludePaths,
	});

	// Collect files that yielded routes
	const filesWithRoutes = new Set(scanResult.routes.map(r => r.filePath));

	// Phase 5: Assess coverage
	const coverage = await assessCoverage(repoPath, scanResult.routes.length, framework.category, filesWithRoutes);

	// Determine title
	const title = options.title || scanResult.title;

	// Build OpenAPI specification
	let { spec, summary } = buildOpenApiSpec(scanResult, {
		title,
		version: options.version || "1.0.0",
		description: options.description,
		serverUrl: options.serverUrl,
		operationIdMapping,
	});

	// Determine extraction source based on framework category
	let source: DetectionMetadata["source"] = getSourceFromCategory(framework.category);
	let costInfo: LLMCostInfo | undefined;

	// Phase 6: LLM Fallback (when coverage is low and LLM is enabled)
	const llmThreshold = options.llm?.threshold ?? 20;
	if (options.llm?.enabled && coverage.recommendation === "fallback" && coverage.percentage < llmThreshold) {
		console.log(`\nCoverage (${coverage.percentage.toFixed(0)}%) below threshold (${llmThreshold}%), triggering LLM fallback...`);

		const llmResult = await extractWithLLM(repoPath, {
			apiKey: options.llm.apiKey,
			model: options.llm.model,
			maxChunkTokens: options.llm.maxChunkTokens,
		});

		if (llmResult.routes.length > 0) {
			// Merge LLM routes with AST routes
			const mergedSpec = mergeWithLLMRoutes(spec, llmResult.routes, operationIdMapping);
			spec = mergedSpec;
			source = "llm_analysis";

			// Update summary
			summary.totalRoutes = Object.keys(spec.paths).length;
			summary.routesByMethod = countRoutesByMethod(spec.paths);
		}

		costInfo = {
			inputTokens: llmResult.cost.inputTokens,
			outputTokens: llmResult.cost.outputTokens,
			estimatedCost: llmResult.cost.estimatedCost,
			chunksProcessed: llmResult.cost.chunksProcessed,
		};

		if (llmResult.warnings.length > 0) {
			console.log("LLM extraction warnings:", llmResult.warnings);
		}
	}

	// Add detection metadata to summary
	summary.detection = {
		source,
		language: languageResult.primary,
		framework: framework.name,
		frameworkCategory: framework.category,
		confidence: coverage.confidence,
		coverage: {
			routesFound: coverage.routesFound,
			estimatedTotal: coverage.estimatedTotal,
			percentage: coverage.percentage,
		},
		existingSpecFound: specDetection.found,
		existingSpecPath: specDetection.primary?.path,
		recommendation: coverage.recommendation,
		recommendationReason: coverage.reason,
		cost: costInfo,
	};

	return { spec, summary };
}

/**
 * Estimates cost only without actually calling the LLM.
 */
async function estimateCostOnly(repoPath: string, options: GeneratorOptions): Promise<GeneratorResult> {
	const languageResult = await detectLanguage(repoPath);
	let framework = getDefaultFramework(languageResult.primary);

	if (isSupportedLanguage(languageResult.primary)) {
		const frameworkResult = await detectFrameworkForLanguage(repoPath, languageResult.primary);
		framework = frameworkResult.framework;
	}

	const { files, chunks, estimate } = await estimateExtractionCost(repoPath, options.llm?.maxChunkTokens);

	// Create minimal spec for cost estimation
	const spec: OpenApiSpec = {
		openapi: "3.0.3",
		info: { title: options.title ?? "API", version: options.version ?? "1.0.0" },
		paths: {},
	};

	return {
		spec,
		summary: {
			totalRoutes: 0,
			routesWithRequestBody: 0,
			routesWithResponses: 0,
			frameworksDetected: [framework.name],
			routesByMethod: {},
			detection: {
				source: "llm_analysis",
				language: languageResult.primary,
				framework: framework.name,
				frameworkCategory: framework.category,
				confidence: 0,
				coverage: { routesFound: 0, estimatedTotal: files.length, percentage: 0 },
				existingSpecFound: false,
				recommendation: "fallback",
				recommendationReason: "Cost estimation only",
				cost: {
					inputTokens: estimate.inputTokens,
					outputTokens: estimate.outputTokens,
					estimatedCost: estimate.estimatedCost,
					chunksProcessed: chunks.length,
				},
			},
		},
	};
}

/**
 * Extracts routes using LLM only (skip AST extraction).
 */
async function extractWithLLMOnly(
	repoPath: string,
	options: GeneratorOptions,
	operationIdMapping?: Record<string, string>,
): Promise<GeneratorResult> {
	const languageResult = await detectLanguage(repoPath);
	let framework = getDefaultFramework(languageResult.primary);

	if (isSupportedLanguage(languageResult.primary)) {
		const frameworkResult = await detectFrameworkForLanguage(repoPath, languageResult.primary);
		framework = frameworkResult.framework;
	}

	console.log("Running LLM-only extraction...");

	const llmResult = await extractWithLLM(repoPath, {
		apiKey: options.llm?.apiKey,
		model: options.llm?.model,
		maxChunkTokens: options.llm?.maxChunkTokens,
	});

	// Build spec from LLM routes
	const spec = buildSpecFromLLMRoutes(llmResult.routes, options, operationIdMapping);

	const routesByMethod = countRoutesByMethod(spec.paths);

	return {
		spec,
		summary: {
			totalRoutes: llmResult.routes.length,
			routesWithRequestBody: llmResult.routes.filter((r: LLMExtractedRoute) => r.requestBody).length,
			routesWithResponses: llmResult.routes.filter((r: LLMExtractedRoute) => r.responses && Object.keys(r.responses).length > 0).length,
			frameworksDetected: [framework.name],
			routesByMethod,
			detection: {
				source: "llm_analysis",
				language: languageResult.primary,
				framework: framework.name,
				frameworkCategory: framework.category,
				confidence: 0.7, // LLM extraction has moderate confidence
				coverage: {
					routesFound: llmResult.routes.length,
					estimatedTotal: llmResult.routes.length,
					percentage: 100,
				},
				existingSpecFound: false,
				recommendation: "use",
				recommendationReason: "LLM-only extraction completed",
				cost: {
					inputTokens: llmResult.cost.inputTokens,
					outputTokens: llmResult.cost.outputTokens,
					estimatedCost: llmResult.cost.estimatedCost,
					chunksProcessed: llmResult.cost.chunksProcessed,
				},
			},
		},
	};
}

/**
 * Builds an OpenAPI spec from LLM-extracted routes.
 */
function buildSpecFromLLMRoutes(
	routes: Array<LLMExtractedRoute>,
	options: GeneratorOptions,
	operationIdMapping?: Record<string, string>,
): OpenApiSpec {
	const spec: OpenApiSpec = {
		openapi: "3.0.3",
		info: {
			title: options.title ?? "API",
			version: options.version ?? "1.0.0",
			description: options.description,
		},
		paths: {},
	};

	if (options.serverUrl) {
		spec.servers = [{ url: options.serverUrl }];
	}

	for (const route of routes) {
		const pathItem = spec.paths[route.path] ?? {};
		const method = route.method.toLowerCase() as keyof typeof pathItem;

		const operationId = operationIdMapping?.[`${route.method} ${route.path}`] ??
			generateOperationId(route.method, route.path);

		const operation: OpenApiSpec["paths"][string][typeof method] = {
			operationId,
			summary: route.summary,
			responses: {},
		};

		// Add parameters
		if (route.parameters && route.parameters.length > 0) {
			operation.parameters = route.parameters.map((p) => ({
				name: p.name,
				in: p.in,
				required: p.required ?? (p.in === "path"),
				description: p.description,
				schema: { type: (p.type ?? "string") as "string" | "number" | "integer" | "boolean" | "array" | "object" },
			}));
		}

		// Add request body
		if (route.requestBody) {
			const schema: OpenApiSchema = route.requestBody.schema
				? { type: (route.requestBody.schema.type as OpenApiSchema["type"]) ?? "object", properties: route.requestBody.schema.properties as Record<string, OpenApiSchema> }
				: { type: "object" };
			operation.requestBody = {
				content: {
					[route.requestBody.contentType ?? "application/json"]: { schema },
				},
			};
		}

		// Add responses
		if (route.responses) {
			for (const [status, resp] of Object.entries(route.responses)) {
				const responseEntry: { description: string; content?: Record<string, { schema: OpenApiSchema }> } = {
					description: resp.description ?? "Response",
				};
				if (resp.schema) {
					responseEntry.content = {
						"application/json": { schema: resp.schema as OpenApiSchema },
					};
				}
				operation.responses[status] = responseEntry;
			}
		} else {
			operation.responses["200"] = { description: "Successful response" };
		}

		const methodKey = method as "get" | "post" | "put" | "delete" | "patch" | "options" | "head";
		(pathItem as Record<string, unknown>)[methodKey] = operation;
		spec.paths[route.path] = pathItem;
	}

	return spec;
}

/**
 * Merges LLM-extracted routes into an existing OpenAPI spec.
 */
function mergeWithLLMRoutes(
	existingSpec: OpenApiSpec,
	llmRoutes: Array<LLMExtractedRoute>,
	operationIdMapping?: Record<string, string>,
): OpenApiSpec {
	const spec = { ...existingSpec, paths: { ...existingSpec.paths } };

	for (const route of llmRoutes) {
		const method = route.method.toLowerCase() as "get" | "post" | "put" | "delete" | "patch";

		// Skip if route already exists
		if (spec.paths[route.path]?.[method]) {
			continue;
		}

		const pathItem = spec.paths[route.path] ?? {};
		const operationId = operationIdMapping?.[`${route.method} ${route.path}`] ??
			generateOperationId(route.method, route.path);

		const operation = {
			operationId,
			summary: route.summary,
			parameters: route.parameters?.map((p) => ({
				name: p.name,
				in: p.in,
				required: p.required ?? (p.in === "path"),
				description: p.description,
				schema: { type: (p.type ?? "string") as "string" | "number" | "integer" | "boolean" | "array" | "object" },
			})),
			responses: route.responses
				? Object.fromEntries(
					Object.entries(route.responses).map(([status, r]) => [
						status,
						{ description: r.description ?? "Response" },
					]),
				)
				: { "200": { description: "Successful response" } },
		};

		(pathItem as Record<string, unknown>)[method] = operation;
		spec.paths[route.path] = pathItem;
	}

	return spec;
}

/**
 * Generates an operationId from method and path.
 */
function generateOperationId(method: string, urlPath: string): string {
	const parts = urlPath
		.split("/")
		.filter(Boolean)
		.map((part) => {
			if (part.startsWith("{") && part.endsWith("}")) {
				return "By" + capitalize(part.slice(1, -1));
			}
			return capitalize(part);
		});

	return method.toLowerCase() + parts.join("");
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Counts routes by HTTP method.
 */
function countRoutesByMethod(paths: Record<string, OpenApiSpec["paths"][string]>): Record<string, number> {
	const counts: Record<string, number> = {};

	for (const pathItem of Object.values(paths)) {
		for (const method of ["get", "post", "put", "delete", "patch", "options", "head"]) {
			if (pathItem[method as keyof typeof pathItem]) {
				counts[method.toUpperCase()] = (counts[method.toUpperCase()] ?? 0) + 1;
			}
		}
	}

	return counts;
}

/**
 * Gets the source type from framework category.
 */
function getSourceFromCategory(category: FrameworkCategory): DetectionMetadata["source"] {
	switch (category) {
		case "schema-enforced":
			return "ast_full";
		case "semi-structured":
			return "ast_jsdoc";
		default:
			return "ast_basic";
	}
}

/**
 * Merges an existing spec with AST extraction results.
 */
async function mergeWithAstExtraction(
	repoPath: string,
	existingSpec: Record<string, unknown>,
	existingSpecPath: string,
	options: GeneratorOptions,
	operationIdMapping?: Record<string, string>,
): Promise<GeneratorResult> {
	// Also run AST extraction to see if we can add anything
	const scanner = new CodeScanner();
	const scanResult = await scanner.scan(repoPath, {
		patterns: options.includePaths,
		excludeDirs: options.excludePaths,
	});

	// Detect language and framework for metadata
	const languageResult = await detectLanguage(repoPath);
	let framework = getDefaultFramework(languageResult.primary);

	if (isSupportedLanguage(languageResult.primary)) {
		const frameworkResult = await detectFrameworkForLanguage(repoPath, languageResult.primary);
		framework = frameworkResult.framework;
	}

	// Count paths in existing spec
	const existingPaths = existingSpec.paths as Record<string, unknown> | undefined;
	const existingPathCount = existingPaths ? Object.keys(existingPaths).length : 0;

	// Build OpenAPI from AST results
	const title = options.title || scanResult.title;
	const { spec, summary } = buildOpenApiSpec(scanResult, {
		title,
		version: options.version || "1.0.0",
		description: options.description,
		serverUrl: options.serverUrl,
		operationIdMapping,
	});

	// If existing spec has significantly more routes, prefer it
	if (existingPathCount > summary.totalRoutes * 1.5) {
		// Use existing spec, but add metadata
		summary.detection = {
			source: "existing_spec",
			language: languageResult.primary,
			framework: framework.name,
			frameworkCategory: framework.category,
			confidence: 0.95,
			coverage: {
				routesFound: existingPathCount,
				estimatedTotal: existingPathCount,
				percentage: 100,
			},
			existingSpecFound: true,
			existingSpecPath,
			recommendation: "use",
			recommendationReason: `Using existing OpenAPI spec with ${existingPathCount} paths`,
		};

		// Update summary with existing spec info
		summary.totalRoutes = existingPathCount;

		return {
			spec: existingSpec as unknown as typeof spec,
			summary,
		};
	}

	// Otherwise use AST extraction with metadata
	const filesWithRoutes = new Set(scanResult.routes.map(r => r.filePath));
	const coverage = await assessCoverage(repoPath, scanResult.routes.length, framework.category, filesWithRoutes);

	summary.detection = {
		source: "hybrid",
		language: languageResult.primary,
		framework: framework.name,
		frameworkCategory: framework.category,
		confidence: coverage.confidence,
		coverage: {
			routesFound: coverage.routesFound,
			estimatedTotal: coverage.estimatedTotal,
			percentage: coverage.percentage,
		},
		existingSpecFound: true,
		existingSpecPath,
		recommendation: coverage.recommendation,
		recommendationReason: coverage.reason,
	};

	return { spec, summary };
}

/**
 * Converts an OpenAPI specification to YAML format.
 * @param spec - OpenAPI specification
 * @returns YAML string
 */
export function specToYaml(spec: OpenApiSpec): string {
	// Simple YAML serialization without external dependencies
	return yamlStringify(spec);
}

/**
 * Converts an OpenAPI specification to JSON format.
 * @param spec - OpenAPI specification
 * @returns JSON string
 */
export function specToJson(spec: OpenApiSpec): string {
	return JSON.stringify(spec, null, 2);
}

/**
 * Simple YAML stringifier for OpenAPI specs.
 * Handles the common cases needed for OpenAPI output.
 * @param obj - Object to stringify
 * @param indent - Current indentation level
 * @returns YAML string
 */
function yamlStringify(obj: unknown, indent = 0): string {
	const spaces = "  ".repeat(indent);

	if (obj === null || obj === undefined) {
		return "null";
	}

	if (typeof obj === "string") {
		// Check if string needs quoting
		if (
			obj === "" ||
			obj.includes(":") ||
			obj.includes("#") ||
			obj.includes("\n") ||
			obj.includes('"') ||
			obj.includes("'") ||
			obj.match(/^[0-9]/) ||
			obj === "true" ||
			obj === "false" ||
			obj === "null" ||
			obj.startsWith(" ") ||
			obj.endsWith(" ")
		) {
			// Use double quotes and escape internal quotes
			return `"${obj.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
		}
		return obj;
	}

	if (typeof obj === "number" || typeof obj === "boolean") {
		return String(obj);
	}

	if (Array.isArray(obj)) {
		if (obj.length === 0) {
			return "[]";
		}
		const items = obj.map((item) => {
			const itemStr = yamlStringify(item, indent + 1);
			if (typeof item === "object" && item !== null && !Array.isArray(item)) {
				// Object item - first property on same line as dash
				const lines = itemStr.split("\n");
				const firstLine = lines[0].trim();
				const rest = lines.slice(1).join("\n");
				if (rest) {
					return `${spaces}- ${firstLine}\n${rest}`;
				}
				return `${spaces}- ${firstLine}`;
			}
			return `${spaces}- ${itemStr}`;
		});
		return items.join("\n");
	}

	if (typeof obj === "object") {
		const entries = Object.entries(obj as Record<string, unknown>);
		if (entries.length === 0) {
			return "{}";
		}
		const lines = entries.map(([key, value]) => {
			const valueStr = yamlStringify(value, indent + 1);
			if (typeof value === "object" && value !== null && !Array.isArray(value)) {
				return `${spaces}${key}:\n${valueStr}`;
			}
			if (Array.isArray(value) && value.length > 0) {
				return `${spaces}${key}:\n${valueStr}`;
			}
			return `${spaces}${key}: ${valueStr}`;
		});
		return lines.join("\n");
	}

	return String(obj);
}

/**
 * Writes the OpenAPI specification to a file.
 * @param spec - OpenAPI specification
 * @param outputPath - Output file path
 * @param format - Output format (json or yaml)
 */
export async function writeSpec(
	spec: OpenApiSpec,
	outputPath: string,
	format: "json" | "yaml",
): Promise<void> {
	const content = format === "yaml" ? specToYaml(spec) : specToJson(spec);

	// Ensure output directory exists
	const dir = path.dirname(outputPath);
	await fs.mkdir(dir, { recursive: true });

	// Write file
	await fs.writeFile(outputPath, content + "\n", "utf-8");
}
