import type { RunState, ToolDef } from "../../Types";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Sandbox } from "e2b";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_RESULTS = 100;
const MAX_MAX_RESULTS = 2000;

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const grep_tool_def: ToolDef = {
	name: "grep",
	description:
		"Search file contents for a regex pattern and return matching lines with line numbers. Uses ripgrep when available.",
	parameters: {
		type: "object",
		properties: {
			pattern: { type: "string", description: "Regex pattern to search for." },
			path: { type: "string", description: "File or directory path to search. Defaults to '.'." },
			ignore_case: { type: "boolean", description: "Case-insensitive search when true." },
			max_results: {
				type: "integer",
				description: `Maximum number of matches to return (1-${MAX_MAX_RESULTS}). Defaults to ${DEFAULT_MAX_RESULTS}.`,
			},
		},
		required: ["pattern"],
	},
};

type GrepArgs = {
	pattern?: string;
	path?: string;
	ignore_case?: boolean;
	max_results?: number;
};

function normalizeMaxResults(raw?: number): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) {
		return DEFAULT_MAX_RESULTS;
	}
	return Math.min(Math.floor(n), MAX_MAX_RESULTS);
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function executeLocalWithRg(
	pattern: string,
	path: string,
	ignoreCase: boolean,
	maxResults: number,
): Promise<string> {
	const args: Array<string> = ["--line-number", "--no-heading", "--color", "never", "-m", String(maxResults)];
	if (ignoreCase) {
		args.push("-i");
	}
	args.push(pattern, path);

	try {
		const { stdout } = await execFileAsync("rg", args, { maxBuffer: 10 * 1024 * 1024 });
		const output = stdout.trim();
		return output || "No matches found";
	} catch (error) {
		const err = error as { code?: number | string; stdout?: string; message?: string };
		// rg exit code 1 means no matches
		if (err.code === 1) {
			return "No matches found";
		}
		// ENOENT means rg is not installed; caller should fall back
		if (err.code === "ENOENT") {
			throw error;
		}
		const out = (err.stdout || "").trim();
		if (out && err.code === 1) {
			return out;
		}
		return `Error running grep: ${err.message ?? String(error)}`;
	}
}

async function executeLocalWithGrep(
	pattern: string,
	path: string,
	ignoreCase: boolean,
	maxResults: number,
): Promise<string> {
	const args: Array<string> = ["-R", "-n", "-m", String(maxResults)];
	if (ignoreCase) {
		args.push("-i");
	}
	args.push(pattern, path);

	try {
		const { stdout } = await execFileAsync("grep", args, { maxBuffer: 10 * 1024 * 1024 });
		const output = stdout.trim();
		return output || "No matches found";
	} catch (error) {
		const err = error as { code?: number | string; message?: string };
		if (err.code === 1) {
			return "No matches found";
		}
		return `Error running grep: ${err.message ?? String(error)}`;
	}
}

export async function executeGrepToolLocal(
	pattern: string,
	path = ".",
	ignoreCase = false,
	maxResults = DEFAULT_MAX_RESULTS,
): Promise<string> {
	try {
		return await executeLocalWithRg(pattern, path, ignoreCase, maxResults);
	} catch (error) {
		const err = error as { code?: number | string };
		if (err.code === "ENOENT") {
			return await executeLocalWithGrep(pattern, path, ignoreCase, maxResults);
		}
		return `Error running grep: ${(error as Error).message}`;
	}
}

export async function executeGrepToolE2B(
	runState: RunState,
	pattern: string,
	path = ".",
	ignoreCase = false,
	maxResults = DEFAULT_MAX_RESULTS,
): Promise<string> {
	const sandbox = runState.e2bsandbox as Sandbox;
	if (!sandbox) {
		return "Error: E2B sandbox not initialized. Make sure to run with --e2b flag.";
	}

	const icaseFlag = ignoreCase ? " -i" : "";
	const rgCmd = `rg --line-number --no-heading --color never -m ${maxResults}${icaseFlag} ${shellQuote(pattern)} ${shellQuote(
		path,
	)}`;

	try {
		const proc = await sandbox.commands.run(rgCmd, { timeoutMs: 60_000 });
		const stdout = (proc.stdout || "").trim();
		const stderr = (proc.stderr || "").trim();

		if (proc.error) {
			return `Error running grep: ${proc.error}`;
		}
		if (proc.exitCode === 0) {
			return stdout || "No matches found";
		}
		if (proc.exitCode === 1) {
			return "No matches found";
		}
		if (stderr.includes("command not found") || stderr.includes("not found")) {
			const grepCmd = `grep -R -n -m ${maxResults}${icaseFlag} ${shellQuote(pattern)} ${shellQuote(path)}`;
			const fallback = await sandbox.commands.run(grepCmd, { timeoutMs: 60_000 });
			const fallbackOut = (fallback.stdout || "").trim();
			if (fallback.exitCode === 0) {
				return fallbackOut || "No matches found";
			}
			if (fallback.exitCode === 1) {
				return "No matches found";
			}
			return `Error running grep: ${(fallback.stderr || "").trim() || "grep fallback failed"}`;
		}
		return `Error running grep: ${stderr || "search failed"}`;
	} catch (error) {
		const err = error as { message?: string };
		return `Error running grep: ${err.message ?? String(error)}`;
	}
}

export const grepExecutor: ToolExecutor = async (runState, args) => {
	const parsed = (args || {}) as GrepArgs;
	const pattern = parsed.pattern?.trim();
	if (!pattern) {
		return "Error: Missing required parameter 'pattern' for grep.";
	}
	const path = parsed.path?.trim() || ".";
	const ignoreCase = parsed.ignore_case === true;
	const maxResults = normalizeMaxResults(parsed.max_results);

	if (runState.e2bsandbox) {
		return await executeGrepToolE2B(runState, pattern, path, ignoreCase, maxResults);
	}
	return await executeGrepToolLocal(pattern, path, ignoreCase, maxResults);
};
