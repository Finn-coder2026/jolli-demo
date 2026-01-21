import type { Doc } from "../model/Doc";
import { generateDocusaurusFromArticles } from "./DocusaurusGenerationUtil";
import type { DocContentMetadata } from "jolli-common";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock Date to ensure consistent test results
const mockDate = new Date("2024-01-15T12:00:00Z");

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(mockDate);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("generateDocusaurusFromArticles", () => {
	test("generates basic Docusaurus project with single article", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test Article\n\nThis is test content.",
				contentMetadata: {
					title: "Test Article",
					sourceName: "GitHub",
					sourceUrl: "https://github.com/test/repo",
				} as DocContentMetadata,
				updatedAt: new Date("2024-01-10T10:00:00Z"),
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");

		// Should generate 7 files
		expect(files).toHaveLength(7);
		expect(files.map(f => f.path)).toEqual([
			"docs/intro.md",
			"docs/test-article.md",
			"sidebars.js",
			"docusaurus.config.js",
			"package.json",
			"src/css/custom.css",
			"static/img/.gitkeep",
		]);
	});

	test("generates project with multiple articles", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Article One",
				contentMetadata: {
					title: "Article One",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: "# Article Two",
				contentMetadata: {
					title: "Article Two",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 3,
				content: "# Article Three",
				contentMetadata: {
					title: "Article Three",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "multi-site", "Multi Site");

		// Should generate 9 files (intro + 3 articles + 5 config files)
		expect(files).toHaveLength(9);
		expect(files.filter(f => f.path.startsWith("docs/"))).toHaveLength(4); // intro + 3 articles
	});

	test("generates intro page with correct article count", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: { title: "Article 1" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: "Content",
				contentMetadata: { title: "Article 2" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const introFile = files.find(f => f.path === "docs/intro.md");

		expect(introFile).toBeDefined();
		expect(introFile?.content).toContain("This documentation site contains 2 articles.");
		expect(introFile?.content).toContain("Welcome to Test Site");
		expect(introFile?.content).toContain(`*Last generated: ${mockDate.toISOString()}*`);
	});

	test("generates intro page with singular article count", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: { title: "Single Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const introFile = files.find(f => f.path === "docs/intro.md");

		expect(introFile?.content).toContain("This documentation site contains 1 article.");
	});

	test("generates article page with valid source URL", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Article Content",
				contentMetadata: {
					title: "Test Article",
					sourceName: "GitHub Repo",
					sourceUrl: "https://github.com/test/repo",
				} as DocContentMetadata,
				updatedAt: new Date("2024-01-10T10:00:00Z"),
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test-article.md");

		expect(articleFile).toBeDefined();
		expect(articleFile?.content).toContain('title: "Test Article"');
		expect(articleFile?.content).toContain('description: "From GitHub Repo"');
		expect(articleFile?.content).toContain("**Source:** [GitHub Repo](https://github.com/test/repo)");
		expect(articleFile?.content).toContain("**Last Updated:**");
		expect(articleFile?.content).toContain("# Article Content");
	});

	test("generates article page without link for invalid vscode:// URL", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: "Test Article",
					sourceName: "VSCode File",
					sourceUrl: "vscode://file\\d:\\path\\to\\file.ts",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test-article.md");

		expect(articleFile?.content).toContain("**Source:** VSCode File");
		expect(articleFile?.content).not.toContain("[VSCode File]");
		expect(articleFile?.content).not.toContain("vscode://");
	});

	test("generates article page without link for vscode:// URL with Windows path backslashes", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: "Test Article",
					sourceName: "VSCode File",
					// Valid vscode URL format but contains backslashes (Windows path)
					sourceUrl: "vscode://file/d:/path/to\\file.ts",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test-article.md");

		// Should not include link because URL contains backslashes
		expect(articleFile?.content).toContain("**Source:** VSCode File");
		expect(articleFile?.content).not.toContain("[VSCode File]");
	});

	test("generates article page without link for invalid URL", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: "Test Article",
					sourceName: "Invalid Source",
					sourceUrl: "not-a-valid-url",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test-article.md");

		expect(articleFile?.content).toContain("**Source:** Invalid Source");
		expect(articleFile?.content).not.toContain("[Invalid Source]");
	});

	test("generates article page with http URL", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: "Test",
					sourceName: "HTTP Source",
					sourceUrl: "http://example.com/article",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test.md");

		expect(articleFile?.content).toContain("**Source:** [HTTP Source](http://example.com/article)");
	});

	test("generates article page with ftp URL", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: "Test",
					sourceName: "FTP Source",
					sourceUrl: "ftp://ftp.example.com/file.txt",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test.md");

		expect(articleFile?.content).toContain("**Source:** [FTP Source](ftp://ftp.example.com/file.txt)");
	});

	test("generates article page without metadata when not provided", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Simple Content",
				contentMetadata: {
					title: "Simple Article",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/simple-article.md");

		expect(articleFile?.content).toContain('title: "Simple Article"');
		expect(articleFile?.content).not.toContain("**Source:**");
		expect(articleFile?.content).not.toContain("**Last Updated:**");
		expect(articleFile?.content).toContain("# Simple Content");
	});

	test("handles article without contentMetadata", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Content",
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/untitled-article.md");

		expect(articleFile).toBeDefined();
		expect(articleFile?.content).toContain('title: "Untitled Article"');
	});

	test("slugifies article titles correctly", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: { title: "My Article with Spaces & Special!!" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: "Content",
				contentMetadata: { title: "Multiple   Spaces   Here" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 3,
				content: "Content",
				contentMetadata: { title: "---Leading-and-Trailing---" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");

		expect(files.some(f => f.path === "docs/my-article-with-spaces-special.md")).toBe(true);
		expect(files.some(f => f.path === "docs/multiple-spaces-here.md")).toBe(true);
		expect(files.some(f => f.path === "docs/leading-and-trailing.md")).toBe(true);
	});

	test("generates valid docusaurus.config.js", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "my-docs", "My Documentation");
		const configFile = files.find(f => f.path === "docusaurus.config.js");

		expect(configFile).toBeDefined();
		expect(configFile?.content).toContain("title: 'My Documentation'");
		expect(configFile?.content).toContain("tagline: 'Documentation generated by Jolli'");
		expect(configFile?.content).toContain("url: 'https://my-docs.vercel.app'");
		expect(configFile?.content).toContain("organizationName: 'Jolli-sample-repos'");
		expect(configFile?.content).toContain("projectName: 'my-docs'");
	});

	test("escapes special characters in config", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "test", "Site with 'quotes' and \"double\"");
		const configFile = files.find(f => f.path === "docusaurus.config.js");

		expect(configFile?.content).toContain("\\'");
		expect(configFile?.content).toContain('\\"');
	});

	test("generates valid sidebars.js with all articles", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content 1",
				contentMetadata: { title: "First Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: "Content 2",
				contentMetadata: { title: "Second Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const sidebarFile = files.find(f => f.path === "sidebars.js");

		expect(sidebarFile).toBeDefined();
		expect(sidebarFile?.content).toContain('"intro"');
		expect(sidebarFile?.content).toContain('"first-article"');
		expect(sidebarFile?.content).toContain('"second-article"');
	});

	test("generates valid package.json", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "my-site-name", "Display Name");
		const packageFile = files.find(f => f.path === "package.json");

		expect(packageFile).toBeDefined();
		const pkg = JSON.parse(packageFile?.content || "{}");
		expect(pkg.name).toBe("my-site-name");
		expect(pkg.version).toBe("1.0.0");
		expect(pkg.private).toBe(true);
		expect(pkg.dependencies).toHaveProperty("@docusaurus/core");
		expect(pkg.dependencies).toHaveProperty("react");
		expect(pkg.scripts).toHaveProperty("build");
		expect(pkg.engines.node).toBe(">=18.0");
	});

	test("generates custom CSS file", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const cssFile = files.find(f => f.path === "src/css/custom.css");

		expect(cssFile).toBeDefined();
		expect(cssFile?.content).toContain(":root");
		expect(cssFile?.content).toContain("--ifm-color-primary");
		expect(cssFile?.content).toContain("[data-theme='dark']");
	});

	test("generates .gitkeep file", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const gitkeepFile = files.find(f => f.path === "static/img/.gitkeep");

		expect(gitkeepFile).toBeDefined();
		expect(gitkeepFile?.content).toContain("Static Assets");
	});

	test("escapes YAML special characters in frontmatter", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: 'Article with "quotes" and\nNewlines',
					sourceName: 'Source with "quotes"',
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path.startsWith("docs/article-with"));

		expect(articleFile?.content).toContain('\\"');
		// Check that the title in frontmatter has newlines replaced with spaces
		expect(articleFile?.content).toContain('title: "Article with \\"quotes\\" and Newlines"');
		expect(articleFile?.content).toContain('description: "From Source with \\"quotes\\""');
	});

	test("handles empty articles array", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "empty-site", "Empty Site");

		// Should still generate all necessary files
		expect(files).toHaveLength(6); // intro + 5 config files (no article files)
		expect(files.map(f => f.path)).toContain("docs/intro.md");
		expect(files.map(f => f.path)).toContain("docusaurus.config.js");
	});

	test("handles article with only updatedAt", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: { title: "Test" } as DocContentMetadata,
				updatedAt: new Date("2024-01-10T10:00:00Z"),
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test.md");

		expect(articleFile?.content).toContain("**Last Updated:**");
	});

	test("handles article with sourceName but no sourceUrl", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: "Test",
					sourceName: "Just a Name",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test.md");

		expect(articleFile?.content).toContain("**Source:** Just a Name");
		expect(articleFile?.content).not.toContain("[Just a Name]");
	});

	test("handles article with sourceUrl but no sourceName", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: "Test",
					sourceUrl: "https://example.com",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "docs/test.md");

		expect(articleFile?.content).toContain("**Source:** [View Source](https://example.com)");
	});

	test("generates correct file structure for complex project", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Getting started guide",
				contentMetadata: { title: "Getting Started" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: "API documentation",
				contentMetadata: { title: "API Reference" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 3,
				content: "Examples and tutorials",
				contentMetadata: { title: "Examples" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "complex-docs", "Complex Documentation");

		expect(files).toHaveLength(9); // intro + 3 articles + 5 config files

		// Verify all expected files exist
		const paths = files.map(f => f.path);
		expect(paths).toContain("docs/intro.md");
		expect(paths).toContain("docs/getting-started.md");
		expect(paths).toContain("docs/api-reference.md");
		expect(paths).toContain("docs/examples.md");
		expect(paths).toContain("docusaurus.config.js");
		expect(paths).toContain("sidebars.js");
		expect(paths).toContain("package.json");
		expect(paths).toContain("src/css/custom.css");
		expect(paths).toContain("static/img/.gitkeep");
	});

	test("includes authentication dependencies when allowedDomain is provided", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site", {
			allowedDomain: "example.com",
		});
		const packageFile = files.find(f => f.path === "package.json");

		expect(packageFile).toBeDefined();
		const pkg = JSON.parse(packageFile?.content || "{}");
		expect(pkg.dependencies).toHaveProperty("@auth0/auth0-react");
	});

	test("does not include authentication dependencies when allowedDomain is not provided", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const packageFile = files.find(f => f.path === "package.json");

		expect(packageFile).toBeDefined();
		const pkg = JSON.parse(packageFile?.content || "{}");
		expect(pkg.dependencies).not.toHaveProperty("@auth0/auth0-react");
	});

	test("generates auth files when allowedDomain is provided", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site", {
			allowedDomain: "example.com",
		});

		const paths = files.map(f => f.path);
		expect(paths).toContain("src/theme/Root.js");

		const rootFile = files.find(f => f.path === "src/theme/Root.js");
		expect(rootFile?.content).toContain("@auth0/auth0-react");
		expect(rootFile?.content).toContain("example.com");
	});

	test("does not generate auth files when allowedDomain is not provided", () => {
		const articles: Array<Doc> = [];
		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");

		const paths = files.map(f => f.path);
		expect(paths).not.toContain("src/theme/Root.js");
	});

	test("regeneration mode generates only MD files (no config or navigation)", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test Article",
				contentMetadata: { title: "Test Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: "# Another Article",
				contentMetadata: { title: "Another Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
		});

		// Should generate only intro and article MD files
		expect(files).toHaveLength(3); // intro.md + 2 articles (NO sidebars.js)
		const paths = files.map(f => f.path);

		// Should contain only MD files
		expect(paths).toContain("docs/intro.md");
		expect(paths).toContain("docs/test-article.md");
		expect(paths).toContain("docs/another-article.md");

		// Should NOT contain navigation or config files (preserved from repo)
		expect(paths).not.toContain("sidebars.js"); // Navigation preserved
		expect(paths).not.toContain("docusaurus.config.js");
		expect(paths).not.toContain("package.json");
		expect(paths).not.toContain("src/css/custom.css");
		expect(paths).not.toContain("static/img/.gitkeep");
	});

	test("regeneration mode does not generate auth files even with allowedDomain", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test",
				contentMetadata: { title: "Test" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
			allowedDomain: "example.com",
		});

		const paths = files.map(f => f.path);
		expect(paths).not.toContain("src/theme/Root.js");
	});

	test("generates OpenAPI documentation for JSON OpenAPI spec", () => {
		const openApiSpec = {
			openapi: "3.0.0",
			info: { title: "My API", version: "1.0.0", description: "API description" },
			paths: {
				"/users": { get: { summary: "Get users" } },
				"/users/{id}": { post: { summary: "Create user" } },
			},
		};
		const jsonContent = JSON.stringify(openApiSpec, null, 2);
		const articles: Array<Doc> = [
			{
				id: 1,
				content: jsonContent,
				contentType: "application/json",
				contentMetadata: { title: "API Spec" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should generate OpenAPI-specific files
		expect(paths).toContain("static/openapi.json");
		expect(paths).toContain("docs/api-spec.md");

		// Check OpenAPI JSON is stored correctly
		const openApiFile = files.find(f => f.path === "static/openapi.json");
		expect(openApiFile?.content).toBe(jsonContent);

		// Check overview page contains API info
		const overviewPage = files.find(f => f.path === "docs/api-spec.md");
		expect(overviewPage?.content).toContain("# My API");
		expect(overviewPage?.content).toContain("API description");
		expect(overviewPage?.content).toContain("Version:** 1.0.0");
		expect(overviewPage?.content).toContain("/users");
		expect(overviewPage?.content).toContain("Get users");
	});

	test("generates regular JSON file for non-OpenAPI JSON content", () => {
		const jsonContent = JSON.stringify({ data: "some data", config: { setting: true } }, null, 2);
		const articles: Array<Doc> = [
			{
				id: 1,
				content: jsonContent,
				contentType: "application/json",
				contentMetadata: { title: "Config File" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const jsonFile = files.find(f => f.path === "docs/config-file.json");

		expect(jsonFile).toBeDefined();
		expect(jsonFile?.content).toBe(jsonContent);
		// Should NOT have Markdown frontmatter
		expect(jsonFile?.content).not.toContain("---");
		expect(jsonFile?.content).not.toContain("title:");

		// Should NOT generate OpenAPI-specific files
		const paths = files.map(f => f.path);
		expect(paths).not.toContain("static/openapi.json");
	});

	test("generates YAML file for application/yaml content type", () => {
		const yamlContent = "openapi: '3.0.0'\ninfo:\n  title: My API";
		const articles: Array<Doc> = [
			{
				id: 1,
				content: yamlContent,
				contentType: "application/yaml",
				contentMetadata: { title: "API Spec YAML" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const yamlFile = files.find(f => f.path === "docs/api-spec-yaml.yaml");

		expect(yamlFile).toBeDefined();
		expect(yamlFile?.content).toBe(yamlContent);
		// Should NOT have Markdown frontmatter
		expect(yamlFile?.content).not.toContain("<!-- Build timestamp:");
	});

	test("generates MD file for text/markdown content type", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Markdown Content",
				contentType: "text/markdown",
				contentMetadata: { title: "Markdown Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const mdFile = files.find(f => f.path === "docs/markdown-article.md");

		expect(mdFile).toBeDefined();
		expect(mdFile?.content).toContain("---");
		expect(mdFile?.content).toContain('title: "Markdown Article"');
		expect(mdFile?.content).toContain("# Markdown Content");
	});

	test("generates MD file for undefined content type (default)", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Default Content",
				contentMetadata: { title: "Default Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const mdFile = files.find(f => f.path === "docs/default-article.md");

		expect(mdFile).toBeDefined();
		expect(mdFile?.content).toContain("---");
		expect(mdFile?.content).toContain('title: "Default Article"');
	});

	test("handles mixed content types in same generation", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Markdown Doc",
				contentType: "text/markdown",
				contentMetadata: { title: "Markdown Doc" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: '{"config": true}',
				contentType: "application/json",
				contentMetadata: { title: "JSON Config" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 3,
				content: "config: true",
				contentType: "application/yaml",
				contentMetadata: { title: "YAML Config" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		expect(paths).toContain("docs/markdown-doc.md");
		expect(paths).toContain("docs/json-config.json");
		expect(paths).toContain("docs/yaml-config.yaml");
	});

	test("generates OpenAPI docs with Swagger 2.0 spec", () => {
		const swaggerSpec = {
			swagger: "2.0",
			info: { title: "Swagger API", version: "2.0.0" },
			paths: {
				"/items": { get: { summary: "List items" } },
			},
		};
		const articles: Array<Doc> = [
			{
				id: 1,
				content: JSON.stringify(swaggerSpec, null, 2),
				contentType: "application/json",
				contentMetadata: { title: "Swagger Spec" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should detect Swagger 2.0 as OpenAPI spec
		expect(paths).toContain("static/openapi.json");
		expect(paths).toContain("docs/swagger-spec.md");

		const overviewPage = files.find(f => f.path === "docs/swagger-spec.md");
		expect(overviewPage?.content).toContain("# Swagger API");
	});

	test("handles invalid JSON content gracefully (parseOpenApiSpec catch block)", () => {
		const invalidJson = "{ this is not valid json }";
		const articles: Array<Doc> = [
			{
				id: 1,
				content: invalidJson,
				contentType: "application/json",
				contentMetadata: { title: "Invalid JSON" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");

		// Should fall back to saving as JSON file (not treated as OpenAPI)
		const jsonFile = files.find(f => f.path === "docs/invalid-json.json");
		expect(jsonFile).toBeDefined();
		expect(jsonFile?.content).toBe(invalidJson);

		// Should NOT generate OpenAPI-specific files
		const paths = files.map(f => f.path);
		expect(paths).not.toContain("static/openapi.json");
	});

	test("generates .md extension for unknown content types (default case)", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Some Content",
				contentType: "text/plain", // Unknown content type - should default to .md
				contentMetadata: { title: "Plain Text Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");
		const mdFile = files.find(f => f.path === "docs/plain-text-article.md");

		expect(mdFile).toBeDefined();
		expect(mdFile?.content).toContain('title: "Plain Text Article"');
		expect(mdFile?.content).toContain("# Some Content");
	});

	test("generates endpoint table with dash for endpoints without summary", () => {
		// OpenAPI spec with endpoint that has no summary - should show "-" in table
		const spec = {
			openapi: "3.0.0",
			info: { title: "API Without Summaries", version: "1.0.0" },
			paths: {
				"/users": { get: {} }, // No summary - should show "-"
				"/items": { post: { summary: "Create item" } }, // Has summary
			},
		};
		const articles: Array<Doc> = [
			{
				id: 1,
				content: JSON.stringify(spec, null, 2),
				contentType: "application/json",
				contentMetadata: { title: "No Summary API" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const files = generateDocusaurusFromArticles(articles, "test-site", "Test Site");

		// Check overview page contains dash for missing summary
		const overviewPage = files.find(f => f.path === "docs/no-summary-api.md");
		expect(overviewPage).toBeDefined();
		expect(overviewPage?.content).toContain("| GET | `/users` | - |"); // No summary = dash
		expect(overviewPage?.content).toContain("| POST | `/items` | Create item |"); // Has summary
	});
});
