import type { RunState } from "../../Types";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Sandbox } from "e2b";

const execFileAsync = promisify(execFile);
const MAX_GIT_BUFFER_BYTES = 10 * 1024 * 1024;

export interface GitToolPayload {
	readonly tool: string;
	readonly ok: boolean;
	readonly summary: string;
	readonly data?: unknown;
	readonly error?: {
		readonly code: string;
		readonly message: string;
		readonly hint?: string;
	};
}

export interface GitCommandResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

export interface GitChangedFile {
	readonly status: string;
	readonly raw_status: string;
	readonly path: string;
	readonly old_path?: string;
}

export interface GitHistoryCommit {
	readonly sha: string;
	readonly subject: string;
	readonly date: string;
	readonly author: string;
	readonly files?: ReadonlyArray<GitChangedFile>;
}

export function gitOk(tool: string, summary: string, data?: unknown): string {
	return JSON.stringify(
		{
			tool,
			ok: true,
			summary,
			...(data !== undefined ? { data } : {}),
		} as GitToolPayload,
		null,
		2,
	);
}

export function gitError(tool: string, code: string, message: string, hint?: string, data?: unknown): string {
	return JSON.stringify(
		{
			tool,
			ok: false,
			summary: message,
			...(data !== undefined ? { data } : {}),
			error: {
				code,
				message,
				...(hint ? { hint } : {}),
			},
		} as GitToolPayload,
		null,
		2,
	);
}

