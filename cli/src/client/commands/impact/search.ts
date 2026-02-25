/**
 * Impact Search Command
 *
 * Scans docs for attention frontmatter and matches against changed files.
 */

import path from "node:path";
import { findProjectRoot } from "../../../shared/ProjectRoot";
import { getSourcePathStatus, loadSources } from "../../../shared/Sources";
import { getLog } from "../../../shared/logger";
import { type AttentionIndex, LOCAL_SOURCE_NAME, buildAttentionIndex, normalizeRepoPath } from "./AttentionIndex";
import { type DocAttention } from "./AttentionParser";
import { loadDocAttention } from "./DocLoader";
import { matchFiles, type FileMatch } from "./FileMatcher";
import {
	getFileChangesBetween,
	getUncommittedFileChanges,
	resolveBaseRef,
} from "./GitDiffParser";
import type { RawFileChange } from "./Types";

const logger = getLog(import.meta);

export interface ImpactSearchOptions {
	base?: string;
	uncommitted: boolean;
	json: boolean;
	docs?: string;
	source?: string;
	strict?: boolean;
}

export interface SourcedRawFileChange extends RawFileChange {
	readonly source?: string;
}

export interface ResolvedImpactSource {
	readonly source: string;
	readonly repoRoot: string;
}

export interface ImpactSourceResolutionIssue {
	readonly source: string;
	readonly warning: string;
}

export interface ResolvedImpactSourcesResult {
	readonly sources: Array<ResolvedImpactSource>;
	readonly warnings: Array<string>;
	readonly referencedSources: Array<string>;
	readonly unresolvedSources: Array<ImpactSourceResolutionIssue>;
}

interface ImpactSourceSelectionOptions {
	readonly source?: string;
	readonly strict?: boolean;
	readonly commandName: string;
}



export function collectChangedFiles(fileChanges: Array<RawFileChange>): Array<string> {
	const paths = new Set<string>();
	for (const change of fileChanges) {
		if (change.oldFile) {
			paths.add(normalizeRepoPath(change.oldFile));
		}
		if (change.file) {
			paths.add(normalizeRepoPath(change.file));
		}
	}
	return Array.from(paths).filter(entry => entry.length > 0);
}

function collectChangedFilesBySource(fileChanges: Array<SourcedRawFileChange>): Map<string, Array<string>> {
	const pathsBySource = new Map<string, Set<string>>();
	for (const change of fileChanges) {
		const source = change.source?.trim() || LOCAL_SOURCE_NAME;
		let sourcePaths = pathsBySource.get(source);
		if (!sourcePaths) {
			sourcePaths = new Set<string>();
			pathsBySource.set(source, sourcePaths);
		}

		if (change.oldFile) {
			const normalized = normalizeRepoPath(change.oldFile);
			if (normalized) {
				sourcePaths.add(normalized);
			}
		}
		if (change.file) {
			const normalized = normalizeRepoPath(change.file);
			if (normalized) {
				sourcePaths.add(normalized);
			}
		}
	}

	return new Map(
		Array.from(pathsBySource.entries()).map(([source, paths]) => [source, Array.from(paths)] as const),
	);
}

