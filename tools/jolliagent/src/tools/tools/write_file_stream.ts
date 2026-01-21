import type { RunState, ToolDef } from "../../Types";
import { writeFileChunkExecutor } from "./write_file_chunk";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

// Alias tool that streams file content by delegating to write_file_chunk
export const write_file_stream_tool_def: ToolDef = {
	name: "write_file_stream",
	description: [
		"Stream text to a file in chunks (alias of write_file_chunk).",
		"Use truncate=true on the first call, then append subsequent chunks.",
		"Optionally set ensure_newline=true to force a trailing newline for each chunk.",
	].join(" "),
	parameters: {
		type: "object",
		properties: {
			filename: { type: "string", description: "Path to the target file" },
			content: { type: "string", description: "Content chunk to write" },
			truncate: { type: "boolean", description: "Overwrite file on this call (default: false)" },
			ensure_newline: { type: "boolean", description: "Append a newline if missing (default: false)" },
			mkdirs: { type: "boolean", description: "Create parent directories (default: true)" },
		},
		required: ["filename", "content"],
	},
};

export const writeFileStreamExecutor: ToolExecutor = async (runState, args) => {
	// Delegate implementation to write_file_chunk executor to avoid duplication
	return await writeFileChunkExecutor(runState, args);
};
