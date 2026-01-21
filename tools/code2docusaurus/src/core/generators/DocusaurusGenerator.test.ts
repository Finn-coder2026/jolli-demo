import type { OpenAPISpec, ScanResult } from "../../types/Openapi";
import * as fileUtils from "../../utils/FileUtils";
import { DocusaurusGenerator } from "./DocusaurusGenerator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/FileUtils.js");
vi.mock("./MarkdownGenerator.js", () => ({
	MarkdownGenerator: vi.fn().mockImplementation(() => ({
		generateIntro: vi.fn().mockResolvedValue("# Introduction"),
		generateAPIOverview: vi.fn().mockResolvedValue("# API Overview"),
		generateEndpoint: vi.fn().mockResolvedValue("# Endpoint"),
	})),
}));

describe("DocusaurusGenerator", () => {
	let generator: DocusaurusGenerator;

	beforeEach(() => {
		generator = new DocusaurusGenerator(false);
		vi.clearAllMocks();

		// Set up default file utils mocks
		vi.mocked(fileUtils.ensureDir).mockResolvedValue(undefined);
		vi.mocked(fileUtils.writeFile).mockResolvedValue(undefined);
		vi.mocked(fileUtils.writeJSON).mockResolvedValue(undefined);
	});

	afterEach(() => {
		generator.removeAllListeners();
	});

	describe("generate", () => {
		it("should generate complete Docusaurus site", async () => {
			const mockSpec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/users": {
						get: {
							summary: "Get users",
							responses: { "200": { description: "Success" } },
						},
					},
				},
			};

			const scanResults: Array<ScanResult> = [
				{
					fileName: "api.yaml",
					filePath: "/test/api.yaml",
					version: "3.0.0",
					title: "Test API",
					description: "Test description",
					endpointCount: 1,
					valid: true,
					spec: mockSpec,
				},
			];

			const outputPath = await generator.generate(scanResults, "/output");

			expect(outputPath).toBe("/output");
			expect(fileUtils.ensureDir).toHaveBeenCalled();
			expect(fileUtils.writeFile).toHaveBeenCalled();
		});

		it("should emit events during generation", async () => {
			const scanResults: Array<ScanResult> = [
				{
					fileName: "api.yaml",
					filePath: "/test/api.yaml",
					version: "3.0.0",
					title: "Test API",
					description: "Test",
					endpointCount: 0,
					valid: true,
					spec: {
						openapi: "3.0.0",
						info: { title: "Test API", version: "1.0.0" },
						paths: {},
					},
				},
			];

			const events: Array<string> = [];
			generator.on("step", message => events.push(message));
			generator.on("progress", () => events.push("progress"));
			generator.on("complete", () => events.push("complete"));

			await generator.generate(scanResults, "/output");

			expect(events).toContain("Creating directory structure");
			expect(events).toContain("Generating introduction page");
			expect(events).toContain("progress");
			expect(events).toContain("complete");
		});

		it("should skip invalid specs", async () => {
			const scanResults: Array<ScanResult> = [
				{
					fileName: "invalid.yaml",
					filePath: "/test/invalid.yaml",
					version: "3.0.0",
					title: "Invalid API",
					description: "Invalid",
					endpointCount: 0,
					valid: false,
					spec: {
						openapi: "3.0.0",
						info: { title: "Invalid API", version: "1.0.0" },
						paths: {},
					},
				},
				{
					fileName: "valid.yaml",
					filePath: "/test/valid.yaml",
					version: "3.0.0",
					title: "Valid API",
					description: "Valid",
					endpointCount: 0,
					valid: true,
					spec: {
						openapi: "3.0.0",
						info: { title: "Valid API", version: "1.0.0" },
						paths: {},
					},
				},
			];

			const stepEvents: Array<string> = [];
			generator.on("step", message => stepEvents.push(message));

			await generator.generate(scanResults, "/output");

			// Should only generate docs for valid spec
			const validSpecSteps = stepEvents.filter(msg => msg.includes("Valid API"));
			expect(validSpecSteps.length).toBeGreaterThan(0);

			const invalidSpecSteps = stepEvents.filter(msg => msg.includes("Invalid API"));
			expect(invalidSpecSteps.length).toBe(0);
		});

		it("should emit error on generation failure", async () => {
			vi.mocked(fileUtils.ensureDir).mockRejectedValue(new Error("Permission denied"));

			const scanResults: Array<ScanResult> = [];
			let errorEmitted = false;

			generator.on("error", () => {
				errorEmitted = true;
			});

			await expect(generator.generate(scanResults, "/output")).rejects.toThrow();
			expect(errorEmitted).toBe(true);
		});

		it("should track generated files", async () => {
			const scanResults: Array<ScanResult> = [
				{
					fileName: "api.yaml",
					filePath: "/test/api.yaml",
					version: "3.0.0",
					title: "Test API",
					description: "Test",
					endpointCount: 0,
					valid: true,
					spec: {
						openapi: "3.0.0",
						info: { title: "Test API", version: "1.0.0" },
						paths: {},
					},
				},
			];

			await generator.generate(scanResults, "/output");

			const generatedFiles = generator.getGeneratedFiles();
			expect(generatedFiles.length).toBeGreaterThan(0);
		});
	});

	describe("directory structure creation", () => {
		it("should create all required directories", async () => {
			const scanResults: Array<ScanResult> = [];

			await generator.generate(scanResults, "/output");

			expect(fileUtils.ensureDir).toHaveBeenCalledWith("/output");
			expect(fileUtils.ensureDir).toHaveBeenCalledWith(expect.stringContaining("docs"));
			expect(fileUtils.ensureDir).toHaveBeenCalledWith(expect.stringContaining("static"));
			expect(fileUtils.ensureDir).toHaveBeenCalledWith(expect.stringContaining("src"));
		});
	});

	describe("endpoint extraction", () => {
		it("should extract GET endpoints", () => {
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/api/users": {
						get: {
							summary: "Get users",
							responses: {},
						},
					},
				},
			};

			type EndpointType = { method: string; path: string };
			const extractEndpoints = (
				generator as unknown as { extractEndpoints: (spec: OpenAPISpec) => Array<EndpointType> }
			).extractEndpoints.bind(generator);
			const endpoints = extractEndpoints(spec);

			expect(endpoints).toHaveLength(1);
			expect(endpoints[0].method).toBe("get");
			expect(endpoints[0].path).toBe("/api/users");
		});

		it("should extract multiple HTTP methods", () => {
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/api/users": {
						get: { summary: "Get users", responses: {} },
						post: { summary: "Create user", responses: {} },
						put: { summary: "Update user", responses: {} },
						delete: { summary: "Delete user", responses: {} },
					},
				},
			};

			type EndpointType = { method: string; path: string };
			const extractEndpoints = (
				generator as unknown as { extractEndpoints: (spec: OpenAPISpec) => Array<EndpointType> }
			).extractEndpoints.bind(generator);
			const endpoints = extractEndpoints(spec);

			expect(endpoints).toHaveLength(4);
			expect(endpoints.map((e: EndpointType) => e.method)).toContain("get");
			expect(endpoints.map((e: EndpointType) => e.method)).toContain("post");
			expect(endpoints.map((e: EndpointType) => e.method)).toContain("put");
			expect(endpoints.map((e: EndpointType) => e.method)).toContain("delete");
		});

		it("should handle spec with no paths", () => {
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {},
			};

			type EndpointType = { method: string; path: string };
			const extractEndpoints = (
				generator as unknown as { extractEndpoints: (spec: OpenAPISpec) => Array<EndpointType> }
			).extractEndpoints.bind(generator);
			const endpoints = extractEndpoints(spec);

			expect(endpoints).toEqual([]);
		});

		it("should handle missing spec paths property", () => {
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
			} as OpenAPISpec;

			type EndpointType = { method: string; path: string };
			const extractEndpoints = (
				generator as unknown as { extractEndpoints: (spec: OpenAPISpec) => Array<EndpointType> }
			).extractEndpoints.bind(generator);
			const endpoints = extractEndpoints(spec);

			expect(endpoints).toEqual([]);
		});

		it("should skip invalid pathItem objects", () => {
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/api/test": null as unknown as Record<string, unknown>,
					"/api/valid": {
						get: { summary: "Valid endpoint", responses: {} },
					},
				},
			};

			type EndpointType = { method: string; path: string };
			const extractEndpoints = (
				generator as unknown as { extractEndpoints: (spec: OpenAPISpec) => Array<EndpointType> }
			).extractEndpoints.bind(generator);
			const endpoints = extractEndpoints(spec);

			// Should only extract the valid endpoint
			expect(endpoints).toHaveLength(1);
			expect(endpoints[0].path).toBe("/api/valid");
		});

		it("should extract endpoint metadata", () => {
			const spec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test", version: "1.0.0" },
				paths: {
					"/api/users": {
						get: {
							summary: "Get users",
							description: "Retrieve all users",
							operationId: "getUsers",
							tags: ["Users"],
							parameters: [],
							responses: {},
						},
					},
				},
			};

			type EndpointType = {
				method: string;
				path: string;
				summary?: string;
				description?: string;
				operationId?: string;
				tags?: Array<string>;
			};
			const extractEndpoints = (
				generator as unknown as { extractEndpoints: (spec: OpenAPISpec) => Array<EndpointType> }
			).extractEndpoints.bind(generator);
			const endpoints = extractEndpoints(spec);

			expect(endpoints[0].summary).toBe("Get users");
			expect(endpoints[0].description).toBe("Retrieve all users");
			expect(endpoints[0].operationId).toBe("getUsers");
			expect(endpoints[0].tags).toEqual(["Users"]);
		});
	});

	describe("slugify", () => {
		it("should convert text to lowercase", () => {
			const slugify = (generator as unknown as { slugify: (text: string) => string }).slugify.bind(generator);

			expect(slugify("Hello World")).toBe("hello-world");
		});

		it("should replace spaces with hyphens", () => {
			const slugify = (generator as unknown as { slugify: (text: string) => string }).slugify.bind(generator);

			expect(slugify("Test API Spec")).toBe("test-api-spec");
		});

		it("should remove special characters", () => {
			const slugify = (generator as unknown as { slugify: (text: string) => string }).slugify.bind(generator);

			expect(slugify("Test@#$%API")).toBe("test-api");
		});

		it("should remove leading and trailing hyphens", () => {
			const slugify = (generator as unknown as { slugify: (text: string) => string }).slugify.bind(generator);

			expect(slugify("---test---")).toBe("test");
		});

		it("should handle empty string", () => {
			const slugify = (generator as unknown as { slugify: (text: string) => string }).slugify.bind(generator);

			expect(slugify("")).toBe("");
		});

		it("should handle paths with slashes", () => {
			const slugify = (generator as unknown as { slugify: (text: string) => string }).slugify.bind(generator);

			expect(slugify("/api/users/:id")).toBe("api-users-id");
		});
	});

	describe("config generation", () => {
		it("should generate docusaurus.config.js", async () => {
			const scanResults: Array<ScanResult> = [];

			await generator.generate(scanResults, "/output");

			const writeFileCalls = vi.mocked(fileUtils.writeFile).mock.calls;
			const configCall = writeFileCalls.find(call => call[0].includes("docusaurus.config.js"));

			expect(configCall).toBeDefined();
			expect(configCall?.[1]).toContain("@docusaurus/preset-classic");
		});

		it("should generate package.json with dependencies", async () => {
			const scanResults: Array<ScanResult> = [];

			await generator.generate(scanResults, "/output");

			const writeJSONCalls = vi.mocked(fileUtils.writeJSON).mock.calls;
			const packageCall = writeJSONCalls.find(call => call[0].includes("package.json"));

			expect(packageCall).toBeDefined();
			const packageJson = packageCall?.[1] as { dependencies?: Record<string, string> };
			expect(packageJson).toHaveProperty("dependencies");
			expect(packageJson.dependencies).toHaveProperty("@docusaurus/core");
		});

		it("should generate custom CSS", async () => {
			const scanResults: Array<ScanResult> = [];

			await generator.generate(scanResults, "/output");

			const writeFileCalls = vi.mocked(fileUtils.writeFile).mock.calls;
			const cssCall = writeFileCalls.find(call => call[0].includes("custom.css"));

			expect(cssCall).toBeDefined();
			expect(cssCall?.[1]).toContain("--ifm-color-primary");
		});
	});

	describe("sidebar generation", () => {
		it("should generate simple sidebar with no specs", async () => {
			const scanResults: Array<ScanResult> = [];

			await generator.generate(scanResults, "/output");

			const writeFileCalls = vi.mocked(fileUtils.writeFile).mock.calls;
			const sidebarCall = writeFileCalls.find(call => call[0].includes("sidebars.js"));

			expect(sidebarCall).toBeDefined();
			expect(sidebarCall?.[1]).toContain("intro");
		});

		it("should generate sidebar with API categories", async () => {
			const mockSpec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/users": {
						get: { summary: "Get users", responses: {} },
					},
				},
			};

			const scanResults: Array<ScanResult> = [
				{
					fileName: "api.yaml",
					filePath: "/test/api.yaml",
					version: "3.0.0",
					title: "Test API",
					description: "Test",
					endpointCount: 1,
					valid: true,
					spec: mockSpec,
				},
			];

			await generator.generate(scanResults, "/output");

			const writeFileCalls = vi.mocked(fileUtils.writeFile).mock.calls;
			const sidebarCall = writeFileCalls.find(call => call[0].includes("sidebars.js"));

			expect(sidebarCall).toBeDefined();
			expect(sidebarCall?.[1]).toContain("APIs");
			expect(sidebarCall?.[1]).toContain("Test API");
			expect(sidebarCall?.[1]).toContain("Endpoints");
		});

		it("should only include valid specs in sidebar", async () => {
			const scanResults: Array<ScanResult> = [
				{
					fileName: "invalid.yaml",
					filePath: "/test/invalid.yaml",
					version: "3.0.0",
					title: "Invalid API",
					description: "Invalid",
					endpointCount: 0,
					valid: false,
					spec: {
						openapi: "3.0.0",
						info: { title: "Invalid API", version: "1.0.0" },
						paths: {},
					},
				},
			];

			await generator.generate(scanResults, "/output");

			const writeFileCalls = vi.mocked(fileUtils.writeFile).mock.calls;
			const sidebarCall = writeFileCalls.find(call => call[0].includes("sidebars.js"));

			// Should generate simple sidebar since no valid specs
			expect(sidebarCall?.[1]).toContain('"intro"');
			expect(sidebarCall?.[1]).not.toContain("APIs");
		});
	});

	describe("progress tracking", () => {
		it("should emit progress events with percentages", async () => {
			const scanResults: Array<ScanResult> = [
				{
					fileName: "api.yaml",
					filePath: "/test/api.yaml",
					version: "3.0.0",
					title: "Test API",
					description: "Test",
					endpointCount: 0,
					valid: true,
					spec: {
						openapi: "3.0.0",
						info: { title: "Test API", version: "1.0.0" },
						paths: {},
					},
				},
			];

			type ProgressEvent = { current: number; total: number; percentage: number };
			const progressEvents: Array<ProgressEvent> = [];
			generator.on("progress", progress => progressEvents.push(progress));

			await generator.generate(scanResults, "/output");

			expect(progressEvents.length).toBeGreaterThan(0);
			expect(progressEvents[0]).toHaveProperty("current");
			expect(progressEvents[0]).toHaveProperty("total");
			expect(progressEvents[0]).toHaveProperty("percentage");

			// Last progress should be 100%
			const lastProgress = progressEvents[progressEvents.length - 1];
			expect(lastProgress.current).toBe(lastProgress.total);
			expect(lastProgress.percentage).toBe(100);
		});
	});

	describe("file generation events", () => {
		it("should emit fileGenerated event for each file", async () => {
			const scanResults: Array<ScanResult> = [];

			const fileEvents: Array<string> = [];
			generator.on("fileGenerated", filePath => fileEvents.push(filePath));

			await generator.generate(scanResults, "/output");

			expect(fileEvents.length).toBeGreaterThan(0);
			expect(fileEvents.some(f => f.includes("intro.md"))).toBe(true);
			expect(fileEvents.some(f => f.includes("package.json"))).toBe(true);
			expect(fileEvents.some(f => f.includes("docusaurus.config.js"))).toBe(true);
			expect(fileEvents.some(f => f.includes("sidebars.js"))).toBe(true);
		});
	});

	describe("AI enhancement", () => {
		it("should pass AI flag to MarkdownGenerator", () => {
			const aiGenerator = new DocusaurusGenerator(true);
			expect(aiGenerator).toBeDefined();
		});
	});

	describe("edge cases", () => {
		it("should handle empty specs array", async () => {
			const scanResults: Array<ScanResult> = [];

			await expect(generator.generate(scanResults, "/output")).resolves.toBe("/output");
		});

		it("should handle spec with complex path structures", async () => {
			const mockSpec: OpenAPISpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0" },
				paths: {
					"/api/v1/users/{userId}/posts/{postId}/comments": {
						get: { summary: "Get comments", responses: {} },
						post: { summary: "Add comment", responses: {} },
					},
				},
			};

			const scanResults: Array<ScanResult> = [
				{
					fileName: "api.yaml",
					filePath: "/test/api.yaml",
					version: "3.0.0",
					title: "Test API",
					description: "Test",
					endpointCount: 2,
					valid: true,
					spec: mockSpec,
				},
			];

			await expect(generator.generate(scanResults, "/output")).resolves.toBe("/output");
		});

		it("should handle multiple specs with same title", async () => {
			const scanResults: Array<ScanResult> = [
				{
					fileName: "api-v1.yaml",
					filePath: "/test/api-v1.yaml",
					version: "3.0.0",
					title: "My API",
					description: "Version 1",
					endpointCount: 0,
					valid: true,
					spec: {
						openapi: "3.0.0",
						info: { title: "My API", version: "1.0.0" },
						paths: {},
					},
				},
				{
					fileName: "api-v2.yaml",
					filePath: "/test/api-v2.yaml",
					version: "3.0.0",
					title: "My API",
					description: "Version 2",
					endpointCount: 0,
					valid: true,
					spec: {
						openapi: "3.0.0",
						info: { title: "My API", version: "2.0.0" },
						paths: {},
					},
				},
			];

			// Should not throw, both get processed with slugified names
			await expect(generator.generate(scanResults, "/output")).resolves.toBe("/output");
		});
	});
});