function mergeMatches(matches: Array<FileMatch>): Array<FileMatch> {
	const matchesByDoc = new Map<string, FileMatch>();

	for (const match of matches) {
		const existing = matchesByDoc.get(match.docId);
		if (!existing) {
			matchesByDoc.set(match.docId, {
				docId: match.docId,
				docPath: match.docPath,
				matches: [...match.matches],
			});
			continue;
		}

		for (const evidence of match.matches) {
			const hasEvidence = existing.matches.some(
				entry =>
					entry.changedFile === evidence.changedFile &&
					entry.pattern === evidence.pattern &&
					entry.matchType === evidence.matchType &&
					entry.source === evidence.source,
			);
			if (!hasEvidence) {
				existing.matches.push(evidence);
			}
		}
	}

	const merged = Array.from(matchesByDoc.values());
	merged.sort((a, b) => a.docPath.localeCompare(b.docPath));
	for (const match of merged) {
		match.matches.sort((a, b) => {
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
	return merged;
}

export function buildImpactMatches(
	docs: Array<DocAttention>,
	fileChanges: Array<SourcedRawFileChange>,
): Array<FileMatch> {
	const index = buildAttentionIndex(docs);
	const changedFilesBySource = collectChangedFilesBySource(fileChanges);
	const matches: Array<FileMatch> = [];

	for (const [source, changedFiles] of changedFilesBySource.entries()) {
		matches.push(...matchFiles(changedFiles, index, source));
	}

	return mergeMatches(matches);
}

export function displaySourceLabel(source: string): string {
	return source === LOCAL_SOURCE_NAME ? "local" : source;
}

export function normalizeRequestedSourceName(source?: string): string | undefined {
	if (typeof source !== "string") {
		return undefined;
	}

	const normalized = source.trim();
	if (!normalized) {
		throw new Error("Source name cannot be empty.");
	}
	if (normalized === LOCAL_SOURCE_NAME || normalized.toLowerCase() === "local") {
		return LOCAL_SOURCE_NAME;
	}
	return normalized;
}

export function selectImpactSources(
	resolved: ResolvedImpactSourcesResult,
	options: ImpactSourceSelectionOptions,
): { sources: Array<ResolvedImpactSource>; warnings: Array<string>; selectedSource?: string } {
	const requestedSource = normalizeRequestedSourceName(options.source);
	let selectedSources = resolved.sources;
	let selectedWarnings = resolved.warnings;

	if (requestedSource) {
		if (!resolved.referencedSources.includes(requestedSource)) {
			throw new Error(`Source "${displaySourceLabel(requestedSource)}" is not referenced by any attention rule.`);
		}

		selectedSources = resolved.sources.filter(entry => entry.source === requestedSource);
		selectedWarnings = resolved.unresolvedSources
			.filter(issue => issue.source === requestedSource)
			.map(issue => issue.warning);

		if (selectedSources.length === 0) {
			const detail = selectedWarnings[0];
			if (detail) {
				throw new Error(`Source "${displaySourceLabel(requestedSource)}" could not be resolved. ${detail}`);
			}
			throw new Error(`Source "${displaySourceLabel(requestedSource)}" could not be resolved.`);
		}
	}

	if ((options.strict ?? false) && selectedWarnings.length > 0) {
		throw new Error(
			`${options.commandName} failed in strict mode because some sources could not be resolved:\n${selectedWarnings.map(w => `- ${w}`).join("\n")}`,
		);
	}

	return { sources: selectedSources, warnings: selectedWarnings, selectedSource: requestedSource };
}

function printMatches(matches: Array<FileMatch>): void {
	if (matches.length === 0) {
		console.log("No impacted docs found.");
		return;
	}

	console.log(`Impacted docs (${matches.length})`);
	for (const match of matches) {
		console.log(`- ${match.docPath} (${match.docId})`);
		for (const evidence of match.matches) {
			console.log(
				`  - [${displaySourceLabel(evidence.source)}] ${evidence.changedFile} matched ${evidence.pattern} (${evidence.matchType})`,
			);
		}
	}
}

async function getFileChanges(options: ImpactSearchOptions, cwd: string): Promise<Array<RawFileChange>> {
	if (options.uncommitted) {
		return getUncommittedFileChanges(cwd);
	}

	const baseRef = await resolveBaseRef(options.base, cwd);

	return getFileChangesBetween(baseRef, "HEAD", cwd);
}

export async function resolveImpactSources(
	index: AttentionIndex,
	projectRoot: string,
): Promise<ResolvedImpactSourcesResult> {
	const sourcesConfig = await loadSources(projectRoot);
	const configuredSources = sourcesConfig.sources;
	const warnings: Array<string> = [];
	const unresolvedSources: Array<ImpactSourceResolutionIssue> = [];
	const sources: Array<ResolvedImpactSource> = [];
	const indexedSources = Array.from(index.bySource.keys()).sort((a, b) => a.localeCompare(b));
	const referencedSources = indexedSources.length > 0 ? indexedSources : [LOCAL_SOURCE_NAME];

	if (indexedSources.length === 0) {
		// Keep backward compatibility: if nothing is indexed yet, treat project root as the implicit source.
		return {
			sources: [{ source: LOCAL_SOURCE_NAME, repoRoot: projectRoot }],
			warnings,
			referencedSources,
			unresolvedSources,
		};
	}

	for (const source of referencedSources) {
		if (source === LOCAL_SOURCE_NAME) {
			sources.push({ source, repoRoot: projectRoot });
			continue;
		}

		const sourceEntry = configuredSources[source];
		if (!sourceEntry) {
			const warning = `Source "${source}" is referenced by attention rules but missing from .jolli/sources.json; skipping.`;
			warnings.push(warning);
			unresolvedSources.push({ source, warning });
			continue;
		}

		const status = await getSourcePathStatus(sourceEntry.path);
		if (status !== "resolved") {
			const warning = `Source "${source}" has ${status} path (${sourceEntry.path}); skipping.`;
			warnings.push(warning);
			unresolvedSources.push({ source, warning });
			continue;
		}

		sources.push({ source, repoRoot: sourceEntry.path });
	}

	return { sources, warnings, referencedSources, unresolvedSources };
}

/**
 * Runs the impact search command.
 */
export async function runImpactSearch(options: ImpactSearchOptions): Promise<void> {
	const cwd = (await findProjectRoot()) ?? process.cwd();
	logger.debug("Running impact search (uncommitted: %s, base: %s)", options.uncommitted, options.base ?? "auto");

	try {
		const docsRoot = options.docs ?? "docs";
		const docs = await loadDocAttention(docsRoot, cwd);
		const attentionIndex = buildAttentionIndex(docs);
		const resolvedSources = await resolveImpactSources(attentionIndex, cwd);
		const { sources, warnings } = selectImpactSources(resolvedSources, {
			source: options.source,
			strict: options.strict,
			commandName: "impact search",
		});
		for (const warning of warnings) {
			console.warn(`Warning: ${warning}`);
			logger.warn(warning);
		}

		const sourcedFileChanges: Array<SourcedRawFileChange> = [];
		for (const source of sources) {
			try {
				const fileChanges = await getFileChanges(options, source.repoRoot);
				for (const change of fileChanges) {
					sourcedFileChanges.push({ ...change, source: source.source });
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const warning = `Failed to read git changes for source "${source.source}" at ${source.repoRoot}: ${message}. Skipping source.`;
				console.warn(`Warning: ${warning}`);
				logger.warn(warning);
			}
		}

		const fileChanges = sourcedFileChanges;
		const matches = buildImpactMatches(docs, fileChanges);

		if (options.json) {
			console.log(JSON.stringify(matches, null, 2));
			return;
		}
		printMatches(matches);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Error: ${message}`);
		process.exit(1);
	}
}
