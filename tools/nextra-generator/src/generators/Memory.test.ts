import type { ArticleInput, GenerateToMemoryOptions } from "../types.js";
import { generateSiteToMemory, getNextra3xFilesToDelete } from "./memory.js";
import { describe, expect, it } from "vitest";

const defaultOptions: GenerateToMemoryOptions = {
	siteName: "test-site",
	displayName: "Test Site",
};

const openApiContent = JSON.stringify({
	openapi: "3.0.0",
	info: { title: "Test API", version: "1.0.0" },
	paths: {
		"/users": {
			get: { summary: "Get users" },
		},
	},
});

describe("generateSiteToMemory", () => {
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

		it("should skip empty folder articles and redirect to first real article", () => {
			// Scenario: an empty folder article appears first alphabetically
			// but should be skipped in favor of a real content article
			const articles: Array<ArticleInput> = [
				// Folder article with no children and no content (alphabetically first)
				{ content: "", contentMetadata: { title: "Administration" }, isFolder: true },
				// Real article with content (should be the redirect target)
				{ content: "# Getting Started\nWelcome!", contentMetadata: { title: "Getting Started" } },
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			const rootPage = files.find(f => f.path === "app/page.tsx");
			expect(rootPage).toBeDefined();
			// Should redirect to the real article, not the empty folder
			expect(rootPage?.content).toContain("redirect('/getting-started')");
			expect(rootPage?.content).not.toContain("administration");

			// Empty folder should NOT appear in _meta.ts (no content file exists for it)
			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			expect(metaFile?.content).not.toContain("administration");
			expect(metaFile?.content).toContain("getting-started");
		});

		it("should redirect to folder with content (index.md) rather than skipping it during regeneration", () => {
			// Scenario: regeneration where the repo's allFolderMetas has empty slugs for a
			// folder with content. This happens when the repo's child slugs don't match the
			// article-derived slugs (e.g., after renames). The folder itself has index.md, so
			// it's still a valid redirect target — Nextra serves the index.md at the folder path.
			const articles: Array<ArticleInput> = [
				{
					content: "# Getting Started\nWelcome to getting started",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
				{
					content: "# Product Overview\nLearn about the product",
					contentMetadata: { title: "Product Overview" },
					folderPath: "Getting Started",
				},
				{
					content: "# Blah\nSome content",
					contentMetadata: { title: "Blah" },
				},
			];
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				migrationContext: {
					allFolderMetas: [
						// Repo has the folder but with empty slugs (slug mismatch after rename)
						{ folderPath: "getting-started", metaContent: "", slugs: [] },
					],
				},
			});

			const rootPage = files.find(f => f.path === "app/page.tsx");
			expect(rootPage).toBeDefined();
			// Folder has content but folderFirstChild can't resolve (empty slugs).
			// Falls back to foldersWithContent — folder path is a valid redirect target.
			expect(rootPage?.content).toContain("redirect('/getting-started')");
			expect(rootPage?.content).not.toContain("blah");
		});

		it("should resolve nested folders WITHOUT content to first leaf article", () => {
			// Scenario: root folder's first child is a folder WITHOUT content (no index.md).
			// Must recurse through nested folders to find the first leaf article.
			const articles: Array<ArticleInput> = [
				// Root-level folder with NO content (empty body)
				{
					content: "",
					contentMetadata: { title: "Contributing RENAME" },
					isFolder: true,
				},
				// Nested folder with NO content
				{
					content: "",
					contentMetadata: { title: "Workflows" },
					isFolder: true,
					folderPath: "Contributing RENAME",
				},
				// Leaf articles
				{
					content: "# Commits\nHow to make commits",
					contentMetadata: { title: "Commits" },
					folderPath: "Contributing RENAME/Workflows",
				},
				{
					content: "# Pull Requests\nHow to submit PRs",
					contentMetadata: { title: "Pull Requests" },
					folderPath: "Contributing RENAME/Workflows",
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			const rootPage = files.find(f => f.path === "app/page.tsx");
			expect(rootPage).toBeDefined();
			// No content on folder → resolve through nested folders to first leaf
			expect(rootPage?.content).toContain("redirect('/contributing-rename/workflows/commits')");
		});

		it("should resolve redirect through nested folders without index files during regeneration", () => {
			// Scenario: tabs mode regeneration. The first top-level entry is a folder
			// containing a subfolder, neither of which has an index.md. The repo's
			// allFolderMetas has empty slugs for both folders (no .md files directly
			// inside). The redirect must still resolve through the folder hierarchy
			// to the first leaf article.
			const articles: Array<ArticleInput> = [
				// Top-level folder — no content (no index.md)
				{
					content: "",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
				// Nested folder — no content (no index.md)
				{
					content: "",
					contentMetadata: { title: "Tutorials" },
					isFolder: true,
					folderPath: "Getting Started",
				},
				// Leaf article inside the nested folder
				{
					content: "# Quick Start\nGet up and running",
					contentMetadata: { title: "Quick Start" },
					folderPath: "Getting Started/Tutorials",
				},
				// Another top-level article (should NOT be the redirect target)
				{
					content: "# FAQ\nFrequently asked questions",
					contentMetadata: { title: "FAQ" },
				},
			];
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				theme: { navigationMode: "tabs" },
				regenerationMode: true,
				migrationContext: {
					allFolderMetas: [
						// Both folders have empty slugs (no .md files directly inside)
						{ folderPath: "getting-started", metaContent: "", slugs: [] },
						{
							folderPath: "getting-started/tutorials",
							metaContent: "",
							slugs: ["quick-start"],
						},
					],
				},
			});

			const rootPage = files.find(f => f.path === "app/page.tsx");
			expect(rootPage).toBeDefined();
			// Should resolve: getting-started → tutorials → quick-start
			expect(rootPage?.content).toContain("redirect('/getting-started/tutorials/quick-start')");
			expect(rootPage?.content).not.toContain("faq");
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

		it("should generate all config files in regeneration mode for self-healing", () => {
			const { files } = generateSiteToMemory([], {
				...defaultOptions,
				regenerationMode: true,
			});

			const paths = files.map(f => f.path);
			// All config files are generated in regeneration mode so the site
			// can self-heal if files are accidentally deleted (e.g., by navigation sync)
			expect(paths).toContain("package.json");
			expect(paths).toContain("vercel.json");
			expect(paths).toContain("next.config.mjs");
			expect(paths).toContain("tsconfig.json");
			expect(paths).toContain(".gitignore");
			expect(paths).toContain("app/layout.tsx");
			expect(paths).toContain("app/[...mdxPath]/page.tsx");
			expect(paths).toContain("mdx-components.tsx");
			expect(paths).toContain("app/icon.tsx");
			expect(paths).toContain("app/favicon.ico/route.ts");
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

		it("should preserve existing _meta.ts order when preserveNavOrder is true", () => {
			// When auto-sync is off (manual article selection), user nav customizations
			// from the Navigation tab should survive content publish.
			// Existing _meta.ts has articles in a custom order (B, A) — different from space order (A, B).
			const articles: Array<ArticleInput> = [
				{ content: "# Alpha", contentMetadata: { title: "Alpha Article" } },
				{ content: "# Beta", contentMetadata: { title: "Beta Article" } },
			];
			const existingMetaContent = `export default {\n  'beta-article': 'Beta Article',\n  'alpha-article': 'Alpha Article'\n}`;
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				preserveNavOrder: true,
				migrationContext: {
					existingNavMeta: { "beta-article": "Beta Article", "alpha-article": "Alpha Article" },
					allFolderMetas: [
						{ folderPath: "", metaContent: existingMetaContent, slugs: ["beta-article", "alpha-article"] },
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			// beta-article should come BEFORE alpha-article (existing order preserved)
			const betaIdx = metaFile?.content.indexOf("beta-article");
			const alphaIdx = metaFile?.content.indexOf("alpha-article");
			expect(betaIdx).toBeLessThan(alphaIdx);
		});

		it("should reorder _meta.ts to space order when preserveNavOrder is false", () => {
			// When auto-sync is on, space article ordering takes priority.
			const articles: Array<ArticleInput> = [
				{ content: "# Alpha", contentMetadata: { title: "Alpha Article" } },
				{ content: "# Beta", contentMetadata: { title: "Beta Article" } },
			];
			const existingMetaContent = `export default {\n  'beta-article': 'Beta Article',\n  'alpha-article': 'Alpha Article'\n}`;
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				preserveNavOrder: false,
				migrationContext: {
					existingNavMeta: { "beta-article": "Beta Article", "alpha-article": "Alpha Article" },
					allFolderMetas: [
						{ folderPath: "", metaContent: existingMetaContent, slugs: ["beta-article", "alpha-article"] },
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			// alpha-article should come BEFORE beta-article (space order: A then B)
			const alphaIdx = metaFile?.content.indexOf("alpha-article");
			const betaIdx = metaFile?.content.indexOf("beta-article");
			expect(alphaIdx).toBeLessThan(betaIdx);
		});

		it("should restore space ordering when switching from auto-sync OFF to ON", () => {
			// Scenario: user had auto-sync OFF with custom order [Delta, Beta, Charlie, Alpha],
			// then switches to auto-sync ON. Articles in DB sortOrder: [Alpha, Beta, Charlie, Delta, Echo].
			// The existing _meta.ts has the old custom order plus Echo is a new article not in existing meta.
			const articles: Array<ArticleInput> = [
				{ content: "# Alpha", contentMetadata: { title: "Alpha" } },
				{ content: "# Beta", contentMetadata: { title: "Beta" } },
				{ content: "# Charlie", contentMetadata: { title: "Charlie" } },
				{ content: "# Delta", contentMetadata: { title: "Delta" } },
				{ content: "# Echo", contentMetadata: { title: "Echo" } },
			];
			// Old _meta.ts had custom order from auto-sync OFF: Delta, Beta, Charlie, Alpha
			const existingMetaContent = [
				"export default {",
				"  index: { display: 'hidden' },",
				"  delta: 'Delta',",
				"  beta: 'Beta',",
				"  charlie: 'Charlie',",
				"  alpha: 'Alpha'",
				"}",
			].join("\n");
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				preserveNavOrder: false, // auto-sync ON
				migrationContext: {
					existingNavMeta: {
						index: { display: "hidden" },
						delta: "Delta",
						beta: "Beta",
						charlie: "Charlie",
						alpha: "Alpha",
					},
					allFolderMetas: [
						{
							folderPath: "",
							metaContent: existingMetaContent,
							slugs: ["delta", "beta", "charlie", "alpha"],
						},
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			const content = metaFile?.content ?? "";

			// Index (hidden) should appear first
			const indexIdx = content.indexOf("index");
			const alphaIdx = content.indexOf("alpha");
			const betaIdx = content.indexOf("beta");
			const charlieIdx = content.indexOf("charlie");
			const deltaIdx = content.indexOf("delta");
			const echoIdx = content.indexOf("echo");

			expect(indexIdx).toBeGreaterThan(-1);
			expect(alphaIdx).toBeGreaterThan(-1);
			expect(echoIdx).toBeGreaterThan(-1);

			// Space order: index, alpha, beta, charlie, delta, echo
			expect(indexIdx).toBeLessThan(alphaIdx);
			expect(alphaIdx).toBeLessThan(betaIdx);
			expect(betaIdx).toBeLessThan(charlieIdx);
			expect(charlieIdx).toBeLessThan(deltaIdx);
			expect(deltaIdx).toBeLessThan(echoIdx);

			// Also verify the redirect goes to the FIRST article in space order
			const rootPage = files.find(f => f.path === "app/page.tsx");
			expect(rootPage).toBeDefined();
			expect(rootPage?.content).toContain("redirect('/alpha')");
		});

		it("should reorder root _meta.ts with folders when switching auto-sync OFF to ON", () => {
			// Scenario matching real user data:
			// - Existing _meta.ts has 3 root articles in old order
			// - New build has 7 root articles + folder children (12 total)
			// - Articles arrive in DB sortOrder which includes both root and folder children
			const articles: Array<ArticleInput> = [
				// Root articles in desired space order
				{ content: "# Product Overview", contentMetadata: { title: "Product Overview RENAME" } },
				{
					content: "# Workflows overview",
					contentMetadata: { title: "Workflows" },
					isFolder: true,
					folderPath: "",
				},
				{ content: "# Tooling", contentMetadata: { title: "Tooling NEW NAME" } },
				{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
				// Subfolder children (in Workflows folder)
				{ content: "# IDE setup", contentMetadata: { title: "IDE" }, folderPath: "workflows" },
				{ content: "# Linear integration", contentMetadata: { title: "Linear" }, folderPath: "workflows" },
				{ content: "# Commits guide", contentMetadata: { title: "Commits" }, folderPath: "workflows" },
				{
					content: "# Pull Requests guide",
					contentMetadata: { title: "Pull Requests" },
					folderPath: "workflows",
				},
				// More root articles
				{ content: "# Contributing", contentMetadata: { title: "Contributing RENAME" } },
				{ content: "# New Article", contentMetadata: { title: "New Article After Creation" } },
				// Another subfolder child
				{
					content: "# Issue Tracking",
					contentMetadata: { title: "Issue Tracking" },
					folderPath: "workflows",
				},
				{ content: "# BLAH", contentMetadata: { title: "BLAH BLAH" } },
			];

			// Existing _meta.ts only had 3 articles in a different order
			const existingMetaContent = [
				"export default {",
				"  'index': { display: 'hidden' },",
				"  'getting-started': 'Getting Started',",
				"  'contributing-rename': 'Contributing RENAME',",
				"  'blah-blah': 'BLAH BLAH'",
				"}",
			].join("\n");

			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				preserveNavOrder: false, // auto-sync ON
				migrationContext: {
					existingNavMeta: {
						index: { display: "hidden" },
						"getting-started": "Getting Started",
						"contributing-rename": "Contributing RENAME",
						"blah-blah": "BLAH BLAH",
					},
					allFolderMetas: [
						{
							folderPath: "",
							metaContent: existingMetaContent,
							slugs: ["getting-started", "contributing-rename", "blah-blah"],
						},
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			const content = metaFile?.content ?? "";

			// Root articles should be in DB input order (space order), NOT existing _meta.ts order
			const productIdx = content.indexOf("product-overview-rename");
			const workflowsIdx = content.indexOf("workflows");
			const toolingIdx = content.indexOf("tooling-new-name");
			const gettingIdx = content.indexOf("getting-started");
			const contributingIdx = content.indexOf("contributing-rename");
			const newArticleIdx = content.indexOf("new-article-after-creation");
			const blahIdx = content.indexOf("blah-blah");

			// All root entries should be present
			expect(productIdx).toBeGreaterThan(-1);
			expect(workflowsIdx).toBeGreaterThan(-1);
			expect(toolingIdx).toBeGreaterThan(-1);
			expect(gettingIdx).toBeGreaterThan(-1);
			expect(contributingIdx).toBeGreaterThan(-1);
			expect(newArticleIdx).toBeGreaterThan(-1);
			expect(blahIdx).toBeGreaterThan(-1);

			// Order should match DB input order (space tree sortOrder) — no folders-first treatment.
			// product-overview-rename, workflows, tooling-new-name, getting-started,
			// contributing-rename, new-article-after-creation, blah-blah
			expect(productIdx).toBeLessThan(workflowsIdx);
			expect(workflowsIdx).toBeLessThan(toolingIdx);
			expect(toolingIdx).toBeLessThan(gettingIdx);
			expect(gettingIdx).toBeLessThan(contributingIdx);
			expect(contributingIdx).toBeLessThan(newArticleIdx);
			expect(newArticleIdx).toBeLessThan(blahIdx);
		});
		it("should reorder _meta.ts for folder-based site matching real repo structure", () => {
			// Exactly matches https://github.com/Jolli-sample-repos/local-aidan-new-my-test-6
			// Repo structure:
			//   content/_meta.ts (contributing-rename BEFORE getting-started - WRONG)
			//   content/blah-blah.md
			//   content/contributing-rename/_meta.ts (folder, NO index.md)
			//   content/contributing-rename/issue-tracking/_meta.ts + linear.md
			//   content/contributing-rename/workflows/_meta.ts + commits.md
			//   content/getting-started/_meta.ts + index.md (folder WITH content)
			//   content/getting-started/product-overview-rename/_meta.ts + index.md + new-article-after-creation.md
			//   content/getting-started/tooling-new-name/_meta.ts + index.md + ide.md + pull-requests.md
			//
			// DB sortOrder puts getting-started before contributing-rename.
			// Expected: _meta.ts should be reordered to getting-started, contributing-rename, blah-blah

			const articles: Array<ArticleInput> = [
				// Root: getting-started folder (WITH content, sortOrder lowest)
				{
					content: "# Getting Started\n\nWelcome to the docs.",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
				// Child of getting-started: product-overview-rename subfolder
				{
					content: "# Product Overview",
					contentMetadata: { title: "Product Overview Rename" },
					isFolder: true,
					folderPath: "getting-started",
				},
				// Child of product-overview-rename
				{
					content: "# New Article",
					contentMetadata: { title: "New Article After Creation" },
					folderPath: "getting-started/product-overview-rename",
				},
				// Child of getting-started: tooling-new-name subfolder
				{
					content: "# Tooling",
					contentMetadata: { title: "Tooling New Name" },
					isFolder: true,
					folderPath: "getting-started",
				},
				// Children of tooling-new-name
				{ content: "# IDE", contentMetadata: { title: "IDE" }, folderPath: "getting-started/tooling-new-name" },
				{
					content: "# Pull Requests",
					contentMetadata: { title: "Pull Requests" },
					folderPath: "getting-started/tooling-new-name",
				},
				// Root: contributing-rename folder (NO content, sortOrder higher)
				{
					content: "",
					contentMetadata: { title: "Contributing RENAME" },
					isFolder: true,
				},
				// Child of contributing-rename: issue-tracking subfolder
				{
					content: "",
					contentMetadata: { title: "Issue Tracking" },
					isFolder: true,
					folderPath: "contributing-rename",
				},
				// Child of issue-tracking
				{
					content: "# Linear",
					contentMetadata: { title: "Linear" },
					folderPath: "contributing-rename/issue-tracking",
				},
				// Child of contributing-rename: workflows subfolder
				{
					content: "",
					contentMetadata: { title: "Workflows" },
					isFolder: true,
					folderPath: "contributing-rename",
				},
				// Child of workflows
				{
					content: "# Commits",
					contentMetadata: { title: "Commits" },
					folderPath: "contributing-rename/workflows",
				},
				// Root: blah-blah article (regular, sortOrder highest)
				{ content: "# BLAH BLAH", contentMetadata: { title: "BLAH BLAH" } },
			];

			// Existing _meta.ts from repo has contributing-rename BEFORE getting-started (WRONG order)
			const existingRootMeta = [
				"export default {",
				"  'index': { display: 'hidden' },",
				"  'contributing-rename': 'Contributing RENAME',",
				"  'getting-started': 'Getting Started',",
				"  'blah-blah': 'BLAH BLAH'",
				"}",
			].join("\n");

			// allFolderMetas matches the actual repo file structure
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				preserveNavOrder: false, // auto-sync ON — should reorder
				migrationContext: {
					existingNavMeta: {
						index: { display: "hidden" },
						"contributing-rename": "Contributing RENAME",
						"getting-started": "Getting Started",
						"blah-blah": "BLAH BLAH",
					},
					allFolderMetas: [
						{ folderPath: "", metaContent: existingRootMeta, slugs: ["blah-blah"] },
						{
							folderPath: "contributing-rename",
							metaContent:
								"export default { 'issue-tracking': 'Issue Tracking', 'workflows': 'Workflows' }",
							slugs: [],
						},
						{
							folderPath: "contributing-rename/issue-tracking",
							metaContent: "export default { 'linear': 'Linear' }",
							slugs: ["linear"],
						},
						{
							folderPath: "contributing-rename/workflows",
							metaContent: "export default { 'commits': 'Commits' }",
							slugs: ["commits"],
						},
						{
							folderPath: "getting-started",
							metaContent:
								"export default { 'product-overview-rename': 'Product Overview Rename', 'tooling-new-name': 'Tooling New Name' }",
							slugs: ["index"],
						},
						{
							folderPath: "getting-started/product-overview-rename",
							metaContent:
								"export default { 'index': 'Product Overview Rename', 'new-article-after-creation': 'New Article After Creation' }",
							slugs: ["index", "new-article-after-creation"],
						},
						{
							folderPath: "getting-started/tooling-new-name",
							metaContent:
								"export default { 'index': 'Tooling New Name', 'ide': 'IDE', 'pull-requests': 'Pull Requests' }",
							slugs: ["index", "ide", "pull-requests"],
						},
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			const content = metaFile?.content ?? "";

			// The critical check: getting-started MUST come before contributing-rename
			const gettingIdx = content.indexOf("getting-started");
			const contributingIdx = content.indexOf("contributing-rename");
			const blahIdx = content.indexOf("blah-blah");

			expect(gettingIdx).toBeGreaterThan(-1);
			expect(contributingIdx).toBeGreaterThan(-1);
			expect(blahIdx).toBeGreaterThan(-1);

			// Order must match DB sortOrder: getting-started, contributing-rename, blah-blah
			expect(gettingIdx).toBeLessThan(contributingIdx);
			expect(contributingIdx).toBeLessThan(blahIdx);
		});
	});

	describe("markdown articles", () => {
		it("should generate .md files for markdown articles in content folder (default contentType)", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Hello World",
					contentMetadata: { title: "Getting Started" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// Default contentType (undefined or text/markdown) generates .md files
			const articleFile = files.find(f => f.path === "content/getting-started.md");
			expect(articleFile).toBeDefined();
			expect(articleFile?.content).toContain("title: Getting Started");
			expect(articleFile?.content).toContain("# Hello World");
		});

		it("should generate .mdx files for text/mdx contentType", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Hello World",
					contentType: "text/mdx",
					contentMetadata: { title: "Getting Started" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// text/mdx contentType generates .mdx files (strict MDX parsing)
			const articleFile = files.find(f => f.path === "content/getting-started.mdx");
			expect(articleFile).toBeDefined();
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

			const articleFile = files.find(f => f.path === "content/article.md");
			expect(articleFile?.content).toContain("**Source:** [GitHub](https://github.com/example)");
		});
	});

	describe("OpenAPI articles", () => {
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

			// package.json, vercel.json, next.config.mjs are always generated (critical for build/branding)
			const paths = files.map(f => f.path);
			expect(paths).toContain("package.json");
			expect(paths).toContain("vercel.json");
			expect(paths).toContain("next.config.mjs");
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
			// - Hidden index entry prevents Nextra from auto-generating an "Index" nav item
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

			// JOLLI-191/192: _meta.ts uses API Reference with hidden index
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

			// JOLLI-191/192: Multiple OpenAPI specs create a menu dropdown with hidden index
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

			// JOLLI-191/192: _meta.ts has hidden index to prevent Nextra from auto-generating Index nav item
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

			// _meta.ts should be generated with hidden index
			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			expect(metaFile?.content).toContain("'index': { display: 'hidden' }");

			// MDX files should also be generated in content folder
			expect(files.find(f => f.path === "content/original-article.md")).toBeDefined();
			expect(files.find(f => f.path === "content/new-article.md")).toBeDefined();
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
			expect(layoutFile?.content).toContain("Powered by Jolli");
		});

		it("should apply all branding theme options", () => {
			const { files } = generateSiteToMemory([], {
				...defaultOptions,
				theme: {
					logo: "Custom Logo",
					logoUrl: "https://example.com/logo.png",
					favicon: "https://example.com/favicon.ico",
					primaryHue: 270,
					footer: "Custom Footer Text",
					defaultTheme: "dark",
					projectLink: "https://github.com/example/project",
					chatLink: "https://discord.gg/example",
					chatIcon: "discord",
					hideToc: false, // Show TOC to test tocTitle
					tocTitle: "Page Contents",
					sidebarDefaultCollapseLevel: 3,
					headerLinks: {
						items: [
							{ label: "Docs", url: "https://docs.example.com" },
							{ label: "Blog", url: "https://blog.example.com" },
						],
					},
					footerConfig: {
						copyright: "2024 Example Inc.",
						columns: [
							{
								title: "Resources",
								links: [{ label: "Documentation", url: "https://docs.example.com" }],
							},
						],
						socialLinks: {
							github: "https://github.com/example",
							twitter: "https://twitter.com/example",
						},
					},
					fontFamily: "space-grotesk",
					codeTheme: "dracula",
					borderRadius: "rounded",
					spacingDensity: "airy",
					navigationMode: "tabs",
				},
			});

			// Layout should contain branding elements
			const layoutFile = files.find(f => f.path === "app/layout.tsx");
			expect(layoutFile).toBeDefined();
			expect(layoutFile?.content).toContain("Custom Logo");
			expect(layoutFile?.content).toContain("https://example.com/logo.png");
			expect(layoutFile?.content).toContain("title: 'Page Contents'"); // tocTitle in toc prop
			expect(layoutFile?.content).toContain("defaultMenuCollapseLevel: 3"); // sidebarDefaultCollapseLevel

			// globals.css should have theme variables
			const globalStyles = files.find(f => f.path === "app/globals.css");
			expect(globalStyles).toBeDefined();
			expect(globalStyles?.content).toContain("--jolli-primary-hue: 270");
			expect(globalStyles?.content).toContain("Space Grotesk"); // font family

			// next.config.mjs should have code theme
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).toContain("dracula");
		});

		it("should handle hideToc option", () => {
			const { files } = generateSiteToMemory([], {
				...defaultOptions,
				theme: {
					hideToc: true,
				},
			});

			const layoutFile = files.find(f => f.path === "app/layout.tsx");
			expect(layoutFile).toBeDefined();
			expect(layoutFile?.content).toContain("toc={{ extraContent: null }}");
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

			// File should be created with the slug as-is (no -doc suffix)
			const articleFile = files.find(f => f.path === "content/import.md");
			expect(articleFile).toBeDefined();
			expect(articleFile?.content).toContain("title: import");

			// next.config.mjs should NOT have redirects (no longer needed)
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).not.toContain("async redirects()");
		});

		it("should preserve TypeScript keyword slugs without modification", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Interface Docs",
					contentMetadata: { title: "interface" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// File should be created with the slug as-is
			const articleFile = files.find(f => f.path === "content/interface.md");
			expect(articleFile).toBeDefined();

			// next.config.mjs should NOT have redirects
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).not.toContain("async redirects()");
		});

		it("should preserve slugs starting with digits without modification", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# 2024 Plan",
					contentMetadata: { title: "2024 Plan" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// File should be created with the slug as-is
			const articleFile = files.find(f => f.path === "content/2024-plan.md");
			expect(articleFile).toBeDefined();

			// next.config.mjs should NOT have redirects
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).not.toContain("async redirects()");
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
			const articleFile = files.find(f => f.path === "content/getting-started.md");
			expect(articleFile).toBeDefined();

			// next.config.mjs should NOT have redirects
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).not.toContain("async redirects()");
		});

		it("should preserve reserved word slugs without redirects", () => {
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

			// Files should be created with slugs as-is (no -doc suffix)
			expect(files.find(f => f.path === "content/import.md")).toBeDefined();
			expect(files.find(f => f.path === "content/export.md")).toBeDefined();
			expect(files.find(f => f.path === "content/normal-guide.md")).toBeDefined();

			// next.config.mjs should NOT have any redirects
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).not.toContain("async redirects()");
		});

		it("should not generate redirects in regeneration mode", () => {
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

			// File should be created with slug as-is
			const articleFile = files.find(f => f.path === "content/import.md");
			expect(articleFile).toBeDefined();

			// next.config.mjs IS now generated in regeneration mode (for code theme changes)
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
		});

		it("should not generate redirects in migration mode (no longer needed)", () => {
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

			// File should be created with slug as-is
			const articleFile = files.find(f => f.path === "content/import.md");
			expect(articleFile).toBeDefined();

			// next.config.mjs SHOULD be generated in migration mode but without redirects
			const nextConfig = files.find(f => f.path === "next.config.mjs");
			expect(nextConfig).toBeDefined();
			expect(nextConfig?.content).not.toContain("async redirects()");
		});

		it("should update _meta.ts with slugs as-is", () => {
			const articles: Array<ArticleInput> = [
				{
					content: "# Import Guide",
					contentMetadata: { title: "import" },
				},
			];
			const { files } = generateSiteToMemory(articles, defaultOptions);

			// _meta.ts should use slug as-is
			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();
			expect(metaFile?.content).toContain("'import': 'import'");
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
		const rootArticle = files.find(f => f.path === "content/getting-started.md");
		expect(rootArticle).toBeDefined();

		// advanced-guide should be in content/guides subfolder
		const subfolderArticle = files.find(f => f.path === "content/guides/advanced-guide.md");
		expect(subfolderArticle).toBeDefined();

		// Should NOT be in root
		const wrongPath = files.find(f => f.path === "content/advanced-guide.md");
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
		const existingArticle = files.find(f => f.path === "content/guides/getting-started.md");
		expect(existingArticle).toBeDefined();

		// new-article should be in root (new article)
		const newArticle = files.find(f => f.path === "content/new-article.md");
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
		const basicArticle = files.find(f => f.path === "content/guides/beginner/basics.md");
		expect(basicArticle).toBeDefined();

		// deep-nested should be in content/guides/advanced/expert
		const deepArticle = files.find(f => f.path === "content/guides/advanced/expert/deep-nested.md");
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
		const article = files.find(f => f.path === "content/getting-started.md");
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
		const article = files.find(f => f.path === "content/getting-started.md");
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
		const article = files.find(f => f.path === "content/new-folder/guide.md");
		expect(article).toBeDefined();

		// Should NOT be in old-folder
		const oldPath = files.find(f => f.path === "content/old-folder/guide.md");
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
		expect(files.find(f => f.path === "content/guides/guide-one.md")).toBeDefined();
		expect(files.find(f => f.path === "content/guides/guide-two.md")).toBeDefined();
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
		const articleFile = files.find(f => f.path === "content/guides/moved-article.md");
		expect(articleFile).toBeDefined();

		// Entry should NOT appear in root _meta.ts
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();
		expect(metaFile?.content).not.toContain("moved-article");
	});

	it("should preserve folder entry in root _meta.ts when folder has articles", () => {
		// Scenario: User has a folder with articles, rebuild should preserve folder entry
		const articles: Array<ArticleInput> = [
			{
				content: "# Root Article",
				contentMetadata: { title: "Root Article" },
			},
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
				folderPath: "guides",
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			preserveNavOrder: true, // Custom titles only preserved with auto-sync OFF
			migrationContext: {
				// Folder exists with articles
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "guides", metaContent: "", slugs: ["getting-started"] },
				],
				existingNavMeta: {
					"root-article": "Root Article",
					guides: "User Guides", // User's custom folder title
				},
			},
		});

		// Find the _meta.ts file
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Root article should be in _meta.ts
		expect(metaFile?.content).toContain("root-article");

		// Folder entry should be preserved because it has articles
		expect(metaFile?.content).toContain("guides");
		expect(metaFile?.content).toContain("User Guides");
	});

	it("should remove empty folder entries during rebuild", () => {
		// Scenario: Folder had articles but they were all deleted - folder should be removed
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
				// Empty folder (all articles deleted)
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "guides", metaContent: "", slugs: [] }, // Empty folder
				],
				existingNavMeta: {
					"root-article": "Root Article",
					guides: "User Guides", // Folder entry should be removed
				},
			},
		});

		// Find the _meta.ts file
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Root article should be in _meta.ts
		expect(metaFile?.content).toContain("root-article");

		// Empty folder entry should be REMOVED (automagically cleaned up)
		expect(metaFile?.content).not.toContain("guides");
		expect(metaFile?.content).not.toContain("User Guides");
	});

	it("should preserve nested folder entries when folders have articles", () => {
		// Scenario: User has nested folders with articles
		const articles: Array<ArticleInput> = [
			{
				content: "# Index",
				contentMetadata: { title: "Index" },
			},
			{
				content: "# Doc Article",
				contentMetadata: { title: "Doc Article" },
				folderPath: "docs",
			},
			{
				content: "# Advanced Topic",
				contentMetadata: { title: "Advanced Topic" },
				folderPath: "docs/advanced",
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["index"] },
					{ folderPath: "docs", metaContent: "", slugs: ["doc-article"] },
					{ folderPath: "docs/advanced", metaContent: "", slugs: ["advanced-topic"] },
				],
				existingNavMeta: {
					index: "Home",
					docs: "Documentation", // Folder entry
				},
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Folder with articles should be preserved
		expect(metaFile?.content).toContain("docs");
	});
});

describe("useSpaceFolderStructure", () => {
	it("should move root article back from subfolder when auto-nav is re-enabled", () => {
		// Scenario: article was at root in space, manually moved to "guides/" in repo,
		// then useSpaceFolderStructure toggled back ON
		const articles: Array<ArticleInput> = [
			{
				content: "# Intro",
				contentMetadata: { title: "Intro" },
				// No folderPath = root-level article in space
			},
			{
				content: "# Setup",
				contentMetadata: { title: "Setup" },
			},
		];

		const result = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			useSpaceFolderStructure: true,
			migrationContext: {
				allFolderMetas: [
					// Repo has "intro" in guides/ (manually moved) and "setup" at root
					{ folderPath: "", metaContent: "", slugs: ["setup"] },
					{ folderPath: "guides", metaContent: "", slugs: ["intro"] },
				],
			},
		});

		// intro should be at root (space-derived), NOT in guides/
		const rootIntro = result.files.find(f => f.path === "content/intro.md");
		expect(rootIntro).toBeDefined();

		const wrongPath = result.files.find(f => f.path === "content/guides/intro.md");
		expect(wrongPath).toBeUndefined();

		// The old file path should be in relocatedFilePaths for cleanup
		expect(result.relocatedFilePaths).toContain("content/guides/intro.md");
		expect(result.relocatedFilePaths).toContain("content/guides/intro.mdx");
	});

	it("should move subfolder article back from root when auto-nav is re-enabled", () => {
		// Scenario: article was in "guides" folder in space, manually moved to root in repo
		const articles: Array<ArticleInput> = [
			{
				content: "# Advanced Guide",
				contentMetadata: { title: "Advanced Guide" },
				folderPath: "Guides", // Space says it belongs in guides/ (nanoid already stripped by backend)
			},
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
			},
		];

		const result = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			useSpaceFolderStructure: true,
			migrationContext: {
				allFolderMetas: [
					// Repo has "advanced-guide" at root (manually moved)
					{ folderPath: "", metaContent: "", slugs: ["getting-started", "advanced-guide"] },
					{ folderPath: "guides", metaContent: "", slugs: [] },
				],
			},
		});

		// advanced-guide should be in guides/ (space-derived)
		const correctPath = result.files.find(f => f.path === "content/guides/advanced-guide.md");
		expect(correctPath).toBeDefined();

		const wrongPath = result.files.find(f => f.path === "content/advanced-guide.md");
		expect(wrongPath).toBeUndefined();

		// Old root file path should be in relocatedFilePaths
		expect(result.relocatedFilePaths).toContain("content/advanced-guide.md");
	});

	it("should preserve repo folder placement when useSpaceFolderStructure is off", () => {
		// Same scenario as above, but with useSpaceFolderStructure OFF (default)
		const articles: Array<ArticleInput> = [
			{
				content: "# Intro",
				contentMetadata: { title: "Intro" },
				// No folderPath = root-level in space
			},
		];

		const result = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			// useSpaceFolderStructure is NOT set (default off)
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: [] },
					{ folderPath: "guides", metaContent: "", slugs: ["intro"] },
				],
			},
		});

		// intro should stay in guides/ (repo placement preserved)
		const guidesIntro = result.files.find(f => f.path === "content/guides/intro.md");
		expect(guidesIntro).toBeDefined();

		const rootIntro = result.files.find(f => f.path === "content/intro.md");
		expect(rootIntro).toBeUndefined();

		// No relocated files when auto-nav is off
		expect(result.relocatedFilePaths).toHaveLength(0);
	});

	it("should include moved articles in folder _meta.ts when auto-nav is re-enabled", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Intro",
				contentMetadata: { title: "Intro" },
				// Root-level in space
			},
			{
				content: "# Setup",
				contentMetadata: { title: "Setup" },
			},
		];

		const result = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			useSpaceFolderStructure: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["setup"] },
					{ folderPath: "guides", metaContent: "", slugs: ["intro"] },
				],
			},
		});

		// Root _meta.ts should include both articles
		const rootMeta = result.files.find(f => f.path === "content/_meta.ts");
		expect(rootMeta).toBeDefined();
		expect(rootMeta?.content).toContain("intro");
		expect(rootMeta?.content).toContain("setup");
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
			...defaultOptions,
			regenerationMode: true,
			preserveNavOrder: true, // Nav customizations only apply with auto-sync OFF
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
			...defaultOptions,
			regenerationMode: true,
			preserveNavOrder: true, // Nav customizations only apply with auto-sync OFF
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
			...defaultOptions,
			regenerationMode: true,
			preserveNavOrder: true, // Nav customizations only apply with auto-sync OFF
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
			...defaultOptions,
			regenerationMode: true,
			preserveNavOrder: true, // Nav customizations only apply with auto-sync OFF
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
			...defaultOptions,
			regenerationMode: true,
			preserveNavOrder: true, // Nav customizations only apply with auto-sync OFF
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
			...defaultOptions,
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
			...defaultOptions,
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

