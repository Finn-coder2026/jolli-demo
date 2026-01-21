/**
 * Builds OpenAPI specification from scanned route information.
 */

import type { CodeScanResult, ComponentSchema, RouteInfo } from "shared-pipeline-utils/code-scanner";
import type {
	GeneratorSummary,
	OpenApiComponents,
	OpenApiOperation,
	OpenApiParameter,
	OpenApiPathItem,
	OpenApiRequestBody,
	OpenApiResponse,
	OpenApiSchema,
	OpenApiSpec,
	OpenApiTag,
} from "./types.js";

/**
 * Options for building OpenAPI specification.
 */
export interface BuildOptions {
	/** API title */
	title: string;
	/** API version */
	version: string;
	/** API description */
	description?: string;
	/** Server URL */
	serverUrl?: string;
	/** Custom operationId mappings (path:method -> operationId) */
	operationIdMapping?: Record<string, string>;
}

/**
 * Builds an OpenAPI specification from code scan results.
 * @param scanResult - Result from CodeScanner
 * @param options - Build options
 * @returns OpenAPI specification and generation summary
 */
export function buildOpenApiSpec(
	scanResult: CodeScanResult,
	options: BuildOptions,
): { spec: OpenApiSpec; summary: GeneratorSummary } {
	const paths: Record<string, OpenApiPathItem> = {};
	const tags = new Set<string>();
	const frameworksDetected = new Set<string>();
	const routesByMethod: Record<string, number> = {};
	let routesWithRequestBody = 0;
	let routesWithResponses = 0;

	// Collect tags from OpenAPI config
	const configTags = new Map<string, OpenApiTag>();
	if (scanResult.openApiConfig?.tags) {
		for (const tag of scanResult.openApiConfig.tags) {
			configTags.set(tag.name, {
				name: tag.name,
				...(tag.description && { description: tag.description }),
				...(tag.externalDocs && { externalDocs: tag.externalDocs }),
			});
		}
	}

	// Process each route
	for (const route of scanResult.routes) {
		const normalizedPath = normalizePathForOpenApi(route.path);

		// Track statistics
		if (route.framework) {
			frameworksDetected.add(route.framework);
		}
		routesByMethod[route.method] = (routesByMethod[route.method] || 0) + 1;
		if (route.handler.requestBody) {
			routesWithRequestBody++;
		}
		if (route.handler.responses && route.handler.responses.length > 0) {
			routesWithResponses++;
		}

		// Initialize path item if not exists
		if (!paths[normalizedPath]) {
			paths[normalizedPath] = {};
		}

		// Build operation
		const operation = buildOperation(route, options.operationIdMapping);
		const methodKey = route.method.toLowerCase() as keyof OpenApiPathItem;

		// Use route.tags if available (from Fastify schema), otherwise extract from path
		if (route.tags && route.tags.length > 0) {
			operation.tags = route.tags;
			for (const tag of route.tags) {
				tags.add(tag);
			}
		} else {
			const tag = extractTag(normalizedPath);
			if (tag) {
				tags.add(tag);
				operation.tags = [tag];
			}
		}

		// Assign operation to path
		(paths[normalizedPath] as Record<string, OpenApiOperation>)[methodKey] = operation;
	}

	// Build tags array - merge config tags with detected tags
	const tagsArray: Array<OpenApiTag> = Array.from(tags).map((name) => {
		// Use config tag if available, otherwise generate basic one
		if (configTags.has(name)) {
			return configTags.get(name)!;
		}
		return {
			name,
			description: `Operations related to ${name}`,
		};
	});

	// Build info from config or options
	const config = scanResult.openApiConfig;
	const info = {
		title: config?.info?.title || options.title,
		version: config?.info?.version || options.version,
		...(config?.info?.description || options.description
			? { description: config?.info?.description || options.description }
			: {}),
		...(config?.info?.termsOfService && { termsOfService: config.info.termsOfService }),
		...(config?.info?.contact && { contact: config.info.contact }),
		...(config?.info?.license && { license: config.info.license }),
	};

	// Build spec
	const spec: OpenApiSpec = {
		openapi: "3.0.3",
		info,
		paths,
		...(tagsArray.length > 0 && { tags: tagsArray }),
	};

	// Add servers from config or options
	if (config?.servers && config.servers.length > 0) {
		spec.servers = config.servers;
	} else if (options.serverUrl) {
		spec.servers = [{ url: options.serverUrl }];
	}

	// Add components from scanned schemas
	if (scanResult.components && scanResult.components.length > 0) {
		spec.components = buildComponents(scanResult.components);
	}

	// Add x-* extensions from config
	if (config?.extensions) {
		for (const [key, value] of Object.entries(config.extensions)) {
			if (key.startsWith("x-")) {
				(spec as Record<string, unknown>)[key] = value;
			}
		}
	}

	const summary: GeneratorSummary = {
		totalRoutes: scanResult.routes.length,
		routesWithRequestBody,
		routesWithResponses,
		frameworksDetected: Array.from(frameworksDetected),
		routesByMethod,
	};

	return { spec, summary };
}

