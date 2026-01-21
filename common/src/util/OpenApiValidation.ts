import { parse as parseYaml } from "yaml";

// Type for YAML parse errors with line position info
interface YamlParseErrorLike {
	message: string;
	linePos?: Array<{ line?: number; col?: number }>;
}

/**
 * Result of OpenAPI validation
 */
export interface OpenApiValidationResult {
	/** Whether the content is valid OpenAPI */
	isValid: boolean;
	/** Whether the content is an OpenAPI spec (even if invalid) */
	isOpenApiSpec: boolean;
	/** The OpenAPI version (3.0, 3.1, or swagger 2.0) */
	version?: string | undefined;
	/** API title from the spec */
	title?: string | undefined;
	/** API description from the spec */
	description?: string | undefined;
	/** API version from info.version */
	apiVersion?: string | undefined;
	/** Validation errors */
	errors: Array<OpenApiValidationError>;
	/** The parsed spec object (if parsing succeeded) */
	parsedSpec?: OpenApiParsedSpec | undefined;
}

/**
 * Validation error with location information
 */
export interface OpenApiValidationError {
	/** Error message */
	message: string;
	/** Path in the spec where the error occurred (e.g., "info.title") */
	path?: string | undefined;
	/** Line number (1-based) if available */
	line?: number | undefined;
	/** Column number (1-based) if available */
	column?: number | undefined;
	/** Error severity */
	severity: "error" | "warning";
}

/**
 * Simplified parsed OpenAPI spec structure
 */
export interface OpenApiParsedSpec {
	openapi?: string;
	swagger?: string;
	info?: {
		title?: string;
		version?: string;
		description?: string;
	};
	paths?: Record<string, Record<string, OpenApiOperation>>;
	servers?: Array<{ url?: string; description?: string }>;
	components?: Record<string, unknown>;
}

/**
 * OpenAPI operation structure
 */
export interface OpenApiOperation {
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: Array<string>;
	parameters?: Array<unknown>;
	requestBody?: unknown;
	responses?: Record<string, unknown>;
}

/**
 * Parses JSON content and returns line/column information for errors
 */
function parseJsonWithLineInfo(content: string): { data?: unknown; error?: OpenApiValidationError } {
	try {
		const data = JSON.parse(content);
		return { data };
	} catch (e) {
		const error = e as SyntaxError;
		const message = error.message;

		// Try to extract line/column from error message
		// JSON.parse errors often have format like "... at position X"
		let line: number | undefined;
		let column: number | undefined;

		const positionMatch = message.match(/position\s+(\d+)/i);
		if (positionMatch) {
			const position = Number.parseInt(positionMatch[1], 10);
			// Calculate line and column from position
			const lines = content.substring(0, position).split("\n");
			line = lines.length;
			// split() always returns at least one element (could be empty string at position 0)
			column = lines[lines.length - 1].length + 1;
		}

		return {
			error: {
				message: `JSON parse error: ${message}`,
				line,
				column,
				severity: "error",
			},
		};
	}
}

/**
 * Parses YAML content and returns line/column information for errors
 */
function parseYamlWithLineInfo(content: string): { data?: unknown; error?: OpenApiValidationError } {
	try {
		const data = parseYaml(content);
		return { data };
	} catch (e) {
		const yamlError = e as YamlParseErrorLike;
		return {
			error: {
				message: `YAML parse error: ${yamlError.message}`,
				line: yamlError.linePos?.[0]?.line,
				column: yamlError.linePos?.[0]?.col,
				severity: "error",
			},
		};
	}
}

/**
 * Valid HTTP methods in OpenAPI specs
 */
const VALID_HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head", "trace"];

/**
 * Valid path-level properties that are not HTTP methods
 */
const VALID_PATH_PROPERTIES = ["parameters", "summary", "description", "servers"];

/**
 * Validates the OpenAPI/Swagger version field.
 */
