/**
 * File system utilities for recursively finding files.
 */

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * Options for file walking.
 */
export interface WalkOptions {
	/** File extensions to include (e.g., [".mdx", ".md"]) */
	extensions?: Array<string>;
	/** Directory names to exclude (e.g., ["node_modules", ".git"]) */
	excludeDirs?: Array<string>;
	/** Return paths relative to baseDir */
	relativePaths?: boolean;
}

/**
 * Recursively find all files in a directory.
 *
 * @param baseDir - Directory to search
 * @param options - Walk options
 * @returns Array of file paths (absolute or relative based on options)
 */
export async function walkFiles(baseDir: string, options: WalkOptions = {}): Promise<Array<string>> {
	const {
		extensions = [],
		excludeDirs = ["node_modules", ".git", "dist", "build", ".next"],
		relativePaths = false,
	} = options;

	const files: Array<string> = [];

	async function walk(dir: string): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				// Skip excluded directories
				if (excludeDirs.includes(entry.name)) {
					continue;
				}
				await walk(fullPath);
			} else if (entry.isFile()) {
				// Check extension filter
				if (extensions.length === 0 || extensions.some(ext => entry.name.endsWith(ext))) {
					files.push(relativePaths ? relative(baseDir, fullPath) : fullPath);
				}
			}
		}
	}

	await walk(baseDir);
	return files.sort(); // Sort for deterministic ordering
}

/**
 * Find all MDX files in a directory.
 * Convenience function that filters for .mdx files.
 *
 * @param baseDir - Directory to search
 * @param options - Walk options
 * @returns Array of MDX file paths
 */
export async function findMdxFiles(baseDir: string, options: Omit<WalkOptions, "extensions"> = {}): Promise<Array<string>> {
	return walkFiles(baseDir, {
		...options,
		extensions: [".mdx"],
	});
}

/**
 * Check if a path exists and is a directory.
 *
 * @param dirPath - Path to check
 * @returns True if path exists and is a directory
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
	try {
		const stats = await stat(dirPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Check if a directory is empty (no files or subdirectories).
 *
 * @param dirPath - Directory path to check
 * @returns True if directory is empty or doesn't exist
 */
export async function isEmptyDirectory(dirPath: string): Promise<boolean> {
	try {
		const entries = await readdir(dirPath);
		return entries.length === 0;
	} catch {
		// Directory doesn't exist
		return true;
	}
}
