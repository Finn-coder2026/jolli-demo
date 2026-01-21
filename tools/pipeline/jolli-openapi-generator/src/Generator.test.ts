import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenApiSpec } from "./types.js";

// Mock node:fs/promises before imports
const mockAccess = vi.fn();
const mockReadFile = vi.fn();
const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("node:fs/promises", () => ({
	access: (...args: unknown[]) => mockAccess(...args),
	readFile: (...args: unknown[]) => mockReadFile(...args),
	mkdir: (...args: unknown[]) => mockMkdir(...args),
	writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// Mock shared-pipeline-utils
vi.mock("shared-pipeline-utils/code-scanner", () => ({
	CodeScanner: vi.fn().mockImplementation(() => ({
		scan: vi.fn().mockResolvedValue({
			routes: [
				{
					method: "GET",
					path: "/users",
					filePath: "/test/src/routes/users.ts",
					framework: "express",
					handler: {},
				},
				{
					method: "POST",
					path: "/users",
					filePath: "/test/src/routes/users.ts",
					framework: "express",
					handler: {
						requestBody: {
							properties: [{ name: "name", type: "string", required: true }],
							contentType: "application/json",
						},
					},
				},
			],
			title: "test-repo",
			version: "1.0.0",
			repoPath: "/test",
		}),
	})),
}));

// Import after mocks are set up
import { generateOpenApiSpec, specToJson, specToYaml, writeSpec } from "./Generator.js";

describe("Generator", () => {
	describe("specToJson", () => {
		it("converts spec to JSON string", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};
			const json = specToJson(spec);
			expect(json).toContain('"openapi": "3.0.3"');
			expect(json).toContain('"title": "Test"');
		});

		it("formats JSON with indentation", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};
			const json = specToJson(spec);
			expect(json.split("\n").length).toBeGreaterThan(1);
		});
	});

	describe("specToYaml", () => {
		it("converts spec to YAML string", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			// Version-like strings are quoted to prevent YAML parsers treating them as numbers
			expect(yaml).toContain('openapi: "3.0.3"');
			expect(yaml).toContain("title: Test");
		});

		it("handles nested objects", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/users": {
						get: {
							operationId: "getUsers",
							responses: { "200": { description: "Success" } },
						},
					},
				},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain("/users:");
			expect(yaml).toContain("get:");
			expect(yaml).toContain("operationId: getUsers");
		});

		it("handles arrays", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				tags: [
					{ name: "Users", description: "User operations" },
					{ name: "Posts", description: "Post operations" },
				],
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain("tags:");
			expect(yaml).toContain("- name: Users");
			expect(yaml).toContain("- name: Posts");
		});

		it("quotes strings that need escaping", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test: API", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain('"Test: API"');
		});

		it("handles empty arrays", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
				tags: [],
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain("tags: []");
		});

		it("handles empty objects", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			// Empty objects on their own line followed by {}
			expect(yaml).toMatch(/paths:\n\s*\{\}/);
		});

		it("handles boolean values", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/users": {
						get: {
							operationId: "getUsers",
							deprecated: true,
							responses: { "200": { description: "Success" } },
						},
					},
				},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain("deprecated: true");
		});

		it("handles version-like strings", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			// Version-like strings are quoted to prevent YAML parsers treating them as numbers
			expect(yaml).toContain('version: "1.0.0"');
		});

		it("handles null values", () => {
			const spec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0", description: null },
				paths: {},
			} as unknown as OpenApiSpec;
			const yaml = specToYaml(spec);
			expect(yaml).toContain("description: null");
		});

		it("escapes newlines in strings", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0", description: "Line1\nLine2" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain('"Line1\\nLine2"');
		});

		it("quotes strings starting with numbers", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "123 API", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain('"123 API"');
		});

		it("quotes strings that look like booleans", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "true", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain('"true"');
		});

		it("handles arrays with nested objects", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/users": {
						get: {
							operationId: "getUsers",
							responses: { "200": { description: "Success" } },
							parameters: [
								{
									name: "id",
									in: "path",
									required: true,
									schema: { type: "string" },
								},
							],
						},
					},
				},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain("parameters:");
			expect(yaml).toContain("- name: id");
		});

		it("handles objects with multiline nested values", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/users": {
						get: {
							operationId: "getUsers",
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: { type: "object" },
										},
									},
								},
							},
						},
					},
				},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain("content:");
			expect(yaml).toContain("application/json:");
		});

		it("quotes strings with leading/trailing spaces", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: " Test ", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain('" Test "');
		});

		it("quotes strings with hash symbols", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test # API", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain('"Test # API"');
		});

		it("quotes empty strings", () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "", version: "1.0.0" },
				paths: {},
			};
			const yaml = specToYaml(spec);
			expect(yaml).toContain('title: ""');
		});
	});

	describe("generateOpenApiSpec", () => {
		beforeEach(() => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockReset();
		});

		afterEach(() => {
			vi.clearAllMocks();
		});

		it("generates spec from repository", async () => {
			const result = await generateOpenApiSpec({
				repo: "/test",
				output: "openapi.json",
				format: "json",
			});

			expect(result.spec.openapi).toBe("3.0.3");
			expect(result.spec.info.title).toBe("test-repo");
			expect(result.spec.paths["/users"]).toBeDefined();
			expect(result.summary.totalRoutes).toBe(2);
		});

		it("uses custom title when provided", async () => {
			const result = await generateOpenApiSpec({
				repo: "/test",
				output: "openapi.json",
				format: "json",
				title: "Custom API",
			});

			expect(result.spec.info.title).toBe("Custom API");
		});

		it("uses custom version when provided", async () => {
			const result = await generateOpenApiSpec({
				repo: "/test",
				output: "openapi.json",
				format: "json",
				version: "2.0.0",
			});

			expect(result.spec.info.version).toBe("2.0.0");
		});

		it("includes description when provided", async () => {
			const result = await generateOpenApiSpec({
				repo: "/test",
				output: "openapi.json",
				format: "json",
				description: "My API description",
			});

			expect(result.spec.info.description).toBe("My API description");
		});

		it("includes server URL when provided", async () => {
			const result = await generateOpenApiSpec({
				repo: "/test",
				output: "openapi.json",
				format: "json",
				serverUrl: "https://api.example.com",
			});

			expect(result.spec.servers).toHaveLength(1);
			expect(result.spec.servers![0].url).toBe("https://api.example.com");
		});

		it("throws error when repository does not exist", async () => {
			mockAccess.mockRejectedValue(new Error("ENOENT"));

			await expect(
				generateOpenApiSpec({
					repo: "/nonexistent",
					output: "openapi.json",
					format: "json",
				}),
			).rejects.toThrow("Repository path does not exist");
		});

		it("throws error when operationId mapping file is invalid", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));

			await expect(
				generateOpenApiSpec({
					repo: "/test",
					output: "openapi.json",
					format: "json",
					operationIdMapping: "/nonexistent/mapping.json",
				}),
			).rejects.toThrow("Failed to load operationId mapping");
		});

		it("loads operationId mapping when provided", async () => {
			mockReadFile.mockResolvedValue('{ "/users:get": "listUsers" }');

			const result = await generateOpenApiSpec({
				repo: "/test",
				output: "openapi.json",
				format: "json",
				operationIdMapping: "/test/mapping.json",
			});

			// The mapping is applied during spec generation
			expect(result.spec.paths["/users"].get?.operationId).toBe("listUsers");
		});
	});

	describe("writeSpec", () => {
		beforeEach(() => {
			mockMkdir.mockResolvedValue(undefined);
			mockWriteFile.mockResolvedValue(undefined);
		});

		afterEach(() => {
			vi.clearAllMocks();
		});

		it("writes JSON spec to file", async () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};

			await writeSpec(spec, "/output/openapi.json", "json");

			expect(mockMkdir).toHaveBeenCalledWith(path.dirname("/output/openapi.json"), {
				recursive: true,
			});
			expect(mockWriteFile).toHaveBeenCalledWith(
				"/output/openapi.json",
				expect.stringContaining('"openapi": "3.0.3"'),
				"utf-8",
			);
		});

		it("writes YAML spec to file", async () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};

			await writeSpec(spec, "/output/openapi.yaml", "yaml");

			expect(mockWriteFile).toHaveBeenCalledWith(
				"/output/openapi.yaml",
				expect.stringContaining('openapi: "3.0.3"'),
				"utf-8",
			);
		});

		it("adds trailing newline", async () => {
			const spec: OpenApiSpec = {
				openapi: "3.0.3",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};

			await writeSpec(spec, "/output/openapi.json", "json");

			expect(mockWriteFile).toHaveBeenCalledWith(
				"/output/openapi.json",
				expect.stringMatching(/\n$/),
				"utf-8",
			);
		});
	});
});