describe("navigation modes (tabs)", () => {
	it("should generate simple string entries in sidebar mode (default)", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
			{ content: "# Advanced Guide", contentMetadata: { title: "Advanced Guide" } },
		];
		const { files } = generateSiteToMemory(articles, defaultOptions);

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// In sidebar mode (default), entries should be simple strings
		expect(metaFile?.content).toContain("'getting-started': 'Getting Started'");
		expect(metaFile?.content).toContain("'advanced-guide': 'Advanced Guide'");
		// Should NOT have type: 'page' for articles
		expect(metaFile?.content).not.toMatch(/'getting-started':\s*\{[^}]*type:\s*'page'/);
	});

	it("should transform individual articles to tabs in tabs mode", () => {
		// In tabs mode, ALL top-level items (articles and folders) become navbar tabs.
		// This provides a true tabs navigation experience.
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
			{ content: "# Advanced Guide", contentMetadata: { title: "Advanced Guide" } },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "tabs",
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// In tabs mode, individual articles get type: 'page' to appear as navbar tabs
		expect(metaFile?.content).toContain("'getting-started':");
		expect(metaFile?.content).toContain("title: 'Getting Started'");
		expect(metaFile?.content).toContain("'advanced-guide':");
		expect(metaFile?.content).toContain("title: 'Advanced Guide'");
		// Should have type: 'page' for navbar tabs
		expect(metaFile?.content).toContain("type:");
	});

	it("should not transform API reference entry in tabs mode", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
			{
				content: openApiContent,
				contentType: "application/json",
				contentMetadata: { title: "My API" },
			},
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "tabs",
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// API reference entry should have href (not just type: 'page')
		expect(metaFile?.content).toContain("'api-reference':");
		expect(metaFile?.content).toContain("href: '/api-docs/my-api'");
	});

	it("should not include hidden index entry in tabs mode", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "tabs",
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Hidden index entry prevents Nextra from auto-generating Index nav item
		expect(metaFile?.content).toContain("'index': { display: 'hidden' }");
	});

	it("should not transform header links (nav-*) entries in tabs mode", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "tabs",
				headerLinks: {
					items: [{ label: "GitHub", url: "https://github.com/example" }],
				},
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Header links should have href (external link format)
		expect(metaFile?.content).toContain("'nav-0':");
		expect(metaFile?.content).toContain("href: 'https://github.com/example'");
	});

	it("should add type:page to articles in tabs mode during regeneration", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			theme: {
				navigationMode: "tabs",
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// In tabs mode, articles get type: 'page' even during regeneration
		expect(metaFile?.content).toContain("'getting-started':");
		expect(metaFile?.content).toContain("title: 'Getting Started'");
		expect(metaFile?.content).toContain("type:");
	});

	it("should not affect sidebar mode (explicit)", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "sidebar",
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// In sidebar mode, entries should be simple strings
		expect(metaFile?.content).toContain("'getting-started': 'Getting Started'");
	});

	it("should add type:page to folders in tabs mode for navbar display", () => {
		// In tabs mode, top-level folders should have type: 'page' to appear as tabs in navbar.
		// This enables the tabs navigation pattern where clicking a tab shows that folder's content.
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
			{ content: "# Intro", contentMetadata: { title: "Intro" }, folderPath: "guides" },
			{ content: "# Basics", contentMetadata: { title: "Basics" }, folderPath: "tutorials" },
		];
		const folderMetas = [
			{ folderPath: "", metaContent: "", slugs: ["getting-started"] },
			{ folderPath: "guides", metaContent: "", slugs: ["intro"] },
			{ folderPath: "tutorials", metaContent: "", slugs: ["basics"] },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "tabs",
			},
			migrationContext: {
				allFolderMetas: folderMetas,
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Folders should appear with proper title case AND type: 'page' for navbar tabs
		expect(metaFile?.content).toContain("'guides':");
		expect(metaFile?.content).toContain("'tutorials':");
		// Should have type: 'page' for tabs mode
		expect(metaFile?.content).toContain("type:");
	});

	it("should not transform folders in sidebar mode", () => {
		// In sidebar mode, folders should not get type: 'page' added
		const articles: Array<ArticleInput> = [
			{ content: "# Getting Started", contentMetadata: { title: "Getting Started" } },
			{ content: "# Intro", contentMetadata: { title: "Intro" } },
		];
		const folderMetas = [
			{ folderPath: "", metaContent: "", slugs: ["getting-started"] },
			{ folderPath: "guides", metaContent: "", slugs: ["intro"] },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "sidebar",
			},
			migrationContext: {
				allFolderMetas: folderMetas,
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Folders should NOT have type: 'page' in sidebar mode
		expect(metaFile?.content).not.toContain("type: 'page'");
		expect(metaFile?.content).not.toContain("type: 'menu'");
	});

	it("should use proper title case for folder names", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Root Article", contentMetadata: { title: "Root Article" } },
			{ content: "# Intro", contentMetadata: { title: "Intro" }, folderPath: "getting-started" },
		];
		const folderMetas = [
			{ folderPath: "", metaContent: "", slugs: ["root-article"] },
			{ folderPath: "getting-started", metaContent: "", slugs: ["intro"] },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "tabs",
			},
			migrationContext: {
				allFolderMetas: folderMetas,
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// In tabs mode, folder should have type: 'page' with proper title case
		// Hyphens replaced with spaces, each word capitalized
		expect(metaFile?.content).toContain("'getting-started':");
		expect(metaFile?.content).toContain("title: 'Getting Started'");
	});

	it("should remove deleted root articles in tabs mode", () => {
		// Scenario: Root article existed as a tab, then was deleted
		// The deleted article should be removed from _meta.ts
		const articles: Array<ArticleInput> = [
			{ content: "# Remaining Article", contentMetadata: { title: "Remaining Article" } },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			theme: {
				navigationMode: "tabs",
			},
			migrationContext: {
				allFolderMetas: [{ folderPath: "", metaContent: "", slugs: ["remaining-article", "deleted-article"] }],
				existingNavMeta: {
					index: { display: "hidden" },
					"remaining-article": { title: "Remaining Article", type: "page" },
					"deleted-article": { title: "Deleted Article", type: "page" }, // Should be removed
				},
			},
		});

		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();

		// Remaining article should still be present
		expect(metaFile?.content).toContain("remaining-article");

		// Deleted article should be REMOVED (not in current articles)
		expect(metaFile?.content).not.toContain("deleted-article");
		expect(metaFile?.content).not.toContain("Deleted Article");
	});

	it("should generate overview.md for folder content in tabs mode (workaround for Nextra #4411)", () => {
		// In tabs mode, folder documents with content should generate overview.md instead of index.md
		// This works around Nextra 4.x issue #4411 where type: 'page' + index.md breaks sidebar
		const articles: Array<ArticleInput> = [
			// Folder document with content - should become overview.md in tabs mode
			{
				content: "# Introduction To Product\n\nWelcome to our product!",
				contentMetadata: { title: "Introduction To Product" },
				slug: "introduction-to-product",
				isFolder: true,
			},
			// Child document inside the folder
			{
				content: "# Getting Started Guide",
				contentMetadata: { title: "Getting Started" },
				slug: "getting-started",
				folderPath: "introduction-to-product",
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "tabs",
			},
		});

		// 1. Should generate overview.md, NOT index.md
		const overviewFile = files.find(f => f.path === "content/introduction-to-product/overview.md");
		expect(overviewFile).toBeDefined();
		expect(overviewFile?.content).toContain("Introduction To Product");
		// Should NOT have asIndexPage: true (that's only for index.md)
		expect(overviewFile?.content).not.toContain("asIndexPage");

		// 2. Should NOT generate index.md
		const indexFile = files.find(f => f.path === "content/introduction-to-product/index.md");
		expect(indexFile).toBeUndefined();

		// 3. Subfolder _meta.ts should have overview as the first entry
		const subfolderMeta = files.find(f => f.path === "content/introduction-to-product/_meta.ts");
		expect(subfolderMeta).toBeDefined();
		expect(subfolderMeta?.content).toContain("'overview'");
		expect(subfolderMeta?.content).toContain("'getting-started'");
		// Verify overview appears before other entries (is the first key)
		const overviewIdx = subfolderMeta?.content.indexOf("overview") ?? -1;
		const gettingStartedIdx = subfolderMeta?.content.indexOf("getting-started") ?? -1;
		expect(overviewIdx).toBeLessThan(gettingStartedIdx);

		// 4. Root _meta.ts should have type: 'page' on the folder
		const rootMeta = files.find(f => f.path === "content/_meta.ts");
		expect(rootMeta).toBeDefined();
		expect(rootMeta?.content).toContain("'introduction-to-product'");
		expect(rootMeta?.content).toContain("type:");

		// 5. Root redirect should point to overview page, not the first child article
		const rootPage = files.find(f => f.path === "app/page.tsx");
		expect(rootPage).toBeDefined();
		expect(rootPage?.content).toContain("redirect('/introduction-to-product/overview')");
	});

	it("should keep overview as first entry in folder _meta.ts during regeneration with existing meta", () => {
		// When regenerating a site that already has a _meta.ts for a folder,
		// the MetaMerger would append 'overview' at the end since it's a new entry.
		// This test ensures overview is reordered to be first.
		// Also tests that space ordering is applied (installation before quick-start in articles,
		// but repo has quick-start before installation).
		const articles: Array<ArticleInput> = [
			{
				content: "# Introduction To Product\n\nWelcome!",
				contentMetadata: { title: "Introduction To Product" },
				slug: "introduction-to-product",
				isFolder: true,
			},
			// Note: installation comes BEFORE quick-start in the space (sortOrder)
			{
				content: "# Installation",
				contentMetadata: { title: "Installation" },
				slug: "installation",
				folderPath: "introduction-to-product",
			},
			{
				content: "# Quick Start",
				contentMetadata: { title: "Quick Start" },
				slug: "quick-start",
				folderPath: "introduction-to-product",
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: { navigationMode: "tabs" },
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{
						folderPath: "",
						slugs: ["introduction-to-product"],
						metaContent: "export default {\n  'introduction-to-product': 'Introduction To Product'\n};",
					},
					{
						folderPath: "introduction-to-product",
						// Repo has quick-start first, but space has installation first
						slugs: ["quick-start", "installation"],
						metaContent:
							"export default {\n  'quick-start': 'Quick Start',\n  installation: 'Installation'\n};",
					},
				],
			},
		});

		const subfolderMeta = files.find(f => f.path === "content/introduction-to-product/_meta.ts");
		expect(subfolderMeta).toBeDefined();
		// Overview should be first, then space ordering (installation before quick-start)
		const overviewIdx = subfolderMeta?.content.indexOf("overview") ?? -1;
		const installationIdx = subfolderMeta?.content.indexOf("installation") ?? -1;
		const quickStartIdx = subfolderMeta?.content.indexOf("quick-start") ?? -1;
		expect(overviewIdx).toBeGreaterThan(-1);
		expect(overviewIdx).toBeLessThan(installationIdx);
		expect(installationIdx).toBeLessThan(quickStartIdx);
	});

	it("should use space ordering for folder _meta.ts during regeneration (not repo ordering)", () => {
		// The space has articles in a specific order (sortOrder from database).
		// During regeneration, the _meta.ts should match the space order, not the
		// existing repo's _meta.ts order (which may be alphabetical or stale).
		const articles: Array<ArticleInput> = [
			// Space order: setup → basics → advanced (deliberate non-alphabetical)
			{ content: "# Setup", contentMetadata: { title: "Setup" }, slug: "setup", folderPath: "guides" },
			{ content: "# Basics", contentMetadata: { title: "Basics" }, slug: "basics", folderPath: "guides" },
			{
				content: "# Advanced",
				contentMetadata: { title: "Advanced" },
				slug: "advanced",
				folderPath: "guides",
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{
						folderPath: "",
						slugs: ["guides"],
						metaContent: "export default {\n  guides: 'Guides'\n};",
					},
					{
						folderPath: "guides",
						// Repo has alphabetical order (different from space order)
						slugs: ["advanced", "basics", "setup"],
						metaContent:
							"export default {\n  advanced: 'Advanced',\n  basics: 'Basics',\n  setup: 'Setup'\n};",
					},
				],
			},
		});

		const guidesMeta = files.find(f => f.path === "content/guides/_meta.ts");
		expect(guidesMeta).toBeDefined();
		// Should match space ordering: setup → basics → advanced
		const setupIdx = guidesMeta?.content.indexOf("setup") ?? -1;
		const basicsIdx = guidesMeta?.content.indexOf("basics") ?? -1;
		const advancedIdx = guidesMeta?.content.indexOf("advanced") ?? -1;
		expect(setupIdx).toBeLessThan(basicsIdx);
		expect(basicsIdx).toBeLessThan(advancedIdx);
	});

	it("should interleave child folders with articles in space tree sortOrder (not append at end)", () => {
		// When a folder contains both articles and child folders, the generated _meta.ts
		// should place them in the space tree's sortOrder, not articles-first then folders.
		// Space order: "quick-start" (article) → "advanced" (folder) → "installation" (article)
		const articles: Array<ArticleInput> = [
			// The folder itself (root-level)
			{
				content: "# Guides\n\nGuide overview.",
				contentMetadata: { title: "Guides" },
				slug: "guides",
				isFolder: true,
			},
			// Articles + child folder inside "guides", in space tree sortOrder:
			{
				content: "# Quick Start",
				contentMetadata: { title: "Quick Start" },
				slug: "quick-start",
				folderPath: "guides",
			},
			// Child folder "advanced" (sortOrder puts it between the two articles)
			{
				content: "# Advanced\n\nAdvanced topics.",
				contentMetadata: { title: "Advanced" },
				slug: "advanced",
				folderPath: "guides",
				isFolder: true,
			},
			{
				content: "# Installation",
				contentMetadata: { title: "Installation" },
				slug: "installation",
				folderPath: "guides",
			},
			// Article inside the "advanced" child folder
			{
				content: "# Deep Dive",
				contentMetadata: { title: "Deep Dive" },
				slug: "deep-dive",
				folderPath: "guides/advanced",
			},
		];

		// Initial generation (no allFolderMetas)
		const { files } = generateSiteToMemory(articles, defaultOptions);

		const guidesMeta = files.find(f => f.path === "content/guides/_meta.ts");
		expect(guidesMeta).toBeDefined();
		const content = guidesMeta?.content ?? "";

		// Should be interleaved: quick-start → advanced → installation
		const qsIdx = content.indexOf("quick-start");
		const advIdx = content.indexOf("advanced");
		const instIdx = content.indexOf("installation");
		expect(qsIdx).toBeGreaterThan(-1);
		expect(advIdx).toBeGreaterThan(-1);
		expect(instIdx).toBeGreaterThan(-1);
		expect(qsIdx).toBeLessThan(advIdx);
		expect(advIdx).toBeLessThan(instIdx);
	});

	it("should interleave child folders with articles during regeneration (with existing repo)", () => {
		// Same scenario but with existing allFolderMetas from the repo.
		// The repo has alphabetical order, but the space tree has a specific order.
		const articles: Array<ArticleInput> = [
			{
				content: "# Guides\n\nGuide overview.",
				contentMetadata: { title: "Guides" },
				slug: "guides",
				isFolder: true,
			},
			// Space order: quick-start → advanced (folder) → installation
			{
				content: "# Quick Start",
				contentMetadata: { title: "Quick Start" },
				slug: "quick-start",
				folderPath: "guides",
			},
			{
				content: "# Advanced\n\nAdvanced topics.",
				contentMetadata: { title: "Advanced" },
				slug: "advanced",
				folderPath: "guides",
				isFolder: true,
			},
			{
				content: "# Installation",
				contentMetadata: { title: "Installation" },
				slug: "installation",
				folderPath: "guides",
			},
			{
				content: "# Deep Dive",
				contentMetadata: { title: "Deep Dive" },
				slug: "deep-dive",
				folderPath: "guides/advanced",
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{
						folderPath: "",
						slugs: ["guides"],
						metaContent: "export default {\n  guides: 'Guides'\n};",
					},
					{
						folderPath: "guides",
						// Repo has alphabetical order: installation, quick-start (no "advanced" since it's a dir)
						slugs: ["installation", "quick-start"],
						metaContent:
							"export default {\n  advanced: 'Advanced',\n  installation: 'Installation',\n  'quick-start': 'Quick Start'\n};",
					},
					{
						folderPath: "guides/advanced",
						slugs: ["deep-dive"],
						metaContent: "export default {\n  'deep-dive': 'Deep Dive'\n};",
					},
				],
			},
		});

		const guidesMeta = files.find(f => f.path === "content/guides/_meta.ts");
		expect(guidesMeta).toBeDefined();
		const content = guidesMeta?.content ?? "";

		// Should be interleaved per space tree: quick-start → advanced → installation
		const qsIdx = content.indexOf("quick-start");
		const advIdx = content.indexOf("advanced");
		const instIdx = content.indexOf("installation");
		expect(qsIdx).toBeGreaterThan(-1);
		expect(advIdx).toBeGreaterThan(-1);
		expect(instIdx).toBeGreaterThan(-1);
		expect(qsIdx).toBeLessThan(advIdx);
		expect(advIdx).toBeLessThan(instIdx);
	});

	it("should generate index.md for folder content in sidebar mode (normal behavior)", () => {
		// In sidebar mode, folder documents should generate index.md with asIndexPage: true
		const articles: Array<ArticleInput> = [
			{
				content: "# Introduction To Product\n\nWelcome!",
				contentMetadata: { title: "Introduction To Product" },
				slug: "introduction-to-product",
				isFolder: true,
			},
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
				slug: "getting-started",
				folderPath: "introduction-to-product",
			},
		];

		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: {
				navigationMode: "sidebar",
			},
		});

		// Should generate index.md, not overview.md
		const indexFile = files.find(f => f.path === "content/introduction-to-product/index.md");
		expect(indexFile).toBeDefined();
		expect(indexFile?.content).toContain("asIndexPage: true");

		const overviewFile = files.find(f => f.path === "content/introduction-to-product/overview.md");
		expect(overviewFile).toBeUndefined();

		// Root redirect should go to the folder itself (it has content/index.md)
		const rootPage = files.find(f => f.path === "app/page.tsx");
		expect(rootPage).toBeDefined();
		expect(rootPage?.content).toContain("redirect('/introduction-to-product')");
		expect(rootPage?.content).not.toContain("overview");
	});
});

