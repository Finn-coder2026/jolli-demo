import { type GeneratorOptions, generateDocusaurus } from "./index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
	statSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

describe("generateDocusaurus", () => {
	const defaultOptions: GeneratorOptions = {
		docs: "./test-docs",
		output: "./test-output",
		title: "Test Documentation",
		url: "https://test.example.com",
		baseUrl: "/",
		org: "test-org",
		project: "test-project",
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Default mock implementations
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readdirSync).mockReturnValue([]);
		vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>);
		vi.mocked(readFileSync).mockReturnValue("");
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("docs directory validation", () => {
		it("should return error when docs directory does not exist", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = generateDocusaurus(defaultOptions);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Docs directory not found");
		});

		it("should succeed when docs directory exists", () => {
			vi.mocked(existsSync).mockReturnValue(true);

			const result = generateDocusaurus(defaultOptions);

			expect(result.success).toBe(true);
			expect(result.docsPath).toBeDefined();
			expect(result.outputPath).toBeDefined();
		});
	});

	describe("successful generation", () => {
		it("should return success with paths", () => {
			const result = generateDocusaurus(defaultOptions);

			expect(result.success).toBe(true);
			expect(result.docsPath).toContain("test-docs");
			expect(result.outputPath).toContain("test-output");
		});

		it("should call sidebar generator", () => {
			generateDocusaurus(defaultOptions);

			// SidebarGenerator writes sidebars.js
			expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining("sidebars.js"), expect.any(String));
		});

		it("should call config generator", () => {
			generateDocusaurus(defaultOptions);

			// DocusaurusConfigGenerator writes multiple files
			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("docusaurus.config.js"),
				expect.any(String),
			);
			expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining("package.json"), expect.any(String));
		});
	});

	describe("error handling", () => {
		it("should catch and return errors from generators", () => {
			// Make writeFileSync throw an error
			vi.mocked(writeFileSync).mockImplementation(() => {
				throw new Error("Write failed");
			});

			const result = generateDocusaurus(defaultOptions);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Error generating configuration");
			expect(result.error).toContain("Write failed");
		});
	});

	describe("with different options", () => {
		it("should use provided title in config", () => {
			const options: GeneratorOptions = {
				...defaultOptions,
				title: "My Custom Title",
			};

			generateDocusaurus(options);

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain("My Custom Title");
		});

		it("should use provided URL in config", () => {
			const options: GeneratorOptions = {
				...defaultOptions,
				url: "https://my-site.com",
			};

			generateDocusaurus(options);

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain("https://my-site.com");
		});

		it("should use provided baseUrl in config", () => {
			const options: GeneratorOptions = {
				...defaultOptions,
				baseUrl: "/api-docs/",
			};

			generateDocusaurus(options);

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain("/api-docs/");
		});

		it("should use provided org name in config", () => {
			const options: GeneratorOptions = {
				...defaultOptions,
				org: "my-organization",
			};

			generateDocusaurus(options);

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain("my-organization");
		});

		it("should use provided project name in config", () => {
			const options: GeneratorOptions = {
				...defaultOptions,
				project: "my-project",
			};

			generateDocusaurus(options);

			const configCall = vi
				.mocked(writeFileSync)
				.mock.calls.find(call => (call[0] as string).includes("docusaurus.config.js"));
			const content = configCall?.[1] as string;

			expect(content).toContain("my-project");
		});
	});
});
