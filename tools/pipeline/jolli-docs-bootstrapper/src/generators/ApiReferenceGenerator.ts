/**
 * Generates API reference MDX files.
 */

import type { EndpointInfo, MdxDocument } from "../types.js";
import { generateApiReferenceMdx } from "../templates/ApiTemplate.js";

/**
 * Generate API reference documents for all endpoints.
 * @param endpoints - List of endpoints
 * @returns Array of MDX documents to create
 */
export function generateApiReferenceDocs(endpoints: Array<EndpointInfo>): Array<MdxDocument> {
	const docs: Array<MdxDocument> = [];

	for (const endpoint of endpoints) {
		const content = generateApiReferenceMdx(endpoint);
		const filePath = `api/${endpoint.resource}/${endpoint.method}.mdx`;

		docs.push({
			filePath,
			content,
		});
	}

	return docs;
}
