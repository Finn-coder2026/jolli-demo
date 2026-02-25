/**
 * Propagation
 *
 * Phase 2 of the impact agent: article-to-article propagation.
 * After Phase 1 updates articles based on code changes, Phase 2
 * detects which articles depend on the updated articles and
 * propagates changes through the documentation graph.
 */

import { getLog } from "../../../shared/logger";
import type { DocAttention } from "./AttentionParser";
import {
	type ArticleAuditEntry,
	type ImpactAuditLog,
	type ImpactAuditRecord,
	getLatestGitRecord,
	getUpdatedArticles,
} from "./AuditTrail";
import { type PropagationState, advancePropagationState, createPropagationState, shouldProcess } from "./CycleDetector";
import { buildImpactMatches } from "./search";

const logger = getLog(import.meta);

/**
 * Represents an article update from Phase 1 that can trigger Phase 2 propagation.
 */
export interface Phase1Update {
	readonly path: string;
	readonly jrn: string;
	readonly diff: string | undefined;
}

/**
 * Result of the propagation process.
 */
export interface PropagationResult {
	readonly articlesUpdated: ReadonlyArray<string>;
	readonly articlesUnchanged: ReadonlyArray<string>;
	readonly articlesSkipped: ReadonlyArray<string>;
	readonly articlesError: ReadonlyArray<string>;
	readonly cyclesDetected: ReadonlyArray<string>;
	readonly maxDepthReached: boolean;
	readonly depth: number;
}

/** Mutable builder for constructing a PropagationResult during propagation. */
export interface MutablePropagationResult {
	articlesUpdated: Array<string>;
	articlesUnchanged: Array<string>;
	articlesSkipped: Array<string>;
	articlesError: Array<string>;
	cyclesDetected: Array<string>;
	maxDepthReached: boolean;
	depth: number;
}

/**
 * Options for running propagation.
 */
export interface PropagationOptions {
	readonly docsPath: string;
	readonly maxDepth: number;
	readonly autoConfirm: boolean;
	readonly dryRun: boolean;
	readonly json: boolean;
}

/**
 * Match result for an article that depends on updated articles.
 */
export interface DependentArticleMatch {
	readonly docPath: string;
	readonly docId: string;
	readonly triggeringArticles: ReadonlyArray<Phase1Update>;
	readonly evidence: ReadonlyArray<{
		readonly changedFile: string;
		readonly pattern: string;
		readonly matchType: "exact" | "glob";
		readonly source: string;
	}>;
}

/**
 * Creates an empty propagation result.
 */
export function createEmptyResult(depth: number): PropagationResult {
	return {
		articlesUpdated: [],
		articlesUnchanged: [],
		articlesSkipped: [],
		articlesError: [],
		cyclesDetected: [],
		maxDepthReached: false,
		depth,
	};
}

/**
 * Merges two propagation results.
 */
export function mergeResults(a: PropagationResult, b: PropagationResult): PropagationResult {
	return {
		articlesUpdated: [...a.articlesUpdated, ...b.articlesUpdated],
		articlesUnchanged: [...a.articlesUnchanged, ...b.articlesUnchanged],
		articlesSkipped: [...a.articlesSkipped, ...b.articlesSkipped],
		articlesError: [...a.articlesError, ...b.articlesError],
		cyclesDetected: [...a.cyclesDetected, ...b.cyclesDetected],
		maxDepthReached: a.maxDepthReached || b.maxDepthReached,
		depth: Math.max(a.depth, b.depth),
	};
}

/**
 * Gets the updated articles from the most recent git-based audit record.
 * Used by Phase 2 to find the Phase 1 results to propagate from.
 *
 * @param auditLog - The audit log to search
 * @returns Array of Phase 1 updates (path, jrn, diff) or empty array if none found
 */
export function getPhase1Updates(auditLog: ImpactAuditLog): Array<Phase1Update> {
	const latestGitRecord = getLatestGitRecord(auditLog);
	if (!latestGitRecord) {
		logger.debug("No git-based audit record found for Phase 2 propagation");
		return [];
	}

	const updatedArticles = getUpdatedArticles(latestGitRecord);
	return updatedArticles.map(article => ({
		path: article.path,
		jrn: article.jrn,
		diff: article.patch,
	}));
}

/**
 * Gets updated articles from a specific audit record.
 *
 * @param record - The audit record to extract updates from
 * @returns Array of Phase 1 updates (path, jrn, diff)
 */
export function getUpdatesFromRecord(record: ImpactAuditRecord): Array<Phase1Update> {
	const updatedArticles = getUpdatedArticles(record);
	return updatedArticles.map(article => ({
		path: article.path,
		jrn: article.jrn,
		diff: article.patch,
	}));
}

