import type { RunState, ToolDef } from "../../Types";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Sandbox } from "e2b";

const execAsync = promisify(exec);

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const git_history_tool_def: ToolDef = {
	name: "git_history",
	description:
		"Browse git commit history with pagination. Shows commit messages and files modified/created for each commit.",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description:
					"Path to git repository directory. If not specified, uses current working directory. Example: ~/workspace/Hello-World/main",
			},
			skip: { type: "number", description: "Number of commits to skip from HEAD. Default 0." },
			limit: { type: "number", description: "Maximum number of commits to show. Default 10." },
			ref: { type: "string", description: "Start ref (HEAD, main, commit-hash). Default HEAD." },
		},
		required: [],
	},
};

// Helper function to format git history output
function formatGitHistoryOutput(stdout: string, skip: number, limit: number): string {
	if (!stdout.trim()) {
		return "No commits found for the given parameters.";
	}
	const lines = stdout.trim().split("\n");
	let formattedOutput = `Git History (showing ${limit} commits starting from offset ${skip}):\n\n`;
	let currentCommit = "";
	let commitCount = 0;
	for (const line of lines) {
		// Check if line is a commit header (contains pipe-separated values with exactly 4 parts)
		// and doesn't start with a tab (which would be a file status line)
		if (line.includes("|") && !line.startsWith("\t")) {
			const parts = line.split("|");
			// Ensure this is a commit line with hash|message|date|author format
			if (parts.length >= 4) {
				if (currentCommit) {
					formattedOutput += "\n";
				}
				commitCount++;
				const [hash, message, date, author] = parts;
				formattedOutput += `Commit #${skip + commitCount}:\n`;
				formattedOutput += `  Hash: ${hash}\n`;
				formattedOutput += `  Message: ${message}\n`;
				formattedOutput += `  Author: ${author}\n`;
				formattedOutput += `  Date: ${date}\n`;
				formattedOutput += `  Files:\n`;
				currentCommit = hash;
			}
		} else if (line.trim() && currentCommit) {
			// This is a file status line
			const parts = line.trim().split("\t");
			if (parts.length >= 2) {
				const [status, ...filenameParts] = parts;
				const filename = filenameParts.join("\t");
				const statusMap: { [key: string]: string } = {
					A: "Added",
					M: "Modified",
					D: "Deleted",
					R: "Renamed",
					C: "Copied",
					T: "Type changed",
					U: "Unmerged",
					X: "Unknown",
					B: "Broken",
				};
				const statusText = statusMap[status] || status;
				formattedOutput += `    - ${statusText}: ${filename}\n`;
			}
		}
	}
	formattedOutput += `\nTo see more commits, use skip=${skip + limit} or adjust the limit parameter.`;
	return formattedOutput;
}

// Local implementation
export async function executeGitHistoryToolLocal(skip = 0, limit = 10, ref = "HEAD", path?: string): Promise<string> {
	try {
		const format = '--pretty=format:"%H|%s|%ai|%an" --name-status';
		const pathArg = path ? `-C "${path}"` : "";
		const command = `git ${pathArg} log ${ref} ${format} --skip=${skip} --max-count=${limit}`;
		const { stdout } = await execAsync(command);
		return formatGitHistoryOutput(stdout, skip, limit);
	} catch (error) {
		const err = error as { message?: string };
		const message = err.message ?? String(error);
		if (message.includes("not a git repository")) {
			return path
				? `Error: Not a git repository at path: ${path}`
				: "Error: Not in a git repository (current directory)";
		}
		return `Error executing git history: ${message}`;
	}
}

// E2B implementation
export async function executeGitHistoryToolE2B(
	runState: RunState,
	skip = 0,
	limit = 10,
	ref = "HEAD",
	path?: string,
): Promise<string> {
	const sandbox = runState.e2bsandbox as Sandbox;
	if (!sandbox) {
		return "Error: E2B sandbox not initialized. Make sure to run with --e2b flag.";
	}

	const format = '--pretty=format:"%H|%s|%ai|%an" --name-status';
	const pathArg = path ? `-C "${path}"` : "";
	const cmd = `git ${pathArg} log ${ref} ${format} --skip=${skip} --max-count=${limit}`;
	try {
		const proc = await sandbox.commands.run(cmd, { timeoutMs: 60_000 });
		const stdout = (proc.stdout || "").trim();
		const stderr = (proc.stderr || "").trim();
		if (proc.error) {
			return `Error executing git history: ${proc.error}`;
		}
		if (stderr.includes("not a git repository")) {
			return path
				? `Error: Not a git repository at path: ${path}`
				: "Error: Not in a git repository (current directory)";
		}
		return formatGitHistoryOutput(stdout, skip, limit);
	} catch (e) {
		const err = e as { message?: string };
		return `Error executing git history: ${err.message ?? String(e)}`;
	}
}

// Unified executor that chooses implementation based on context
export const gitHistoryExecutor: ToolExecutor = async (runState, args) => {
	const typedArgs = args as { skip?: number; limit?: number; ref?: string; path?: string };
	const skip = Number(typedArgs?.skip ?? 0) || 0;
	const limit = Number(typedArgs?.limit ?? 10) || 10;
	const ref = typedArgs?.ref || "HEAD";
	const path = typedArgs?.path;

	if (runState.e2bsandbox) {
		return await executeGitHistoryToolE2B(runState, skip, limit, ref, path);
	}
	return await executeGitHistoryToolLocal(skip, limit, ref, path);
};
