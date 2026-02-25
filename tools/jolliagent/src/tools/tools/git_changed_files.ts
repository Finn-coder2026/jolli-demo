import type { RunState, ToolDef } from "../../Types";
import {
	type GitChangedFile,
	gitError,
	gitOk,
	normalizeOptionalString,
	parseGitCommandError,
	parseNameStatusLine,
	runGitCommand,
} from "./git_shared";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const git_changed_files_tool_def: ToolDef = {
	name: "git_changed_files",
	description: "List changed files between two refs with status codes (A/M/D/R/C).",
	parameters: {
		type: "object",
		properties: {
			repo_path: { type: "string", description: "Optional repository directory." },
			from_ref: { type: "string", description: "Start ref." },
			to_ref: { type: "string", description: "End ref." },
			path: { type: "string", description: "Optional path filter inside repository." },
		},
		required: ["from_ref", "to_ref"],
	},
};

type GitChangedFilesArgs = {
	repo_path?: string;
	from_ref?: string;
	to_ref?: string;
	path?: string;
};

export const gitChangedFilesExecutor: ToolExecutor = async (runState, args) => {
	const typed = (args || {}) as GitChangedFilesArgs;
	const repoPath = normalizeOptionalString(typed.repo_path);
	const fromRef = normalizeOptionalString(typed.from_ref);
	const toRef = normalizeOptionalString(typed.to_ref);
	const pathSpec = normalizeOptionalString(typed.path);
	if (!fromRef || !toRef) {
		return gitError("git_changed_files", "INVALID_ARGUMENT", "Missing required arguments 'from_ref' and 'to_ref'.");
	}

	const gitArgs = ["diff", "--name-status", `${fromRef}..${toRef}`];
	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(runState, gitArgs, repoPath);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError("git_changed_files", parsedError.code, parsedError.message, parsedError.hint, {
			...(repoPath ? { repo_path: repoPath } : {}),
			from_ref: fromRef,
			to_ref: toRef,
		});
	}

	const files = result.stdout
		.split(/\r?\n/)
		.map(line => parseNameStatusLine(line))
		.filter((entry): entry is GitChangedFile => entry !== null);

	return gitOk("git_changed_files", `Found ${files.length} changed file(s)`, {
		...(repoPath ? { repo_path: repoPath } : {}),
		from_ref: fromRef,
		to_ref: toRef,
		...(pathSpec ? { path: pathSpec } : {}),
		files,
	});
};
