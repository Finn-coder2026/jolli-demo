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

export const git_history_tool_def: ToolDef = {
	name: "git_history",
	description: "Browse commit history with pagination and optional file change details.",
	parameters: {
		type: "object",
		properties: {
			repo_path: { type: "string", description: "Optional repository directory." },
			ref: { type: "string", description: "Starting ref (default: HEAD)." },
			skip: { type: "number", description: "Commit offset from newest commit (default: 0)." },
			limit: { type: "number", description: "Maximum commits to return (1-200, default: 10)." },
			path: { type: "string", description: "Optional path filter inside repository." },
			with_files: { type: "boolean", description: "Include changed files for each commit (default: true)." },
		},
		required: [],
	},
};

type GitHistoryArgs = {
	repo_path?: string;
	ref?: string;
	skip?: number;
	limit?: number;
	path?: string;
	with_files?: boolean;
};

export const gitHistoryExecutor: ToolExecutor = async (runState, args) => {
	const typed = (args || {}) as GitHistoryArgs;
	const repoPath = normalizeOptionalString(typed.repo_path);
	const ref = normalizeOptionalString(typed.ref) || "HEAD";
	const pathSpec = normalizeOptionalString(typed.path);
	const withFiles = typed.with_files !== false;

	const skipParsed = parseBoundedInt(typed.skip, 0, "skip", { min: 0, max: 100_000 });
	if (!skipParsed.ok) {
		return gitError("git_history", "INVALID_ARGUMENT", skipParsed.error);
	}

	const limitParsed = parseBoundedInt(typed.limit, 10, "limit", { min: 1, max: 200 });
	if (!limitParsed.ok) {
		return gitError("git_history", "INVALID_ARGUMENT", limitParsed.error);
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
		return gitError("git_history", parsedError.code, parsedError.message, parsedError.hint, {
			...(repoPath ? { repo_path: repoPath } : {}),
			ref,
			skip: skipParsed.value,
			limit,
		});
	}

	const commits = parseGitHistoryOutput(result.stdout, withFiles);
	const hasMore = commits.length > limit;
	const visibleCommits = hasMore ? commits.slice(0, limit) : commits;

	return gitOk("git_history", `Retrieved ${visibleCommits.length} commit(s)`, {
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
