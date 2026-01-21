/**
 * Parses MDX documents and splits them into sections.
 */

import { readFileSync } from "node:fs";
import matter from "gray-matter";
import type {
	DocumentSection,
	MdxFrontmatter,
	ParsedMdxDocument,
} from "../types.js";

/**
 * Parse an MDX file and split it into sections by headings.
 * @param filePath - Absolute path to the MDX file
 * @param relativeFilePath - Path relative to docsDir
 * @returns Parsed document with sections
 */
export function parseMdxFile(
	filePath: string,
	relativeFilePath: string,
): ParsedMdxDocument {
	const fileContent = readFileSync(filePath, "utf-8");
	const { data, content } = matter(fileContent);

	const sections = splitByHeadings(content);

	return {
		filePath: relativeFilePath,
		frontmatter: data as MdxFrontmatter,
		content,
		sections,
	};
}

/**
 * Split MDX content into sections by headings.
 * @param content - MDX content (without frontmatter)
 * @returns Array of document sections
 */
export function splitByHeadings(content: string): Array<DocumentSection> {
	const sections: Array<DocumentSection> = [];
	const lines = content.split("\n");

	let currentSection: DocumentSection | null = null;
	let currentContent: Array<string> = [];

	for (const line of lines) {
		const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);

		if (headingMatch) {
			// Save previous section if exists
			if (currentSection) {
				currentSection.content = currentContent.join("\n").trim();
				sections.push(currentSection);
			}

			// Start new section
			const level = headingMatch[1].length;
			const heading = headingMatch[2].trim();

			currentSection = {
				heading,
				headingLevel: level,
				content: "",
			};
			currentContent = [];
		} else if (currentSection) {
			// Add line to current section
			currentContent.push(line);
		}
	}

	// Save last section
	if (currentSection) {
		currentSection.content = currentContent.join("\n").trim();
		sections.push(currentSection);
	}

	return sections;
}

/**
 * Generate a stable slug from heading text.
 * @param heading - Heading text
 * @returns URL-safe slug
 */
export function generateHeadingSlug(heading: string): string {
	return heading
		.toLowerCase()
		.replace(/[^\w\s-]/g, "") // Remove special characters
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		.replace(/-+/g, "-") // Replace multiple hyphens with single
		.replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Generate a unique section ID.
 * @param docPath - Document path relative to docsDir
 * @param headingSlug - Slugified heading
 * @returns Section ID in format "<doc_path>::<heading_slug>"
 */
export function generateSectionId(
	docPath: string,
	headingSlug: string,
): string {
	// Remove .mdx extension and normalize path separators
	const normalizedPath = docPath.replace(/\.mdx$/, "").replace(/\\/g, "/");
	return `${normalizedPath}::${headingSlug}`;
}
