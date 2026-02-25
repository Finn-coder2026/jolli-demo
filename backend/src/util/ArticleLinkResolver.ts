/**
 * Article cross-reference link resolver for site generation.
 *
 * Transforms JRN links ([Title](jrn:...)) into site-relative URLs.
 * Unresolvable links become plain text with build warnings.
 * Follows the same pattern as ImageBundler.ts for content transformation.
 */

import type { FileTree } from "../github/DocsiteGitHub";
import type { Doc } from "../model/Doc";
import { getLog } from "./Logger";
import { buildFolderSlugMapping, extractFolderPath, slugify } from "./NextraGenerationUtil";

const log = getLog(import.meta);

/**
 * Match article link refs: [Title](jrn:...)
 * Capture group 1: link text
 * Capture group 2: full JRN value (jrn:...)
 */
const ARTICLE_LINK_REGEX = /\[([^\]]*)\]\((jrn:[^)]+)\)/g;

/** Warning about an article link that could not be resolved to a site URL. */
export interface ArticleLinkWarning {
	articleTitle: string;
	linkText: string;
	unresolvedJrn: string;
}

/** Result of resolving article cross-reference links in site content. */
export interface ArticleLinkResolutionResult {
	transformedFiles: Array<FileTree>;
	warnings: Array<ArticleLinkWarning>;
}

/**
 * Regex for fenced code blocks: backtick fences (3+) and tilde fences (3+).
 * Uses backreferences to match the correct closing fence (same char, same or greater length).
 * Multiline mode so ^ and $ match line boundaries within the string.
 */
