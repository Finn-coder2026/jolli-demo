/**
 * Main bootstrapper orchestrator.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { generateApiReferenceDocs } from "./generators/ApiReferenceGenerator.js";
import { generateOverviewDocs } from "./generators/QuickstartGenerator.js";
import { scanRepository } from "./scanners/RepoScanner.js";
import { createClient, enhanceDocumentation } from "./llm/EnhancementClient.js";
import type { BootstrapperOptions, BootstrapResult } from "./types.js";

/**
 * Check if a directory is empty or doesn't exist.
 * @param dirPath - Path to directory
 * @returns True if directory is empty or doesn't exist
 */
export function isDirectoryEmpty(dirPath: string): boolean {
	if (!existsSync(dirPath)) {
		return true;
	}

	const files = readdirSync(dirPath);
	return files.length === 0;
}

/**
 * Load route file content for an endpoint.
 * @param endpoint - Endpoint info
 * @param repo - Repository path
 * @returns Route file content or null if not found
 */
function loadRouteFileContent(endpoint: { filePath: string }, repo: string): string | null {
	const fullPath = join(repo, endpoint.filePath);
	if (!existsSync(fullPath)) {
		return null;
	}

	try {
		return readFileSync(fullPath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Bootstrap documentation for a source.
 * @param options - Bootstrapper options
 * @returns Bootstrap result
 */
export async function bootstrapDocumentation(options: BootstrapperOptions): Promise<BootstrapResult> {
	const { source, repo, docsDir, aiEnhance } = options;

	// Check if docs directory is empty
	if (!isDirectoryEmpty(docsDir)) {
		throw new Error(
			`Documentation directory is not empty: ${docsDir}. Bootstrapper only works with empty directories.`
		);
	}

	// Scan repository for endpoints
	const scanResult = scanRepository(repo, source);

	if (scanResult.endpoints.length === 0) {
		throw new Error(`No API endpoints found in repository: ${repo}`);
	}

	// Generate MDX documents
	const apiDocs = generateApiReferenceDocs(scanResult.endpoints);
	const overviewDocs = generateOverviewDocs(source, scanResult.endpoints);
	const allDocs = [...overviewDocs, ...apiDocs];

	// Enhance with LLM if requested
	let enhancedDocs = allDocs;
	if (aiEnhance) {
		const client = createClient();
		if (!client) {
			console.warn("Warning: AI enhancement requested but ANTHROPIC_API_KEY not found.");
			console.warn("Continuing without AI enhancement.");
		} else {
			console.log("Enhancing documentation with Claude AI...");
			enhancedDocs = [];

			for (let i = 0; i < allDocs.length; i++) {
				const doc = allDocs[i];
				console.log(`  [${i + 1}/${allDocs.length}] Enhancing: ${doc.filePath}`);

				// Find corresponding endpoint for API docs
				const endpoint = scanResult.endpoints.find(
					e => `api/${e.resource}/${e.method}.mdx` === doc.filePath
				);

				if (endpoint) {
					// Load route file
					const routeContent = loadRouteFileContent(endpoint, repo);
					if (routeContent) {
						try {
							// CRITICAL: Parse frontmatter to preserve contractRefs
							// The LLM should NEVER modify the `covers` field - it must be 100% accurate
							const { data: frontmatter, content: body } = matter(doc.content);

							// Send only body to LLM (no frontmatter)
							const enhancedBody = await enhanceDocumentation(
								client,
								body,
								routeContent,
								endpoint.operationId
							);

							// Re-attach original frontmatter (preserves contractRefs)
							const enhancedContent = matter.stringify(enhancedBody, frontmatter);

							enhancedDocs.push({
								filePath: doc.filePath,
								content: enhancedContent,
							});
						} catch (error) {
							console.warn(`  Warning: Enhancement failed for ${doc.filePath}: ${error}`);
							enhancedDocs.push(doc); // Use original
						}
					} else {
						enhancedDocs.push(doc); // Use original
					}
				} else {
					// Non-API docs (overview, quickstart) - use original
					enhancedDocs.push(doc);
				}
			}
		}
	}

	// Write documents to disk
	const createdFiles: Array<string> = [];

	for (const doc of enhancedDocs) {
		const fullPath = join(docsDir, doc.filePath);
		const dir = dirname(fullPath);

		// Create directory if it doesn't exist
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		// Write file
		writeFileSync(fullPath, doc.content, "utf-8");
		createdFiles.push(doc.filePath);
	}

	return {
		filesCreated: createdFiles.length,
		createdFiles,
		source,
	};
}
