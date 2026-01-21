import type { OpenApiSpec } from "../types.js";
import {
	detectsAsJson,
	detectsAsYaml,
	escapeYaml,
	generateApiGroupOverviewPage,
	generateApiGroupPage,
	generateApiInteractiveContent,
	generateApiNavigationMeta,
	generateApiOverviewContent,
	generateArticleContent,
	generateIndexContent,
	generateMetaGlobal,
	generateNavMeta,
	getDeletedFilePaths,
	getEffectiveContentType,
	getOrphanedContentFiles,
	groupEndpointsByTag,
	isValidUrl,
	parseOpenApiSpec,
	sanitizeContentForMdx,
	slugify,
	slugifyWithRedirect,
} from "./content.js";
import { describe, expect, it } from "vitest";

describe("isValidUrl", () => {
	it("should accept valid HTTP URLs", () => {
		expect(isValidUrl("http://example.com")).toBe(true);
		expect(isValidUrl("https://example.com")).toBe(true);
		expect(isValidUrl("https://example.com/path?query=value")).toBe(true);
	});

	it("should accept FTP URLs", () => {
		expect(isValidUrl("ftp://files.example.com")).toBe(true);
	});

	it("should reject invalid URLs", () => {
		expect(isValidUrl("not-a-url")).toBe(false);
		expect(isValidUrl("")).toBe(false);
		expect(isValidUrl("javascript:alert(1)")).toBe(false);
	});

	it("should reject vscode:// URLs with Windows paths", () => {
		expect(isValidUrl("vscode://file/C:\\path\\file.txt")).toBe(false);
	});
});

describe("slugify", () => {
	it("should convert spaces to hyphens", () => {
		expect(slugify("Hello World")).toBe("hello-world");
	});

	it("should remove special characters", () => {
		expect(slugify("Hello, World!")).toBe("hello-world");
	});

	it("should handle multiple spaces and hyphens", () => {
		expect(slugify("Hello   World---Test")).toBe("hello-world-test");
	});

	it("should remove leading and trailing hyphens", () => {
		expect(slugify("--Hello World--")).toBe("hello-world");
	});

	it("should convert to lowercase", () => {
		expect(slugify("HELLO WORLD")).toBe("hello-world");
	});

	it("should append -doc suffix for JavaScript reserved words", () => {
		expect(slugify("import")).toBe("import-doc");
		expect(slugify("export")).toBe("export-doc");
		expect(slugify("class")).toBe("class-doc");
		expect(slugify("const")).toBe("const-doc");
		expect(slugify("function")).toBe("function-doc");
	});

	it("should append -doc suffix for TypeScript keywords", () => {
		expect(slugify("interface")).toBe("interface-doc");
		expect(slugify("type")).toBe("type-doc");
		expect(slugify("namespace")).toBe("namespace-doc");
		expect(slugify("readonly")).toBe("readonly-doc");
	});

	it("should append -doc suffix for problematic identifiers", () => {
		expect(slugify("__proto__")).toBe("__proto__-doc");
		expect(slugify("prototype")).toBe("prototype-doc");
		expect(slugify("constructor")).toBe("constructor-doc");
		expect(slugify("index")).toBe("index-doc");
	});

	it("should append -doc suffix for slugs starting with digits", () => {
		expect(slugify("2024-plan")).toBe("2024-plan-doc");
		expect(slugify("123")).toBe("123-doc");
		expect(slugify("1st-article")).toBe("1st-article-doc");
	});

	it("should return untitled-doc for empty result after sanitization", () => {
		expect(slugify("!!!")).toBe("untitled-doc");
		expect(slugify("@#$%")).toBe("untitled-doc");
		expect(slugify("   ")).toBe("untitled-doc");
	});

	it("should not modify normal slugs", () => {
		expect(slugify("getting-started")).toBe("getting-started");
		expect(slugify("api-reference")).toBe("api-reference");
		expect(slugify("installation")).toBe("installation");
		expect(slugify("configuration")).toBe("configuration");
	});
});

