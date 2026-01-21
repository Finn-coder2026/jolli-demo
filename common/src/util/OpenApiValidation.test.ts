import {
	extractApiInfo,
	formatValidationErrors,
	isOpenApiContent,
	type OpenApiParsedSpec,
	type OpenApiValidationError,
	validateOpenApiSpec,
} from "./OpenApiValidation";
import { describe, expect, it } from "vitest";

describe("OpenApiValidation", () => {
	describe("validateOpenApiSpec", () => {
		describe("JSON parsing", () => {
			it("should return parse error for invalid JSON", () => {
				const result = validateOpenApiSpec("{ invalid json }", "application/json");

				expect(result.isValid).toBe(false);
				expect(result.isOpenApiSpec).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				expect(result.errors[0].message).toContain("JSON parse error");
				expect(result.errors[0].severity).toBe("error");
			});

			it("should return error for non-object JSON", () => {
				const result = validateOpenApiSpec('["array"]', "application/json");

				expect(result.isValid).toBe(false);
				expect(result.isOpenApiSpec).toBe(false);
				expect(result.errors[0].message).toContain("must be a JSON/YAML object");
			});

			it("should return error for primitive JSON", () => {
				const result = validateOpenApiSpec('"string"', "application/json");

				expect(result.isValid).toBe(false);
				expect(result.isOpenApiSpec).toBe(false);
			});
		});

		describe("YAML parsing", () => {
			it("should return parse error for invalid YAML", () => {
				const result = validateOpenApiSpec("key: [invalid", "application/yaml");

				expect(result.isValid).toBe(false);
				expect(result.isOpenApiSpec).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				expect(result.errors[0].message).toContain("YAML parse error");
			});

			it("should parse valid YAML OpenAPI spec", () => {
				const yaml = `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`;
				const result = validateOpenApiSpec(yaml, "application/yaml");

				expect(result.isValid).toBe(true);
				expect(result.isOpenApiSpec).toBe(true);
				expect(result.version).toBe("3.0.0");
				expect(result.title).toBe("Test API");
			});
		});

		describe("OpenAPI detection", () => {
			it("should detect OpenAPI 3.x spec", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test", version: "1.0" },
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isOpenApiSpec).toBe(true);
				expect(result.version).toBe("3.0.0");
			});

			it("should detect Swagger 2.0 spec", () => {
				const spec = JSON.stringify({
					swagger: "2.0",
					info: { title: "Test", version: "1.0" },
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isOpenApiSpec).toBe(true);
				expect(result.version).toBe("2.0");
			});

			it("should return false for non-OpenAPI JSON", () => {
				const spec = JSON.stringify({
					name: "some-package",
					version: "1.0.0",
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isOpenApiSpec).toBe(false);
				expect(result.errors[0].message).toContain("JSON/YAML articles must be valid OpenAPI specifications");
			});
		});

		describe("structure validation", () => {
			it("should validate missing info object", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(false);
				expect(result.errors.some(e => e.path === "info" && e.severity === "error")).toBe(true);
			});

			it("should validate missing info.title", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { version: "1.0" },
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(false);
				expect(result.errors.some(e => e.path === "info.title")).toBe(true);
			});

			it("should validate missing info.version", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test" },
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(false);
				expect(result.errors.some(e => e.path === "info.version")).toBe(true);
			});

			it("should validate invalid OpenAPI version format", () => {
				const spec = JSON.stringify({
					openapi: "3.0",
					info: { title: "Test", version: "1.0" },
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(false);
				expect(result.errors.some(e => e.message.includes("Invalid OpenAPI version format"))).toBe(true);
			});

			it("should validate invalid Swagger version", () => {
				const spec = JSON.stringify({
					swagger: "3.0",
					info: { title: "Test", version: "1.0" },
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(false);
				expect(result.errors.some(e => e.message.includes("Invalid Swagger version"))).toBe(true);
			});

			it("should warn about missing paths for OpenAPI 3.x", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test", version: "1.0" },
				});

				const result = validateOpenApiSpec(spec, "application/json");

				// Should be valid (warning, not error)
				expect(result.isValid).toBe(true);
				expect(result.errors.some(e => e.path === "paths" && e.severity === "warning")).toBe(true);
			});

			it("should validate path format", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test", version: "1.0" },
					paths: {
						"invalid-path": {},
						"/valid-path": {},
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.errors.some(e => e.message.includes("paths must start with '/'"))).toBe(true);
			});

			it("should warn about missing responses in operations", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test", version: "1.0" },
					paths: {
						"/users": {
							get: {
								summary: "Get users",
							},
						},
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.errors.some(e => e.path?.includes("responses") && e.severity === "warning")).toBe(true);
			});
		});

		describe("valid specs", () => {
			it("should validate minimal OpenAPI 3.0 spec", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: {
						title: "Test API",
						version: "1.0.0",
					},
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(true);
				expect(result.isOpenApiSpec).toBe(true);
				expect(result.title).toBe("Test API");
				expect(result.apiVersion).toBe("1.0.0");
				expect(result.parsedSpec).toBeDefined();
			});

			it("should validate OpenAPI 3.1 spec", () => {
				const spec = JSON.stringify({
					openapi: "3.1.0",
					info: {
						title: "Test API",
						version: "2.0.0",
						description: "A test API",
					},
					paths: {
						"/users": {
							get: {
								summary: "List users",
								responses: {
									"200": { description: "Success" },
								},
							},
						},
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(true);
				expect(result.version).toBe("3.1.0");
				expect(result.description).toBe("A test API");
			});

			it("should validate Swagger 2.0 spec", () => {
				const spec = JSON.stringify({
					swagger: "2.0",
					info: {
						title: "Legacy API",
						version: "1.0.0",
					},
					paths: {
						"/items": {
							post: {
								summary: "Create item",
								responses: {
									"201": { description: "Created" },
								},
							},
						},
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(true);
				expect(result.version).toBe("2.0");
			});

			it("should validate Swagger 2.0 spec without paths (paths optional in Swagger 2.0)", () => {
				const spec = JSON.stringify({
					swagger: "2.0",
					info: {
						title: "Legacy API",
						version: "1.0.0",
					},
					// No paths field - valid for Swagger 2.0
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(true);
				expect(result.isOpenApiSpec).toBe(true);
				expect(result.version).toBe("2.0");
				// Should have no errors about missing paths
				expect(result.errors.some(e => e.path === "paths")).toBe(false);
			});
		});

		describe("edge cases", () => {
			it("should handle empty content", () => {
				const result = validateOpenApiSpec("", "application/json");

				expect(result.isValid).toBe(false);
			});

			it("should handle null-ish values in spec", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: {
						title: "Test",
						version: "1.0",
						description: null,
					},
					paths: {},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.isValid).toBe(true);
			});

			it("should warn about unknown methods/properties in paths", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test", version: "1.0" },
					paths: {
						"/users": {
							get: {
								summary: "Get users",
								responses: { "200": { description: "OK" } },
							},
							unknownMethod: {
								summary: "Unknown",
							},
						},
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				expect(result.errors.some(e => e.message.includes("Unknown HTTP method"))).toBe(true);
				expect(result.errors.some(e => e.path?.includes("unknownMethod"))).toBe(true);
			});

			it("should handle path value that is not an object", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test", version: "1.0" },
					paths: {
						"/users": null,
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				// Should not throw, just not validate the null path value
				expect(result.isValid).toBe(true);
			});

			it("should handle operation that is not an object", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test", version: "1.0" },
					paths: {
						"/users": {
							get: "not an object",
						},
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				// Should not throw
				expect(result.isValid).toBe(true);
			});

			it("should accept known path-level properties", () => {
				const spec = JSON.stringify({
					openapi: "3.0.0",
					info: { title: "Test", version: "1.0" },
					paths: {
						"/users": {
							summary: "User operations",
							description: "Operations for users",
							parameters: [],
							servers: [],
							get: {
								responses: { "200": { description: "OK" } },
							},
						},
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				// Should not warn about known properties
				expect(result.errors.filter(e => e.message.includes("Unknown HTTP method"))).toHaveLength(0);
			});

			it("should not require responses for Swagger 2.0 operations", () => {
				const spec = JSON.stringify({
					swagger: "2.0",
					info: { title: "Test", version: "1.0" },
					paths: {
						"/users": {
							get: {
								summary: "Get users",
								// No responses - should not warn for swagger
							},
						},
					},
				});

				const result = validateOpenApiSpec(spec, "application/json");

				// Should not warn about missing responses for swagger
				expect(result.errors.filter(e => e.path?.includes("responses"))).toHaveLength(0);
			});

			it("should handle JSON parse error with position info", () => {
				// JSON with a syntax error that will have position info
				const result = validateOpenApiSpec('{"key": value}', "application/json");

				expect(result.isValid).toBe(false);
				expect(result.errors[0].message).toContain("JSON parse error");
			});
		});
	});

	describe("isOpenApiContent", () => {
		it("should return true for OpenAPI JSON", () => {
			const content = JSON.stringify({ openapi: "3.0.0", info: {}, paths: {} });
			expect(isOpenApiContent(content, "application/json")).toBe(true);
		});

		it("should return true for Swagger JSON", () => {
			const content = JSON.stringify({ swagger: "2.0", info: {}, paths: {} });
			expect(isOpenApiContent(content, "application/json")).toBe(true);
		});

		it("should return true for OpenAPI YAML", () => {
			const content = "openapi: '3.0.0'\ninfo: {}\npaths: {}";
			expect(isOpenApiContent(content, "application/yaml")).toBe(true);
		});

		it("should return false for non-OpenAPI content", () => {
			const content = JSON.stringify({ name: "package", version: "1.0" });
			expect(isOpenApiContent(content, "application/json")).toBe(false);
		});

		it("should return false for invalid JSON", () => {
			expect(isOpenApiContent("{ invalid }", "application/json")).toBe(false);
		});

		it("should return false for invalid YAML", () => {
			expect(isOpenApiContent("key: [invalid", "application/yaml")).toBe(false);
		});
	});

	describe("formatValidationErrors", () => {
		it("should format errors with all fields", () => {
			const errors: Array<OpenApiValidationError> = [
				{
					message: "Missing title",
					path: "info.title",
					line: 5,
					column: 10,
					severity: "error",
				},
			];

			const formatted = formatValidationErrors(errors);

			expect(formatted).toContain("[Error]");
			expect(formatted).toContain("info.title");
			expect(formatted).toContain("line 5");
			expect(formatted).toContain("column 10");
			expect(formatted).toContain("Missing title");
		});

		it("should format errors with line but no column", () => {
			const errors: Array<OpenApiValidationError> = [
				{
					message: "Some error",
					line: 10,
					severity: "error",
				},
			];

			const formatted = formatValidationErrors(errors);

			expect(formatted).toContain("line 10");
			expect(formatted).not.toContain("column");
		});

		it("should format warnings", () => {
			const errors: Array<OpenApiValidationError> = [
				{
					message: "No paths defined",
					path: "paths",
					severity: "warning",
				},
			];

			const formatted = formatValidationErrors(errors);

			expect(formatted).toContain("[Warning]");
			expect(formatted).toContain("paths");
		});

		it("should format errors without location", () => {
			const errors: Array<OpenApiValidationError> = [
				{
					message: "Parse error",
					severity: "error",
				},
			];

			const formatted = formatValidationErrors(errors);

			expect(formatted).toBe("[Error]: Parse error");
		});

		it("should format multiple errors", () => {
			const errors: Array<OpenApiValidationError> = [
				{ message: "Error 1", severity: "error" },
				{ message: "Error 2", severity: "error" },
			];

			const formatted = formatValidationErrors(errors);
			const lines = formatted.split("\n");

			expect(lines).toHaveLength(2);
		});
	});

	describe("extractApiInfo", () => {
		it("should extract API info with all fields present", () => {
			const spec: OpenApiParsedSpec = {
				openapi: "3.0.0",
				info: {
					title: "My API",
					version: "2.0.0",
					description: "API description",
				},
				paths: {
					"/users": {
						get: { summary: "List users" },
						post: { summary: "Create user" },
					},
				},
			};

			const result = extractApiInfo(spec);

			expect(result.title).toBe("My API");
			expect(result.version).toBe("2.0.0");
			expect(result.description).toBe("API description");
			expect(result.endpoints).toHaveLength(2);
			expect(result.endpoints[0]).toEqual({
				method: "GET",
				path: "/users",
				summary: "List users",
			});
		});

		it("should use default values when info is missing", () => {
			const spec: OpenApiParsedSpec = {
				openapi: "3.0.0",
			};

			const result = extractApiInfo(spec);

			expect(result.title).toBe("API Reference");
			expect(result.version).toBe("1.0.0");
			expect(result.description).toBeUndefined();
			expect(result.endpoints).toHaveLength(0);
		});

		it("should use default values when info fields are missing", () => {
			const spec: OpenApiParsedSpec = {
				openapi: "3.0.0",
				info: {},
			};

			const result = extractApiInfo(spec);

			expect(result.title).toBe("API Reference");
			expect(result.version).toBe("1.0.0");
		});

		it("should handle all HTTP methods", () => {
			const spec: OpenApiParsedSpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/resource": {
						get: { summary: "Get" },
						post: { summary: "Create" },
						put: { summary: "Update" },
						patch: { summary: "Partial update" },
						delete: { summary: "Delete" },
					},
				},
			};

			const result = extractApiInfo(spec);

			expect(result.endpoints).toHaveLength(5);
			expect(result.endpoints.map(e => e.method)).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
		});

		it("should handle endpoints without summary", () => {
			const spec: OpenApiParsedSpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/test": {
						get: { operationId: "getTest" },
					},
				},
			};

			const result = extractApiInfo(spec);

			expect(result.endpoints[0].summary).toBeUndefined();
		});

		it("should handle multiple paths", () => {
			const spec: OpenApiParsedSpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/users": {
						get: { summary: "List users" },
					},
					"/posts": {
						get: { summary: "List posts" },
						post: { summary: "Create post" },
					},
				},
			};

			const result = extractApiInfo(spec);

			expect(result.endpoints).toHaveLength(3);
		});
	});
});
