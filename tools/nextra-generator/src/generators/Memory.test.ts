import type { ArticleInput, GenerateToMemoryOptions } from "../types.js";
import { generateSiteToMemory, getNextra3xFilesToDelete } from "./memory.js";
import { describe, expect, it } from "vitest";

describe("generateSiteToMemory", () => {
	const defaultOptions: GenerateToMemoryOptions = {
		siteName: "test-site",
		displayName: "Test Site",
	};

	describe("basic generation (Nextra 4.x)", () => {
		it("should generate no-articles page when no articles exist", () => {
			const articles: Array<ArticleInput> = [];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Should NOT generate content/index.mdx (JOLLI-191)
			const indexFile = files.find(f => f.path === "content/index.mdx");
			expect(indexFile).toBeUndefined();

			// Should generate app/page.tsx with no-articles message
			const rootPage = files.find(f => f.path === "app/page.tsx");
			expect(rootPage).toBeDefined();
			expect(rootPage?.content).toContain("No Articles Yet");
		});

		it("should generate root redirect page when articles exist", () => {
			const articles: Array<ArticleInput> = [
				{ content: "# Test", contentMetadata: { title: "Getting Started" } },
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Should NOT generate content/index.mdx (JOLLI-191)
			const indexFile = files.find(f => f.path === "content/index.mdx");
			expect(indexFile).toBeUndefined();

			// Should generate app/page.tsx that redirects to first article
			const rootPage = files.find(f => f.path === "app/page.tsx");
			expect(rootPage).toBeDefined();
			expect(rootPage?.content).toContain("redirect('/getting-started')");
		});

		it("should generate Nextra 4.x config files in non-regeneration mode", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const paths = files.map(f => f.path);
			expect(paths).toContain("package.json");
			expect(paths).toContain("app/layout.tsx");
			expect(paths).toContain("app/[...mdxPath]/page.tsx");
			expect(paths).toContain("mdx-components.tsx");
			expect(paths).toContain("next.config.mjs");
			expect(paths).toContain("tsconfig.json");
			expect(paths).toContain(".gitignore");
			expect(paths).toContain("vercel.json");
			expect(paths).toContain("app/icon.tsx");
			expect(paths).toContain("app/favicon.ico/route.ts");
			// Should NOT have Nextra 3.x files
			expect(paths).not.toContain("pages/_app.jsx");
			expect(paths).not.toContain("theme.config.jsx");
		});

		it("should generate favicon route handler to prevent catch-all from handling favicon.ico", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const faviconRoute = files.find(f => f.path === "app/favicon.ico/route.ts");
			expect(faviconRoute).toBeDefined();
			expect(faviconRoute?.content).toContain("redirect('/icon')");
		});

		it("should generate app/layout.tsx with Layout component (Nextra 4.x)", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const layoutFile = files.find(f => f.path === "app/layout.tsx");
			expect(layoutFile).toBeDefined();
			expect(layoutFile?.content).toContain("Layout");
			expect(layoutFile?.content).toContain("nextra-theme-docs");
			expect(layoutFile?.content).toContain("getPageMap");
		});

		it("should skip most static config files in regeneration mode but always generate build config and content files", () => {
			const { files } = generateSiteToMemory([], {
				...defaultOptions,
				regenerationMode: true,
			});

			const paths = files.map(f => f.path);
			// package.json and vercel.json are ALWAYS generated (critical for build/deploy)
			expect(paths).toContain("package.json");
			expect(paths).toContain("vercel.json");

			// Other static config files are skipped in regeneration mode (users may customize)
			expect(paths).not.toContain("next.config.mjs");
			expect(paths).not.toContain("tsconfig.json");
			expect(paths).not.toContain(".gitignore");
			expect(paths).not.toContain("app/layout.tsx");
			expect(paths).not.toContain("app/[...mdxPath]/page.tsx");
			expect(paths).not.toContain("mdx-components.tsx");
			expect(paths).not.toContain("app/icon.tsx");
			expect(paths).not.toContain("app/favicon.ico/route.ts");

			// app/page.tsx is ALWAYS generated (contains redirect to first article)
			expect(paths).toContain("app/page.tsx");

			// Content files are always generated (_meta.ts for nav)
			expect(paths).toContain("content/_meta.ts");
		});

		it("should always generate _meta.ts and app/page.tsx in regeneration mode", () => {
			// _meta.ts is always generated to ensure it matches article content files
			// app/page.tsx is always generated to ensure redirect points to correct first article
			const { files } = generateSiteToMemory([], {
				...defaultOptions,
				regenerationMode: true,
			});

			const paths = files.map(f => f.path);
			// _meta.ts is always included to ensure consistency
			expect(paths).toContain("content/_meta.ts");
			// app/page.tsx is always generated (contains redirect to first article)
			expect(paths).toContain("app/page.tsx");
		});

		it("should generate ALL files in migration mode (overrides regenerationMode)", () => {
			const { files } = generateSiteToMemory([], {
				...defaultOptions,
				regenerationMode: true,
				migrationMode: true, // Migration forces all files
			});

			const paths = files.map(f => f.path);
			// All config files should be generated in migration mode
			expect(paths).toContain("package.json");
			expect(paths).toContain("next.config.mjs");
			expect(paths).toContain("tsconfig.json");
			expect(paths).toContain(".gitignore");
			expect(paths).toContain("vercel.json");
			expect(paths).toContain("app/layout.tsx");
			expect(paths).toContain("app/[...mdxPath]/page.tsx");
			expect(paths).toContain("mdx-components.tsx");
			expect(paths).toContain("app/icon.tsx");
			expect(paths).toContain("app/favicon.ico/route.ts");
			expect(paths).toContain("content/_meta.ts");
			// app/page.tsx is generated instead of content/index.mdx (JOLLI-191)
			expect(paths).toContain("app/page.tsx");
		});
	});

	describe("markdown articles", () => {
		it("should generate MDX files for markdown articles in content folder", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Hello World",
					contentMetadata: { title: "Getting Started" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			const articleFile = files.find(f => f.path === "content/getting-started.mdx");
			expect(articleFile).toBeDefined();
			expect(articleFile?.content).toContain("title: Getting Started");
			expect(articleFile?.content).toContain("# Hello World");
		});

		it("should include source information in article", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "Content",
					contentMetadata: {
						title: "Article",
						sourceName: "GitHub",
						sourceUrl: "https://github.com/example",
					},
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			const articleFile = files.find(f => f.path === "content/article.mdx");
			expect(articleFile?.content).toContain("**Source:** [GitHub](https://github.com/example)");
		});
	});

	describe("OpenAPI articles", () => {
		const openApiContent = JSON.stringify({
			openapi: "3.0.0",
			info: { title: "Test API", version: "1.0.0" },
			paths: {
				"/users": {
					get: { summary: "Get users" },
				},
			},
		});

		it("should generate OpenAPI spec file in public folder", () => {
			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "My API" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Uses slug-based naming (my-api.json)
			const specFile = files.find(f => f.path === "public/my-api.json");
			expect(specFile).toBeDefined();
			expect(specFile?.content).toBe(openApiContent);
		});

		it("should generate API docs HTML file for each OpenAPI spec", () => {
			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "My API" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			const apiDocsHtml = files.find(f => f.path === "public/api-docs-my-api.html");
			expect(apiDocsHtml).toBeDefined();
			expect(apiDocsHtml?.content).toContain("@scalar/api-reference");
			expect(apiDocsHtml?.content).toContain("/my-api.json");
		});

		it("should detect OpenAPI even with wrong content type", () => {
			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "text/markdown", // Wrong type
					contentMetadata: { title: "My API" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Should still create OpenAPI files
			const specFile = files.find(f => f.path === "public/my-api.json");
			expect(specFile).toBeDefined();
		});

		it("should generate multiple API spec files for multiple OpenAPI specs", () => {
			const openApiContent2 = JSON.stringify({
				openapi: "3.0.0",
				info: { title: "Users API", version: "1.0.0" },
				paths: { "/users": { get: { summary: "Get users" } } },
			});

			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "My API" },
				},
				{
					content: openApiContent2,
					contentType: "application/json",
					contentMetadata: { title: "Users Service" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Should have two spec files
			expect(files.find(f => f.path === "public/my-api.json")).toBeDefined();
			expect(files.find(f => f.path === "public/users-service.json")).toBeDefined();

			// Should have two API docs HTML files
			expect(files.find(f => f.path === "public/api-docs-my-api.html")).toBeDefined();
			expect(files.find(f => f.path === "public/api-docs-users-service.html")).toBeDefined();
		});

		it("should generate OpenAPI files in regeneration mode", () => {
			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "My API" },
				},
			];
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
			});

			// Should still generate OpenAPI spec file
			const specFile = files.find(f => f.path === "public/my-api.json");
			expect(specFile).toBeDefined();

			// Should generate API docs HTML even in regeneration mode
			const apiDocsHtml = files.find(f => f.path === "public/api-docs-my-api.html");
			expect(apiDocsHtml).toBeDefined();

			// package.json and vercel.json are always generated (critical for build)
			const paths = files.map(f => f.path);
			expect(paths).toContain("package.json");
			expect(paths).toContain("vercel.json");
			// Other static config files should still be skipped
			expect(paths).not.toContain("next.config.mjs");
		});

		it("should generate API docs page for OpenAPI specs (JOLLI-192)", () => {
			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "Petstore API" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Should generate app/api-docs/[[...slug]]/page.tsx as server component (no 'use client')
			// Uses optional catch-all [[...slug]] for: /api-docs/ redirect, valid slugs, and 404 for invalid
			// Split into server + client components for Next.js 15 compatibility
			const apiDocsPage = files.find(f => f.path === "app/api-docs/[[...slug]]/page.tsx");
			expect(apiDocsPage).toBeDefined();
			expect(apiDocsPage?.content).not.toContain("'use client'");
			expect(apiDocsPage?.content).toContain("generateStaticParams");
			expect(apiDocsPage?.content).toContain("{ slug: ['petstore-api'] }");
			expect(apiDocsPage?.content).toContain("import ApiReference");
			expect(apiDocsPage?.content).toContain("VALID_SLUGS");
			expect(apiDocsPage?.content).toContain("notFound()");

			// Should generate components/ApiReference.tsx as client component
			const apiReference = files.find(f => f.path === "components/ApiReference.tsx");
			expect(apiReference).toBeDefined();
			expect(apiReference?.content).toContain("'use client'");
			expect(apiReference?.content).toContain("useTheme");
			expect(apiReference?.content).toContain("iframe");
		});

		it("should add API page entry in _meta.ts for OpenAPI specs", () => {
			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "Petstore API" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Find the _meta.ts file
			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();

			// JOLLI-191/192: _meta.ts now uses navbar structure
			// - Hidden index (root redirects to first article)
			// - Generalized "API Reference" link instead of individual spec titles
			expect(metaFile?.content).toContain("'index': { display: 'hidden' }");
			expect(metaFile?.content).toContain("'api-reference'");
			expect(metaFile?.content).toContain("title: 'API Reference'");
			expect(metaFile?.content).toContain("type: 'page'");
			expect(metaFile?.content).toContain("href: '/api-docs/petstore-api'");
		});

		it("should add API page entry alongside regular markdown article", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# README\n\nThis is a readme file.",
					contentType: "text/markdown",
					contentMetadata: { title: "README" },
				},
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "My API" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Find the _meta.ts file
			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();

			// JOLLI-191/192: _meta.ts uses hidden index and API Reference (no "Docs" link)
			expect(metaFile?.content).toContain("'index': { display: 'hidden' }");
			expect(metaFile?.content).toContain("'api-reference'");
			expect(metaFile?.content).toContain("title: 'API Reference'");
			expect(metaFile?.content).toContain("href: '/api-docs/my-api'");
		});

		it("should add multiple API page entries for multiple OpenAPI specs", () => {
			const openApiContent2 = JSON.stringify({
				openapi: "3.0.0",
				info: { title: "Users API", version: "1.0.0" },
				paths: { "/users": { get: { summary: "Get users" } } },
			});

			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "Petstore" },
				},
				{
					content: openApiContent2,
					contentType: "application/json",
					contentMetadata: { title: "Users" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();

			// JOLLI-191/192: Multiple OpenAPI specs create a menu dropdown
			expect(metaFile?.content).toContain("'index': { display: 'hidden' }");
			expect(metaFile?.content).toContain("'api-reference'");
			expect(metaFile?.content).toContain("title: 'API Reference'");
			expect(metaFile?.content).toContain("type: 'menu'"); // Multiple specs = menu
			expect(metaFile?.content).toContain("href: '/api-docs/petstore'");
			expect(metaFile?.content).toContain("href: '/api-docs/users'");

			// Should generate API docs page with both slugs (array format for catch-all)
			const apiDocsPage = files.find(f => f.path === "app/api-docs/[[...slug]]/page.tsx");
			expect(apiDocsPage).toBeDefined();
			expect(apiDocsPage?.content).toContain("{ slug: ['petstore'] }");
			expect(apiDocsPage?.content).toContain("{ slug: ['users'] }");
		});

		it("should redirect root to first API doc when only OpenAPI specs exist (no articles)", () => {
			const articles: Array<ArticleInput> = [
				{
					content: openApiContent,
					contentType: "application/json",
					contentMetadata: { title: "Petstore API" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Should generate app/page.tsx that redirects to first API doc
			const rootPage = files.find(f => f.path === "app/page.tsx");
			expect(rootPage).toBeDefined();
			expect(rootPage?.content).toContain("redirect('/api-docs/petstore-api')");
		});
	});

	describe("JSON/YAML non-OpenAPI articles", () => {
		it("should save non-OpenAPI JSON as raw file in content folder", () => {
			const jsonContent = JSON.stringify({ key: "value" });
			const articles: Array<ArticleInput> = [
				{
					content: jsonContent,
					contentType: "application/json",
					contentMetadata: { title: "Config File" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			const jsonFile = files.find(f => f.path === "content/config-file.json");
			expect(jsonFile).toBeDefined();
			expect(jsonFile?.content).toBe(jsonContent);
		});
	});

	describe("authentication", () => {
		it("should generate auth files when allowedDomain is provided (Nextra 4.x uses app/layout.tsx)", () => {
			const { files } = generateSiteToMemory([], {
				...defaultOptions,
				auth: { allowedDomain: "example.com" },
			});

			// Nextra 4.x uses app/layout.tsx instead of pages/_app.tsx
			const layoutFile = files.find(f => f.path === "app/layout.tsx");
			expect(layoutFile).toBeDefined();
			expect(layoutFile?.content).toContain('allowedDomain="example.com"');
			expect(layoutFile?.content).toContain("Auth0Provider");
			expect(layoutFile?.content).toContain("AuthGate");

			const authLib = files.find(f => f.path === "lib/auth.tsx");
			expect(authLib).toBeDefined();
			expect(authLib?.content).toContain("@example.com");

			// Should NOT have Nextra 3.x auth files
			const oldAppFile = files.find(f => f.path === "pages/_app.tsx");
			expect(oldAppFile).toBeUndefined();
		});

		it("should add auth0 dependency to package.json", () => {
			const { files } = generateSiteToMemory([], {
				...defaultOptions,
				auth: { allowedDomain: "example.com" },
			});

			const packageJson = files.find(f => f.path === "package.json");
			expect(packageJson).toBeDefined();
			const pkg = JSON.parse(packageJson?.content || "{}");
			expect(pkg.dependencies["@auth0/auth0-react"]).toBeDefined();
		});

		it("should not include auth dependencies when no auth configured", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const packageJson = files.find(f => f.path === "package.json");
			const pkg = JSON.parse(packageJson?.content || "{}");
			expect(pkg.dependencies["@auth0/auth0-react"]).toBeUndefined();
		});
	});

	describe("navigation", () => {
		it("should generate content/_meta.ts with navbar structure (JOLLI-191/192)", () => {
			const articles: Array<ArticleInput> = [
				{ content: "", contentMetadata: { title: "Getting Started" } },
				{ content: "", contentMetadata: { title: "Advanced Guide" } },
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			expect(metaFile?.content).toContain("export default");

			// JOLLI-191/192: _meta.ts uses hidden index (no "Docs" link)
			expect(metaFile?.content).toContain("'index': { display: 'hidden' }");
		});

		it("should always generate _meta.ts in regeneration mode", () => {
			const articles: Array<ArticleInput> = [
				{ content: "# Original", contentMetadata: { title: "Original Article" } },
				{ content: "# New", contentMetadata: { title: "New Article" } },
			];
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
			});

			// _meta.ts should be generated with hidden index (no "Docs" link)
			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			expect(metaFile?.content).toContain("'index': { display: 'hidden' }");

			// MDX files should also be generated in content folder
			expect(files.find(f => f.path === "content/original-article.mdx")).toBeDefined();
			expect(files.find(f => f.path === "content/new-article.mdx")).toBeDefined();
		});
	});

	describe("theme configuration", () => {
		it("should use site name in layout (Nextra 4.x uses app/layout.tsx)", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const layoutFile = files.find(f => f.path === "app/layout.tsx");
			expect(layoutFile).toBeDefined();
			expect(layoutFile?.content).toContain("Test Site");
		});

		it("should include Layout with navbar and footer", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const layoutFile = files.find(f => f.path === "app/layout.tsx");
			expect(layoutFile).toBeDefined();
			expect(layoutFile?.content).toContain("Layout");
			expect(layoutFile?.content).toContain("navbar");
			expect(layoutFile?.content).toContain("footer");
			expect(layoutFile?.content).toContain("Generated by Jolli");
		});
	});

	describe("deployment configuration", () => {
		it("should generate vercel.json with correct settings", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const vercelJson = files.find(f => f.path === "vercel.json");
			expect(vercelJson).toBeDefined();
			const config = JSON.parse(vercelJson?.content || "{}");
			expect(config.framework).toBe("nextjs");
			// Uses npm run build to ensure pagefind runs after next build
			expect(config.buildCommand).toBe("npm run build");
		});

		it("should generate .gitignore", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const gitignore = files.find(f => f.path === ".gitignore");
			expect(gitignore).toBeDefined();
			expect(gitignore?.content).toContain("node_modules");
			expect(gitignore?.content).toContain(".next");
		});

		it("should include pagefind output directory in .gitignore", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const gitignore = files.find(f => f.path === ".gitignore");
			expect(gitignore).toBeDefined();
			expect(gitignore?.content).toContain("public/_pagefind/");
		});

		it("should include pagefind in package.json build script for search", () => {
			const { files } = generateSiteToMemory([], defaultOptions);

			const packageJson = files.find(f => f.path === "package.json");
			expect(packageJson).toBeDefined();
			const parsed = JSON.parse(packageJson?.content || "{}");
			expect(parsed.devDependencies.pagefind).toBeDefined();
			// Pagefind is chained in build script to ensure it runs on all platforms
			expect(parsed.scripts.build).toContain("pagefind");
		});
	});

	describe("safe slug sanitization with redirects", () => {
		it("should sanitize reserved word slugs and generate redirects", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Import Guide",
					contentMetadata: { title: "import" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// File should be created with safe slug
			const articleFile = files.find(f => f.path === "content/import-doc.mdx");
			expect(articleFile).toBeDefined();
			expect(articleFile?.content).toContain("title: import");

			// next.config.mjs should have redirect
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).toContain("async redirects()");
			expect(nextConfig?.content).toContain("source: '/import'");
			expect(nextConfig?.content).toContain("destination: '/import-doc'");
			expect(nextConfig?.content).toContain("permanent: true");
		});

		it("should sanitize TypeScript keyword slugs", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Interface Docs",
					contentMetadata: { title: "interface" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// File should be created with safe slug
			const articleFile = files.find(f => f.path === "content/interface-doc.mdx");
			expect(articleFile).toBeDefined();

			// next.config.mjs should have redirect
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).toContain("source: '/interface'");
			expect(nextConfig?.content).toContain("destination: '/interface-doc'");
		});

		it("should sanitize slugs starting with digits", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# 2024 Plan",
					contentMetadata: { title: "2024 Plan" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// File should be created with safe slug
			const articleFile = files.find(f => f.path === "content/2024-plan-doc.mdx");
			expect(articleFile).toBeDefined();

			// next.config.mjs should have redirect
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).toContain("source: '/2024-plan'");
			expect(nextConfig?.content).toContain("destination: '/2024-plan-doc'");
		});

		it("should not generate redirects for normal slugs", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Getting Started",
					contentMetadata: { title: "Getting Started" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// File should be created with normal slug
			const articleFile = files.find(f => f.path === "content/getting-started.mdx");
			expect(articleFile).toBeDefined();

			// next.config.mjs should NOT have redirects
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).not.toContain("async redirects()");
		});

		it("should generate multiple redirects for multiple reserved word articles", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Import Guide",
					contentMetadata: { title: "import" },
				},
				{
					content: "# Export Guide",
					contentMetadata: { title: "export" },
				},
				{
					content: "# Normal Guide",
					contentMetadata: { title: "Normal Guide" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Files should be created with safe slugs
			expect(files.find(f => f.path === "content/import-doc.mdx")).toBeDefined();
			expect(files.find(f => f.path === "content/export-doc.mdx")).toBeDefined();
			expect(files.find(f => f.path === "content/normal-guide.mdx")).toBeDefined();

			// next.config.mjs should have both redirects
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).toContain("source: '/import'");
			expect(nextConfig?.content).toContain("source: '/export'");
			// Normal guide should not have a redirect
			expect(nextConfig?.content).not.toContain("source: '/normal-guide'");
		});

		it("should not generate redirects in regeneration mode (next.config.mjs skipped)", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Import Guide",
					contentMetadata: { title: "import" },
				},
			];
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
			});

			// File should still be created with safe slug
			const articleFile = files.find(f => f.path === "content/import-doc.mdx");
			expect(articleFile).toBeDefined();

			// next.config.mjs should NOT be generated in regeneration mode
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeUndefined();
		});

		it("should generate redirects in migration mode", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Import Guide",
					contentMetadata: { title: "import" },
				},
			];
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				migrationMode: true,
			});

			// File should be created with safe slug
			const articleFile = files.find(f => f.path === "content/import-doc.mdx");
			expect(articleFile).toBeDefined();

			// next.config.mjs SHOULD be generated in migration mode
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).toContain("async redirects()");
			expect(nextConfig?.content).toContain("source: '/import'");
		});

		it("should update _meta.ts with safe slugs", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Import Guide",
					contentMetadata: { title: "import" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// _meta.ts should use safe slug
			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			expect(metaFile?.content).toContain("'import-doc': 'import'");
		});
	});
});