describe("slugifyWithRedirect", () => {
	it("should return needsRedirect=false for normal slugs", () => {
		const result = slugifyWithRedirect("Getting Started");
		expect(result.slug).toBe("getting-started");
		expect(result.originalSlug).toBe("getting-started");
		expect(result.needsRedirect).toBe(false);
	});

	it("should return needsRedirect=true for reserved words", () => {
		const result = slugifyWithRedirect("import");
		expect(result.slug).toBe("import-doc");
		expect(result.originalSlug).toBe("import");
		expect(result.needsRedirect).toBe(true);
	});

	it("should return needsRedirect=true for TypeScript keywords", () => {
		const result = slugifyWithRedirect("interface");
		expect(result.slug).toBe("interface-doc");
		expect(result.originalSlug).toBe("interface");
		expect(result.needsRedirect).toBe(true);
	});

	it("should return needsRedirect=true for slugs starting with digits", () => {
		const result = slugifyWithRedirect("2024 Plan");
		expect(result.slug).toBe("2024-plan-doc");
		expect(result.originalSlug).toBe("2024-plan");
		expect(result.needsRedirect).toBe(true);
	});

	it("should return needsRedirect=true for empty slugs", () => {
		const result = slugifyWithRedirect("!!!");
		expect(result.slug).toBe("untitled-doc");
		expect(result.originalSlug).toBe("");
		expect(result.needsRedirect).toBe(true);
	});

	it("should handle titles that become reserved words after slugification", () => {
		const result = slugifyWithRedirect("Import Guide");
		// "Import Guide" becomes "import-guide" which is not reserved
		expect(result.slug).toBe("import-guide");
		expect(result.originalSlug).toBe("import-guide");
		expect(result.needsRedirect).toBe(false);
	});
});

describe("detectsAsJson", () => {
	it("should detect JSON objects", () => {
		expect(detectsAsJson('{"key": "value"}')).toBe(true);
		expect(detectsAsJson('  { "key": "value" }  ')).toBe(true);
	});

	it("should not detect non-JSON content", () => {
		expect(detectsAsJson("# Markdown")).toBe(false);
		expect(detectsAsJson("openapi: 3.0.0")).toBe(false);
		expect(detectsAsJson("[1, 2, 3]")).toBe(false);
	});
});

describe("detectsAsYaml", () => {
	it("should detect OpenAPI YAML content", () => {
		expect(detectsAsYaml("openapi: 3.0.0")).toBe(true);
		expect(detectsAsYaml("swagger: 2.0")).toBe(true);
	});

	it("should not detect generic YAML patterns to avoid MDX misdetection", () => {
		// Previously these were detected as YAML, but they could be MDX content
		expect(detectsAsYaml("---\nkey: value")).toBe(false);
		expect(detectsAsYaml("key: value")).toBe(false);
		expect(detectsAsYaml("title: My Document")).toBe(false);
	});

	it("should not detect JSON as YAML", () => {
		expect(detectsAsYaml('{"key": "value"}')).toBe(false);
		expect(detectsAsYaml("[1, 2, 3]")).toBe(false);
	});

	it("should not detect markdown as YAML", () => {
		expect(detectsAsYaml("# Markdown")).toBe(false);
	});
});

describe("getEffectiveContentType", () => {
	it("should trust declared JSON content type", () => {
		expect(getEffectiveContentType("# Markdown", "application/json")).toBe("application/json");
	});

	it("should trust declared YAML content type", () => {
		expect(getEffectiveContentType("# Markdown", "application/yaml")).toBe("application/yaml");
	});

	it("should detect JSON from content when type is undefined", () => {
		expect(getEffectiveContentType('{"key": "value"}', undefined)).toBe("application/json");
	});

	it("should detect YAML from content when type is undefined", () => {
		expect(getEffectiveContentType("openapi: 3.0.0", undefined)).toBe("application/yaml");
	});

	it("should detect JSON even if declared as markdown", () => {
		expect(getEffectiveContentType('{"key": "value"}', "text/markdown")).toBe("application/json");
	});

	it("should return default markdown for non-structured content", () => {
		expect(getEffectiveContentType("# Hello World", undefined)).toBe("text/markdown");
		expect(getEffectiveContentType("Some text", "text/markdown")).toBe("text/markdown");
	});
});

