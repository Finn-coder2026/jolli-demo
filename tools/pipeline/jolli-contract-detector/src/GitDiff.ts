/**
 * Git diff parsing utilities.
 * Extracts changed files and line-level diffs from git.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FileDiff } from "./types.js";

const execFilePromise = promisify(execFile);

/**
 * Git utilities object - allows mocking in tests.
 * @internal
 */
export const git = {
	async execFileAsync(
		cmd: string,
		args: Array<string>,
		opts: { cwd: string; encoding: "utf-8" },
	): Promise<{ stdout: string; stderr: string }> {
		return execFilePromise(cmd, args, opts);
	},
};

/**
 * Get the list of files changed between the current HEAD and a base ref.
 * @param baseRef - The base reference to compare against (e.g., "origin/main")
 * @param cwd - Working directory for git commands
 * @returns Promise resolving to array of changed file paths
 */
export async function getChangedFiles(baseRef: string, cwd: string): Promise<Array<string>> {
	const { stdout } = await git.execFileAsync("git", ["diff", "--name-only", `${baseRef}...HEAD`], {
		cwd,
		encoding: "utf-8",
	});

	return stdout
		.split("\n")
		.map((line: string) => line.trim())
		.filter((line: string) => line.length > 0);
}

/**
 * Get the diff for a specific file between the current HEAD and a base ref.
 * @param filePath - Path to the file
 * @param baseRef - The base reference to compare against
 * @param cwd - Working directory for git commands
 * @returns Promise resolving to FileDiff with added and removed lines
 */
export async function getFileDiff(filePath: string, baseRef: string, cwd: string): Promise<FileDiff> {
	try {
		const { stdout } = await git.execFileAsync(
			"git",
			["diff", `${baseRef}...HEAD`, "--", filePath],
			{ cwd, encoding: "utf-8" },
		);
		return parseUnifiedDiff(filePath, stdout);
	} catch {
		// File might be new or deleted, return empty diff
		return { filePath, addedLines: [], removedLines: [] };
	}
}

/**
 * Parse a unified diff output into added/removed lines.
 * @param filePath - Path to the file
 * @param diffOutput - Raw git diff output
 * @returns FileDiff with categorized lines
 */
export function parseUnifiedDiff(filePath: string, diffOutput: string): FileDiff {
	const addedLines: Array<string> = [];
	const removedLines: Array<string> = [];

	const lines = diffOutput.split("\n");

	for (const line of lines) {
		// Skip diff headers and hunk markers
		if (
			line.startsWith("diff ") ||
			line.startsWith("index ") ||
			line.startsWith("--- ") ||
			line.startsWith("+++ ") ||
			line.startsWith("@@ ")
		) {
			continue;
		}

		// Added lines start with +
		if (line.startsWith("+")) {
			addedLines.push(line.slice(1));
		}
		// Removed lines start with -
		else if (line.startsWith("-")) {
			removedLines.push(line.slice(1));
		}
		// Context lines (space prefix) are ignored
	}

	return { filePath, addedLines, removedLines };
}

/**
 * Check if a file path matches .env file patterns.
 * Matches: .env, .env.example, .env.template, .env.local, etc.
 * @param filePath - Path to check
 * @returns True if the file is an env file
 */
export function isEnvFile(filePath: string): boolean {
	const fileName = filePath.split("/").pop() || filePath;
	return fileName === ".env" || fileName.startsWith(".env.");
}

/**
 * Check if a file is a JavaScript/TypeScript source file.
 * @param filePath - Path to check
 * @returns True if the file is a JS/TS source file
 */
export function isSourceFile(filePath: string): boolean {
	return /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(filePath);
}

/**
 * Result of categorizing changed files by type.
 */
export interface CategorizedFiles {
	/** Environment files (.env, .env.example, etc.) */
	envFiles: Array<string>;
	/** JavaScript/TypeScript source files */
	sourceFiles: Array<string>;
}

/**
 * Filter changed files to only include relevant files for env detection.
 * @param files - Array of file paths
 * @returns Object with envFiles and sourceFiles arrays
 */
export function categorizeChangedFiles(files: Array<string>): CategorizedFiles {
	const envFiles: Array<string> = [];
	const sourceFiles: Array<string> = [];

	for (const file of files) {
		if (isEnvFile(file)) {
			envFiles.push(file);
		} else if (isSourceFile(file)) {
			sourceFiles.push(file);
		}
	}

	return { envFiles, sourceFiles };
}
