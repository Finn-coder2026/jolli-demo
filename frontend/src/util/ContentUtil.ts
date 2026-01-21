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
	frontmatter: Record<string, unknown> | null;
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
		// Parse YAML - simple key: value parsing for frontmatter
		// We use a simple parser since we only need to check article_type
		const frontmatter = yamlContent ? parseSimpleYaml(yamlContent) : null;
		const contentWithoutFrontmatter = content.slice(match[0].length);
		return { frontmatter, contentWithoutFrontmatter };
		/* v8 ignore start - defensive catch block for any unexpected parsing errors */
	} catch {
		/* v8 ignore next 2 -- defensive fallback if YAML parsing fails */
		return { frontmatter: null, contentWithoutFrontmatter: content };
	}
	/* v8 ignore stop */
}

/**
 * Simple YAML parser for frontmatter - only extracts top-level key: value pairs
 * This avoids adding a full YAML library dependency to the frontend bundle
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> | null {
	const result: Record<string, unknown> = {};
	const lines = yaml.split("\n");

	for (const line of lines) {
		// Only parse top-level key: value (no indentation)
		const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
		if (match) {
			const key = match[1];
			const value = match[2].trim();
			// Remove quotes if present
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				result[key] = value.slice(1, -1);
			} else {
				result[key] = value;
			}
		}
	}

	return Object.keys(result).length > 0 ? result : null;
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