describe("parseOpenApiSpec", () => {
	const validOpenApiJson = JSON.stringify({
		openapi: "3.0.0",
		info: { title: "Test API", version: "1.0.0" },
		paths: {},
	});

	it("should parse valid OpenAPI JSON", () => {
		const result = parseOpenApiSpec(validOpenApiJson, "application/json");
		expect(result).not.toBeNull();
		expect(result?.openapi).toBe("3.0.0");
	});

	it("should return null for non-OpenAPI content", () => {
		expect(parseOpenApiSpec("# Markdown", "text/markdown")).toBeNull();
		expect(parseOpenApiSpec('{"key": "value"}', "application/json")).toBeNull();
	});

	it("should detect and parse JSON even with wrong content type", () => {
		const result = parseOpenApiSpec(validOpenApiJson, "text/markdown");
		expect(result).not.toBeNull();
		expect(result?.openapi).toBe("3.0.0");
	});

	it("should return null for invalid OpenAPI", () => {
		const invalidSpec = JSON.stringify({ openapi: "invalid", info: {} });
		expect(parseOpenApiSpec(invalidSpec, "application/json")).toBeNull();
	});
});

describe("escapeYaml", () => {
	it("should return string unchanged if no special chars", () => {
		expect(escapeYaml("Simple Title")).toBe("Simple Title");
	});

	it("should wrap string with colons in quotes", () => {
		expect(escapeYaml("Title: Subtitle")).toBe('"Title: Subtitle"');
	});

	it("should escape quotes inside the string", () => {
		expect(escapeYaml('Title "with quotes"')).toBe('"Title \\"with quotes\\""');
	});

	it("should wrap strings with special YAML chars", () => {
		expect(escapeYaml("Key: [value]")).toBe('"Key: [value]"');
		expect(escapeYaml("Hash#tag")).toBe('"Hash#tag"');
	});

	it("should wrap strings starting with digits", () => {
		expect(escapeYaml("2024")).toBe('"2024"');
		expect(escapeYaml("2024 Plan")).toBe('"2024 Plan"');
		expect(escapeYaml("1st Article")).toBe('"1st Article"');
		expect(escapeYaml("3.14 Pi")).toBe('"3.14 Pi"');
	});

	it("should wrap YAML special values", () => {
		expect(escapeYaml("true")).toBe('"true"');
		expect(escapeYaml("false")).toBe('"false"');
		expect(escapeYaml("null")).toBe('"null"');
		expect(escapeYaml("yes")).toBe('"yes"');
		expect(escapeYaml("no")).toBe('"no"');
		expect(escapeYaml("on")).toBe('"on"');
		expect(escapeYaml("off")).toBe('"off"');
		expect(escapeYaml("~")).toBe('"~"');
	});

	it("should handle YAML special values case-insensitively", () => {
		expect(escapeYaml("True")).toBe('"True"');
		expect(escapeYaml("FALSE")).toBe('"FALSE"');
		expect(escapeYaml("NULL")).toBe('"NULL"');
		expect(escapeYaml("Yes")).toBe('"Yes"');
	});

	it("should not wrap strings that merely contain special value words", () => {
		expect(escapeYaml("This is true")).toBe("This is true");
		expect(escapeYaml("Say yes to this")).toBe("Say yes to this");
		expect(escapeYaml("The null hypothesis")).toBe("The null hypothesis");
	});
});

describe("sanitizeContentForMdx", () => {
	it("should convert HTML comments to MDX comments", () => {
		expect(sanitizeContentForMdx("<!-- comment -->")).toBe("{/* comment */}");
	});

	it("should handle multiline comments", () => {
		const input = "<!-- multi\nline\ncomment -->";
		const expected = "{/* multi\nline\ncomment */}";
		expect(sanitizeContentForMdx(input)).toBe(expected);
	});

	it("should preserve non-comment content", () => {
		expect(sanitizeContentForMdx("# Hello World")).toBe("# Hello World");
	});
});

