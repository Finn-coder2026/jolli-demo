import type { RunState, ToolDef } from "../../Types";
import {
	gitError,
	gitOk,
	normalizeOptionalString,
	parseBoundedInt,
	parseGitCommandError,
	parseGitHistoryOutput,
	runGitCommand,
} from "./git_shared";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const git_log_tool_def: ToolDef = {
	name: "git_log",
	description: "Alias for git history with concise defaults (compatible with existing count/oneline usage).",
	parameters: {
		type: "object",
		properties: {
			repo_path: { type: "string", description: "Optional repository directory." },
			ref: { type: "string", description: "Starting ref (default: HEAD)." },
			skip: { type: "number", description: "Commit offset from newest commit (default: 0)." },
			limit: { type: "number", description: "Maximum commits to return (1-200, default: 10)." },
			count: { type: "number", description: "Backward-compatible alias for limit." },
			oneline: { type: "boolean", description: "Legacy compatibility flag. Defaults to true." },
			path: { type: "string", description: "Optional path filter inside repository." },
			with_files: { type: "boolean", description: "Include changed files for each commit." },
		},
		required: [],
	},
};

type GitLogArgs = {
	repo_path?: string;
	ref?: string;
	skip?: number;
	limit?: number;
	count?: number;
	oneline?: boolean;
	path?: string;
	with_files?: boolean;
};

export const gitLogExecutor: ToolExecutor = async (runState, args) => {
	const typed = (args || {}) as GitLogArgs;
	const repoPath = normalizeOptionalString(typed.repo_path);
	const ref = normalizeOptionalString(typed.ref) || "HEAD";
	const pathSpec = normalizeOptionalString(typed.path);
	const oneline = typed.oneline !== false;
	const withFiles = typeof typed.with_files === "boolean" ? typed.with_files : !oneline;

	const skipParsed = parseBoundedInt(typed.skip, 0, "skip", { min: 0, max: 100_000 });
	if (!skipParsed.ok) {
		return gitError("git_log", "INVALID_ARGUMENT", skipParsed.error);
	}

	const limitInput = typed.limit ?? typed.count;
	const limitParsed = parseBoundedInt(limitInput, 10, "limit", { min: 1, max: 200 });
	if (!limitParsed.ok) {
		return gitError("git_log", "INVALID_ARGUMENT", limitParsed.error);
	}

	const limit = limitParsed.value;
	const gitArgs = [
		"log",
		ref,
		`--skip=${skipParsed.value}`,
		`--max-count=${limit + 1}`,
		"--date=iso-strict",
		"--pretty=format:%H%x00%s%x00%ai%x00%an",
	];
	if (withFiles) {
		gitArgs.push("--name-status");
	}
	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(runState, gitArgs, repoPath);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError("git_log", parsedError.code, parsedError.message, parsedError.hint, {
			...(repoPath ? { repo_path: repoPath } : {}),
			ref,
			skip: skipParsed.value,
			limit,
		});
	}

	const commits = parseGitHistoryOutput(result.stdout, withFiles);
	const hasMore = commits.length > limit;
	const visibleCommits = hasMore ? commits.slice(0, limit) : commits;

	return gitOk("git_log", `Retrieved ${visibleCommits.length} commit(s)`, {
		...(repoPath ? { repo_path: repoPath } : {}),
		ref,
		skip: skipParsed.value,
		limit,
		has_more: hasMore,
		next_skip: hasMore ? skipParsed.value + limit : null,
		with_files: withFiles,
		commits: visibleCommits,
	});
};
