import {
	buildFullNavigationMeta,
	buildNavigationMeta,
	extractTitleFromContent,
	extractTitleFromFilename,
	generateTargetPath,
	getFileType,
	processInputFile,
	processInputFiles,
	scanDirectory,
} from "./input-files";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = path.join(process.cwd(), "test-output", "input-files");

describe("Input Files Utilities", () => {
	beforeEach(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
		await fs.mkdir(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}
	});

	describe("getFileType", () => {
		it("should detect MDX files", () => {
			expect(getFileType("file.mdx")).toBe("mdx");
			expect(getFileType("/path/to/file.mdx")).toBe("mdx");
			expect(getFileType("file.MDX")).toBe("mdx");
		});

		it("should detect MD files", () => {
			expect(getFileType("file.md")).toBe("md");
			expect(getFileType("/path/to/file.md")).toBe("md");
			expect(getFileType("file.MD")).toBe("md");
		});

		it("should detect JSON files", () => {
			expect(getFileType("file.json")).toBe("json");
			expect(getFileType("/path/to/file.json")).toBe("json");
			expect(getFileType("file.JSON")).toBe("json");
		});

		it("should detect YAML files", () => {
			expect(getFileType("file.yaml")).toBe("yaml");
			expect(getFileType("/path/to/file.yaml")).toBe("yaml");
			expect(getFileType("file.YAML")).toBe("yaml");
			expect(getFileType("file.yml")).toBe("yaml");
			expect(getFileType("file.YML")).toBe("yaml");
		});

		it("should return null for unsupported types", () => {
			expect(getFileType("file.txt")).toBeNull();
			expect(getFileType("file.html")).toBeNull();
			expect(getFileType("file")).toBeNull();
		});
	});

	describe("extractTitleFromContent", () => {
		it("should extract title from H1 heading", () => {
			const content = "# My Title\n\nSome content here";
			expect(extractTitleFromContent(content)).toBe("My Title");
		});

		it("should extract title with extra spaces", () => {
			const content = "#    Spaced Title   \n\nContent";
			expect(extractTitleFromContent(content)).toBe("Spaced Title");
		});

		it("should return null if no H1 heading", () => {
			const content = "## H2 Heading\n\nNo H1 here";
			expect(extractTitleFromContent(content)).toBeNull();
		});

		it("should return null for empty content", () => {
			expect(extractTitleFromContent("")).toBeNull();
		});

		it("should extract first H1 if multiple exist", () => {
			const content = "# First Title\n\n# Second Title";
			expect(extractTitleFromContent(content)).toBe("First Title");
		});
	});

	describe("extractTitleFromFilename", () => {
		it("should convert kebab-case to Title Case", () => {
			expect(extractTitleFromFilename("my-file-name.mdx")).toBe("My File Name");
		});

		it("should convert snake_case to Title Case", () => {
			expect(extractTitleFromFilename("my_file_name.md")).toBe("My File Name");
		});

		it("should handle single word", () => {
			expect(extractTitleFromFilename("guide.mdx")).toBe("Guide");
		});

		it("should handle path with directory", () => {
			expect(extractTitleFromFilename("/path/to/getting-started.mdx")).toBe("Getting Started");
		});

		it("should handle mixed separators", () => {
			expect(extractTitleFromFilename("my-file_name.json")).toBe("My File Name");
		});
	});

	describe("generateTargetPath", () => {
		it("should return basename without extension", () => {
			expect(generateTargetPath("guide.mdx")).toBe("guide");
			expect(generateTargetPath("/path/to/api-reference.md")).toBe("api-reference");
		});

		it("should handle index files by using parent folder", () => {
			expect(generateTargetPath("folder/index.mdx")).toBe("folder");
		});

		it("should return index for root index file", () => {
			expect(generateTargetPath("index.mdx")).toBe("index");
		});
	});

	describe("processInputFile", () => {
		it("should process MDX file", async () => {
			const filePath = path.join(TEST_DIR, "test.mdx");
			await fs.writeFile(filePath, "# Test Title\n\nContent here", "utf-8");

			const result = await processInputFile({ sourcePath: filePath }, "page");

			expect(result.page.title).toBe("Test Title");
			expect(result.page.content).toContain("# Test Title");
			expect(result.isJson).toBe(false);
		});

		it("should process MD file", async () => {
			const filePath = path.join(TEST_DIR, "guide.md");
			await fs.writeFile(filePath, "# Guide\n\nGuide content", "utf-8");

			const result = await processInputFile({ sourcePath: filePath }, "app");

			expect(result.page.title).toBe("Guide");
			expect(result.page.path).toBe("guide");
			expect(result.isJson).toBe(false);
		});

		it("should process JSON file as code block", async () => {
			const filePath = path.join(TEST_DIR, "data.json");
			const jsonContent = JSON.stringify({ key: "value" }, null, 2);
			await fs.writeFile(filePath, jsonContent, "utf-8");

			const result = await processInputFile({ sourcePath: filePath }, "page");

			expect(result.page.title).toBe("Data");
			expect(result.page.content).toContain("```json");
			expect(result.isJson).toBe(true);
			expect(result.jsonData).toEqual({ key: "value" });
		});

		it("should detect OpenAPI spec in JSON", async () => {
			const filePath = path.join(TEST_DIR, "openapi.json");
			const openApiSpec = {
				openapi: "3.0.0",
				info: { title: "My API", version: "1.0.0" },
				paths: {},
			};
			await fs.writeFile(filePath, JSON.stringify(openApiSpec), "utf-8");

			const result = await processInputFile({ sourcePath: filePath }, "page");

			expect(result.isJson).toBe(true);
			// JOLLI-192: OpenAPI specs don't create MDX pages - they use /api-docs/{slug} route instead
			expect(result.isOpenApi).toBe(true);
			expect(result.page.content).toBe(""); // Empty content - no MDX page
		});

		it("should process YAML file as code block", async () => {
			const filePath = path.join(TEST_DIR, "config.yaml");
			const yamlContent = "key: value\nother: 123";
			await fs.writeFile(filePath, yamlContent, "utf-8");

			const result = await processInputFile({ sourcePath: filePath }, "page");

			expect(result.page.title).toBe("Config");
			expect(result.page.content).toContain("```json");
			expect(result.isJson).toBe(true);
			expect(result.jsonData).toEqual({ key: "value", other: 123 });
		});

		it("should detect OpenAPI spec in YAML", async () => {
			const filePath = path.join(TEST_DIR, "api.yaml");
			const yamlContent = `openapi: "3.0.0"
info:
  title: Products API
  version: "1.0.0"
paths:
  /products:
    get:
      summary: List products`;
			await fs.writeFile(filePath, yamlContent, "utf-8");

			const result = await processInputFile({ sourcePath: filePath }, "page");

			expect(result.isJson).toBe(true);
			expect(result.isOpenApi).toBe(true);
			expect(result.page.content).toBe(""); // Empty content - no MDX page
			expect(result.jsonData).toHaveProperty("openapi", "3.0.0");
		});

		it("should detect Swagger spec in YAML (.yml extension)", async () => {
			const filePath = path.join(TEST_DIR, "legacy-api.yml");
			const yamlContent = `swagger: "2.0"
info:
  title: Legacy API
  version: "1.0.0"
paths: {}`;
			await fs.writeFile(filePath, yamlContent, "utf-8");

			const result = await processInputFile({ sourcePath: filePath }, "page");

			expect(result.isJson).toBe(true);
			expect(result.isOpenApi).toBe(true);
			expect(result.jsonData).toHaveProperty("swagger", "2.0");
		});

		it("should use custom target path if provided", async () => {
			const filePath = path.join(TEST_DIR, "test.mdx");
			await fs.writeFile(filePath, "# Test\n\nContent", "utf-8");

			const result = await processInputFile(
				{
					sourcePath: filePath,
					targetPath: "custom/path",
				},
				"page",
			);

			expect(result.page.path).toBe("custom/path");
		});

		it("should use custom title if provided", async () => {
			const filePath = path.join(TEST_DIR, "test.mdx");
			await fs.writeFile(filePath, "# File Title\n\nContent", "utf-8");

			const result = await processInputFile(
				{
					sourcePath: filePath,
					title: "Custom Title",
				},
				"page",
			);

			expect(result.page.title).toBe("Custom Title");
		});

		it("should throw for unsupported file type", async () => {
			const filePath = path.join(TEST_DIR, "file.txt");
			await fs.writeFile(filePath, "content", "utf-8");

			await expect(processInputFile({ sourcePath: filePath }, "page")).rejects.toThrow("Unsupported file type");
		});

		it("should throw for non-existent file", async () => {
			await expect(processInputFile({ sourcePath: "/non/existent.mdx" }, "page")).rejects.toThrow(
				"File not found",
			);
		});

		it("should extract title from filename if no H1 in content", async () => {
			const filePath = path.join(TEST_DIR, "my-guide.mdx");
			await fs.writeFile(filePath, "No heading here, just content", "utf-8");

			const result = await processInputFile({ sourcePath: filePath }, "page");

			expect(result.page.title).toBe("My Guide");
		});
	});

	describe("processInputFiles", () => {
		it("should process multiple files", async () => {
			const file1 = path.join(TEST_DIR, "guide.mdx");
			const file2 = path.join(TEST_DIR, "api.md");

			await fs.writeFile(file1, "# Guide\n\nContent", "utf-8");
			await fs.writeFile(file2, "# API\n\nAPI content", "utf-8");

			const result = await processInputFiles([{ sourcePath: file1 }, { sourcePath: file2 }], "page");

			expect(result.pages).toHaveLength(2);
			expect(result.errors).toHaveLength(0);
		});

		it("should collect errors without failing completely", async () => {
			const validFile = path.join(TEST_DIR, "valid.mdx");
			await fs.writeFile(validFile, "# Valid\n\nContent", "utf-8");

			const result = await processInputFiles(
				[{ sourcePath: validFile }, { sourcePath: "/non/existent.mdx" }],
				"page",
			);

			expect(result.pages).toHaveLength(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain("File not found");
		});

		it("should separate JSON files", async () => {
			const jsonFile = path.join(TEST_DIR, "data.json");
			await fs.writeFile(jsonFile, '{"key": "value"}', "utf-8");

			const result = await processInputFiles([{ sourcePath: jsonFile }], "page");

			expect(result.pages).toHaveLength(1);
			expect(result.jsonFiles).toHaveLength(1);
			expect(result.jsonFiles[0].data).toEqual({ key: "value" });
		});
	});

	describe("buildNavigationMeta", () => {
		it("should build navigation from pages", () => {
			const pages = [
				{ path: "guide", title: "Getting Started", content: "" },
				{ path: "api", title: "API Reference", content: "" },
			];

			const meta = buildNavigationMeta(pages);

			expect(meta).toEqual({
				guide: "Getting Started",
				api: "API Reference",
			});
		});

		it("should use first segment for nested paths", () => {
			const pages = [
				{ path: "api/overview", title: "API Overview", content: "" },
				{ path: "api/endpoints", title: "Endpoints", content: "" },
			];

			const meta = buildNavigationMeta(pages);

			expect(meta.api).toBe("API Overview");
		});

		it("should handle empty array", () => {
			const meta = buildNavigationMeta([]);
			expect(meta).toEqual({});
		});
	});

	describe("buildFullNavigationMeta", () => {
		it("should not include hidden index entry", () => {
			const pages = [{ path: "guide", title: "Getting Started", content: "" }];
			const meta = buildFullNavigationMeta(pages);

			// Hidden index prevents Nextra from auto-generating Index nav item
			expect(meta.index).toEqual({ display: "hidden" });
			expect(meta.guide).toBe("Getting Started");
		});

		it("should add single OpenAPI spec as page entry", () => {
			const pages = [{ path: "guide", title: "Guide", content: "" }];
			const specs = [{ name: "petstore", specPath: "/api.json", title: "Petstore API" }];

			const meta = buildFullNavigationMeta(pages, specs);

			expect(meta["api-reference"]).toEqual({
				title: "API Reference",
				type: "page",
				href: "/api-docs/petstore",
			});
		});

		it("should add multiple OpenAPI specs as menu entry", () => {
			const pages = [{ path: "guide", title: "Guide", content: "" }];
			const specs = [
				{ name: "users", specPath: "/users.json", title: "Users API" },
				{ name: "orders", specPath: "/orders.json", title: "Orders API" },
			];

			const meta = buildFullNavigationMeta(pages, specs);

			expect(meta["api-reference"]).toEqual({
				title: "API Reference",
				type: "menu",
				items: {
					users: { title: "Users API", href: "/api-docs/users" },
					orders: { title: "Orders API", href: "/api-docs/orders" },
				},
			});
		});

		it("should generate title from spec name if title not provided", () => {
			const pages: Array<{ path: string; title: string; content: string }> = [];
			const specs = [
				{ name: "petstore", specPath: "/api.json", title: "" },
				{ name: "users", specPath: "/users.json", title: "" },
			];

			const meta = buildFullNavigationMeta(pages, specs);
			const apiRef = meta["api-reference"] as { items: Record<string, { title: string }> };

			expect(apiRef.items.petstore.title).toBe("Petstore API");
			expect(apiRef.items.users.title).toBe("Users API");
		});
	});

	describe("scanDirectory", () => {
		it("should find files in directory", async () => {
			await fs.writeFile(path.join(TEST_DIR, "guide.mdx"), "content", "utf-8");
			await fs.writeFile(path.join(TEST_DIR, "api.md"), "content", "utf-8");

			const files = await scanDirectory(TEST_DIR);

			expect(files).toHaveLength(2);
			expect(files.map(f => f.sourcePath)).toContain(path.join(TEST_DIR, "guide.mdx"));
			expect(files.map(f => f.sourcePath)).toContain(path.join(TEST_DIR, "api.md"));
		});

		it("should scan nested directories", async () => {
			const nestedDir = path.join(TEST_DIR, "nested");
			await fs.mkdir(nestedDir, { recursive: true });
			await fs.writeFile(path.join(nestedDir, "file.mdx"), "content", "utf-8");

			const files = await scanDirectory(TEST_DIR);

			expect(files).toHaveLength(1);
			expect(files[0].targetPath).toBe("nested/file");
		});

		it("should filter by extensions", async () => {
			await fs.writeFile(path.join(TEST_DIR, "file.mdx"), "content", "utf-8");
			await fs.writeFile(path.join(TEST_DIR, "file.json"), "{}", "utf-8");
			await fs.writeFile(path.join(TEST_DIR, "file.txt"), "text", "utf-8");

			const mdxOnly = await scanDirectory(TEST_DIR, ["mdx"]);
			expect(mdxOnly).toHaveLength(1);

			const allSupported = await scanDirectory(TEST_DIR, ["mdx", "json"]);
			expect(allSupported).toHaveLength(2);
		});

		it("should ignore unsupported file types", async () => {
			await fs.writeFile(path.join(TEST_DIR, "file.txt"), "text", "utf-8");
			await fs.writeFile(path.join(TEST_DIR, "file.css"), "css", "utf-8");

			const files = await scanDirectory(TEST_DIR);

			expect(files).toHaveLength(0);
		});

		it("should find YAML files by default", async () => {
			await fs.writeFile(path.join(TEST_DIR, "api.yaml"), "openapi: 3.0.0", "utf-8");
			await fs.writeFile(path.join(TEST_DIR, "config.yml"), "key: value", "utf-8");

			const files = await scanDirectory(TEST_DIR);

			expect(files).toHaveLength(2);
			expect(files.map(f => f.sourcePath)).toContain(path.join(TEST_DIR, "api.yaml"));
			expect(files.map(f => f.sourcePath)).toContain(path.join(TEST_DIR, "config.yml"));
		});
	});
});
