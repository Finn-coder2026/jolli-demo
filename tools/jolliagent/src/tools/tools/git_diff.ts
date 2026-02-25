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

export const git_diff_tool_def: ToolDef = {
	name: "git_diff",
	description:
		"Show git diff for working tree, staged changes, or a ref range. Returns structured JSON output with diff text.",
	parameters: {
		type: "object",
		properties: {
			repo_path: { type: "string", description: "Optional repository directory." },
			from_ref: { type: "string", description: "Start ref for diff mode (default: HEAD when to_ref is set)." },
			to_ref: { type: "string", description: "End ref for range diff mode." },
			staged: { type: "boolean", description: "Use staged diff mode (cannot be combined with refs)." },
			path: { type: "string", description: "Optional path filter inside repository." },
			name_only: { type: "boolean", description: "Return only file names changed." },
			stat: { type: "boolean", description: "Return diff stat summary." },
			context_lines: { type: "number", description: "Unified diff context lines (0-20, default 3)." },
			max_bytes: { type: "number", description: "Soft truncation cap for returned diff text (1024-2000000)." },
		},
		required: [],
	},
};

type GitDiffArgs = {
	repo_path?: string;
	from_ref?: string;
	to_ref?: string;
	staged?: boolean;
	path?: string;
	name_only?: boolean;
	stat?: boolean;
	context_lines?: number;
	max_bytes?: number;
};

/**
 * Build metadata object for diff responses, filtering out undefined optional fields.
 */
function buildDiffMeta(params: {
	repoPath: string | undefined;
	mode: string;
	fromRef: string | undefined;
	toRef: string | undefined;
	pathSpec?: string | undefined;
}): Record<string, string> {
	const meta: Record<string, string> = {};
	if (params.repoPath) {
		meta.repo_path = params.repoPath;
	}
	meta.mode = params.mode;
	if (params.fromRef) {
		meta.from_ref = params.fromRef;
	}
	if (params.toRef) {
		meta.to_ref = params.toRef;
	}
	if (params.pathSpec) {
		meta.path = params.pathSpec;
	}
	return meta;
}

/**
 * Determine diff mode and append the appropriate ref arguments to gitArgs.
 */
function resolveDiffMode(
	gitArgs: Array<string>,
	staged: boolean,
	fromRef?: string,
	toRef?: string,
): "working_tree" | "staged" | "range" {
	if (staged) {
		gitArgs.push("--staged");
		return "staged";
	}
	if (fromRef || toRef) {
		const normalizedFrom = fromRef ?? "HEAD";
		gitArgs.push(toRef ? `${normalizedFrom}..${toRef}` : normalizedFrom);
		return "range";
	}
	return "working_tree";
}

export const gitDiffExecutor: ToolExecutor = async (runState, args) => {
	const typed = (args || {}) as GitDiffArgs;
	const repoPath = normalizeOptionalString(typed.repo_path);
	const fromRef = normalizeOptionalString(typed.from_ref);
	const toRef = normalizeOptionalString(typed.to_ref);
	const pathSpec = normalizeOptionalString(typed.path);
	const staged = typed.staged === true;
	const nameOnly = typed.name_only === true;
	const stat = typed.stat === true;

	if (staged && (fromRef || toRef)) {
		return gitError("git_diff", "INVALID_ARGUMENT", "Use either 'staged' or ref range arguments, not both.");
	}

	const contextLinesParsed = parseBoundedInt(typed.context_lines, 3, "context_lines", { min: 0, max: 20 });
	if (!contextLinesParsed.ok) {
		return gitError("git_diff", "INVALID_ARGUMENT", contextLinesParsed.error);
	}

	const maxBytesParsed = parseBoundedInt(typed.max_bytes, 250_000, "max_bytes", { min: 1_024, max: 2_000_000 });
	if (!maxBytesParsed.ok) {
		return gitError("git_diff", "INVALID_ARGUMENT", maxBytesParsed.error);
	}

	const gitArgs: Array<string> = ["diff"];
	if (nameOnly) {
		gitArgs.push("--name-only");
	}
	if (stat) {
		gitArgs.push("--stat");
	}
	gitArgs.push(`-U${contextLinesParsed.value}`);

	const mode = resolveDiffMode(gitArgs, staged, fromRef, toRef);

	if (pathSpec) {
		gitArgs.push("--", pathSpec);
	}

	const result = await runGitCommand(runState, gitArgs, repoPath);
	const parsedError = parseGitCommandError(result.stderr, result.exitCode);
	if (parsedError) {
		return gitError(
			"git_diff",
			parsedError.code,
			parsedError.message,
			parsedError.hint,
			buildDiffMeta({ repoPath, mode, fromRef, toRef }),
		);
	}

	let content = result.stdout;
	let truncated = false;
	if (content.length > maxBytesParsed.value) {
		content = content.slice(0, maxBytesParsed.value);
		truncated = true;
	}

	const meta = buildDiffMeta({ repoPath, mode, fromRef, toRef, pathSpec });
	const resultMeta = { ...meta, name_only: nameOnly, stat, context_lines: contextLinesParsed.value, truncated };

	if (content.trim().length === 0) {
		return gitOk("git_diff", "No differences found", { ...resultMeta, content: "" });
	}

	return gitOk("git_diff", "Diff retrieved", { ...resultMeta, content });
};
