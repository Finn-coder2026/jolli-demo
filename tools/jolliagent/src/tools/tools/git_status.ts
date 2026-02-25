import type { RunState, ToolDef } from "../../Types";
import {
	gitError,
	gitOk,
	normalizeOptionalString,
	parseGitCommandError,
	parseGitStatusPorcelain,
	runGitCommand,
} from "./git_shared";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const git_status_tool_def: ToolDef = {
	name: "git_status",
	description: "Inspect working tree state (branch + changed files). Returns structured JSON output.",
	parameters: {
		type: "object",
		properties: {
			repo_path: { type: "string", description: "Optional repository directory." },
			path: { type: "string", description: "Optional path filter inside repository." },
		},
		required: [],
	},
};

type GitStatusArgs = {
	repo_path?: string;
	path?: string;
};

export const gitStatusExecutor: ToolExecutor = async (runState, args) => {
	const typed = (args || {}) as GitStatusArgs;
	const repoPath = normalizeOptionalString(typed.repo_path);
	const pathSpec = normalizeOptionalString(typed.path);

	const gitArgs = ["status", "--porcelain=v1", "--branch"];
	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(runState, gitArgs, repoPath);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError("git_status", parsedError.code, parsedError.message, parsedError.hint, {
			...(repoPath ? { repo_path: repoPath } : {}),
		});
	}

	const parsed = parseGitStatusPorcelain(result.stdout);
	if (parsed.files.length === 0) {
		return gitOk("git_status", "Working tree clean", {
			...(repoPath ? { repo_path: repoPath } : {}),
			branch: parsed.branch,
			files: [],
		});
	}

	return gitOk("git_status", `Found ${parsed.files.length} changed file(s)`, {
		...(repoPath ? { repo_path: repoPath } : {}),
		branch: parsed.branch,
		files: parsed.files,
	});
};
