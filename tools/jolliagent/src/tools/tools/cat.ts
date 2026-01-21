import type { RunState, ToolDef } from "../../Types";
import { readFile } from "node:fs/promises";
import type { Sandbox } from "e2b";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const cat_tool_def: ToolDef = {
	name: "cat",
	description: [
		"Print the contents of a text file.",
		"Always provide a valid file path in the 'path' parameter.",
		"If unsure which file to read, call 'ls' first to discover files.",
		"Prefer small/medium text files (<50KB) to avoid long outputs.",
		"Use a single, concrete path (no globs or directories).",
	].join(" "),
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: [
					"Relative or absolute path to a readable text file.",
					"Examples: 'README.md', 'src/index.ts', './package.json'.",
					"If missing, first call 'ls' to list available files, then retry with a chosen file.",
				].join(" "),
			},
		},
		required: ["path"],
	},
};

// Local implementation
export async function executeCatToolLocal(path: string): Promise<string> {
	try {
		if (!path) {
			return [
				"Error: Missing required parameter 'path' for cat.",
				'Usage: cat {"path": "<file>"}',
				"Tip: Call 'ls' first to discover files, then pass one file path.",
			].join("\n");
		}
		const content = await readFile(path, "utf-8");
		return content;
	} catch (error) {
		const err = error as { message?: string };
		return `Error reading file: ${err.message}`;
	}
}

// E2B implementation
export async function executeCatToolE2B(runState: RunState, path: string): Promise<string> {
	try {
		const sandbox = runState.e2bsandbox as Sandbox;
		if (!sandbox) {
			return "Error: E2B sandbox not initialized. Make sure to run with --e2b flag.";
		}

		if (!path) {
			return [
				"Error: Missing required parameter 'path' for cat.",
				'Usage: cat {"path": "<file>"}',
				"Tip: Call 'ls' first to discover files, then pass one file path.",
			].join("\n");
		}

		// Execute cat command in the E2B sandbox
		const proc = await sandbox.commands.run(`cat ${path}`);

		if (proc.error) {
			return `Error: ${proc.error}`;
		}

		if (proc.exitCode !== 0) {
			const errorMsg = proc.stderr.trim() || "Failed to read file";
			return `Error reading file: ${errorMsg}`;
		}

		return proc.stdout;
	} catch (error) {
		const err = error as { message?: string };
		return `Error reading file: ${err.message}`;
	}
}

// Unified executor that chooses implementation based on context
export const catExecutor: ToolExecutor = async (runState, args) => {
	const path = (args as { path?: string })?.path || "";
	if (runState.e2bsandbox) {
		return await executeCatToolE2B(runState, path);
	}
	return await executeCatToolLocal(path);
};
