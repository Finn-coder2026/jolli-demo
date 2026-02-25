/**
 * Impact Context Builder
 *
 * Builds ImpactContext for the impact agent from FileMatch and ImpactReport data.
 */

import type { FileMatch, FileMatchEvidence } from "./FileMatcher";
import { LOCAL_SOURCE_NAME } from "./AttentionIndex";
import type { FileStatus, Hunk, ImpactReport } from "./Types";

/**
 * Context for a single code change, formatted for the agent.
 */
export interface ChangeContext {
	readonly path: string;
	readonly status: FileStatus;
	readonly diff: string;
}

/**
 * Commit information for the agent.
 */
export interface CommitContext {
	readonly sha: string;
	readonly message: string;
}

/**
 * Evidence entry for the agent.
 */
export interface EvidenceContext {
	readonly changedFile: string;
	readonly pattern: string;
	readonly matchType: "exact" | "glob";
	readonly source: string;
}

/**
 * Complete impact context for the agent.
 * This matches the ImpactContext type expected by the backend.
 */
export interface ImpactContext {
	readonly article: {
		readonly path: string;
		readonly jrn: string;
	};
	readonly changes: ReadonlyArray<ChangeContext>;
	readonly commits: ReadonlyArray<CommitContext>;
	readonly evidence: ReadonlyArray<EvidenceContext>;
}

/**
 * Extracts unique changed file paths from evidence.
 */
interface EvidenceFileRef {
	readonly source: string;
	readonly filePath: string;
}

function getEvidenceFileRefs(evidence: ReadonlyArray<FileMatchEvidence>): Array<EvidenceFileRef> {
	const refsByKey = new Map<string, EvidenceFileRef>();
	for (const entry of evidence) {
		const source = entry.source || LOCAL_SOURCE_NAME;
		const key = `${source}\u0000${entry.changedFile}`;
		if (!refsByKey.has(key)) {
			refsByKey.set(key, { source, filePath: entry.changedFile });
		}
	}
	return Array.from(refsByKey.values());
}

/**
 * Collects all hunks for a given file path from an ImpactReport.
 */
function collectHunksForFile(report: ImpactReport, filePath: string, source: string): Array<Hunk> {
	const hunks: Array<Hunk> = [];
	for (const commit of report.commits) {
		for (const hunk of commit.hunks) {
			if (hunk.file === filePath && (hunk.source ?? LOCAL_SOURCE_NAME) === source) {
				hunks.push(hunk);
			}
		}
	}
	return hunks;
}

/**
 * Determines the file status from hunks (uses first hunk's status).
 */
function getFileStatus(hunks: Array<Hunk>): FileStatus {
	return hunks[0]?.status ?? "modified";
}

/**
 * Combines all diffs for a file into a single string.
 */
function combineDiffs(hunks: Array<Hunk>): string {
	return hunks.map(h => h.diff).join("\n\n");
}

/**
 * Extracts changes relevant to the matched file evidence.
 *
 * @param report - The full impact report
 * @param evidence - The evidence entries for the matched article
 * @returns Array of change contexts for files that match the evidence
 */
export function extractRelevantChanges(
	report: ImpactReport,
	evidence: ReadonlyArray<FileMatchEvidence>,
): Array<ChangeContext> {
	const relevantPaths = getEvidenceFileRefs(evidence);
	const changes: Array<ChangeContext> = [];
	const processedPaths = new Set<string>();

	for (const ref of relevantPaths) {
		const key = `${ref.source}\u0000${ref.filePath}`;
		if (processedPaths.has(key)) {
			continue;
		}
		processedPaths.add(key);

		const hunks = collectHunksForFile(report, ref.filePath, ref.source);
		if (hunks.length === 0) {
			// File may have been matched but no hunks found (e.g., binary file)
			// Include it with empty diff
			changes.push({
				path: ref.filePath,
				status: "modified",
				diff: "",
			});
		} else {
			changes.push({
				path: ref.filePath,
				status: getFileStatus(hunks),
				diff: combineDiffs(hunks),
			});
		}
	}

	// Sort by path for consistent ordering
	changes.sort((a, b) => a.path.localeCompare(b.path));

	return changes;
}

/**
 * Extracts commit information from an ImpactReport.
 */
export function extractCommits(report: ImpactReport): Array<CommitContext> {
	return report.commits.map(commit => ({
		sha: commit.sha,
		message: commit.message,
	}));
}

/**
 * Converts FileMatchEvidence to EvidenceContext.
 */
export function convertEvidence(evidence: ReadonlyArray<FileMatchEvidence>): Array<EvidenceContext> {
	return evidence.map(e => ({
		changedFile: e.changedFile,
		pattern: e.pattern,
		matchType: e.matchType,
		source: e.source,
	}));
}

