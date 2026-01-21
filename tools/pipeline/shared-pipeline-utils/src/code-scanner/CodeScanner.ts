/**
 * AST-based code scanner for extracting API route information.
 *
 * Supports multiple frameworks:
 * - Express (router.get, app.post, req.body)
 * - Fastify (fastify.get, request.body, reply.send)
 * - Koa (ctx.request.body, ctx.body)
 * - Hono (c.json, c.body)
 * - Next.js App Router (export function GET, NextResponse.json)
 * - NestJS (@Controller, @Get, @Post, @Body)
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse } from "@babel/parser";
import type { NodePath } from "@babel/traverse";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import { DEFAULT_MAX_FILE_SIZE, discoverCodeFiles } from "./FileDiscovery.js";

// Handle ESM/CommonJS interop for @babel/traverse
const traverse =
	(typeof traverseModule === "function"
		? traverseModule
		: (traverseModule as { default: typeof traverseModule }).default) || traverseModule;

export interface RouteInfo {
	method: string; // GET, POST, PUT, DELETE, etc.
	path: string; // /api/chat
	filePath: string; // Full file path
	framework?: string; // express, fastify, koa, hono, nestjs, nextjs
	operationId?: string; // Custom operationId from schema
	tags?: Array<string>; // Tags from schema
	handler: {
		functionName?: string; // Name of the handler function
		requestBody?: RequestBodyInfo;
		queryParams?: Array<ParameterInfo>;
		pathParams?: Array<ParameterInfo>;
		responses?: Array<ResponseInfo>;
	};
}

export interface RequestBodyInfo {
	properties: Array<PropertyInfo>;
	contentType: string; // application/json, multipart/form-data, etc.
}

export interface PropertyInfo {
	name: string;
	type: string; // string, number, boolean, array, object
	required: boolean;
	description?: string;
}

export interface ParameterInfo {
	name: string;
	type: string;
	required: boolean;
	description?: string;
}

export interface ResponseInfo {
	statusCode: number;
	description: string;
	schema?: Record<string, unknown>;
	schemaRef?: string; // $ref to a component schema
}

/** Schema component registered via fastify.addSchema() or defined as a variable */
export interface ComponentSchema {
	$id: string;
	type: string;
	properties?: Record<string, SchemaProperty>;
	required?: Array<string>;
	enum?: Array<string>;
	description?: string;
	title?: string;
}

export interface SchemaProperty {
	type: string;
	title?: string;
	description?: string;
	example?: unknown;
	enum?: Array<string>;
	format?: string;
	$ref?: string;
}

/** OpenAPI configuration extracted from @fastify/swagger */
export interface OpenApiConfig {
	info?: {
		title?: string;
		description?: string;
		version?: string;
		termsOfService?: string;
		contact?: { name?: string; url?: string; email?: string };
		license?: { name?: string; url?: string };
	};
	servers?: Array<{ url: string; description?: string }>;
	tags?: Array<{ name: string; description?: string; externalDocs?: { description?: string; url?: string } }>;
	extensions?: Record<string, unknown>; // x-* extensions like x-speakeasy-retries
}

export interface CodeScanResult {
	routes: Array<RouteInfo>;
	title: string;
	version: string;
	baseUrl?: string;
	repoPath: string;
	components?: Array<ComponentSchema>; // Schema components from addSchema()
	openApiConfig?: OpenApiConfig; // Configuration from @fastify/swagger
}

export interface ScanOptions {
	/** Additional glob patterns to search */
	patterns?: Array<string>;
	/** Additional directories to exclude */
	excludeDirs?: Array<string>;
	/** Skip files larger than this (default: 500KB). Set to 0 to disable. */
	maxFileSizeBytes?: number;
	/** Number of files to process in each batch (default: 50) */
	batchSize?: number;
	/** Number of files to process concurrently within a batch (default: 4) */
	concurrency?: number;
}

export class CodeScanner extends EventEmitter {
	private routes: Array<RouteInfo> = [];
	private components: Array<ComponentSchema> = [];
	private openApiConfig: OpenApiConfig = {};
	private routePrefixes: Map<string, string> = new Map(); // filePath -> prefix

	async scan(repoPath: string, options: ScanOptions = {}): Promise<CodeScanResult> {
		this.routes = []; // Reset routes for each scan
		this.components = [];
		this.openApiConfig = {};
		this.routePrefixes.clear();
		this.emit("start", { path: repoPath });

		const batchSize = options.batchSize ?? 50;
		const concurrency = options.concurrency ?? 4;
		let batch: Array<string> = [];
		let totalFilesProcessed = 0;
		let filesSkipped = 0;

		// Stream files one at a time using async generator
		const discoveryOptions = {
			maxFileSizeBytes: options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE,
			onFileSkipped: () => {
				filesSkipped++;
			},
			...(options.patterns && { patterns: options.patterns }),
			...(options.excludeDirs && { excludeDirs: options.excludeDirs }),
		};
		const fileIterator = discoverCodeFiles(repoPath, discoveryOptions);

		for await (const filePath of fileIterator) {
			batch.push(filePath);

			// Process batch when full
			if (batch.length >= batchSize) {
				await this.processBatch(batch, concurrency);
				totalFilesProcessed += batch.length;
				this.emit("batchComplete", {
					filesProcessed: totalFilesProcessed,
					routesFound: this.routes.length,
					filesSkipped,
				});

				// Clear batch to free memory
				batch = [];
			}
		}

		// Process remaining files in the last batch
		if (batch.length > 0) {
			await this.processBatch(batch, concurrency);
			totalFilesProcessed += batch.length;
		}

		this.emit("filesFound", { count: totalFilesProcessed, skipped: filesSkipped });

		// Deduplicate routes by method + path combination
		const uniqueRoutes = new Map<string, RouteInfo>();
		for (const route of this.routes) {
			const key = `${route.method}:${route.path}`;
			if (!uniqueRoutes.has(key)) {
				uniqueRoutes.set(key, route);
			}
		}

		const result: CodeScanResult = {
			routes: Array.from(uniqueRoutes.values()),
			title: this.openApiConfig.info?.title || this.inferProjectName(repoPath),
			version: this.openApiConfig.info?.version || "1.0.0",
			repoPath,
		};

		// Include components if any were found
		if (this.components.length > 0) {
			result.components = this.components;
		}

		// Include OpenAPI config if any was found
		if (Object.keys(this.openApiConfig).length > 0) {
			result.openApiConfig = this.openApiConfig;
		}

		this.emit("complete", result);
		return result;
	}

	/**
	 * Process a batch of files with limited concurrency.
	 */
	private async processBatch(files: Array<string>, concurrency: number): Promise<void> {
		// Simple concurrency limiting using Promise.all with chunks
		for (let i = 0; i < files.length; i += concurrency) {
			const chunk = files.slice(i, i + concurrency);
			await Promise.all(
				chunk.map(async (filePath) => {
					this.emit("file", filePath);
					try {
						await this.scanFile(filePath);
					} catch (error) {
						// Emit error but continue scanning other files
						this.emit("error", { filePath, error });
					}
				}),
			);
		}
	}

