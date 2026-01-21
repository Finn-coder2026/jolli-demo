import { main } from "./Cli";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

const TEST_DIR = path.join(process.cwd(), "test-output", "cli");

describe("CLI", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock types are complex
	let consoleLogSpy: MockInstance<any>;
	// biome-ignore lint/suspicious/noExplicitAny: Mock types are complex
	let consoleErrorSpy: MockInstance<any>;

	beforeEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
		await fs.mkdir(TEST_DIR, { recursive: true });

		// Mock console and process.exit (suppress console output during tests)
		// biome-ignore lint/nursery/noUselessUndefined: Mock implementations need explicit return value
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		// biome-ignore lint/nursery/noUselessUndefined: Mock implementations need explicit return value
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit called");
		}) as () => never);
	});

	afterEach(async () => {
		// Clean up
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}

		vi.restoreAllMocks();
	});

	describe("help and version", () => {
		it("should show help with --help flag", async () => {
			await main(["--help"]);

			expect(consoleLogSpy).toHaveBeenCalled();
			const output = consoleLogSpy.mock.calls.flat().join("\n");
			expect(output).toContain("Nextra Generator CLI");
			expect(output).toContain("--output");
			// Router option is deprecated but still shown in help
		});

		it("should show help with -h flag", async () => {
			await main(["-h"]);

			const output = consoleLogSpy.mock.calls.flat().join("\n");
			expect(output).toContain("Nextra Generator CLI");
		});

		it("should show version with --version flag", async () => {
			await main(["--version"]);

			expect(consoleLogSpy).toHaveBeenCalledWith("nextra-generator v2.0.0");
		});

		it("should show version with -v flag", async () => {
			await main(["-v"]);

			expect(consoleLogSpy).toHaveBeenCalledWith("nextra-generator v2.0.0");
		});
	});

	describe("argument parsing", () => {
		it("should require output directory", async () => {
			await expect(main([])).rejects.toThrow(/process\.exit called/);

			expect(consoleErrorSpy).toHaveBeenCalled();
			const errorOutput = consoleErrorSpy.mock.calls.flat().join("\n");
			expect(errorOutput).toContain("Output directory is required");
		});

		it("should accept --output flag", async () => {
			const outputDir = path.join(TEST_DIR, "output-test");

			await main(["--output", outputDir]);

			const exists = await fs.stat(outputDir).catch(() => null);
			expect(exists?.isDirectory()).toBe(true);
		});

		it("should accept -o shorthand", async () => {
			const outputDir = path.join(TEST_DIR, "output-short");

			await main(["-o", outputDir]);

			const exists = await fs.stat(outputDir).catch(() => null);
			expect(exists?.isDirectory()).toBe(true);
		});

		it("should accept --router app (deprecated but still works)", async () => {
			const outputDir = path.join(TEST_DIR, "app-router");

			await main(["-o", outputDir, "--router", "app"]);

			// App router (Nextra 4.x) uses content folder
			const contentExists = await fs.stat(path.join(outputDir, "content")).catch(() => null);
			expect(contentExists?.isDirectory()).toBe(true);
		});

		it("should accept --router page (deprecated, now uses app router)", async () => {
			const outputDir = path.join(TEST_DIR, "page-router");

			await main(["-o", outputDir, "-r", "page"]);

			// Even with "page" option, Nextra 4.x always uses content folder (app router)
			const contentExists = await fs.stat(path.join(outputDir, "content")).catch(() => null);
			expect(contentExists?.isDirectory()).toBe(true);
		});

		it("should accept invalid router type with deprecation warning (always uses app)", async () => {
			const outputDir = path.join(TEST_DIR, "invalid-router");

			// Invalid router types now just show deprecation warning and use app router
			await main(["-o", outputDir, "-r", "invalid"]);

			// Should still generate with app router
			const contentExists = await fs.stat(path.join(outputDir, "content")).catch(() => null);
			expect(contentExists?.isDirectory()).toBe(true);
		});

		it("should accept --logo flag", async () => {
			const outputDir = path.join(TEST_DIR, "logo-test");

			await main(["-o", outputDir, "--logo", "My Custom Logo"]);

			const output = consoleLogSpy.mock.calls.flat().join("\n");
			expect(output).toContain("My Custom Logo");
		});

		it("should accept -l shorthand for logo", async () => {
			const outputDir = path.join(TEST_DIR, "logo-short");

			await main(["-o", outputDir, "-l", "Short Logo"]);

			const output = consoleLogSpy.mock.calls.flat().join("\n");
			expect(output).toContain("Short Logo");
		});

		it("should accept --footer flag", async () => {
			const outputDir = path.join(TEST_DIR, "footer-test");

			await main(["-o", outputDir, "-f", "Custom Footer"]);

			// Verify footer was used in generation (Nextra 4.x uses app/layout.tsx)
			const layout = await fs.readFile(path.join(outputDir, "app/layout.tsx"), "utf-8");
			expect(layout).toContain("Custom Footer");
		});

		it("should accept --skip-defaults flag", async () => {
			const outputDir = path.join(TEST_DIR, "skip-defaults");

			await main(["-o", outputDir, "--skip-defaults"]);

			// Should not have getting-started page (Nextra 4.x uses content folder)
			const gettingStarted = await fs.stat(path.join(outputDir, "content/getting-started.mdx")).catch(() => null);
			expect(gettingStarted).toBeNull();
		});
	});

	describe("input files", () => {
		it("should accept --input flag for directory scanning", async () => {
			const outputDir = path.join(TEST_DIR, "input-test");
			const inputDir = path.join(TEST_DIR, "input-docs");

			await fs.mkdir(inputDir, { recursive: true });
			await fs.writeFile(path.join(inputDir, "guide.mdx"), "# Guide\n\nContent", "utf-8");

			await main(["-o", outputDir, "--input", inputDir]);

			// Nextra 4.x uses content folder
			const guide = await fs.stat(path.join(outputDir, "content/guide.mdx")).catch(() => null);
			expect(guide?.isFile()).toBe(true);
		});

		it("should accept -i shorthand for input", async () => {
			const outputDir = path.join(TEST_DIR, "input-short");
			const inputDir = path.join(TEST_DIR, "input-short-docs");

			await fs.mkdir(inputDir, { recursive: true });
			await fs.writeFile(path.join(inputDir, "api.md"), "# API\n\nAPI docs", "utf-8");

			await main(["-o", outputDir, "-i", inputDir]);

			// Nextra 4.x uses content folder
			const api = await fs.stat(path.join(outputDir, "content/api.mdx")).catch(() => null);
			expect(api?.isFile()).toBe(true);
		});
	});

	describe("openapi", () => {
		it("should accept --openapi flag", async () => {
			const outputDir = path.join(TEST_DIR, "openapi-test");
			const specDir = path.join(TEST_DIR, "specs");

			await fs.mkdir(specDir, { recursive: true });
			const spec = { openapi: "3.0.0", info: { title: "Test" }, paths: {} };
			await fs.writeFile(path.join(specDir, "openapi.json"), JSON.stringify(spec), "utf-8");

			await main(["-o", outputDir, "--openapi", path.join(specDir, "openapi.json")]);

			// OpenAPI spec is copied with slugified name (JOLLI-191/192 pattern)
			// slugify("openapi.json") = "openapijson" (period removed)
			const apiSpec = await fs.stat(path.join(outputDir, "public/api-docs-openapijson.json")).catch(() => null);
			expect(apiSpec?.isFile()).toBe(true);

			// API docs HTML is generated with slugified name
			const apiDocs = await fs.stat(path.join(outputDir, "public/api-docs-openapijson.html")).catch(() => null);
			expect(apiDocs?.isFile()).toBe(true);
		});

		it("should accept -a shorthand for openapi", async () => {
			const outputDir = path.join(TEST_DIR, "openapi-short");
			const specDir = path.join(TEST_DIR, "specs-short");

			await fs.mkdir(specDir, { recursive: true });
			const spec = { openapi: "3.0.0", info: { title: "Test" }, paths: {} };
			await fs.writeFile(path.join(specDir, "api.json"), JSON.stringify(spec), "utf-8");

			await main(["-o", outputDir, "-a", path.join(specDir, "api.json")]);

			// OpenAPI spec is copied with slugified name (JOLLI-191/192 pattern)
			// slugify("api.json") = "apijson" (period removed)
			const publicSpec = await fs.stat(path.join(outputDir, "public/api-docs-apijson.json")).catch(() => null);
			expect(publicSpec?.isFile()).toBe(true);
		});
	});

	describe("combined options", () => {
		it("should accept multiple options together", async () => {
			const outputDir = path.join(TEST_DIR, "combined");

			await main([
				"-o",
				outputDir,
				"-r",
				"app",
				"-l",
				"Combined Docs",
				"-f",
				"Combined Footer",
				"--skip-defaults",
			]);

			// Verify app router was used
			const contentExists = await fs.stat(path.join(outputDir, "content")).catch(() => null);
			expect(contentExists?.isDirectory()).toBe(true);

			// Verify theme was applied
			const layout = await fs.readFile(path.join(outputDir, "app/layout.tsx"), "utf-8");
			expect(layout).toContain("Combined Docs");
			expect(layout).toContain("Combined Footer");
		});
	});

	describe("output messages", () => {
		it("should show success message on completion", async () => {
			const outputDir = path.join(TEST_DIR, "success-msg");

			await main(["-o", outputDir]);

			const output = consoleLogSpy.mock.calls.flat().join("\n");
			expect(output).toContain("Site generated successfully");
			expect(output).toContain("Next steps:");
			expect(output).toContain("npm install");
			expect(output).toContain("npm run dev");
		});

		it("should show Nextra 4.x in output", async () => {
			const outputDir = path.join(TEST_DIR, "router-msg");

			await main(["-o", outputDir, "-r", "app"]);

			const output = consoleLogSpy.mock.calls.flat().join("\n");
			// Router type is no longer shown since Nextra 4.x is the only option
			expect(output).toContain("Nextra 4.x");
		});

		it("should show file count", async () => {
			const outputDir = path.join(TEST_DIR, "count-msg");

			await main(["-o", outputDir]);

			const output = consoleLogSpy.mock.calls.flat().join("\n");
			expect(output).toMatch(/Created \d+ files/);
		});
	});
});
