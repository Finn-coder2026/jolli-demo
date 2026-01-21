import type { JolliAgentLogger } from "./Logger";

interface CliLoggerOptions {
	/** When true, include category prefixes */
	withPrefixes?: boolean;
}

function line(prefix: string, message: string): string {
	return `${prefix}${message}`;
}

/**
 * CLI logger implementation that writes to stdout/stderr.
 */
export function createCliLogger(opts: CliLoggerOptions = {}): JolliAgentLogger {
	const p = (name: string) => (opts.withPrefixes ? `[${name}] ` : "");

	return {
		codeLog: (message: string) => {
			try {
				process.stdout.write(`${line(p("code"), String(message))}\n`);
			} catch {
				/* noop */
			}
		},
		codeError: (message: string) => {
			try {
				process.stderr.write(`${line(p("code:error"), String(message))}\n`);
			} catch {
				/* noop */
			}
		},
		codeDebug: (message: string) => {
			try {
				process.stdout.write(`${line(p("code:debug"), String(message))}\n`);
			} catch {
				/* noop */
			}
		},

		llmLog: (message: string) => {
			try {
				process.stdout.write(`${line(p("llm"), String(message))}\n`);
			} catch {
				/* noop */
			}
		},
		llmThinkingLog: (message: string) => {
			try {
				process.stdout.write(`${line(p("llm:thinking"), String(message))}\n`);
			} catch {
				/* noop */
			}
		},

		agentLog: (messageOrKey: string, context?: Record<string, unknown>) => {
			try {
				const ctx = context ?? {};
				const msg = Object.keys(ctx).length > 0 ? `${messageOrKey} ${JSON.stringify(ctx)}` : messageOrKey;
				process.stdout.write(`${line(p("agent"), msg)}\n`);
			} catch {
				/* noop */
			}
		},
		agentError: (messageOrKey: string, context?: Record<string, unknown>) => {
			try {
				const ctx = context ?? {};
				const msg = Object.keys(ctx).length > 0 ? `${messageOrKey} ${JSON.stringify(ctx)}` : messageOrKey;
				process.stderr.write(`${line(p("agent:error"), msg)}\n`);
			} catch {
				/* noop */
			}
		},
		agentDebug: (messageOrKey: string, context?: Record<string, unknown>) => {
			try {
				const ctx = context ?? {};
				const msg = Object.keys(ctx).length > 0 ? `${messageOrKey} ${JSON.stringify(ctx)}` : messageOrKey;
				process.stdout.write(`${line(p("agent:debug"), msg)}\n`);
			} catch {
				/* noop */
			}
		},
	};
}