export function normalizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function parseBoundedInt(
	value: unknown,
	defaultValue: number,
	fieldName: string,
	opts: { min: number; max: number },
): { ok: true; value: number } | { ok: false; error: string } {
	if (value === undefined) {
		return { ok: true, value: defaultValue };
	}
	if (typeof value !== "number" || !Number.isInteger(value)) {
		return { ok: false, error: `Invalid '${fieldName}' argument (must be an integer)` };
	}
	if (value < opts.min || value > opts.max) {
		return {
			ok: false,
			error: `Invalid '${fieldName}' argument (must be between ${opts.min} and ${opts.max})`,
		};
	}
	return { ok: true, value };
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runGitLocal(gitArgs: ReadonlyArray<string>, repoPath?: string): Promise<GitCommandResult> {
	const fullArgs = repoPath ? ["-C", repoPath, ...gitArgs] : [...gitArgs];
	try {
		const { stdout, stderr } = await execFileAsync("git", fullArgs, { maxBuffer: MAX_GIT_BUFFER_BYTES });
		return {
			stdout: stdout.trimEnd(),
			stderr: stderr.trim(),
			exitCode: 0,
		};
	} catch (error) {
		const err = error as { stdout?: string; stderr?: string; code?: number | string; message?: string };
		const exitCode = typeof err.code === "number" ? err.code : err.code === "ENOENT" ? 127 : 1;
		return {
			stdout: (err.stdout || "").trimEnd(),
			stderr: (err.stderr || err.message || "").trim(),
			exitCode,
		};
	}
}

async function runGitE2B(
	runState: RunState,
	gitArgs: ReadonlyArray<string>,
	repoPath?: string,
): Promise<GitCommandResult> {
	const sandbox = runState.e2bsandbox as Sandbox;
	if (!sandbox) {
		return {
			stdout: "",
			stderr: "E2B sandbox not initialized",
			exitCode: 1,
		};
	}

	const cmdParts = ["git", ...(repoPath ? ["-C", repoPath] : []), ...gitArgs];
	const cmd = cmdParts.map(shellQuote).join(" ");

	try {
		const proc = await sandbox.commands.run(cmd, { timeoutMs: 60_000 });
		return {
			stdout: (proc.stdout || "").trimEnd(),
			stderr: (proc.stderr || proc.error || "").trim(),
			exitCode: typeof proc.exitCode === "number" ? proc.exitCode : proc.error ? 1 : 0,
		};
	} catch (error) {
		const err = error as { message?: string };
		return {
			stdout: "",
			stderr: err.message || String(error),
			exitCode: 1,
		};
	}
}

export async function runGitCommand(
	runState: RunState,
	gitArgs: ReadonlyArray<string>,
	repoPath?: string,
): Promise<GitCommandResult> {
	if (runState.e2bsandbox) {
		return await runGitE2B(runState, gitArgs, repoPath);
	}
	return await runGitLocal(gitArgs, repoPath);
}

export function parseGitCommandError(
	stderr: string,
	exitCode: number,
): { code: string; message: string; hint?: string } | null {
	if (exitCode === 0) {
		return null;
	}

	const normalized = stderr.toLowerCase();
	if (normalized.includes("not a git repository")) {
		return {
			code: "NOT_GIT_REPOSITORY",
			message: "Not a git repository",
			hint: "Use a valid repository or pass repo_path.",
		};
	}
	if (
		normalized.includes("unknown revision") ||
		normalized.includes("bad revision") ||
		normalized.includes("ambiguous argument")
	) {
		return {
			code: "INVALID_REF",
			message: "Invalid git ref or range",
			hint: "Verify branch names or commit SHAs and retry.",
		};
	}
	if (normalized.includes("pathspec")) {
		return {
			code: "INVALID_PATHSPEC",
			message: "Invalid path for this repository",
			hint: "Use a path that exists in the repository.",
		};
	}
	if (normalized.includes("does not have any commits yet")) {
		return {
			code: "NO_COMMITS",
			message: "Repository has no commits yet",
		};
	}
	if (exitCode === 127 || normalized.includes("not found")) {
		return {
			code: "GIT_NOT_AVAILABLE",
			message: "git executable is not available",
		};
	}

	return {
		code: "GIT_COMMAND_FAILED",
		message: stderr || `git exited with code ${exitCode}`,
	};
}

export function parseNameStatusLine(line: string): GitChangedFile | null {
	const trimmed = line.trim();
	if (!trimmed) {
		return null;
	}

	const parts = trimmed.split("\t");
	if (parts.length < 2) {
		return null;
	}

	const rawStatus = parts[0] ?? "";
	const status = rawStatus.slice(0, 1) || rawStatus;
	if ((status === "R" || status === "C") && parts.length >= 3) {
		return {
			status,
			raw_status: rawStatus,
			old_path: parts[1],
			path: parts[2],
		};
	}

	return {
		status,
		raw_status: rawStatus,
		path: parts.slice(1).join("\t"),
	};
}

export function parseGitStatusPorcelain(stdout: string): { branch: string; files: Array<Record<string, unknown>> } {
	const lines = stdout.split(/\r?\n/).filter(Boolean);
	let branch = "HEAD";
	const files: Array<Record<string, unknown>> = [];

	for (const line of lines) {
		if (line.startsWith("## ")) {
			branch = line.slice(3).trim() || "HEAD";
			continue;
		}
		if (line.length < 3) {
			continue;
		}

		const xy = line.slice(0, 2);
		const rest = line.slice(3).trim();
		if (!rest) {
			continue;
		}

		let currentPath = rest;
		let oldPath: string | undefined;
		if (rest.includes(" -> ")) {
			const [from, to] = rest.split(" -> ");
			oldPath = from;
			currentPath = to ?? rest;
		}

		const indexStatus = xy[0] ?? " ";
		const worktreeStatus = xy[1] ?? " ";
		files.push({
			path: currentPath,
			...(oldPath ? { old_path: oldPath } : {}),
			index_status: indexStatus,
			worktree_status: worktreeStatus,
			raw_status: xy,
			status: xy.trim() || xy,
		});
	}

	return { branch, files };
}

export function parseGitHistoryOutput(stdout: string, withFiles: boolean): Array<GitHistoryCommit> {
	const lines = stdout.split(/\r?\n/);
	const commits: Array<GitHistoryCommit> = [];
	let current: {
		sha: string;
		subject: string;
		date: string;
		author: string;
		files: Array<GitChangedFile>;
	} | null = null;

	for (const rawLine of lines) {
		if (!rawLine) {
			continue;
		}

		const headerParts = rawLine.split("\u0000");
		const candidateSha = headerParts[0] ?? "";
		if (headerParts.length >= 4 && /^[0-9a-f]{7,40}$/i.test(candidateSha)) {
			if (current) {
				commits.push({
					sha: current.sha,
					subject: current.subject,
					date: current.date,
					author: current.author,
					...(withFiles ? { files: current.files } : {}),
				});
			}
			current = {
				sha: headerParts[0] ?? "",
				subject: headerParts[1] ?? "",
				date: headerParts[2] ?? "",
				author: headerParts[3] ?? "",
				files: [],
			};
			continue;
		}

		if (!withFiles || !current) {
			continue;
		}
		const parsedFile = parseNameStatusLine(rawLine);
		if (parsedFile) {
			current.files.push(parsedFile);
		}
	}

	if (current) {
		commits.push({
			sha: current.sha,
			subject: current.subject,
			date: current.date,
			author: current.author,
			...(withFiles ? { files: current.files } : {}),
		});
	}

	return commits;
}