describe("empty folder detection (foldersToDelete)", () => {
	it("should return empty array when allFolderMetas is undefined", () => {
		const articles: Array<ArticleInput> = [{ content: "# Article", contentMetadata: { title: "Article" } }];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {},
		});

		expect(foldersToDelete).toEqual([]);
	});

	it("should return empty array when allFolderMetas is empty", () => {
		const articles: Array<ArticleInput> = [{ content: "# Article", contentMetadata: { title: "Article" } }];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [],
			},
		});

		expect(foldersToDelete).toEqual([]);
	});

	it("should return empty array when all folders still have articles", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Root Article", contentMetadata: { title: "Root Article" } },
			{ content: "# Guide Article", contentMetadata: { title: "Guide Article" }, folderPath: "guides" },
		];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "guides", metaContent: "", slugs: ["guide-article"] },
				],
			},
		});

		expect(foldersToDelete).toEqual([]);
	});

	it("should detect folder that became empty after articles removed", () => {
		// Scenario: guides folder had articles, but all were moved/deleted
		const articles: Array<ArticleInput> = [
			{ content: "# Root Article", contentMetadata: { title: "Root Article" } },
			// No articles in guides folder anymore
		];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "guides", metaContent: "", slugs: ["guide-article"] }, // Was here before
				],
			},
		});

		// guides folder should be marked for deletion
		expect(foldersToDelete).toContain("content/guides");
	});

	it("should detect multiple empty folders", () => {
		// Scenario: Multiple folders had articles, all were removed
		const articles: Array<ArticleInput> = [
			{ content: "# Root Article", contentMetadata: { title: "Root Article" } },
		];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "guides", metaContent: "", slugs: ["guide-one"] },
					{ folderPath: "tutorials", metaContent: "", slugs: ["tutorial-one"] },
				],
			},
		});

		expect(foldersToDelete).toContain("content/guides");
		expect(foldersToDelete).toContain("content/tutorials");
		expect(foldersToDelete).toHaveLength(2);
	});

	it("should detect nested empty folders", () => {
		// Scenario: Nested folder had articles, all were removed
		const articles: Array<ArticleInput> = [
			{ content: "# Root Article", contentMetadata: { title: "Root Article" } },
		];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "guides/advanced/expert", metaContent: "", slugs: ["expert-topic"] },
				],
			},
		});

		expect(foldersToDelete).toContain("content/guides/advanced/expert");
	});

	it("should not include root content folder in foldersToDelete", () => {
		// Root folder (empty folderPath) should never be deleted
		const articles: Array<ArticleInput> = [];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["some-article"] }, // Root folder
				],
			},
		});

		// Root folder should NOT be marked for deletion
		expect(foldersToDelete).not.toContain("content/");
		expect(foldersToDelete).not.toContain("content");
		expect(foldersToDelete).toEqual([]);
	});

	it("should slugify folder paths when comparing", () => {
		// Scenario: Folder was created with spaces, should be slugified for comparison
		const articles: Array<ArticleInput> = [
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
				folderPath: "Getting Started",
			},
		];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [{ folderPath: "Getting Started", metaContent: "", slugs: ["getting-started"] }],
			},
		});

		// Folder still has articles (slugified match), should NOT be deleted
		expect(foldersToDelete).toEqual([]);
	});

	it("should mark folder for deletion when article moved to different folder", () => {
		// Scenario: Article "moved-article" was in guides, user moved it to tutorials folder
		// The articles reflect the NEW folder structure after the move
		const articles: Array<ArticleInput> = [
			{ content: "# Moved Article", contentMetadata: { title: "Moved Article" }, folderPath: "tutorials" },
		];
		const { foldersToDelete, files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "guides", metaContent: "", slugs: [] }, // Now empty - article was moved out
					{ folderPath: "tutorials", metaContent: "", slugs: ["moved-article"] }, // Article now here
				],
			},
		});

		// guides folder should be marked for deletion (empty now)
		expect(foldersToDelete).toContain("content/guides");
		// tutorials folder should NOT be deleted (has the article)
		expect(foldersToDelete).not.toContain("content/tutorials");
		// Article file should be in tutorials folder
		expect(files.find(f => f.path === "content/tutorials/moved-article.md")).toBeDefined();
	});

	it("should work when migrationContext is undefined", () => {
		const articles: Array<ArticleInput> = [{ content: "# Article", contentMetadata: { title: "Article" } }];
		const { foldersToDelete } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
		});

		expect(foldersToDelete).toEqual([]);
	});

	it("should mark orphaned _meta.ts for deletion when folder loses all articles", () => {
		// Scenario: zed folder had articles before, now has none
		// The _meta.ts should be in relocatedFilePaths for deletion
		// but the folder itself might not be deleted (could have index.md)
		const articles: Array<ArticleInput> = [
			{ content: "# Root Article", contentMetadata: { title: "Root Article" } },
			// zed folder had articles before but has none now
		];
		const { relocatedFilePaths } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			useSpaceFolderStructure: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: ["root-article"] },
					{ folderPath: "zed", metaContent: "", slugs: ["zed-article"] }, // Had article before
				],
			},
		});

		// Orphaned _meta.ts should be marked for deletion
		expect(relocatedFilePaths).toContain("content/zed/_meta.ts");
	});

	it("should merge theme config from migrationContext with options.theme in migration mode", () => {
		const articles: Array<ArticleInput> = [{ content: "# Article", contentMetadata: { title: "Article" } }];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			migrationMode: true,
			migrationContext: {
				themeConfig: {
					primaryHue: 180,
					fontFamily: "ibm-plex",
				},
			},
			theme: {
				primaryHue: 270, // This should override migrationContext
				codeTheme: "dracula",
			},
		});

		// The globals.css should have the merged theme - options.theme overrides migrationContext
		const globalStyles = files.find(f => f.path === "app/globals.css");
		expect(globalStyles).toBeDefined();
		expect(globalStyles?.content).toContain("--jolli-primary-hue: 270"); // options.theme wins

		// Code theme affects next.config.mjs, not globals.css
		const nextConfig = files.find(f => f.path === "next.config.mjs");
		expect(nextConfig).toBeDefined();
		expect(nextConfig?.content).toContain("dracula"); // from options.theme
	});

	it("should regenerate auth layout in regeneration mode when allowedDomain is set", () => {
		const articles: Array<ArticleInput> = [{ content: "# Article", contentMetadata: { title: "Article" } }];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			auth: { allowedDomain: "example.com" },
			migrationContext: {
				existingNavMeta: {},
			},
		});

		// Should generate auth layout even in regeneration mode
		const layoutFile = files.find(f => f.path === "app/layout.tsx");
		expect(layoutFile).toBeDefined();
		expect(layoutFile?.content).toContain('allowedDomain="example.com"');
		expect(layoutFile?.content).toContain("Auth0Provider");
		expect(layoutFile?.content).toContain("AuthGate");

		// Should also regenerate globals.css for branding
		const globalStyles = files.find(f => f.path === "app/globals.css");
		expect(globalStyles).toBeDefined();

		// Should regenerate next.config.mjs for code theme
		const nextConfig = files.find(f => f.path === "next.config.mjs");
		expect(nextConfig).toBeDefined();
	});

	it("should generate subfolder _meta.ts for folders with isFolder articles (initial generation)", () => {
		// This simulates initial generation where a folder document (isFolder=true) creates a folder
		// and child documents are placed inside it
		const articles: Array<ArticleInput> = [
			// Folder document - should become content/getting-started-gk4sp55/index.md
			{
				content: "# Getting Started",
				contentMetadata: { title: "Getting Started" },
				slug: "getting-started-gk4sp55",
				isFolder: true,
				// folderPath is undefined for root-level folders
			},
			// Child documents - should go inside the folder
			{
				content: "# Git Setup",
				contentMetadata: { title: "Git" },
				slug: "git-veivekj",
				folderPath: "getting-started-gk4sp55",
			},
			{
				content: "# IDE Setup",
				contentMetadata: { title: "IDE" },
				slug: "ide-rzg8ofv",
				folderPath: "getting-started-gk4sp55",
			},
		];

		// Initial generation - no migrationContext
		const { files } = generateSiteToMemory(articles, defaultOptions);

		// 1. Folder document should be at content/getting-started-gk4sp55/index.md
		const folderIndex = files.find(f => f.path === "content/getting-started-gk4sp55/index.md");
		expect(folderIndex).toBeDefined();
		expect(folderIndex?.content).toContain("Getting Started");

		// 2. Child documents should be inside the folder
		const childGit = files.find(f => f.path === "content/getting-started-gk4sp55/git-veivekj.md");
		expect(childGit).toBeDefined();

		const childIde = files.find(f => f.path === "content/getting-started-gk4sp55/ide-rzg8ofv.md");
		expect(childIde).toBeDefined();

		// 3. CRITICAL: Subfolder _meta.ts should be generated
		const subfolderMeta = files.find(f => f.path === "content/getting-started-gk4sp55/_meta.ts");
		expect(subfolderMeta).toBeDefined();
		// Should NOT contain hidden index entry - we use asIndexPage: true in front matter instead
		expect(subfolderMeta?.content).not.toContain("'index'");
		// Should contain child entries
		expect(subfolderMeta?.content).toContain("'git-veivekj'");
		expect(subfolderMeta?.content).toContain("'ide-rzg8ofv'");

		// 4. Folder index should have asIndexPage: true front matter (Nextra 4.x pattern)
		expect(folderIndex?.content).toContain("asIndexPage: true");
	});

	it("should generate subfolder _meta.ts for NEW folders during regeneration (with existing repo)", () => {
		// This tests the critical bug fix: when regenerating a site, NEW folders created in Jolli
		// should get _meta.ts files even if they don't exist in the existing GitHub repo yet.
		const articles: Array<ArticleInput> = [
			// Existing root-level article (was in the repo)
			{
				content: "# Welcome",
				contentMetadata: { title: "Welcome" },
				slug: "welcome-abc123",
			},
			// NEW folder document - didn't exist in the repo before
			{
				content: "# New Folder Content",
				contentMetadata: { title: "New Folder" },
				slug: "new-folder-xyz789",
				isFolder: true,
			},
			// Child of the new folder
			{
				content: "# Child Article",
				contentMetadata: { title: "Child Article" },
				slug: "child-article-def456",
				folderPath: "new-folder-xyz789",
			},
		];

		// Simulate regeneration with existing repo that only has root content
		// The new-folder-xyz789 folder does NOT exist in allFolderMetas (simulating a new folder)
		const optionsWithExistingRepo = {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					// Only root folder exists in the repo
					{ folderPath: "", slugs: ["welcome-abc123"], metaContent: "" },
				],
			},
		};

		const { files } = generateSiteToMemory(articles, optionsWithExistingRepo);

		// 1. New folder document should create content/new-folder-xyz789/index.md
		const folderIndex = files.find(f => f.path === "content/new-folder-xyz789/index.md");
		expect(folderIndex).toBeDefined();
		// Folder index should have asIndexPage: true front matter (Nextra 4.x pattern)
		expect(folderIndex?.content).toContain("asIndexPage: true");

		// 2. Child document should be inside the new folder
		const childArticle = files.find(f => f.path === "content/new-folder-xyz789/child-article-def456.md");
		expect(childArticle).toBeDefined();

		// 3. CRITICAL: New subfolder _meta.ts should be generated even though folder wasn't in repo
		const newFolderMeta = files.find(f => f.path === "content/new-folder-xyz789/_meta.ts");
		expect(newFolderMeta).toBeDefined();
		// Should NOT contain hidden index entry - we use asIndexPage: true in front matter instead
		expect(newFolderMeta?.content).not.toContain("'index'");
		// Should contain the child article entry
		expect(newFolderMeta?.content).toContain("'child-article-def456'");
	});

	it("should NOT generate index.md for empty folders (just containers)", () => {
		// Empty folders are just containers for organizing children, not clickable articles
		const articles: Array<ArticleInput> = [
			// Empty folder - no content
			{
				content: "", // Empty content
				contentMetadata: { title: "Empty Folder" },
				slug: "empty-folder-abc123",
				isFolder: true,
			},
			// Child inside the empty folder
			{
				content: "# Child Content",
				contentMetadata: { title: "Child Article" },
				slug: "child-xyz789",
				folderPath: "empty-folder-abc123",
			},
		];

		const { files } = generateSiteToMemory(articles, defaultOptions);

		// Empty folder should NOT have index.md (it's just a container)
		const folderIndex = files.find(f => f.path === "content/empty-folder-abc123/index.md");
		expect(folderIndex).toBeUndefined();

		// Child should still be inside the folder
		const childFile = files.find(f => f.path === "content/empty-folder-abc123/child-xyz789.md");
		expect(childFile).toBeDefined();

		// Subfolder _meta.ts should still be generated for the children
		const subfolderMeta = files.find(f => f.path === "content/empty-folder-abc123/_meta.ts");
		expect(subfolderMeta).toBeDefined();
		expect(subfolderMeta?.content).toContain("'child-xyz789'");
	});

	it("should handle folder renames during regeneration (old folder excluded, new folder included)", () => {
		// When a folder is renamed in the space, the articles inside keep their slugs
		// (only the folder path changes). The OLD folder path should NOT appear in the
		// root _meta.ts, and the NEW folder path should be used instead.
		const articles: Array<ArticleInput> = [
			// Root-level article
			{
				content: "# Welcome",
				contentMetadata: { title: "Welcome" },
				slug: "welcome",
			},
			// Folder document for the NEW folder name (was "old-guides", now "workflows")
			{
				content: "# Workflows",
				contentMetadata: { title: "Workflows" },
				slug: "workflows",
				isFolder: true,
			},
			// Child articles - slugs unchanged from when folder was "old-guides"
			{
				content: "# Setup",
				contentMetadata: { title: "Setup" },
				slug: "setup",
				folderPath: "workflows",
			},
			{
				content: "# Advanced",
				contentMetadata: { title: "Advanced" },
				slug: "advanced",
				folderPath: "workflows",
			},
		];

		// Simulate regeneration where the existing repo has the OLD folder name
		const optionsWithRename = {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					// Root folder with old entries
					{ folderPath: "", slugs: ["welcome", "old-guides"], metaContent: "" },
					// OLD folder path - articles "setup" and "advanced" were here before the rename
					{ folderPath: "old-guides", slugs: ["setup", "advanced"], metaContent: "" },
				],
			},
		};

		const { files } = generateSiteToMemory(articles, optionsWithRename);

		// Root _meta.ts should NOT contain the old folder name
		const rootMeta = files.find(f => f.path === "content/_meta.ts");
		expect(rootMeta).toBeDefined();
		expect(rootMeta?.content).not.toContain("'old-guides'");

		// Root _meta.ts SHOULD contain the new folder name
		expect(rootMeta?.content).toContain("'workflows'");

		// New folder should have its _meta.ts with the children
		const newFolderMeta = files.find(f => f.path === "content/workflows/_meta.ts");
		expect(newFolderMeta).toBeDefined();
		expect(newFolderMeta?.content).toContain("'setup'");
		expect(newFolderMeta?.content).toContain("'advanced'");

		// Old folder should NOT have _meta.ts generated
		const oldFolderMeta = files.find(f => f.path === "content/old-guides/_meta.ts");
		expect(oldFolderMeta).toBeUndefined();

		// Articles should be under the new folder path
		const setupFile = files.find(f => f.path === "content/workflows/setup.md");
		expect(setupFile).toBeDefined();
		const advancedFile = files.find(f => f.path === "content/workflows/advanced.md");
		expect(advancedFile).toBeDefined();

		// No articles should be under the old folder path
		const oldSetup = files.find(f => f.path === "content/old-guides/setup.md");
		expect(oldSetup).toBeUndefined();
	});

	it("should NOT delete parent folders that contain active subfolders (no direct articles)", () => {
		// Scenario: "contributing-rename" folder has no direct .md files — only subfolders
		// (workflows, issue-tracking). The repo's allFolderMetas has empty slugs for it
		// because processContentFile only captures .md/.mdx. Without the parent-folder fix,
		// computeActiveFolders would drop the parent, causing it to be deleted and its
		// entire subtree wiped out on the next deleteFolder call.
		const articles: Array<ArticleInput> = [
			// Parent folder article with NO content (empty body)
			{ content: "", contentMetadata: { title: "Contributing RENAME" }, isFolder: true },
			// Subfolder article
			{
				content: "# Workflows",
				contentMetadata: { title: "Workflows" },
				isFolder: true,
				folderPath: "Contributing RENAME",
			},
			// Leaf articles inside the subfolder
			{
				content: "# Commits\nHow to commit",
				contentMetadata: { title: "Commits" },
				folderPath: "Contributing RENAME/Workflows",
			},
			{
				content: "# Pull Requests\nHow to submit PRs",
				contentMetadata: { title: "Pull Requests" },
				folderPath: "Contributing RENAME/Workflows",
			},
		];

		const { foldersToDelete, files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					// Root folder
					{ folderPath: "", metaContent: "", slugs: [] },
					// Parent folder — empty slugs because repo has no .md files directly in it
					{ folderPath: "contributing-rename", metaContent: "", slugs: [] },
					// Subfolder with actual articles
					{
						folderPath: "contributing-rename/workflows",
						metaContent: "",
						slugs: ["commits", "pull-requests"],
					},
				],
			},
		});

		// Parent folder must NOT be deleted — it has active subfolders
		expect(foldersToDelete).not.toContain("content/contributing-rename");
		// Subfolder must not be deleted either
		expect(foldersToDelete).not.toContain("content/contributing-rename/workflows");
		// Subfolder _meta.ts should be generated
		expect(files.find(f => f.path === "content/contributing-rename/workflows/_meta.ts")).toBeDefined();
		// Parent folder _meta.ts should be generated (it has child folders)
		expect(files.find(f => f.path === "content/contributing-rename/_meta.ts")).toBeDefined();
		// Leaf article files should exist
		expect(files.find(f => f.path === "content/contributing-rename/workflows/commits.md")).toBeDefined();
		expect(files.find(f => f.path === "content/contributing-rename/workflows/pull-requests.md")).toBeDefined();
	});

	it("should preserve deeply nested parent chain during regeneration", () => {
		// Scenario: a/b/c/article.md — folders "a" and "a/b" contain only subfolders
		const articles: Array<ArticleInput> = [
			{ content: "", contentMetadata: { title: "A" }, isFolder: true },
			{ content: "", contentMetadata: { title: "B" }, isFolder: true, folderPath: "A" },
			{ content: "# Deep Article", contentMetadata: { title: "C" }, isFolder: true, folderPath: "A/B" },
			{ content: "# Leaf", contentMetadata: { title: "Leaf" }, folderPath: "A/B/C" },
		];

		const { foldersToDelete, files } = generateSiteToMemory(articles, {
			...defaultOptions,
			regenerationMode: true,
			migrationContext: {
				allFolderMetas: [
					{ folderPath: "", metaContent: "", slugs: [] },
					{ folderPath: "a", metaContent: "", slugs: [] },
					{ folderPath: "a/b", metaContent: "", slugs: [] },
					{ folderPath: "a/b/c", metaContent: "", slugs: ["leaf"] },
				],
			},
		});

		// No folder in the chain should be deleted
		expect(foldersToDelete).not.toContain("content/a");
		expect(foldersToDelete).not.toContain("content/a/b");
		expect(foldersToDelete).not.toContain("content/a/b/c");
		// All _meta.ts files should be generated
		expect(files.find(f => f.path === "content/a/_meta.ts")).toBeDefined();
		expect(files.find(f => f.path === "content/a/b/_meta.ts")).toBeDefined();
		expect(files.find(f => f.path === "content/a/b/c/_meta.ts")).toBeDefined();
	});
});