function validateVersion(spec: OpenApiParsedSpec): Array<OpenApiValidationError> {
	const errors: Array<OpenApiValidationError> = [];

	if (spec.openapi && !/^3\.\d+\.\d+$/.test(spec.openapi)) {
		errors.push({
			message: `Invalid OpenAPI version format: '${spec.openapi}'. Expected format like '3.0.0' or '3.1.0'`,
			path: "openapi",
			severity: "error",
		});
	} else if (spec.swagger && spec.swagger !== "2.0") {
		errors.push({
			message: `Invalid Swagger version: '${spec.swagger}'. Only '2.0' is supported`,
			path: "swagger",
			severity: "error",
		});
	}

	return errors;
}

/**
 * Validates the info object in the OpenAPI spec.
 */
function validateInfo(spec: OpenApiParsedSpec): Array<OpenApiValidationError> {
	const errors: Array<OpenApiValidationError> = [];

	if (!spec.info) {
		errors.push({
			message: "Missing required field: 'info'",
			path: "info",
			severity: "error",
		});
		return errors;
	}

	if (!spec.info.title) {
		errors.push({
			message: "Missing required field: 'info.title'",
			path: "info.title",
			severity: "error",
		});
	}

	if (!spec.info.version) {
		errors.push({
			message: "Missing required field: 'info.version'",
			path: "info.version",
			severity: "error",
		});
	}

	return errors;
}

/**
 * Validates a single path operation (HTTP method).
 */
function validatePathOperation(
	method: string,
	operation: unknown,
	pathKey: string,
	isOpenApi3: boolean,
): Array<OpenApiValidationError> {
	const errors: Array<OpenApiValidationError> = [];

	// Check for unknown properties
	if (!VALID_HTTP_METHODS.includes(method) && !VALID_PATH_PROPERTIES.includes(method)) {
		errors.push({
			message: `Unknown HTTP method or property '${method}' in path '${pathKey}'`,
			path: `paths.${pathKey}.${method}`,
			severity: "warning",
		});
		return errors;
	}

	// Check that operations have responses (required in OpenAPI 3.x)
	if (VALID_HTTP_METHODS.includes(method) && operation && typeof operation === "object") {
		const op = operation as OpenApiOperation;
		if (!op.responses && isOpenApi3) {
			errors.push({
				message: `Missing 'responses' for ${method.toUpperCase()} ${pathKey}`,
				path: `paths.${pathKey}.${method}.responses`,
				severity: "warning",
			});
		}
	}

	return errors;
}

/**
 * Validates the paths object in the OpenAPI spec.
 */
function validatePaths(spec: OpenApiParsedSpec): Array<OpenApiValidationError> {
	const errors: Array<OpenApiValidationError> = [];
	const isOpenApi3 = Boolean(spec.openapi);

	// Check paths object (required for OpenAPI 3.x)
	if (!spec.paths && isOpenApi3) {
		errors.push({
			message: "Missing required field: 'paths'. At least an empty paths object is required",
			path: "paths",
			severity: "warning",
		});
		return errors;
	}

	if (!spec.paths) {
		return errors;
	}

	for (const [pathKey, pathValue] of Object.entries(spec.paths)) {
		// Path must start with /
		if (!pathKey.startsWith("/")) {
			errors.push({
				message: `Invalid path '${pathKey}': paths must start with '/'`,
				path: `paths.${pathKey}`,
				severity: "error",
			});
		}

		// Validate operations
		if (pathValue && typeof pathValue === "object") {
			for (const [method, operation] of Object.entries(pathValue)) {
				errors.push(...validatePathOperation(method, operation, pathKey, isOpenApi3));
			}
		}
	}

	return errors;
}

/**
 * Validates required fields in the OpenAPI spec.
 * Note: This function assumes the spec already has openapi or swagger field
 * (checked by isOpenApiSpec before calling this function).
 */
function validateOpenApiStructure(spec: OpenApiParsedSpec): Array<OpenApiValidationError> {
	return [...validateVersion(spec), ...validateInfo(spec), ...validatePaths(spec)];
}

/**
 * Validates content as an OpenAPI specification
 *
 * @param content - The raw content string (JSON or YAML)
 * @param contentType - The MIME type: "application/json" or "application/yaml"
 * @returns Validation result with errors and parsed spec
 */
