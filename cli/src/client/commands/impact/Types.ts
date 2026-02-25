/**
 * Impact Analysis Types
 *
 * Types for analyzing git diff output and generating search queries
 * to find related documentation that may need updating.
 */

/**
 * File change status from git diff
 */
export type FileStatus = "added" | "modified" | "deleted" | "renamed";

/**
 * A single diff hunk representing a contiguous set of changes
 */
export interface Hunk {
	/** File path relative to repo root */
	readonly file: string;
	/** Source name for multi-repo impact (e.g. backend/frontend/local) */
	readonly source?: string;
	/** Type of change */
	readonly status: FileStatus;
	/** Nearest function/class/module context (extracted via regex) */
	readonly context: string;
	/** Raw diff lines with +/- prefixes */
	readonly diff: string;
	/** LLM-generated search query for BM25+vector retrieval */
	queryText: string;
}

/**
 * Changes from a single commit
 */
export interface CommitChange {
	/** Short SHA */
	readonly sha: string;
	/** Source name for multi-repo impact (e.g. backend/frontend/local) */
	readonly source?: string;
	/** Commit message (first line) */
	readonly message: string;
	/** Commit author */
	readonly author: string;
	/** LLM-generated summary of what this commit does */
	summary: string;
	/** Individual hunks in this commit */
	readonly hunks: Array<Hunk>;
}

/**
 * Complete impact report for a branch
 */
export interface ImpactReport {
	/** Current branch name */
	readonly branch: string;
	/** Base ref (e.g., "origin/main") */
	readonly base: string;
	/** Per-commit breakdown */
	readonly commits: Array<CommitChange>;
	/** LLM-generated: overall what this branch does */
	summary: string;
	/** LLM-generated: search query for the whole changeset */
	queryText: string;
}

/**
 * Raw parsed file change from git diff --name-status
 */
export interface RawFileChange {
	readonly status: FileStatus;
	readonly file: string;
	readonly source?: string;
	readonly oldFile?: string; // For renames
}

/**
 * Raw parsed hunk from unified diff
 */
export interface RawHunk {
	readonly file: string;
	readonly source?: string;
	readonly oldStart: number;
	readonly oldCount: number;
	readonly newStart: number;
	readonly newCount: number;
	readonly lines: Array<string>;
}

/**
 * Raw commit info from git log
 */
export interface RawCommit {
	readonly sha: string;
	readonly source?: string;
	readonly message: string;
	readonly author: string;
}
