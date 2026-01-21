import type { RunState, ToolCall } from "../Types";
import {
	architectureToolDefinitions,
	e2bToolDefinitions,
	e2bToolExecutors,
	localToolExecutors,
	markdown_sections_tool_def,
	toolDefinitions,
} from "./tools/index";

const DEBUG_TOOLS = !!process.env.JOLLI_DEBUG && process.env.JOLLI_DEBUG.length > 0;

// Re-export definitions to preserve existing imports
export { toolDefinitions, architectureToolDefinitions, e2bToolDefinitions };
export type ToolExecutorNamespace = "local" | "e2b";
export { markdown_sections_tool_def };

export async function runToolCall(runState: RunState, call: ToolCall): Promise<string> {
	// Normalize args up-front (providers may stringify JSON)
	let args: unknown = call.arguments || {};
	if (typeof args === "string") {
		try {
			const parsed = JSON.parse(args);
			if (parsed && typeof parsed === "object") {
				args = parsed;
			}
		} catch {
			// leave as-is; individual tools will handle validation and return errors
		}
	}

	if (DEBUG_TOOLS) {
		try {
			const raw = JSON.stringify(call.providerMeta);
			const norm = JSON.stringify(args);
			// Use stdout to keep ordering with CLI prints
			process.stdout.write(`🪵 debug runToolCall: ${call.name} args=${norm} providerMeta=${raw}\n`);
		} catch {
			// ignore JSON stringify issues
		}
	}

	const executorNamespace = runState.executorNamespace || "local";
	const executors = executorNamespace === "e2b" ? e2bToolExecutors : localToolExecutors;
	const executor = executors[call.name];
	if (!executor) {
		return `Unknown tool: ${call.name}`;
	}

	return await executor(runState, args);
}
