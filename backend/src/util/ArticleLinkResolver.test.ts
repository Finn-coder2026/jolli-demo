import type { FileTree } from "../github/DocsiteGitHub";
import type { Doc } from "../model/Doc";
import {
	type ArticleLinkDoc,
	buildJrnToUrlMap,
	resolveArticleLinks,
	transformArticleLinks,
	validateArticleLinks,
} from "./ArticleLinkResolver";
import { describe, expect, test, vi } from "vitest";

// Mock the Logger
vi.mock("./Logger", () => ({
	getLog: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

/**
 * Helper to create an ArticleLinkDoc for buildJrnToUrlMap and resolveArticleLinks tests.
 * Accepts a doc path with nanoid suffixes (as stored in the DB) so that
 * extractFolderPath can derive the correct clean folder path.
 *
 * @param jrn - Article JRN
 * @param title - Article title (used for slug derivation)
 * @param docPath - Full doc path with nanoid suffixes (e.g., "/guides-abc1234/setup-xyz7890")
 * @param docType - "document" or "folder" (default: "document")
 */
function createArticleDoc(
	jrn: string,
	title: string,
	docPath: string,
	docType: "document" | "folder" = "document",
): ArticleLinkDoc {
	return { jrn, contentMetadata: { title }, path: docPath, docType };
}

/** Helper to create a minimal Doc for validateArticleLinks tests (needs content, no path) */
function createDoc(jrn: string, title: string, content = ""): Pick<Doc, "jrn" | "content" | "contentMetadata"> {
	return { jrn, content, contentMetadata: { title } };
}

/** Helper to create a FileTree content file */
function createContentFile(path: string, content = ""): FileTree {
	return { path, content };
}

describe("ArticleLinkResolver", () => {
	describe("buildJrnToUrlMap", () => {
		test("maps JRN to root-level URL path", () => {
			const articles = [createArticleDoc("jrn:doc:1", "Getting Started", "/getting-started-abc1234")];
			const files = [createContentFile("content/getting-started.md")];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:1")).toBe("/getting-started");
		});

		test("maps JRN to folder URL path", () => {
			const articles = [createArticleDoc("jrn:doc:2", "Setup Guide", "/guides-abc1234/setup-guide-def5678")];
			const files = [createContentFile("content/guides/setup-guide.md")];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:2")).toBe("/guides/setup-guide");
		});

		test("handles multiple articles", () => {
			const articles = [
				createArticleDoc("jrn:doc:1", "Getting Started", "/getting-started-abc1234"),
				createArticleDoc("jrn:doc:2", "API Reference", "/api-reference-def5678"),
				createArticleDoc("jrn:doc:3", "FAQ", "/faq-ghi9012"),
			];
			const files = [
				createContentFile("content/getting-started.md"),
				createContentFile("content/api-reference.md"),
				createContentFile("content/faq.md"),
			];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.size).toBe(3);
			expect(map.get("jrn:doc:1")).toBe("/getting-started");
			expect(map.get("jrn:doc:2")).toBe("/api-reference");
			expect(map.get("jrn:doc:3")).toBe("/faq");
		});

		test("handles MDX extension", () => {
			const articles = [createArticleDoc("jrn:doc:1", "My Article", "/my-article-abc1234")];
			const files = [createContentFile("content/my-article.mdx")];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:1")).toBe("/my-article");
		});

		test("skips non-content files", () => {
			const articles = [createArticleDoc("jrn:doc:1", "My Article", "/my-article-abc1234")];
			const files = [
				createContentFile("content/my-article.md"),
				createContentFile("app/layout.tsx"),
				createContentFile("package.json"),
			];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.size).toBe(1);
		});

		test("returns empty map when no articles match content files", () => {
			const articles = [createArticleDoc("jrn:doc:1", "Nonexistent", "/nonexistent-abc1234")];
			const files = [createContentFile("content/different-article.md")];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.size).toBe(0);
		});

		test("uses 'Untitled Article' as fallback title", () => {
			const articles: Array<ArticleLinkDoc> = [
				{
					jrn: "jrn:doc:1",
					contentMetadata: undefined,
					path: "/untitled-article-abc1234",
					docType: "document",
				},
			];
			const files = [createContentFile("content/untitled-article.md")];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:1")).toBe("/untitled-article");
		});

		test("maps folder index.md to folder slug and URL", () => {
			const articles = [createArticleDoc("jrn:doc:1", "Guides", "/guides-abc1234", "folder")];
			const files = [createContentFile("content/guides/index.md")];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:1")).toBe("/guides");
		});

		test("maps folder overview.md to folder slug and URL (tabs mode)", () => {
			const articles = [createArticleDoc("jrn:doc:1", "Introduction", "/introduction-abc1234", "folder")];
			const files = [createContentFile("content/introduction/overview.md")];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:1")).toBe("/introduction");
		});

		test("maps nested folder index.md correctly", () => {
			const articles = [
				createArticleDoc("jrn:doc:1", "Advanced", "/guides-abc1234/advanced-def5678", "folder"),
				createArticleDoc("jrn:doc:2", "Basics", "/guides-abc1234/basics-ghi9012"),
			];
			const files = [
				createContentFile("content/guides/advanced/index.md"),
				createContentFile("content/guides/basics.md"),
			];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:1")).toBe("/guides/advanced");
			expect(map.get("jrn:doc:2")).toBe("/guides/basics");
		});

		test("resolves same-title articles in different folders correctly", () => {
			// Two articles titled "Setup" in different folders — previously broke with slug-only matching
			const articles = [
				createArticleDoc("jrn:doc:1", "Setup", "/guides-abc1234/setup-def5678"),
				createArticleDoc("jrn:doc:2", "Setup", "/tutorials-ghi9012/setup-jkl3456"),
			];
			const files = [
				createContentFile("content/guides/setup.md"),
				createContentFile("content/tutorials/setup.md"),
			];

			const map = buildJrnToUrlMap(articles, files);

			// Both articles resolve correctly to their respective folders
			expect(map.get("jrn:doc:1")).toBe("/guides/setup");
			expect(map.get("jrn:doc:2")).toBe("/tutorials/setup");
		});

		test("handles renamed folders by applying folder slug remapping", () => {
			// Folder "Tooling" was renamed to "Dev Tools" in the UI. The DB path still
			// has the old slug "tooling", but generated content files use "dev-tools".
			const articles = [
				// Folder article: DB path still uses old slug "tooling"
				createArticleDoc("jrn:doc:folder", "Dev Tools", "/tooling-abc1234", "folder"),
				// Child articles: DB paths reference old parent slug "tooling"
				createArticleDoc("jrn:doc:1", "IDE", "/tooling-abc1234/ide-def5678"),
				createArticleDoc("jrn:doc:2", "Pull Requests", "/tooling-abc1234/pull-requests-ghi9012"),
			];
			// Generated files use the NEW folder name from the title
			const files = [
				createContentFile("content/dev-tools/index.md"),
				createContentFile("content/dev-tools/ide.md"),
				createContentFile("content/dev-tools/pull-requests.md"),
			];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:folder")).toBe("/dev-tools");
			expect(map.get("jrn:doc:1")).toBe("/dev-tools/ide");
			expect(map.get("jrn:doc:2")).toBe("/dev-tools/pull-requests");
		});

		test("handles renamed nested folders", () => {
			// Nested folder "Getting Started > Tooling" renamed to "Getting Started > Workflows"
			const articles = [
				createArticleDoc("jrn:doc:parent", "Getting Started", "/getting-started-aaa1111", "folder"),
				createArticleDoc("jrn:doc:folder", "Workflows", "/getting-started-aaa1111/tooling-bbb2222", "folder"),
				createArticleDoc("jrn:doc:1", "CI CD", "/getting-started-aaa1111/tooling-bbb2222/ci-cd-ccc3333"),
			];
			const files = [
				createContentFile("content/getting-started/index.md"),
				createContentFile("content/getting-started/workflows/index.md"),
				createContentFile("content/getting-started/workflows/ci-cd.md"),
			];

			const map = buildJrnToUrlMap(articles, files);

			expect(map.get("jrn:doc:parent")).toBe("/getting-started");
			expect(map.get("jrn:doc:folder")).toBe("/getting-started/workflows");
			expect(map.get("jrn:doc:1")).toBe("/getting-started/workflows/ci-cd");
		});
	});

	describe("transformArticleLinks", () => {
		test("converts resolvable JRN links to site URLs", () => {
			const content = "Check out [Getting Started](jrn:doc:1) for details.";
			const jrnToUrl = new Map([["jrn:doc:1", "/getting-started"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			expect(result.content).toBe("Check out [Getting Started](/getting-started) for details.");
			expect(result.unresolved).toHaveLength(0);
		});

		test("converts unresolvable JRN links to plain text", () => {
			const content = "See [Missing Article](jrn:doc:missing) for more.";
			const jrnToUrl = new Map<string, string>();

			const result = transformArticleLinks(content, jrnToUrl);

			expect(result.content).toBe("See Missing Article for more.");
			expect(result.unresolved).toHaveLength(1);
			expect(result.unresolved[0]).toEqual({ jrn: "jrn:doc:missing", text: "Missing Article" });
		});

		test("handles mix of resolvable and unresolvable links", () => {
			const content = "Read [Intro](jrn:doc:1) and [Advanced](jrn:doc:2) guides.";
			const jrnToUrl = new Map([["jrn:doc:1", "/intro"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			expect(result.content).toBe("Read [Intro](/intro) and Advanced guides.");
			expect(result.unresolved).toHaveLength(1);
			expect(result.unresolved[0].jrn).toBe("jrn:doc:2");
		});

		test("handles multiple occurrences of the same link", () => {
			const content = "See [FAQ](jrn:doc:faq) here, and again [FAQ](jrn:doc:faq) there.";
			const jrnToUrl = new Map([["jrn:doc:faq", "/faq"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			expect(result.content).toBe("See [FAQ](/faq) here, and again [FAQ](/faq) there.");
			expect(result.unresolved).toHaveLength(0);
		});

		test("handles folder URL paths", () => {
			const content = "See [Setup](jrn:doc:1) guide.";
			const jrnToUrl = new Map([["jrn:doc:1", "/guides/setup"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			expect(result.content).toBe("See [Setup](/guides/setup) guide.");
		});

		test("preserves content without JRN links", () => {
			const content = "No links here, just [external](https://example.com).";
			const jrnToUrl = new Map([["jrn:doc:1", "/some-page"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			expect(result.content).toBe(content);
			expect(result.unresolved).toHaveLength(0);
		});

		test("handles empty link text", () => {
			const content = "Link: [](jrn:doc:1)";
			const jrnToUrl = new Map([["jrn:doc:1", "/page"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			expect(result.content).toBe("Link: [](/page)");
		});

		test("preserves links inside fenced code blocks", () => {
			const content = "```\n[Link](jrn:doc:1)\n```\n\n[Link](jrn:doc:1)";
			const jrnToUrl = new Map([["jrn:doc:1", "/page"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			// Code block content is preserved; only the link outside is transformed
			expect(result.content).toBe("```\n[Link](jrn:doc:1)\n```\n\n[Link](/page)");
		});

		test("converts unresolvable links to plain text but preserves code blocks", () => {
			const content = "```\n[Example](jrn:doc:missing)\n```\n\nSee [Missing](jrn:doc:missing) for details.";
			const jrnToUrl = new Map<string, string>();

			const result = transformArticleLinks(content, jrnToUrl);

			// Code block preserved, only non-code-block link converted to plain text
			expect(result.content).toBe("```\n[Example](jrn:doc:missing)\n```\n\nSee Missing for details.");
			expect(result.unresolved).toHaveLength(1);
		});

		test("preserves links inside tilde-fenced code blocks", () => {
			const content = "~~~\n[Link](jrn:doc:1)\n~~~\n\n[Link](jrn:doc:1)";
			const jrnToUrl = new Map([["jrn:doc:1", "/page"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			expect(result.content).toBe("~~~\n[Link](jrn:doc:1)\n~~~\n\n[Link](/page)");
		});

		test("preserves links inside 4+ backtick fenced code blocks", () => {
			const content = "````\n```\n[Link](jrn:doc:1)\n```\n````\n\n[Link](jrn:doc:1)";
			const jrnToUrl = new Map([["jrn:doc:1", "/page"]]);

			const result = transformArticleLinks(content, jrnToUrl);

			// The nested ``` inside ```` should be preserved, only the outside link transformed
			expect(result.content).toBe("````\n```\n[Link](jrn:doc:1)\n```\n````\n\n[Link](/page)");
		});
	});

	describe("resolveArticleLinks", () => {
		test("transforms article links in content files", () => {
			const articles = [
				createArticleDoc("jrn:doc:1", "Getting Started", "/getting-started-abc1234"),
				createArticleDoc("jrn:doc:2", "FAQ", "/faq-def5678"),
			];
			const files: Array<FileTree> = [
				{ path: "content/getting-started.md", content: "See [FAQ](jrn:doc:2) for help." },
				{ path: "content/faq.md", content: "Back to [Getting Started](jrn:doc:1)." },
				{ path: "package.json", content: "{}" },
			];

			const result = resolveArticleLinks(files, articles);

			expect(result.transformedFiles[0].content).toBe("See [FAQ](/faq) for help.");
			expect(result.transformedFiles[1].content).toBe("Back to [Getting Started](/getting-started).");
			expect(result.transformedFiles[2].content).toBe("{}"); // Non-content file untouched
			expect(result.warnings).toHaveLength(0);
		});

		test("returns warnings for unresolvable links", () => {
			const articles = [createArticleDoc("jrn:doc:1", "Included Article", "/included-article-abc1234")];
			const files: Array<FileTree> = [
				{
					path: "content/included-article.md",
					content: "Links to [Missing](jrn:doc:excluded).",
				},
			];

			const result = resolveArticleLinks(files, articles);

			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0].articleTitle).toBe("included-article");
			expect(result.warnings[0].linkText).toBe("Missing");
			expect(result.warnings[0].unresolvedJrn).toBe("jrn:doc:excluded");
		});

		test("returns files unchanged when no content files exist", () => {
			const files: Array<FileTree> = [
				{ path: "package.json", content: "{}" },
				{ path: "app/layout.tsx", content: "export default function Layout() {}" },
			];

			const result = resolveArticleLinks(files, []);

			expect(result.transformedFiles).toBe(files); // Same reference
			expect(result.warnings).toHaveLength(0);
		});

		test("returns files unchanged when no JRN mappings exist", () => {
			const articles: Array<ArticleLinkDoc> = [];
			const files: Array<FileTree> = [{ path: "content/article.md", content: "No JRN links here." }];

			const result = resolveArticleLinks(files, articles);

			expect(result.transformedFiles).toBe(files); // Same reference
			expect(result.warnings).toHaveLength(0);
		});

		test("returns original files when content has no JRN links to transform", () => {
			const articles = [createArticleDoc("jrn:doc:1", "Article One", "/article-one-abc1234")];
			const files: Array<FileTree> = [
				{
					path: "content/article-one.md",
					content: "No cross-references here, just [external](https://example.com).",
				},
			];

			const result = resolveArticleLinks(files, articles);

			// JRN map exists but no links matched, so files are unchanged (same reference)
			expect(result.transformedFiles).toBe(files);
			expect(result.warnings).toHaveLength(0);
		});

		test("transforms article links in MDX content files", () => {
			const articles = [
				createArticleDoc("jrn:doc:1", "Intro", "/intro-abc1234"),
				createArticleDoc("jrn:doc:2", "Details", "/details-def5678"),
			];
			const files: Array<FileTree> = [
				{ path: "content/intro.mdx", content: "See [Details](jrn:doc:2)." },
				{ path: "content/details.mdx", content: "Back to [Intro](jrn:doc:1)." },
			];

			const result = resolveArticleLinks(files, articles);

			expect(result.transformedFiles[0].content).toBe("See [Details](/details).");
			expect(result.transformedFiles[1].content).toBe("Back to [Intro](/intro).");
		});

		test("handles folder-nested content files", () => {
			const articles = [
				createArticleDoc("jrn:doc:1", "Setup Guide", "/guides-abc1234/setup-guide-def5678"),
				createArticleDoc("jrn:doc:2", "Quick Start", "/quick-start-ghi9012"),
			];
			const files: Array<FileTree> = [
				{ path: "content/guides/setup-guide.md", content: "See [Quick Start](jrn:doc:2)." },
				{ path: "content/quick-start.md", content: "See [Setup Guide](jrn:doc:1)." },
			];

			const result = resolveArticleLinks(files, articles);

			expect(result.transformedFiles[0].content).toBe("See [Quick Start](/quick-start).");
			expect(result.transformedFiles[1].content).toBe("See [Setup Guide](/guides/setup-guide).");
		});

		test("resolves links to folder articles with index.md", () => {
			const articles = [
				createArticleDoc("jrn:doc:1", "Guides", "/guides-abc1234", "folder"),
				createArticleDoc("jrn:doc:2", "Quick Start", "/quick-start-def5678"),
			];
			const files: Array<FileTree> = [
				{ path: "content/guides/index.md", content: "See [Quick Start](jrn:doc:2)." },
				{ path: "content/quick-start.md", content: "See [Guides](jrn:doc:1)." },
			];

			const result = resolveArticleLinks(files, articles);

			expect(result.transformedFiles[0].content).toBe("See [Quick Start](/quick-start).");
			expect(result.transformedFiles[1].content).toBe("See [Guides](/guides).");
		});

		test("resolves links to folder articles with overview.md (tabs mode)", () => {
			const articles = [
				createArticleDoc("jrn:doc:1", "Intro", "/intro-abc1234", "folder"),
				createArticleDoc("jrn:doc:2", "Details", "/intro-abc1234/details-def5678"),
			];
			const files: Array<FileTree> = [
				{ path: "content/intro/overview.md", content: "See [Details](jrn:doc:2)." },
				{ path: "content/intro/details.md", content: "See [Intro](jrn:doc:1)." },
			];

			const result = resolveArticleLinks(files, articles);

			expect(result.transformedFiles[0].content).toBe("See [Details](/intro/details).");
			expect(result.transformedFiles[1].content).toBe("See [Intro](/intro).");
		});

		test("resolves cross-references correctly when a folder has been renamed", () => {
			// Folder renamed from "Tooling" to "Dev Tools" — DB paths still use old slug
			const articles = [
				createArticleDoc("jrn:doc:folder", "Dev Tools", "/tooling-abc1234", "folder"),
				createArticleDoc("jrn:doc:1", "IDE", "/tooling-abc1234/ide-def5678"),
				createArticleDoc("jrn:doc:2", "Pull Requests", "/tooling-abc1234/pull-requests-ghi9012"),
			];
			const files: Array<FileTree> = [
				// Generated files use the NEW folder name
				{ path: "content/dev-tools/index.md", content: "See [IDE](jrn:doc:1) and [Pull Requests](jrn:doc:2)." },
				{ path: "content/dev-tools/ide.md", content: "See [Pull Requests](jrn:doc:2)." },
				{ path: "content/dev-tools/pull-requests.md", content: "See [IDE](jrn:doc:1)." },
			];

			const result = resolveArticleLinks(files, articles);

			expect(result.transformedFiles[0].content).toBe(
				"See [IDE](/dev-tools/ide) and [Pull Requests](/dev-tools/pull-requests).",
			);
			expect(result.transformedFiles[1].content).toBe("See [Pull Requests](/dev-tools/pull-requests).");
			expect(result.transformedFiles[2].content).toBe("See [IDE](/dev-tools/ide).");
			expect(result.warnings).toHaveLength(0);
		});
	});

	describe("validateArticleLinks", () => {
		test("detects unresolvable cross-references", () => {
			const articles = [createDoc("jrn:doc:1", "Article A", "Links to [B](jrn:doc:2) and [C](jrn:doc:3).")];
			const siteJrns = new Set(["jrn:doc:1", "jrn:doc:2"]);

			const warnings = validateArticleLinks(articles, siteJrns);

			expect(warnings).toHaveLength(1);
			expect(warnings[0].articleTitle).toBe("Article A");
			expect(warnings[0].linkText).toBe("C");
			expect(warnings[0].unresolvedJrn).toBe("jrn:doc:3");
		});

		test("returns empty when all references are resolvable", () => {
			const articles = [
				createDoc("jrn:doc:1", "Article A", "Links to [B](jrn:doc:2)."),
				createDoc("jrn:doc:2", "Article B", "Links to [A](jrn:doc:1)."),
			];
			const siteJrns = new Set(["jrn:doc:1", "jrn:doc:2"]);

			const warnings = validateArticleLinks(articles, siteJrns);

			expect(warnings).toHaveLength(0);
		});

		test("returns empty when articles have no cross-references", () => {
			const articles = [createDoc("jrn:doc:1", "Solo Article", "No links here.")];
			const siteJrns = new Set(["jrn:doc:1"]);

			const warnings = validateArticleLinks(articles, siteJrns);

			expect(warnings).toHaveLength(0);
		});

		test("skips references inside code blocks", () => {
			const content = "```\n[In Code](jrn:doc:missing)\n```\n\n[Real](jrn:doc:also-missing)";
			const articles = [createDoc("jrn:doc:1", "Article", content)];
			const siteJrns = new Set(["jrn:doc:1"]);

			const warnings = validateArticleLinks(articles, siteJrns);

			// Only the non-code-block reference should be flagged
			expect(warnings).toHaveLength(1);
			expect(warnings[0].unresolvedJrn).toBe("jrn:doc:also-missing");
		});

		test("handles multiple articles with multiple unresolvable links", () => {
			const articles = [
				createDoc("jrn:doc:1", "A", "See [X](jrn:doc:x) and [Y](jrn:doc:y)."),
				createDoc("jrn:doc:2", "B", "See [Z](jrn:doc:z)."),
			];
			const siteJrns = new Set(["jrn:doc:1", "jrn:doc:2"]);

			const warnings = validateArticleLinks(articles, siteJrns);

			expect(warnings).toHaveLength(3);
			const jrns = warnings.map(w => w.unresolvedJrn);
			expect(jrns).toContain("jrn:doc:x");
			expect(jrns).toContain("jrn:doc:y");
			expect(jrns).toContain("jrn:doc:z");
		});

		test("uses 'Untitled Article' fallback when contentMetadata has no title", () => {
			const articles: Array<Pick<Doc, "jrn" | "content" | "contentMetadata">> = [
				{ jrn: "jrn:doc:1", content: "See [Link](jrn:doc:missing).", contentMetadata: undefined },
			];
			const siteJrns = new Set(["jrn:doc:1"]);

			const warnings = validateArticleLinks(articles, siteJrns);

			expect(warnings).toHaveLength(1);
			expect(warnings[0].articleTitle).toBe("Untitled Article");
		});
	});
});
