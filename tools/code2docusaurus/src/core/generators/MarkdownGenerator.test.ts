import type { EndpointInfo, OpenAPISpec, ScanResult } from "../../types/Openapi";
import * as AiEnhancer from "./AiEnhancer";
import { MarkdownGenerator } from "./MarkdownGenerator";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("MarkdownGenerator", () => {
	let generator: MarkdownGenerator;

	beforeEach(() => {
		generator = new MarkdownGenerator(false);
	});

	describe("generateIntro", () => {
		it("should generate intro page with API list", async () => {
			const specs: Array<ScanResult> = [
				{
					fileName: "api-v1.yaml",
					filePath: "/path/to/api-v1.yaml",
					version: "3.0.0",
					title: "User API",
					description: "User management API",
					endpointCount: 5,
					valid: true,
					spec: {
						openapi: "3.0.0",
						info: { title: "User API", version: "1.0.0" },
						paths: {},
					},
				},
			];

			const markdown = await generator.generateIntro(specs);

			expect(markdown).toContain("# Welcome to the API Documentation");
			expect(markdown).toContain("User API");
			expect(markdown).toContain("**Version:** 3.0.0"); // Uses spec.version (OpenAPI version)
			expect(markdown).toContain("**Endpoints:** 5");
		});

		it("should handle multiple APIs", async () => {
			const specs: Array<ScanResult> = [
				{
					fileName: "api-v1.yaml",
					filePath: "/path/to/api-v1.yaml",
					version: "3.0.0",
					title: "User API",
					description: "User management",
					endpointCount: 5,
					valid: true,
					spec: { openapi: "3.0.0", info: { title: "User API", version: "1.0.0" }, paths: {} },
				},
				{
					fileName: "api-v2.yaml",
					filePath: "/path/to/api-v2.yaml",
					version: "3.0.0",
					title: "Product API",
					description: "Product catalog",
					endpointCount: 10,
					valid: true,
					spec: { openapi: "3.0.0", info: { title: "Product API", version: "2.0.0" }, paths: {} },
				},
			];

			const markdown = await generator.generateIntro(specs);

			expect(markdown).toContain("User API");
			expect(markdown).toContain("Product API");
			expect(markdown).toContain("**Endpoints:** 5");
			expect(markdown).toContain("**Endpoints:** 10");
		});
	});

	describe("generateAPIOverview", () => {
		it("should generate API overview with basic info", async () => {
			const spec: ScanResult = {
				fileName: "api.yaml",
				filePath: "/path/to/api.yaml",
				version: "3.0.0",
				title: "Test API",
				description: "Test API description",
				endpointCount: 3,
				valid: true,
				spec: {
					openapi: "3.0.0",
					info: {
						title: "Test API",
						version: "1.0.0",
						description: "A test API",
					},
					servers: [{ url: "https://api.example.com" }],
					paths: {},
				},
			};

			const markdown = await generator.generateAPIOverview(spec);

			expect(markdown).toContain("# Test API");
			expect(markdown).toContain("**Version:** 1.0.0");
			expect(markdown).toContain("**Base URL:** https://api.example.com");
			expect(markdown).toContain("**Total Endpoints:** 3");
		});

		it("should handle missing server info", async () => {
			const spec: ScanResult = {
				fileName: "api.yaml",
				filePath: "/path/to/api.yaml",
				version: "3.0.0",
				title: "Test API",
				description: "Test",
				endpointCount: 1,
				valid: true,
				spec: {
					openapi: "3.0.0",
					info: { title: "Test API", version: "1.0.0" },
					paths: {},
				},
			};

			const markdown = await generator.generateAPIOverview(spec);

			expect(markdown).toContain("**Base URL:** Not specified");
		});
	});

	describe("generateEndpoint", () => {
		const mockSpec: OpenAPISpec = {
			openapi: "3.0.0",
			info: { title: "Test API", version: "1.0.0" },
			paths: {},
		};

		it("should generate endpoint documentation with all sections", async () => {
			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
				summary: "Get all users",
				description: "Retrieve a list of all users",
				parameters: [
					{
						name: "limit",
						in: "query",
						required: false,
						schema: { type: "number" },
						description: "Maximum number of results",
					},
				],
				responses: {
					"200": {
						description: "Successful response",
					},
				},
			};

			const markdown = await generator.generateEndpoint(endpoint, mockSpec);

			expect(markdown).toContain("# Get all users");
			expect(markdown).toContain("GET /api/users");
			expect(markdown).toContain("Retrieve a list of all users");
			expect(markdown).toContain("## Parameters");
			expect(markdown).toContain("## Responses");
			expect(markdown).toContain("## Code Examples");
		});

		it("should handle endpoints without parameters", async () => {
			const endpoint: EndpointInfo = {
				path: "/api/status",
				method: "get",
				summary: "Get API status",
			};

			const markdown = await generator.generateEndpoint(endpoint, mockSpec);

			expect(markdown).toContain("No parameters required");
		});

		it("should generate code examples in multiple languages", async () => {
			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "post",
				summary: "Create user",
			};

			const markdown = await generator.generateEndpoint(endpoint, mockSpec);

			expect(markdown).toContain("### JavaScript");
			expect(markdown).toContain("### Python");
			expect(markdown).toContain("### cURL");
			expect(markdown).toContain("fetch('/api/users'");
			expect(markdown).toContain("requests.post");
			expect(markdown).toContain("curl -X POST");
		});

		it("should handle complex parameters", async () => {
			const endpoint: EndpointInfo = {
				path: "/api/users/:id",
				method: "put",
				summary: "Update user",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string" },
						description: "User ID",
					},
					{
						name: "Authorization",
						in: "header",
						required: true,
						schema: { type: "string" },
						description: "Bearer token",
					},
				],
			};

			const markdown = await generator.generateEndpoint(endpoint, mockSpec);

			expect(markdown).toContain("### Path Parameters");
			expect(markdown).toContain("### Header Parameters");
			expect(markdown).toContain("| id |");
			expect(markdown).toContain("| Authorization |");
		});

		it("should handle response examples", async () => {
			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
				summary: "Get users",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									example: { users: [{ id: 1, name: "John" }] },
								},
							},
						},
					},
				},
			};

			const markdown = await generator.generateEndpoint(endpoint, mockSpec);

			expect(markdown).toContain("### 200 OK");
			expect(markdown).toContain("**Example Response:**");
			expect(markdown).toContain("```json");
			expect(markdown).toContain('"id": 1');
		});
	});

	describe("slugify", () => {
		it("should convert text to URL-safe slug", () => {
			// Access private method via type assertion
			const slugify = (generator as unknown as { slugify: (text: string) => string }).slugify.bind(generator);

			expect(slugify("GET /api/users")).toBe("get-api-users");
			expect(slugify("POST /api/users/:id")).toBe("post-api-users-id");
			expect(slugify("Hello World!!!")).toBe("hello-world");
		});

		it("should handle special characters", () => {
			const slugify = (generator as unknown as { slugify: (text: string) => string }).slugify.bind(generator);

			expect(slugify("Test@123#456")).toBe("test-123-456");
			expect(slugify("---multiple---dashes---")).toBe("multiple-dashes");
		});
	});

	describe("capitalize", () => {
		it("should capitalize first letter", () => {
			const capitalize = (generator as unknown as { capitalize: (text: string) => string }).capitalize.bind(
				generator,
			);

			expect(capitalize("hello")).toBe("Hello");
			expect(capitalize("WORLD")).toBe("WORLD");
			expect(capitalize("a")).toBe("A");
		});
	});

	describe("getStatusText", () => {
		it("should return correct status text for common codes", () => {
			const getStatusText = (
				generator as unknown as { getStatusText: (code: string) => string }
			).getStatusText.bind(generator);

			expect(getStatusText("200")).toBe("OK");
			expect(getStatusText("201")).toBe("Created");
			expect(getStatusText("400")).toBe("Bad Request");
			expect(getStatusText("404")).toBe("Not Found");
			expect(getStatusText("500")).toBe("Internal Server Error");
		});

		it("should return empty string for unknown codes", () => {
			const getStatusText = (
				generator as unknown as { getStatusText: (code: string) => string }
			).getStatusText.bind(generator);

			expect(getStatusText("999")).toBe("");
		});

		it("should handle all defined status codes", () => {
			const getStatusText = (
				generator as unknown as { getStatusText: (code: string) => string }
			).getStatusText.bind(generator);

			expect(getStatusText("204")).toBe("No Content");
			expect(getStatusText("401")).toBe("Unauthorized");
			expect(getStatusText("403")).toBe("Forbidden");
		});
	});

	describe("extractTags", () => {
		it("should extract tags from spec.tags array", () => {
			const extractTags = (
				generator as unknown as { extractTags: (spec: OpenAPISpec) => Array<string> }
			).extractTags.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				tags: [
					{ name: "users", description: "User operations" },
					{ name: "products", description: "Product operations" },
				],
			};

			const tags = extractTags(spec);

			expect(tags).toContain("users");
			expect(tags).toContain("products");
			expect(tags.length).toBe(2);
		});

		it("should extract tags from operation definitions", () => {
			const extractTags = (
				generator as unknown as { extractTags: (spec: OpenAPISpec) => Array<string> }
			).extractTags.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/users": {
						get: {
							tags: ["users", "admin"],
							summary: "Get users",
							responses: {},
						},
						post: {
							tags: ["users"],
							summary: "Create user",
							responses: {},
						},
					},
					"/products": {
						get: {
							tags: ["products"],
							summary: "Get products",
							responses: {},
						},
					},
				},
			};

			const tags = extractTags(spec);

			expect(tags).toContain("users");
			expect(tags).toContain("admin");
			expect(tags).toContain("products");
			expect(tags.length).toBe(3);
		});

		it("should handle all HTTP methods", () => {
			const extractTags = (
				generator as unknown as { extractTags: (spec: OpenAPISpec) => Array<string> }
			).extractTags.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/api": {
						get: { tags: ["get-tag"], responses: {} },
						post: { tags: ["post-tag"], responses: {} },
						put: { tags: ["put-tag"], responses: {} },
						delete: { tags: ["delete-tag"], responses: {} },
						patch: { tags: ["patch-tag"], responses: {} },
						options: { tags: ["options-tag"], responses: {} },
						head: { tags: ["head-tag"], responses: {} },
					},
				},
			};

			const tags = extractTags(spec);

			expect(tags).toContain("get-tag");
			expect(tags).toContain("post-tag");
			expect(tags).toContain("put-tag");
			expect(tags).toContain("delete-tag");
			expect(tags).toContain("patch-tag");
			expect(tags).toContain("options-tag");
			expect(tags).toContain("head-tag");
		});

		it("should handle spec without tags", () => {
			const extractTags = (
				generator as unknown as { extractTags: (spec: OpenAPISpec) => Array<string> }
			).extractTags.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};

			const tags = extractTags(spec);

			expect(tags).toEqual([]);
		});

		it("should deduplicate tags", () => {
			const extractTags = (
				generator as unknown as { extractTags: (spec: OpenAPISpec) => Array<string> }
			).extractTags.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				tags: [{ name: "users" }],
			};
			(spec.paths as unknown) = {
				"/users": {
					get: { tags: ["users"], responses: {} },
					post: { tags: ["users"], responses: {} },
				},
			};

			const tags = extractTags(spec);

			expect(tags.filter((t: string) => t === "users").length).toBe(1);
		});
	});

	describe("getTagDescription", () => {
		it("should return description for known tag", () => {
			const getTagDescription = (
				generator as unknown as { getTagDescription: (spec: OpenAPISpec, tag: string) => string }
			).getTagDescription.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				tags: [
					{ name: "users", description: "User management endpoints" },
					{ name: "products", description: "Product catalog endpoints" },
				],
			};

			expect(getTagDescription(spec, "users")).toBe("User management endpoints");
			expect(getTagDescription(spec, "products")).toBe("Product catalog endpoints");
		});

		it("should return 'No description' for unknown tag", () => {
			const getTagDescription = (
				generator as unknown as { getTagDescription: (spec: OpenAPISpec, tag: string) => string }
			).getTagDescription.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				tags: [{ name: "users", description: "User operations" }],
			};

			expect(getTagDescription(spec, "nonexistent")).toBe("No description");
		});

		it("should handle tag without description", () => {
			const getTagDescription = (
				generator as unknown as { getTagDescription: (spec: OpenAPISpec, tag: string) => string }
			).getTagDescription.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				tags: [{ name: "users" }],
			};

			expect(getTagDescription(spec, "users")).toBe("No description");
		});

		it("should handle spec without tags array", () => {
			const getTagDescription = (
				generator as unknown as { getTagDescription: (spec: OpenAPISpec, tag: string) => string }
			).getTagDescription.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};

			expect(getTagDescription(spec, "users")).toBe("No description");
		});
	});

	describe("generateAuthenticationSection", () => {
		it("should generate authentication section with security schemes", () => {
			const generateAuthenticationSection = (
				generator as unknown as { generateAuthenticationSection: (spec: OpenAPISpec) => string }
			).generateAuthenticationSection.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
							bearerFormat: "JWT",
						},
						apiKey: {
							type: "apiKey",
							in: "header",
							name: "X-API-Key",
						},
					},
				},
			};

			const section = generateAuthenticationSection(spec);

			expect(section).toContain("This API uses the following authentication methods:");
			expect(section).toContain("**bearerAuth**: http");
			expect(section).toContain("**apiKey**: apiKey");
		});

		it("should handle spec without security schemes", () => {
			const generateAuthenticationSection = (
				generator as unknown as { generateAuthenticationSection: (spec: OpenAPISpec) => string }
			).generateAuthenticationSection.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};

			const section = generateAuthenticationSection(spec);

			expect(section).toBe("Authentication requirements not specified.");
		});

		it("should handle spec with empty components", () => {
			const generateAuthenticationSection = (
				generator as unknown as { generateAuthenticationSection: (spec: OpenAPISpec) => string }
			).generateAuthenticationSection.bind(generator);
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				components: {},
			};

			const section = generateAuthenticationSection(spec);

			expect(section).toBe("Authentication requirements not specified.");
		});
	});

	describe("groupParametersByLocation", () => {
		it("should group parameters by location", () => {
			type ParamType = { name: string; in?: string; required: boolean };
			const groupParametersByLocation = (
				generator as unknown as {
					groupParametersByLocation: (params: Array<ParamType>) => Record<string, Array<ParamType>>;
				}
			).groupParametersByLocation.bind(generator);
			const parameters = [
				{ name: "id", in: "path", required: true },
				{ name: "limit", in: "query", required: false },
				{ name: "offset", in: "query", required: false },
				{ name: "Authorization", in: "header", required: true },
			];

			const grouped = groupParametersByLocation(parameters);

			expect(grouped.path).toHaveLength(1);
			expect(grouped.query).toHaveLength(2);
			expect(grouped.header).toHaveLength(1);
		});

		it("should default to query for parameters without 'in' property", () => {
			type ParamType = { name: string; in?: string; required: boolean };
			const groupParametersByLocation = (
				generator as unknown as {
					groupParametersByLocation: (params: Array<ParamType>) => Record<string, Array<ParamType>>;
				}
			).groupParametersByLocation.bind(generator);
			const parameters = [
				{ name: "param1", required: false },
				{ name: "param2", required: false },
			];

			const grouped = groupParametersByLocation(parameters);

			expect(grouped.query).toHaveLength(2);
		});

		it("should handle empty parameter array", () => {
			type ParamType = { name: string; in?: string; required: boolean };
			const groupParametersByLocation = (
				generator as unknown as {
					groupParametersByLocation: (params: Array<ParamType>) => Record<string, Array<ParamType>>;
				}
			).groupParametersByLocation.bind(generator);

			const grouped = groupParametersByLocation([]);

			expect(Object.keys(grouped)).toHaveLength(0);
		});
	});

	describe("generateParametersSection", () => {
		it("should generate parameters table with all details", () => {
			type ParamType = {
				name?: string;
				in?: string;
				required?: boolean;
				schema?: { type?: string };
				type?: string;
				description?: string;
			};
			const generateParametersSection = (
				generator as unknown as { generateParametersSection: (params?: Array<ParamType>) => string }
			).generateParametersSection.bind(generator);
			const parameters = [
				{
					name: "userId",
					in: "path",
					required: true,
					schema: { type: "string" },
					description: "The user ID",
				},
				{
					name: "limit",
					in: "query",
					required: false,
					schema: { type: "number" },
					description: "Max results",
				},
			];

			const section = generateParametersSection(parameters);

			expect(section).toContain("## Parameters");
			expect(section).toContain("### Path Parameters");
			expect(section).toContain("### Query Parameters");
			expect(section).toContain("| userId | string | Yes | The user ID |");
			expect(section).toContain("| limit | number | No | Max results |");
		});

		it("should handle parameters without schema", () => {
			type ParamType = {
				name?: string;
				in?: string;
				required?: boolean;
				schema?: { type?: string };
				type?: string;
				description?: string;
			};
			const generateParametersSection = (
				generator as unknown as { generateParametersSection: (params?: Array<ParamType>) => string }
			).generateParametersSection.bind(generator);
			const parameters = [
				{
					name: "id",
					in: "path",
					required: true,
					type: "string",
					description: "ID parameter",
				},
			];

			const section = generateParametersSection(parameters);

			expect(section).toContain("| id | string | Yes | ID parameter |");
		});

		it("should handle parameters with missing properties", () => {
			type ParamType = {
				name?: string;
				in?: string;
				required?: boolean;
				schema?: { type?: string };
				type?: string;
				description?: string;
			};
			const generateParametersSection = (
				generator as unknown as { generateParametersSection: (params?: Array<ParamType>) => string }
			).generateParametersSection.bind(generator);
			const parameters = [{ in: "query" }];

			const section = generateParametersSection(parameters);

			expect(section).toContain("| unknown | string | No | No description |");
		});

		it("should return no parameters message when empty", () => {
			type ParamType = {
				name?: string;
				in?: string;
				required?: boolean;
				schema?: { type?: string };
				type?: string;
				description?: string;
			};
			const generateParametersSection = (
				generator as unknown as { generateParametersSection: (params?: Array<ParamType>) => string }
			).generateParametersSection.bind(generator);

			const section = generateParametersSection(undefined);

			expect(section).toBe("## Parameters\n\nNo parameters required.");
		});

		it("should return no parameters message when array is empty", () => {
			type ParamType = {
				name?: string;
				in?: string;
				required?: boolean;
				schema?: { type?: string };
				type?: string;
				description?: string;
			};
			const generateParametersSection = (
				generator as unknown as { generateParametersSection: (params?: Array<ParamType>) => string }
			).generateParametersSection.bind(generator);

			const section = generateParametersSection([]);

			expect(section).toBe("## Parameters\n\nNo parameters required.");
		});
	});

	describe("generateResponsesSection", () => {
		it("should generate responses section with examples", () => {
			type ResponseType = { description?: string; content?: Record<string, { schema?: { example?: unknown } }> };
			const generateResponsesSection = (
				generator as unknown as {
					generateResponsesSection: (responses?: Record<string, ResponseType>) => string;
				}
			).generateResponsesSection.bind(generator);
			const responses = {
				"200": {
					description: "Successful response",
					content: {
						"application/json": {
							schema: {
								example: { id: 1, name: "Test" },
							},
						},
					},
				},
				"404": {
					description: "Not found",
				},
			};

			const section = generateResponsesSection(responses);

			expect(section).toContain("## Responses");
			expect(section).toContain("### 200 OK");
			expect(section).toContain("Successful response");
			expect(section).toContain("**Example Response:**");
			expect(section).toContain("```json");
			expect(section).toContain('"id": 1');
			expect(section).toContain("### 404 Not Found");
		});

		it("should handle responses without content", () => {
			type ResponseType = { description?: string; content?: Record<string, { schema?: { example?: unknown } }> };
			const generateResponsesSection = (
				generator as unknown as {
					generateResponsesSection: (responses?: Record<string, ResponseType>) => string;
				}
			).generateResponsesSection.bind(generator);
			const responses = {
				"204": {
					description: "No content",
				},
			};

			const section = generateResponsesSection(responses);

			expect(section).toContain("### 204 No Content");
			expect(section).toContain("No content");
			expect(section).not.toContain("**Example Response:**");
		});

		it("should handle responses without description", () => {
			type ResponseType = { description?: string; content?: Record<string, { schema?: { example?: unknown } }> };
			const generateResponsesSection = (
				generator as unknown as {
					generateResponsesSection: (responses?: Record<string, ResponseType>) => string;
				}
			).generateResponsesSection.bind(generator);
			const responses = {
				"200": {},
			};

			const section = generateResponsesSection(responses);

			expect(section).toContain("No description");
		});

		it("should return no responses message when undefined", () => {
			type ResponseType = { description?: string; content?: Record<string, { schema?: { example?: unknown } }> };
			const generateResponsesSection = (
				generator as unknown as {
					generateResponsesSection: (responses?: Record<string, ResponseType>) => string;
				}
			).generateResponsesSection.bind(generator);

			const section = generateResponsesSection(undefined);

			expect(section).toBe("## Responses\n\nNo response documentation available.");
		});
	});

	describe("API overview with tags and authentication", () => {
		it("should generate overview with tags and authentication", async () => {
			const spec: ScanResult = {
				fileName: "api.yaml",
				filePath: "/path/to/api.yaml",
				version: "3.0.0",
				title: "Test API",
				description: "Test API description",
				endpointCount: 3,
				valid: true,
				spec: {
					openapi: "3.0.0",
					info: {
						title: "Test API",
						version: "1.0.0",
					},
					servers: [{ url: "https://api.example.com" }],
					paths: {
						"/users": {
							get: {
								tags: ["users"],
								summary: "Get users",
								responses: {},
							},
						},
					},
					tags: [{ name: "users", description: "User management" }],
					components: {
						securitySchemes: {
							bearerAuth: {
								type: "http",
								scheme: "bearer",
							},
						},
					},
				},
			};

			const markdown = await generator.generateAPIOverview(spec);

			expect(markdown).toContain("**users**: User management");
			expect(markdown).toContain("This API uses the following authentication methods:");
			expect(markdown).toContain("**bearerAuth**: http");
		});
	});

	describe("AI enhancement", () => {
		it("should use AI enhancement when enabled", async () => {
			const aiGenerator = new MarkdownGenerator(true);
			const mockSpec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
			};

			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
				summary: "Get users",
			};

			// The AI enhancer is mocked in the module, so we just verify it can be called
			const markdown = await aiGenerator.generateEndpoint(endpoint, mockSpec);

			expect(markdown).toBeDefined();
			expect(typeof markdown).toBe("string");
		});
	});

	describe("reference object handling", () => {
		it("should skip reference objects in parameters", async () => {
			const mockSpec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {},
			};

			const endpoint: EndpointInfo = {
				path: "/api/users",
				method: "get",
				summary: "Get users",
				parameters: [
					{
						$ref: "#/components/parameters/UserIdParam",
					},
					{
						name: "limit",
						in: "query",
						required: false,
						schema: { type: "number" },
						description: "Limit results",
					},
				],
			};

			const markdown = await generator.generateEndpoint(endpoint, mockSpec);

			// Should contain the regular parameter but skip the reference
			expect(markdown).toContain("limit");
			expect(markdown).toContain("## Parameters");
			// Should not try to render the $ref parameter
			expect(markdown).not.toContain("$ref");
			expect(markdown).not.toContain("#/components/parameters");
		});
	});

	describe("AI enhancement mode", () => {
		let aiGenerator: MarkdownGenerator;

		beforeEach(() => {
			aiGenerator = new MarkdownGenerator(true);
		});

		it("should use AI enhancement for generateIntro when aiEnabled is true", async () => {
			const enhancedContent = "# AI Enhanced Welcome\n\nThis is AI-enhanced content.";
			vi.spyOn(AiEnhancer, "enhanceDocumentation").mockReturnValue({
				enhanced: true,
				originalContent: "",
				enhancedContent,
				improvements: [],
			});

			const specs: Array<ScanResult> = [
				{
					fileName: "api.yaml",
					filePath: "/path/to/api.yaml",
					version: "3.0.0",
					title: "Test API",
					description: "Test description",
					endpointCount: 3,
					valid: true,
					spec: {
						openapi: "3.0.0",
						info: { title: "Test API", version: "1.0.0" },
						paths: {},
					},
				},
			];

			const result = await aiGenerator.generateIntro(specs);

			expect(AiEnhancer.enhanceDocumentation).toHaveBeenCalledWith(
				expect.stringContaining("# Welcome to the API Documentation"),
				{ spec: specs[0].spec },
			);
			expect(result).toBe(enhancedContent);
		});

		it("should use AI enhancement for generateAPIOverview when aiEnabled is true", async () => {
			const enhancedContent = "# AI Enhanced Overview\n\nThis is AI-enhanced API overview.";
			vi.spyOn(AiEnhancer, "enhanceDocumentation").mockReturnValue({
				enhanced: true,
				originalContent: "",
				enhancedContent,
				improvements: [],
			});

			const spec: ScanResult = {
				fileName: "api.yaml",
				filePath: "/path/to/api.yaml",
				version: "3.0.0",
				title: "Test API",
				description: "Test API description",
				endpointCount: 5,
				valid: true,
				spec: {
					openapi: "3.0.0",
					info: { title: "Test API", version: "1.0.0" },
					paths: {},
				},
			};

			const result = await aiGenerator.generateAPIOverview(spec);

			expect(AiEnhancer.enhanceDocumentation).toHaveBeenCalledWith(expect.stringContaining("# Test API"), {
				spec: spec.spec,
			});
			expect(result).toBe(enhancedContent);
		});
	});
});