describe("slug collision detection (warnings)", () => {
	it("should return empty warnings when no collisions exist", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Article A", contentMetadata: { title: "Article A" }, slug: "article-a" },
			{ content: "# Article B", contentMetadata: { title: "Article B" }, slug: "article-b" },
		];
		const { warnings } = generateSiteToMemory(articles, defaultOptions);
		expect(warnings).toEqual([]);
	});

	it("should detect collisions when two articles have the same slug at root level", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# First", contentMetadata: { title: "First" }, slug: "intro" },
			{ content: "# Second", contentMetadata: { title: "Second" }, slug: "intro" },
		];
		const { warnings } = generateSiteToMemory(articles, defaultOptions);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("intro");
		expect(warnings[0]).toContain("2 articles");
	});

	it("should NOT detect collisions when same slug is in different folders", () => {
		const articles: Array<ArticleInput> = [
			{
				content: "# Overview A",
				contentMetadata: { title: "Overview A" },
				slug: "overview",
				folderPath: "guides",
			},
			{
				content: "# Overview B",
				contentMetadata: { title: "Overview B" },
				slug: "overview",
				folderPath: "tutorials",
			},
			// Folder documents so folders exist
			{ content: "# Guides", contentMetadata: { title: "Guides" }, slug: "guides", isFolder: true },
			{ content: "# Tutorials", contentMetadata: { title: "Tutorials" }, slug: "tutorials", isFolder: true },
		];
		const { warnings } = generateSiteToMemory(articles, defaultOptions);
		// "overview" appears in different folders - no collision at same path
		const collisionWarnings = warnings.filter(w => w.includes("overview"));
		expect(collisionWarnings).toHaveLength(0);
	});

	it("should detect collisions for three or more articles with same slug", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# A", contentMetadata: { title: "A" }, slug: "setup" },
			{ content: "# B", contentMetadata: { title: "B" }, slug: "setup" },
			{ content: "# C", contentMetadata: { title: "C" }, slug: "setup" },
		];
		const { warnings } = generateSiteToMemory(articles, defaultOptions);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("3 articles");
	});

	it("should return empty warnings with empty articles list", () => {
		const { warnings } = generateSiteToMemory([], defaultOptions);
		expect(warnings).toEqual([]);
	});

	it("should use title-derived slugs for collision detection when slug is not set", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# One", contentMetadata: { title: "Getting Started" } },
			{ content: "# Two", contentMetadata: { title: "Getting Started" } },
		];
		const { warnings } = generateSiteToMemory(articles, defaultOptions);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("getting-started");
	});
});

