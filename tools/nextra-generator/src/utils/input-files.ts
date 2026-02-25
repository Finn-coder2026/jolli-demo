import type { NavMeta } from "../templates/app-router/index.js";
import type { InputFile, InputFileType, OpenApiSpecInfo, PageConfig, RouterType } from "../types.js";
import { exists, readFile } from "./file.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import YAML from "yaml";

/**
 * Detect file type from extension
 */
export function getFileType(filePath: string): InputFileType | null {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case ".mdx":
			return "mdx";
		case ".md":
			return "md";
		case ".json":
			return "json";
		case ".yaml":
		case ".yml":
			return "yaml";
		default:
			return null;
	}
}

/**
 * Extract title from markdown/mdx content
 * Looks for first # heading
 */
export function extractTitleFromContent(content: string): string | null {
	const match = content.match(/^#\s+(.+)$/m);
	return match ? match[1].trim() : null;
}

/**
 * Extract title from filename
 * Converts kebab-case or snake_case to Title Case
 */
export function extractTitleFromFilename(filePath: string): string {
	const basename = path.basename(filePath, path.extname(filePath));
	return basename.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Generate target path from source path
 */
export function generateTargetPath(sourcePath: string): string {
	const basename = path.basename(sourcePath, path.extname(sourcePath));
	const dirname = path.dirname(sourcePath);

	// If file is index, use parent folder name
	if (basename.toLowerCase() === "index") {
		const parentFolder = path.basename(dirname);
		return parentFolder !== "." ? parentFolder : "index";
	}

	return basename;
}

/**
 * Process a single input file and convert to PageConfig
 */
export async function processInputFile(
	inputFile: InputFile,
	_router: RouterType,
): Promise<{ page: PageConfig; isJson: boolean; jsonData?: object; isOpenApi?: boolean }> {
	const fileType = getFileType(inputFile.sourcePath);

	if (!fileType) {
		throw new Error(`Unsupported file type: ${inputFile.sourcePath}`);
	}

	const fileExists = await exists(inputFile.sourcePath);
	if (!fileExists) {
		throw new Error(`File not found: ${inputFile.sourcePath}`);
	}

	const content = await readFile(inputFile.sourcePath);
	const targetPath = inputFile.targetPath || generateTargetPath(inputFile.sourcePath);

	if (fileType === "json" || fileType === "yaml") {
		// Parse JSON or YAML
		const parsedData = fileType === "json" ? JSON.parse(content) : YAML.parse(content);
		const title = inputFile.title || extractTitleFromFilename(inputFile.sourcePath);

		// Check if it's an OpenAPI spec - don't create MDX page, only track as JSON/YAML
		// JOLLI-192: OpenAPI specs get their own /api-docs/{slug} route, not an MDX page
		if (parsedData.openapi || parsedData.swagger) {
			return {
				page: {
					path: targetPath,
					title,
					content: "", // Empty - no MDX page for OpenAPI specs
				},
				isJson: true, // Treat YAML OpenAPI specs the same as JSON for processing
				jsonData: parsedData,
				isOpenApi: true, // Flag to skip MDX page creation
			};
		}

		// For regular JSON/YAML, display as formatted code block
		return {
			page: {
				path: targetPath,
				title,
				content: generateJsonPageContent(title, content),
			},
			isJson: true,
			jsonData: parsedData,
		};
	}

	// For MD/MDX files
	let title = inputFile.title;

	if (!title) {
		title = extractTitleFromContent(content) || extractTitleFromFilename(inputFile.sourcePath);
	}

	// Convert .md to .mdx format if needed (they're compatible)
	return {
		page: {
			path: targetPath,
			title,
			content,
		},
		isJson: false,
	};
}

/**
 * Process multiple input files
 */
export async function processInputFiles(
	inputFiles: Array<InputFile>,
	router: RouterType,
): Promise<{
	pages: Array<PageConfig>;
	jsonFiles: Array<{ targetPath: string; data: object; sourcePath: string }>;
	errors: Array<string>;
}> {
	const pages: Array<PageConfig> = [];
	const jsonFiles: Array<{ targetPath: string; data: object; sourcePath: string }> = [];
	const errors: Array<string> = [];

	for (const inputFile of inputFiles) {
		try {
			const result = await processInputFile(inputFile, router);

			// JOLLI-192: Skip adding MDX page for OpenAPI specs - they use /api-docs/{slug} route
			if (!result.isOpenApi) {
				pages.push(result.page);
			}

			if (result.isJson && result.jsonData) {
				jsonFiles.push({
					targetPath: result.page.path,
					data: result.jsonData,
					sourcePath: inputFile.sourcePath,
				});
			}
		} catch (err) {
			errors.push(`Failed to process ${inputFile.sourcePath}: ${err}`);
		}
	}

	return { pages, jsonFiles, errors };
}

/**
 * Generate MDX content for regular JSON file
 */
function generateJsonPageContent(title: string, jsonContent: string): string {
	return `# ${title}

\`\`\`json
${jsonContent}
\`\`\`
`;
}

/**
 * Build navigation meta from processed pages
 */
export function buildNavigationMeta(pages: Array<PageConfig>): Record<string, string> {
	const meta: Record<string, string> = {};

	for (const page of pages) {
		// Extract the first segment for top-level nav
		const segments = page.path.split("/");
		const key = segments[0];

		if (!meta[key]) {
			meta[key] = page.title;
		}
	}

	return meta;
}

/**
 * Build full navigation meta with hidden index and API Reference support.
 * Used by CLI generator (app-router.ts) to match the backend generator (memory.ts).
 *
 * @param pages - Array of page configs from input files
 * @param openApiSpecs - Optional array of OpenAPI spec info for API Reference links
 * @returns NavMeta with hidden index, article entries, and API Reference entry
 */
export function buildFullNavigationMeta(pages: Array<PageConfig>, openApiSpecs?: Array<OpenApiSpecInfo>): NavMeta {
	const meta: NavMeta = {};

	// Hidden index entry ensures Nextra doesn't auto-generate an "Index" nav item
	// The actual root redirect is handled by app/page.tsx (JOLLI-191)
	meta.index = { display: "hidden" };

	// Add article entries
	for (const page of pages) {
		const segments = page.path.split("/");
		const key = segments[0];
		if (!meta[key]) {
			meta[key] = page.title;
		}
	}

	// JOLLI-192: Add consolidated "API Reference" entry for OpenAPI specs
	if (openApiSpecs && openApiSpecs.length > 0) {
		if (openApiSpecs.length === 1) {
			const spec = openApiSpecs[0];
			meta["api-reference"] = {
				title: "API Reference",
				type: "page",
				href: `/api-docs/${spec.name}`,
			};
		} else {
			const items: Record<string, { title: string; href: string }> = {};
			for (const spec of openApiSpecs) {
				const apiTitle = spec.title || `${spec.name.charAt(0).toUpperCase()}${spec.name.slice(1)} API`;
				items[spec.name] = {
					title: apiTitle,
					href: `/api-docs/${spec.name}`,
				};
			}
			meta["api-reference"] = {
				title: "API Reference",
				type: "menu",
				items,
			};
		}
	}

	return meta;
}

/**
 * Scan a directory for input files
 */
export async function scanDirectory(
	dirPath: string,
	extensions: Array<InputFileType> = ["mdx", "md", "json", "yaml"],
): Promise<Array<InputFile>> {
	const inputFiles: Array<InputFile> = [];

	async function scan(currentPath: string, relativePath = ""): Promise<void> {
		const entries = await fs.readdir(currentPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name);
			const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

			if (entry.isDirectory()) {
				await scan(fullPath, relPath);
			} else if (entry.isFile()) {
				const fileType = getFileType(entry.name);
				if (fileType && extensions.includes(fileType)) {
					inputFiles.push({
						sourcePath: fullPath,
						targetPath: relPath.replace(/\.(mdx?|json|ya?ml)$/, ""),
					});
				}
			}
		}
	}

	await scan(dirPath);
	return inputFiles;
}
