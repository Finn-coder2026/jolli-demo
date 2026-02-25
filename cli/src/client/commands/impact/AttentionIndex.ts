/**
 * Attention Index
 *
 * Builds an inverted index for attention file rules.
 */

import type { DocAttention } from "./AttentionParser";

export interface AttentionTarget {
	docId: string;
	docPath: string;
}

export interface SourceFileAttentionIndex {
	exact: Map<string, Set<AttentionTarget>>;
	globs: Array<{
		pattern: string;
		target: AttentionTarget;
	}>;
}

export interface AttentionIndex {
	bySource: Map<string, SourceFileAttentionIndex>;
}

export const LOCAL_SOURCE_NAME = "<local>";

function isGlobPattern(path: string): boolean {
	return /[\*\?\[\]{}]/.test(path);
}

function createSourceFileAttentionIndex(): SourceFileAttentionIndex {
	return {
		exact: new Map<string, Set<AttentionTarget>>(),
		globs: [],
	};
}

function getSourceBucket(index: AttentionIndex, source: string): SourceFileAttentionIndex {
	const existing = index.bySource.get(source);
	if (existing) {
		return existing;
	}
	const created = createSourceFileAttentionIndex();
	index.bySource.set(source, created);
	return created;
}

export function normalizeAttentionSource(source: string | undefined): string {
	const normalized = source?.trim();
	return normalized && normalized.length > 0 ? normalized : LOCAL_SOURCE_NAME;
}

export function normalizeRepoPath(input: string): string {
	let normalized = input.replace(/\\/g, "/");
	normalized = normalized.replace(/^\.\/+/, "");
	normalized = normalized.replace(/^\/+/, "");
	normalized = normalized.replace(/\/+/g, "/");
	const segments = normalized.split("/");
	const stack: Array<string> = [];
	for (const segment of segments) {
		if (!segment || segment === ".") {
			continue;
		}
		if (segment === "..") {
			if (stack.length > 0) {
				stack.pop();
			}
			continue;
		}
		stack.push(segment);
	}
	return stack.join("/");
}

/**
 * Builds the inverted attention index from doc attention declarations.
 */
export function buildAttentionIndex(docs: Array<DocAttention>): AttentionIndex {
	const index: AttentionIndex = {
		bySource: new Map<string, SourceFileAttentionIndex>(),
	};

	for (const doc of docs) {
		const target: AttentionTarget = {
			docId: doc.docId,
			docPath: normalizeRepoPath(doc.docPath),
		};

		for (const rule of doc.rules) {
			if (rule.op !== "file") {
				continue;
			}
				const normalizedPath = normalizeRepoPath(rule.path);
				if (!normalizedPath) {
					continue;
				}
				const source = normalizeAttentionSource(rule.source);
				const sourceBucket = getSourceBucket(index, source);
				if (isGlobPattern(normalizedPath)) {
					sourceBucket.globs.push({ pattern: normalizedPath, target });
				} else {
					const existing = sourceBucket.exact.get(normalizedPath);
					if (existing) {
						existing.add(target);
					} else {
						sourceBucket.exact.set(normalizedPath, new Set([target]));
					}
				}
			}
		}

	return index;
}
