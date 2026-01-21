import type { RunState, ToolDef } from "../../Types";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Sandbox } from "e2b";

const execAsync = promisify(exec);

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const git_diff_tool_def: ToolDef = {
	name: "git_diff",
	description:
		"Show full textual diff between commits or between a commit and working directory. Shows all changes with context.",
	parameters: {
		type: "object",
		properties: {
			from_ref: { type: "string", description: "Starting ref (HEAD, main, SHA). Default HEAD." },
			to_ref: { type: "string", description: "Ending ref. If omitted, diffs against working directory." },
		},
		required: [],
	},
};

// Local implementation
export async function executeGitDiffToolLocal(fromRef = "HEAD", toRef?: string): Promise<string> {
	try {
		let command: string;
		if (!toRef) {
			command = `git diff ${fromRef}`;
		} else {
			command = `git diff ${fromRef}..${toRef}`;
		}
		const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
		if (!stdout.trim()) {
			return toRef
				? `No differences found between ${fromRef} and ${toRef}.`
				: `No differences found between ${fromRef} and working directory.`;
		}
		let header = toRef ? `Git Diff: ${fromRef}..${toRef}\n` : `Git Diff: ${fromRef}..working directory\n`;
		header += `${"=".repeat(50)}\n\n`;
		return header + stdout;
	} catch (error) {
		const err = error as { message?: string };
		const message = err.message ?? String(error);
		if (message.includes("not a git repository")) {
			return "Error: Not in a git repository";
		}
		if (message.includes("unknown revision")) {
			return `Error: Invalid commit reference. Make sure the commit SHA or ref exists.`;
		}
		if (message.includes("bad revision")) {
			return `Error: Bad revision. Check that your commit references are valid.`;
		}
		return `Error executing git diff: ${message}`;
	}
}

// E2B implementation
export async function executeGitDiffToolE2B(runState: RunState, fromRef = "HEAD", toRef?: string): Promise<string> {
	const sandbox = runState.e2bsandbox as Sandbox;
	if (!sandbox) {
		return "Error: E2B sandbox not initialized. Make sure to run with --e2b flag.";
	}

	const cmd = toRef ? `git diff ${fromRef}..${toRef}` : `git diff ${fromRef}`;
	try {
		const proc = await sandbox.commands.run(cmd, { timeoutMs: 60_000 });
		const output = (proc.stdout || "").trim();
		const stderr = (proc.stderr || "").trim();
		if (proc.error) {
			return `Error executing git diff: ${proc.error}`;
		}
		if (stderr.includes("not a git repository")) {
			return "Error: Not in a git repository";
		}
		if (!output) {
			return toRef
				? `No differences found between ${fromRef} and ${toRef}.`
				: `No differences found between ${fromRef} and working directory.`;
		}
		const header = toRef
			? `Git Diff: ${fromRef}..${toRef}\n${"=".repeat(50)}\n\n`
			: `Git Diff: ${fromRef}..working directory\n${"=".repeat(50)}\n\n`;
		return header + output;
	} catch (e) {
		const err = e as { message?: string };
		return `Error executing git diff: ${err.message ?? String(e)}`;
	}
}

// Unified executor that chooses implementation based on context
export const gitDiffExecutor: ToolExecutor = async (runState, args) => {
	const fromRef = (args as { from_ref?: string; to_ref?: string })?.from_ref || "HEAD";
	const toRef = (args as { from_ref?: string; to_ref?: string })?.to_ref;

	if (runState.e2bsandbox) {
		return await executeGitDiffToolE2B(runState, fromRef, toRef);
	}
	return await executeGitDiffToolLocal(fromRef, toRef);
};
