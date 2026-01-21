import type { AST, Section } from "./types";

/**
 * Render a single section to markdown
 */
function renderSection(section: Section, level = 1): string {
	const parts: Array<string> = [];

	// Add the heading (skip for preamble)
	if (section.title !== null) {
		const heading = `${"#".repeat(level)} ${section.title}`;
		parts.push(heading);
	}

	// Add the content
	if (section.content.trim()) {
		parts.push(section.content);
	}

	// Join with appropriate spacing
	return parts.filter(p => p.length > 0).join("\n\n");
}

/**
 * Render a single section to markdown, including joi blocks
 * This preserves joi script blocks that are typically filtered out
 */
export function renderSectionWithJoi(section: Section, level = 1): string {
	const parts: Array<string> = [];

	// Add the heading (skip for preamble)
	if (section.title !== null) {
		const heading = `${"#".repeat(level)} ${section.title}`;
		parts.push(heading);
	}

	// Add joi blocks if present (these are filtered from content but stored in fences)
	const joiFences = section.fences.filter(f => f.lang === "joi");
	if (joiFences.length > 0) {
		const joiBlocks = joiFences.map(f => `\`\`\`${f.lang || ""}\n${f.value}\n\`\`\``).join("\n\n");
		parts.push(joiBlocks);
	}

	// Add the regular content (which has joi already filtered out)
	if (section.content.trim()) {
		parts.push(section.content);
	}

	// Join with appropriate spacing
	return parts.filter(p => p.length > 0).join("\n\n");
}

/**
 * Render an AST back to markdown
 * Uses the content field of sections, not rawContent
 */
export function renderToMarkdown(ast: AST): string {
	const markdownParts: Array<string> = [];

	for (const section of ast.sections) {
		const rendered = renderSection(section);
		if (rendered) {
			markdownParts.push(rendered);
		}
	}

	// Join sections with double newlines for proper spacing
	return markdownParts.join("\n\n");
}

/**
 * Render AST to markdown with custom options
 */
export function renderToMarkdownWithOptions(
	ast: AST,
	options: {
		includeEmptySections?: boolean;
		sectionSeparator?: string;
		startingHeadingLevel?: number;
	} = {},
): string {
	const { includeEmptySections = false, sectionSeparator = "\n\n", startingHeadingLevel = 1 } = options;

	const markdownParts: Array<string> = [];

	for (const section of ast.sections) {
		// Skip empty sections if requested
		if (!includeEmptySections && !section.content.trim() && section.title === null) {
			continue;
		}

		const rendered = renderSection(section, section.title === null ? 1 : startingHeadingLevel);

		if (rendered || includeEmptySections) {
			markdownParts.push(rendered);
		}
	}

	return markdownParts.join(sectionSeparator);
}

/**
 * Render only specific sections by title or index
 */
export function renderSections(
	ast: AST,
	selector: {
		titles?: Array<string>;
		indices?: Array<number>;
	},
): string {
	const markdownParts: Array<string> = [];
	const { titles = [], indices = [] } = selector;

	ast.sections.forEach((section, index) => {
		const shouldInclude = indices.includes(index) || (section.title !== null && titles.includes(section.title));

		if (shouldInclude) {
			const rendered = renderSection(section);
			if (rendered) {
				markdownParts.push(rendered);
			}
		}
	});

	return markdownParts.join("\n\n");
}
