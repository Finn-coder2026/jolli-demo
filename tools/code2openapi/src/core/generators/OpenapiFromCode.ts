import type { CodeScanResult, PropertyInfo, RouteInfo } from "../scanners/CodeScanner";
import { relative, sep } from "node:path";
import type { OpenAPIV3 } from "openapi-types";

export interface OpenAPISpec {
	openapi: string;
	info: {
		title: string;
		version: string;
		description?: string;
	};
	servers?: Array<{
		url: string;
		description?: string;
	}>;
	paths: {
		[path: string]: {
			[method: string]: OpenAPIV3.OperationObject;
		};
	};
	components?: {
		schemas?: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>;
	};
}

export class OpenAPIFromCodeGenerator {
	private repoPath = "";

	generate(scanResult: CodeScanResult): OpenAPISpec {
		// Store the repo path for relative path calculation
		this.repoPath = scanResult.repoPath;
		const spec: OpenAPISpec = {
			openapi: "3.0.0",
			info: {
				title: scanResult.title || "API Documentation",
				version: scanResult.version || "1.0.0",
				description: `Automatically generated from code analysis`,
			},
			paths: {},
		};

		if (scanResult.baseUrl) {
			spec.servers = [
				{
					url: scanResult.baseUrl,
					description: "API Server",
				},
			];
		}

		// Group routes by path
		const pathGroups = this.groupRoutesByPath(scanResult.routes);

		// Generate path items
		for (const [routePath, routes] of pathGroups.entries()) {
			spec.paths[routePath] = {};

			for (const route of routes) {
				const method = route.method.toLowerCase();
				spec.paths[routePath][method] = this.generatePathItem(route);
			}
		}

		return spec;
	}

	private groupRoutesByPath(routes: Array<RouteInfo>): Map<string, Array<RouteInfo>> {
		const groups = new Map<string, Array<RouteInfo>>();

		for (const route of routes) {
			const existing = groups.get(route.path) || [];
			existing.push(route);
			groups.set(route.path, existing);
		}

		return groups;
	}

	private generatePathItem(route: RouteInfo): OpenAPIV3.OperationObject {
		const pathItem: OpenAPIV3.OperationObject = {
			summary: this.generateSummary(route),
			description: `Extracted from ${this.formatFilePath(route.filePath)}`,
			tags: [this.extractTag(route.path)],
			responses: {},
		};

		// Add parameters (query and path)
		const parameters: Array<OpenAPIV3.ParameterObject> = [];

		if (route.handler.queryParams && route.handler.queryParams.length > 0) {
			for (const param of route.handler.queryParams) {
				const paramObj: OpenAPIV3.ParameterObject = {
					name: param.name,
					in: "query",
					required: param.required,
					schema: { type: param.type as "string" | "number" | "boolean" },
				};
				if (param.description) {
					paramObj.description = param.description;
				}
				parameters.push(paramObj);
			}
		}

		if (route.handler.pathParams && route.handler.pathParams.length > 0) {
			for (const param of route.handler.pathParams) {
				const paramObj: OpenAPIV3.ParameterObject = {
					name: param.name,
					in: "path",
					required: true, // Path params are always required
					schema: { type: param.type as "string" | "number" | "boolean" },
				};
				if (param.description) {
					paramObj.description = param.description;
				}
				parameters.push(paramObj);
			}
		}

		if (parameters.length > 0) {
			pathItem.parameters = parameters;
		}

		// Add request body
		if (route.handler.requestBody) {
			pathItem.requestBody = {
				required: route.handler.requestBody.properties.some(p => p.required),
				content: {
					[route.handler.requestBody.contentType]: {
						schema: {
							type: "object",
							properties: this.generatePropertiesSchema(route.handler.requestBody.properties),
							required: route.handler.requestBody.properties.filter(p => p.required).map(p => p.name),
						},
					},
				},
			};
		}

		// Add responses
		pathItem.responses = {};

		if (route.handler.responses && route.handler.responses.length > 0) {
			for (const response of route.handler.responses) {
				const statusCode = String(response.statusCode);

				pathItem.responses[statusCode] = {
					description: response.description,
				};

				if (response.schema) {
					pathItem.responses[statusCode].content = {
						"application/json": {
							schema: response.schema,
						},
					};
				}
			}
		} else {
			// Default response if none detected
			pathItem.responses["200"] = {
				description: "Successful response",
			};
		}

		return pathItem;
	}

	private generatePropertiesSchema(properties: Array<PropertyInfo>): Record<string, OpenAPIV3.SchemaObject> {
		const schema: Record<string, OpenAPIV3.SchemaObject> = {};

		for (const prop of properties) {
			// Map property type to OpenAPI schema type
			if (prop.type === "array") {
				const arraySchema: OpenAPIV3.ArraySchemaObject = {
					type: "array",
					items: {},
				};
				if (prop.description) {
					arraySchema.description = prop.description;
				}
				schema[prop.name] = arraySchema;
			} else {
				const nonArraySchema: OpenAPIV3.NonArraySchemaObject = {
					type: prop.type as "string" | "number" | "boolean" | "object",
				};
				if (prop.description) {
					nonArraySchema.description = prop.description;
				}
				schema[prop.name] = nonArraySchema;
			}
		}

		return schema;
	}

	private generateSummary(route: RouteInfo): string {
		// Generate a human-readable summary from the route
		const pathParts = route.path.split("/").filter(p => p && !p.startsWith(":"));
		const resource = pathParts[pathParts.length - 1] || "resource";

		const methodActions: { [key: string]: string } = {
			GET: "Get",
			POST: "Create",
			PUT: "Update",
			PATCH: "Update",
			DELETE: "Delete",
		};

		const action = methodActions[route.method] || route.method;

		return `${action} ${resource}`;
	}

	private extractTag(routePath: string): string {
		// Extract tag from route path
		// e.g., /api/chat -> Chat, /api/users/:id -> Users
		const parts = routePath.split("/").filter(p => p && !p.startsWith(":"));

		if (parts.length >= 2) {
			const tag = parts[1];
			return tag.charAt(0).toUpperCase() + tag.slice(1);
		}

		return "API";
	}

	private formatFilePath(filePath: string): string {
		// Get relative path from repo root
		const relativePath = relative(this.repoPath, filePath);

		// Normalize path separators to forward slashes for consistency
		// This ensures the output is the same on Windows and Unix systems
		const normalizedPath = relativePath.split(sep).join("/");

		return normalizedPath;
	}
}