/**
 * Builds OpenAPI components from extracted component schemas.
 * @param components - Array of component schemas from CodeScanner
 * @returns OpenAPI components object
 */
function buildComponents(components: Array<ComponentSchema>): OpenApiComponents {
	const schemas: Record<string, OpenApiSchema> = {};

	for (const component of components) {
		const schema: OpenApiSchema = {
			type: component.type as OpenApiSchema["type"],
		};

		if (component.title) {
			schema.title = component.title;
		}

		if (component.description) {
			schema.description = component.description;
		}

		if (component.properties) {
			schema.properties = {};
			for (const [propName, propValue] of Object.entries(component.properties)) {
				schema.properties[propName] = {
					type: propValue.type as OpenApiSchema["type"],
					...(propValue.title && { title: propValue.title }),
					...(propValue.description && { description: propValue.description }),
					...(propValue.format && { format: propValue.format }),
					...(propValue.enum && { enum: propValue.enum }),
					...(propValue.example !== undefined && { example: propValue.example }),
					...(propValue.$ref && { $ref: `#/components/schemas/${propValue.$ref}` }),
				};
			}
		}

		if (component.required && component.required.length > 0) {
			schema.required = component.required;
		}

		if (component.enum && component.enum.length > 0) {
			schema.enum = component.enum;
		}

		schemas[component.$id] = schema;
	}

	return { schemas };
}

/**
 * Normalizes a path for OpenAPI format.
 * Converts Express-style :param to OpenAPI {param} format.
 * @param path - Express-style path
 * @returns OpenAPI-formatted path
 */
export function normalizePathForOpenApi(path: string): string {
	// Convert :param to {param}
	return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
}

/**
 * Extracts a tag name from a path.
 * @param path - API path
 * @returns Tag name or undefined
 */
