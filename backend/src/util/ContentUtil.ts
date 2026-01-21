import { parse as parseYaml } from "yaml";

/**
 * Frontmatter structure for jolliscript articles
 */
interface JolliScriptFrontMatter {
	version?: number;
	article_type?: string;
	on?: unknown;
	job?: unknown;
}

/**
 * Extracts frontmatter from markdown content
 * Returns the frontmatter object and the content without frontmatter
 */
export function extractFrontmatter(content: string): {
	frontmatter: unknown | null;
	contentWithoutFrontmatter: string;
} {
	// Match frontmatter: starts with ---, optional content, ends with ---
	// The ([\s\S]*?) captures everything between the delimiters (can be empty)
	const match = content.match(/^---\r?\n([\s\S]*?)---\r?\n?/);
	if (!match) {
		return { frontmatter: null, contentWithoutFrontmatter: content };
	}

	try {
		const yamlContent = match[1].trim();
		// Parse YAML - empty string parses as null
		const frontmatter = yamlContent ? parseYaml(yamlContent) : null;
		const contentWithoutFrontmatter = content.slice(match[0].length);
		return { frontmatter, contentWithoutFrontmatter };
	} catch {
		// If YAML parsing fails, return original content unchanged
		return { frontmatter: null, contentWithoutFrontmatter: content };
	}
}

/**
 * Checks if the frontmatter indicates a jolliscript article
 * Case-insensitive: matches "jolliscript", "JolliScript", "JOLLISCRIPT", etc.
 */
function isJolliScriptFrontmatter(frontmatter: unknown): frontmatter is JolliScriptFrontMatter {
	if (!frontmatter || typeof frontmatter !== "object") {
		return false;
	}
	const fm = frontmatter as JolliScriptFrontMatter;
	return fm.article_type?.toLowerCase() === "jolliscript";
}

/**
 * Strips jolliscript frontmatter from article content
 *
 * JRN Format History:
 * - v1 (path-based): /root/integrations/{org}/{repo}/{branch}
 * - v2 (structured): jrn:/global:sources:github/{org}/{repo}/{branch}
 *
 * The example below uses v1 format. Use DEMO_MIGRATE_JRNS job to migrate to v2.
 *
 * Jolliscript frontmatter looks like:
 * ```
 * ---
 * article_type: jolliscript
 * on:
 *   - jrn: /root/integrations/*
 *     verb: GIT_PUSH
 * job:
 *   steps:
 *     - name: "Update Article"
 *       run_prompt: |
 *         check out the repo...
 * ---
 * ```
 *
 * This function removes the entire frontmatter block when article_type is "jolliscript"
 *
 * @param content - The markdown content that may contain jolliscript frontmatter
 * @returns The content with jolliscript frontmatter removed
 */
export function stripJolliScriptFrontmatter(content: string | undefined): string {
	if (!content) {
		return content ?? "";
	}
	const { frontmatter, contentWithoutFrontmatter } = extractFrontmatter(content);

	if (isJolliScriptFrontmatter(frontmatter)) {
		// Remove the jolliscript frontmatter, return content without it
		return contentWithoutFrontmatter.trim();
	}

	// Not a jolliscript article, return original content unchanged
	return content;
}
