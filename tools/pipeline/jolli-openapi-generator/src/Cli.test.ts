import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main, parseArgs } from "./Cli.js";

// Mock Generator module
vi.mock("./Generator.js", () => ({
	generateOpenApiSpec: vi.fn().mockResolvedValue({
		spec: {
			openapi: "3.0.3",
			info: { title: "Test", version: "1.0.0" },
			paths: {
				"/users": {
					get: { operationId: "getUsers", responses: { "200": { description: "Success" } } },
				},
			},
		},
		summary: {
			totalRoutes: 2,
			routesWithRequestBody: 1,
			routesWithResponses: 1,
			frameworksDetected: ["express"],
			routesByMethod: { GET: 1, POST: 1 },
		},
	}),
	writeSpec: vi.fn().mockResolvedValue(undefined),
}));

describe("Cli", () => {
	describe("parseArgs", () => {
		it("parses --repo argument", () => {
			const options = parseArgs(["--repo", "/test/repo"]);
			expect(options.repo).toBe(path.resolve("/test/repo"));
		});

		it("parses --output argument", () => {
			const options = parseArgs(["--output", "api.json"]);
			expect(options.output).toBe("api.json");
		});

		it("parses --format json", () => {
			const options = parseArgs(["--format", "json"]);
			expect(options.format).toBe("json");
		});

		it("parses --format yaml", () => {
			const options = parseArgs(["--format", "yaml"]);
			expect(options.format).toBe("yaml");
		});

		it("throws on invalid format", () => {
			expect(() => parseArgs(["--format", "xml"])).toThrow('Invalid format: xml. Must be "json" or "yaml"');
		});

		it("parses --title argument", () => {
			const options = parseArgs(["--title", "My API"]);
			expect(options.title).toBe("My API");
		});

		it("parses --version argument", () => {
			const options = parseArgs(["--version", "2.0.0"]);
			expect(options.version).toBe("2.0.0");
		});

		it("parses --description argument", () => {
			const options = parseArgs(["--description", "API description"]);
			expect(options.description).toBe("API description");
		});

		it("parses --server argument", () => {
			const options = parseArgs(["--server", "https://api.example.com"]);
			expect(options.serverUrl).toBe("https://api.example.com");
		});

		it("parses --mapping argument", () => {
			const options = parseArgs(["--mapping", "/path/to/mapping.json"]);
			expect(options.operationIdMapping).toBe(path.resolve("/path/to/mapping.json"));
		});

		it("parses --include argument", () => {
			const options = parseArgs(["--include", "routes/**/*.ts,api/**/*.ts"]);
			expect(options.includePaths).toEqual(["routes/**/*.ts", "api/**/*.ts"]);
		});

		it("parses --exclude argument", () => {
			const options = parseArgs(["--exclude", "test/**,__tests__/**"]);
			expect(options.excludePaths).toEqual(["test/**", "__tests__/**"]);
		});

		it("parses --help argument", () => {
			const options = parseArgs(["--help"]);
			expect(options.help).toBe(true);
		});

		it("parses -h argument", () => {
			const options = parseArgs(["-h"]);
			expect(options.help).toBe(true);
		});

		it("sets default output based on format", () => {
			const jsonOptions = parseArgs(["--format", "json"]);
			expect(jsonOptions.output).toBe("openapi.json");

			const yamlOptions = parseArgs(["--format", "yaml"]);
			expect(yamlOptions.output).toBe("openapi.yaml");
		});

		it("parses multiple arguments", () => {
			const options = parseArgs([
				"--repo",
				"/test",
				"--output",
				"spec.yaml",
				"--format",
				"yaml",
				"--title",
				"My API",
				"--version",
				"2.0.0",
			]);
			expect(options.repo).toBe(path.resolve("/test"));
			expect(options.output).toBe("spec.yaml");
			expect(options.format).toBe("yaml");
			expect(options.title).toBe("My API");
			expect(options.version).toBe("2.0.0");
		});
	});

	describe("main", () => {
		let consoleSpy: ReturnType<typeof vi.spyOn>;
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		});

		afterEach(() => {
			consoleSpy.mockRestore();
			consoleErrorSpy.mockRestore();
			vi.clearAllMocks();
		});

		it("shows help when --help is passed", async () => {
			const exitCode = await main(["--help"]);
			expect(exitCode).toBe(0);
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("jolli-openapi-generator"));
		});

		it("returns error when --repo is missing", async () => {
			const exitCode = await main([]);
			expect(exitCode).toBe(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith("Error: --repo is required");
		});

		it("generates spec successfully", async () => {
			const exitCode = await main(["--repo", "/test"]);
			expect(exitCode).toBe(0);
			expect(consoleSpy).toHaveBeenCalledWith("Generation complete!");
			expect(consoleSpy).toHaveBeenCalledWith("  Total routes: 2");
		});

		it("logs configuration", async () => {
			await main(["--repo", "/test", "--title", "My API", "--version", "2.0.0"]);
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Repository:"));
			expect(consoleSpy).toHaveBeenCalledWith("  Title: My API");
			expect(consoleSpy).toHaveBeenCalledWith("  Version: 2.0.0");
		});

		it("logs server when provided", async () => {
			await main(["--repo", "/test", "--server", "https://api.example.com"]);
			expect(consoleSpy).toHaveBeenCalledWith("  Server: https://api.example.com");
		});

		it("handles generator errors", async () => {
			const { generateOpenApiSpec } = await import("./Generator.js");
			vi.mocked(generateOpenApiSpec).mockRejectedValueOnce(new Error("Scan failed"));

			const exitCode = await main(["--repo", "/test"]);
			expect(exitCode).toBe(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith("Error generating OpenAPI specification:");
			expect(consoleErrorSpy).toHaveBeenCalledWith("Scan failed");
		});

		it("handles parse errors", async () => {
			const exitCode = await main(["--format", "invalid"]);
			expect(exitCode).toBe(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith("Error parsing arguments:");
		});

		it("logs routes by method", async () => {
			await main(["--repo", "/test"]);
			expect(consoleSpy).toHaveBeenCalledWith("  Routes by method:");
			expect(consoleSpy).toHaveBeenCalledWith("    GET: 1");
			expect(consoleSpy).toHaveBeenCalledWith("    POST: 1");
		});

		it("logs frameworks detected", async () => {
			await main(["--repo", "/test"]);
			expect(consoleSpy).toHaveBeenCalledWith("  Frameworks detected: express");
		});

		it("logs output path", async () => {
			await main(["--repo", "/test", "--output", "api.json"]);
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Output written to:"));
		});
	});
});