describe("getNextra3xFilesToDelete", () => {
	it("should return list of Nextra 3.x files to delete during migration", () => {
		const filesToDelete = getNextra3xFilesToDelete();

		// Should include Nextra 3.x Page Router files with all extensions (.js, .jsx, .ts, .tsx)
		expect(filesToDelete).toContain("pages/_app.js");
		expect(filesToDelete).toContain("pages/_app.jsx");
		expect(filesToDelete).toContain("pages/_app.ts");
		expect(filesToDelete).toContain("pages/_app.tsx");
		expect(filesToDelete).toContain("pages/_document.js");
		expect(filesToDelete).toContain("pages/_document.jsx");
		expect(filesToDelete).toContain("pages/_document.ts");
		expect(filesToDelete).toContain("pages/_document.tsx");
		expect(filesToDelete).toContain("pages/_error.js");
		expect(filesToDelete).toContain("pages/_error.jsx");
		expect(filesToDelete).toContain("pages/_error.ts");
		expect(filesToDelete).toContain("pages/_error.tsx");
		expect(filesToDelete).toContain("pages/404.js");
		expect(filesToDelete).toContain("pages/404.jsx");
		expect(filesToDelete).toContain("pages/404.ts");
		expect(filesToDelete).toContain("pages/404.tsx");
		expect(filesToDelete).toContain("pages/_meta.js");
		expect(filesToDelete).toContain("pages/_meta.global.js");
		expect(filesToDelete).toContain("pages/index.mdx");
		expect(filesToDelete).toContain("theme.config.js");
		expect(filesToDelete).toContain("theme.config.jsx");
		expect(filesToDelete).toContain("theme.config.ts");
		expect(filesToDelete).toContain("theme.config.tsx");

		// Should include old Nextra 3.x OpenAPI component files (not used in 4.x)
		expect(filesToDelete).toContain("components/ViewContext.tsx");
		expect(filesToDelete).toContain("components/NavbarApiButton.tsx");
		expect(filesToDelete).toContain("components/LogoLink.tsx");

		// Should NOT include ApiReference.tsx - it's a valid 4.x file that gets regenerated
		expect(filesToDelete).not.toContain("components/ApiReference.tsx");
		expect(filesToDelete).not.toContain("components/ApiReference.jsx");

		// Should include content/index.mdx (JOLLI-191 - root redirects to first article)
		expect(filesToDelete).toContain("content/index.mdx");
	});

	it("should return an array with expected length", () => {
		const filesToDelete = getNextra3xFilesToDelete();
		expect(Array.isArray(filesToDelete)).toBe(true);
		expect(filesToDelete.length).toBeGreaterThan(0);
	});
});

