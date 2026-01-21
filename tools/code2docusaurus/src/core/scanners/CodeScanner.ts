import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse } from "@babel/parser";
import type { NodePath } from "@babel/traverse";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import { glob } from "glob";

// Handle ESM/CommonJS interop for @babel/traverse
const traverse =
	(typeof traverseModule === "function"
		? traverseModule
		: (traverseModule as { default: typeof traverseModule }).default) || traverseModule;

export interface RouteInfo {
	method: string; // GET, POST, PUT, DELETE, etc.
	path: string; // /api/chat
	filePath: string; // Full file path
	handler: {
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
}

export interface CodeScanResult {
	routes: Array<RouteInfo>;
	title: string;
	version: string;
	baseUrl?: string;
	repoPath: string;
}

export class CodeScanner extends EventEmitter {
	private routes: Array<RouteInfo> = [];

	async scan(repoPath: string): Promise<CodeScanResult> {
		this.emit("start", { path: repoPath });

		// Find all JavaScript/TypeScript files
		const files = await this.findCodeFiles(repoPath);
		this.emit("filesFound", { count: files.length });

		// Parse each file
		for (let i = 0; i < files.length; i++) {
			const filePath = files[i];
			this.emit("file", filePath);
			this.emit("progress", {
				current: i + 1,
				total: files.length,
				percentage: Math.round(((i + 1) / files.length) * 100),
			});

			try {
				await this.scanFile(filePath);
			} catch (error) {
				// Emit error but continue scanning other files
				this.emit("error", { filePath, error });
				// Don't throw - continue with remaining files
			}
		}

		const result: CodeScanResult = {
			routes: this.routes,
			title: this.inferProjectName(repoPath),
			version: "1.0.0", // TODO: Read from package.json
			repoPath,
		};

		this.emit("complete", result);
		return result;
	}

	private async findCodeFiles(repoPath: string): Promise<Array<string>> {
		const patterns = [
			"**/routes/**/*.{ts,js,mjs}",
			"**/controllers/**/*.{ts,js,mjs}",
			"**/api/**/*.{ts,js,mjs}",
			"**/*router*.{ts,js,mjs}",
			"**/*route*.{ts,js,mjs}",
			"**/*controller*.{ts,js,mjs}",
			"**/*api*.{ts,js,mjs}",
			"**/server.{ts,js,mjs}",
			"**/app.{ts,js,mjs}",
			"**/index.{ts,js,mjs}",
			"**/main.{ts,js,mjs}",
			// Add top-level files for repositories without src folder
			"*.{ts,js,mjs}",
		];

		const allFiles: Array<string> = [];
		for (const pattern of patterns) {
			const files = await glob(pattern, {
				cwd: repoPath,
				absolute: true,
				ignore: [
					"**/node_modules/**",
					"**/dist/**",
					"**/build/**",
					"**/test/**",
					"**/*.test.{ts,js,mjs}",
					"**/*.spec.{ts,js,mjs}",
				],
			});
			allFiles.push(...files);
		}

		// Remove duplicates
		return [...new Set(allFiles)];
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
			errorRecovery: true, // Try to recover from parsing errors
		});

