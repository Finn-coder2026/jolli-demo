/**
 * Loads content graphs from files.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentGraph } from "../types.js";

/**
 * Load content graph for a specific version.
 * @param artifactsDir - Path to artifacts directory
 * @param source - Source identifier
 * @param version - Version identifier
 * @returns Content graph
 */
export function loadContentGraph(
	artifactsDir: string,
	source: string,
	version: string,
): ContentGraph {
	const graphPath = join(artifactsDir, source, version, "graph.json");

	if (!existsSync(graphPath)) {
		throw new Error(`Content graph file not found: ${graphPath}`);
	}

	const content = readFileSync(graphPath, "utf-8");
	return JSON.parse(content) as ContentGraph;
}
