/**
 * MDX parsing utilities for extracting frontmatter and splitting content by headings.
 */

import matter from "gray-matter";

/**
 * Parsed MDX file with frontmatter and content.
 */
export interface ParsedMdx {
	/** Frontmatter data */
	frontmatter: Record<string, unknown>;
	/** Content without frontmatter */
	content: string;
	/** Original file content */
	raw: string;
}

/**
 * A section of content split by heading.
 */
export interface MdxSection {
	/** Heading text (without # markers) */
	heading: string;
	/** Heading level (2 for ##, 3 for ###, etc.) */
	level: number;
	/** Section content (everything after heading until next heading) */
	content: string;
	/** Line number where heading starts (1-indexed) */
	line: number;
}

/**
 * Parse MDX file to extract frontmatter and content.
 * @param mdxContent - Raw MDX file content
 * @returns Parsed MDX with frontmatter and content
 */
export function parseMdx(mdxContent: string): ParsedMdx {
	const { data, content } = matter(mdxContent);

	return {
		frontmatter: data,
		content,
		raw: mdxContent,
	};
}

/**
 * Split MDX content by headings (## and deeper).
 *
 * - Top-level (#) headings are treated as page title and not split
 * - Splits on ## (level 2) and deeper headings
 * - Returns array of sections with heading and content
 *
 * @param content - MDX content (without frontmatter)
 * @returns Array of sections
 */
export function splitByHeadings(content: string): Array<MdxSection> {
	const lines = content.split("\n");
	const sections: Array<MdxSection> = [];
	let currentSection: MdxSection | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);

		if (headingMatch) {
			// Save previous section if exists
			if (currentSection) {
				sections.push(currentSection);
			}

			// Start new section
			const level = headingMatch[1].length;
			const heading = headingMatch[2].trim();

			currentSection = {
				heading,
				level,
				content: "",
				line: i + 1, // 1-indexed
			};
		} else if (currentSection) {
			// Add line to current section
			currentSection.content += (currentSection.content ? "\n" : "") + line;
		}
		// Ignore lines before first heading
	}

	// Save last section
	if (currentSection) {
		sections.push(currentSection);
	}

	// Trim content for each section
	return sections.map(section => ({
		...section,
		content: section.content.trim(),
	}));
}

/**
 * Parse MDX and split into sections.
 * Convenience function combining parseMdx() and splitByHeadings().
 *
 * @param mdxContent - Raw MDX file content
 * @returns Parsed MDX and array of sections
 */
export function parseMdxWithSections(mdxContent: string): ParsedMdx & { sections: Array<MdxSection> } {
	const parsed = parseMdx(mdxContent);
	const sections = splitByHeadings(parsed.content);

	return {
		...parsed,
		sections,
	};
}