describe("child folder meta generation", () => {
	it("should include child folder entries in parent folder _meta.ts", () => {
		const articles: Array<ArticleInput> = [
			// Parent folder
			{ content: "# Guides", contentMetadata: { title: "Guides" }, slug: "guides", isFolder: true },
			// Child folder
			{
				content: "# Advanced",
				contentMetadata: { title: "Advanced" },
				slug: "advanced",
				isFolder: true,
				folderPath: "guides",
			},
			// Article in child folder
			{
				content: "# Expert Tips",
				contentMetadata: { title: "Expert Tips" },
				slug: "expert-tips",
				folderPath: "guides/advanced",
			},
		];
		const { files } = generateSiteToMemory(articles, defaultOptions);

		// Parent folder _meta.ts should include child folder "advanced" entry
		const guidesMeta = files.find(f => f.path === "content/guides/_meta.ts");
		expect(guidesMeta).toBeDefined();
		expect(guidesMeta?.content).toContain("'advanced'");
	});

	it("should handle deeply nested folders (3+ levels)", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# L1", contentMetadata: { title: "Level 1" }, slug: "level-1", isFolder: true },
			{
				content: "# L2",
				contentMetadata: { title: "Level 2" },
				slug: "level-2",
				isFolder: true,
				folderPath: "level-1",
			},
			{
				content: "# L3",
				contentMetadata: { title: "Level 3" },
				slug: "level-3",
				isFolder: true,
				folderPath: "level-1/level-2",
			},
			{
				content: "# Deep Article",
				contentMetadata: { title: "Deep Article" },
				slug: "deep-article",
				folderPath: "level-1/level-2/level-3",
			},
		];
		const { files } = generateSiteToMemory(articles, defaultOptions);

		// Level 1 should reference level-2
		const l1Meta = files.find(f => f.path === "content/level-1/_meta.ts");
		expect(l1Meta).toBeDefined();
		expect(l1Meta?.content).toContain("'level-2'");

		// Level 2 should reference level-3
		const l2Meta = files.find(f => f.path === "content/level-1/level-2/_meta.ts");
		expect(l2Meta).toBeDefined();
		expect(l2Meta?.content).toContain("'level-3'");

		// Level 3 should reference the article
		const l3Meta = files.find(f => f.path === "content/level-1/level-2/level-3/_meta.ts");
		expect(l3Meta).toBeDefined();
		expect(l3Meta?.content).toContain("'deep-article'");
	});

	it("should NOT generate _meta.ts for leaf folder with only index.md (no children)", () => {
		// A deeply nested folder with only a folder document (index.md) and no child
		// articles or subfolders should NOT get a _meta.ts. An empty _meta.ts causes
		// Nextra's normalizePages to crash with "Cannot use 'in' operator to search
		// for 'data' in undefined" because the page map list is empty.
		const articles: Array<ArticleInput> = [
			{ content: "# Parent", contentMetadata: { title: "Parent" }, slug: "parent", isFolder: true },
			{
				content: "# Child",
				contentMetadata: { title: "Child" },
				slug: "child",
				isFolder: true,
				folderPath: "parent",
			},
			{
				content: "# Leaf Folder Content",
				contentMetadata: { title: "Leaf" },
				slug: "leaf",
				isFolder: true,
				folderPath: "parent/child",
			},
		];
		const { files } = generateSiteToMemory(articles, defaultOptions);

		// Leaf folder should have index.md (it has content)
		const leafIndex = files.find(f => f.path === "content/parent/child/leaf/index.md");
		expect(leafIndex).toBeDefined();

		// Leaf folder should NOT have _meta.ts (would be empty → crashes Nextra)
		const leafMeta = files.find(f => f.path === "content/parent/child/leaf/_meta.ts");
		expect(leafMeta).toBeUndefined();

		// Parent folder that contains the leaf should still have _meta.ts
		const childMeta = files.find(f => f.path === "content/parent/child/_meta.ts");
		expect(childMeta).toBeDefined();
		expect(childMeta?.content).toContain("'leaf'");
	});

	it("should generate _meta.ts for parent folder that has only child folders (no direct articles)", () => {
		const articles: Array<ArticleInput> = [
			// Parent folder with no direct articles, only a child folder
			{ content: "", contentMetadata: { title: "Parent" }, slug: "parent", isFolder: true },
			{
				content: "# Child",
				contentMetadata: { title: "Child" },
				slug: "child",
				isFolder: true,
				folderPath: "parent",
			},
			{
				content: "# Article",
				contentMetadata: { title: "Article" },
				slug: "article",
				folderPath: "parent/child",
			},
		];
		const { files } = generateSiteToMemory(articles, defaultOptions);

		// Parent should get _meta.ts with child folder entry
		const parentMeta = files.find(f => f.path === "content/parent/_meta.ts");
		expect(parentMeta).toBeDefined();
		expect(parentMeta?.content).toContain("'child'");
	});
});

