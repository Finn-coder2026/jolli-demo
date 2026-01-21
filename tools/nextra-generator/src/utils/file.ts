import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Ensures a directory exists, creating it recursively if needed
 */
export async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Writes content to a file, creating parent directories if needed
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
	await ensureDir(path.dirname(filePath));
	await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Reads file content
 */
export function readFile(filePath: string): Promise<string> {
	return fs.readFile(filePath, "utf-8");
}

/**
 * Checks if a file or directory exists
 */
export async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Copies a file from source to destination
 */
export async function copyFile(src: string, dest: string): Promise<void> {
	await ensureDir(path.dirname(dest));
	await fs.copyFile(src, dest);
}

/**
 * Resolves a path relative to the output directory
 */
export function resolvePath(outputDir: string, ...segments: Array<string>): string {
	return path.join(outputDir, ...segments);
}
