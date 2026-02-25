/**
 * Git Diff Parser
 *
 * Parses git diff output into structured data for impact analysis.
 * Uses only git commands - no external dependencies.
 */

import type { CommitChange, FileStatus, Hunk, ImpactReport, RawCommit, RawFileChange, RawHunk } from "./Types";

// =============================================================================
// SECTION: Git Command Execution
// =============================================================================

/**
 * Executes a git command and returns stdout.
 */
async function execGit(args: Array<string>, cwd?: string): Promise<string> {
	const proc = Bun.spawn(["git", ...args], {
		cwd: cwd ?? process.cwd(),
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		throw new Error(`git ${args[0]} failed: ${stderr.trim()}`);
	}

	return stdout;
}

async function gitRefExists(ref: string, cwd?: string): Promise<boolean> {
	const proc = Bun.spawn(["git", "rev-parse", "--verify", "--quiet", ref], {
		cwd: cwd ?? process.cwd(),
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	return exitCode === 0;
}

/**
 * Gets the current branch name.
 */
export async function getCurrentBranch(cwd?: string): Promise<string> {
	const output = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
	return output.trim();
}

/**
 * Gets the default branch from origin (usually main or master).
 */
export async function getDefaultBranch(cwd?: string): Promise<string> {
	// Use symbolic-ref which is fast and doesn't require network
	const output = await execGit(["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], cwd);
	// Returns "origin/main" or "origin/master", extract just the branch name
	return output.trim().replace("origin/", "");
}

/**
 * Resolves a base ref in a repo-friendly way:
 * - If omitted, defaults to origin/<default branch>
 * - If provided and valid as-is, keeps it
 * - Otherwise tries origin/<provided>
 */
export async function resolveBaseRef(base?: string, cwd?: string): Promise<string> {
	if (!base || base.trim().length === 0) {
		return `origin/${await getDefaultBranch(cwd)}`;
	}

	const provided = base.trim();
	if (await gitRefExists(provided, cwd)) {
		return provided;
	}

	if (!provided.startsWith("origin/")) {
		const remoteCandidate = `origin/${provided}`;
		if (await gitRefExists(remoteCandidate, cwd)) {
			return remoteCandidate;
		}
	}

	throw new Error(
		`Unable to resolve base ref "${provided}". Tried "${provided}"${provided.startsWith("origin/") ? "" : ` and "origin/${provided}"`}.`,
	);
}

/**
 * Gets the merge base between two refs.
 */
export async function getMergeBase(ref1: string, ref2: string, cwd?: string): Promise<string> {
	const output = await execGit(["merge-base", ref1, ref2], cwd);
	return output.trim();
}

/**
 * Gets commits between two refs.
 */
export async function getCommitsBetween(base: string, head: string, cwd?: string): Promise<Array<RawCommit>> {
	const output = await execGit(["log", "--format=%H|%an|%s", `${base}..${head}`], cwd);

	if (!output.trim()) {
		return [];
	}

	return output
		.trim()
		.split("\n")
		.map(line => {
			const [sha, author, ...messageParts] = line.split("|");
			return {
				sha: sha.slice(0, 7), // Short SHA
				author,
				message: messageParts.join("|"), // Handle | in commit messages
			};
		});
}

/**
 * Gets file changes for a specific commit.
 */
export async function getFileChangesForCommit(sha: string, cwd?: string): Promise<Array<RawFileChange>> {
	const output = await execGit(["diff-tree", "--no-commit-id", "--name-status", "-r", sha], cwd);

	if (!output.trim()) {
		return [];
	}

	return output
		.trim()
		.split("\n")
		.map(line => parseFileStatusLine(line));
}

/**
 * Gets the unified diff for a specific commit.
 */
export function getDiffForCommit(sha: string, contextLines = 5, cwd?: string): Promise<string> {
	return execGit(["show", sha, `--format=`, `-U${contextLines}`], cwd);
}

/**
 * Gets the unified diff between two refs.
 */
export function getDiffBetween(base: string, head: string, contextLines = 5, cwd?: string): Promise<string> {
	return execGit(["diff", `${base}...${head}`, `-U${contextLines}`], cwd);
}

/**
 * Gets file status changes between two refs.
 */
export async function getFileChangesBetween(base: string, head: string, cwd?: string): Promise<Array<RawFileChange>> {
	const output = await execGit(["diff", "--name-status", `${base}...${head}`], cwd);

	if (!output.trim()) {
		return [];
	}

	return output
		.trim()
		.split("\n")
		.map(line => parseFileStatusLine(line));
}

/**
 * Gets uncommitted changes (staged + unstaged).
 */
export function getUncommittedDiff(contextLines = 5, cwd?: string): Promise<string> {
	return execGit(["diff", "HEAD", `-U${contextLines}`], cwd);
}

/**
 * Gets file status for uncommitted changes.
 */
export async function getUncommittedFileChanges(cwd?: string): Promise<Array<RawFileChange>> {
	const output = await execGit(["diff", "HEAD", "--name-status"], cwd);

	if (!output.trim()) {
		return [];
	}

	return output
		.trim()
		.split("\n")
		.map(line => parseFileStatusLine(line));
}

// =============================================================================
// SECTION: Diff Parsing
// =============================================================================

/**
 * Parses a file status line from git diff --name-status.
 */
function parseFileStatusLine(line: string): RawFileChange {
	const parts = line.split("\t");
	const statusChar = parts[0][0];

	const statusMap: Record<string, FileStatus> = {
		A: "added",
		M: "modified",
		D: "deleted",
		R: "renamed",
	};

	const status = statusMap[statusChar] ?? "modified";

	if (status === "renamed" && parts.length >= 3) {
		return { status, file: parts[2], oldFile: parts[1] };
	}

	return { status, file: parts[1] };
}

/**
 * Parses unified diff output into raw hunks.
 */
export function parseUnifiedDiff(diffOutput: string): Array<RawHunk> {
	const hunks: Array<RawHunk> = [];
	const lines = diffOutput.split("\n");

	let currentFile: string | null = null;
	let currentHunk: RawHunk | null = null;

	for (const line of lines) {
		// New file header: diff --git a/path b/path
		if (line.startsWith("diff --git")) {
			// Save previous hunk
			if (currentHunk) {
				hunks.push(currentHunk);
				currentHunk = null;
			}

			// Extract file path from "diff --git a/path b/path"
			const match = line.match(/diff --git a\/.+ b\/(.+)/);
			currentFile = match ? match[1] : null;
			continue;
		}

		// Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
		if (line.startsWith("@@") && currentFile) {
			// Save previous hunk
			if (currentHunk) {
				hunks.push(currentHunk);
			}

			const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
			if (match) {
				currentHunk = {
					file: currentFile,
					oldStart: Number.parseInt(match[1], 10),
					oldCount: Number.parseInt(match[2] ?? "1", 10),
					newStart: Number.parseInt(match[3], 10),
					newCount: Number.parseInt(match[4] ?? "1", 10),
					lines: [],
				};
			}
			continue;
		}

		// Diff content lines
		if (currentHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
			currentHunk.lines.push(line);
		}
	}

	// Save last hunk
	if (currentHunk) {
		hunks.push(currentHunk);
	}

	return hunks;
}

// =============================================================================
// SECTION: Context Extraction
// =============================================================================

/**
 * Language-agnostic patterns for finding function/class context.
 * Matches the nearest definition above a change.
 */
const CONTEXT_PATTERNS = [
	// TypeScript/JavaScript
	/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
	/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
	/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/,
	/^\s*(?:export\s+)?class\s+(\w+)/,
	// Python
	/^\s*def\s+(\w+)\s*\(/,
	/^\s*async\s+def\s+(\w+)\s*\(/,
	/^\s*class\s+(\w+)/,
	// Go - method with receiver must come before standalone func
	/^\s*func\s+\([^)]+\)\s+(\w+)\s*\(/,
	/^\s*func\s+(\w+)\s*\(/,
	/^\s*type\s+(\w+)\s+(?:struct|interface)/,
	// Rust
	/^\s*(?:pub\s+)?fn\s+(\w+)/,
	/^\s*(?:pub\s+)?struct\s+(\w+)/,
	/^\s*(?:pub\s+)?enum\s+(\w+)/,
	/^\s*impl(?:<[^>]+>)?\s+(\w+)/,
	// Java/C# - class/interface first, then methods
	/^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum)\s+(\w+)/,
	/^\s*(?:public|private|protected)\s+(?:static\s+)?(?:\S+\s+)+(\w+)\s*\([^)]*\)\s*(?:throws\s|{)/,
];

/**
 * Extracts the nearest function/class context from diff lines.
 * Looks at context lines (starting with space) above changes.
 */
export function extractContext(lines: Array<string>): string {
	// Look at context lines (space-prefixed) for definitions
	for (const line of lines) {
		// Skip lines without valid diff prefix
		if (!line.startsWith(" ") && !line.startsWith("+") && !line.startsWith("-")) {
			continue;
		}

		const content = line.slice(1); // Remove prefix

		for (const pattern of CONTEXT_PATTERNS) {
			const match = content.match(pattern);
			if (match?.[1]) {
				return match[1];
			}
		}
	}

	return "";
}

// =============================================================================
// SECTION: Impact Report Generation
// =============================================================================

/**
 * Converts raw hunks to structured Hunk objects with context extraction.
 */
function rawHunksToHunks(rawHunks: Array<RawHunk>, fileChanges: Array<RawFileChange>): Array<Hunk> {
	const fileStatusMap = new Map<string, FileStatus>();
	for (const fc of fileChanges) {
		fileStatusMap.set(fc.file, fc.status);
	}

	return rawHunks.map(raw => ({
		file: raw.file,
		status: fileStatusMap.get(raw.file) ?? "modified",
		context: extractContext(raw.lines),
		diff: raw.lines.join("\n"),
		queryText: "", // To be filled by LLM
	}));
}

/**
 * Generates an impact report for the current branch vs base.
 * If no base is provided, auto-detects the default branch (main/master).
 */
export async function generateImpactReport(base?: string, cwd?: string): Promise<ImpactReport> {
	const branch = await getCurrentBranch(cwd);

	const defaultBranch = await resolveBaseRef(base, cwd);
	const commits = await getCommitsBetween(defaultBranch, "HEAD", cwd);

	const commitChanges: Array<CommitChange> = [];

	for (const commit of commits) {
		const fileChanges = await getFileChangesForCommit(commit.sha, cwd);
		const diffOutput = await getDiffForCommit(commit.sha, 5, cwd);
		const rawHunks = parseUnifiedDiff(diffOutput);
		const hunks = rawHunksToHunks(rawHunks, fileChanges);

		commitChanges.push({
			sha: commit.sha,
			message: commit.message,
			author: commit.author,
			summary: "", // To be filled by LLM
			hunks,
		});
	}

	return {
		branch,
		base: defaultBranch,
		commits: commitChanges,
		summary: "", // To be filled by LLM
		queryText: "", // To be filled by LLM
	};
}

/**
 * Generates an impact report for uncommitted changes only.
 */
export async function generateUncommittedReport(cwd?: string): Promise<ImpactReport> {
	const branch = await getCurrentBranch(cwd);
	const fileChanges = await getUncommittedFileChanges(cwd);
	const diffOutput = await getUncommittedDiff(5, cwd);
	const rawHunks = parseUnifiedDiff(diffOutput);
	const hunks = rawHunksToHunks(rawHunks, fileChanges);

	// Uncommitted changes are represented as a single "commit"
	const commitChanges: Array<CommitChange> = hunks.length > 0
		? [{
				sha: "(uncommitted)",
				message: "Uncommitted changes",
				author: "",
				summary: "",
				hunks,
			}]
		: [];

	return {
		branch,
		base: "HEAD",
		commits: commitChanges,
		summary: "",
		queryText: "",
	};
}

/**
 * Gets a simple summary of changes for display.
 */
export function getChangeSummary(report: ImpactReport): string {
	const totalCommits = report.commits.length;
	const totalHunks = report.commits.reduce((sum, c) => sum + c.hunks.length, 0);
	const filesChanged = new Set(report.commits.flatMap(c => c.hunks.map(h => h.file))).size;

	return `${totalCommits} commit(s), ${filesChanged} file(s), ${totalHunks} hunk(s)`;
}
