import type { RunState, ToolDef } from "../../Types";
import { readdir, stat } from "node:fs/promises";
import type { Sandbox } from "e2b";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const ls_tool_def: ToolDef = {
	name: "ls",
	description: "List directory contents",
	parameters: {
		type: "object",
		properties: { path: { type: "string", description: "Optional path to list, defaults to current directory" } },
		required: [],
	},
};

// Local implementation
export async function executeLsToolLocal(path?: string): Promise<string> {
	try {
		const target = path && path.trim().length > 0 ? path : ".";
		const s = await stat(target);
		if (s.isDirectory()) {
			const entries = await readdir(target, { withFileTypes: true });
			if (entries.length === 0) {
				return `Directory is empty: ${target}\n`;
			}
			const list = entries
				.map(e => (e.isDirectory() ? `${e.name}/` : e.name))
				.sort((a, b) => a.localeCompare(b))
				.join("\n");
			return `${list}\n`;
		}
		return `File: ${target}\n`;
	} catch (error) {
		const err = error as { message?: string };
		return `Path not found or not accessible: ${path ?? "."}. ${err.message}`;
	}
}

// E2B implementation
export async function executeLsToolE2B(runState: RunState, path?: string): Promise<string> {
	try {
		const sandbox = runState.e2bsandbox as Sandbox;
		if (!sandbox) {
			return "Error: E2B sandbox not initialized. Make sure to run with --e2b flag.";
		}

		const target = path && path.trim().length > 0 ? path : ".";

		// Execute ls command in the E2B sandbox
		const proc = await sandbox.commands.run(`ls -F ${target}`);

		if (proc.error) {
			return `Error: ${proc.error}`;
		}

		const output = proc.stdout.trim();

		if (!output) {
			return `Directory is empty: ${target}\n`;
		}

		return `${output}\n`;
	} catch (error) {
		const err = error as { message?: string };
		return `Error listing directory: ${err.message}`;
	}
}

// Unified executor that chooses implementation based on context
export const lsExecutor: ToolExecutor = async (runState, args) => {
	const path = (args as { path?: string })?.path;
	if (runState.e2bsandbox) {
		return await executeLsToolE2B(runState, path);
	}
	return await executeLsToolLocal(path);
};
