import { describe, expect, it } from "vitest";
import type { CodeScanResult, RouteInfo } from "shared-pipeline-utils/code-scanner";
import {
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

describe("OpenApiBuilder", () => {
	describe("normalizePathForOpenApi", () => {
		it("converts Express :param to OpenAPI {param}", () => {
			expect(normalizePathForOpenApi("/users/:id")).toBe("/users/{id}");
		});

		it("handles multiple params", () => {
			expect(normalizePathForOpenApi("/users/:userId/posts/:postId")).toBe(
				"/users/{userId}/posts/{postId}",
			);
		});

		it("handles paths without params", () => {
			expect(normalizePathForOpenApi("/users")).toBe("/users");
		});

		it("handles params with underscores", () => {
			expect(normalizePathForOpenApi("/users/:user_id")).toBe("/users/{user_id}");
		});

		it("handles params at the end", () => {
			expect(normalizePathForOpenApi("/api/items/:itemId")).toBe("/api/items/{itemId}");
		});
	});

	describe("extractTag", () => {
		it("extracts first meaningful segment as tag", () => {
			expect(extractTag("/users")).toBe("Users");
		});

		it("skips api prefix", () => {
			expect(extractTag("/api/users")).toBe("Users");
		});

		it("skips version prefix", () => {
			expect(extractTag("/api/v1/users")).toBe("Users");
			expect(extractTag("/api/v2/users")).toBe("Users");
		});

		it("returns undefined for empty path", () => {
			expect(extractTag("/")).toBeUndefined();
		});

		it("returns undefined if only params", () => {
			expect(extractTag("/api/{id}")).toBeUndefined();
		});

		it("handles paths with just api prefix", () => {
			expect(extractTag("/api")).toBeUndefined();
		});
	});

	describe("generateOperationId", () => {
		it("generates operationId from path and method", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(generateOperationId(route)).toBe("getUsers");
		});

		it("handles path params", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users/:id",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(generateOperationId(route)).toBe("getUsersByid");
		});

		it("handles nested paths", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/api/users/profile",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(generateOperationId(route)).toBe("postApiUsersProfile");
		});

		it("uses custom mapping when provided", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			const mapping = { "/users:get": "listUsers" };
			expect(generateOperationId(route, mapping)).toBe("listUsers");
		});

		it("falls back to generated id when mapping not found", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			const mapping = { "/posts:get": "listPosts" };
			expect(generateOperationId(route, mapping)).toBe("getUsers");
		});
	});

	describe("generateSummary", () => {
		it("generates summary with action and resource", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(generateSummary(route)).toBe("Get users");
		});

		it("uses Create for POST", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(generateSummary(route)).toBe("Create users");
		});

		it("uses Update for PUT", () => {
			const route: RouteInfo = {
				method: "PUT",
				path: "/users/:id",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(generateSummary(route)).toBe("Update users");
		});

		it("uses Delete for DELETE", () => {
			const route: RouteInfo = {
				method: "DELETE",
				path: "/users/:id",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(generateSummary(route)).toBe("Delete users");
		});

		it("handles paths without resource", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/api",
				filePath: "/src/routes/api.ts",
				handler: {},
			};
			expect(generateSummary(route)).toBe("GET /api");
		});

		it("falls back to method for unknown methods", () => {
			const route: RouteInfo = {
				method: "TRACE",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(generateSummary(route)).toBe("TRACE users");
		});
	});

	describe("buildParameters", () => {
		it("builds path parameters", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users/:id",
				filePath: "/src/routes/users.ts",
				handler: {
					pathParams: [{ name: "id", type: "string", required: true }],
				},
			};
			const params = buildParameters(route);
			expect(params).toHaveLength(1);
			expect(params[0]).toEqual({
				name: "id",
				in: "path",
				required: true,
				schema: { type: "string" },
			});
		});

		it("builds query parameters", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					queryParams: [
						{ name: "page", type: "number", required: false },
						{ name: "limit", type: "number", required: false },
					],
				},
			};
			const params = buildParameters(route);
			expect(params).toHaveLength(2);
			expect(params[0]).toEqual({
				name: "page",
				in: "query",
				required: false,
				schema: { type: "number" },
			});
		});

		it("includes description when provided", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users/:id",
				filePath: "/src/routes/users.ts",
				handler: {
					pathParams: [
						{ name: "id", type: "string", required: true, description: "User ID" },
					],
				},
			};
			const params = buildParameters(route);
			expect(params[0].description).toBe("User ID");
		});

		it("returns empty array when no params", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			expect(buildParameters(route)).toEqual([]);
		});

		it("includes description on query params when provided", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					queryParams: [
						{ name: "page", type: "number", required: false, description: "Page number" },
					],
				},
			};
			const params = buildParameters(route);
			expect(params[0].description).toBe("Page number");
		});
	});

	describe("buildRequestBody", () => {
		it("builds request body from route", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					requestBody: {
						properties: [
							{ name: "name", type: "string", required: true },
							{ name: "email", type: "string", required: true },
						],
						contentType: "application/json",
					},
				},
			};
			const body = buildRequestBody(route);
			expect(body.required).toBe(true);
			expect(body.content["application/json"]).toBeDefined();
			expect(body.content["application/json"].schema.properties).toHaveProperty("name");
			expect(body.content["application/json"].schema.properties).toHaveProperty("email");
		});

		it("handles optional properties", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					requestBody: {
						properties: [
							{ name: "name", type: "string", required: false },
							{ name: "bio", type: "string", required: false },
						],
						contentType: "application/json",
					},
				},
			};
			const body = buildRequestBody(route);
			expect(body.required).toBe(false);
			expect(body.content["application/json"].schema.required).toBeUndefined();
		});

		it("returns default body when no request body", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			const body = buildRequestBody(route);
			expect(body.content["application/json"]).toBeDefined();
		});

		it("includes property description when provided", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					requestBody: {
						properties: [
							{ name: "name", type: "string", required: true, description: "User's full name" },
						],
						contentType: "application/json",
					},
				},
			};
			const body = buildRequestBody(route);
			expect(body.content["application/json"].schema.properties!["name"].description).toBe(
				"User's full name",
			);
		});

		it("uses default content type when not specified", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					requestBody: {
						properties: [{ name: "name", type: "string", required: true }],
						contentType: "",
					},
				},
			};
			const body = buildRequestBody(route);
			expect(body.content["application/json"]).toBeDefined();
		});
	});

	describe("buildResponses", () => {
		it("builds responses from route", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					responses: [
						{ statusCode: 200, description: "Success" },
						{ statusCode: 404, description: "Not found" },
					],
				},
			};
			const responses = buildResponses(route);
			expect(responses["200"]).toEqual({ description: "Success" });
			expect(responses["404"]).toEqual({ description: "Not found" });
		});

		it("includes schema when provided", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					responses: [
						{
							statusCode: 200,
							description: "Success",
							schema: { type: "object", properties: { id: { type: "string" } } },
						},
					],
				},
			};
			const responses = buildResponses(route);
			expect(responses["200"].content).toBeDefined();
			expect(responses["200"].content!["application/json"]).toBeDefined();
		});

		it("returns default 200 response when no responses", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {},
			};
			const responses = buildResponses(route);
			expect(responses["200"]).toEqual({ description: "Successful response" });
		});
	});

	describe("buildOperation", () => {
		it("builds complete operation", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/users/:id",
				filePath: "/src/routes/users.ts",
				handler: {
					pathParams: [{ name: "id", type: "string", required: true }],
					responses: [{ statusCode: 200, description: "Success" }],
				},
			};
			const op = buildOperation(route);
			expect(op.operationId).toBe("getUsersByid");
			expect(op.summary).toBe("Get users");
			expect(op.parameters).toHaveLength(1);
			expect(op.responses["200"]).toBeDefined();
		});

		it("includes request body for POST", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/users",
				filePath: "/src/routes/users.ts",
				handler: {
					requestBody: {
						properties: [{ name: "name", type: "string", required: true }],
						contentType: "application/json",
					},
				},
			};
			const op = buildOperation(route);
			expect(op.requestBody).toBeDefined();
		});
	});

	describe("buildOpenApiSpec", () => {
		it("builds complete OpenAPI spec", () => {
			const scanResult: CodeScanResult = {
				routes: [
					{
						method: "GET",
						path: "/users",
						filePath: "/src/routes/users.ts",
						framework: "express",
						handler: {},
					},
					{
						method: "POST",
						path: "/users",
						filePath: "/src/routes/users.ts",
						framework: "express",
						handler: {
							requestBody: {
								properties: [{ name: "name", type: "string", required: true }],
								contentType: "application/json",
							},
						},
					},
				],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/test",
			};

			const { spec, summary } = buildOpenApiSpec(scanResult, {
				title: "Test API",
				version: "1.0.0",
			});

			expect(spec.openapi).toBe("3.0.3");
			expect(spec.info.title).toBe("Test API");
			expect(spec.info.version).toBe("1.0.0");
			expect(spec.paths["/users"]).toBeDefined();
			expect(spec.paths["/users"].get).toBeDefined();
			expect(spec.paths["/users"].post).toBeDefined();
			expect(summary.totalRoutes).toBe(2);
			expect(summary.frameworksDetected).toContain("express");
		});

		it("includes server when provided", () => {
			const scanResult: CodeScanResult = {
				routes: [],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/test",
			};

			const { spec } = buildOpenApiSpec(scanResult, {
				title: "Test API",
				version: "1.0.0",
				serverUrl: "https://api.example.com",
			});

			expect(spec.servers).toHaveLength(1);
			expect(spec.servers![0].url).toBe("https://api.example.com");
		});

		it("includes description when provided", () => {
			const scanResult: CodeScanResult = {
				routes: [],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/test",
			};

			const { spec } = buildOpenApiSpec(scanResult, {
				title: "Test API",
				version: "1.0.0",
				description: "A test API",
			});

			expect(spec.info.description).toBe("A test API");
		});

		it("generates tags from paths", () => {
			const scanResult: CodeScanResult = {
				routes: [
					{
						method: "GET",
						path: "/users",
						filePath: "/src/routes/users.ts",
						handler: {},
					},
					{
						method: "GET",
						path: "/posts",
						filePath: "/src/routes/posts.ts",
						handler: {},
					},
				],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/test",
			};

			const { spec } = buildOpenApiSpec(scanResult, {
				title: "Test API",
				version: "1.0.0",
			});

			expect(spec.tags).toHaveLength(2);
			expect(spec.tags!.find((t) => t.name === "Users")).toBeDefined();
			expect(spec.tags!.find((t) => t.name === "Posts")).toBeDefined();
		});

		it("tracks statistics correctly", () => {
			const scanResult: CodeScanResult = {
				routes: [
					{
						method: "GET",
						path: "/users",
						filePath: "/src/routes/users.ts",
						framework: "express",
						handler: {
							responses: [{ statusCode: 200, description: "Success" }],
						},
					},
					{
						method: "POST",
						path: "/users",
						filePath: "/src/routes/users.ts",
						framework: "express",
						handler: {
							requestBody: {
								properties: [{ name: "name", type: "string", required: true }],
								contentType: "application/json",
							},
						},
					},
					{
						method: "GET",
						path: "/posts",
						filePath: "/src/routes/posts.ts",
						framework: "fastify",
						handler: {},
					},
				],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/test",
			};

			const { summary } = buildOpenApiSpec(scanResult, {
				title: "Test API",
				version: "1.0.0",
			});

			expect(summary.totalRoutes).toBe(3);
			expect(summary.routesWithRequestBody).toBe(1);
			expect(summary.routesWithResponses).toBe(1);
			expect(summary.frameworksDetected).toContain("express");
			expect(summary.frameworksDetected).toContain("fastify");
			expect(summary.routesByMethod["GET"]).toBe(2);
			expect(summary.routesByMethod["POST"]).toBe(1);
		});
	});
});
