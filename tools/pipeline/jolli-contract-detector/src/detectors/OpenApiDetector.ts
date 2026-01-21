/**
 * OpenAPI contract detector.
 * Detects changes to API route files and maps them to operationIds.
 */

import { getChangedFiles } from "../GitDiff.js";
import { getOperationId, loadOperationIdMapping } from "../mappers/OperationIdMapper.js";
import type { ContractChangeOutput, DetectorOptions } from "../types.js";
import { buildOutput } from "./shared.js";

/**
 * Check if a file is a route file that should be tracked.
 * Matches files in routes or api directories with .ts or .js extensions.
 * @param filePath - Path to check
 * @returns True if the file is a route file
 */
export function isRouteFile(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, "/");
	return (
		(normalized.includes("/routes/") || normalized.includes("/api/")) && /\.(ts|js)$/.test(normalized)
	);
}

/**
 * Detect OpenAPI contract changes.
 * @param options - Detection options (must include repo path)
 * @returns Promise resolving to the complete contract change output
 */
export async function detectOpenApiContracts(options: DetectorOptions): Promise<ContractChangeOutput> {
	const { base, repo } = options;

	if (!repo) {
		throw new Error("OpenAPI detector requires --repo option to specify external repository path");
	}

	// Get all changed files in the external repo
	const changedFiles = await getChangedFiles(base, repo);

	// Filter to only route files
	const routeFiles = changedFiles.filter(isRouteFile);

	// Load operationId mapping once
	const mapping = loadOperationIdMapping(repo);

	// For OpenAPI, all route file changes are considered "changed"
	// (We don't distinguish between added/removed at the operationId level,
	// since the file change itself indicates a contract change)
	const allChanged = new Set<string>();

	for (const routeFile of routeFiles) {
		const operationId = getOperationId(routeFile, repo, mapping);
		allChanged.add(operationId);
	}

	// Build the output
	// For OpenAPI, we treat all detected changes as "changed" contracts
	// (more sophisticated added/removed detection could be added later by parsing OpenAPI specs)
	return buildOutput("openapi", "openapi", new Set(), new Set(), allChanged);
}