describe("navigation mode switch property preservation", () => {
	it("should preserve type: page entries as simple strings in sidebar mode", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Article", contentMetadata: { title: "Article" }, slug: "article" },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: { navigationMode: "sidebar" },
			regenerationMode: true,
			migrationContext: {
				existingNavMeta: {
					article: { title: "Article", type: "page" },
				},
			},
		});

		// In sidebar mode, type: page entries should become simple strings
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();
		expect(metaFile?.content).toContain("'article': 'Article'");
	});

	it("should convert entries to type: page in tabs mode", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Article", contentMetadata: { title: "Article" }, slug: "article" },
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: { navigationMode: "tabs" },
		});

		// In tabs mode, top-level articles should have type: page
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();
		expect(metaFile?.content).toContain("type: 'page'");
	});

	it("should convert folders to type: page in tabs mode", () => {
		const articles: Array<ArticleInput> = [
			{ content: "# Guides", contentMetadata: { title: "Guides" }, slug: "guides", isFolder: true },
			{
				content: "# Setup",
				contentMetadata: { title: "Setup" },
				slug: "setup",
				folderPath: "guides",
			},
		];
		const { files } = generateSiteToMemory(articles, {
			...defaultOptions,
			theme: { navigationMode: "tabs" },
		});

		// Folder entry should have type: page in tabs mode
		const metaFile = files.find(f => f.path === "content/_meta.ts");
		expect(metaFile).toBeDefined();
		expect(metaFile?.content).toContain("'guides'");
		expect(metaFile?.content).toContain("type: 'page'");
	});

	describe("root-level _meta.ts ordering", () => {
		/**
		 * Helper: extracts ordered keys from a generated _meta.ts file content string.
		 * Matches keys in the format: 'key-name': ... (single-quoted keys in the export).
		 */
		function extractMetaKeys(metaContent: string | undefined): Array<string> {
			if (!metaContent) {
				return [];
			}
			const keyPattern = /^\s+'([^']+)':/gm;
			const keys: Array<string> = [];
			let match: RegExpExecArray | null = keyPattern.exec(metaContent);
			while (match !== null) {
				keys.push(match[1]);
				match = keyPattern.exec(metaContent);
			}
			return keys;
		}

		it("should preserve sortOrder for root folders that all have content", () => {
			// Simulate DB order: child articles first (parentId non-null), root articles last (parentId=null, sorted by sortOrder)
			const articles: Array<ArticleInput> = [
				// Children (appear first in DB result due to non-null parentId)
				{ content: "# Quick Start", contentMetadata: { title: "Quick Start" }, folderPath: "Getting Started" },
				{
					content: "# Code Standards",
					contentMetadata: { title: "Code Standards" },
					folderPath: "Contributing RENAME",
				},
				{ content: "# Some Page", contentMetadata: { title: "Some Page" }, folderPath: "BLAH BLAH" },
				// Root-level folders (parentId=null, sorted by sortOrder ASC)
				{
					content: "# Getting Started\nWelcome",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
				{
					content: "# Contributing\nHow to contribute",
					contentMetadata: { title: "Contributing RENAME" },
					isFolder: true,
				},
				{ content: "# BLAH BLAH\nSome intro", contentMetadata: { title: "BLAH BLAH" }, isFolder: true },
			];

			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				migrationContext: {
					allFolderMetas: [
						// Alphabetical order (as returned by GitHub API)
						{ folderPath: "blah-blah", metaContent: "", slugs: ["some-page"] },
						{ folderPath: "contributing-rename", metaContent: "", slugs: ["code-standards"] },
						{ folderPath: "getting-started", metaContent: "", slugs: ["quick-start"] },
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();

			const keys = extractMetaKeys(metaFile?.content);
			// Filter to just the content keys (exclude 'index' hidden entry)
			const contentKeys = keys.filter(k => k !== "index");
			expect(contentKeys).toEqual(["getting-started", "contributing-rename", "blah-blah"]);
		});

		it("should preserve sortOrder when one root folder has no content (empty folder)", () => {
			// Key scenario: BLAH BLAH is "just a folder" — isFolder=true but content is empty.
			// It still has children. The ordering should match the article array order (space tree sortOrder).
			const articles: Array<ArticleInput> = [
				// Children
				{ content: "# Quick Start", contentMetadata: { title: "Quick Start" }, folderPath: "Getting Started" },
				{
					content: "# Code Standards",
					contentMetadata: { title: "Code Standards" },
					folderPath: "Contributing RENAME",
				},
				{ content: "# Some Page", contentMetadata: { title: "Some Page" }, folderPath: "BLAH BLAH" },
				// Root-level folders in sortOrder
				{
					content: "# Getting Started\nWelcome",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
				{
					content: "# Contributing\nHow to contribute",
					contentMetadata: { title: "Contributing RENAME" },
					isFolder: true,
				},
				{ content: "", contentMetadata: { title: "BLAH BLAH" }, isFolder: true }, // No content!
			];

			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				migrationContext: {
					allFolderMetas: [
						// Alphabetical order from repo
						{ folderPath: "blah-blah", metaContent: "", slugs: ["some-page"] },
						{ folderPath: "contributing-rename", metaContent: "", slugs: ["code-standards"] },
						{ folderPath: "getting-started", metaContent: "", slugs: ["quick-start"] },
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();

			const keys = extractMetaKeys(metaFile?.content);
			const contentKeys = keys.filter(k => k !== "index");
			// BLAH BLAH should be LAST (sortOrder 3), not before Contributing RENAME
			expect(contentKeys).toEqual(["getting-started", "contributing-rename", "blah-blah"]);
		});

		it("should preserve sortOrder with renamed folder and empty folder during regeneration", () => {
			// Most realistic scenario: Contributing was renamed to Contributing RENAME (repo still has old "contributing" folder)
			// BLAH BLAH is an empty folder. allFolderMetas reflects the OLD repo state.
			const articles: Array<ArticleInput> = [
				// Children
				{ content: "# Quick Start", contentMetadata: { title: "Quick Start" }, folderPath: "Getting Started" },
				{
					content: "# Code Standards",
					contentMetadata: { title: "Code Standards" },
					folderPath: "Contributing RENAME",
				},
				{ content: "# Some Page", contentMetadata: { title: "Some Page" }, folderPath: "BLAH BLAH" },
				// Root-level folders in sortOrder
				{
					content: "# Getting Started\nWelcome",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
				{
					content: "# Contributing\nHow to contribute",
					contentMetadata: { title: "Contributing RENAME" },
					isFolder: true,
				},
				{ content: "", contentMetadata: { title: "BLAH BLAH" }, isFolder: true },
			];

			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				migrationContext: {
					allFolderMetas: [
						// Repo still has OLD folder name "contributing" (not yet renamed)
						{ folderPath: "blah-blah", metaContent: "", slugs: ["some-page"] },
						{ folderPath: "contributing", metaContent: "", slugs: ["code-standards"] },
						{ folderPath: "getting-started", metaContent: "", slugs: ["quick-start"] },
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();

			const keys = extractMetaKeys(metaFile?.content);
			const contentKeys = keys.filter(k => k !== "index");
			expect(contentKeys).toEqual(["getting-started", "contributing-rename", "blah-blah"]);
		});

		it("should preserve sortOrder with empty folder that has no children in allFolderMetas", () => {
			// Edge case: BLAH BLAH is a brand new empty folder - exists in articles but not yet in repo
			const articles: Array<ArticleInput> = [
				// Children
				{ content: "# Quick Start", contentMetadata: { title: "Quick Start" }, folderPath: "Getting Started" },
				{
					content: "# Code Standards",
					contentMetadata: { title: "Code Standards" },
					folderPath: "Contributing RENAME",
				},
				{ content: "# Some Page", contentMetadata: { title: "Some Page" }, folderPath: "BLAH BLAH" },
				// Root-level folders in sortOrder
				{
					content: "# Getting Started\nWelcome",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
				{
					content: "# Contributing\nHow to contribute",
					contentMetadata: { title: "Contributing RENAME" },
					isFolder: true,
				},
				{ content: "", contentMetadata: { title: "BLAH BLAH" }, isFolder: true },
			];

			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				migrationContext: {
					allFolderMetas: [
						// Repo only has the first two folders — BLAH BLAH is new
						{ folderPath: "contributing-rename", metaContent: "", slugs: ["code-standards"] },
						{ folderPath: "getting-started", metaContent: "", slugs: ["quick-start"] },
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();

			const keys = extractMetaKeys(metaFile?.content);
			const contentKeys = keys.filter(k => k !== "index");
			expect(contentKeys).toEqual(["getting-started", "contributing-rename", "blah-blah"]);
		});

		it("should put overview article first in folder _meta.ts when switching to tabs mode (merge path)", () => {
			// Scenario: site was in sidebar mode, user switches to tabs mode.
			// Existing folder _meta.ts has articles but no "overview" entry.
			// The overview should be first in the regenerated folder _meta.ts.
			const articles: Array<ArticleInput> = [
				{ content: "# Quick Start", contentMetadata: { title: "Quick Start" }, folderPath: "Getting Started" },
				{ content: "# Advanced", contentMetadata: { title: "Advanced Guide" }, folderPath: "Getting Started" },
				// Folder article with content (creates overview in tabs mode)
				{
					content: "# Getting Started\nWelcome",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
			];
			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				preserveNavOrder: true,
				theme: { navigationMode: "tabs" },
				migrationContext: {
					existingNavMeta: {
						index: { display: "hidden" },
						"getting-started": { title: "Getting Started", type: "page" },
					},
					allFolderMetas: [
						{
							folderPath: "getting-started",
							// Previous sidebar mode _meta.ts — no "overview" entry
							metaContent: `export default {\n  'quick-start': 'Quick Start',\n  'advanced-guide': 'Advanced Guide',\n}`,
							slugs: ["quick-start", "advanced-guide"],
						},
					],
				},
			});
			const folderMeta = files.find(f => f.path === "content/getting-started/_meta.ts");
			expect(folderMeta).toBeDefined();
			const keys = extractMetaKeys(folderMeta?.content);
			// "overview" should be FIRST, then articles in space tree order
			expect(keys[0]).toBe("overview");
		});

		it("should preserve existing _meta.ts order when preserveNavOrder is true (merge path)", () => {
			// When preserveNavOrder=true (auto-sync OFF), the user has manually customized
			// their navigation order. The merge path preserves that custom order.
			// Auto-sync ON sites get preserveNavOrder=false and go through the fresh path.
			const articles: Array<ArticleInput> = [
				// Children
				{ content: "# Quick Start", contentMetadata: { title: "Quick Start" }, folderPath: "Getting Started" },
				{
					content: "# Code Standards",
					contentMetadata: { title: "Code Standards" },
					folderPath: "Contributing RENAME",
				},
				{ content: "# Some Page", contentMetadata: { title: "Some Page" }, folderPath: "BLAH BLAH" },
				// Root-level folders in sortOrder: GS=1, CR=2, BB=3
				{
					content: "# Getting Started\nWelcome",
					contentMetadata: { title: "Getting Started" },
					isFolder: true,
				},
				{
					content: "# Contributing\nHow to contribute",
					contentMetadata: { title: "Contributing RENAME" },
					isFolder: true,
				},
				{ content: "", contentMetadata: { title: "BLAH BLAH" }, isFolder: true },
			];

			const { files } = generateSiteToMemory(articles, {
				...defaultOptions,
				regenerationMode: true,
				preserveNavOrder: true,
				migrationContext: {
					// Existing _meta.ts has custom order (blah-blah before contributing-rename)
					existingNavMeta: {
						index: { display: "hidden" },
						"getting-started": "Getting Started",
						"blah-blah": "BLAH BLAH",
						"contributing-rename": "Contributing RENAME",
					},
					allFolderMetas: [
						{ folderPath: "blah-blah", metaContent: "", slugs: ["some-page"] },
						{ folderPath: "contributing-rename", metaContent: "", slugs: ["code-standards"] },
						{ folderPath: "getting-started", metaContent: "", slugs: ["quick-start"] },
					],
				},
			});

			const metaFile = files.find(f => f.path === "content/_meta.ts");
			expect(metaFile).toBeDefined();

			const keys = extractMetaKeys(metaFile?.content);
			const contentKeys = keys.filter(k => k !== "index");
			// Should preserve the existing _meta.ts order (user's custom order from Navigation tab)
			expect(contentKeys).toEqual(["getting-started", "blah-blah", "contributing-rename"]);
		});
	});
});