describe("generateApiOverviewContent", () => {
	const spec = {
		openapi: "3.0.0",
		info: {
			title: "Test API",
			version: "1.0.0",
			description: "A test API",
		},
		paths: {
			"/users": {
				get: { summary: "Get users" },
				post: { summary: "Create user" },
			},
		},
	};

	it("should generate overview page with title", () => {
		const content = generateApiOverviewContent(spec, "My API");
		expect(content).toContain("title: My API");
		expect(content).toContain("# Test API");
	});

	it("should include endpoints table", () => {
		const content = generateApiOverviewContent(spec, "My API");
		expect(content).toContain("| GET | `/users`");
		expect(content).toContain("| POST | `/users`");
	});

	it("should include version and description", () => {
		const content = generateApiOverviewContent(spec, "My API");
		expect(content).toContain("**Version:** 1.0.0");
		expect(content).toContain("A test API");
	});
});

describe("generateApiInteractiveContent", () => {
	it("should generate interactive page with ApiReference component", () => {
		const content = generateApiInteractiveContent("My API", "my-api.json");
		expect(content).toContain("import ApiReference from '../../components/ApiReference'");
		expect(content).toContain('specUrl="/my-api.json"');
		expect(content).toContain("# My API - Interactive");
	});
});

describe("generateArticleContent", () => {
	it("should generate MDX with frontmatter", () => {
		const article = {
			content: "# Hello World",
			contentMetadata: { title: "Test Article" },
		};
		const content = generateArticleContent(article);
		expect(content).toContain("---");
		expect(content).toContain("title: Test Article");
		expect(content).toContain("# Hello World");
	});

	it("should include source info when available", () => {
		const article = {
			content: "Content here",
			contentMetadata: {
				title: "Test",
				sourceName: "GitHub",
				sourceUrl: "https://github.com/example",
			},
		};
		const content = generateArticleContent(article);
		expect(content).toContain("**Source:** [GitHub](https://github.com/example)");
	});

	it("should show source name without link if URL is invalid", () => {
		const article = {
			content: "Content here",
			contentMetadata: {
				title: "Test",
				sourceName: "Local",
				sourceUrl: "not-a-url",
			},
		};
		const content = generateArticleContent(article);
		expect(content).toContain("**Source:** Local");
		expect(content).not.toContain("[Local]");
	});

	it("should include updatedAt date", () => {
		const article = {
			content: "Content",
			contentMetadata: { title: "Test" },
			updatedAt: new Date("2024-01-15"),
		};
		const content = generateArticleContent(article);
		expect(content).toContain("**Last Updated:**");
	});

	it("should sanitize HTML comments to MDX", () => {
		const article = {
			content: "<!-- comment -->",
			contentMetadata: { title: "Test" },
		};
		const content = generateArticleContent(article);
		expect(content).toContain("{/* comment */}");
	});

	it("should handle missing metadata gracefully", () => {
		const article = { content: "Just content" };
		const content = generateArticleContent(article);
		expect(content).toContain("title: Untitled Article");
	});
});

describe("generateIndexContent", () => {
	it("should generate index page with article count", () => {
		const content = generateIndexContent(5, "My Docs");
		expect(content).toContain("title: My Docs");
		expect(content).toContain("Welcome to My Docs");
		expect(content).toContain("5 articles");
	});

	it("should handle singular article", () => {
		const content = generateIndexContent(1, "My Docs");
		expect(content).toContain("1 article");
		expect(content).not.toContain("1 articles");
	});
});

