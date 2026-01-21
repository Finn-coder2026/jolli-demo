/**
 * Loads and parses MDX documentation files.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { SectionContent } from "../types.js";

/**
 * Parse section ID into doc path and heading slug.
 * Format: "api/auth/handler::overview" -> { docPath: "api/auth/handler", headingSlug: "overview" }
 * @param sectionId - Section ID
 * @returns Parsed components
 */
export function parseSectionId(sectionId: string): {
	docPath: string;
	headingSlug: string;
} {
	const parts = sectionId.split("::");
	if (parts.length !== 2) {
		throw new Error(`Invalid section ID format: ${sectionId}`);
	}

	return {
		docPath: parts[0],
		headingSlug: parts[1],
	};
}

/**
 * Generate heading slug from text (must match compiler's algorithm).
 * @param text - Heading text
 * @returns Slug
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.trim();
}

/**
 * Split MDX content by headings and extract section content.
 * @param content - MDX content (without frontmatter)
 * @param targetHeadingSlug - Slug of heading to extract
 * @returns Section content or null if not found
 */
export function extractSection(content: string, targetHeadingSlug: string): {
	heading: string;
	headingLevel: number;
	content: string;
} | null {
	const lines = content.split("\n");
	let currentSection: { heading: string; headingLevel: number; content: Array<string> } | null =
		null;
	const sections: Array<{ slug: string; heading: string; level: number; content: string }> = [];

	for (const line of lines) {
		// Check if line is a heading
		const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);

		if (headingMatch) {
			// Save previous section
			if (currentSection) {
				sections.push({
					slug: slugify(currentSection.heading),
					heading: currentSection.heading,
					level: currentSection.headingLevel,
					content: currentSection.content.join("\n").trim(),
				});
			}

			// Start new section
			const level = headingMatch[1].length;
			const heading = headingMatch[2].trim();
			currentSection = {
				heading,
				headingLevel: level,
				content: [],
			};
		} else if (currentSection) {
			// Add line to current section
			currentSection.content.push(line);
		}
	}

	// Save last section
	if (currentSection) {
		sections.push({
			slug: slugify(currentSection.heading),
			heading: currentSection.heading,
			level: currentSection.headingLevel,
			content: currentSection.content.join("\n").trim(),
		});
	}

	// Find target section
	const section = sections.find(s => s.slug === targetHeadingSlug);
	if (!section) {
		return null;
	}

	return {
		heading: section.heading,
		headingLevel: section.level,
		content: section.content,
	};
}

/**
 * Load section content from MDX file.
 * @param sectionId - Section ID (e.g., "api/auth/handler::overview")
 * @param docsDir - Path to documentation directory
 * @returns Section content
 * @throws Error if file or section not found
 */
export function loadSectionContent(sectionId: string, docsDir: string): SectionContent {
	const { docPath, headingSlug } = parseSectionId(sectionId);
	const filePath = join(docsDir, `${docPath}.mdx`);

	if (!existsSync(filePath)) {
		throw new Error(`Documentation file not found: ${filePath}`);
	}

	// Parse MDX file
	const fileContent = readFileSync(filePath, "utf-8");
	const { data: frontmatter, content } = matter(fileContent);

	// Extract section
	const section = extractSection(content, headingSlug);
	if (!section) {
		throw new Error(`Section not found: ${sectionId} in ${filePath}`);
	}

	return {
		section_id: sectionId,
		doc_path: docPath,
		heading: section.heading,
		heading_level: section.headingLevel,
		content: section.content,
		frontmatter,
	};
}

/**
 * Load route file content from external repository.
 * @param contractRef - Contract reference (e.g., "openapi:SrcRoutesAuthService_handler")
 * @param repoPath - Path to external repository
 * @returns Route file content
 * @throws Error if file not found
 */
export function loadRouteFileContent(contractRef: string, repoPath: string): string {
	// Extract operation ID from contract ref
	const operationId = contractRef.replace(/^openapi:/, "");

	// Try to find the route file
	// This is a simplified version - in production, you'd want to map operationId back to file path
	// For now, we'll search common patterns
	const possiblePaths = [
		join(repoPath, "src", "routes", `${operationId.toLowerCase()}.ts`),
		join(repoPath, "src", "routes", `${operationId.toLowerCase()}.js`),
		// Add more patterns as needed
	];

	// For demo purposes, we'll use a simple heuristic based on the operation ID
	// SrcRoutesAuthService_handler -> src/routes/auth.ts
	const simplifiedPath = operationId
		.replace(/^SrcRoutes/, "")
		.replace(/Service_.*$/, "")
		.toLowerCase();

	possiblePaths.unshift(
		join(repoPath, "src", "routes", `${simplifiedPath}.ts`),
		join(repoPath, "src", "routes", `${simplifiedPath}.js`),
	);

	for (const path of possiblePaths) {
		if (existsSync(path)) {
			return readFileSync(path, "utf-8");
		}
	}

	throw new Error(
		`Route file not found for contract: ${contractRef}\nSearched paths: ${possiblePaths.join(", ")}`,
	);
}
