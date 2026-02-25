import type { RunState, ToolDef } from "../../Types";
import {
	gitError,
	gitOk,
	normalizeOptionalString,
	parseBoundedInt,
	parseGitCommandError,
	runGitCommand,
} from "./git_shared";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const git_show_tool_def: ToolDef = {
	name: "git_show",
	description: "Inspect a single commit with optional patch/stat controls.",
	parameters: {
		type: "object",
		properties: {
			repo_path: { type: "string", description: "Optional repository directory." },
			sha: { type: "string", description: "Commit SHA or ref to inspect." },
			path: { type: "string", description: "Optional path filter inside repository." },
			patch: { type: "boolean", description: "Include patch output (default: true)." },
			stat: { type: "boolean", description: "Include stat output (default: true)." },
			context_lines: {
				type: "number",
				description: "Unified diff context lines when patch=true (0-20, default 3).",
			},
		},
		required: ["sha"],
	},
};

type GitShowArgs = {
	repo_path?: string;
	sha?: string;
	path?: string;
	patch?: boolean;
	stat?: boolean;
	context_lines?: number;
};

export const gitShowExecutor: ToolExecutor = async (runState, args) => {
	const typed = (args || {}) as GitShowArgs;
	const repoPath = normalizeOptionalString(typed.repo_path);
	const sha = normalizeOptionalString(typed.sha);
	const pathSpec = normalizeOptionalString(typed.path);
	if (!sha) {
		return gitError("git_show", "INVALID_ARGUMENT", "Missing required argument 'sha'.");
	}

	const patch = typed.patch !== false;
	const stat = typed.stat !== false;
	const contextLinesParsed = parseBoundedInt(typed.context_lines, 3, "context_lines", { min: 0, max: 20 });
	if (!contextLinesParsed.ok) {
		return gitError("git_show", "INVALID_ARGUMENT", contextLinesParsed.error);
	}

	const gitArgs = ["show", sha];
	if (!patch) {
		gitArgs.push("--no-patch");
	}
	if (!stat) {
		gitArgs.push("--no-stat");
	}
	if (patch) {
		gitArgs.push(`-U${contextLinesParsed.value}`);
	}
	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(runState, gitArgs, repoPath);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError("git_show", parsedError.code, parsedError.message, parsedError.hint, {
			...(repoPath ? { repo_path: repoPath } : {}),
			sha,
		});
	}

	const output = result.stdout.trimEnd();
	return gitOk("git_show", output.length > 0 ? "Commit details retrieved" : "No output for requested commit view", {
		...(repoPath ? { repo_path: repoPath } : {}),
		sha,
		...(pathSpec ? { path: pathSpec } : {}),
		patch,
		stat,
		context_lines: contextLinesParsed.value,
		content: output,
	});
};