describe("folder structure preservation", () => {
	const defaultOptions: GenerateToMemoryOptions = {
		siteName: "test-site",
		displayName: "Test Site",
	};

	it("should place articles in their existing subfolder during rebuild", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
			},
			{
				content: "# Advanced Guide",
				contentMetadata: { title: "Advanced Guide" },
			},
		];

		// Simulate existing folder structure where "advanced-guide" is in a subfolder
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["getting-started"] },
					{ folderPath: "guides", metaContent: "", slugs: ["advanced-guide"] },
				],
			},
		});

		// getting-started should be in root content folder
		const rootArticle = files.find(f => f.path === "content/getting-started.mdx");
		expect(rootArticle).toBeDefined();

		// advanced-guide should be in content/guides subfolder
		const subfolderArticle = files.find(f => f.path === "content/guides/advanced-guide.mdx");
		expect(subfolderArticle).toBeDefined();

		// Should NOT be in root
		const wrongPath = files.find(f => f.path === "content/advanced-guide.mdx");
		expect(wrongPath).toBeUndefined();
	});

	it("should place new articles in root folder when not in existing structure", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
			},
			{
				content: "# New Article",
				contentMetadata: { title: "New Article" },
			},
		];

		// Only getting-started exists in folder metadata
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [{ folderPath: "guides", metaContent: "", slugs: ["getting-started"] }],
			},
		});

		// getting-started should be in guides subfolder (existing location)
		const existingArticle = files.find(f => f.path === "content/guides/getting-started.mdx");
		expect(existingArticle).toBeDefined();

		// new-article should be in root (new article)
		const newArticle = files.find(f => f.path === "content/new-article.mdx");
		expect(newArticle).toBeDefined();
	});

	it("should preserve nested folder structure", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Basics",
				contentMetadata: { title: "Basics" },
			},
			{
				content: "# Deep Nested",
				contentMetadata: { title: "Deep Nested" },
			},
		];

		// Simulate deep nesting
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "guides/beginner", metaContent: "", slugs: ["basics"] },
					{ folderPath: "guides/advanced/expert", metaContent: "", slugs: ["deep-nested"] },
				],
			},
		});

		// basics should be in content/guides/beginner
		const basicArticle = files.find(f => f.path === "content/guides/beginner/basics.mdx");
		expect(basicArticle).toBeDefined();

		// deep-nested should be in content/guides/advanced/expert
		const deepArticle = files.find(f => f.path === "content/guides/advanced/expert/deep-nested.mdx");
		expect(deepArticle).toBeDefined();
	});

	it("should preserve folder structure for JSON files", () => {
		const jsonContent = JSON.stringify({ key: "value" });
		const articles: Array<ArticleInput> = [
			{
				content: jsonContent,
				contentType: "application/json",
				contentMetadata: { title: "Config File" },
			},
		];

		// Simulate existing folder structure for the JSON file
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [{ folderPath: "data", metaContent: "", slugs: ["config-file"] }],
			},
		});

		// JSON file should be in content/data subfolder
		const jsonFile = files.find(f => f.path === "content/data/config-file.json");
		expect(jsonFile).toBeDefined();

		// Should NOT be in root
		const wrongPath = files.find(f => f.path === "content/config-file.json");
		expect(wrongPath).toBeUndefined();
	});

	it("should work when allFolderMetas is undefined", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
			},
		];

		// No folder metadata provided
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {},
		});

		// Should default to root content folder
		const article = files.find(f => f.path === "content/getting-started.mdx");
		expect(article).toBeDefined();
	});

	it("should work when allFolderMetas is empty array", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [],
			},
		});

		// Should default to root content folder
		const article = files.find(f => f.path === "content/getting-started.mdx");
		expect(article).toBeDefined();
	});

	it("should use last known folder when slug exists in multiple folders", () => {
		// This tests the edge case where the same slug appears in multiple folders
		// The last one in the array should win (based on the implementation)
		const articles: Array<ArticleInput> = [
			{
				content: "# Guide",
				contentMetadata: { title: "Guide" },
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "old-folder", metaContent: "", slugs: ["guide"] },
					{ folderPath: "new-folder", metaContent: "", slugs: ["guide"] },
				],
			},
		});

		// Should be in new-folder (last one wins)
		const article = files.find(f => f.path === "content/new-folder/guide.mdx");
		expect(article).toBeDefined();

		// Should NOT be in old-folder
		const oldPath = files.find(f => f.path === "content/old-folder/guide.mdx");
		expect(oldPath).toBeUndefined();
	});

	it("should NOT include subfolder articles in root _meta.ts", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Root Article",
				contentMetadata: { title: "Root Article" },
			},
			{
				content: "# Subfolder Article",
				contentMetadata: { title: "Subfolder Article" },
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "guides", metaContent: "", slugs: ["subfolder-article"] },
				],
			},
		});

		// Find the _meta.ts file
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Root article should be in _meta.ts
		expect(metaFile?.content).toContain("root-article");

		// Subfolder article should NOT be in root _meta.ts
		expect(metaFile?.content).not.toContain("subfolder-article");
	});

	it("should have empty nav meta when all articles are in subfolders", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Guide One",
				contentMetadata: { title: "Guide One" },
			},
			{
				content: "# Guide Two",
				contentMetadata: { title: "Guide Two" },
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [{ folderPath: "guides", metaContent: "", slugs: ["guide-one", "guide-two"] }],
			},
		});

		// Find the _meta.ts file
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Neither article should be in root _meta.ts
		expect(metaFile?.content).not.toContain("guide-one");
		expect(metaFile?.content).not.toContain("guide-two");

		// Files should still be placed in subfolder
		expect(files.find(f => f.path === "content/guides/guide-one.mdx")).toBeDefined();
		expect(files.find(f => f.path === "content/guides/guide-two.mdx")).toBeDefined();
	});

	it("should not re-add entry to root _meta.ts when article moved to subfolder", () => {
		// Scenario: User moved article to subfolder and deleted entry from root _meta.ts
		// On rebuild, the entry should NOT reappear in root _meta.ts
		const articles: Array<ArticleInput> = [
			{
				content: "# Moved Article",
				contentMetadata: { title: "Moved Article" },
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				// Article was moved to guides folder
				allFolderMetas: [{ folderPath: "guides", metaContent: "", slugs: ["moved-article"] }],
				// existingNavMeta is empty (user deleted the entry)
				existingNavMeta: {},
			},
		});

		// File should be in subfolder
		const articleFile = files.find(f => f.path === "content/guides/moved-article.mdx");
		expect(articleFile).toBeDefined();

		// Entry should NOT appear in root _meta.ts
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();
		expect(metaFile?.content).not.toContain("moved-article");
	});

	it("should preserve folder entry in root _meta.ts during rebuild", () => {
		// Scenario: User manually added folder entry to _meta.ts, rebuild should preserve it
		const articles: Array<ArticleInput> = [
			{
				content: "# Root Article",
				contentMetadata: { title: "Root Article" },
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				// Folder exists with articles
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "guides", metaContent: "", slugs: [] }, // Empty folder, but user added entry
				],
				// User manually added "guides" entry to _meta.ts
				existingNavMeta: {
					"root-article": "Root Article",
					guides: "User Guides", // Manually added folder entry
				},
			},
		});

		// Find the _meta.ts file
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Root article should be in _meta.ts
		expect(metaFile?.content).toContain("root-article");

		// Folder entry should be preserved (not removed as orphan)
		expect(metaFile?.content).toContain("guides");
		expect(metaFile?.content).toContain("User Guides");
	});

	it("should preserve nested folder entries during rebuild", () => {
		// Scenario: User has nested folders and manually added entries
		const articles: Array<ArticleInput> = [
			{
				content: "# Index",
				contentMetadata: { title: "Index" },
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["index"] },
					{ folderPath: "docs", metaContent: "", slugs: [] },
					{ folderPath: "docs/advanced", metaContent: "", slugs: [] },
				],
				existingNavMeta: {
					index: "Home",
					docs: "Documentation", // Folder entry
					advanced: "Advanced Topics", // Nested folder entry
				},
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Both folder entries should be preserved
		expect(metaFile?.content).toContain("docs");
		expect(metaFile?.content).toContain("advanced");
	});
});

