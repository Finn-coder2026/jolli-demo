import type { RunState } from "../Types";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Sandbox } from "e2b";

/**
 * Recursively list all files under a directory on the local filesystem.
 */
export async function listAllFilesLocal(dir?: string): Promise<Array<string>> {
	const target = dir && dir.trim().length > 0 ? dir : ".";
	try {
		const s = await stat(target);
		if (!s.isDirectory()) {
			return [target];
		}
	} catch {
		return [];
	}

	const results: Array<string> = [];

	async function walk(current: string) {
		let entries: Array<import("node:fs").Dirent> = [];
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch {
			return; // skip unreadable directories
		}
		for (const entry of entries) {
			const p = join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(p);
			} else if (entry.isFile()) {
				results.push(p);
			}
			// ignore symlinks/sockets, etc.
		}
	}

	await walk(target);
	return results;
}

/**
 * Recursively list all files under a directory inside an E2B sandbox.
 * Follows the pattern used by ls tool: prefers sandbox execution when available.
 */
export async function listAllFilesE2B(runState: RunState, dir?: string): Promise<Array<string>> {
	const sandbox = runState.e2bsandbox as Sandbox | undefined;
	if (!sandbox) {
		return [];
	}
	const target = dir && dir.trim().length > 0 ? dir : ".";
	const q = shQuotePath(target);
	const cmd = `bash -lc 'find ${q} -type f -print'`;
	try {
		const proc = await sandbox.commands.run(cmd);
		if (proc.error) {
			return [];
		}
		const out = (proc.stdout || "").trim();
		if (!out) {
			return [];
		}
		return out.split(/\r?\n/).filter(Boolean);
	} catch {
		return [];
	}
}

/**
 * Unified helper: if E2B sandbox is present, run there; else use local filesystem.
 */
export async function listAllFiles(runState: RunState, dir?: string): Promise<Array<string>> {
	if (runState.e2bsandbox) {
		return await listAllFilesE2B(runState, dir);
	}
	return await listAllFilesLocal(dir);
}

/**
 * Convenience: newline-separated string with trailing newline.
 */
export async function listAllFilesText(runState: RunState, dir?: string): Promise<string> {
	const files = await listAllFiles(runState, dir);
	return files.length > 0 ? `${files.join("\n")}\n` : "";
}

/**
 * Read a markdown file from the local filesystem as UTF-8 text.
 * Strips a UTF-8 BOM if present and returns the content as string.
 */
export async function readMarkdownFileLocal(path: string): Promise<string> {
	const { readFile } = await import("node:fs/promises");
	try {
		let text = await readFile(path, "utf-8");
		// Strip UTF-8 BOM if present
		if (text.charCodeAt(0) === 0xfeff) {
			text = text.slice(1);
		}
		return text;
	} catch {
		return "";
	}
}

function shQuotePath(p: string): string {
	// Safely single-quote a path for bash -lc
	return `'${p.replace(/'/g, "'\\''")}'`;
}

/**
 * Read a markdown file inside an E2B sandbox as UTF-8 text.
 * Uses `cat -- <path>` under bash. Returns empty string on error.
 */
export async function readMarkdownFileE2B(runState: RunState, path: string): Promise<string> {
	const sandbox = runState.e2bsandbox as Sandbox | undefined;
	if (!sandbox) {
		return "";
	}
	const q = shQuotePath(path);
	const cmd = `bash -lc 'cat -- ${q}'`;
	try {
		const proc = await sandbox.commands.run(cmd);
		if (proc.error) {
			return "";
		}
		let text = proc.stdout || "";
		// Normalize CRLF to LF for consistency
		text = text.replace(/\r\n/g, "\n");
		if (text.charCodeAt(0) === 0xfeff) {
			text = text.slice(1);
		}
		return text;
	} catch {
		return "";
	}
}

/**
 * Unified: read markdown file as UTF-8 text, preferring E2B sandbox when available.
 */
export async function readMarkdownFile(runState: RunState, path: string): Promise<string> {
	if (runState.e2bsandbox) {
		return await readMarkdownFileE2B(runState, path);
	}
	return await readMarkdownFileLocal(path);
}