describe("generateNavMeta", () => {
	it("should generate navigation meta from articles with hidden index", () => {
		const articles = [
			{ content: "", contentMetadata: { title: "Getting Started" } },
			{ content: "", contentMetadata: { title: "API Reference" } },
		];
		const meta = generateNavMeta(articles);
		// JOLLI-191: Hidden index entry is included (Nextra shows "Index" by default even without file)
		expect(meta).toEqual({
			index: { display: "hidden" },
			"getting-started": "Getting Started",
			"api-reference": "API Reference",
		});
	});

	it("should handle articles without titles", () => {
		const articles = [{ content: "" }];
		const meta = generateNavMeta(articles);
		expect(meta["untitled-article"]).toBe("Untitled Article");
	});

	it("should add consolidated API Reference entry for single spec (JOLLI-192)", () => {
		const articles = [{ content: "", contentMetadata: { title: "Getting Started" } }];
		const openApiSpecs = [{ name: "petstore", specPath: "/petstore.json", title: "Petstore API" }];

		const meta = generateNavMeta(articles, openApiSpecs);

		// Regular article should be present
		expect(meta["getting-started"]).toBe("Getting Started");

		// JOLLI-192: Single spec creates a simple page link
		expect(meta["api-reference"]).toEqual({
			title: "API Reference",
			type: "page",
			href: "/api-docs/petstore",
		});
	});

	it("should add consolidated API Reference menu for multiple specs (JOLLI-192)", () => {
		const articles = [{ content: "", contentMetadata: { title: "Getting Started" } }];
		const openApiSpecs = [
			{ name: "petstore", specPath: "/petstore.json", title: "Petstore API" },
			{ name: "users", specPath: "/users.yaml", title: "Users Service" },
		];

		const meta = generateNavMeta(articles, openApiSpecs);

		// Regular article should be present
		expect(meta["getting-started"]).toBe("Getting Started");

		// JOLLI-192: Multiple specs create a menu dropdown
		expect(meta["api-reference"]).toEqual({
			title: "API Reference",
			type: "menu",
			items: {
				petstore: { title: "Petstore API", href: "/api-docs/petstore" },
				users: { title: "Users Service", href: "/api-docs/users" },
			},
		});
	});

	it("should use fallback title when spec title is empty", () => {
		const meta = generateNavMeta([], [{ name: "myapi", specPath: "/myapi.json", title: "" }]);
		// Single spec creates a page link with "API Reference" title
		expect(meta["api-reference"]).toEqual({
			title: "API Reference",
			type: "page",
			href: "/api-docs/myapi",
		});
	});

	it("should handle empty openApiSpecs array", () => {
		const articles = [{ content: "", contentMetadata: { title: "Test" } }];
		const meta = generateNavMeta(articles, []);

		// JOLLI-191: Hidden index + article
		expect(Object.keys(meta)).toEqual(["index", "test"]);
		expect(meta.index).toEqual({ display: "hidden" });
	});

	it("should handle undefined openApiSpecs", () => {
		const articles = [{ content: "", contentMetadata: { title: "Test" } }];
		const meta = generateNavMeta(articles, undefined);

		// JOLLI-191: Hidden index + article
		expect(Object.keys(meta)).toEqual(["index", "test"]);
		expect(meta.index).toEqual({ display: "hidden" });
	});
});

describe("groupEndpointsByTag", () => {
	it("should group endpoints by their tags", () => {
		const spec = {
			openapi: "3.0.0",
			info: { title: "Test API", version: "1.0.0" },
			paths: {
				"/users": {
					get: { summary: "Get users", tags: ["Users"] },
					post: { summary: "Create user", tags: ["Users"] },
				},
				"/products": {
					get: { summary: "Get products", tags: ["Products"] },
				},
			},
		};

		const groups = groupEndpointsByTag(spec);
		expect(groups).toHaveLength(2);

		const usersGroup = groups.find(g => g.tag === "Users");
		expect(usersGroup).toBeDefined();
		expect(usersGroup?.endpoints).toHaveLength(2);
		expect(usersGroup?.slug).toBe("users");

		const productsGroup = groups.find(g => g.tag === "Products");
		expect(productsGroup).toBeDefined();
		expect(productsGroup?.endpoints).toHaveLength(1);
	});

	it("should derive tags from path when no tags are defined", () => {
		const spec = {
			openapi: "3.0.0",
			info: { title: "Test API", version: "1.0.0" },
			paths: {
				"/tenants/{id}": {
					get: { summary: "Get tenant" },
					delete: { summary: "Delete tenant" },
				},
				"/providers": {
					get: { summary: "Get providers" },
				},
			},
		};

		const groups = groupEndpointsByTag(spec);
		expect(groups).toHaveLength(2);

		const tenantsGroup = groups.find(g => g.tag === "Tenants");
		expect(tenantsGroup).toBeDefined();
		expect(tenantsGroup?.endpoints).toHaveLength(2);

		const providersGroup = groups.find(g => g.tag === "Providers");
		expect(providersGroup).toBeDefined();
		expect(providersGroup?.endpoints).toHaveLength(1);
	});

	it("should use 'General' for paths with no meaningful segments", () => {
		const spec = {
			openapi: "3.0.0",
			info: { title: "Test API", version: "1.0.0" },
			paths: {
				"/{id}": {
					get: { summary: "Get by ID" },
				},
			},
		};

		const groups = groupEndpointsByTag(spec);
		expect(groups).toHaveLength(1);
		expect(groups[0].tag).toBe("General");
	});

	it("should return empty array for spec without paths", () => {
		const spec = {
			openapi: "3.0.0",
			info: { title: "Test API", version: "1.0.0" },
		};

		const groups = groupEndpointsByTag(spec);
		expect(groups).toHaveLength(0);
	});

	it("should sort groups alphabetically by tag", () => {
		const spec = {
			openapi: "3.0.0",
			info: { title: "Test API", version: "1.0.0" },
			paths: {
				"/zebras": { get: { summary: "Get zebras", tags: ["Zebras"] } },
				"/apples": { get: { summary: "Get apples", tags: ["Apples"] } },
				"/middle": { get: { summary: "Get middle", tags: ["Middle"] } },
			},
		};

		const groups = groupEndpointsByTag(spec as OpenApiSpec);
		expect(groups[0].tag).toBe("Apples");
		expect(groups[1].tag).toBe("Middle");
		expect(groups[2].tag).toBe("Zebras");
	});
});

