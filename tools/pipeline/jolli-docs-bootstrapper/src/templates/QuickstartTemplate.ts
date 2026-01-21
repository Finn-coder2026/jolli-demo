/**
 * Template for quickstart documentation.
 */

import type { EndpointInfo } from "../types.js";

/**
 * Generate MDX content for a quickstart guide.
 * @param source - Source identifier
 * @param endpoints - List of endpoints
 * @returns MDX content with frontmatter
 */
export function generateQuickstartMdx(source: string, endpoints: Array<EndpointInfo>): string {
	// Note: Page-level covers are intentionally empty.
	// Section-level covers will be inferred by the compiler based on content.
	// This prevents all sections from being impacted when any single endpoint changes.
	const frontmatterYaml = `---
title: Quickstart Guide
tags: [quickstart, getting-started]
description: Get started with the ${source} API
---

`;

	const content = `# Quickstart Guide

Welcome to the ${source} API documentation! This guide will help you get started quickly.

## Prerequisites

- API access credentials
- Basic understanding of REST APIs
- A tool for making HTTP requests (curl, Postman, etc.)

## Authentication

_To be documented: Add authentication details here_

## Available Endpoints

${endpoints
	.map(
		e => `### ${e.title}

\`${e.method.toUpperCase()} /${e.resource}\`

${e.title} - See [API Reference](./api/${e.resource}/${e.method}.mdx) for details.
`,
	)
	.join("\n")}

## Common Use Cases

_To be documented: Add common use case examples here_

## Next Steps

- Explore the [API Reference](./api/) for detailed endpoint documentation
- Review error handling best practices
- Learn about rate limiting and quotas

## Support

_To be documented: Add support contact information here_
`;

	return frontmatterYaml + content;
}

/**
 * Generate MDX content for an overview page.
 * @param source - Source identifier
 * @param endpoints - List of endpoints
 * @returns MDX content with frontmatter
 */
export function generateOverviewMdx(source: string, endpoints: Array<EndpointInfo>): string {
	// Note: Page-level covers are intentionally empty.
	// Section-level covers will be inferred by the compiler based on content.
	// This prevents all sections from being impacted when any single endpoint changes.
	const frontmatterYaml = `---
title: API Overview
tags: [overview, api]
description: Overview of the ${source} API
---

`;

	const content = `# ${source} API Overview

This documentation covers the ${source} API with ${endpoints.length} endpoints.

## API Architecture

_To be documented: Add API architecture description here_

## Endpoints Summary

${endpoints
	.map(
		e => `- **${e.title}**: \`${e.method.toUpperCase()} /${e.resource}\`
`,
	)
	.join("")}

## Getting Started

New to the API? Check out the [Quickstart Guide](./quickstart.mdx) to begin.

## API Reference

Browse the complete [API Reference](./api/) for detailed endpoint documentation.
`;

	return frontmatterYaml + content;
}
