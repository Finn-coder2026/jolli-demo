/**
 * Streaming file discovery for code scanning.
 *
 * Uses async generators to process files one at a time, avoiding
 * memory issues with large repositories.
 */

import * as fs from "node:fs/promises";
import { glob } from "glob";

export interface FileDiscoveryOptions {
	/** Skip files larger than this (default: 500KB). Set to 0 to disable. */
	maxFileSizeBytes?: number;
	/** Additional glob patterns to search */
	patterns?: Array<string>;
	/** Additional directories to exclude */
	excludeDirs?: Array<string>;
	/** Callback when a file is skipped due to size */
	onFileSkipped?: (filePath: string, size: number) => void;
}

/** Default patterns for finding code files */
export const DEFAULT_PATTERNS = [
	"**/routes/**/*.{ts,js,mjs}",
	"**/controllers/**/*.{ts,js,mjs}",
	"**/api/**/*.{ts,js,mjs}",
	"**/models/**/*.{ts,js,mjs}",
	"**/plugins/**/*.{ts,js,mjs}",
	"**/schemas/**/*.{ts,js,mjs}",
	"**/*router*.{ts,js,mjs}",
	"**/*route*.{ts,js,mjs}",
	"**/*controller*.{ts,js,mjs}",
	"**/*api*.{ts,js,mjs}",
	"**/*schema*.{ts,js,mjs}",
	"**/*model*.{ts,js,mjs}",
	"**/server.{ts,js,mjs}",
	"**/app.{ts,js,mjs}",
	"**/index.{ts,js,mjs}",
	"**/main.{ts,js,mjs}",
	"*.{ts,js,mjs}",
];

/** Default directories to exclude */
export const DEFAULT_EXCLUDES = [
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
	"**/out/**",
	"**/.next/**",
	"**/coverage/**",
	"**/test/**",
	"**/tests/**",
	"**/__tests__/**",
	"**/*.test.{ts,js,mjs}",
	"**/*.spec.{ts,js,mjs}",
	"**/*.d.ts",
];

/** Default max file size: 500KB */
export const DEFAULT_MAX_FILE_SIZE = 500 * 1024;

/**
 * Streams file paths from a repository using async generator.
 *
 * This function yields files one at a time, which allows processing
 * repositories of ANY size without loading all file paths into memory.
 *
 * @param repoPath - Root path of the repository to scan
 * @param options - Discovery options
 * @yields File paths that match the patterns and size constraints
 *
 * @example
 * ```typescript
 * for await (const filePath of discoverCodeFiles('/path/to/repo')) {
 *   console.log('Processing:', filePath);
 * }
 * ```
 */
export async function* discoverCodeFiles(
	repoPath: string,
	options: FileDiscoveryOptions = {},
): AsyncGenerator<string, void, undefined> {
	const maxFileSize = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
	const patterns = [...DEFAULT_PATTERNS, ...(options.patterns ?? [])];
	const excludes = [...DEFAULT_EXCLUDES, ...(options.excludeDirs ?? [])];

	// Track seen files to avoid duplicates (multiple patterns may match same file)
	const seenFiles = new Set<string>();

	for (const pattern of patterns) {
		// Use glob.iterate() for streaming - doesn't load all paths at once
		const globIterator = glob.iterate(pattern, {
			cwd: repoPath,
			absolute: true,
			ignore: excludes,
		});

		for await (const filePath of globIterator) {
			// Skip duplicates (same file matched by multiple patterns)
			if (seenFiles.has(filePath)) {
				continue;
			}
			seenFiles.add(filePath);

			// Check file size if limit is enabled
			if (maxFileSize > 0) {
				try {
					const stats = await fs.stat(filePath);
					if (stats.size > maxFileSize) {
						// Skip large files (likely generated/minified)
						options.onFileSkipped?.(filePath, stats.size);
						continue;
					}
				} catch {
					// If we can't stat the file, skip it
					continue;
				}
			}

			yield filePath;
		}
	}
}

/**
 * Counts the total number of files that would be discovered.
 *
 * Useful for progress reporting when you need to know the total upfront.
 * Note: This loads all paths into memory, so use with caution on very large repos.
 *
 * @param repoPath - Root path of the repository to scan
 * @param options - Discovery options
 * @returns Total count of files matching the criteria
 */
export async function countCodeFiles(
	repoPath: string,
	options: FileDiscoveryOptions = {},
): Promise<number> {
	let count = 0;
	for await (const _ of discoverCodeFiles(repoPath, options)) {
		count++;
	}
	return count;
}
