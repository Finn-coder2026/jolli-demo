/**
 * Shared utilities for loading markdown documentation files and parsing attention frontmatter.
 * Used by both search.ts and ImpactAgentRunner.ts.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { normalizeRepoPath } from "./AttentionIndex";
import { parseAttention, type DocAttention } from "./AttentionParser";

/** Recursively collects all markdown (.md) files under a given root directory. */
export async function collectMarkdownFiles(root: string): Promise<Array<string>> {
	const entries = await fs.readdir(root, { withFileTypes: true });
	const results: Array<string> = [];
	for (const entry of entries) {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			results.push(...(await collectMarkdownFiles(entryPath)));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(entryPath);
		}
	}
	return results;
}

/** Loads and parses attention frontmatter from all docs under the given root. */
export async function loadDocAttention(docRoot: string, cwd: string): Promise<Array<DocAttention>> {
	const docRootAbs = path.resolve(cwd, docRoot);
	let stats: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stats = await fs.stat(docRootAbs);
	} catch {
		throw new Error(`Docs directory not found: ${docRoot}`);
	}
	if (!stats.isDirectory()) {
		throw new Error(`Docs path is not a directory: ${docRoot}`);
	}

	const docFiles = await collectMarkdownFiles(docRootAbs);
	const docs: Array<DocAttention> = [];
	for (const absPath of docFiles) {
		const content = await fs.readFile(absPath, "utf8");
		const relativePath = normalizeRepoPath(path.relative(cwd, absPath));
		const parsed = parseAttention(content, relativePath);
		if (parsed) {
			docs.push(parsed);
		}
	}
	return docs;
}