		// Traverse the AST to find route definitions
		traverse(ast, {
			// Look for: router.get('/path', handler)
			// Look for: router.post('/path', handler)
			// Look for: app.get('/path', handler)
			CallExpression: (path: NodePath<t.CallExpression>) => {
				this.analyzeRouteCall(path, filePath);
			},
			// Look for Next.js App Router patterns:
			// export async function GET(request: Request) { }
			// export async function POST(request: Request) { }
			ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
				this.analyzeNextJsRoute(path, filePath);
			},
			// Look for NestJS Controller classes with decorators:
			// @Controller('users')
			// class UserController {
			//   @Get(':id')
			//   findOne(@Param('id') id: string) { }
			// }
			ClassDeclaration: (path: NodePath<t.ClassDeclaration>) => {
				this.analyzeNestJsController(path, filePath);
			},
		});
	}

	private analyzeNextJsRoute(path: NodePath<t.ExportNamedDeclaration>, filePath: string): void {
		const node = path.node;

		// Check if this is a Next.js App Router export
		// export async function GET(request: Request) { }
		// export function POST(request: Request) { }
		if (t.isFunctionDeclaration(node.declaration) && node.declaration.id) {
			const functionName = node.declaration.id.name;
			const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

			if (httpMethods.includes(functionName)) {
				// Infer the route path from the file path
				// Next.js App Router: app/api/stream/sandbox/route.ts -> /api/stream/sandbox
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
		// Next.js App Router pattern: /path/to/app/api/users/route.ts -> /api/users
		// Next.js App Router pattern: /path/to/app/api/users/[id]/route.ts -> /api/users/:id

		// Normalize path separators
		const normalizedPath = filePath.replace(/\\/g, "/");

		// Find the "app" directory and extract the route path
		const appMatch = normalizedPath.match(/\/app\/(.*?)\/route\.(ts|js|mjs)$/);
		if (appMatch) {
			let routePath = `/${appMatch[1]}`;
			// Convert Next.js dynamic segments [id] to Express-style :id
			routePath = routePath.replace(/\[([^\]]+)\]/g, ":$1");
			return routePath;
		}

		// Fallback: try to find "api" in the path
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
			handler: {},
		};

		// Analyze the handler function body
		if (handler.body && t.isBlockStatement(handler.body)) {
			// Extract request body parameters
			const requestBody = this.extractNextJsRequestBody(handler);
			if (requestBody) {
				routeInfo.handler.requestBody = requestBody;
			}

			// Extract path parameters from the route path
			const pathParams = this.extractPathParams(routePath, handler as unknown as t.ArrowFunctionExpression);
			if (pathParams.length > 0) {
				routeInfo.handler.pathParams = pathParams;
			}

			// Extract responses
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

		/* v8 ignore next 3 -- FunctionDeclarations always have a BlockStatement body; this is a defensive check */
		if (!handler.body || !t.isBlockStatement(handler.body)) {
			return null;
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal requires deep nesting
		const walkStatements = (statements: Array<t.Statement>) => {
			for (const stmt of statements) {
				// Look for: const { sandboxId } = await request.json()
				// Look for: const body = await request.json(); const { sandboxId } = body;
				if (t.isVariableDeclaration(stmt)) {
					for (const declarator of stmt.declarations) {
						// Pattern 1: const { field } = await request.json()
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

				// Look for validation: if (!sandboxId) return NextResponse.json(...)
				if (t.isIfStatement(stmt)) {
					const test = stmt.test;

					if (t.isUnaryExpression(test, { operator: "!" }) && t.isIdentifier(test.argument)) {
						const fieldName = test.argument.name;

						// Check if the consequent returns an error response
						const isErrorHandling = this.isNextJsErrorHandling(stmt.consequent);

						if (isErrorHandling) {
							requiredFields.add(fieldName);
						}
					}
				}

				// Recursively check nested blocks
				/* v8 ignore next 3 -- naked block statements (not if/try/etc) are extremely rare in practice */
				if (t.isBlockStatement(stmt)) {
					walkStatements(stmt.body);
				}
				if (t.isIfStatement(stmt) && t.isBlockStatement(stmt.consequent)) {
					walkStatements(stmt.consequent.body);
				}
			}
		};

		walkStatements(handler.body.body);

		// Mark required fields
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

		/* v8 ignore next 3 -- FunctionDeclarations always have a BlockStatement body; this is a defensive check */
		if (!handler.body || !t.isBlockStatement(handler.body)) {
			return responses;
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal requires deep nesting
		const walkStatements = (statements: Array<t.Statement>) => {
			for (const stmt of statements) {
				// Look for: return NextResponse.json({ ... }, { status: 201 })
				if (t.isReturnStatement(stmt) && t.isCallExpression(stmt.argument)) {
					const call = stmt.argument;

					if (
						t.isMemberExpression(call.callee) &&
						t.isIdentifier(call.callee.object, { name: "NextResponse" }) &&
						t.isIdentifier(call.callee.property, { name: "json" })
					) {
						// Default to 200 if no status specified
						let statusCode = 200;

						// Check if there's a second argument with status
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

				// Recursively check nested blocks
				/* v8 ignore next 3 -- naked block statements (not if/try/etc) are extremely rare in practice */
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
		// Check if node returns NextResponse.json with error
		if (t.isReturnStatement(node)) {
			return true;
		}

		if (t.isBlockStatement(node)) {
			return node.body.some((stmt: t.Statement) => {
				if (t.isReturnStatement(stmt)) {
					return true;
				}
				return false;
			});
		}

		return false;
	}

	private analyzeRouteCall(path: NodePath<t.CallExpression>, filePath: string): void {
		const node = path.node;

		// Check if this is a route definition
		// e.g., router.post(...), app.get(...), fastify.get(...), etc.
		if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
			const method = node.callee.property.name.toUpperCase();
			const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

			if (httpMethods.includes(method) && node.arguments.length >= 2) {
				// First argument should be the path
				const routePathArg = node.arguments[0];
				let routePath: string | null = null;

				if (t.isStringLiteral(routePathArg)) {
					routePath = routePathArg.value;
				} else if (t.isTemplateLiteral(routePathArg)) {
					// Handle template literals like `${prefix}/chat`
					routePath = this.evaluateTemplateLiteral(routePathArg);
				}

				if (routePath) {
					// Last argument should be the handler function
					const handlerArg = node.arguments[node.arguments.length - 1];

					if (t.isFunction(handlerArg)) {
						// Detect framework type based on object name first
						let frameworkType = this.detectFramework(node.callee);

						// If not conclusive, detect from handler parameters
						const handlerFramework = this.detectFrameworkFromHandler(handlerArg);
						if (handlerFramework) {
							frameworkType = handlerFramework;
						}

						const routeInfo = this.analyzeRouteHandler(
							method,
							routePath,
							handlerArg,
							filePath,
							frameworkType,
						);
						this.routes.push(routeInfo);
						this.emit("routeFound", routeInfo);
					}
				}
			}
		}
	}

	private detectFramework(callee: t.MemberExpression): string {
		// Detect framework based on the object being called
		if (t.isIdentifier(callee.object)) {
			const objectName = callee.object.name.toLowerCase();
			// Check for specific frameworks first (before generic names)
			if (objectName.includes("fastify")) {
				return "fastify";
			}
			if (objectName.includes("koa")) {
				return "koa";
			}
			if (objectName.includes("hono")) {
				return "hono";
			}
			// Generic names default to Express
			if (objectName.includes("router")) {
				return "express";
			}
			if (objectName.includes("app")) {
				return "express";
			}
		}
		return "express"; // Default to Express
	}

	private detectFrameworkFromHandler(handler: t.ArrowFunctionExpression | t.FunctionExpression): string | null {
		// Detect framework from handler parameters
		if (handler.params.length > 0 && t.isIdentifier(handler.params[0])) {
			const firstParam = handler.params[0].name;
			// Koa uses 'ctx' as first parameter
			if (firstParam === "ctx") {
				return "koa";
			}
			// Fastify uses 'request' and 'reply'
			if (firstParam === "request" && handler.params.length >= 2) {
				return "fastify";
			}
			// Hono uses 'c' as first parameter
			if (firstParam === "c") {
				return "hono";
			}
			// Express uses 'req' and 'res'
			if (firstParam === "req" || firstParam === "request") {
				return "express";
			}
		}
		return null;
	}

	private analyzeRouteHandler(
		method: string,
		routePath: string,
		handler: t.ArrowFunctionExpression | t.FunctionExpression,
		filePath: string,
		frameworkType = "express",
	): RouteInfo {
		const routeInfo: RouteInfo = {
			method,
			path: routePath,
			filePath,
			handler: {},
		};

		// Analyze the handler function body
		if (t.isBlockStatement(handler.body)) {
			// Extract request body parameters
			const requestBody = this.extractRequestBody(handler, frameworkType);
			if (requestBody) {
				routeInfo.handler.requestBody = requestBody;
			}

			// Extract query parameters
			const queryParams = this.extractQueryParams(handler, frameworkType);
			/* v8 ignore next 3 -- extractQueryParams is a stub that always returns [], so this branch is unreachable */
			if (queryParams.length > 0) {
				routeInfo.handler.queryParams = queryParams;
			}

			// Extract path parameters
			const pathParams = this.extractPathParams(routePath, handler);
			if (pathParams.length > 0) {
				routeInfo.handler.pathParams = pathParams;
			}

			// Extract responses
			const responses = this.extractResponses(handler, frameworkType);
			if (responses.length > 0) {
				routeInfo.handler.responses = responses;
			}
		}

		return routeInfo;
	}

	private extractRequestBody(
		handler: t.ArrowFunctionExpression | t.FunctionExpression,
		frameworkType = "express",
	): RequestBodyInfo | null {
		const properties: Array<PropertyInfo> = [];
		const requiredFields = new Set<string>();

		// Manually walk the AST instead of using traverse for nested nodes
		if (!t.isBlockStatement(handler.body)) {
			return null;
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal requires deep nesting to handle all code patterns
		const walkStatements = (statements: Array<t.Statement>) => {
			for (const stmt of statements) {
				// Look for: const { message, userId } = req.body (Express)
				// Look for: const { message, userId } = request.body (Fastify, Hono)
				// Look for: const { message, userId } = ctx.request.body (Koa)
				if (t.isVariableDeclaration(stmt)) {
					for (const declarator of stmt.declarations) {
						// Express/Fastify/Hono pattern: req.body or request.body
						if (
							t.isMemberExpression(declarator.init) &&
							t.isIdentifier(declarator.init.object) &&
							(declarator.init.object.name === "req" ||
								declarator.init.object.name === "request" ||
								declarator.init.object.name === "c") && // Hono uses 'c' for context
							t.isIdentifier(declarator.init.property, { name: "body" }) &&
							t.isObjectPattern(declarator.id)
						) {
							// Extract destructured properties
							for (const prop of declarator.id.properties) {
								if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
									const propName = prop.key.name;
									const propType = this.inferPropertyType(propName);

									properties.push({
										name: propName,
										type: propType,
										required: false, // Will be updated below
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

				// Look for: if (!message) throw new Error(...)
				if (t.isIfStatement(stmt)) {
					const test = stmt.test;

					if (t.isUnaryExpression(test, { operator: "!" }) && t.isIdentifier(test.argument)) {
						const fieldName = test.argument.name;

						// Check if the consequent throws an error or sends error response
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

		// Mark required fields
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

	private extractQueryParams(
		_handler: t.ArrowFunctionExpression | t.FunctionExpression,
		_frameworkType = "express",
	): Array<ParameterInfo> {
		// Simplified: Query params are harder to detect automatically
		// Could be enhanced to walk the AST and find req.query.paramName usage
		return [];
	}

	private extractPathParams(
		routePath: string,
		_handler: t.ArrowFunctionExpression | t.FunctionExpression,
	): Array<ParameterInfo> {
		const params: Array<ParameterInfo> = [];

		// Extract from route path: /pets/:petId -> petId
		const paramMatches = routePath.matchAll(/:([a-zA-Z0-9_]+)/g);
		for (const match of paramMatches) {
			const paramName = match[1];
			params.push({
				name: paramName,
				type: "string", // Path params are typically strings
				required: true, // Path params are always required
			});
		}

		return params;
	}

	private extractResponses(
		handler: t.ArrowFunctionExpression | t.FunctionExpression,
		frameworkType = "express",
	): Array<ResponseInfo> {
		const responses: Array<ResponseInfo> = [];

		if (!t.isBlockStatement(handler.body)) {
			return responses;
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal requires deep nesting to handle all response patterns
		const walkStatements = (statements: Array<t.Statement>) => {
			for (const stmt of statements) {
				// Look for: res.json({ ... }) or res.status(...).json(...) (Express)
				// Look for: reply.send({ ... }) or reply.code(200).send(...) (Fastify)
				// Look for: ctx.body = { ... } (Koa)
				// Look for: return c.json({ ... }) or return c.json({ ... }, 200) (Hono)
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

				// Koa: ctx.status = 201
				if (
					frameworkType === "koa" &&
					t.isExpressionStatement(stmt) &&
					t.isAssignmentExpression(stmt.expression) &&
					t.isMemberExpression(stmt.expression.left) &&
					t.isIdentifier(stmt.expression.left.object, { name: "ctx" }) &&
					t.isIdentifier(stmt.expression.left.property, { name: "status" }) &&
					t.isNumericLiteral(stmt.expression.right)
				) {
					// Store status code for next body assignment
					// This is a simplified version - more complex logic needed for full support
				}

				// Hono: return c.json({ ... }) or return c.json({ ... }, 200)
				if (
					(frameworkType === "hono" || frameworkType === "express") && // Also check express for compatibility
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
		// Simple heuristics for type inference
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
		// Check if node contains throw statement or error response
		if (t.isThrowStatement(node)) {
			return true;
		}

		if (t.isBlockStatement(node)) {
			return node.body.some((stmt: t.Statement) => {
				/* v8 ignore next 3 -- throw as direct block statement is rare; usually inside if-blocks which are caught earlier */
				if (t.isThrowStatement(stmt)) {
					return true;
				}
				if (t.isReturnStatement(stmt)) {
					return true;
				}
				/* v8 ignore next */
				return false;
			});
		}

		/* v8 ignore next */
		return false;
	}

	private extractSchema(node: t.Node): Record<string, unknown> {
		if (t.isObjectExpression(node)) {
			const schema: Record<string, unknown> = { type: "object", properties: {} };
			const properties: Record<string, unknown> = {};

			for (const prop of node.properties) {
				if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
					const key = prop.key.name;
					properties[key] = { type: "string" }; // Simplified
				}
			}

			schema.properties = properties;
			return schema;
		}

		return { type: "object" };
	}

	private getStatusDescription(statusCode: number): string {
		const descriptions: { [key: number]: string } = {
			200: "Successful response",
			201: "Resource created",
			400: "Bad request",
			401: "Unauthorized",
			403: "Forbidden",
			404: "Not found",
			500: "Internal server error",
		};

		return descriptions[statusCode] || `HTTP ${statusCode}`;
	}

	private evaluateTemplateLiteral(node: t.TemplateLiteral): string | null {
		// Simple template literal evaluation
		// For now, just return null for complex templates
		if (node.expressions.length === 0 && node.quasis.length === 1) {
			return node.quasis[0].value.raw;
		}
		return null;
	}

	private inferProjectName(repoPath: string): string {
		// Normalize path separators to handle both Unix and Windows paths
		const normalizedPath = repoPath.replace(/\\/g, "/");
		return path.basename(normalizedPath);
	}

	private analyzeNestJsController(path: NodePath<t.ClassDeclaration>, filePath: string): void {
		const node = path.node;

		// Check if this class has a @Controller decorator
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
				// Extract the controller path from @Controller('path')
				if (decorator.expression.arguments.length > 0 && t.isStringLiteral(decorator.expression.arguments[0])) {
					controllerPath = decorator.expression.arguments[0].value;
					// Ensure it starts with /
					if (!controllerPath.startsWith("/")) {
						controllerPath = `/${controllerPath}`;
					}
				}
				break;
			}
		}

		// Analyze each method in the class
		if (node.body && t.isClassBody(node.body)) {
			for (const member of node.body.body) {
				if (t.isClassMethod(member) && member.decorators) {
					this.analyzeNestJsMethod(member, controllerPath, filePath);
				}
			}
		}
	}

	private analyzeNestJsMethod(method: t.ClassMethod, controllerPath: string, filePath: string): void {
		/* v8 ignore next 3 */
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

			// Extract the route path from @Get('path') or @Post('path')
			let methodPath = "";
			if (decorator.expression.arguments.length > 0 && t.isStringLiteral(decorator.expression.arguments[0])) {
				methodPath = decorator.expression.arguments[0].value;
			}

			// Combine controller path and method path
			let fullPath = controllerPath;
			if (methodPath) {
				// Ensure methodPath starts with /
				if (!methodPath.startsWith("/")) {
					methodPath = `/${methodPath}`;
				}
				fullPath = `${controllerPath}${methodPath}`;
			}

			// Convert NestJS path params :id to Express-style :id (they're the same)
			// NestJS uses :id, Express uses :id, so no conversion needed

			// Create route info
			const routeInfo: RouteInfo = {
				method: httpMethod,
				path: fullPath || controllerPath,
				filePath,
				handler: {},
			};

			// Extract path parameters from the full path
			const pathParams = this.extractPathParamsFromPath(fullPath);
			if (pathParams.length > 0) {
				routeInfo.handler.pathParams = pathParams;
			}

			// Try to extract request body from method parameters with @Body() decorator
			const requestBody = this.extractNestJsRequestBody(method);
			if (requestBody) {
				routeInfo.handler.requestBody = requestBody;
			}

			// Extract responses (simplified for NestJS)
			const responses = this.extractNestJsResponses(method);
			if (responses.length > 0) {
				routeInfo.handler.responses = responses;
			}

			this.routes.push(routeInfo);
			this.emit("routeFound", routeInfo);
		}
	}

	private extractPathParamsFromPath(routePath: string): Array<ParameterInfo> {
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

	private extractNestJsRequestBody(method: t.ClassMethod): RequestBodyInfo | null {
		const properties: Array<PropertyInfo> = [];

		// Look for parameters with @Body() decorator
		for (const param of method.params) {
			if (t.isIdentifier(param) && param.decorators) {
				for (const decorator of param.decorators) {
					if (
						t.isDecorator(decorator) &&
						t.isCallExpression(decorator.expression) &&
						t.isIdentifier(decorator.expression.callee, { name: "Body" })
					) {
						// Found a @Body() parameter
						// For now, we'll infer properties from the parameter name
						// In a real implementation, we'd analyze the DTO class
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

		// Default successful response
		responses.push({
			statusCode: 200,
			description: "Successful response",
		});

		// Look for @HttpCode() decorator
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
