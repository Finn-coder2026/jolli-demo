import type { Doc } from "../model/Doc";
import {
	type ArticleInput,
	buildFolderSlugMapping,
	extractFolderPath,
	formatPreGenerationErrors,
	generateNextraFromArticles,
	getDeletedFilePathsFromChangedArticles,
	remapFolderPaths,
	stripSlugSuffix,
	validateArticlesForGeneration,
} from "./NextraGenerationUtil";
import type { ChangedArticle, DocContentMetadata } from "jolli-common";
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

describe("generateNextraFromArticles", () => {
	test("generates basic Nextra 4.x project with single article", () => {
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");

		// Nextra 4.x uses content/ folder and app/ folder structure
		// JOLLI-191: No content/index.mdx - app/page.tsx redirects to first article instead
		// Should generate 17 files: article + _meta.ts + app/layout + app/globals.css + app/page + app/[...mdxPath]/page (catch-all) + mdx-components + icon + favicon route + pkg + next + ts + gitignore + vercel
		expect(files).toHaveLength(17);
		const paths = files.map(f => f.path);
		expect(paths).toContain("content/test-article.md");
		expect(paths).toContain("content/_meta.ts");
		expect(paths).toContain("app/layout.tsx");
		expect(paths).toContain("app/page.tsx"); // Root redirect page (JOLLI-191)
		expect(paths).toContain("app/[...mdxPath]/page.tsx"); // Catch-all for MDX pages
		expect(paths).toContain("mdx-components.tsx");
		expect(paths).toContain("app/icon.tsx");
		expect(paths).toContain("app/favicon.ico/route.ts");
		expect(paths).toContain("package.json");
		expect(paths).toContain("next.config.mjs");
		expect(paths).toContain("tsconfig.json");
		expect(paths).toContain(".gitignore");
		expect(paths).toContain("vercel.json");
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

		const { files } = generateNextraFromArticles(articles, "multi-site", "Multi Site");

		// Nextra 4.x (JOLLI-191): 3 articles + _meta.ts + app/layout + app/globals.css + app/page + app/[...mdxPath]/page (catch-all) + mdx-components + icon + favicon route + pkg + next + ts + gitignore + vercel = 19
		// No content/index.mdx - app/page.tsx redirects to first article instead
		expect(files).toHaveLength(19);
		expect(files.filter(f => f.path.startsWith("content/"))).toHaveLength(4); // 3 articles + _meta.ts (no index)
	});

	test("generates root redirect page to first article (JOLLI-191)", () => {
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const rootPage = files.find(f => f.path === "app/page.tsx");

		expect(rootPage).toBeDefined();
		// Should redirect to first article (slugified: "article-1")
		expect(rootPage?.content).toContain("redirect('/article-1')");
	});

	test("generates root redirect to single article (JOLLI-191)", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: { title: "Single Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const rootPage = files.find(f => f.path === "app/page.tsx");

		expect(rootPage).toBeDefined();
		// Should redirect to single article (slugified: "single-article")
		expect(rootPage?.content).toContain("redirect('/single-article')");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test-article.md");

		expect(articleFile).toBeDefined();
		expect(articleFile?.content).toContain("title: Test Article");
		expect(articleFile?.content).toContain("description: From GitHub Repo");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test-article.md");

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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test-article.md");

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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test-article.md");

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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test.md");

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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test.md");

		expect(articleFile?.content).toContain("**Source:** [FTP Source](ftp://ftp.example.com/file.txt)");
	});

	test("preserves HTML comments in .md files (lenient parsing)", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Article\n\n<!-- This is a comment -->\n\nContent here.",
				contentMetadata: {
					title: "Test Article",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test-article.md");

		// .md files preserve HTML comments (lenient parsing)
		expect(articleFile?.content).toContain("<!-- This is a comment -->");
		expect(articleFile?.content).not.toContain("{/*");
	});

	test("preserves multiple HTML comments in .md files", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "<!-- Comment 1 -->\n\n# Title\n\n<!-- Comment 2 -->\n\nText",
				contentMetadata: {
					title: "Test",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test.md");

		// .md files preserve HTML comments
		expect(articleFile?.content).toContain("<!-- Comment 1 -->");
		expect(articleFile?.content).toContain("<!-- Comment 2 -->");
	});

	test("preserves multiline HTML comments in .md files", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "<!--\nMultiline\nComment\n-->\n\n# Content",
				contentMetadata: {
					title: "Test",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test.md");

		// .md files preserve HTML comments
		expect(articleFile?.content).toContain("<!--\nMultiline\nComment\n-->");
	});

	test("sanitizes HTML comments to JSX format for text/mdx contentType", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Article\n\n<!-- This is a comment -->\n\nContent here.",
				contentType: "text/mdx",
				contentMetadata: {
					title: "Test Article",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test-article.mdx");

		// .mdx files convert HTML comments to JSX comments (strict parsing)
		expect(articleFile?.content).toContain("{/* This is a comment */}");
		expect(articleFile?.content).not.toContain("<!--");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/simple-article.md");

		expect(articleFile?.content).toContain("title: Simple Article");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/untitled-article.md");

		expect(articleFile).toBeDefined();
		expect(articleFile?.content).toContain("title: Untitled Article");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");

		expect(files.some(f => f.path === "content/my-article-with-spaces-special.md")).toBe(true);
		expect(files.some(f => f.path === "content/multiple-spaces-here.md")).toBe(true);
		expect(files.some(f => f.path === "content/leading-and-trailing.md")).toBe(true);
	});

	test("generates valid _meta.ts with navbar structure (Nextra 4.x, JOLLI-191/192)", () => {
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const metaFile = files.find(f => f.path === "content/_meta.ts");

		expect(metaFile).toBeDefined();
		expect(metaFile?.content).toContain("export default");
		// JOLLI-191/192: Navbar structure uses hidden index (no "Docs" link in navbar)
		expect(metaFile?.content).toContain("'index': { display: 'hidden' }");
	});

	test("generates valid app/layout.tsx (Nextra 4.x)", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "my-docs", "My Documentation");
		const layoutFile = files.find(f => f.path === "app/layout.tsx");

		expect(layoutFile).toBeDefined();
		expect(layoutFile?.content).toContain("Layout");
		expect(layoutFile?.content).toContain("My Documentation");
	});

	test("generates valid package.json", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "my-site-name", "Display Name");
		const packageFile = files.find(f => f.path === "package.json");

		expect(packageFile).toBeDefined();
		const pkg = JSON.parse(packageFile?.content || "{}");
		expect(pkg.name).toBe("my-site-name");
		expect(pkg.version).toBe("1.0.0");
		expect(pkg.dependencies).toHaveProperty("next");
		expect(pkg.dependencies).toHaveProperty("react");
		expect(pkg.dependencies).toHaveProperty("nextra");
		expect(pkg.dependencies).toHaveProperty("nextra-theme-docs");
		expect(pkg.scripts).toHaveProperty("build");
		// Build script includes pagefind to ensure search works on all platforms
		expect(pkg.scripts.build).toContain("next build");
		expect(pkg.scripts.build).toContain("pagefind");
	});

	test("generates next.config.mjs", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const configFile = files.find(f => f.path === "next.config.mjs");

		expect(configFile).toBeDefined();
		expect(configFile?.content).toContain("nextra");
	});

	test("generates tsconfig.json", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const tsconfigFile = files.find(f => f.path === "tsconfig.json");

		expect(tsconfigFile).toBeDefined();
		const tsconfig = JSON.parse(tsconfigFile?.content || "{}");
		expect(tsconfig.compilerOptions).toBeDefined();
		expect(tsconfig.compilerOptions.jsx).toBe("preserve");
		expect(tsconfig.compilerOptions.module).toBe("esnext");
		expect(tsconfig.include).toContain("**/*.ts");
		expect(tsconfig.include).toContain("**/*.tsx");
	});

	test("generates .gitignore", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const gitignoreFile = files.find(f => f.path === ".gitignore");

		expect(gitignoreFile).toBeDefined();
		expect(gitignoreFile?.content).toContain("node_modules");
		expect(gitignoreFile?.content).toContain(".next");
		expect(gitignoreFile?.content).toContain(".vercel");
	});

	test("escapes YAML special characters in frontmatter", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: 'Article with "quotes"',
					sourceName: 'Source with "quotes"',
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path.startsWith("content/article-with"));

		expect(articleFile?.content).toContain('\\"');
		expect(articleFile?.content).toContain('title: "Article with \\"quotes\\""');
		expect(articleFile?.content).toContain('description: From "Source with \\"quotes\\""');
	});

	test("escapes backticks in YAML frontmatter", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "Content",
				contentMetadata: {
					title: "`extension.ts` Documentation",
				} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path.startsWith("content/extensionts"));

		expect(articleFile?.content).toContain('title: "`extension.ts` Documentation"');
	});

	test("handles empty articles array", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "empty-site", "Empty Site");

		// Nextra 4.x (JOLLI-191): _meta.ts + app/layout + app/globals.css + app/page (no articles placeholder) + app/[...mdxPath]/page (catch-all) + mdx-components + icon + favicon route + pkg + next + ts + gitignore + vercel = 16
		// No content/index.mdx - app/page.tsx shows "no articles" message
		expect(files).toHaveLength(16);
		expect(files.map(f => f.path)).toContain("content/_meta.ts");
		expect(files.map(f => f.path)).toContain("app/layout.tsx");
		expect(files.map(f => f.path)).toContain("app/page.tsx"); // Shows "no articles" message
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test.md");

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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test.md");

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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const articleFile = files.find(f => f.path === "content/test.md");

		expect(articleFile?.content).toContain("**Source:** [View Source](https://example.com)");
	});

	test("generates vercel.json", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");

		// vercel.json was added in the most recent commit according to the file
		const vercelFile = files.find(f => f.path === "vercel.json");

		expect(vercelFile).toBeDefined();
		const vercelConfig = JSON.parse(vercelFile?.content || "{}");
		// Uses npm run build to ensure pagefind runs after next build
		expect(vercelConfig.buildCommand).toBe("npm run build");
		expect(vercelConfig.framework).toBe("nextjs");
	});

	test("includes authentication dependencies when allowedDomain is provided", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			allowedDomain: "example.com",
		});
		const packageFile = files.find(f => f.path === "package.json");

		expect(packageFile).toBeDefined();
		const pkg = JSON.parse(packageFile?.content || "{}");
		expect(pkg.dependencies).toHaveProperty("@auth0/auth0-react");
	});

	test("does not include authentication dependencies when allowedDomain is not provided", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const packageFile = files.find(f => f.path === "package.json");

		expect(packageFile).toBeDefined();
		const pkg = JSON.parse(packageFile?.content || "{}");
		expect(pkg.dependencies).not.toHaveProperty("@auth0/auth0-react");
	});

	test("generates auth files when allowedDomain is provided", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			allowedDomain: "example.com",
		});

		const paths = files.map(f => f.path);
		// Nextra 4.x uses app/layout.tsx for auth instead of pages/_app.tsx
		expect(paths).toContain("app/layout.tsx");
		expect(paths).toContain("lib/auth.tsx");

		const layoutFile = files.find(f => f.path === "app/layout.tsx");
		expect(layoutFile?.content).toContain("@auth0/auth0-react");
		expect(layoutFile?.content).toContain("example.com");

		const authLibFile = files.find(f => f.path === "lib/auth.tsx");
		expect(authLibFile?.content).toContain("useAuth0");
	});

	test("does not generate auth lib file when allowedDomain is not provided", () => {
		const articles: Array<Doc> = [];
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");

		const paths = files.map(f => f.path);
		// app/layout.tsx is always generated in Nextra 4.x, but auth lib is not
		expect(paths).toContain("app/layout.tsx");
		expect(paths).not.toContain("lib/auth.tsx");
	});

	test("regeneration mode generates content files but skips config files", () => {
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
		});

		const paths = files.map(f => f.path);

		// Should contain content files (no index.mdx per JOLLI-191)
		expect(paths).toContain("content/test-article.md");
		expect(paths).toContain("content/another-article.md");

		// Should always contain _meta.ts (ensures consistency with article files)
		expect(paths).toContain("content/_meta.ts");

		// app/page.tsx is ALWAYS generated (contains redirect to first article)
		expect(paths).toContain("app/page.tsx");

		// package.json and vercel.json are ALWAYS generated (critical for build/deploy)
		expect(paths).toContain("package.json");
		expect(paths).toContain("vercel.json");

		// Branding-related files ARE regenerated to support theme changes
		expect(paths).toContain("app/layout.tsx");
		expect(paths).toContain("app/globals.css");
		expect(paths).toContain("next.config.mjs");

		// All config files are now included in regeneration for self-healing
		expect(paths).toContain("app/[...mdxPath]/page.tsx");
		expect(paths).toContain("mdx-components.tsx");
		expect(paths).toContain("app/icon.tsx");
		expect(paths).toContain("tsconfig.json");
		expect(paths).toContain(".gitignore");
	});

	test("regeneration mode always generates _meta.ts and app/page.tsx", () => {
		// _meta.ts is always generated in regeneration mode to ensure it matches content files.
		// app/page.tsx is always generated to ensure redirect points to correct first article.
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test Article",
				contentMetadata: { title: "Test Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
		});

		const paths = files.map(f => f.path);

		// Should contain content files (no index.mdx per JOLLI-191)
		expect(paths).toContain("content/test-article.md");

		// _meta.ts is always generated to ensure consistency
		expect(paths).toContain("content/_meta.ts");

		// app/page.tsx is always generated (contains redirect to first article)
		expect(paths).toContain("app/page.tsx");
	});

	test("regeneration mode generates auth lib file when allowedDomain is set", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test",
				contentMetadata: { title: "Test" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
			allowedDomain: "example.com",
		});

		const paths = files.map(f => f.path);
		// Content files and redirect page
		expect(paths).toContain("content/test.md");
		expect(paths).toContain("app/page.tsx");
		// Branding-related files ARE regenerated to support theme changes
		// Auth layout is generated for sites with allowedDomain
		expect(paths).toContain("app/layout.tsx");
		expect(paths).toContain("app/globals.css");
		expect(paths).toContain("next.config.mjs");
		// Auth lib is now included in regeneration for self-healing
		expect(paths).toContain("lib/auth.tsx");
	});

	test("migration mode generates all files including config when upgrading from Nextra 3.x to 4.x", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test Article",
				contentMetadata: { title: "Test Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
			migrationMode: true, // Force full regeneration for migration
		});

		const paths = files.map(f => f.path);

		// In migration mode, even with regenerationMode=true, all files should be generated
		// Content files (no index.mdx per JOLLI-191)
		expect(paths).toContain("content/test-article.md");
		expect(paths).toContain("content/_meta.ts");

		// Config files (normally skipped in regeneration mode, but included in migration mode)
		expect(paths).toContain("app/layout.tsx");
		expect(paths).toContain("app/page.tsx"); // Root redirect (JOLLI-191)
		expect(paths).toContain("app/[...mdxPath]/page.tsx"); // Catch-all for MDX
		expect(paths).toContain("mdx-components.tsx");
		expect(paths).toContain("app/icon.tsx");
		expect(paths).toContain("package.json");
		expect(paths).toContain("next.config.mjs");
		expect(paths).toContain("tsconfig.json");
		expect(paths).toContain(".gitignore");
		expect(paths).toContain("vercel.json");
	});

	test("migration mode with auth generates auth layout files", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test",
				contentMetadata: { title: "Test" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
			migrationMode: true,
			allowedDomain: "example.com",
		});

		const paths = files.map(f => f.path);

		// Should generate auth files
		expect(paths).toContain("app/layout.tsx");
		expect(paths).toContain("lib/auth.tsx");

		// Layout should contain auth configuration
		const layoutFile = files.find(f => f.path === "app/layout.tsx");
		expect(layoutFile?.content).toContain("@auth0/auth0-react");
		expect(layoutFile?.content).toContain("example.com");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should generate OpenAPI spec file in public folder (slug-based naming)
		expect(paths).toContain("public/api-spec.json");

		// Should generate API docs HTML file
		expect(paths).toContain("public/api-docs-api-spec.html");

		// Check OpenAPI JSON is stored correctly
		const openApiFile = files.find(f => f.path === "public/api-spec.json");
		expect(openApiFile?.content).toBe(jsonContent);

		// Check API docs HTML references the spec file
		const apiDocsHtml = files.find(f => f.path === "public/api-docs-api-spec.html");
		expect(apiDocsHtml?.content).toContain("/api-spec.json");
		expect(apiDocsHtml?.content).toContain("@scalar/api-reference");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const jsonFile = files.find(f => f.path === "content/config-file.json");

		expect(jsonFile).toBeDefined();
		expect(jsonFile?.content).toBe(jsonContent);
		// Should NOT have MDX frontmatter
		expect(jsonFile?.content).not.toContain("---");
		expect(jsonFile?.content).not.toContain("title:");

		// Should NOT generate OpenAPI-specific files
		const paths = files.map(f => f.path);
		expect(paths).not.toContain("public/openapi.json");
	});

	test("generates YAML file for application/yaml content type (non-OpenAPI)", () => {
		// Non-OpenAPI YAML content
		const yamlContent = "config:\n  setting: true\n  name: Test";
		const articles: Array<Doc> = [
			{
				id: 1,
				content: yamlContent,
				contentType: "application/yaml",
				contentMetadata: { title: "Config YAML" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		// Non-OpenAPI YAML goes to content folder
		const yamlFile = files.find(f => f.path === "content/config-yaml.yaml");

		expect(yamlFile).toBeDefined();
		expect(yamlFile?.content).toBe(yamlContent);
	});

	test("generates MDX file for text/markdown content type", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Markdown Content",
				contentType: "text/markdown",
				contentMetadata: { title: "Markdown Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const mdxFile = files.find(f => f.path === "content/markdown-article.md");

		expect(mdxFile).toBeDefined();
		expect(mdxFile?.content).toContain("---");
		expect(mdxFile?.content).toContain("title: Markdown Article");
		expect(mdxFile?.content).toContain("# Markdown Content");
	});

	test("generates MDX file for undefined content type (default)", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Default Content",
				contentMetadata: { title: "Default Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const mdxFile = files.find(f => f.path === "content/default-article.md");

		expect(mdxFile).toBeDefined();
		expect(mdxFile?.content).toContain("---");
		expect(mdxFile?.content).toContain("title: Default Article");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		expect(paths).toContain("content/markdown-doc.md");
		expect(paths).toContain("content/json-config.json");
		expect(paths).toContain("content/yaml-config.yaml");
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should detect Swagger 2.0 as OpenAPI spec
		expect(paths).toContain("public/swagger-spec.json");
		expect(paths).toContain("public/api-docs-swagger-spec.html");
	});

	test("generates OpenAPI files in regeneration mode for new API specs", () => {
		const openApiSpec = {
			openapi: "3.0.0",
			info: { title: "My API", version: "1.0.0" },
			paths: { "/test": { get: { summary: "Test" } } },
		};
		const articles: Array<Doc> = [
			{
				id: 1,
				content: JSON.stringify(openApiSpec, null, 2),
				contentType: "application/json",
				contentMetadata: { title: "API Spec" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
		});
		const paths = files.map(f => f.path);

		// Should generate OpenAPI spec file and docs (JOLLI-192)
		expect(paths).toContain("public/api-spec.json");
		expect(paths).toContain("public/api-docs-api-spec.html");
		expect(paths).toContain("app/api-docs/[[...slug]]/page.tsx"); // JOLLI-192
		expect(paths).toContain("components/ApiReference.tsx"); // JOLLI-192

		// app/page.tsx is always generated (contains redirect to first article/API doc)
		expect(paths).toContain("app/page.tsx");

		// package.json and vercel.json are ALWAYS generated (critical for build/deploy)
		expect(paths).toContain("package.json");
		expect(paths).toContain("vercel.json");

		// Branding-related files ARE regenerated to support theme changes
		expect(paths).toContain("next.config.mjs");
		expect(paths).toContain("app/layout.tsx");
		expect(paths).toContain("app/globals.css");

		// All config files are now included in regeneration for self-healing
		expect(paths).toContain("tsconfig.json");
		expect(paths).toContain(".gitignore");
	});

	test("generates OpenAPI documentation for YAML OpenAPI spec", () => {
		const yamlContent = `openapi: "3.0.0"
info:
  title: YAML API
  version: "1.0.0"
  description: API defined in YAML
paths:
  /items:
    get:
      summary: Get items
`;
		const articles: Array<Doc> = [
			{
				id: 1,
				content: yamlContent,
				contentType: "application/yaml",
				contentMetadata: { title: "YAML API Spec" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should generate OpenAPI files with .yaml extension
		expect(paths).toContain("public/yaml-api-spec.yaml");
		expect(paths).toContain("public/api-docs-yaml-api-spec.html");

		// Check the API docs HTML references the yaml file
		const apiDocsHtml = files.find(f => f.path === "public/api-docs-yaml-api-spec.html");
		expect(apiDocsHtml?.content).toContain("/yaml-api-spec.yaml");
	});

	test("generates API reference for multiple OpenAPI specs", () => {
		const spec1 = {
			openapi: "3.0.0",
			info: { title: "Users API", version: "1.0.0" },
			paths: { "/users": { get: { summary: "Get users" } } },
		};
		const spec2 = {
			openapi: "3.0.0",
			info: { title: "Products API", version: "2.0.0" },
			paths: { "/products": { get: { summary: "Get products" } } },
		};
		const articles: Array<Doc> = [
			{
				id: 1,
				content: JSON.stringify(spec1, null, 2),
				contentType: "application/json",
				contentMetadata: { title: "Users API" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: JSON.stringify(spec2, null, 2),
				contentType: "application/json",
				contentMetadata: { title: "Products API" } as DocContentMetadata,
				createdAt: new Date("2024-01-11T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should generate separate OpenAPI files for each spec
		expect(paths).toContain("public/users-api.json");
		expect(paths).toContain("public/products-api.json");

		// Should generate separate API docs HTML for each spec
		expect(paths).toContain("public/api-docs-users-api.html");
		expect(paths).toContain("public/api-docs-products-api.html");
	});

	test("detects JSON content even when contentType is text/markdown and generates OpenAPI files", () => {
		// This test covers the scenario where a user saved JSON content with wrong contentType
		const spec = {
			openapi: "3.0.0",
			info: { title: "Mistyped API", version: "1.0.0" },
			paths: { "/test": { get: { summary: "Test endpoint" } } },
		};
		const articles: Array<Doc> = [
			{
				id: 1,
				content: JSON.stringify(spec, null, 2),
				contentType: "text/markdown", // Wrong contentType - should still detect as JSON
				contentMetadata: { title: "Mistyped API" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should detect as OpenAPI and generate files
		expect(paths).toContain("public/mistyped-api.json");
		expect(paths).toContain("public/api-docs-mistyped-api.html");

		// Should NOT generate an MDX file with raw JSON (which would cause MDX parsing errors)
		expect(paths).not.toContain("content/mistyped-api.md");
	});

	test("detects non-OpenAPI JSON content with wrong contentType and saves as JSON file", () => {
		// JSON content that is NOT OpenAPI should be saved as .json, not wrapped in MDX
		const jsonContent = JSON.stringify({ config: { setting: true } }, null, 2);
		const articles: Array<Doc> = [
			{
				id: 1,
				content: jsonContent,
				contentType: "text/markdown", // Wrong contentType - should still detect as JSON
				contentMetadata: { title: "Config Data" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should save as .json file, not .mdx
		expect(paths).toContain("content/config-data.json");
		expect(paths).not.toContain("content/config-data.md");

		// JSON file should contain raw content without MDX frontmatter
		const jsonFile = files.find(f => f.path === "content/config-data.json");
		expect(jsonFile?.content).toBe(jsonContent);
		expect(jsonFile?.content).not.toContain("---");
	});

	test("detects YAML content with wrong contentType and generates OpenAPI files", () => {
		const yamlContent = `openapi: '3.0.0'
info:
  title: YAML Mistyped API
  version: '1.0.0'
paths:
  /items:
    get:
      summary: Get items`;
		const articles: Array<Doc> = [
			{
				id: 1,
				content: yamlContent,
				contentType: "text/markdown", // Wrong contentType - should still detect as YAML
				contentMetadata: { title: "YAML Mistyped API" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should detect as OpenAPI YAML and generate files
		expect(paths).toContain("public/yaml-mistyped-api.yaml");
		expect(paths).toContain("public/api-docs-yaml-mistyped-api.html");

		// Should NOT generate an MDX file with raw YAML
		expect(paths).not.toContain("content/yaml-mistyped-api.md");
	});

	test("detectsAsYaml returns false for JSON object content (starts with {)", () => {
		// Content that starts with { should not be detected as YAML
		// This tests the detectsAsYaml function's check for JSON objects
		const jsonContent = '{ "key": "value" }';
		const articles: Array<Doc> = [
			{
				id: 1,
				content: jsonContent,
				// No contentType - triggers detection logic
				contentMetadata: { title: "JSON Object" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should detect as JSON, not YAML
		expect(paths).toContain("content/json-object.json");
		expect(paths).not.toContain("content/json-object.yaml");
		expect(paths).not.toContain("content/json-object.mdx");
	});

	test("detectsAsYaml returns false for JSON array content (starts with [)", () => {
		// Content that starts with [ should not be detected as YAML
		// This tests the detectsAsYaml function's check for JSON arrays
		// Note: detectsAsJson only checks for objects ({}), so arrays fall through
		// to markdown since detectsAsYaml also rejects arrays
		const jsonArrayContent = '["item1", "item2", "item3"]';
		const articles: Array<Doc> = [
			{
				id: 1,
				content: jsonArrayContent,
				// No contentType - triggers detection logic
				contentMetadata: { title: "JSON Array" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// JSON arrays are not detected as JSON (detectsAsJson only checks for objects)
		// They are also not detected as YAML (detectsAsYaml rejects content starting with [)
		// So they end up as MDX files (the default for markdown)
		expect(paths).toContain("content/json-array.md");
		expect(paths).not.toContain("content/json-array.json");
		expect(paths).not.toContain("content/json-array.yaml");
	});

	test("generates ApiReference for OpenAPI spec without summaries", () => {
		// OpenAPI spec with endpoint that has no summary - still generates files
		const spec = {
			openapi: "3.0.0",
			info: { title: "API Without Summaries", version: "1.0.0" },
			paths: {
				"/users": { get: {} }, // No summary
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

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site");
		const paths = files.map(f => f.path);

		// Should generate OpenAPI files
		expect(paths).toContain("public/no-summary-api.json");
		expect(paths).toContain("public/api-docs-no-summary-api.html");
	});

	test("migration mode passes migrationContext to nextra-generator", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test Article",
				contentMetadata: { title: "Test Article" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		// When migrationContext is provided, it should be passed to the generator
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			regenerationMode: true,
			migrationMode: true,
			migrationContext: {
				themeConfig: { primaryHue: 180 },
				existingNavMeta: { "test-article": "My Test" },
				deletedSlugs: [],
			},
		});

		const paths = files.map(f => f.path);

		// In migration mode with context, all files should be generated (no index.mdx per JOLLI-191)
		expect(paths).toContain("content/test-article.md");
		expect(paths).toContain("content/_meta.ts");
		expect(paths).toContain("app/layout.tsx");
		expect(paths).toContain("app/page.tsx"); // Root redirect (JOLLI-191)
		expect(paths).toContain("package.json");

		// The layout should use the primaryHue from migration context
		const layoutFile = files.find(f => f.path === "app/layout.tsx");
		expect(layoutFile?.content).toContain("180");

		// JOLLI-191/192: _meta.ts uses hidden index (no "Docs" link in navbar)
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile?.content).toContain("'index': { display: 'hidden' }");
	});
});

describe("getDeletedFilePathsFromChangedArticles", () => {
	test("returns empty array when no deleted articles exist", () => {
		const changedArticles: Array<ChangedArticle> = [
			{
				id: 1,
				title: "New Article",
				jrn: "doc:new-article",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "text/markdown",
				changeType: "new",
			},
			{
				id: 2,
				title: "Updated Article",
				jrn: "doc:updated-article",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "text/markdown",
				changeType: "updated",
			},
		];

		const paths = getDeletedFilePathsFromChangedArticles(changedArticles);
		expect(paths).toEqual([]);
	});

	test("returns file paths only for deleted articles", () => {
		const changedArticles: Array<ChangedArticle> = [
			{
				id: 1,
				title: "New Article",
				jrn: "doc:new-article",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "text/markdown",
				changeType: "new",
			},
			{
				id: -1,
				title: "Deleted Guide",
				jrn: "doc:deleted-guide",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "text/markdown",
				changeType: "deleted",
			},
		];

		const paths = getDeletedFilePathsFromChangedArticles(changedArticles);
		// Includes both .md (new default) and .mdx (legacy), plus .yaml/.json variants
		expect(paths).toEqual([
			"content/deleted-guide.md",
			"content/deleted-guide.mdx",
			"content/deleted-guide.yaml",
			"content/deleted-guide.json",
		]);
	});

	test("returns all possible paths for deleted JSON articles", () => {
		const changedArticles: Array<ChangedArticle> = [
			{
				id: -1,
				title: "API Spec",
				jrn: "doc:api-spec",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "application/json",
				changeType: "deleted",
			},
		];

		const paths = getDeletedFilePathsFromChangedArticles(changedArticles);
		// Nextra 4.x: returns all possible paths for JSON (could be OpenAPI or regular JSON)
		expect(paths).toEqual(["public/api-spec.json", "public/api-docs-api-spec.html", "content/api-spec.json"]);
	});

	test("returns all possible paths for deleted YAML articles", () => {
		const changedArticles: Array<ChangedArticle> = [
			{
				id: -1,
				title: "Config File",
				jrn: "doc:config-file",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "application/yaml",
				changeType: "deleted",
			},
		];

		const paths = getDeletedFilePathsFromChangedArticles(changedArticles);
		expect(paths).toEqual([
			"public/config-file.yaml",
			"public/api-docs-config-file.html",
			"content/config-file.yaml",
		]);
	});

	test("handles multiple deleted articles of different types", () => {
		const changedArticles: Array<ChangedArticle> = [
			{
				id: -1,
				title: "Markdown Doc",
				jrn: "doc:markdown-doc",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "text/markdown",
				changeType: "deleted",
			},
			{
				id: -1,
				title: "JSON API",
				jrn: "doc:json-api",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "application/json",
				changeType: "deleted",
			},
			{
				id: 3,
				title: "Updated Doc",
				jrn: "doc:updated-doc",
				updatedAt: "2024-01-15T12:00:00Z",
				contentType: "text/markdown",
				changeType: "updated",
			},
		];

		const paths = getDeletedFilePathsFromChangedArticles(changedArticles);
		// Markdown includes both .md/.mdx plus .yaml/.json variants for files previously saved with wrong extension
		expect(paths).toEqual([
			"content/markdown-doc.md",
			"content/markdown-doc.mdx",
			"content/markdown-doc.yaml",
			"content/markdown-doc.json",
			"public/json-api.json",
			"public/api-docs-json-api.html",
			"content/json-api.json",
		]);
	});

	test("returns empty array for empty input", () => {
		const paths = getDeletedFilePathsFromChangedArticles([]);
		expect(paths).toEqual([]);
	});
});

describe("validateArticlesForGeneration", () => {
	test("returns valid when all articles have absolute image references", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Article\n\n![image](https://cdn.example.com/img.png)\n\nContent here.",
				contentMetadata: { title: "Good Article" } as DocContentMetadata,
				jrn: "doc:good-article",
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const result = validateArticlesForGeneration(articles);

		expect(result.isValid).toBe(true);
		expect(result.invalidArticles).toHaveLength(0);
	});

	test("returns invalid when articles have relative image references", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Article\n\n![image](./img/photo.png)\n\nContent here.",
				contentMetadata: { title: "Bad Article" } as DocContentMetadata,
				jrn: "doc:bad-article",
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const result = validateArticlesForGeneration(articles);

		expect(result.isValid).toBe(false);
		expect(result.invalidArticles).toHaveLength(1);
		expect(result.invalidArticles[0].jrn).toBe("doc:bad-article");
		expect(result.invalidArticles[0].title).toBe("Bad Article");
		expect(result.invalidArticles[0].errors.length).toBeGreaterThan(0);
	});

	test("uses JRN as fallback title when contentMetadata has no title", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "![image](./img/photo.png)",
				contentMetadata: {} as DocContentMetadata,
				jrn: "doc:no-title",
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const result = validateArticlesForGeneration(articles);

		expect(result.isValid).toBe(false);
		expect(result.invalidArticles[0].title).toBe("doc:no-title");
	});

	test("uses JRN as fallback when contentMetadata is undefined", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "![image](../img/photo.png)",
				jrn: "doc:no-metadata",
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const result = validateArticlesForGeneration(articles);

		expect(result.isValid).toBe(false);
		expect(result.invalidArticles[0].title).toBe("doc:no-metadata");
	});

	test("returns valid for empty articles array", () => {
		const result = validateArticlesForGeneration([]);

		expect(result.isValid).toBe(true);
		expect(result.invalidArticles).toHaveLength(0);
	});

	test("handles mix of valid and invalid articles", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Good\n\n![img](https://example.com/img.png)",
				contentMetadata: { title: "Good Article" } as DocContentMetadata,
				jrn: "doc:good",
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
			{
				id: 2,
				content: "# Bad\n\n![img](./local/img.png)",
				contentMetadata: { title: "Bad Article" } as DocContentMetadata,
				jrn: "doc:bad",
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const result = validateArticlesForGeneration(articles);

		expect(result.isValid).toBe(false);
		expect(result.invalidArticles).toHaveLength(1);
		expect(result.invalidArticles[0].jrn).toBe("doc:bad");
	});
});

describe("formatPreGenerationErrors", () => {
	test("returns empty string when validation is valid", () => {
		const result = formatPreGenerationErrors({
			isValid: true,
			invalidArticles: [],
		});

		expect(result).toBe("");
	});

	test("formats single article error", () => {
		const result = formatPreGenerationErrors({
			isValid: false,
			invalidArticles: [
				{
					jrn: "doc:bad-article",
					title: "Bad Article",
					errors: [
						{
							src: "./img/photo.png",
							message: "Relative path not allowed",
							line: 3,
							column: 1,
							errorCode: "RELATIVE_PATH",
						},
					],
				},
			],
		});

		expect(result).toContain("Site generation failed: Invalid image references found");
		expect(result).toContain(
			'Article "Bad Article" (doc:bad-article): ./img/photo.png (Relative path not allowed)',
		);
	});

	test("formats multiple articles with multiple errors", () => {
		const result = formatPreGenerationErrors({
			isValid: false,
			invalidArticles: [
				{
					jrn: "doc:article-1",
					title: "Article 1",
					errors: [
						{
							src: "./img/a.png",
							message: "Relative path",
							line: 2,
							column: 1,
							errorCode: "RELATIVE_PATH",
						},
						{ src: "../img/b.png", message: "Parent path", line: 5, column: 1, errorCode: "RELATIVE_PATH" },
					],
				},
				{
					jrn: "doc:article-2",
					title: "Article 2",
					errors: [
						{
							src: "./local.png",
							message: "Relative path",
							line: 1,
							column: 1,
							errorCode: "RELATIVE_PATH",
						},
					],
				},
			],
		});

		const lines = result.split("\n");
		expect(lines).toHaveLength(4);
		expect(lines[0]).toBe("Site generation failed: Invalid image references found");
		expect(lines[1]).toContain("Article 1");
		expect(lines[2]).toContain("Article 1");
		expect(lines[3]).toContain("Article 2");
	});
});

describe("generateNextraFromArticles - branding/theme options", () => {
	test("passes theme branding to generator via mapBrandingToThemeConfig", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test",
				contentMetadata: { title: "Test" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			theme: {
				logo: "https://example.com/logo.png",
				logoUrl: "/",
				favicon: "/favicon.ico",
				primaryHue: 200,
				defaultTheme: "dark",
				hideToc: true,
				tocTitle: "On This Page",
				sidebarDefaultCollapseLevel: 2,
				headerLinks: { items: [{ label: "Home", url: "/" }] },
				fontFamily: "inter",
				codeTheme: "github",
				borderRadius: "sharp",
				spacingDensity: "compact",
				navigationMode: "sidebar",
				footer: { copyright: "Copyright 2024" },
			},
		});

		// Layout should contain the primaryHue
		const layoutFile = files.find(f => f.path === "app/layout.tsx");
		expect(layoutFile).toBeDefined();
		expect(layoutFile?.content).toContain("200");
	});

	test("handles theme with only partial branding properties", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Test",
				contentMetadata: { title: "Test" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		// Only set a few properties
		const { files } = generateNextraFromArticles(articles, "test-site", "Test Site", {
			theme: {
				primaryHue: 120,
			},
		});

		const layoutFile = files.find(f => f.path === "app/layout.tsx");
		expect(layoutFile).toBeDefined();
		expect(layoutFile?.content).toContain("120");
	});
});

describe("stripSlugSuffix", () => {
	test("strips 7-char lowercase alphanumeric suffix from slug", () => {
		expect(stripSlugSuffix("my-article-gk4sp55")).toBe("my-article");
	});

	test("leaves slug without suffix unchanged", () => {
		expect(stripSlugSuffix("my-articles")).toBe("my-articles");
	});

	test("handles single-segment slug without suffix", () => {
		expect(stripSlugSuffix("overview")).toBe("overview");
	});

	test("does not strip suffix that is too short (3 chars)", () => {
		expect(stripSlugSuffix("my-art-abc")).toBe("my-art-abc");
	});

	test("does not strip suffix with uppercase characters", () => {
		expect(stripSlugSuffix("my-article-Gk4sp55")).toBe("my-article-Gk4sp55");
	});

	test("strips suffix with all numeric characters", () => {
		expect(stripSlugSuffix("my-article-1234567")).toBe("my-article");
	});

	test("strips suffix with all alphabetic characters", () => {
		expect(stripSlugSuffix("my-article-abcdefg")).toBe("my-article");
	});

	test("preserves slug when stripping would leave empty string", () => {
		// A 7-char slug that looks like a nanoid suffix should not be stripped entirely
		expect(stripSlugSuffix("abc1234")).toBe("abc1234");
	});

	test("preserves slug when entire slug matches suffix pattern with hyphen prefix", () => {
		// Edge case: slug is just a hyphen + 7-char suffix (would leave empty after strip)
		expect(stripSlugSuffix("x-abc1234")).toBe("x");
	});
});

describe("extractFolderPath", () => {
	test("returns empty string for root-level article", () => {
		expect(extractFolderPath("/my-article-abc1234")).toBe("");
	});

	test("extracts folder path for nested article", () => {
		expect(extractFolderPath("/guides-xyz7890/install-abc1234")).toBe("guides");
	});

	test("extracts folder path for deeply nested article", () => {
		expect(extractFolderPath("/guides-xyz7890/advanced-abc1234/setup-def5678")).toBe("guides/advanced");
	});

	test("handles path without leading slash", () => {
		expect(extractFolderPath("guides-xyz7890/install-abc1234")).toBe("guides");
	});

	test("returns empty string for single segment without leading slash", () => {
		expect(extractFolderPath("my-article-abc1234")).toBe("");
	});
});

describe("buildFolderSlugMapping", () => {
	test("returns empty map when folder title matches its slug", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "",
				docType: "folder",
				path: "/guides-abc1234",
				contentMetadata: { title: "Guides" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const mapping = buildFolderSlugMapping(articles);
		expect(mapping.size).toBe(0);
	});

	test("creates mapping when folder title differs from its slug", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "",
				docType: "folder",
				path: "/cicd-gk4sp55",
				contentMetadata: { title: "Workflows" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const mapping = buildFolderSlugMapping(articles);
		expect(mapping.size).toBe(1);
		expect(mapping.get("cicd")).toBe("workflows");
	});

	test("returns empty map for empty articles array", () => {
		const mapping = buildFolderSlugMapping([]);
		expect(mapping.size).toBe(0);
	});

	test("skips non-folder documents", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "# Article",
				docType: "document",
				path: "/old-name-abc1234",
				contentMetadata: { title: "New Name" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const mapping = buildFolderSlugMapping(articles);
		expect(mapping.size).toBe(0);
	});

	test("skips folder documents without a path", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "",
				docType: "folder",
				contentMetadata: { title: "Orphan Folder" } as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const mapping = buildFolderSlugMapping(articles);
		expect(mapping.size).toBe(0);
	});

	test("skips folder documents without a title in contentMetadata", () => {
		const articles: Array<Doc> = [
			{
				id: 1,
				content: "",
				docType: "folder",
				path: "/some-folder-abc1234",
				contentMetadata: {} as DocContentMetadata,
				createdAt: new Date("2024-01-10T10:00:00Z"),
			} as Doc,
		];

		const mapping = buildFolderSlugMapping(articles);
		expect(mapping.size).toBe(0);
	});
});

describe("remapFolderPaths", () => {
	test("remaps matching folder path segment", () => {
		const inputs: Array<ArticleInput> = [{ content: "# Child", folderPath: "old-name/child" }];
		const mapping = new Map([["old-name", "new-name"]]);

		remapFolderPaths(inputs, mapping);

		expect(inputs[0].folderPath).toBe("new-name/child");
	});

	test("leaves non-matching paths unchanged", () => {
		const inputs: Array<ArticleInput> = [{ content: "# Article", folderPath: "other-folder" }];
		const mapping = new Map([["old-name", "new-name"]]);

		remapFolderPaths(inputs, mapping);

		expect(inputs[0].folderPath).toBe("other-folder");
	});

	test("remaps only matching segments in multi-segment path", () => {
		const inputs: Array<ArticleInput> = [{ content: "# Deep", folderPath: "old-name/middle/deep" }];
		const mapping = new Map([["old-name", "new-name"]]);

		remapFolderPaths(inputs, mapping);

		expect(inputs[0].folderPath).toBe("new-name/middle/deep");
	});

	test("remaps multiple segments when mapping has multiple entries", () => {
		const inputs: Array<ArticleInput> = [{ content: "# Article", folderPath: "old-a/old-b" }];
		const mapping = new Map([
			["old-a", "new-a"],
			["old-b", "new-b"],
		]);

		remapFolderPaths(inputs, mapping);

		expect(inputs[0].folderPath).toBe("new-a/new-b");
	});

	test("skips inputs without folderPath", () => {
		const inputs: Array<ArticleInput> = [{ content: "# Root Article" }];
		const mapping = new Map([["old-name", "new-name"]]);

		remapFolderPaths(inputs, mapping);

		expect(inputs[0].folderPath).toBeUndefined();
	});

	test("handles empty inputs array", () => {
		const inputs: Array<ArticleInput> = [];
		const mapping = new Map([["old-name", "new-name"]]);

		// Should not throw
		remapFolderPaths(inputs, mapping);

		expect(inputs).toHaveLength(0);
	});
});