export function extractTag(path: string): string | undefined {
	// Remove leading slash and get first segment
	const segments = path.replace(/^\//, "").split("/");
	if (segments.length === 0 || !segments[0]) {
		return undefined;
	}

	// Skip common prefixes like 'api', 'v1', 'v2', etc.
	let tagIndex = 0;
	if (segments[tagIndex] === "api") {
		tagIndex++;
	}
	if (segments[tagIndex]?.match(/^v\d+$/)) {
		tagIndex++;
	}

	const tag = segments[tagIndex];
	if (!tag || tag.startsWith("{")) {
		return undefined;
	}

	// Capitalize first letter
	return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/**
 * Builds an OpenAPI operation from a route.
 * @param route - Route information
 * @param operationIdMapping - Optional custom operationId mappings
 * @returns OpenAPI operation object
 */
export function buildOperation(
	route: RouteInfo,
	operationIdMapping?: Record<string, string>,
): OpenApiOperation {
	const operationId = generateOperationId(route, operationIdMapping);

	const operation: OpenApiOperation = {
		operationId,
		summary: generateSummary(route),
		responses: buildResponses(route),
	};

	// Add parameters (path params + query params)
	const parameters = buildParameters(route);
	if (parameters.length > 0) {
		operation.parameters = parameters;
	}

	// Add request body if present
	if (route.handler.requestBody) {
		operation.requestBody = buildRequestBody(route);
	}

	return operation;
}

/**
 * Generates an operationId for a route.
 * @param route - Route information
 * @param operationIdMapping - Optional custom mappings
 * @returns Operation ID
 */
export function generateOperationId(
	route: RouteInfo,
	operationIdMapping?: Record<string, string>,
): string {
	// Use route.operationId if available (from Fastify schema)
	if (route.operationId) {
		return route.operationId;
	}

	// Check for custom mapping
	const mappingKey = `${route.path}:${route.method.toLowerCase()}`;
	if (operationIdMapping?.[mappingKey]) {
		return operationIdMapping[mappingKey];
	}

	// Generate from path and method
	const pathParts = route.path
		.replace(/^\//, "") // Remove leading slash
		.replace(/\{([^}]+)\}/g, "by$1") // {id} -> byId
		.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "by$1") // :id -> byId
		.split("/")
		.filter((p) => p.length > 0);

	// Convert to camelCase
	const pathName = pathParts
		.map((part, index) => {
			const cleaned = part.replace(/[^a-zA-Z0-9]/g, "");
			if (index === 0) {
				return cleaned.toLowerCase();
			}
			return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
		})
		.join("");

	// Add method suffix
	const methodName = route.method.toLowerCase();
	return `${methodName}${pathName.charAt(0).toUpperCase() + pathName.slice(1)}`;
}

/**
 * Generates a summary for a route.
 * @param route - Route information
 * @returns Summary string
 */
export function generateSummary(route: RouteInfo): string {
	const method = route.method.toUpperCase();
	const path = route.path;

	// Try to create a human-readable summary
	const pathParts = path.replace(/^\//, "").split("/");
	const resource = pathParts.find((p) => !p.startsWith(":") && !p.startsWith("{") && p !== "api");

	if (!resource) {
		return `${method} ${path}`;
	}

	const action = getActionFromMethod(method);
	return `${action} ${resource}`;
}

/**
 * Gets an action word based on HTTP method.
 * @param method - HTTP method
 * @returns Action word
 */
function getActionFromMethod(method: string): string {
	const actions: Record<string, string> = {
		GET: "Get",
		POST: "Create",
		PUT: "Update",
		PATCH: "Update",
		DELETE: "Delete",
		OPTIONS: "Get options for",
		HEAD: "Check",
	};
	return actions[method] || method;
}

/**
 * Builds OpenAPI parameters from route information.
 * @param route - Route information
 * @returns Array of OpenAPI parameters
 */
export function buildParameters(route: RouteInfo): Array<OpenApiParameter> {
	const parameters: Array<OpenApiParameter> = [];

	// Add path parameters
	if (route.handler.pathParams) {
		for (const param of route.handler.pathParams) {
			parameters.push({
				name: param.name,
				in: "path",
				required: true,
				schema: mapTypeToSchema(param.type),
				...(param.description && { description: param.description }),
			});
		}
	}

	// Add query parameters
	if (route.handler.queryParams) {
		for (const param of route.handler.queryParams) {
			parameters.push({
				name: param.name,
				in: "query",
				required: param.required,
				schema: mapTypeToSchema(param.type),
				...(param.description && { description: param.description }),
			});
		}
	}

	return parameters;
}

/**
 * Builds OpenAPI request body from route information.
 * @param route - Route information
 * @returns OpenAPI request body
 */
export function buildRequestBody(route: RouteInfo): OpenApiRequestBody {
	const requestBody = route.handler.requestBody;
	if (!requestBody) {
		return {
			content: {
				"application/json": {
					schema: { type: "object" },
				},
			},
		};
	}

	const schema: OpenApiSchema = {
		type: "object",
		properties: {},
		required: [],
	};

	for (const prop of requestBody.properties) {
		schema.properties![prop.name] = {
			type: mapTypeString(prop.type),
			...(prop.description && { description: prop.description }),
		};
		if (prop.required) {
			schema.required!.push(prop.name);
		}
	}

	// Remove empty required array
	if (schema.required!.length === 0) {
		schema.required = undefined;
	}

	return {
		required: requestBody.properties.some((p) => p.required),
		content: {
			[requestBody.contentType || "application/json"]: {
				schema,
			},
		},
	};
}

/**
 * Builds OpenAPI responses from route information.
 * @param route - Route information
 * @returns Record of status codes to responses
 */
export function buildResponses(route: RouteInfo): Record<string, OpenApiResponse> {
	const responses: Record<string, OpenApiResponse> = {};

	if (route.handler.responses && route.handler.responses.length > 0) {
		for (const resp of route.handler.responses) {
			const response: OpenApiResponse = {
				description: resp.description,
			};

			// Handle $ref responses (from Fastify schema)
			if (resp.schemaRef) {
				response.content = {
					"application/json": {
						schema: { $ref: `#/components/schemas/${resp.schemaRef}` },
					},
				};
			} else if (resp.schema) {
				response.content = {
					"application/json": {
						schema: convertToOpenApiSchema(resp.schema),
					},
				};
			}

			responses[resp.statusCode.toString()] = response;
		}
	} else {
		// Add default response
		responses["200"] = {
			description: "Successful response",
		};
	}

	return responses;
}

/**
 * Converts a schema from code scanner to OpenAPI schema.
 * @param schema - Schema from code scanner
 * @returns OpenAPI schema
 */
function convertToOpenApiSchema(schema: Record<string, unknown>): OpenApiSchema {
	const result: OpenApiSchema = {};

	if (schema.type) {
		result.type = mapTypeString(schema.type as string);
	}

	if (schema.properties && typeof schema.properties === "object") {
		result.type = "object";
		result.properties = {};
		for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
			if (typeof value === "object" && value !== null) {
				result.properties[key] = convertToOpenApiSchema(value as Record<string, unknown>);
			}
		}
	}

	return result;
}

/**
 * Maps a type string to OpenAPI schema.
 * @param type - Type string
 * @returns OpenAPI schema
 */
function mapTypeToSchema(type: string): OpenApiSchema {
	return { type: mapTypeString(type) };
}

/**
 * Maps a type string to OpenAPI type.
 * @param type - Type string from code scanner
 * @returns OpenAPI type string
 */
function mapTypeString(type: string): OpenApiSchema["type"] {
	const typeMap: Record<string, OpenApiSchema["type"]> = {
		string: "string",
		number: "number",
		integer: "integer",
		boolean: "boolean",
		array: "array",
		object: "object",
	};
	return typeMap[type.toLowerCase()] || "string";
}
