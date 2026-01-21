import { wyhash_str } from "wyhash";

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
	return content.replace(/^(---\n)jrn:[^\n]*\n/, "$1");
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

/**
 * Smart merge: only wraps conflicting sections in markers,
 * preserving common prefix and suffix.
 */
function smartMerge(local: string, server: string): { merged: string; hasConflict: boolean } {
	if (local === server) {
		return { merged: local, hasConflict: false };
	}

	const localLines = local.split("\n");
	const serverLines = server.split("\n");

	// Find common prefix (lines that match at start)
	let prefixEnd = 0;
	while (
		prefixEnd < localLines.length &&
		prefixEnd < serverLines.length &&
		localLines[prefixEnd] === serverLines[prefixEnd]
	) {
		prefixEnd++;
	}

	// Find common suffix (lines that match at end)
	let localSuffixStart = localLines.length;
	let serverSuffixStart = serverLines.length;
	while (
		localSuffixStart > prefixEnd &&
		serverSuffixStart > prefixEnd &&
		localLines[localSuffixStart - 1] === serverLines[serverSuffixStart - 1]
	) {
		localSuffixStart--;
		serverSuffixStart--;
	}

	const result: Array<string> = [];

	// Common prefix
	if (prefixEnd > 0) {
		result.push(...localLines.slice(0, prefixEnd));
	}

	// Differing middle section with conflict markers
	const localDiff = localLines.slice(prefixEnd, localSuffixStart);
	const serverDiff = serverLines.slice(prefixEnd, serverSuffixStart);

	if (localDiff.length > 0 || serverDiff.length > 0) {
		result.push("<<<<<<< LOCAL");
		if (localDiff.length > 0) {
			result.push(...localDiff);
		}
		result.push("=======");
		if (serverDiff.length > 0) {
			result.push(...serverDiff);
		}
		result.push(">>>>>>> SERVER");
	}

	// Common suffix
	if (localSuffixStart < localLines.length) {
		result.push(...localLines.slice(localSuffixStart));
	}

	return { merged: result.join("\n"), hasConflict: true };
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