describe("API Reference title preservation", () => {
	const petstoreSpec = JSON.stringify({
		openapi: "3.0.0",
		info: { title: "Petstore API", version: "1.0.0" },
		paths: {},
	});

	const usersSpec = JSON.stringify({
		openapi: "3.0.0",
		info: { title: "Users API", version: "1.0.0" },
		paths: {},
	});

	it("should preserve custom API Reference title during regeneration (single→single)", () => {
		const articles: Array<ArticleInput> = [
			{
				content: petstoreSpec,
				contentType: "application/json",
				contentMetadata: { title: "Petstore" },
			},
		];

		// Simulate existing _meta.ts with custom API Reference title
		const existingNavMeta = {
			"api-reference": {
				title: "My Custom API Title", // User customized this
				type: "page" as const,
				href: "/api-docs/petstore",
			},
		};

		const { files } = generateSiteToMemory(articles, {
			siteName: "test-site",
			displayName: "Test Site",
			regenerationMode: true,
			migrationContext: {
				existingNavMeta,
				deletedSlugs: [],
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Should preserve the custom title "My Custom API Title", NOT revert to "API Reference"
		expect(metaFile?.content).toContain("title: 'My Custom API Title'");
		expect(metaFile?.content).not.toContain("title: 'API Reference'");
	});

	it("should move custom title to specific item when transitioning single→menu", () => {
		// Start with single spec that has custom title, add second spec
		const articles: Array<ArticleInput> = [
			{
				content: petstoreSpec,
				contentType: "application/json",
				contentMetadata: { title: "Petstore" },
			},
			{
				content: usersSpec,
				contentType: "application/json",
				contentMetadata: { title: "Users" },
			},
		];

		// Existing nav meta had single spec with custom title
		const existingNavMeta = {
			"api-reference": {
				title: "My Petstore API", // Custom title for the single petstore spec
				type: "page" as const,
				href: "/api-docs/petstore",
			},
		};

		const { files } = generateSiteToMemory(articles, {
			siteName: "test-site",
			displayName: "Test Site",
			regenerationMode: true,
			migrationContext: {
				existingNavMeta,
				deletedSlugs: [],
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Parent menu should use default "API Reference" title
		expect(metaFile?.content).toContain("title: 'API Reference'");
		// The petstore item should have the custom title "My Petstore API"
		expect(metaFile?.content).toContain("title: 'My Petstore API'");
		// The users item should use title from article metadata (not the OpenAPI spec info.title)
		expect(metaFile?.content).toContain("title: 'Users'");
	});

	it("should preserve individual item titles in menu→menu transition", () => {
		const articles: Array<ArticleInput> = [
			{
				content: petstoreSpec,
				contentType: "application/json",
				contentMetadata: { title: "Petstore" },
			},
			{
				content: usersSpec,
				contentType: "application/json",
				contentMetadata: { title: "Users" },
			},
		];

		// Existing nav meta is a menu with custom item titles
		const { files } = generateSiteToMemory(articles, {
			siteName: "test-site",
			displayName: "Test Site",
			regenerationMode: true,
			migrationContext: {
				existingNavMeta: {
					"api-reference": {
						title: "API Reference",
						type: "menu",
						items: {
							petstore: { title: "Pet Shop API", href: "/api-docs/petstore" },
							users: { title: "User Management API", href: "/api-docs/users" },
						},
					},
				},
				deletedSlugs: [],
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Should preserve custom item titles
		expect(metaFile?.content).toContain("title: 'Pet Shop API'");
		expect(metaFile?.content).toContain("title: 'User Management API'");
	});

	it("should preserve custom parent menu title in menu→menu transition", () => {
		const articles: Array<ArticleInput> = [
			{
				content: petstoreSpec,
				contentType: "application/json",
				contentMetadata: { title: "Petstore" },
			},
			{
				content: usersSpec,
				contentType: "application/json",
				contentMetadata: { title: "Users" },
			},
		];

		// Existing nav meta has custom parent menu title
		const { files } = generateSiteToMemory(articles, {
			siteName: "test-site",
			displayName: "Test Site",
			regenerationMode: true,
			migrationContext: {
				existingNavMeta: {
					"api-reference": {
						title: "Our APIs", // Custom parent menu title
						type: "menu",
						items: {
							petstore: { title: "Petstore API", href: "/api-docs/petstore" },
							users: { title: "Users API", href: "/api-docs/users" },
						},
					},
				},
				deletedSlugs: [],
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Should preserve custom parent menu title
		expect(metaFile?.content).toContain("title: 'Our APIs'");
	});

	it("should apply item title to single page when transitioning menu→single", () => {
		// Menu with two specs, remove one so it becomes single
		const articles: Array<ArticleInput> = [
			{
				content: petstoreSpec,
				contentType: "application/json",
				contentMetadata: { title: "Petstore" },
			},
			// users spec removed
		];

		// Existing nav meta was a menu with custom item titles
		const { files } = generateSiteToMemory(articles, {
			siteName: "test-site",
			displayName: "Test Site",
			regenerationMode: true,
			migrationContext: {
				existingNavMeta: {
					"api-reference": {
						title: "Our APIs", // This parent title should NOT be used for single page
						type: "menu",
						items: {
							petstore: { title: "Pet Shop API", href: "/api-docs/petstore" },
							users: { title: "User Management API", href: "/api-docs/users" },
						},
					},
				},
				deletedSlugs: [],
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Should use petstore's custom item title for the single page
		expect(metaFile?.content).toContain("title: 'Pet Shop API'");
		// Should NOT use the parent menu title
		expect(metaFile?.content).not.toContain("title: 'Our APIs'");
	});

	it("should remove api-reference entry when all OpenAPI specs are removed", () => {
		// Articles: Only markdown now, no OpenAPI specs
		const articles: Array<ArticleInput> = [
			{
				content: "# Getting Started\n\nWelcome!",
				contentType: "text/markdown",
				contentMetadata: { title: "Getting Started" },
			},
		];

		// Existing nav meta had an API reference entry from previous generation
		const { files } = generateSiteToMemory(articles, {
			siteName: "test-site",
			displayName: "Test Site",
			regenerationMode: true,
			migrationContext: {
				existingNavMeta: {
					"getting-started": "Getting Started",
					"api-reference": {
						title: "API Reference",
						type: "page" as const,
						href: "/api-docs/petstore",
					},
				},
				deletedSlugs: [],
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Should NOT contain api-reference entry since no OpenAPI specs exist
		expect(metaFile?.content).not.toContain("api-reference");
		// Should still contain the markdown article
		expect(metaFile?.content).toContain("getting-started");
	});

	it("should remove api-reference menu entry when all OpenAPI specs are removed", () => {
		// Articles: Only markdown now, no OpenAPI specs
		const articles: Array<ArticleInput> = [
			{
				content: "# Getting Started\n\nWelcome!",
				contentType: "text/markdown",
				contentMetadata: { title: "Getting Started" },
			},
		];

		// Existing nav meta had an API reference menu from previous generation with multiple specs
		const { files } = generateSiteToMemory(articles, {
			siteName: "test-site",
			displayName: "Test Site",
			regenerationMode: true,
			migrationContext: {
				existingNavMeta: {
					"getting-started": "Getting Started",
					"api-reference": {
						title: "Our APIs",
						type: "menu" as const,
						items: {
							petstore: { title: "Pet Shop API", href: "/api-docs/petstore" },
							users: { title: "User Management API", href: "/api-docs/users" },
						},
					},
				},
				deletedSlugs: [],
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Should NOT contain api-reference entry since no OpenAPI specs exist
		expect(metaFile?.content).not.toContain("api-reference");
		// Should still contain the markdown article
		expect(metaFile?.content).toContain("getting-started");
	});
});
