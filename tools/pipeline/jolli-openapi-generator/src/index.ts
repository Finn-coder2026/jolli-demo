/**
 * OpenAPI Generator - Generate OpenAPI specifications from source code.
 *
 * This tool scans a repository for API routes using AST-based analysis
 * and generates an OpenAPI 3.0.3 compliant specification.
 *
 * Supported frameworks:
 * - Express
 * - Fastify
 * - Koa
 * - Hono
 * - NestJS
 * - Next.js App Router
 *
 * @example
 * ```typescript
 * import { generateOpenApiSpec, writeSpec } from "jolli-openapi-generator";
 *
 * const result = await generateOpenApiSpec({
 *   repo: "./my-api",
 *   output: "openapi.json",
 *   format: "json",
 *   title: "My API",
 *   version: "1.0.0"
 * });
 *
 * await writeSpec(result.spec, "openapi.json", "json");
 * console.log(`Generated ${result.summary.totalRoutes} routes`);
 * ```
 */

// Export main generator functions
export { generateOpenApiSpec, specToJson, specToYaml, writeSpec } from "./Generator.js";

// Export OpenAPI builder functions
export {
	buildOpenApiSpec,
	buildOperation,
	buildParameters,
	buildRequestBody,
	buildResponses,
	extractTag,
	generateOperationId,
	generateSummary,
	normalizePathForOpenApi,
} from "./OpenApiBuilder.js";

// Export types
export type {
	GeneratorOptions,
	GeneratorResult,
	GeneratorSummary,
	OpenApiComponents,
	OpenApiInfo,
	OpenApiMediaType,
	OpenApiOperation,
	OpenApiParameter,
	OpenApiPathItem,
	OpenApiRequestBody,
	OpenApiResponse,
	OpenApiSchema,
	OpenApiSecurityScheme,
	OpenApiServer,
	OpenApiSpec,
	OpenApiTag,
} from "./types.js";
