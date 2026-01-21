import type { JolliAgentLogger } from "./Logger";

/**
 * Server logger implementation that mirrors all categories into a single sink.
 * For now, all messages go to the same destination (e.g., a job log sink).
 *
 * Supports both legacy plain string messages and new localization-friendly message keys with context:
 * - Legacy: sink("plain message")
 * - Localized: sink("message-key", { var1: value1 })
 */
export function createServerLogger(
	sink?: (messageOrKey: string, context?: Record<string, unknown>) => void,
): JolliAgentLogger {
	// Fallback sink writes to stdout
	const out = (message: string) => {
		if (sink) {
			try {
				sink(message);
				return;
			} catch {
				// fall through to stdout
			}
		}
		try {
			process.stdout.write(`${String(message)}\n`);
		} catch {
			/* noop */
		}
	};

	const outWithContext = (messageOrKey: string, context?: Record<string, unknown>) => {
		// Always pass a context object (even if empty) to ensure message keys
		// are recognized for translation
		const ctx = context ?? {};

		if (sink) {
			try {
				sink(messageOrKey, ctx);
				return;
			} catch {
				// fall through to stdout
			}
		}
		// For stdout fallback, format it nicely
		const msg = Object.keys(ctx).length > 0 ? `${messageOrKey} ${JSON.stringify(ctx)}` : messageOrKey;
		try {
			process.stdout.write(`${msg}\n`);
		} catch {
			/* noop */
		}
	};

	return {
		codeLog: out,
		codeError: out,
		codeDebug: out,
		llmLog: out,
		// Suppress per-token streaming on server to avoid log spam
		llmThinkingLog: () => {
			/* intentional no-op */
		},
		agentLog: outWithContext,
		agentError: outWithContext,
		agentDebug: outWithContext,
	};
}