const FENCED_CODE_BLOCK_REGEX = /^(`{3,})[^\n]*\n[\s\S]*?^\1`*\s*$|^(~{3,})[^\n]*\n[\s\S]*?^\2~*\s*$/gm;

/**
 * Remove fenced code blocks from content to avoid extracting article refs
 * that are documentation examples rather than actual cross-references.
 */
function removeFencedCodeBlocks(content: string): string {
	return content.replace(FENCED_CODE_BLOCK_REGEX, "");
}

/** Minimum fields needed from a Doc to compute its expected URL path. */
export type ArticleLinkDoc = Pick<Doc, "jrn" | "contentMetadata" | "path" | "docType">;

/**
 * Build a map from article JRN to site-relative URL path.
 *
 * Uses the same slug derivation as the Nextra generator: `slugify(title)` for
 * the article slug and `extractFolderPath(doc.path)` for the folder prefix.
 * This direct path computation avoids slug-only matching which breaks when
 * two articles in different folders share the same title.
 *
 * Folder articles (docType "folder") whose content lives in `index.md` or
 * `overview.md` resolve to their folder URL (e.g., `/guides`, not `/guides/index`).
 *
 * @param articles - Articles included in the site
 * @param contentFiles - Generated content files from the FileTree
 * @returns Map from JRN to site-relative URL path (e.g., "/getting-started")
 */
export function buildJrnToUrlMap(articles: Array<ArticleLinkDoc>, contentFiles: Array<FileTree>): Map<string, string> {
	const jrnToUrl = new Map<string, string>();

	// Build a set of all URL paths present in the generated content files.
	// Content files follow these patterns:
	//   content/{slug}.md              → URL: /{slug}
	//   content/{folder}/{slug}.md     → URL: /{folder}/{slug}
	//   content/{slug}/index.md        → URL: /{slug}        (folder with content)
	//   content/{slug}/overview.md     → URL: /{slug}        (folder, tabs mode)
	const validUrlPaths = new Set<string>();
	for (const file of contentFiles) {
		if (!file.path.startsWith("content/")) {
			continue;
		}
		const urlPath = file.path.replace(/^content\//, "").replace(/\.(md|mdx)$/, "");
		const segments = urlPath.split("/");
		const fileName = segments[segments.length - 1];

		// Folder index/overview files serve at the folder URL, not /folder/index
		const isFolderIndex = fileName === "index" || fileName === "overview";
		const resolvedUrl = isFolderIndex ? `/${segments.slice(0, -1).join("/")}` : `/${urlPath}`;
		validUrlPaths.add(resolvedUrl);
	}

	// Build folder slug mapping to handle renamed folders. The generator applies
	// this same remapping before creating content files, so we must apply it here
	// too for the expected URLs to match the generated file paths.
	const folderSlugMapping = buildFolderSlugMapping(articles);

	// For each article, compute its expected URL using the same logic as the
	// Nextra generator: folder path from doc.path + slug from title.
	for (const article of articles) {
		const title = article.contentMetadata?.title || "Untitled Article";
		const slug = slugify(title);
		let folderPath = article.path ? extractFolderPath(article.path) : "";

		// Apply folder slug remapping for renamed folders
		if (folderPath && folderSlugMapping.size > 0) {
			folderPath = remapFolderPath(folderPath, folderSlugMapping);
		}

		const expectedUrl = folderPath ? `/${folderPath}/${slug}` : `/${slug}`;

		if (validUrlPaths.has(expectedUrl)) {
			jrnToUrl.set(article.jrn, expectedUrl);
		} else {
			log.debug(
				"Article JRN %s not mapped: expected URL %s not found in content files",
				article.jrn,
				expectedUrl,
			);
		}
	}

	return jrnToUrl;
}

/**
 * Apply folder slug remapping to a folder path.
 * Each segment is checked against the mapping and replaced if found.
 */
function remapFolderPath(folderPath: string, slugMapping: Map<string, string>): string {
	return folderPath
		.split("/")
		.map(segment => slugMapping.get(segment) ?? segment)
		.join("/");
}

/**
 * Replace JRN links in a single text segment (outside of code blocks).
 */
function replaceLinksInSegment(
	segment: string,
	jrnToUrl: Map<string, string>,
	unresolved: Array<{ jrn: string; text: string }>,
): string {
	return segment.replace(ARTICLE_LINK_REGEX, (_match, text: string, jrn: string) => {
		const urlPath = jrnToUrl.get(jrn);
		if (urlPath) {
			return `[${text}](${urlPath})`;
		}
		unresolved.push({ jrn, text });
		return text;
	});
}

/**
 * Transform article cross-reference links in content, preserving fenced code blocks.
 *
 * - Resolvable links: [Title](jrn:...) -> [Title](/url-path)
 * - Unresolvable links: [Title](jrn:...) -> Title (plain text)
 * - Code block contents are left untouched
 */
export function transformArticleLinks(
	content: string,
	jrnToUrl: Map<string, string>,
): { content: string; unresolved: Array<{ jrn: string; text: string }> } {
	const unresolved: Array<{ jrn: string; text: string }> = [];

	// Split on fenced code blocks, only transform non-code segments
	const parts: Array<string> = [];
	let lastIndex = 0;

	for (const match of content.matchAll(FENCED_CODE_BLOCK_REGEX)) {
		const matchIndex = match.index;
		// Transform the text before this code block
		parts.push(replaceLinksInSegment(content.slice(lastIndex, matchIndex), jrnToUrl, unresolved));
		// Preserve the code block as-is
		parts.push(match[0]);
		lastIndex = matchIndex + match[0].length;
	}

	// Transform remaining text after the last code block
	parts.push(replaceLinksInSegment(content.slice(lastIndex), jrnToUrl, unresolved));

	return { content: parts.join(""), unresolved };
}

/**
 * Resolve article cross-reference links in all content files.
 *
 * This is the main entry point for article link resolution, analogous
 * to `bundleSiteImages` in ImageBundler.ts.
 *
 * @param files - All generated files (content + config files)
 * @param articles - Articles included in the site
 * @returns Files with transformed content and any warnings
 */
export function resolveArticleLinks(
	files: Array<FileTree>,
	articles: Array<ArticleLinkDoc>,
): ArticleLinkResolutionResult {
	// Identify content files that may contain article links
	const contentFiles = files.filter(
		f => f.path.startsWith("content/") && (f.path.endsWith(".md") || f.path.endsWith(".mdx")),
	);

	if (contentFiles.length === 0) {
		return { transformedFiles: files, warnings: [] };
	}

	// Build JRN-to-URL map from articles and their generated file paths
	const jrnToUrl = buildJrnToUrlMap(articles, contentFiles);

	if (jrnToUrl.size === 0) {
		log.debug("No article JRN-to-URL mappings found, skipping link resolution");
		return { transformedFiles: files, warnings: [] };
	}

	const warnings: Array<ArticleLinkWarning> = [];
	const contentFileMap = new Map<string, string>();

	// Transform article links in each content file
	for (const file of contentFiles) {
		const { content: transformed, unresolved } = transformArticleLinks(file.content, jrnToUrl);

		if (unresolved.length > 0) {
			// Determine article title from file path for warning context
			const articlePath = file.path.replace(/^content\//, "").replace(/\.(md|mdx)$/, "");
			for (const ref of unresolved) {
				warnings.push({
					articleTitle: articlePath,
					linkText: ref.text,
					unresolvedJrn: ref.jrn,
				});
			}
		}

		if (transformed !== file.content) {
			contentFileMap.set(file.path, transformed);
		}
	}

	if (contentFileMap.size === 0) {
		return { transformedFiles: files, warnings };
	}

	// Build new files array with transformed content
	const transformedFiles = files.map(file => {
		const transformedContent = contentFileMap.get(file.path);
		if (transformedContent !== undefined) {
			return { ...file, content: transformedContent };
		}
		return file;
	});

	log.info(
		{ transformedCount: contentFileMap.size, warningCount: warnings.length },
		"Resolved article links in %d file(s) (%d unresolvable)",
		contentFileMap.size,
		warnings.length,
	);

	return { transformedFiles, warnings };
}

/**
 * Pre-build validation: detect article cross-references that point to
 * articles not included in the site.
 *
 * This runs before generation to provide early warnings in the build log.
 *
 * @param articles - Articles included in the site
 * @param siteArticleJrns - Set of JRNs for all articles in the site
 * @returns Warnings for unresolvable cross-references
 */
export function validateArticleLinks(
	articles: Array<Pick<Doc, "jrn" | "content" | "contentMetadata">>,
	siteArticleJrns: Set<string>,
): Array<ArticleLinkWarning> {
	const warnings: Array<ArticleLinkWarning> = [];

	for (const article of articles) {
		const articleTitle = article.contentMetadata?.title || "Untitled Article";
		const contentWithoutCodeBlocks = removeFencedCodeBlocks(article.content);

		// Extract JRN -> link text mapping in a single pass
		const jrnToLinkText = new Map<string, string>();
		for (const match of contentWithoutCodeBlocks.matchAll(ARTICLE_LINK_REGEX)) {
			if (!jrnToLinkText.has(match[2])) {
				jrnToLinkText.set(match[2], match[1]);
			}
		}

		for (const [jrn, linkText] of jrnToLinkText) {
			if (!siteArticleJrns.has(jrn)) {
				warnings.push({ articleTitle, linkText, unresolvedJrn: jrn });
			}
		}
	}

	return warnings;
}
