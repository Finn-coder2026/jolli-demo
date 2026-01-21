/**
 * Template for API reference documentation.
 */

import type { EndpointInfo, MdxFrontmatter } from "../types.js";

/**
 * Generate MDX content for an API endpoint.
 * @param endpoint - Endpoint information
 * @returns MDX content with frontmatter
 */
export function generateApiReferenceMdx(endpoint: EndpointInfo): string {
	const frontmatter: MdxFrontmatter = {
		title: endpoint.title,
		covers: [`openapi:${endpoint.operationId}`],
		tags: ["api", endpoint.method, endpoint.resource],
		description: `API reference for ${endpoint.title}`,
	};

	const frontmatterYaml = `---
title: ${frontmatter.title}
covers:
  - ${frontmatter.covers[0]}
tags: [${frontmatter.tags.join(", ")}]
description: ${frontmatter.description}
---

`;

	const content = `# ${endpoint.title}

## Overview

This endpoint provides ${endpoint.method.toUpperCase()} access to ${endpoint.resource} resources.

**Operation ID**: \`${endpoint.operationId}\`

## Request

### HTTP Method

\`\`\`
${endpoint.method.toUpperCase()} /${endpoint.resource}
\`\`\`

### Parameters

_To be documented: Add request parameters here_

### Request Body

_To be documented: Add request body schema here_

## Response

### Success Response

_To be documented: Add success response schema here_

### Error Responses

_To be documented: Add error response schemas here_

## Examples

### Request Example

\`\`\`bash
curl -X ${endpoint.method.toUpperCase()} https://api.example.com/${endpoint.resource}
\`\`\`

### Response Example

\`\`\`json
{
  "status": "success"
}
\`\`\`

## Notes

_To be documented: Add additional notes and considerations here_
`;

	return frontmatterYaml + content;
}