/**
 * Finds articles that depend on the given updated articles.
 * Uses the same attention frontmatter matching as Phase 1.
 *
 * @param updatedArticles - Array of articles that were updated
 * @param allDocs - All docs with attention frontmatter
 * @param state - Current propagation state for cycle detection
 * @returns Array of dependent article matches
 */
export function findDependentArticles(
	updatedArticles: ReadonlyArray<Phase1Update>,
	allDocs: ReadonlyArray<DocAttention>,
	state: PropagationState,
): Array<DependentArticleMatch> {
	if (updatedArticles.length === 0) {
		return [];
	}

	// Get the paths of updated articles as "changed files"
	const changedPaths = updatedArticles.map(a => a.path);

	// Use buildImpactMatches to find articles watching these paths
	const matches = buildImpactMatches(
		allDocs as Array<DocAttention>,
		changedPaths.map(p => ({ status: "modified" as const, file: p })),
	);

	// Filter matches:
	// 1. Remove self-references (an article can't trigger itself)
	// 2. Remove already-visited articles (cycle detection)
	const updatedPaths = new Set(changedPaths);
	const dependentMatches: Array<DependentArticleMatch> = [];

	for (const match of matches) {
		// Skip self-references
		if (updatedPaths.has(match.docPath)) {
			logger.debug("Skipping self-reference: %s", match.docPath);
			continue;
		}

		// Check cycle detection
		const processResult = shouldProcess(match.docId, state);
		if (!processResult.allowed) {
			logger.debug("Skipping due to cycle/depth: %s - %s", match.docId, processResult.reason);
			continue;
		}

		// Find which updated articles triggered this match
		const triggeringArticles = updatedArticles.filter(update =>
			match.matches.some(e => e.changedFile === update.path),
		);

		dependentMatches.push({
			docPath: match.docPath,
			docId: match.docId,
			triggeringArticles,
			evidence: match.matches,
		});
	}

	return dependentMatches;
}

/**
 * Filters out articles that have already been processed or would cause cycles.
 *
 * @param articles - Array of article entries to filter
 * @param state - Current propagation state
 * @returns Filtered array of articles safe to process
 */
export function filterProcessableArticles(
	articles: ReadonlyArray<DependentArticleMatch>,
	state: PropagationState,
): {
	processable: ReadonlyArray<DependentArticleMatch>;
	cyclesDetected: ReadonlyArray<string>;
	maxDepthReached: boolean;
} {
	const processable: Array<DependentArticleMatch> = [];
	const cyclesDetected: Array<string> = [];
	let maxDepthReached = false;

	for (const article of articles) {
		const result = shouldProcess(article.docId, state);
		if (result.allowed) {
			processable.push(article);
		} else if (result.reason?.includes("Cycle detected")) {
			cyclesDetected.push(article.docId);
			logger.info("Cycle detected, skipping: %s", article.docId);
		} else if (result.reason?.includes("Max depth")) {
			maxDepthReached = true;
			logger.info("Max depth reached, skipping: %s", article.docId);
		}
	}

	return { processable, cyclesDetected, maxDepthReached };
}

/**
 * Creates an audit entry for a skipped article (due to cycle or depth).
 */
export function createSkippedAuditEntry(
	match: DependentArticleMatch,
	reason: string,
): ArticleAuditEntry {
	return {
		jrn: match.docId,
		path: match.docPath,
		status: "skipped",
		evidence: match.evidence.map(e => ({
			changedFile: e.changedFile,
			pattern: e.pattern,
			matchType: e.matchType,
			source: e.source,
		})),
		reasoning: reason,
	};
}

/**
 * Builds initial state for propagation, marking Phase 1 articles as already visited.
 *
 * @param phase1Updates - Articles updated in Phase 1
 * @param maxDepth - Maximum propagation depth
 * @returns Initial propagation state with Phase 1 articles marked as visited
 */
export function buildInitialPropagationState(
	phase1Updates: ReadonlyArray<Phase1Update>,
	maxDepth: number,
): PropagationState {
	const state = createPropagationState(maxDepth);

	// Mark all Phase 1 articles as visited so they won't be reprocessed
	for (const update of phase1Updates) {
		state.visited.add(update.jrn);
	}

	return state;
}

/**
 * Advances the propagation state for a new depth level.
 *
 * @param state - Current propagation state
 * @param processedJrns - JRNs processed at this level
 * @returns New state for the next depth level
 */
export function advanceToNextDepth(
	state: PropagationState,
	processedJrns: ReadonlyArray<string>,
): PropagationState {
	let newState = state;
	for (const jrn of processedJrns) {
		newState = advancePropagationState(newState, jrn);
	}

	// Increment depth for the next level (without adding to path)
	return {
		visited: newState.visited,
		depth: state.depth + 1,
		maxDepth: newState.maxDepth,
		path: newState.path,
	};
}
