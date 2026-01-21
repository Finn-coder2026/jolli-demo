/**
 * Generates overview and quickstart MDX files.
 */

import type { EndpointInfo, MdxDocument } from "../types.js";
import { generateOverviewMdx, generateQuickstartMdx } from "../templates/QuickstartTemplate.js";

/**
 * Generate overview and quickstart documents.
 * @param source - Source identifier
 * @param endpoints - List of endpoints
 * @returns Array of MDX documents to create
 */
export function generateOverviewDocs(source: string, endpoints: Array<EndpointInfo>): Array<MdxDocument> {
	const docs: Array<MdxDocument> = [];

	// Generate overview
	docs.push({
		filePath: "overview.mdx",
		content: generateOverviewMdx(source, endpoints),
	});

	// Generate quickstart
	docs.push({
		filePath: "quickstart.mdx",
		content: generateQuickstartMdx(source, endpoints),
	});

	return docs;
}
