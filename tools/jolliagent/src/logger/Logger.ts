/**
 * Unified logging interface for Jolli agent workflows and tools.
 *
 * Categories:
 * - code*: Logs emitted by code execution/tools (filesystem, network, etc.)
 * - llm*:  Logs emitted when the LLM is producing messages or inner thoughts
 * - agent*: Logs emitted by the agent/workflow orchestration itself
 *
 * Agent logging methods support both legacy plain strings and new localization-friendly message keys with context:
 * - Legacy: agentLog("plain message")
 * - Localized: agentLog("message-key", { var1: value1, var2: value2 })
 */
export interface JolliAgentLogger {
	// Code / tools logging
	codeLog(message: string): void;
	codeError(message: string): void;
	codeDebug(message: string): void;

	// LLM output logging
	llmLog(message: string): void;
	llmThinkingLog(message: string): void;

	// Agent/workflow orchestration logging (supports message keys + context for localization)
	agentLog(messageOrKey: string, context?: Record<string, unknown>): void;
	agentError(messageOrKey: string, context?: Record<string, unknown>): void;
	agentDebug(messageOrKey: string, context?: Record<string, unknown>): void;
}

/**
 * No-op logger useful for tests and to disable logs.
 */
export const createNoopLogger = (): JolliAgentLogger => ({
	codeLog: () => {
		/* intentional no-op */
	},
	codeError: () => {
		/* intentional no-op */
	},
	codeDebug: () => {
		/* intentional no-op */
	},
	llmLog: () => {
		/* intentional no-op */
	},
	llmThinkingLog: () => {
		/* intentional no-op */
	},
	agentLog: (_messageOrKey?: string, _context?: Record<string, unknown>) => {
		/* intentional no-op */
	},
	agentError: (_messageOrKey?: string, _context?: Record<string, unknown>) => {
		/* intentional no-op */
	},
	agentDebug: (_messageOrKey?: string, _context?: Record<string, unknown>) => {
		/* intentional no-op */
	},
});