/**
 * Builds the complete ImpactContext for an article.
 *
 * @param article - The matched article information
 * @param report - The full impact report with all changes
 * @returns Complete context for the impact agent
 */
export function buildImpactContext(article: FileMatch, report: ImpactReport): ImpactContext {
	return {
		article: {
			path: article.docPath,
			jrn: article.docId,
		},
		changes: extractRelevantChanges(report, article.matches),
		commits: extractCommits(report),
		evidence: convertEvidence(article.matches),
	};
}

/**
 * Determines if the context is from article-to-article propagation (Phase 2).
 * Phase 2 contexts have no git commits - only article changes.
 *
 * @param context - The impact context
 * @returns True if this is a Phase 2 (article-to-article) context
 */
export function isArticlePropagation(context: ImpactContext): boolean {
	return context.commits.length === 0;
}

/**
 * Formats the changes as a message string for the agent's first message.
 * This provides the full diffs in a readable format.
 *
 * @param context - The impact context
 * @returns Formatted string with all diffs
 */
export function formatDiffsForMessage(context: ImpactContext): string {
	const isArticleChange = isArticlePropagation(context);
	const noChangesMessage = isArticleChange ? "No article changes to display." : "No code changes to display.";

	if (context.changes.length === 0) {
		return noChangesMessage;
	}

	const parts: Array<string> = [];

	for (const change of context.changes) {
		parts.push(`### ${change.path} (${change.status})`);
		if (change.diff) {
			parts.push("```diff");
			parts.push(change.diff);
			parts.push("```");
		} else {
			parts.push("(No diff available)");
		}
		parts.push("");
	}

	return parts.join("\n");
}

/**
 * Creates the initial message content for the impact agent.
 * This includes formatted diffs and context about what to analyze.
 * The message is adapted based on whether this is Phase 1 (code changes)
 * or Phase 2 (article-to-article propagation).
 *
 * @param context - The impact context
 * @returns The message content to send to the agent
 */
export function buildInitialMessage(context: ImpactContext): string {
	const diffs = formatDiffsForMessage(context);
	const isArticleChange = isArticlePropagation(context);

	// Use different terminology for article vs code changes
	const changeType = isArticleChange ? "article" : "code";
	const changesHeader = isArticleChange ? "Source Article Changes" : "Code Changes";
	const analyzeInstruction = isArticleChange
		? "Analyze how these article changes might affect this documentation (e.g., updated terminology, changed examples, modified API descriptions)"
		: "Analyze how these code changes might affect the documentation";

	return `Please analyze the following ${changeType} changes and update the article at \`${context.article.path}\` if needed.

## ${changesHeader}

${diffs}

## Instructions

1. Read the article at \`${context.article.path}\`
2. ${analyzeInstruction}
3. Use the \`edit_article\` tool to make targeted changes. Do NOT use \`write_file\`.
4. Explain your reasoning

## Making Changes with edit_article

For each edit, provide:
- \`old_string\`: The exact text to replace (copy from the file exactly, including enough context to be UNIQUE)
- \`new_string\`: The new text
- \`reason\`: Brief explanation linking the change to the source diff

IMPORTANT: The old_string MUST be unique in the file. If your text might appear multiple times, include surrounding context (like a heading or preceding paragraph) to make it unique.

Example:
- Source change: Added \`timeout\` parameter to \`fetchData()\`
- Good old_string: "## API Reference\\n\\nThe fetchData function accepts a URL parameter."
- Bad old_string: "The fetchData function" (too short, might match elsewhere)

Guidelines:
- Make minimal, focused edits
- Include enough context in old_string for uniqueness (err on the side of more context)
- Preserve formatting exactly (whitespace, newlines matter)
- One logical change per edit entry

If the changes don't affect the documentation, explain why no update is needed (and don't call edit_article).`;
}

/**
 * Builds an ImpactContext for Phase 2 (article-to-article) propagation.
 * Unlike Phase 1, there are no git commits - only article changes.
 *
 * @param articlePath - Path to the article being updated
 * @param articleJrn - JRN of the article being updated
 * @param triggeringArticles - Articles that triggered this update
 * @param evidence - Evidence of why this article was flagged
 * @returns ImpactContext for the agent
 */
export function buildPropagationContext(
	articlePath: string,
	articleJrn: string,
	triggeringArticles: ReadonlyArray<{ path: string; jrn: string; diff: string | undefined }>,
	evidence: ReadonlyArray<EvidenceContext>,
): ImpactContext {
	return {
		article: {
			path: articlePath,
			jrn: articleJrn,
		},
		changes: triggeringArticles.map(article => ({
			path: article.path,
			status: "modified" as FileStatus,
			diff: article.diff ?? "",
		})),
		commits: [], // No git commits for article-to-article propagation
		evidence,
	};
}
