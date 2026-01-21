import type { EndpointInfo, OpenAPISpec, ScanResult } from "../../types/Openapi";
import { enhanceDocumentation } from "./AiEnhancer";
import { OpenAPIV3 } from "openapi-types";

export class MarkdownGenerator {
	constructor(private aiEnabled = false) {}

	private escapeMDX(text: string): string {
		// Escape MDX expression braces to avoid micromark mdx-expression parsing
		return text.replaceAll("{", "&#123;").replaceAll("}", "&#125;");
	}

	private yamlSingleQuote(text: string): string {
		// YAML single-quoted scalars: escape single quote by doubling it
		return text.replaceAll("'", "''");
	}

	/**
	 * Generate intro.md - Overview of all APIs
	 */
	async generateIntro(specs: Array<ScanResult>): Promise<string> {
		const content = `---
id: intro
title: API Documentation
sidebar_label: Introduction
slug: /
---

# Welcome to the API Documentation

This documentation covers all available APIs in this project.

## Available APIs


${specs
	.map(spec => {
		const safe = this.escapeMDX(spec.title);
		const desc = this.escapeMDX(spec.description || "No description provided.");
		return `### ${safe}

**Version:** ${spec.version}
**Endpoints:** ${spec.endpointCount}

${desc}
`;
	})
	.join("\n\n")}

## Getting Started

1. Choose an API from the sidebar
2. Review the authentication requirements
3. Explore the available endpoints
4. Try the API using the code examples

## Need Help?

If you have questions or need support, please contact the API team.
`;

		if (this.aiEnabled) {
			const result = await enhanceDocumentation(content, { spec: specs[0]?.spec });
			return result.enhancedContent;
		}

		return content;
	}

	/**
	 * Generate API overview page
	 */
	async generateAPIOverview(spec: ScanResult): Promise<string> {
		const openApiSpec = spec.spec;

		const servers =
			"servers" in openApiSpec && openApiSpec.servers
				? openApiSpec.servers.map((s: { url: string }) => s.url).join(", ")
				: "Not specified";

		const safeTitle = this.escapeMDX(`${spec.title} Overview`);
		const safeH1 = this.escapeMDX(spec.title);
		const content = `---
id: overview
title: '${this.yamlSingleQuote(safeTitle)}'
sidebar_label: 'Overview'
---

# ${safeH1}

${spec.description || "No description provided."}

## API Information

- **Version:** ${openApiSpec.info?.version || "N/A"}
- **Base URL:** ${servers}
- **Total Endpoints:** ${spec.endpointCount}

## Quick Start

This API provides the following functionality:

${this.extractTags(openApiSpec)
	.map(tag => {
		const t = this.escapeMDX(tag);
		const d = this.escapeMDX(this.getTagDescription(openApiSpec, tag));
		return `- **${t}**: ${d}`;
	})
	.join("\n")}

## Authentication

${this.generateAuthenticationSection(openApiSpec)}

## Rate Limiting

Please refer to the API terms of service for rate limiting information.
`;

		if (this.aiEnabled) {
			const result = await enhanceDocumentation(content, { spec: openApiSpec });
			return result.enhancedContent;
		}

		return content;
	}

	/**
	 * Generate endpoint documentation
	 */
	async generateEndpoint(endpoint: EndpointInfo, spec: OpenAPISpec): Promise<string> {
		const { path, method, summary, description, parameters, responses } = endpoint;

		const pageTitle = this.escapeMDX(summary || `${method.toUpperCase()} ${path}`);
		const sidebarLabel = this.escapeMDX(`${method.toUpperCase()} ${path}`);
		const safeDescription = this.escapeMDX(description || "No description provided.");

		const content = `---
id: ${this.slugify(`${method}-${path}`)}
title: '${this.yamlSingleQuote(pageTitle)}'
sidebar_label: '${this.yamlSingleQuote(sidebarLabel)}'
---

# ${pageTitle}

${safeDescription}

## Endpoint

\`\`\`
${method.toUpperCase()} ${path}
\`\`\`

${this.generateParametersSection(parameters)}

${this.generateResponsesSection(responses)}

## Code Examples

### JavaScript
\`\`\`javascript
const response = await fetch('${path}', {
  method: '${method.toUpperCase()}',
  headers: {
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);
\`\`\`

### Python
\`\`\`python
import requests

response = requests.${method.toLowerCase()}('${path}')
data = response.json()
print(data)
\`\`\`

### cURL
\`\`\`bash
curl -X ${method.toUpperCase()} '${path}' \\
  -H 'Content-Type: application/json'
\`\`\`
`;

		if (this.aiEnabled) {
			const result = await enhanceDocumentation(content, { endpoint, spec });
			return result.enhancedContent;
		}

		return content;
	}

