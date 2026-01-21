/**
 * Main compiler orchestrator.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CompilationResult, CompilerOptions } from "./types.js";
import { parseMdxFile } from "./parsers/MdxParser.js";
import { buildContentGraph } from "./graph/GraphBuilder.js";
import { buildReverseIndex } from "./index/ReverseIndexer.js";

/**
 * Compile MDX documentation into versioned content graph.
 * @param options - Compiler options
 * @returns Compilation result
 */
export function compileDocumentation(
	options: CompilerOptions,
): CompilationResult {
	const { source, docsDir, version, outputDir } = options;

	// Validate docs directory exists
	if (!existsSync(docsDir)) {
		throw new Error(`Documentation directory does not exist: ${docsDir}`);
	}

	// Find all MDX files
	const mdxFiles = findMdxFiles(docsDir);

	if (mdxFiles.length === 0) {
		throw new Error(`No MDX files found in directory: ${docsDir}`);
	}

	// Parse all MDX files
	const parsedDocs = mdxFiles.map(file => {
		const absolutePath = join(docsDir, file);
		return parseMdxFile(absolutePath, file);
	});

	// Build content graph
	const graph = buildContentGraph(parsedDocs, version);

	// Build reverse index
	const reverseIndex = buildReverseIndex(graph);

	// Create output directory
	const versionDir = join(outputDir, source, version);
	mkdirSync(versionDir, { recursive: true });

	// Write graph.json
	const graphPath = join(versionDir, "graph.json");
	writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");

	// Write reverse_index.json
	const indexPath = join(versionDir, "reverse_index.json");
	writeFileSync(indexPath, JSON.stringify(reverseIndex, null, 2), "utf-8");

	// Write sections.jsonl (one section per line)
	const sectionsPath = join(versionDir, "sections.jsonl");
	const sectionsLines = graph.sections.map(section =>
		JSON.stringify({
			section_id: section.section_id,
			content_hash: section.content_hash,
		}),
	);
	writeFileSync(sectionsPath, sectionsLines.join("\n"), "utf-8");

	return {
		version,
		source,
		documentsProcessed: parsedDocs.length,
		sectionsCreated: graph.sections.length,
		outputFiles: {
			graph: graphPath,
			reverseIndex: indexPath,
			sections: sectionsPath,
		},
	};
}

/**
 * Recursively find all MDX files in a directory.
 * @param dir - Directory to search
 * @param baseDir - Base directory for relative paths
 * @returns Array of relative file paths
 */
export function findMdxFiles(dir: string, baseDir: string = dir): Array<string> {
	const files: Array<string> = [];
	const entries = readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			files.push(...findMdxFiles(fullPath, baseDir));
		} else if (entry.isFile() && entry.name.endsWith(".mdx")) {
			const relativePath = fullPath
				.substring(baseDir.length + 1)
				.replace(/\\/g, "/");
			files.push(relativePath);
		}
	}

	return files.sort();
}