	private async scanFile(filePath: string): Promise<void> {
		const code = await fs.readFile(filePath, "utf-8");

		// Determine source type based on file content and extension
		const isCommonJS =
			code.includes("require(") ||
			code.includes("module.exports") ||
			code.includes("exports.") ||
			filePath.endsWith(".cjs");
		const sourceType = isCommonJS ? "script" : "module";

		// Parse the code into AST
		const ast = parse(code, {
			sourceType: sourceType as "script" | "module" | "unambiguous",
			plugins: [
				"typescript",
				"jsx",
				"decorators-legacy",
				"exportDefaultFrom",
				"exportNamespaceFrom",
				"dynamicImport",
				"nullishCoalescingOperator",
				"optionalChaining",
			],
			errorRecovery: true,
		});

		// Traverse the AST to find route definitions and schema configurations
		traverse(ast, {
			CallExpression: (nodePath: NodePath<t.CallExpression>) => {
				this.analyzeRouteCall(nodePath, filePath);
				this.analyzeAddSchemaCall(nodePath);
				this.analyzeSwaggerRegister(nodePath);
			},
			ExportNamedDeclaration: (nodePath: NodePath<t.ExportNamedDeclaration>) => {
				this.analyzeNextJsRoute(nodePath, filePath);
			},
			ClassDeclaration: (nodePath: NodePath<t.ClassDeclaration>) => {
				this.analyzeNestJsController(nodePath, filePath);
			},
		});
	}

	/** Extract schema from fastify.addSchema() calls */
	private analyzeAddSchemaCall(nodePath: NodePath<t.CallExpression>): void {
		const node = nodePath.node;

		// Match: fastify.addSchema(schemaObject) or instance.addSchema(schemaObject)
		if (
			t.isMemberExpression(node.callee) &&
			t.isIdentifier(node.callee.property, { name: "addSchema" }) &&
			node.arguments.length > 0
		) {
			const schemaArg = node.arguments[0];

			// Handle direct object literal: addSchema({ $id: 'Drink', ... })
			if (t.isObjectExpression(schemaArg)) {
				const schema = this.extractComponentSchema(schemaArg);
				if (schema) {
					this.components.push(schema);
					this.emit("schemaFound", schema);
				}
			}

			// Handle variable reference: addSchema(DrinkSchema)
			if (t.isIdentifier(schemaArg)) {
				const binding = nodePath.scope.getBinding(schemaArg.name);
				if (binding && t.isVariableDeclarator(binding.path.node) && binding.path.node.init) {
					if (t.isObjectExpression(binding.path.node.init)) {
						const schema = this.extractComponentSchema(binding.path.node.init);
						if (schema) {
							this.components.push(schema);
							this.emit("schemaFound", schema);
						}
					}
				}
			}
		}
	}

	/** Extract OpenAPI config from fastify.register(swagger, { openapi: ... }) */
	private analyzeSwaggerRegister(nodePath: NodePath<t.CallExpression>): void {
		const node = nodePath.node;

		// Match: fastify.register(swagger, { openapi: {...} })
		if (
			t.isMemberExpression(node.callee) &&
			t.isIdentifier(node.callee.property, { name: "register" }) &&
			node.arguments.length >= 2
		) {
			const pluginArg = node.arguments[0];
			const optionsArg = node.arguments[1];

			// Check if first arg is swagger (identifier)
			const isSwagger =
				t.isIdentifier(pluginArg) &&
				(pluginArg.name === "swagger" ||
					pluginArg.name === "fastifySwagger" ||
					pluginArg.name.toLowerCase().includes("swagger"));

			if (isSwagger && t.isObjectExpression(optionsArg)) {
				this.extractOpenApiConfig(optionsArg);
			}
		}
	}

	/** Extract component schema from an ObjectExpression */
	private extractComponentSchema(objExpr: t.ObjectExpression): ComponentSchema | null {
		let $id: string | null = null;
		let type = "object";
		const properties: Record<string, SchemaProperty> = {};
		const required: Array<string> = [];
		let description: string | undefined;
		let title: string | undefined;
		const enumValues: Array<string> = [];

		for (const prop of objExpr.properties) {
			if (!t.isObjectProperty(prop)) continue;

			const keyName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
			if (!keyName) continue;

			if (keyName === "$id" && t.isStringLiteral(prop.value)) {
				$id = prop.value.value;
			} else if (keyName === "type" && t.isStringLiteral(prop.value)) {
				type = prop.value.value;
			} else if (keyName === "description" && t.isStringLiteral(prop.value)) {
				description = prop.value.value;
			} else if (keyName === "title" && t.isStringLiteral(prop.value)) {
				title = prop.value.value;
			} else if (keyName === "properties" && t.isObjectExpression(prop.value)) {
				for (const propDef of prop.value.properties) {
					if (!t.isObjectProperty(propDef)) continue;
					const propName = t.isIdentifier(propDef.key)
						? propDef.key.name
						: t.isStringLiteral(propDef.key)
							? propDef.key.value
							: null;
					if (propName && t.isObjectExpression(propDef.value)) {
						properties[propName] = this.extractSchemaProperty(propDef.value);
					}
				}
			} else if (keyName === "required" && t.isArrayExpression(prop.value)) {
				for (const elem of prop.value.elements) {
					if (t.isStringLiteral(elem)) {
						required.push(elem.value);
					}
				}
			} else if (keyName === "enum" && t.isArrayExpression(prop.value)) {
				for (const elem of prop.value.elements) {
					if (t.isStringLiteral(elem)) {
						enumValues.push(elem.value);
					}
				}
			}
		}

		if (!$id) return null;

		const schema: ComponentSchema = { $id, type };
		if (Object.keys(properties).length > 0) schema.properties = properties;
		if (required.length > 0) schema.required = required;
		if (enumValues.length > 0) schema.enum = enumValues;
		if (description) schema.description = description;
		if (title) schema.title = title;

		return schema;
	}

	/** Extract a single schema property definition */
	private extractSchemaProperty(objExpr: t.ObjectExpression): SchemaProperty {
		const prop: SchemaProperty = { type: "string" };

		for (const p of objExpr.properties) {
			if (!t.isObjectProperty(p)) continue;
			const keyName = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : null;
			if (!keyName) continue;

			if (keyName === "type" && t.isStringLiteral(p.value)) {
				prop.type = p.value.value;
			} else if (keyName === "title" && t.isStringLiteral(p.value)) {
				prop.title = p.value.value;
			} else if (keyName === "description" && t.isStringLiteral(p.value)) {
				prop.description = p.value.value;
			} else if (keyName === "format" && t.isStringLiteral(p.value)) {
				prop.format = p.value.value;
			} else if (keyName === "$ref" && t.isStringLiteral(p.value)) {
				prop.$ref = p.value.value;
			} else if (keyName === "example") {
				if (t.isStringLiteral(p.value)) prop.example = p.value.value;
				else if (t.isNumericLiteral(p.value)) prop.example = p.value.value;
				else if (t.isBooleanLiteral(p.value)) prop.example = p.value.value;
			} else if (keyName === "enum" && t.isArrayExpression(p.value)) {
				prop.enum = [];
				for (const elem of p.value.elements) {
					if (t.isStringLiteral(elem)) {
						prop.enum.push(elem.value);
					}
				}
			}
		}

		return prop;
	}

