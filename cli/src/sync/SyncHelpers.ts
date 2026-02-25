import { wyhash_str } from "wyhash";

import { smartMerge } from "./SmartMerge";

export function extractJrn(content: string): string | null {
	const match = content.match(/^---\n[\s\S]*?jrn:\s*([^\n]+)[\s\S]*?\n---/);
	return match?.[1]?.trim() ?? null;
}

export function injectJrn(content: string, jrn: string): string {
	const hasFrontmatter = content.startsWith("---\n");
	if (hasFrontmatter) {
		if (/^---\n[\s\S]*?jrn:/m.test(content)) {
			return content.replace(/(^---\n[\s\S]*?)jrn:[^\n]*\n/, `$1jrn: ${jrn}\n`);
		}
		return content.replace(/^---\n/, `---\njrn: ${jrn}\n`);
	}
	return `---\njrn: ${jrn}\n---\n${content}`;
}

export function removeJrnFromContent(content: string): string {
	// Remove jrn: line from anywhere in frontmatter
	if (!content.startsWith("---\n")) return content;

	// Find the closing ---
	const closingIdx = content.indexOf("\n---", 4);
	if (closingIdx === -1) return content;

	const frontmatter = content.substring(4, closingIdx); // content between opening and closing ---
	const afterFrontmatter = content.substring(closingIdx + 1); // +1 to skip the \n before ---

	// Remove jrn: line from frontmatter
	const cleanLines = frontmatter.split("\n").filter((line) => !line.startsWith("jrn:"));

	if (cleanLines.length > 0) {
		return `---\n${cleanLines.join("\n")}\n${afterFrontmatter}`;
	}
	// No remaining frontmatter fields, just the closing ---
	return `---\n${afterFrontmatter}`;
}

export function normalizeClientPath(path: string): string {
	let normalized = path.replace(/\\/g, "/");
	if (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	normalized = normalized.replace(/\/+/g, "/");
	return normalized;
}

export function normalizeGlobPattern(pattern: string): string {
	return pattern.replace(/\\/g, "/");
}

export function formatConflictMarkers(localContent: string, serverContent: string): string {
	const { merged } = smartMerge(localContent, serverContent);
	return merged;
}

export function hasConflictMarkers(content: string): boolean {
	return /^(<<<<<<<|=======|>>>>>>>)/m.test(content);
}

// Use wyhash for compatibility with Node.js backend
// Bun.hash uses a different algorithm that doesn't match the wyhash npm package

/** Default seed for wyhash - must match backend */
const DEFAULT_SEED = 0n;

export function integrityHashFromContent(content: string): string {
	return wyhash_str(content, DEFAULT_SEED).toString(16);
}

export function fingerprintFromContent(content: string): string {
	return wyhash_str(removeJrnFromContent(content), DEFAULT_SEED).toString(16);
}
