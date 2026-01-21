/**
 * Builds content graph from parsed MDX documents.
 */

import { createHash } from "node:crypto";
import type {
	ContentGraph,
	ContractCoverage,
	CoverageType,
	GraphSection,
	ParsedMdxDocument,
} from "../types.js";
import { generateHeadingSlug, generateSectionId } from "../parsers/MdxParser.js";

/**
 * Build a content graph from parsed documents.
 * @param documents - Array of parsed MDX documents
 * @param version - Version identifier
 * @returns Content graph with all sections
 */
export function buildContentGraph(
	documents: Array<ParsedMdxDocument>,
	version: string,
): ContentGraph {
	const sections: Array<GraphSection> = [];

	for (const doc of documents) {
		const pageCovers = doc.frontmatter.covers || [];

		for (const section of doc.sections) {
			const headingSlug = generateHeadingSlug(section.heading);
			const sectionId = generateSectionId(doc.filePath, headingSlug);

			// Merge page-level and section-level covers
			const sectionCovers = section.frontmatter?.covers || [];
			const allCovers = [...new Set([...pageCovers, ...sectionCovers])];

			// Infer coverage types for each contract
			const coversWithType = inferCoverageTypes(
				allCovers,
				section.content,
				sectionCovers,
			);

			const contentHash = computeContentHash(section.content);
			const wordCount = countWords(section.content);

			sections.push({
				section_id: sectionId,
				doc_path: doc.filePath,
				heading: section.heading,
				heading_level: section.headingLevel,
				content_hash: contentHash,
				covers: allCovers,
				covers_with_type: coversWithType,
				word_count: wordCount,
			});
		}
	}

	return {
		version,
		generated_at: new Date().toISOString(),
		sections,
	};
}

/**
 * Infer coverage types for contracts based on section content.
 * @param covers - Array of contract references
 * @param content - Section content to analyze
 * @param sectionCovers - Contracts explicitly declared at section level
 * @returns Array of contract coverage with types
 */
export function inferCoverageTypes(
	covers: Array<string>,
	content: string,
	sectionCovers: Array<string>,
): Array<ContractCoverage> {
	return covers.map(contractRef => ({
		contract_ref: contractRef,
		coverage_type: inferSingleCoverageType(contractRef, content, sectionCovers),
	}));
}

/**
 * Infer coverage type for a single contract.
 * @param contractRef - Contract reference (e.g., "openapi:UsersService_get")
 * @param content - Section content
 * @param sectionCovers - Contracts explicitly declared at section level
 * @returns Coverage type
 */
export function inferSingleCoverageType(
	contractRef: string,
	content: string,
	sectionCovers: Array<string>,
): CoverageType {
	// If explicitly declared at section level, it's direct
	if (sectionCovers.includes(contractRef)) {
		return "direct";
	}

	// Extract endpoint info from contract ref
	const endpointInfo = parseContractRef(contractRef);
	if (!endpointInfo) {
		// Can't parse, assume inherited (listed)
		return "listed";
	}

	const contentLower = content.toLowerCase();

	// Check if endpoint path or method is discussed in content
	const pathMentioned = contentLower.includes(endpointInfo.path.toLowerCase());
	const methodPathMentioned = contentLower.includes(
		`${endpointInfo.method.toLowerCase()} ${endpointInfo.path.toLowerCase()}`,
	);
	const operationIdMentioned = contentLower.includes(
		endpointInfo.operationId.toLowerCase(),
	);

	// If method+path is mentioned (e.g., "GET /users"), it's discussed directly
	if (methodPathMentioned || operationIdMentioned) {
		return "direct";
	}

	// If just the path is mentioned (e.g., "/users" in a link), it's mentioned
	if (pathMentioned) {
		return "mentioned";
	}

	// Otherwise it's just listed (inherited from page level)
	return "listed";
}

/**
 * Parse a contract reference to extract endpoint information.
 * @param contractRef - Contract reference (e.g., "openapi:UsersService_get")
 * @returns Parsed endpoint info or null if unparseable
 */
export function parseContractRef(contractRef: string): {
	operationId: string;
	method: string;
	path: string;
} | null {
	// Format: "openapi:ServiceName_method" or "openapi:Resource_method"
	const match = contractRef.match(/^openapi:(.+)_(\w+)$/);
	if (!match) {
		return null;
	}

	const [, servicePart, method] = match;

	// Convert ServiceName to path (e.g., "UsersService" -> "/users")
	// Remove "Service" suffix if present
	const resourceName = servicePart.replace(/Service$/, "");
	// Convert PascalCase to kebab-case for path
	const path = `/${resourceName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;

	return {
		operationId: `${servicePart}_${method}`,
		method: method.toUpperCase(),
		path,
	};
}

/**
 * Compute SHA256 hash of content.
 * @param content - Content to hash
 * @returns Hash in format "sha256:abc123..."
 */
export function computeContentHash(content: string): string {
	const hash = createHash("sha256").update(content, "utf-8").digest("hex");
	return `sha256:${hash}`;
}

/**
 * Count words in content.
 * @param content - Content to count
 * @returns Number of words
 */
export function countWords(content: string): number {
	return content
		.trim()
		.split(/\s+/)
		.filter(word => word.length > 0).length;
}