describe("generateApiGroupPage", () => {
	it("should generate MDX page with endpoint details", () => {
		const group = {
			tag: "Users",
			slug: "users",
			endpoints: [
				{
					method: "GET",
					path: "/users",
					summary: "Get all users",
					description: "",
					tags: ["Users"],
				},
				{
					method: "POST",
					path: "/users",
					summary: "Create a user",
					description: "",
					operationId: "createUser",
					tags: ["Users"],
				},
			],
		};

		const content = generateApiGroupPage(group, "My API");
		expect(content).toContain("title: Users");
		expect(content).toContain("# Users");
		expect(content).toContain("GET");
		expect(content).toContain("`/users`");
		expect(content).toContain("Get all users");
		expect(content).toContain("POST");
		expect(content).toContain("Create a user");
		expect(content).toContain("`createUser`");
	});

	it("should show 'No description available' for endpoints without summary", () => {
		const group = {
			tag: "Empty",
			slug: "empty",
			endpoints: [
				{
					method: "GET",
					path: "/empty",
					summary: "",
					description: "",
					tags: ["Empty"],
				},
			],
		};

		const content = generateApiGroupPage(group, "API");
		expect(content).toContain("No description available");
	});
});

describe("generateApiNavigationMeta", () => {
	it("should generate _meta.js content with all groups", () => {
		const groups = [
			{ tag: "Users", slug: "users", endpoints: [] },
			{ tag: "Products", slug: "products", endpoints: [] },
		];

		const content = generateApiNavigationMeta(groups);
		expect(content).toContain("export default");
		expect(content).toContain('"index": "Overview"');
		expect(content).toContain('"users": "Users"');
		expect(content).toContain('"products": "Products"');
		expect(content).toContain('"interactive": "Interactive API"');
	});

	it("should exclude overview when includeOverview is false", () => {
		const groups = [{ tag: "Users", slug: "users", endpoints: [] }];

		const content = generateApiNavigationMeta(groups, false, true);
		expect(content).not.toContain('"index": "Overview"');
		expect(content).toContain('"users": "Users"');
		expect(content).toContain('"interactive": "Interactive API"');
	});

	it("should exclude interactive when includeInteractive is false", () => {
		const groups = [{ tag: "Users", slug: "users", endpoints: [] }];

		const content = generateApiNavigationMeta(groups, true, false);
		expect(content).toContain('"index": "Overview"');
		expect(content).toContain('"users": "Users"');
		expect(content).not.toContain('"interactive": "Interactive API"');
	});
});