export function validateOpenApiSpec(
	content: string,
	contentType: "application/json" | "application/yaml",
): OpenApiValidationResult {
	// Parse the content
	const parseResult =
		contentType === "application/json" ? parseJsonWithLineInfo(content) : parseYamlWithLineInfo(content);

	if (parseResult.error) {
		return {
			isValid: false,
			isOpenApiSpec: false,
			errors: [parseResult.error],
		};
	}

	const data = parseResult.data;

	// Check if it's an object
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return {
			isValid: false,
			isOpenApiSpec: false,
			errors: [
				{
					message: "Content must be a JSON/YAML object, not an array or primitive value",
					severity: "error",
				},
			],
		};
	}

	const spec = data as OpenApiParsedSpec;

	// Check if it looks like an OpenAPI spec
	const isOpenApiSpec = "openapi" in spec || "swagger" in spec;

	if (!isOpenApiSpec) {
		return {
			isValid: false,
			isOpenApiSpec: false,
			errors: [
				{
					message:
						"JSON/YAML articles must be valid OpenAPI specifications. Add 'openapi: \"3.0.0\"' field to define an API spec",
					severity: "error",
				},
			],
		};
	}

	// Validate the structure
	const structureErrors = validateOpenApiStructure(spec);

	// Get the errors (only count 'error' severity as invalid)
	const hasErrors = structureErrors.some(e => e.severity === "error");

	return {
		isValid: !hasErrors,
		isOpenApiSpec: true,
		version: spec.openapi ?? spec.swagger,
		title: spec.info?.title,
		description: spec.info?.description,
		apiVersion: spec.info?.version,
		errors: structureErrors,
		parsedSpec: spec,
	};
}

/**
 * Quick check if content appears to be an OpenAPI spec (without full validation)
 *
 * @param content - The raw content string
 * @param contentType - The MIME type
 * @returns true if the content appears to be an OpenAPI spec
 */
export function isOpenApiContent(content: string, contentType: "application/json" | "application/yaml"): boolean {
	try {
		const data = contentType === "application/json" ? JSON.parse(content) : parseYaml(content);
		return data && typeof data === "object" && ("openapi" in data || "swagger" in data);
	} catch {
		return false;
	}
}

/**
 * Formats validation errors for display
 *
 * @param errors - Array of validation errors
 * @returns Formatted error string
 */
export function formatValidationErrors(errors: Array<OpenApiValidationError>): string {
	return errors
		.map(e => {
			const location = e.line ? ` (line ${e.line}${e.column ? `, column ${e.column}` : ""})` : "";
			const pathInfo = e.path ? ` at '${e.path}'` : "";
			const severity = e.severity === "warning" ? "[Warning]" : "[Error]";
			return `${severity}${pathInfo}${location}: ${e.message}`;
		})
		.join("\n");
}

/**
 * API endpoint info extracted from OpenAPI spec
 */
export interface ApiEndpoint {
	method: string;
	path: string;
	summary?: string;
}

/**
 * API info extracted from OpenAPI spec
 */
export interface ApiInfo {
	title: string;
	version: string;
	description?: string;
	endpoints: Array<ApiEndpoint>;
}

/**
 * Extract API info from an OpenAPI spec for documentation generation.
 * This extracts a simplified view of the API suitable for generating overview pages.
 *
 * @param spec - The parsed OpenAPI spec
 * @returns Extracted API info with title, version, description, and endpoints
 */
export function extractApiInfo(spec: OpenApiParsedSpec): ApiInfo {
	const info = spec.info || {};
	const endpoints: Array<ApiEndpoint> = [];

	if (spec.paths) {
		for (const [pathKey, pathValue] of Object.entries(spec.paths)) {
			const pathObj = pathValue;
			for (const method of ["get", "post", "put", "patch", "delete"]) {
				if (pathObj[method]) {
					const endpoint: ApiEndpoint = {
						method: method.toUpperCase(),
						path: pathKey,
					};
					if (pathObj[method].summary !== undefined) {
						endpoint.summary = pathObj[method].summary;
					}
					endpoints.push(endpoint);
				}
			}
		}
	}

	const result: ApiInfo = {
		title: info.title || "API Reference",
		version: info.version || "1.0.0",
		endpoints,
	};
	if (info.description !== undefined) {
		result.description = info.description;
	}
	return result;
}
