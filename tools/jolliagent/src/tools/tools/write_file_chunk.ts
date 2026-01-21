import type { RunState, ToolDef } from "../../Types";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Sandbox } from "e2b";

export type ToolExecutor = (runState: RunState, args: unknown) => Promise<string> | string;

export const write_file_chunk_tool_def: ToolDef = {
	name: "write_file_chunk",
	description: [
		"Write or append a chunk of text to a file.",
		"Use 'truncate=true' on the first call to create/overwrite the file,",
		"then omit or set 'truncate=false' on subsequent calls to append.",
		"Use 'ensure_newline=true' to add a trailing newline if missing.",
		"Set 'mkdirs=true' to create parent directories if they don't exist.",
	].join(" "),
	parameters: {
		type: "object",
		properties: {
			filename: { type: "string", description: "Path to the file" },
			content: { type: "string", description: "Content chunk to write" },
			truncate: { type: "boolean", description: "Overwrite on this call (default: false)" },
			ensure_newline: {
				type: "boolean",
				description: "Append a newline if the chunk lacks one (default: false)",
			},
			mkdirs: { type: "boolean", description: "Create parent directories recursively (default: true)" },
		},
		required: ["filename", "content"],
	},
};

// Local implementation
export async function executeWriteFileChunkToolLocal(
	filename: string,
	content: string,
	opts?: { truncate?: boolean; ensure_newline?: boolean; mkdirs?: boolean },
): Promise<string> {
	try {
		if (!filename) {
			return "Error: Filename is required for write_file_chunk";
		}
		if (content === undefined || content === null) {
			return "Error: Content is required for write_file_chunk";
		}
		if (typeof content !== "string") {
			return "Error: Content must be a string for write_file_chunk";
		}

		const truncate = Boolean(opts?.truncate);
		const ensureNewline = Boolean(opts?.ensure_newline);
		const mk = opts?.mkdirs !== false; // default true

		if (mk) {
			try {
				await mkdir(dirname(filename), { recursive: true });
			} catch {
				// Ignore errors if directory already exists or parent creation fails
			}
		}

		const chunk = ensureNewline && !content.endsWith("\n") ? `${content}\n` : content;
		if (truncate) {
			await writeFile(filename, chunk, "utf-8");
			return `Chunk write (truncate) succeeded: wrote ${chunk.length} characters to ${filename}`;
		} else {
			await appendFile(filename, chunk, "utf-8");
			return `Chunk write (append) succeeded: wrote ${chunk.length} characters to ${filename}`;
		}
	} catch (error) {
		const err = error as { message?: string };
		return `Error in write_file_chunk: ${err.message}`;
	}
}

// E2B implementation
export async function executeWriteFileChunkToolE2B(
	runState: RunState,
	filename: string,
	content: string,
	opts?: { truncate?: boolean; ensure_newline?: boolean; mkdirs?: boolean },
): Promise<string> {
	try {
		const sandbox = runState.e2bsandbox as Sandbox;
		if (!sandbox) {
			return "Error: E2B sandbox not initialized. Make sure to run with --e2b flag.";
		}

		if (!filename) {
			return "Error: Filename is required for write_file_chunk";
		}
		if (content === undefined || content === null) {
			return "Error: Content is required for write_file_chunk";
		}
		if (typeof content !== "string") {
			return "Error: Content must be a string for write_file_chunk";
		}

		const truncate = Boolean(opts?.truncate);
		const ensureNewline = Boolean(opts?.ensure_newline);
		const mk = opts?.mkdirs !== false; // default true

		if (mk) {
			// Create parent directories in E2B
			const dir = dirname(filename);
			if (dir && dir !== "." && dir !== "/") {
				await sandbox.commands.run(`mkdir -p "${dir}"`);
			}
		}

		const chunk = ensureNewline && !content.endsWith("\n") ? `${content}\n` : content;

		if (truncate) {
			// Overwrite file
			await sandbox.files.write(filename, chunk);
			return `Chunk write (truncate) succeeded: wrote ${chunk.length} characters to ${filename}`;
		} else {
			// Append to file - read existing content first
			let existing = "";
			try {
				existing = await sandbox.files.read(filename);
			} catch {
				// File doesn't exist yet, that's ok
			}
			await sandbox.files.write(filename, existing + chunk);
			return `Chunk write (append) succeeded: wrote ${chunk.length} characters to ${filename}`;
		}
	} catch (error) {
		const err = error as { message?: string };
		return `Error in write_file_chunk: ${err.message}`;
	}
}

// Unified executor that chooses implementation based on context
export const writeFileChunkExecutor: ToolExecutor = (runState, args) => {
	const typedArgs = args as
		| { filename?: string; content?: unknown; truncate?: boolean; ensure_newline?: boolean; mkdirs?: boolean }
		| undefined;
	if (!typedArgs || !typedArgs.filename) {
		return "Error: filename parameter is missing for write_file_chunk";
	}
	if (typedArgs.content === undefined || typedArgs.content === null) {
		return "Error: Content is required for write_file_chunk";
	}
	if (typeof typedArgs.content !== "string") {
		return "Error: Content must be a string for write_file_chunk";
	}

	const opts = {
		truncate: Boolean(typedArgs.truncate),
		ensure_newline: Boolean(typedArgs.ensure_newline),
		mkdirs: typedArgs.mkdirs !== false,
	};

	if (runState.e2bsandbox) {
		return executeWriteFileChunkToolE2B(runState, typedArgs.filename, typedArgs.content, opts);
	}
	return executeWriteFileChunkToolLocal(typedArgs.filename, typedArgs.content, opts);
};