describe("generateApiGroupOverviewPage", () => {
	it("should generate overview page with all group links", () => {
		const spec = {
			openapi: "3.0.0",
			info: { title: "My API", version: "2.0.0", description: "API description" },
			paths: {},
		};
		const groups = [
			{
				tag: "Users",
				slug: "users",
				endpoints: [
					{ method: "GET", path: "/users", summary: "", description: "", tags: ["Users"] },
					{ method: "POST", path: "/users", summary: "", description: "", tags: ["Users"] },
				],
			},
			{
				tag: "Products",
				slug: "products",
				endpoints: [{ method: "GET", path: "/products", summary: "", description: "", tags: ["Products"] }],
			},
		];

		const content = generateApiGroupOverviewPage(spec, "API Reference", groups);
		expect(content).toContain("title: API Reference");
		expect(content).toContain("# My API");
		expect(content).toContain("API description");
		expect(content).toContain("**Version:** 2.0.0");
		expect(content).toContain("**3** endpoints");
		expect(content).toContain("**2** groups");
		expect(content).toContain("[**Users**](./users)");
		expect(content).toContain("2 endpoints");
		expect(content).toContain("[**Products**](./products)");
		expect(content).toContain("1 endpoint");
	});

	it("should handle spec without info", () => {
		const spec = {
			openapi: "3.0.0",
			paths: {},
		};
		const groups = [{ tag: "Test", slug: "test", endpoints: [] }];

		const content = generateApiGroupOverviewPage(spec, "API", groups);
		expect(content).toContain("# API");
		expect(content).toContain("**Version:** 1.0.0");
	});
});

describe("getDeletedFilePaths", () => {
	it("should return MDX and fallback YAML/JSON paths for markdown articles", () => {
		// Also deletes .yaml and .json variants in case file was previously saved with wrong extension
		const articles = [{ title: "Getting Started", contentType: "text/markdown" }];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual([
			"content/getting-started.mdx",
			"content/getting-started.yaml",
			"content/getting-started.json",
		]);
	});

	it("should return public folder paths for known OpenAPI JSON articles", () => {
		const articles = [{ title: "Petstore API", contentType: "application/json", isOpenApi: true }];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual(["public/petstore-api.json", "public/api-docs-petstore-api.html"]);
	});

	it("should return public folder paths for known OpenAPI YAML articles", () => {
		const articles = [{ title: "My API", contentType: "application/yaml", isOpenApi: true }];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual(["public/my-api.yaml", "public/api-docs-my-api.html"]);
	});

	it("should return content folder paths for known non-OpenAPI JSON articles (Nextra 4.x)", () => {
		const articles = [{ title: "Config Data", contentType: "application/json", isOpenApi: false }];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual(["content/config-data.json"]);
	});

	it("should return content folder paths for known non-OpenAPI YAML articles (Nextra 4.x)", () => {
		const articles = [{ title: "Settings", contentType: "application/yaml", isOpenApi: false }];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual(["content/settings.yaml"]);
	});

	it("should return all possible paths for unknown JSON articles (deleted)", () => {
		// When isOpenApi is undefined (deleted articles), we don't know if it was OpenAPI
		const articles = [{ title: "Unknown API", contentType: "application/json" }];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual([
			"public/unknown-api.json",
			"public/api-docs-unknown-api.html",
			"content/unknown-api.json",
		]);
	});

	it("should return all possible paths for unknown YAML articles (deleted)", () => {
		const articles = [{ title: "Unknown Config", contentType: "application/yaml" }];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual([
			"public/unknown-config.yaml",
			"public/api-docs-unknown-config.html",
			"content/unknown-config.yaml",
		]);
	});

	it("should handle multiple articles of different types", () => {
		const articles = [
			{ title: "Getting Started", contentType: "text/markdown" },
			{ title: "Pet Store", contentType: "application/json", isOpenApi: true },
			{ title: "User Config", contentType: "application/yaml", isOpenApi: false },
		];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual([
			"content/getting-started.mdx",
			"content/getting-started.yaml",
			"content/getting-started.json",
			"public/pet-store.json",
			"public/api-docs-pet-store.html",
			"content/user-config.yaml",
		]);
	});

	it("should return empty array for empty input", () => {
		const paths = getDeletedFilePaths([]);
		expect(paths).toEqual([]);
	});

	it("should slugify titles correctly", () => {
		const articles = [{ title: "My Special API: Version 2.0!", contentType: "text/markdown" }];
		const paths = getDeletedFilePaths(articles);
		expect(paths).toEqual([
			"content/my-special-api-version-20.mdx",
			"content/my-special-api-version-20.yaml",
			"content/my-special-api-version-20.json",
		]);
	});
});

