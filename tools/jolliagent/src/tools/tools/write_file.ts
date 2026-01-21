import type { RunState, ToolDef } from "../../Types";
import { writeFile } from "node:fs/promises";
import type { Sandbox } from "e2b";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const write_file_tool_def: ToolDef = {
	name: "write_file",
	description: "Write text to a file",
	parameters: {
		type: "object",
		properties: {
			filename: { type: "string", description: "Path to the file to write" },
			content: { type: "string", description: "Content to write to the file" },
		},
		required: ["filename", "content"],
	},
};

// Local implementation
export async function executeWriteFileToolLocal(filename: string, content: string): Promise<string> {
	try {
		if (!filename) {
			return "Error: Filename is required for write_file command";
		}
		if (content === undefined || content === null || content === "") {
			return "Error: Content is required for write_file command. Both filename and content parameters must be provided.";
		}
		await writeFile(filename, content, "utf-8");
		return `Successfully wrote ${content.length} characters to ${filename}`;
	} catch (error) {
		const err = error as { message?: string };
		return `Error writing file: ${err.message}`;
	}
}

// E2B implementation
export async function executeWriteFileToolE2B(runState: RunState, filename: string, content: string): Promise<string> {
	try {
		const sandbox = runState.e2bsandbox as Sandbox;
		if (!sandbox) {
			return "Error: E2B sandbox not initialized. Make sure to run with --e2b flag.";
		}

		if (!filename) {
			return "Error: Filename is required for write_file command";
		}
		if (content === undefined || content === null || content === "") {
			return "Error: Content is required for write_file command. Both filename and content parameters must be provided.";
		}

		// Write file in E2B sandbox
		await sandbox.files.write(filename, content);
		return `Successfully wrote ${content.length} characters to ${filename}`;
	} catch (error) {
		const err = error as { message?: string };
		return `Error writing file: ${err.message}`;
	}
}

// Unified executor that chooses implementation based on context
export const writeFileExecutor: ToolExecutor = (runState, args) => {
	const typedArgs = args as { filename?: string; content?: unknown } | undefined;
	if (!typedArgs || !typedArgs.filename) {
		return "Error: filename parameter is missing for write_file command";
	}
	if (typedArgs.content === undefined || typedArgs.content === null || typedArgs.content === "") {
		return "Error: Content is required for write_file command. Both filename and content parameters must be provided.";
	}
	if (typeof typedArgs.content !== "string") {
		return "Error: Content must be a string for write_file command.";
	}

	if (runState.e2bsandbox) {
		return executeWriteFileToolE2B(runState, typedArgs.filename, typedArgs.content);
	}
	return executeWriteFileToolLocal(typedArgs.filename, typedArgs.content);
};
