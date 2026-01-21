import { generateAppRouterSite, generateSite } from "./index";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = path.join(process.cwd(), "test-output", "generators");

describe("Site Generators", () => {
	beforeEach(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
	});

	afterEach(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
	});

	describe("generateSite", () => {
		it("should generate Nextra 4.x App Router site", async () => {
			const outputDir = path.join(TEST_DIR, "app-site");

			const result = await generateSite({
				router: "app",
				outputDir,
			});

			expect(result.success).toBe(true);
			// App router uses content folder
			const contentExists = await fs.stat(path.join(outputDir, "content")).catch(() => null);
			expect(contentExists?.isDirectory()).toBe(true);
		});

		it("should always use App Router regardless of router parameter", async () => {
			const outputDir = path.join(TEST_DIR, "page-site");

			// Even with router: "page", should still use App Router (Nextra 4.x only)
			const result = await generateSite({
				router: "page",
				outputDir,
			});

			expect(result.success).toBe(true);
			// App router uses content folder (Nextra 4.x structure)
			const contentExists = await fs.stat(path.join(outputDir, "content")).catch(() => null);
			expect(contentExists?.isDirectory()).toBe(true);
		});
	});

	describe("generateAppRouterSite", () => {
		it("should generate minimal site with default options", async () => {
			const outputDir = path.join(TEST_DIR, "app-minimal");

			const result = await generateAppRouterSite({
				router: "app",
				outputDir,
			});

			expect(result.success).toBe(true);
			expect(result.outputDir).toBe(outputDir);
			expect(result.filesCreated.length).toBeGreaterThan(0);

			// Check essential files exist
			const packageJson = await fs.readFile(path.join(outputDir, "package.json"), "utf-8");
			expect(JSON.parse(packageJson).dependencies.nextra).toContain("4.");

			// JOLLI-191: No content/index.mdx generated in minimal mode
			// The site should have _meta.ts but no index.mdx
			const metaContent = await fs.readFile(path.join(outputDir, "content/_meta.ts"), "utf-8");
			expect(metaContent).toContain("export default");
		});

		it("should generate site with custom theme", async () => {
			const outputDir = path.join(TEST_DIR, "app-themed");

			const result = await generateAppRouterSite({
				router: "app",
				outputDir,
				theme: {
					logo: "My Docs",
					footer: "© 2024 My Company",
				},
			});

			expect(result.success).toBe(true);

			const layout = await fs.readFile(path.join(outputDir, "app/layout.tsx"), "utf-8");
			expect(layout).toContain("My Docs");
			expect(layout).toContain("© 2024 My Company");
		});

		it("should generate sample pages when skipDefaultPages is false", async () => {
			const outputDir = path.join(TEST_DIR, "app-with-samples");

			const result = await generateAppRouterSite({
				router: "app",
				outputDir,
				skipDefaultPages: false,
			});

			expect(result.success).toBe(true);

			const gettingStarted = await fs.stat(path.join(outputDir, "content/getting-started.mdx")).catch(() => null);
			expect(gettingStarted?.isFile()).toBe(true);

			const apiRef = await fs.stat(path.join(outputDir, "content/api-reference/_meta.ts")).catch(() => null);
			expect(apiRef?.isFile()).toBe(true);
		});

		it("should generate custom pages", async () => {
			const outputDir = path.join(TEST_DIR, "app-custom-pages");

			const result = await generateAppRouterSite({
				router: "app",
				outputDir,
				pages: [
					{ path: "guide", title: "Guide", content: "# Guide\n\nGuide content" },
					{ path: "faq", title: "FAQ", content: "# FAQ\n\nFAQ content" },
				],
			});

			expect(result.success).toBe(true);

			const guide = await fs.readFile(path.join(outputDir, "content/guide.mdx"), "utf-8");
			expect(guide).toContain("# Guide");

			const faq = await fs.readFile(path.join(outputDir, "content/faq.mdx"), "utf-8");
			expect(faq).toContain("# FAQ");
		});

		it("should process input files", async () => {
			const outputDir = path.join(TEST_DIR, "app-input-files");
			const inputDir = path.join(TEST_DIR, "input");

			await fs.mkdir(inputDir, { recursive: true });
			await fs.writeFile(path.join(inputDir, "docs.mdx"), "# Docs\n\nDocumentation", "utf-8");

			const result = await generateAppRouterSite({
				router: "app",
				outputDir,
				inputFiles: [{ sourcePath: path.join(inputDir, "docs.mdx") }],
			});

			expect(result.success).toBe(true);

			const docs = await fs.readFile(path.join(outputDir, "content/docs.mdx"), "utf-8");
			expect(docs).toContain("# Docs");
		});

		it("should handle OpenAPI spec", async () => {
			const outputDir = path.join(TEST_DIR, "app-openapi");
			const specDir = path.join(TEST_DIR, "specs");

			await fs.mkdir(specDir, { recursive: true });
			const openApiSpec = {
				openapi: "3.0.0",
				info: { title: "Test API", version: "1.0.0", description: "Test description" },
				paths: {
					"/test": { get: { summary: "Test endpoint" } },
				},
			};
			await fs.writeFile(path.join(specDir, "openapi.json"), JSON.stringify(openApiSpec), "utf-8");

			const result = await generateAppRouterSite({
				router: "app",
				outputDir,
				openApi: [{ specPath: path.join(specDir, "openapi.json") }],
			});

			expect(result.success).toBe(true);

			// JOLLI-191/192 pattern: files use slugified spec name
			// slugify("openapi.json") = "openapijson" (period removed)
			const apiDocsHtml = await fs
				.stat(path.join(outputDir, "public/api-docs-openapijson.html"))
				.catch(() => null);
			expect(apiDocsHtml?.isFile()).toBe(true);
		});

		it("should return errors without failing completely", async () => {
			const outputDir = path.join(TEST_DIR, "app-with-errors");

			const result = await generateAppRouterSite({
				router: "app",
				outputDir,
				inputFiles: [{ sourcePath: "/non/existent/file.mdx" }],
			});

			expect(result.success).toBe(true);
			expect(result.errors).toBeDefined();
			expect(result.errors?.length).toBeGreaterThan(0);
		});

		it("should handle OpenAPI spec in input files", async () => {
			const outputDir = path.join(TEST_DIR, "app-input-openapi");
			const inputDir = path.join(TEST_DIR, "input-api");

			await fs.mkdir(inputDir, { recursive: true });
			const openApiSpec = {
				openapi: "3.0.0",
				info: { title: "Input API" },
				paths: {},
			};
			await fs.writeFile(path.join(inputDir, "api.json"), JSON.stringify(openApiSpec), "utf-8");

			const result = await generateAppRouterSite({
				router: "app",
				outputDir,
				inputFiles: [{ sourcePath: path.join(inputDir, "api.json") }],
			});

			expect(result.success).toBe(true);
			// JOLLI-192: OpenAPI specs generate api-docs-{slug}.json and api-docs-{slug}.html
			expect(result.filesCreated).toContain("public/api-docs-api.json");
			expect(result.filesCreated).toContain("public/api-docs-api.html");
			// JOLLI-192: Should also generate the API docs page
			expect(result.filesCreated).toContain("app/api-docs/[[...slug]]/page.tsx");
		});
	});
});