describe("generateMetaGlobal", () => {
	it("should generate a valid _meta.global.js content", () => {
		const content = generateMetaGlobal("My Docs Site");
		expect(content).toContain("Global navigation configuration for My Docs Site");
		expect(content).toContain("export default {");
		expect(content).toContain("https://nextra.site/docs/docs-theme/page-configuration");
	});

	it("should include example configuration comments", () => {
		const content = generateMetaGlobal("Test Site");
		expect(content).toContain("// Add global navigation items here");
		expect(content).toContain('title: "Documentation"');
		expect(content).toContain('type: "page"');
	});

	it("should include the display name in the header comment", () => {
		const content = generateMetaGlobal("Acme Corp Docs");
		expect(content).toContain("Global navigation configuration for Acme Corp Docs");
	});
});

describe("getOrphanedContentFiles", () => {
	it("should detect orphaned .yaml files in content folder", () => {
		const existingFiles = ["content/my-article.mdx", "content/orphaned-file.yaml", "content/_meta.ts"];
		const expectedSlugs = ["my-article"];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual(["content/orphaned-file.yaml"]);
	});

	it("should detect orphaned .json files in content folder", () => {
		const existingFiles = ["content/my-article.mdx", "content/wrong-extension.json"];
		const expectedSlugs = ["my-article"];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual(["content/wrong-extension.json"]);
	});

	it("should detect orphaned .mdx files", () => {
		const existingFiles = ["content/current-article.mdx", "content/deleted-article.mdx"];
		const expectedSlugs = ["current-article"];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual(["content/deleted-article.mdx"]);
	});

	it("should not flag files that match expected slugs", () => {
		const existingFiles = ["content/article-one.mdx", "content/article-two.mdx", "content/article-three.yaml"];
		const expectedSlugs = ["article-one", "article-two", "article-three"];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual([]);
	});

	it("should ignore files outside content folder", () => {
		const existingFiles = [
			"public/api-spec.yaml",
			"src/components/App.tsx",
			"package.json",
			"content/my-article.mdx",
		];
		const expectedSlugs = ["my-article"];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual([]);
	});

	it("should ignore _meta files", () => {
		const existingFiles = ["content/_meta.ts", "content/_meta.js", "content/_meta.global.js"];
		const expectedSlugs: Array<string> = [];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual([]);
	});

	it("should ignore index files", () => {
		const existingFiles = ["content/index.mdx", "content/index.md"];
		const expectedSlugs: Array<string> = [];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual([]);
	});

	it("should ignore files in subdirectories", () => {
		const existingFiles = ["content/api/endpoints.mdx", "content/guides/getting-started.mdx"];
		const expectedSlugs: Array<string> = [];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual([]);
	});

	it("should detect multiple orphaned files with different extensions", () => {
		const existingFiles = [
			"content/valid-article.mdx",
			"content/orphan1.yaml",
			"content/orphan2.json",
			"content/orphan3.mdx",
			"content/orphan4.yml",
		];
		const expectedSlugs = ["valid-article"];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual([
			"content/orphan1.yaml",
			"content/orphan2.json",
			"content/orphan3.mdx",
			"content/orphan4.yml",
		]);
	});

	it("should return empty array when no files exist", () => {
		const orphaned = getOrphanedContentFiles([], ["some-article"]);
		expect(orphaned).toEqual([]);
	});

	it("should return empty array when no expected slugs but only meta/index files exist", () => {
		const existingFiles = ["content/_meta.ts", "content/index.mdx"];
		const orphaned = getOrphanedContentFiles(existingFiles, []);
		expect(orphaned).toEqual([]);
	});

	it("should handle .md extension as well as .mdx", () => {
		const existingFiles = ["content/valid.md", "content/orphan.md"];
		const expectedSlugs = ["valid"];

		const orphaned = getOrphanedContentFiles(existingFiles, expectedSlugs);
		expect(orphaned).toEqual(["content/orphan.md"]);
	});
});
