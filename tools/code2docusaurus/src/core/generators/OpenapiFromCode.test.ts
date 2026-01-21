import type { CodeScanResult, RouteInfo } from "../scanners/CodeScanner";
import { OpenAPIFromCodeGenerator } from "./OpenapiFromCode";
import type { OpenAPIV3 } from "openapi-types";
import { beforeEach, describe, expect, it } from "vitest";

describe("OpenAPIFromCodeGenerator", () => {
	let generator: OpenAPIFromCodeGenerator;

	beforeEach(() => {
		generator = new OpenAPIFromCodeGenerator();
	});

	describe("generate", () => {
		it("should generate basic OpenAPI spec", () => {
			const scanResult: CodeScanResult = {
				routes: [],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);

			expect(spec.openapi).toBe("3.0.0");
			expect(spec.info.title).toBe("Test API");
			expect(spec.info.version).toBe("1.0.0");
			expect(spec.paths).toEqual({});
		});

		it("should include servers when baseUrl is provided", () => {
			const scanResult: CodeScanResult = {
				routes: [],
				title: "Test API",
				version: "1.0.0",
				baseUrl: "https://api.example.com",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);

			expect(spec.servers).toBeDefined();
			expect(spec.servers?.[0].url).toBe("https://api.example.com");
			expect(spec.servers?.[0].description).toBe("API Server");
		});

		it("should use default values when title/version missing", () => {
			const scanResult: CodeScanResult = {
				routes: [],
				title: "",
				version: "",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);

			expect(spec.info.title).toBe("API Documentation");
			expect(spec.info.version).toBe("1.0.0");
		});

		it("should generate paths from routes", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);

			expect(spec.paths["/api/users"]).toBeDefined();
			expect(spec.paths["/api/users"].get).toBeDefined();
		});

		it("should group multiple methods for same path", () => {
			const routes: Array<RouteInfo> = [
				{
					method: "GET",
					path: "/api/users",
					filePath: "/repo/routes/users.ts",
					handler: {},
				},
				{
					method: "POST",
					path: "/api/users",
					filePath: "/repo/routes/users.ts",
					handler: {},
				},
			];

			const scanResult: CodeScanResult = {
				routes,
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);

			expect(spec.paths["/api/users"].get).toBeDefined();
			expect(spec.paths["/api/users"].post).toBeDefined();
		});
	});

	describe("path item generation", () => {
		it("should include summary and description", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users"].get;

			expect(pathItem.summary).toBe("Get users");
			expect(pathItem.description).toBe("Extracted from routes/users.ts");
		});

		it("should include tags", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users"].get;

			expect(pathItem.tags).toContain("Users");
		});

		it("should include query parameters", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {
					queryParams: [
						{
							name: "limit",
							type: "number",
							required: false,
							description: "Maximum results",
						},
						{
							name: "offset",
							type: "number",
							required: false,
						},
					],
				},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users"].get;

			expect(pathItem.parameters).toHaveLength(2);
			const param0 = pathItem.parameters?.[0] as OpenAPIV3.ParameterObject;
			expect(param0.name).toBe("limit");
			expect(param0.in).toBe("query");
			expect(param0.required).toBe(false);
			expect(param0.description).toBe("Maximum results");
		});

		it("should include path parameters", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/api/users/:id",
				filePath: "/repo/routes/users.ts",
				handler: {
					pathParams: [
						{
							name: "id",
							type: "string",
							required: true,
							description: "User ID",
						},
					],
				},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users/:id"].get;

			expect(pathItem.parameters).toHaveLength(1);
			const param0 = pathItem.parameters?.[0] as OpenAPIV3.ParameterObject;
			expect(param0.name).toBe("id");
			expect(param0.in).toBe("path");
			expect(param0.required).toBe(true);
		});

		it("should include request body with properties", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {
					requestBody: {
						contentType: "application/json",
						properties: [
							{
								name: "name",
								type: "string",
								required: true,
								description: "User name",
							},
							{
								name: "email",
								type: "string",
								required: true,
							},
							{
								name: "age",
								type: "number",
								required: false,
							},
						],
					},
				},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users"].post;

			expect(pathItem.requestBody).toBeDefined();
			const requestBody = pathItem.requestBody as OpenAPIV3.RequestBodyObject;
			expect(requestBody.required).toBe(true);
			const schema = requestBody.content["application/json"].schema as OpenAPIV3.SchemaObject;
			expect(schema.type).toBe("object");
			const nameProperty = schema.properties?.name as OpenAPIV3.SchemaObject;
			expect(nameProperty.type).toBe("string");
			expect(nameProperty.description).toBe("User name");
			expect(schema.required).toEqual(["name", "email"]);
		});

		it("should include array properties with descriptions in request body", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {
					requestBody: {
						contentType: "application/json",
						properties: [
							{
								name: "tags",
								type: "array",
								required: true,
								description: "User tags for categorization",
							},
							{
								name: "roles",
								type: "array",
								required: false,
								description: "User roles and permissions",
							},
						],
					},
				},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users"].post;

			expect(pathItem.requestBody).toBeDefined();
			const requestBody = pathItem.requestBody as OpenAPIV3.RequestBodyObject;
			const schema = requestBody.content["application/json"].schema as OpenAPIV3.SchemaObject;

			const tagsProperty = schema.properties?.tags as OpenAPIV3.ArraySchemaObject;
			expect(tagsProperty.type).toBe("array");
			expect(tagsProperty.description).toBe("User tags for categorization");
			expect(tagsProperty.items).toEqual({});

			const rolesProperty = schema.properties?.roles as OpenAPIV3.ArraySchemaObject;
			expect(rolesProperty.type).toBe("array");
			expect(rolesProperty.description).toBe("User roles and permissions");
			expect(rolesProperty.items).toEqual({});

			expect(schema.required).toEqual(["tags"]);
		});

		it("should mark requestBody as optional when all properties optional", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {
					requestBody: {
						contentType: "application/json",
						properties: [
							{
								name: "name",
								type: "string",
								required: false,
							},
						],
					},
				},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users"].post;

			const requestBody = pathItem.requestBody as OpenAPIV3.RequestBodyObject;
			expect(requestBody.required).toBe(false);
		});

		it("should include responses", () => {
			const route: RouteInfo = {
				method: "POST",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {
					responses: [
						{
							statusCode: 201,
							description: "User created",
							schema: {
								type: "object",
								properties: {
									id: { type: "number" },
									name: { type: "string" },
								},
							},
						},
						{
							statusCode: 400,
							description: "Bad request",
						},
					],
				},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users"].post;

			expect(pathItem.responses["201"]).toBeDefined();
			const response201 = pathItem.responses["201"] as OpenAPIV3.ResponseObject;
			expect(response201.description).toBe("User created");
			expect(response201.content?.["application/json"].schema).toBeDefined();
			expect(pathItem.responses["400"]).toBeDefined();
			const response400 = pathItem.responses["400"] as OpenAPIV3.ResponseObject;
			expect(response400.description).toBe("Bad request");
		});

		it("should include default 200 response when no responses detected", () => {
			const route: RouteInfo = {
				method: "GET",
				path: "/api/users",
				filePath: "/repo/routes/users.ts",
				handler: {},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users"].get;

			expect(pathItem.responses["200"]).toBeDefined();
			const response200 = pathItem.responses["200"] as OpenAPIV3.ResponseObject;
			expect(response200.description).toBe("Successful response");
		});
	});

	describe("summary generation", () => {
		it("should generate GET summary", () => {
			const generateSummary = (
				generator as unknown as { generateSummary: (route: RouteInfo) => string }
			).generateSummary.bind(generator);

			const route: RouteInfo = {
				method: "GET",
				path: "/api/users",
				filePath: "",
				handler: {},
			};

			expect(generateSummary(route)).toBe("Get users");
		});

		it("should generate POST summary", () => {
			const generateSummary = (
				generator as unknown as { generateSummary: (route: RouteInfo) => string }
			).generateSummary.bind(generator);

			const route: RouteInfo = {
				method: "POST",
				path: "/api/users",
				filePath: "",
				handler: {},
			};

			expect(generateSummary(route)).toBe("Create users");
		});

		it("should generate PUT summary", () => {
			const generateSummary = (
				generator as unknown as { generateSummary: (route: RouteInfo) => string }
			).generateSummary.bind(generator);

			const route: RouteInfo = {
				method: "PUT",
				path: "/api/users/:id",
				filePath: "",
				handler: {},
			};

			expect(generateSummary(route)).toBe("Update users");
		});

		it("should generate DELETE summary", () => {
			const generateSummary = (
				generator as unknown as { generateSummary: (route: RouteInfo) => string }
			).generateSummary.bind(generator);

			const route: RouteInfo = {
				method: "DELETE",
				path: "/api/users/:id",
				filePath: "",
				handler: {},
			};

			expect(generateSummary(route)).toBe("Delete users");
		});

		it("should handle single-segment paths", () => {
			const generateSummary = (
				generator as unknown as { generateSummary: (route: RouteInfo) => string }
			).generateSummary.bind(generator);

			const route: RouteInfo = {
				method: "GET",
				path: "/status",
				filePath: "",
				handler: {},
			};

			expect(generateSummary(route)).toBe("Get status");
		});
	});

	describe("tag extraction", () => {
		it("should extract tag from path", () => {
			const extractTag = (generator as unknown as { extractTag: (path: string) => string }).extractTag.bind(
				generator,
			);

			expect(extractTag("/api/users")).toBe("Users");
			expect(extractTag("/api/posts/:id")).toBe("Posts");
			expect(extractTag("/api/chat/messages")).toBe("Chat");
		});

		it("should capitalize tag", () => {
			const extractTag = (generator as unknown as { extractTag: (path: string) => string }).extractTag.bind(
				generator,
			);

			expect(extractTag("/api/products")).toBe("Products");
		});

		it("should return default tag for root paths", () => {
			const extractTag = (generator as unknown as { extractTag: (path: string) => string }).extractTag.bind(
				generator,
			);

			expect(extractTag("/")).toBe("API");
			expect(extractTag("/status")).toBe("API");
		});
	});

	describe("complex scenarios", () => {
		it("should handle route with all features", () => {
			const route: RouteInfo = {
				method: "PUT",
				path: "/api/users/:id",
				filePath: "/repo/routes/users.ts",
				handler: {
					pathParams: [
						{
							name: "id",
							type: "string",
							required: true,
						},
					],
					queryParams: [
						{
							name: "notify",
							type: "boolean",
							required: false,
						},
					],
					requestBody: {
						contentType: "application/json",
						properties: [
							{
								name: "name",
								type: "string",
								required: true,
							},
						],
					},
					responses: [
						{
							statusCode: 200,
							description: "User updated",
						},
						{
							statusCode: 404,
							description: "User not found",
						},
					],
				},
			};

			const scanResult: CodeScanResult = {
				routes: [route],
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);
			const pathItem = spec.paths["/api/users/:id"].put;

			expect(pathItem.parameters).toHaveLength(2);
			expect(pathItem.requestBody).toBeDefined();
			expect(pathItem.responses["200"]).toBeDefined();
			expect(pathItem.responses["404"]).toBeDefined();
		});

		it("should handle multiple routes with different paths", () => {
			const routes: Array<RouteInfo> = [
				{
					method: "GET",
					path: "/api/users",
					filePath: "/repo/routes/users.ts",
					handler: {},
				},
				{
					method: "GET",
					path: "/api/posts",
					filePath: "/repo/routes/posts.ts",
					handler: {},
				},
				{
					method: "POST",
					path: "/api/comments",
					filePath: "/repo/routes/comments.ts",
					handler: {},
				},
			];

			const scanResult: CodeScanResult = {
				routes,
				title: "Test API",
				version: "1.0.0",
				repoPath: "/repo",
			};

			const spec = generator.generate(scanResult);

			expect(Object.keys(spec.paths)).toHaveLength(3);
			expect(spec.paths["/api/users"].get).toBeDefined();
			expect(spec.paths["/api/posts"].get).toBeDefined();
			expect(spec.paths["/api/comments"].post).toBeDefined();
		});
	});
});