	/** Extract OpenAPI configuration from swagger options object */
	private extractOpenApiConfig(optionsObj: t.ObjectExpression): void {
		for (const prop of optionsObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;

			if (keyName === "openapi" && t.isObjectExpression(prop.value)) {
				this.parseOpenApiObject(prop.value);
			}
		}
	}

	/** Parse the openapi configuration object */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex OpenAPI structure requires deep parsing
	private parseOpenApiObject(openApiObj: t.ObjectExpression): void {
		for (const prop of openApiObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
			if (!keyName) continue;

			// Handle x-* extensions
			if (keyName.startsWith("x-") && t.isObjectExpression(prop.value)) {
				if (!this.openApiConfig.extensions) this.openApiConfig.extensions = {};
				this.openApiConfig.extensions[keyName] = this.objectExpressionToJson(prop.value);
			} else if (keyName === "info" && t.isObjectExpression(prop.value)) {
				this.openApiConfig.info = this.parseInfoObject(prop.value);
			} else if (keyName === "servers" && t.isArrayExpression(prop.value)) {
				this.openApiConfig.servers = [];
				for (const elem of prop.value.elements) {
					if (t.isObjectExpression(elem)) {
						const server = this.parseServerObject(elem);
						if (server) this.openApiConfig.servers.push(server);
					}
				}
			} else if (keyName === "tags" && t.isArrayExpression(prop.value)) {
				this.openApiConfig.tags = [];
				for (const elem of prop.value.elements) {
					if (t.isObjectExpression(elem)) {
						const tag = this.parseTagObject(elem);
						if (tag) this.openApiConfig.tags.push(tag);
					}
				}
			}
		}
	}

	/** Parse info object from OpenAPI config */
	private parseInfoObject(
		infoObj: t.ObjectExpression,
	): NonNullable<OpenApiConfig["info"]> {
		const info: NonNullable<OpenApiConfig["info"]> = {};

		for (const prop of infoObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : null;
			if (!keyName) continue;

			if (keyName === "title" && t.isStringLiteral(prop.value)) info.title = prop.value.value;
			else if (keyName === "description" && t.isStringLiteral(prop.value)) info.description = prop.value.value;
			else if (keyName === "version" && t.isStringLiteral(prop.value)) info.version = prop.value.value;
			else if (keyName === "termsOfService" && t.isStringLiteral(prop.value)) info.termsOfService = prop.value.value;
			else if (keyName === "contact" && t.isObjectExpression(prop.value)) {
				info.contact = {};
				for (const cp of prop.value.properties) {
					if (!t.isObjectProperty(cp)) continue;
					const ck = t.isIdentifier(cp.key) ? cp.key.name : null;
					if (ck === "name" && t.isStringLiteral(cp.value)) info.contact.name = cp.value.value;
					else if (ck === "url" && t.isStringLiteral(cp.value)) info.contact.url = cp.value.value;
					else if (ck === "email" && t.isStringLiteral(cp.value)) info.contact.email = cp.value.value;
				}
			} else if (keyName === "license" && t.isObjectExpression(prop.value)) {
				info.license = {};
				for (const lp of prop.value.properties) {
					if (!t.isObjectProperty(lp)) continue;
					const lk = t.isIdentifier(lp.key) ? lp.key.name : null;
					if (lk === "name" && t.isStringLiteral(lp.value)) info.license.name = lp.value.value;
					else if (lk === "url" && t.isStringLiteral(lp.value)) info.license.url = lp.value.value;
				}
			}
		}

		return info;
	}

	/** Parse server object from OpenAPI config */
	private parseServerObject(serverObj: t.ObjectExpression): { url: string; description?: string } | null {
		let url: string | null = null;
		let description: string | undefined;

		for (const prop of serverObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : null;
			if (keyName === "url" && t.isStringLiteral(prop.value)) url = prop.value.value;
			else if (keyName === "description" && t.isStringLiteral(prop.value)) description = prop.value.value;
		}

		if (!url) return null;
		return description ? { url, description } : { url };
	}

	/** Parse tag object from OpenAPI config */
	private parseTagObject(
		tagObj: t.ObjectExpression,
	): { name: string; description?: string; externalDocs?: { description?: string; url?: string } } | null {
		let name: string | null = null;
		let description: string | undefined;
		let externalDocs: { description?: string; url?: string } | undefined;

		for (const prop of tagObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : null;
			if (keyName === "name" && t.isStringLiteral(prop.value)) name = prop.value.value;
			else if (keyName === "description" && t.isStringLiteral(prop.value)) description = prop.value.value;
			else if (keyName === "externalDocs" && t.isObjectExpression(prop.value)) {
				externalDocs = {};
				for (const ep of prop.value.properties) {
					if (!t.isObjectProperty(ep)) continue;
					const ek = t.isIdentifier(ep.key) ? ep.key.name : null;
					if (ek === "description" && t.isStringLiteral(ep.value)) externalDocs.description = ep.value.value;
					else if (ek === "url" && t.isStringLiteral(ep.value)) externalDocs.url = ep.value.value;
				}
			}
		}

		if (!name) return null;
		const result: { name: string; description?: string; externalDocs?: { description?: string; url?: string } } = {
			name,
		};
		if (description) result.description = description;
		if (externalDocs) result.externalDocs = externalDocs;
		return result;
	}

	/** Convert ObjectExpression to JSON-like structure */
	private objectExpressionToJson(objExpr: t.ObjectExpression): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		for (const prop of objExpr.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
			if (!keyName) continue;

			if (t.isStringLiteral(prop.value)) result[keyName] = prop.value.value;
			else if (t.isNumericLiteral(prop.value)) result[keyName] = prop.value.value;
			else if (t.isBooleanLiteral(prop.value)) result[keyName] = prop.value.value;
			else if (t.isObjectExpression(prop.value)) result[keyName] = this.objectExpressionToJson(prop.value);
			else if (t.isArrayExpression(prop.value)) result[keyName] = this.arrayExpressionToJson(prop.value);
		}

