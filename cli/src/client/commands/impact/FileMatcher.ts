/**
 * File Matcher
 *
 * Matches changed files against attention index rules.
 */

import type { AttentionIndex, AttentionTarget } from "./AttentionIndex";
import { normalizeAttentionSource, normalizeRepoPath } from "./AttentionIndex";

export type MatchType = "exact" | "glob";

export interface FileMatchEvidence {
	changedFile: string;
	pattern: string;
	matchType: MatchType;
	source: string;
}

export interface FileMatch {
	docId: string;
	docPath: string;
	matches: Array<FileMatchEvidence>;
}

function escapeRegexChar(char: string): string {
	return /[\\^$+?.()|\\[\\]{}]/.test(char) ? `\\${char}` : char;
}

function expandBraces(pattern: string): Array<string> {
	const match = pattern.match(/\{([^{}]+)\}/);
	if (!match || match.index === undefined) {
		return [pattern];
	}
	const before = pattern.slice(0, match.index);
	const after = pattern.slice(match.index + match[0].length);
	const options = match[1].split(",");
	const expanded: Array<string> = [];
	for (const option of options) {
		for (const result of expandBraces(`${before}${option}${after}`)) {
			expanded.push(result);
		}
	}
	return expanded;
}

function globToRegExp(pattern: string): RegExp {
	let regex = "^";
	let i = 0;
	while (i < pattern.length) {
		const char = pattern[i] ?? "";
		if (char === "*") {
			if (pattern[i + 1] === "*") {
				while (pattern[i + 1] === "*") {
					i++;
				}
				if (pattern[i + 1] === "/") {
					regex += "(?:[^/]+/)*";
					i++;
				} else {
					regex += ".*";
				}
			} else {
				regex += "[^/]*";
			}
		} else if (char === "?") {
			regex += "[^/]";
		} else {
			regex += escapeRegexChar(char);
		}
		i++;
	}
	regex += "$";
	return new RegExp(regex);
}

function compileGlob(pattern: string): Array<RegExp> {
	return expandBraces(pattern).map(expanded => globToRegExp(expanded));
}

function globMatches(path: string, compiled: Array<RegExp>): boolean {
	return compiled.some(regex => regex.test(path));
}

function ensureMatchEntry(
	matchesByDoc: Map<string, FileMatch>,
	target: AttentionTarget,
): FileMatch {
	const existing = matchesByDoc.get(target.docId);
	if (existing) {
		return existing;
	}
	const created: FileMatch = {
		docId: target.docId,
		docPath: target.docPath,
		matches: [],
	};
	matchesByDoc.set(target.docId, created);
	return created;
}

function addEvidence(match: FileMatch, evidence: FileMatchEvidence): void {
	const exists = match.matches.some(
		item =>
			item.changedFile === evidence.changedFile &&
			item.pattern === evidence.pattern &&
			item.matchType === evidence.matchType &&
			item.source === evidence.source,
	);
	if (!exists) {
		match.matches.push(evidence);
	}
}

/**
 * Matches changed files against the attention index.
 */
export function matchFiles(
	changedFiles: Array<string>,
	index: AttentionIndex,
	source?: string,
): Array<FileMatch> {
	const sourceName = normalizeAttentionSource(source);
	const sourceIndex = index.bySource.get(sourceName);
	if (!sourceIndex) {
		return [];
	}

	const normalizedFiles = Array.from(
		new Set(changedFiles.map(file => normalizeRepoPath(file)).filter(file => file.length > 0)),
	);
	const matchesByDoc = new Map<string, FileMatch>();
	const compiledGlobs = sourceIndex.globs.map(entry => ({
		...entry,
		compiled: compileGlob(entry.pattern),
	}));

	for (const file of normalizedFiles) {
		const exactTargets = sourceIndex.exact.get(file);
		if (exactTargets) {
			for (const target of exactTargets) {
				const match = ensureMatchEntry(matchesByDoc, target);
				addEvidence(match, {
					changedFile: file,
					pattern: file,
					matchType: "exact",
					source: sourceName,
				});
			}
		}

		for (const entry of compiledGlobs) {
			if (globMatches(file, entry.compiled)) {
				const match = ensureMatchEntry(matchesByDoc, entry.target);
				addEvidence(match, {
					changedFile: file,
					pattern: entry.pattern,
					matchType: "glob",
					source: sourceName,
				});
			}
		}
	}

	const results = Array.from(matchesByDoc.values());
	results.sort((a, b) => a.docPath.localeCompare(b.docPath));
	for (const result of results) {
		result.matches.sort((a, b) => {
			if (a.changedFile === b.changedFile) {
				if (a.pattern === b.pattern) {
					if (a.matchType === b.matchType) {
						return a.source.localeCompare(b.source);
					}
					return a.matchType.localeCompare(b.matchType);
				}
				return a.pattern.localeCompare(b.pattern);
			}
			return a.changedFile.localeCompare(b.changedFile);
		});
	}
	return results;
}