	private generateParametersSection(
		parameters?: Array<OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject>,
	): string {
		if (!parameters || parameters.length === 0) {
			return "## Parameters\n\nNo parameters required.";
		}

		const parametersByLocation = this.groupParametersByLocation(parameters);

		let section = "## Parameters\n\n";

		for (const [location, params] of Object.entries(parametersByLocation)) {
			section += `### ${this.capitalize(location)} Parameters\n\n`;
			section += "| Name | Type | Required | Description |\n";
			section += "|------|------|----------|-------------|\n";

			for (const param of params) {
				if ("$ref" in param) {
					// Skip reference objects for now
					continue;
				}
				const name = this.escapeMDX(param.name || "unknown");
				const type =
					(param.schema && "$ref" in param.schema === false ? param.schema.type : undefined) || "string";
				const required = param.required ? "Yes" : "No";
				const desc = this.escapeMDX(param.description || "No description");
				section += `| ${name} | ${type} | ${required} | ${desc} |\n`;
			}

			section += "\n";
		}

		return section;
	}

	private generateResponsesSection(responses?: OpenAPIV3.ResponsesObject): string {
		if (!responses) {
			return "## Responses\n\nNo response documentation available.";
		}

		let section = "## Responses\n\n";

		for (const [statusCode, response] of Object.entries(responses)) {
			const responseObj = "$ref" in response ? undefined : response;
			const desc = this.escapeMDX(responseObj?.description || "No description");

			section += `### ${statusCode} ${this.getStatusText(statusCode)}\n\n`;
			section += `${desc}\n\n`;

			if (responseObj && "content" in responseObj) {
				const content = responseObj.content;
				if (content?.["application/json"]) {
					const mediaType = content["application/json"];
					const schema = mediaType.schema;
					if (schema && "$ref" in schema === false && schema.example) {
						section += "**Example Response:**\n\n";
						section += "```json\n";
						section += JSON.stringify(schema.example, null, 2);
						section += "\n```\n\n";
					}
				}
			}
		}

		return section;
	}

	private generateAuthenticationSection(spec: OpenAPISpec): string {
		if ("components" in spec && spec.components?.securitySchemes) {
			const schemes = spec.components.securitySchemes;
			let section = "This API uses the following authentication methods:\n\n";

			for (const [name, scheme] of Object.entries(schemes)) {
				if (typeof scheme === "object" && scheme !== null && "$ref" in scheme === false) {
					section += `- **${this.escapeMDX(name)}**: ${this.escapeMDX(scheme.type || "Unknown")}\n`;
				}
			}

			return section;
		}

		return "Authentication requirements not specified.";
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This function needs to iterate through multiple OpenAPI spec structures
	private extractTags(spec: OpenAPISpec): Array<string> {
		const tags: Set<string> = new Set();

		if ("tags" in spec && Array.isArray(spec.tags)) {
			for (const tag of spec.tags) {
				if (typeof tag === "object" && tag !== null && "name" in tag && typeof tag.name === "string") {
					tags.add(tag.name);
				}
			}
		}

		if (spec.paths) {
			for (const pathItem of Object.values(spec.paths)) {
				if (pathItem && typeof pathItem === "object") {
					const methods: Array<OpenAPIV3.HttpMethods> = [
						OpenAPIV3.HttpMethods.GET,
						OpenAPIV3.HttpMethods.POST,
						OpenAPIV3.HttpMethods.PUT,
						OpenAPIV3.HttpMethods.DELETE,
						OpenAPIV3.HttpMethods.PATCH,
						OpenAPIV3.HttpMethods.OPTIONS,
						OpenAPIV3.HttpMethods.HEAD,
					];
					for (const method of methods) {
						if (method in pathItem) {
							const operation = pathItem[method];
							if (operation?.tags) {
								for (const tag of operation.tags) {
									tags.add(tag);
								}
							}
						}
					}
				}
			}
		}

		return Array.from(tags);
	}

	private getTagDescription(spec: OpenAPISpec, tagName: string): string {
		if ("tags" in spec && Array.isArray(spec.tags)) {
			const tag = spec.tags.find(t => typeof t === "object" && t !== null && "name" in t && t.name === tagName);
			if (tag && typeof tag === "object" && "description" in tag && typeof tag.description === "string") {
				return tag.description || "No description";
			}
		}
		return "No description";
	}

	private groupParametersByLocation(
		parameters: Array<OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject>,
	): Record<string, Array<OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject>> {
		const grouped: Record<string, Array<OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject>> = {};

		for (const param of parameters) {
			const location = "$ref" in param ? "query" : param.in || "query";
			if (!grouped[location]) {
				grouped[location] = [];
			}
			grouped[location].push(param);
		}

		return grouped;
	}

	private getStatusText(statusCode: string): string {
		const statusTexts: Record<string, string> = {
			"200": "OK",
			"201": "Created",
			"204": "No Content",
			"400": "Bad Request",
			"401": "Unauthorized",
			"403": "Forbidden",
			"404": "Not Found",
			"500": "Internal Server Error",
		};

		return statusTexts[statusCode] || "";
	}

	private slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}

	private capitalize(text: string): string {
		return text.charAt(0).toUpperCase() + text.slice(1);
	}
}
