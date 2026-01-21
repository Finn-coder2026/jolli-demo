import type { OpenApiSpec, RouterType, TemplateFile } from "../types.js";
import { readFile } from "./file.js";

/**
 * Generate OpenAPI interactive page for the specified router type
 */
export function generateOpenApiPage(
	router: RouterType,
	pagePath: string,
	title = "Interactive API Documentation",
): TemplateFile {
	const componentPath =
		router === "app" ? getRelativeComponentPath(pagePath, "content") : getRelativeComponentPath(pagePath, "pages");

	const content =
		router === "app"
			? `import ApiReference from '${componentPath}/components/ApiReference'

# ${title}

Explore and test our API endpoints directly in your browser.

<ApiReference />
`
			: `import ApiReference from '${componentPath}/components/ApiReference'

# ${title}

Explore and test our API endpoints directly in your browser.

<ApiReference />
`;

	const basePath = router === "app" ? "content" : "pages";

	return {
		path: `${basePath}/${pagePath}.mdx`,
		content,
	};
}

/**
 * Generate _meta file for OpenAPI section
 */
export function generateOpenApiMeta(
	router: RouterType,
	dirPath: string,
	entries: Record<string, string>,
): TemplateFile {
	const basePath = router === "app" ? "content" : "pages";

	if (router === "app") {
		const metaEntries = Object.entries(entries)
			.map(([key, value]) => `  '${key}': '${value}'`)
			.join(",\n");

		return {
			path: `${basePath}/${dirPath}/_meta.ts`,
			content: `export default {
${metaEntries}
}
`,
		};
	} else {
		return {
			path: `${basePath}/${dirPath}/_meta.json`,
			content: JSON.stringify(entries, null, 2),
		};
	}
}

/**
 * Load and validate OpenAPI spec
 */
export async function loadOpenApiSpec(specPath: string): Promise<OpenApiSpec> {
	const content = await readFile(specPath);

	if (specPath.endsWith(".json")) {
		return JSON.parse(content);
	} else if (specPath.endsWith(".yaml") || specPath.endsWith(".yml")) {
		// For YAML, we'd need a YAML parser - for now, just support JSON
		throw new Error("YAML OpenAPI specs are not yet supported. Please use JSON format.");
	}

	throw new Error(`Unsupported OpenAPI spec format: ${specPath}`);
}

/**
 * Extract API info from OpenAPI spec
 */
export function extractApiInfo(spec: OpenApiSpec): {
	title: string;
	version: string;
	description?: string;
	endpoints: Array<{ method: string; path: string; summary?: string }>;
} {
	const info = spec.info || {};
	const endpoints: Array<{ method: string; path: string; summary?: string }> = [];

	if (spec.paths) {
		for (const [pathKey, pathValue] of Object.entries(spec.paths)) {
			const pathObj = pathValue;
			for (const method of ["get", "post", "put", "patch", "delete"]) {
				if (pathObj[method]) {
					const endpoint: { method: string; path: string; summary?: string } = {
						method: method.toUpperCase(),
						path: pathKey,
					};
					if (pathObj[method].summary !== undefined) {
						endpoint.summary = pathObj[method].summary;
					}
					endpoints.push(endpoint);
				}
			}
		}
	}

	const result: {
		title: string;
		version: string;
		description?: string;
		endpoints: Array<{ method: string; path: string; summary?: string }>;
	} = {
		title: info.title || "API Reference",
		version: info.version || "1.0.0",
		endpoints,
	};
	if (info.description !== undefined) {
		result.description = info.description;
	}
	return result;
}

/**
 * Generate API overview page from OpenAPI spec
 */
export function generateApiOverviewPage(
	router: RouterType,
	spec: OpenApiSpec,
	pagePath = "api-reference",
): TemplateFile {
	const info = extractApiInfo(spec);
	const basePath = router === "app" ? "content" : "pages";

	const endpointTable = info.endpoints.map(e => `| ${e.method} | \`${e.path}\` | ${e.summary || "-"} |`).join("\n");

	return {
		path: `${basePath}/${pagePath}/index.mdx`,
		content: `# ${info.title}

${info.description || "API documentation."}

**Version:** ${info.version}

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
${endpointTable}

## Interactive Documentation

Try out our API endpoints interactively on the [Interactive API](/${pagePath}/interactive) page.
`,
	};
}

/**
 * Calculate relative path to components from a content page
 */
function getRelativeComponentPath(pagePath: string, _basePath: string): string {
	const depth = pagePath.split("/").length;
	return "../".repeat(depth);
}