		return result;
	}

	/** Convert ArrayExpression to JSON-like structure */
	private arrayExpressionToJson(arrExpr: t.ArrayExpression): Array<unknown> {
		const result: Array<unknown> = [];

		for (const elem of arrExpr.elements) {
			if (t.isStringLiteral(elem)) result.push(elem.value);
			else if (t.isNumericLiteral(elem)) result.push(elem.value);
			else if (t.isBooleanLiteral(elem)) result.push(elem.value);
			else if (t.isObjectExpression(elem)) result.push(this.objectExpressionToJson(elem));
			else if (t.isArrayExpression(elem)) result.push(this.arrayExpressionToJson(elem));
		}

		return result;
	}

	private analyzeNextJsRoute(nodePath: NodePath<t.ExportNamedDeclaration>, filePath: string): void {
		const node = nodePath.node;

		if (t.isFunctionDeclaration(node.declaration) && node.declaration.id) {
			const functionName = node.declaration.id.name;
			const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

			if (httpMethods.includes(functionName)) {
				const routePath = this.inferNextJsRoutePath(filePath);

				if (routePath) {
					const handler = node.declaration;
					const routeInfo = this.analyzeNextJsHandler(functionName, routePath, handler, filePath);
					this.routes.push(routeInfo);
					this.emit("routeFound", routeInfo);
				}
			}
		}
	}

	private inferNextJsRoutePath(filePath: string): string | null {
		const normalizedPath = filePath.replace(/\\/g, "/");

		const appMatch = normalizedPath.match(/\/app\/(.*?)\/route\.(ts|js|mjs)$/);
		if (appMatch) {
			let routePath = `/${appMatch[1]}`;
			routePath = routePath.replace(/\[([^\]]+)\]/g, ":$1");
			return routePath;
		}

		const apiMatch = normalizedPath.match(/\/(api\/.*?)\/route\.(ts|js|mjs)$/);
		if (apiMatch) {
			let routePath = `/${apiMatch[1]}`;
			routePath = routePath.replace(/\[([^\]]+)\]/g, ":$1");
			return routePath;
		}

		return null;
	}

	private analyzeNextJsHandler(
		method: string,
		routePath: string,
		handler: t.FunctionDeclaration,
		filePath: string,
	): RouteInfo {
		const routeInfo: RouteInfo = {
			method,
			path: routePath,
			filePath,
			framework: "nextjs",
			handler: {},
		};

		if (handler.body && t.isBlockStatement(handler.body)) {
			const requestBody = this.extractNextJsRequestBody(handler);
			if (requestBody) {
				routeInfo.handler.requestBody = requestBody;
			}

			const pathParams = this.extractPathParams(routePath);
			if (pathParams.length > 0) {
				routeInfo.handler.pathParams = pathParams;
			}

			const responses = this.extractNextJsResponses(handler);
			if (responses.length > 0) {
				routeInfo.handler.responses = responses;
			}
		}

		return routeInfo;
	}

	private extractNextJsRequestBody(handler: t.FunctionDeclaration): RequestBodyInfo | null {
		const properties: Array<PropertyInfo> = [];
		const requiredFields = new Set<string>();

		if (!handler.body || !t.isBlockStatement(handler.body)) {
			return null;
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal requires deep nesting
		const walkStatements = (statements: Array<t.Statement>) => {
			for (const stmt of statements) {
				if (t.isVariableDeclaration(stmt)) {
					for (const declarator of stmt.declarations) {
						if (
							t.isAwaitExpression(declarator.init) &&
							t.isCallExpression(declarator.init.argument) &&
							t.isMemberExpression(declarator.init.argument.callee) &&
							t.isIdentifier(declarator.init.argument.callee.property, { name: "json" }) &&
							t.isObjectPattern(declarator.id)
						) {
							for (const prop of declarator.id.properties) {
								if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
									const propName = prop.key.name;
									const propType = this.inferPropertyType(propName);

									properties.push({
										name: propName,
										type: propType,
										required: false,
									});
								}
							}
						}
					}
				}

				if (t.isIfStatement(stmt)) {
					const test = stmt.test;

					if (t.isUnaryExpression(test, { operator: "!" }) && t.isIdentifier(test.argument)) {
						const fieldName = test.argument.name;
						const isErrorHandling = this.isNextJsErrorHandling(stmt.consequent);

						if (isErrorHandling) {
							requiredFields.add(fieldName);
						}
					}
				}

				if (t.isBlockStatement(stmt)) {
					walkStatements(stmt.body);
				}
				if (t.isIfStatement(stmt) && t.isBlockStatement(stmt.consequent)) {
					walkStatements(stmt.consequent.body);
				}
			}
		};

		walkStatements(handler.body.body);

		for (const prop of properties) {
			prop.required = requiredFields.has(prop.name);
		}

		if (properties.length === 0) {
			return null;
		}

		return {
			properties,
			contentType: "application/json",
		};
	}

	private extractNextJsResponses(handler: t.FunctionDeclaration): Array<ResponseInfo> {
		const responses: Array<ResponseInfo> = [];

		if (!handler.body || !t.isBlockStatement(handler.body)) {
			return responses;
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal requires deep nesting
		const walkStatements = (statements: Array<t.Statement>) => {
			for (const stmt of statements) {
				if (t.isReturnStatement(stmt) && t.isCallExpression(stmt.argument)) {
					const call = stmt.argument;

					if (
						t.isMemberExpression(call.callee) &&
						t.isIdentifier(call.callee.object, { name: "NextResponse" }) &&
						t.isIdentifier(call.callee.property, { name: "json" })
					) {
						let statusCode = 200;

						if (call.arguments.length >= 2 && t.isObjectExpression(call.arguments[1])) {
							const optionsObj = call.arguments[1];
							for (const prop of optionsObj.properties) {
								if (
									t.isObjectProperty(prop) &&
									t.isIdentifier(prop.key, { name: "status" }) &&
									t.isNumericLiteral(prop.value)
								) {
									statusCode = prop.value.value;
								}
							}
						}

						const response: ResponseInfo = {
							statusCode,
							description: this.getStatusDescription(statusCode),
						};

						if (call.arguments.length > 0) {
							response.schema = this.extractSchema(call.arguments[0]);
						}

						responses.push(response);
					}
				}

				if (t.isBlockStatement(stmt)) {
					walkStatements(stmt.body);
				}
				if (t.isIfStatement(stmt)) {
					if (t.isBlockStatement(stmt.consequent)) {
						walkStatements(stmt.consequent.body);
					}
					if (stmt.alternate && t.isBlockStatement(stmt.alternate)) {
						walkStatements(stmt.alternate.body);
					}
				}
				if (t.isTryStatement(stmt)) {
					if (t.isBlockStatement(stmt.block)) {
						walkStatements(stmt.block.body);
					}
					if (stmt.handler && t.isBlockStatement(stmt.handler.body)) {
						walkStatements(stmt.handler.body.body);
					}
				}
			}
		};

		walkStatements(handler.body.body);

		return responses;
	}

	private isNextJsErrorHandling(node: t.Node): boolean {
		if (t.isReturnStatement(node)) {
			return true;
		}

		if (t.isBlockStatement(node)) {
			return node.body.some((stmt: t.Statement) => t.isReturnStatement(stmt));
		}

		return false;
	}

	private analyzeRouteCall(nodePath: NodePath<t.CallExpression>, filePath: string): void {
		const node = nodePath.node;

		if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
			const method = node.callee.property.name.toUpperCase();
			const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

			if (httpMethods.includes(method) && node.arguments.length >= 2) {
				const routePathArg = node.arguments[0];
				let routePath: string | null = null;

				if (t.isStringLiteral(routePathArg)) {
					routePath = routePathArg.value;
				} else if (t.isTemplateLiteral(routePathArg)) {
					routePath = this.evaluateTemplateLiteral(routePathArg);
				}

				if (routePath) {
					// Apply route prefix from directory structure (e.g., routes/drink/index.js -> /drink)
					const prefix = this.inferRoutePrefixFromFilePath(filePath);
					if (prefix && !routePath.startsWith(prefix)) {
						routePath = prefix + routePath;
					}

					const handlerArg = node.arguments[node.arguments.length - 1];

					// Check for Fastify options object (second argument before handler)
					let fastifyOptions: t.ObjectExpression | null = null;
					if (node.arguments.length >= 3 && t.isObjectExpression(node.arguments[1])) {
						fastifyOptions = node.arguments[1];
					} else if (node.arguments.length === 2 && t.isObjectExpression(node.arguments[1])) {
						// Could be options with inline handler, check for schema property
						const maybeOptions = node.arguments[1];
						const hasSchemaProperty = maybeOptions.properties.some(
							p => t.isObjectProperty(p) && t.isIdentifier(p.key, { name: "schema" }),
						);
						if (hasSchemaProperty) {
							fastifyOptions = maybeOptions;
						}
					}

					// Also check for variable reference to options: fastify.get('/path', { schema }, handler)
					if (!fastifyOptions && node.arguments.length >= 2 && t.isIdentifier(node.arguments[1])) {
						const optionsBinding = nodePath.scope.getBinding(node.arguments[1].name);
						if (optionsBinding && t.isVariableDeclarator(optionsBinding.path.node)) {
							if (t.isObjectExpression(optionsBinding.path.node.init)) {
								fastifyOptions = optionsBinding.path.node.init;
							}
						}
					}

					if (t.isFunction(handlerArg)) {
						let frameworkType = this.detectFramework(node.callee);
						const handlerFramework = this.detectFrameworkFromHandler(handlerArg);
						if (handlerFramework) {
							frameworkType = handlerFramework;
						}

						const routeInfo = this.analyzeRouteHandler(method, routePath, handlerArg, filePath, frameworkType);

						// Extract Fastify schema options
						if (fastifyOptions) {
							this.applyFastifySchemaOptions(routeInfo, fastifyOptions, nodePath);
						}

						this.routes.push(routeInfo);
						this.emit("routeFound", routeInfo);
					} else if (t.isIdentifier(handlerArg)) {
						const binding = nodePath.scope.getBinding(handlerArg.name);

						if (binding && binding.path.node) {
							let handlerFunction: t.Function | null = null;

							if (t.isFunctionDeclaration(binding.path.node)) {
								handlerFunction = binding.path.node;
							} else if (t.isVariableDeclarator(binding.path.node) && binding.path.node.init) {
								if (t.isFunction(binding.path.node.init)) {
									handlerFunction = binding.path.node.init;
								}
							}

							if (handlerFunction) {
								let frameworkType = this.detectFramework(node.callee);
								const handlerFramework = this.detectFrameworkFromHandler(handlerFunction);
								if (handlerFramework) {
									frameworkType = handlerFramework;
								}

								const routeInfo = this.analyzeRouteHandler(
									method,
									routePath,
									handlerFunction,
									filePath,
									frameworkType,
								);
								routeInfo.handler.functionName = handlerArg.name;

								// Extract Fastify schema options
								if (fastifyOptions) {
									this.applyFastifySchemaOptions(routeInfo, fastifyOptions, nodePath);
								}

								this.routes.push(routeInfo);
								this.emit("routeFound", routeInfo);
							} else {
								const frameworkType = this.detectFramework(node.callee);
								const routeInfo: RouteInfo = {
									method,
									path: routePath,
									framework: frameworkType,
									handler: { functionName: handlerArg.name },
									filePath,
								};

								if (fastifyOptions) {
									this.applyFastifySchemaOptions(routeInfo, fastifyOptions, nodePath);
								}

								this.routes.push(routeInfo);
								this.emit("routeFound", routeInfo);
							}
						} else {
							const frameworkType = this.detectFramework(node.callee);
							const routeInfo: RouteInfo = {
								method,
								path: routePath,
								framework: frameworkType,
								handler: { functionName: handlerArg.name },
								filePath,
							};

							if (fastifyOptions) {
								this.applyFastifySchemaOptions(routeInfo, fastifyOptions, nodePath);
							}

							this.routes.push(routeInfo);
							this.emit("routeFound", routeInfo);
						}
					}
				}
			}
		}
	}

	/** Infer route prefix from file path (e.g., routes/drink/index.js -> /drink) */
	private inferRoutePrefixFromFilePath(filePath: string): string {
		const normalizedPath = filePath.replace(/\\/g, "/");

		// Match routes/<folder>/index.js or routes/<folder>/<file>.js
		const routesMatch = normalizedPath.match(/\/routes\/([^/]+)\/(?:index\.(?:ts|js|mjs)|[^/]+\.(?:ts|js|mjs))$/);
		if (routesMatch) {
			const folderName = routesMatch[1];
			// Skip if it's the root route file
			if (folderName !== "root" && !normalizedPath.endsWith("/routes/root.js")) {
				return `/${folderName}`;
			}
		}

		return "";
	}

	/** Apply Fastify schema options (operationId, tags, response schemas) to route */
	private applyFastifySchemaOptions(
		routeInfo: RouteInfo,
		optionsObj: t.ObjectExpression,
		nodePath: NodePath<t.CallExpression>,
	): void {
		// Look for 'schema' property in options
		for (const prop of optionsObj.properties) {
			if (!t.isObjectProperty(prop)) continue;

			const keyName = t.isIdentifier(prop.key) ? prop.key.name : null;

			if (keyName === "schema") {
				let schemaObj: t.ObjectExpression | null = null;

				if (t.isObjectExpression(prop.value)) {
					schemaObj = prop.value;
				} else if (t.isIdentifier(prop.value)) {
					// Handle: { schema } (shorthand) or { schema: schemaVar }
					const schemaBinding = nodePath.scope.getBinding(prop.value.name);
					if (schemaBinding && t.isVariableDeclarator(schemaBinding.path.node)) {
						if (t.isObjectExpression(schemaBinding.path.node.init)) {
							schemaObj = schemaBinding.path.node.init;
						}
					}
				}

				if (schemaObj) {
					this.extractFastifySchema(routeInfo, schemaObj);
				}
			}
		}
	}

	/** Extract Fastify schema details (operationId, tags, response schemas) */
	private extractFastifySchema(routeInfo: RouteInfo, schemaObj: t.ObjectExpression): void {
		for (const prop of schemaObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : null;
			if (!keyName) continue;

			if (keyName === "operationId" && t.isStringLiteral(prop.value)) {
				routeInfo.operationId = prop.value.value;
			} else if (keyName === "tags" && t.isArrayExpression(prop.value)) {
				routeInfo.tags = [];
				for (const elem of prop.value.elements) {
					if (t.isStringLiteral(elem)) {
						routeInfo.tags.push(elem.value);
					}
				}
			} else if (keyName === "response" && t.isObjectExpression(prop.value)) {
				// Extract response schemas with $ref support
				this.extractFastifyResponseSchemas(routeInfo, prop.value);
			} else if (keyName === "params" && t.isObjectExpression(prop.value)) {
				// Extract params schema
				this.extractFastifyParamsSchema(routeInfo, prop.value);
			} else if (keyName === "body" && t.isObjectExpression(prop.value)) {
				// Extract body schema
				this.extractFastifyBodySchema(routeInfo, prop.value);
			}
		}
	}

	/** Extract response schemas from Fastify schema.response */
	private extractFastifyResponseSchemas(routeInfo: RouteInfo, responseObj: t.ObjectExpression): void {
		// Clear existing responses - Fastify schema takes precedence with richer info
		routeInfo.handler.responses = [];

		for (const prop of responseObj.properties) {
			if (!t.isObjectProperty(prop)) continue;

			// Status code as key (e.g., 200, "200")
			let statusCode: number | null = null;
			if (t.isNumericLiteral(prop.key)) {
				statusCode = prop.key.value;
			} else if (t.isStringLiteral(prop.key)) {
				statusCode = Number.parseInt(prop.key.value, 10);
			}

			if (statusCode && t.isObjectExpression(prop.value)) {
				const response: ResponseInfo = {
					statusCode,
					description: this.getStatusDescription(statusCode),
				};

				// Check for $ref in response schema
				for (const respProp of prop.value.properties) {
					if (!t.isObjectProperty(respProp)) continue;
					const respKeyName = t.isIdentifier(respProp.key)
						? respProp.key.name
						: t.isStringLiteral(respProp.key)
							? respProp.key.value
							: null;

					if (respKeyName === "$ref" && t.isStringLiteral(respProp.value)) {
						response.schemaRef = respProp.value.value;
					} else if (respKeyName === "type" && t.isStringLiteral(respProp.value)) {
						response.schema = { type: respProp.value.value };
					} else if (respKeyName === "properties" && t.isObjectExpression(respProp.value)) {
						response.schema = this.extractSchema(prop.value);
					}
				}

				// If no schema or ref extracted, try to extract full schema
				if (!response.schema && !response.schemaRef) {
					const extracted = this.extractSchemaFromFastifyResponse(prop.value);
					if (extracted) {
						response.schema = extracted;
					}
				}

				routeInfo.handler.responses.push(response);
			}
		}
	}

	/** Extract schema from Fastify response definition */
	private extractSchemaFromFastifyResponse(responseObj: t.ObjectExpression): Record<string, unknown> | undefined {
		const schema: Record<string, unknown> = {};

		for (const prop of responseObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : null;
			if (!keyName) continue;

			if (keyName === "type" && t.isStringLiteral(prop.value)) {
				schema.type = prop.value.value;
			} else if (keyName === "properties" && t.isObjectExpression(prop.value)) {
				schema.type = "object";
				schema.properties = {};
				for (const pp of prop.value.properties) {
					if (!t.isObjectProperty(pp)) continue;
					const propName = t.isIdentifier(pp.key) ? pp.key.name : null;
					if (propName && t.isObjectExpression(pp.value)) {
						(schema.properties as Record<string, unknown>)[propName] = this.extractSchemaProperty(pp.value);
					}
				}
			}
		}

		return Object.keys(schema).length > 0 ? schema : undefined;
	}

	/** Extract params schema from Fastify schema.params */
	private extractFastifyParamsSchema(routeInfo: RouteInfo, paramsObj: t.ObjectExpression): void {
		// Look for properties in params schema
		for (const prop of paramsObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : null;

			if (keyName === "properties" && t.isObjectExpression(prop.value)) {
				// Clear existing path params - Fastify schema takes precedence with richer info
				routeInfo.handler.pathParams = [];

				for (const paramProp of prop.value.properties) {
					if (!t.isObjectProperty(paramProp)) continue;
					const paramName = t.isIdentifier(paramProp.key) ? paramProp.key.name : null;
					if (paramName && t.isObjectExpression(paramProp.value)) {
						const schemaProperty = this.extractSchemaProperty(paramProp.value);
						const paramInfo: ParameterInfo = {
							name: paramName,
							type: schemaProperty.type,
							required: true,
						};
						if (schemaProperty.description) {
							paramInfo.description = schemaProperty.description;
						}
						routeInfo.handler.pathParams.push(paramInfo);
					}
				}
			}
		}
	}

	/** Extract body schema from Fastify schema.body */
	private extractFastifyBodySchema(routeInfo: RouteInfo, bodyObj: t.ObjectExpression): void {
		const properties: Array<PropertyInfo> = [];
		const required: Array<string> = [];

		for (const prop of bodyObj.properties) {
			if (!t.isObjectProperty(prop)) continue;
			const keyName = t.isIdentifier(prop.key) ? prop.key.name : null;

			if (keyName === "properties" && t.isObjectExpression(prop.value)) {
				for (const bodyProp of prop.value.properties) {
					if (!t.isObjectProperty(bodyProp)) continue;
					const propName = t.isIdentifier(bodyProp.key) ? bodyProp.key.name : null;
					if (propName && t.isObjectExpression(bodyProp.value)) {
						const schemaProperty = this.extractSchemaProperty(bodyProp.value);
						const propInfo: PropertyInfo = {
							name: propName,
							type: schemaProperty.type,
							required: false, // Will be updated if in required array
						};
						if (schemaProperty.description) {
							propInfo.description = schemaProperty.description;
						}
						properties.push(propInfo);
					}
				}
			} else if (keyName === "required" && t.isArrayExpression(prop.value)) {
				for (const elem of prop.value.elements) {
					if (t.isStringLiteral(elem)) {
						required.push(elem.value);
					}
				}
			}
		}

		// Update required status
		for (const p of properties) {
			p.required = required.includes(p.name);
		}

		if (properties.length > 0) {
			routeInfo.handler.requestBody = {
				properties,
				contentType: "application/json",
			};
		}
	}

	private detectFramework(callee: t.MemberExpression): string {
		if (t.isIdentifier(callee.object)) {
			const objectName = callee.object.name.toLowerCase();
			if (objectName.includes("fastify")) return "fastify";
			if (objectName.includes("koa")) return "koa";
			if (objectName.includes("hono")) return "hono";
			if (objectName.includes("router")) return "express";
			if (objectName.includes("app")) return "express";
		}
		return "express";
	}

	private detectFrameworkFromHandler(handler: t.Function): string | null {
		if (handler.params.length > 0 && t.isIdentifier(handler.params[0])) {
			const firstParam = handler.params[0].name;
			if (firstParam === "ctx") return "koa";
			if (firstParam === "request" && handler.params.length >= 2) return "fastify";
			if (firstParam === "c") return "hono";
			if (firstParam === "req" || firstParam === "request") return "express";
		}
		return null;
	}

	private analyzeRouteHandler(
		method: string,
		routePath: string,
		handler: t.Function,
		filePath: string,
		frameworkType = "express",
	): RouteInfo {
		const routeInfo: RouteInfo = {
			method,
			path: routePath,
			filePath,
			framework: frameworkType,
			handler: {},
		};

		if (t.isBlockStatement(handler.body)) {
			const requestBody = this.extractRequestBody(handler, frameworkType);
			if (requestBody) {
				routeInfo.handler.requestBody = requestBody;
			}

			const queryParams = this.extractQueryParams(handler, frameworkType);
			if (queryParams.length > 0) {
				routeInfo.handler.queryParams = queryParams;
			}

			const pathParams = this.extractPathParams(routePath);
			if (pathParams.length > 0) {
				routeInfo.handler.pathParams = pathParams;
			}

			const responses = this.extractResponses(handler, frameworkType);
			if (responses.length > 0) {
				routeInfo.handler.responses = responses;
			}
		}

		return routeInfo;
	}

	private extractRequestBody(handler: t.Function, frameworkType = "express"): RequestBodyInfo | null {
		const properties: Array<PropertyInfo> = [];
		const requiredFields = new Set<string>();

		if (!t.isBlockStatement(handler.body)) {
			return null;
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal requires deep nesting
		const walkStatements = (statements: Array<t.Statement>) => {
			for (const stmt of statements) {
				if (t.isVariableDeclaration(stmt)) {
					for (const declarator of stmt.declarations) {
						// Express/Fastify/Hono pattern: req.body or request.body
						if (
							t.isMemberExpression(declarator.init) &&
							t.isIdentifier(declarator.init.object) &&
							(declarator.init.object.name === "req" ||
								declarator.init.object.name === "request" ||
								declarator.init.object.name === "c") &&
							t.isIdentifier(declarator.init.property, { name: "body" }) &&
							t.isObjectPattern(declarator.id)
						) {
							for (const prop of declarator.id.properties) {
								if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
									const propName = prop.key.name;
									const propType = this.inferPropertyType(propName);

									properties.push({
										name: propName,
										type: propType,
										required: false,
									});
								}
							}
						}

						// Koa pattern: ctx.request.body
						if (
							frameworkType === "koa" &&
							t.isMemberExpression(declarator.init) &&
							t.isMemberExpression(declarator.init.object) &&
							t.isIdentifier(declarator.init.object.object, { name: "ctx" }) &&
							t.isIdentifier(declarator.init.object.property, { name: "request" }) &&
							t.isIdentifier(declarator.init.property, { name: "body" }) &&
							t.isObjectPattern(declarator.id)
						) {
							for (const prop of declarator.id.properties) {
								if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
									const propName = prop.key.name;
									const propType = this.inferPropertyType(propName);

									properties.push({
										name: propName,
										type: propType,
										required: false,
									});
								}
							}
						}
					}
				}

				// Look for validation: if (!field) throw/return error
				if (t.isIfStatement(stmt)) {
					const test = stmt.test;

					if (t.isUnaryExpression(test, { operator: "!" }) && t.isIdentifier(test.argument)) {
						const fieldName = test.argument.name;
						const isErrorHandling = this.isErrorHandling(stmt.consequent);

						if (isErrorHandling) {
							requiredFields.add(fieldName);
						}
					}
				}

				// Recursively check nested blocks
				if (t.isBlockStatement(stmt)) {
					walkStatements(stmt.body);
				}
				if (t.isIfStatement(stmt) && t.isBlockStatement(stmt.consequent)) {
					walkStatements(stmt.consequent.body);
				}
				if (t.isTryStatement(stmt) && t.isBlockStatement(stmt.block)) {
					walkStatements(stmt.block.body);
				}
			}
		};

		walkStatements(handler.body.body);

		for (const prop of properties) {
			prop.required = requiredFields.has(prop.name);
		}

		if (properties.length === 0) {
			return null;
		}

		return {
			properties,
			contentType: "application/json",
		};
	}

	private extractQueryParams(_handler: t.Function, _frameworkType = "express"): Array<ParameterInfo> {
		// Could be enhanced to walk AST and find req.query.paramName usage
		return [];
	}

	private extractPathParams(routePath: string): Array<ParameterInfo> {
		const params: Array<ParameterInfo> = [];
		const paramMatches = routePath.matchAll(/:([a-zA-Z0-9_]+)/g);
		for (const match of paramMatches) {
			const paramName = match[1];
			params.push({
				name: paramName,
				type: "string",
				required: true,
			});
		}
		return params;
	}

	private extractResponses(handler: t.Function, frameworkType = "express"): Array<ResponseInfo> {
		const responses: Array<ResponseInfo> = [];

		if (!t.isBlockStatement(handler.body)) {
			return responses;
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal requires deep nesting
		const walkStatements = (statements: Array<t.Statement>) => {
			for (const stmt of statements) {
				if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
					const call = stmt.expression;

					// Express: res.json({ ... })
					if (
						t.isMemberExpression(call.callee) &&
						t.isIdentifier(call.callee.object, { name: "res" }) &&
						t.isIdentifier(call.callee.property, { name: "json" }) &&
						call.arguments.length > 0
					) {
						responses.push({
							statusCode: 200,
							description: "Successful response",
							schema: this.extractSchema(call.arguments[0]),
						});
					}

					// Express: res.status(200).json(...)
					if (
						t.isMemberExpression(call.callee) &&
						t.isCallExpression(call.callee.object) &&
						t.isMemberExpression(call.callee.object.callee) &&
						t.isIdentifier(call.callee.object.callee.object, { name: "res" }) &&
						t.isIdentifier(call.callee.object.callee.property, { name: "status" })
					) {
						const statusArg = call.callee.object.arguments[0];
						if (t.isNumericLiteral(statusArg)) {
							const response: ResponseInfo = {
								statusCode: statusArg.value,
								description: this.getStatusDescription(statusArg.value),
							};
							if (call.arguments.length > 0) {
								response.schema = this.extractSchema(call.arguments[0]);
							}
							responses.push(response);
						}
					}

					// Fastify: reply.send({ ... })
					if (
						frameworkType === "fastify" &&
						t.isMemberExpression(call.callee) &&
						t.isIdentifier(call.callee.object, { name: "reply" }) &&
						t.isIdentifier(call.callee.property, { name: "send" }) &&
						call.arguments.length > 0
					) {
						responses.push({
							statusCode: 200,
							description: "Successful response",
							schema: this.extractSchema(call.arguments[0]),
						});
					}

					// Fastify: reply.code(200).send(...)
					if (
						frameworkType === "fastify" &&
						t.isMemberExpression(call.callee) &&
						t.isCallExpression(call.callee.object) &&
						t.isMemberExpression(call.callee.object.callee) &&
						t.isIdentifier(call.callee.object.callee.object, { name: "reply" }) &&
						t.isIdentifier(call.callee.object.callee.property, { name: "code" })
					) {
						const statusArg = call.callee.object.arguments[0];
						if (t.isNumericLiteral(statusArg)) {
							const response: ResponseInfo = {
								statusCode: statusArg.value,
								description: this.getStatusDescription(statusArg.value),
							};
							if (call.arguments.length > 0) {
								response.schema = this.extractSchema(call.arguments[0]);
							}
							responses.push(response);
						}
					}
				}

				// Koa: ctx.body = { ... }
				if (
					frameworkType === "koa" &&
					t.isExpressionStatement(stmt) &&
					t.isAssignmentExpression(stmt.expression) &&
					t.isMemberExpression(stmt.expression.left) &&
					t.isIdentifier(stmt.expression.left.object, { name: "ctx" }) &&
					t.isIdentifier(stmt.expression.left.property, { name: "body" })
				) {
					responses.push({
						statusCode: 200,
						description: "Successful response",
						schema: this.extractSchema(stmt.expression.right),
					});
				}

				// Hono: return c.json({ ... }) or return c.json({ ... }, 200)
				if (
					(frameworkType === "hono" || frameworkType === "express") &&
					t.isReturnStatement(stmt) &&
					t.isCallExpression(stmt.argument) &&
					t.isMemberExpression(stmt.argument.callee) &&
					t.isIdentifier(stmt.argument.callee.object, { name: "c" }) &&
					t.isIdentifier(stmt.argument.callee.property, { name: "json" })
				) {
					let statusCode = 200;
					if (stmt.argument.arguments.length >= 2 && t.isNumericLiteral(stmt.argument.arguments[1])) {
						statusCode = stmt.argument.arguments[1].value;
					}

					const response: ResponseInfo = {
						statusCode,
						description: this.getStatusDescription(statusCode),
					};

					if (stmt.argument.arguments.length > 0) {
						response.schema = this.extractSchema(stmt.argument.arguments[0]);
					}

					responses.push(response);
				}

				// Look for: throw new Error(...)
				if (t.isThrowStatement(stmt) && !responses.find(r => r.statusCode >= 400)) {
					responses.push({
						statusCode: 400,
						description: "Bad request",
					});
				}

				// Recursively check nested blocks
				if (t.isBlockStatement(stmt)) {
					walkStatements(stmt.body);
				}
				if (t.isIfStatement(stmt)) {
					if (t.isBlockStatement(stmt.consequent)) {
						walkStatements(stmt.consequent.body);
					}
					if (stmt.alternate && t.isBlockStatement(stmt.alternate)) {
						walkStatements(stmt.alternate.body);
					}
				}
				if (t.isTryStatement(stmt) && t.isBlockStatement(stmt.block)) {
					walkStatements(stmt.block.body);
				}
			}
		};

		walkStatements(handler.body.body);

		return responses;
	}

	private inferPropertyType(propName: string): string {
		const lowerName = propName.toLowerCase();

		if (lowerName.includes("id") || lowerName.includes("count") || lowerName.includes("age")) {
			return "number";
		}
		if (lowerName.includes("is") || lowerName.includes("has") || lowerName === "active") {
			return "boolean";
		}
		if (lowerName.includes("list") || lowerName.includes("items") || lowerName.endsWith("s")) {
			return "array";
		}

		return "string";
	}

	private isErrorHandling(node: t.Node): boolean {
		if (t.isThrowStatement(node)) {
			return true;
		}

		if (t.isBlockStatement(node)) {
			return node.body.some((stmt: t.Statement) => t.isThrowStatement(stmt) || t.isReturnStatement(stmt));
		}

		return false;
	}

	private extractSchema(node: t.Node): Record<string, unknown> {
		if (t.isObjectExpression(node)) {
			const schema: Record<string, unknown> = { type: "object", properties: {} };
			const properties: Record<string, unknown> = {};

			for (const prop of node.properties) {
				if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
					const key = prop.key.name;
					properties[key] = { type: "string" };
				}
			}

			schema.properties = properties;
			return schema;
		}

		return { type: "object" };
	}

	private getStatusDescription(statusCode: number): string {
		const descriptions: Record<number, string> = {
			200: "Successful response",
			201: "Resource created",
			204: "No content",
			400: "Bad request",
			401: "Unauthorized",
			403: "Forbidden",
			404: "Not found",
			500: "Internal server error",
		};

		return descriptions[statusCode] || `HTTP ${statusCode}`;
	}

	private evaluateTemplateLiteral(node: t.TemplateLiteral): string | null {
		if (node.expressions.length === 0 && node.quasis.length === 1) {
			return node.quasis[0].value.raw;
		}
		return null;
	}

	private inferProjectName(repoPath: string): string {
		const normalizedPath = repoPath.replace(/\\/g, "/");
		return path.basename(normalizedPath);
	}

	private analyzeNestJsController(nodePath: NodePath<t.ClassDeclaration>, filePath: string): void {
		const node = nodePath.node;

		if (!node.decorators) {
			return;
		}

		let controllerPath = "";
		for (const decorator of node.decorators) {
			if (
				t.isDecorator(decorator) &&
				t.isCallExpression(decorator.expression) &&
				t.isIdentifier(decorator.expression.callee, { name: "Controller" })
			) {
				if (decorator.expression.arguments.length > 0 && t.isStringLiteral(decorator.expression.arguments[0])) {
					controllerPath = decorator.expression.arguments[0].value;
					if (!controllerPath.startsWith("/")) {
						controllerPath = `/${controllerPath}`;
					}
				}
				break;
			}
		}

		if (node.body && t.isClassBody(node.body)) {
			for (const member of node.body.body) {
				if (t.isClassMethod(member) && member.decorators) {
					this.analyzeNestJsMethod(member, controllerPath, filePath);
				}
			}
		}
	}

	private analyzeNestJsMethod(method: t.ClassMethod, controllerPath: string, filePath: string): void {
		if (!method.decorators) {
			return;
		}

		const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

		for (const decorator of method.decorators) {
			if (!t.isDecorator(decorator) || !t.isCallExpression(decorator.expression)) {
				continue;
			}

			const decoratorName = t.isIdentifier(decorator.expression.callee) ? decorator.expression.callee.name : null;

			if (!decoratorName || !httpMethods.includes(decoratorName.toUpperCase())) {
				continue;
			}

			const httpMethod = decoratorName.toUpperCase();

			let methodPath = "";
			if (decorator.expression.arguments.length > 0 && t.isStringLiteral(decorator.expression.arguments[0])) {
				methodPath = decorator.expression.arguments[0].value;
			}

			let fullPath = controllerPath;
			if (methodPath) {
				if (!methodPath.startsWith("/")) {
					methodPath = `/${methodPath}`;
				}
				fullPath = `${controllerPath}${methodPath}`;
			}

			const routeInfo: RouteInfo = {
				method: httpMethod,
				path: fullPath || controllerPath,
				filePath,
				framework: "nestjs",
				handler: {},
			};

			const pathParams = this.extractPathParams(fullPath);
			if (pathParams.length > 0) {
				routeInfo.handler.pathParams = pathParams;
			}

			const requestBody = this.extractNestJsRequestBody(method);
			if (requestBody) {
				routeInfo.handler.requestBody = requestBody;
			}

			const responses = this.extractNestJsResponses(method);
			if (responses.length > 0) {
				routeInfo.handler.responses = responses;
			}

			this.routes.push(routeInfo);
			this.emit("routeFound", routeInfo);
		}
	}

	private extractNestJsRequestBody(method: t.ClassMethod): RequestBodyInfo | null {
		const properties: Array<PropertyInfo> = [];

		for (const param of method.params) {
			if (t.isIdentifier(param) && param.decorators) {
				for (const decorator of param.decorators) {
					if (
						t.isDecorator(decorator) &&
						t.isCallExpression(decorator.expression) &&
						t.isIdentifier(decorator.expression.callee, { name: "Body" })
					) {
						const paramName = param.name;
						properties.push({
							name: paramName,
							type: this.inferPropertyType(paramName),
							required: false,
						});
					}
				}
			}
		}

		if (properties.length === 0) {
			return null;
		}

		return {
			properties,
			contentType: "application/json",
		};
	}

	private extractNestJsResponses(method: t.ClassMethod): Array<ResponseInfo> {
		const responses: Array<ResponseInfo> = [];

		responses.push({
			statusCode: 200,
			description: "Successful response",
		});

		if (method.decorators) {
			for (const decorator of method.decorators) {
				if (
					t.isDecorator(decorator) &&
					t.isCallExpression(decorator.expression) &&
					t.isIdentifier(decorator.expression.callee, { name: "HttpCode" }) &&
					decorator.expression.arguments.length > 0 &&
					t.isNumericLiteral(decorator.expression.arguments[0])
				) {
					const statusCode = decorator.expression.arguments[0].value;
					responses[0] = {
						statusCode,
						description: this.getStatusDescription(statusCode),
					};
				}
			}
		}

		return responses;
	}
}
