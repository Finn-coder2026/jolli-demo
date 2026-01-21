import {
	createAgent,
	createArchitectureAgent,
	createArchitectureDocAgent,
	createArchitectureUpdateAgent,
	createCodeDocsAgent,
	createCodeToApiDocsAgent,
	createCodeToDocsAgent,
	createDocsToSiteAgent,
	createGettingStartedGuideAgent,
	createSectionCitationsMermaidAgent,
} from "./agents/factory";
import { createCliLogger } from "./logger/CliLogger";
import type { JolliAgentLogger } from "./logger/Logger";
import type { Message, ToolCall } from "./Types";
import { e2bToolDefinitions, runToolCall, toolDefinitions } from "./tools/Tools";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Sandbox } from "e2b";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure conversation history limit here. Use `Infinity` to disable pruning.
const MAX_HISTORY = Number.POSITIVE_INFINITY; // e.g., set to 40 to bound
const DEBUG_TOOLS = !!process.env.JOLLI_DEBUG && process.env.JOLLI_DEBUG.length > 0;

// Unified CLI logger
const logger: JolliAgentLogger = createCliLogger({ withPrefixes: true });
// Adapter to preserve existing log.* call sites
const log = {
	error: (...args: Array<unknown>) => logger.agentError(args.map(a => String(a)).join(" ")),
	info: (...args: Array<unknown>) => logger.agentLog(args.map(a => String(a)).join(" ")),
	debug: (...args: Array<unknown>) => {
		if (DEBUG_TOOLS) {
			logger.agentDebug(args.map(a => String(a)).join(" "));
		}
	},
};

// Load environment variables from .env.local or .env (src and dist friendly)
(() => {
	const candidates = [
		resolve(process.cwd(), ".env.local"),
		resolve(process.cwd(), ".env"),
		resolve(__dirname, "../.env.local"),
		resolve(__dirname, "../.env"),
	];
	for (const p of candidates) {
		if (existsSync(p)) {
			dotenv.config({ path: p, override: false });
			break;
		}
	}
})();

function mask(val?: string, { keep = 4 }: { keep?: number } = {}): string {
	if (!val) {
		return "(unset)";
	}
	if (val.length <= keep) {
		return "*".repeat(val.length);
	}
	return `${val.slice(0, keep)}…${"*".repeat(Math.max(0, val.length - keep - 1))}`;
}

function getFlag(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	if (idx !== -1 && idx + 1 < process.argv.length) {
		return process.argv[idx + 1];
	}
	return;
}

// Helper to create E2B sandbox with timeout protection
async function createE2BSandboxWithTimeout(templateId: string, apiKey: string, timeoutMs = 20000): Promise<Sandbox> {
	log.info(`\n⏳ Connecting to E2B sandbox…`);
	log.info(
		`[E2B] node=${process.version} template=${mask(templateId)} timeoutMs=${timeoutMs} apiKey=${mask(apiKey)}`,
	);

	const connect = Sandbox.create(templateId, { apiKey });
	const timeout = new Promise<never>((_, reject) =>
		setTimeout(
			() => reject(new Error(`E2B connection timed out after ${Math.round(timeoutMs / 1000)}s`)),
			timeoutMs,
		),
	);

	const t0 = Date.now();
	const sandbox = await Promise.race([connect, timeout]);
	log.info(`✅ E2B sandbox ready in ${Date.now() - t0}ms`);
	return sandbox;
}

// Function to run workflow mode (non-interactive, run agent until it finishes a turn)
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is the main workflow orchestration function
async function runWorkflowMode(kind = "getting-started-guide"): Promise<void> {
	// Validate API key early to provide a helpful message
	if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.trim() === "") {
		log.error(
			"\nMissing ANTHROPIC_API_KEY. Create a .env or .env.local with ANTHROPIC_API_KEY=your_key, or export it in your shell.",
		);
		log.error("Example: echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local");
		process.exit(1);
	}

	const useE2B = process.argv.includes("--e2b");
	const e2bTemplateId = getFlag("--e2b-template") || process.env.E2B_TEMPLATE_ID;
	const runState = {} as {
		currentPlan?: string;
		e2bsandbox?: unknown;
		executorNamespace?: "local" | "e2b";
		env_vars?: Record<string, string>;
	};
	runState.executorNamespace = useE2B ? "e2b" : "local";
	runState.env_vars = {};

	// Add GH_PAT to env_vars if available
	if (process.env.GH_PAT) {
		runState.env_vars.GH_PAT = process.env.GH_PAT;
	}
	if (process.env.TAVILY_API_KEY) {
		runState.env_vars.TAVILY_API_KEY = process.env.TAVILY_API_KEY;
	}

	// Add VERCEL_TOKEN to env_vars if available
	if (process.env.VERCEL_TOKEN) {
		runState.env_vars.VERCEL_TOKEN = process.env.VERCEL_TOKEN;
	}

	if (useE2B) {
		if (!process.env.E2B_API_KEY || process.env.E2B_API_KEY.trim() === "") {
			log.error("\n❌ Missing E2B_API_KEY. Add E2B_API_KEY=your_key to .env or .env.local");
			process.exit(1);
		}
		if (!e2bTemplateId || e2bTemplateId.trim() === "") {
			log.error("\n❌ Missing E2B_TEMPLATE_ID. Add E2B_TEMPLATE_ID=your_template_id to .env or .env.local");
			process.exit(1);
		}
		const timeoutMs = Number(process.env.E2B_CONNECT_TIMEOUT_MS) || 20000;
		const sandbox = await createE2BSandboxWithTimeout(e2bTemplateId, process.env.E2B_API_KEY, timeoutMs);
		runState.e2bsandbox = sandbox;
	}

	// Select specialized agent based on workflow kind
	let agentFactory:
		| ReturnType<typeof createGettingStartedGuideAgent>
		| ReturnType<typeof createAgent>
		| ReturnType<typeof createArchitectureAgent>
		| ReturnType<typeof createArchitectureUpdateAgent>
		| ReturnType<typeof createSectionCitationsMermaidAgent>
		| ReturnType<typeof createCodeDocsAgent>
		| ReturnType<typeof createCodeToDocsAgent>
		| ReturnType<typeof createDocsToSiteAgent>;
	let _systemOverride: string | undefined;
	const initialInstruction: string | undefined = undefined;
	let seedChatOpts: { system?: string; messages?: Array<Message>; prompt?: string } = {};

	let citationsInputFile: string | undefined;
	let _citationsInputContent: string | undefined;

	switch (kind) {
		case "getting-started-guide":
		case "getting-started":
		case "gs": {
			agentFactory = createGettingStartedGuideAgent({ runState });
			break;
		}
		case "code-docs":
		case "docs-from-code":
		case "docs": {
			const url = process.argv[4];
			if (!url) {
				log.error("\nUsage: tsx src/jolli.ts workflow code-docs <github_url>");
				process.exit(1);
			}
			agentFactory = createCodeDocsAgent({ runState, githubUrl: url });
			break;
		}
		case "code-to-docs":
		case "code2docs":
		case "docs-prepare": {
			const url = process.argv[4];
			if (!url) {
				log.error("\nUsage: tsx src/jolli.ts workflow code-to-docs <github_url> [--outdir <path>]");
				process.exit(1);
			}
			const outdir = getFlag("--outdir");
			agentFactory = createCodeToDocsAgent({
				runState,
				githubUrl: url,
				...(outdir && { outputDir: outdir }),
			});
			break;
		}
		case "code-to-api-docs":
		case "api-articles":
		case "api-docs-only": {
			const url = process.argv[4];
			if (!url) {
				log.error("\nUsage: tsx src/jolli.ts workflow code-to-api-docs <github_url> [--outdir <path>]");
				process.exit(1);
			}
			const outdir = getFlag("--outdir");
			agentFactory = createCodeToApiDocsAgent({
				runState,
				githubUrl: url,
				...(outdir && { outputDir: outdir }),
			});
			break;
		}
		case "docs-to-site":
		case "docs-deploy":
		case "deploy-docs": {
			const outdir = process.argv[4];
			if (!outdir) {
				log.error("\nUsage: tsx src/jolli.ts workflow docs-to-site <output_dir> [--project-name <name>]");
				process.exit(1);
			}
			const projectName = getFlag("--project-name");
			agentFactory = createDocsToSiteAgent({
				runState,
				outputDir: outdir,
				...(projectName && { projectName }),
			});
			break;
		}
		case "architecture": {
			// Use the specialized architecture agent with embedded prompts
			agentFactory = createArchitectureAgent({ runState });
			break;
		}
		case "architecture-doc":
		case "architecture-only": {
			// Checkout repo and generate only architecture.md into OUTDIR/docs
			const url = process.argv[4];
			if (!url) {
				log.error("\nUsage: tsx src/jolli.ts workflow architecture-doc <github_url> [--outdir <path>]");
				process.exit(1);
			}
			const outdir = getFlag("--outdir");
			agentFactory = createArchitectureDocAgent({
				runState,
				githubUrl: url,
				...(outdir && { outputDir: outdir }),
			});
			break;
		}
		case "architecture-update":
		case "arch-update":
		case "au": {
			// Use the architecture update agent for diff-based delegated updates
			agentFactory = createArchitectureUpdateAgent({ runState });
			break;
		}
		case "citations-graph":
		case "citations": {
			// Citations → Mermaid workflow: requires a filename argument
			const filename = process.argv[4];
			if (!filename) {
				log.error("\nUsage: tsx src/jolli.ts workflow citations-graph <markdown_file>");
				process.exit(1);
			}
			try {
				const abs = resolve(process.cwd(), filename);
				const content = await readFile(abs, "utf-8");
				agentFactory = createSectionCitationsMermaidAgent({
					runState,
					currentDir: process.cwd(),
					filename,
				});
				seedChatOpts = { prompt: content };
				citationsInputFile = abs;
				_citationsInputContent = content;
				// Provide content via runState for tools that support fallback
				runState.env_vars.MARKDOWN_INPUT = content;
				runState.env_vars.MARKDOWN_FILE = abs;
				break;
			} catch (_e) {
				log.error(`\nUnable to read file: ${filename}`);
				process.exit(1);
			}
			break;
		}
		default:
			log.error(`\nUnknown workflow: ${kind}`);
			log.error(
				"Supported workflows: getting-started-guide, architecture, architecture-doc, architecture-update, citations-graph, code-docs, code-to-docs, code-to-api-docs, docs-to-site",
			);
			process.exit(1);
	}

	const { agent, withDefaults } = agentFactory;

	// Seed messages with system prompt and an initial user instruction
	const base = withDefaults(seedChatOpts);
	const history: Array<Message> = [];
	if (base.system) {
		history.push({ role: "system", content: base.system });
	}
	// If factory provides seed messages, include them in the starting history
	if (base.messages && base.messages.length > 0) {
		for (const m of base.messages) {
			history.push(m);
		}
	}

	// Provide the initial instruction for the selected workflow (legacy). For
	// architecture and getting-started, prompts are now injected by factories as
	// seed messages; we only push here if explicitly provided.
	if (initialInstruction) {
		history.push({ role: "user", content: initialInstruction });
	}

	// Stream one full autonomous agent turn with internal tool loop
	let isFirstChunk = true;
	const { assistantText } = await agent.chatTurn({
		history,
		runTool: async (call: ToolCall) => {
			const argsPreview = previewArgs(call.arguments);
			if (DEBUG_TOOLS) {
				logger.agentDebug(`🔧 Tool call → ${call.name}(${argsPreview})`);
			}
			const output = await runToolCall(runState, call);
			if (DEBUG_TOOLS) {
				const snippet = previewOutput(output);
				logger.agentDebug(`🧰 Tool result ← ${call.name} [${call.id}]\n${snippet}`);
			}
			return output;
		},
		onTextDelta: (delta: string, isFirst: boolean) => {
			process.stdout.write(isFirstChunk && isFirst ? `\n${delta}` : delta);
			if (isFirst) {
				isFirstChunk = false;
			}
		},
	});

	// Post-processing for citations-graph workflow: write full markdown output
	if (
		(kind === "citations-graph" || kind === "citations") &&
		typeof assistantText === "string" &&
		citationsInputFile
	) {
		try {
			const outPath = `${citationsInputFile}.citation.md`;
			await writeFile(outPath, `${assistantText.trim()}\n`, "utf-8");
			process.stdout.write(`\n\nCitations Mermaid markdown written to: ${outPath}\n`);
		} catch (e) {
			log.error("Failed to write citations mermaid markdown:", e instanceof Error ? e.message : String(e));
		}
	}

	// Exit successfully
	process.exit(0);
}

// Function to run CLI mode using the general Agent profile
async function runCliMode(_mode = "general"): Promise<void> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "\n> ",
	});

	// Read and display banner from file (works in src and built dist)
	{
		const candidates = [
			resolve(__dirname, "jolli-banner.txt"), // when running ts/tsx directly from src
			resolve(__dirname, "../jolli-banner.txt"), // when compiled file lives in dist
			resolve(process.cwd(), "src/jolli-banner.txt"), // fallback to cwd/src
			resolve(process.cwd(), "jolli-banner.txt"), // fallback to cwd
		];
		let banner: string | undefined;
		for (const p of candidates) {
			try {
				banner = await readFile(p, "utf-8");
				break;
			} catch {
				// File not found, try next candidate
			}
		}
		if (banner) {
			process.stdout.write(`\n${banner}\n`);
		} else {
			process.stdout.write("\n🤖 JOLLI CLI Mode\n");
			process.stdout.write('Type "exit" to quit\n\n');
		}
	}

	// Validate API key early to provide a helpful message
	if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.trim() === "") {
		log.error(
			"\nMissing ANTHROPIC_API_KEY. Create a .env or .env.local with ANTHROPIC_API_KEY=your_key, or export it in your shell.",
		);
		log.error("Example: echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local");
		log.error("Then re-run: npm run cli");
		rl.close();
		process.exit(1);
	}

	// Initialize our general-purpose agent with shared runState for tools
	const useE2B = process.argv.includes("--e2b");
	const e2bTemplateId = getFlag("--e2b-template") || process.env.E2B_TEMPLATE_ID;
	const runState = {} as {
		currentPlan?: string;
		e2bsandbox?: unknown;
		executorNamespace?: "local" | "e2b";
		env_vars?: Record<string, string>;
	};
	runState.executorNamespace = useE2B ? "e2b" : "local";
	runState.env_vars = {};

	// Add GH_PAT to env_vars if available
	if (process.env.GH_PAT) {
		runState.env_vars.GH_PAT = process.env.GH_PAT;
	}

	if (useE2B) {
		if (!process.env.E2B_API_KEY || process.env.E2B_API_KEY.trim() === "") {
			log.error("\n❌ Missing E2B_API_KEY. Add E2B_API_KEY=your_key to .env or .env.local");
			rl.close();
			process.exit(1);
		}
		if (!e2bTemplateId || e2bTemplateId.trim() === "") {
			log.error("\n❌ Missing E2B_TEMPLATE_ID. Add E2B_TEMPLATE_ID=your_template_id to .env or .env.local");
			rl.close();
			process.exit(1);
		}
		const timeoutMs = Number(process.env.E2B_CONNECT_TIMEOUT_MS) || 20000;
		const sandbox = await createE2BSandboxWithTimeout(e2bTemplateId, process.env.E2B_API_KEY, timeoutMs);
		runState.e2bsandbox = sandbox;
	}
	const { agent, withDefaults } = createAgent("general", {
		runState,
		tools: useE2B ? e2bToolDefinitions : toolDefinitions,
	});

	// Seed messages with system prompt (from profile) so the provider translator can lift it
	const defaults = withDefaults({});
	const conversationHistory: Array<Message> = [];
	if (defaults.system) {
		conversationHistory.push({ role: "system", content: defaults.system });
	}

	rl.prompt();

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is the main CLI event handler with multiple command branches
	rl.on("line", async input => {
		const line = input.trim();

		if (line.toLowerCase() === "exit") {
			rl.close();
			return;
		}

		if (!line) {
			rl.prompt();
			return;
		}

		try {
			// Add user message to history
			conversationHistory.push({ role: "user", content: line });

			// Generate assistant response with streaming + tool handling loop
			let continueToolLoop = true;
			while (continueToolLoop) {
				continueToolLoop = false;
				let assistantText = "";
				const pendingToolCalls: Array<ToolCall> = [];
				const assistantToolUses: Array<{ tool_call_id: string; tool_name: string; tool_input: unknown }> = [];

				for await (const ev of agent.stream({ messages: conversationHistory })) {
					if (ev.type === "text_delta") {
						// Stream output directly to the console
						process.stdout.write(assistantText === "" ? `\n${ev.delta}` : ev.delta);
						assistantText += ev.delta;
					} else if (ev.type === "tool_call") {
						pendingToolCalls.push(ev.call);
						assistantToolUses.push({
							tool_call_id: ev.call.id,
							tool_name: ev.call.name,
							tool_input: ev.call.arguments,
						});
						// Print a brief notice about the tool call
						const _argsPreview = previewArgs(ev.call.arguments);
						if (DEBUG_TOOLS) {
							const _raw = safeStringify(ev.call.providerMeta);
							const _norm = safeStringify(ev.call.arguments);
							if (ev.call.name === "cat") {
								const hasPath =
									ev.call?.arguments && (ev.call.arguments as Record<string, unknown>).path;
								if (!hasPath) {
									const keys = Object.keys((ev.call.arguments as Record<string, unknown>) || {}).join(
										",",
									);
									log.debug(`debug cat: missing 'path'. arg keys=[${keys}]`);
								}
							}
						}
					} else if (ev.type === "error") {
						log.error("\nLLM Error:", ev.error);
					}
				}

				// If there were tool calls, first append a single assistant tool_use message, then execute tools
				if (pendingToolCalls.length > 0) {
					if (DEBUG_TOOLS) {
						log.debug(`debug pendingToolCalls: count=${pendingToolCalls.length}`);
					}
					// Append one assistant message that contains all tool_use blocks from this turn
					conversationHistory.push({ role: "assistant_tool_uses", calls: assistantToolUses } as Message);
					for (const call of pendingToolCalls) {
						try {
							const output = await runToolCall(runState, call);
							conversationHistory.push({
								role: "tool",
								tool_call_id: call.id,
								content: output,
								tool_name: call.name,
							});

							// Print a short snippet of the tool result
							const _snippet = previewOutput(output);

							// Keep history bounded (retain the first system message if present)
							pruneHistory(conversationHistory, MAX_HISTORY);
						} catch (toolErr: unknown) {
							log.error("\nTool Error:", toolErr instanceof Error ? toolErr.message : String(toolErr));
						}
					}
					continueToolLoop = true; // continue conversation with tool results
				} else {
					// No tool calls this turn: persist any assistant visible text
					if (assistantText.trim().length > 0) {
						conversationHistory.push({ role: "assistant", content: assistantText });
					}

					// End of turn: trailing newline is handled by streaming output
				}

				// Keep only last N messages to avoid context overflow (system preserved)
				pruneHistory(conversationHistory, MAX_HISTORY);
			}
		} catch (error: unknown) {
			log.error("\nError:", error instanceof Error ? error.message : String(error));
		}

		rl.prompt();
	});

	rl.on("close", () => {
		log.info("Goodbye!");
		process.exit(0);
	});
}

// Preserve conversation history unless a finite MAX is set
function pruneHistory(history: Array<Message>, max: number) {
	if (!Number.isFinite(max)) {
		return; // no-op when unbounded
	}
	if (history.length <= max) {
		return;
	}
	const [first, ...rest] = history;
	if (first?.role === "system") {
		const trimmed = rest.slice(-1 * (max - 1));
		history.length = 0;
		history.push(first, ...trimmed);
	} else {
		const trimmed = history.slice(-1 * max);
		history.length = 0;
		history.push(...trimmed);
	}
}

function previewArgs(args: unknown, maxLen = 160): string {
	try {
		const s = JSON.stringify(args);
		return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
	} catch {
		const s = String(args);
		return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
	}
}

function previewOutput(text: string, maxLines = 5, maxChars = 500): string {
	if (!text) {
		return "(no output)\n";
	}
	const lines = text.split(/\r?\n/);
	const clippedLines = lines.slice(0, maxLines);
	let out = clippedLines.join("\n");
	if (out.length > maxChars) {
		out = `${out.slice(0, maxChars - 1)}…`;
	}
	if (lines.length > maxLines) {
		out += "\n…";
	}
	return `${out}\n`;
}

function safeStringify(v: unknown, maxLen = 1000): string {
	try {
		const s = JSON.stringify(v);
		return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
	} catch {
		const s = String(v);
		return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
	}
}

// Check if running in vibe mode, CLI mode, or server mode
if (process.argv[2] === "cli") {
	// CLI mode: interactive conversation
	// Check if a mode was specified as the 3rd argument
	const mode = process.argv[3] || "default";
	runCliMode(mode).catch(error => {
		log.error("CLI failed:", error);
		process.exit(1);
	});
} else if (process.argv[2] === "workflow") {
	// Workflow mode: non-interactive autonomous run
	const kind = process.argv[3] || "getting-started-guide";
	runWorkflowMode(kind)
		.then(() => {
			// runWorkflowMode exits the process on success
		})
		.catch(error => {
			log.error("Workflow mode failed:", error);
			process.exit(1);
		});
} else {
	// Default: show usage
	log.info("\nUsage:");
	log.info("  npm run cli                             - Start interactive CLI mode");
	log.info("  npm run workflow                        - Run workflow mode");
	log.info("  npm run workflow:getting-started        - Run getting-started workflow");
	log.info("  npm run workflow:architecture           - Run architecture workflow");
	log.info("  npm run workflow:architecture-doc       - Run architecture-doc workflow (architecture.md only)");
	log.info("  npm run workflow:architecture-update    - Run architecture update workflow");
	log.info("  npm run workflow:code-docs <url>       - Checkout URL, generate and deploy docs (E2B)");
	log.info("  npm run workflow:code-to-docs <url>    - Prepare docs only (steps 1–5) into ./api-docs or --outdir");
	log.info("  npm run workflow:docs-to-site <dir>    - Deploy prepared docs (steps 6–7) from <dir> [--project-name]");
	log.info(
		"  npm run workflow:citations-graph <file> - Generate one Mermaid graph: <filename> -> sections -> citations (writes <file>.citation.md)",
	);
	log.info("");
	log.info("Built versions:");
	log.info("  npm run cli:build                       - Build and run CLI mode");
	log.info("  npm run workflow:build:getting-started  - Build and run getting-started workflow");
	log.info("  npm run workflow:build:architecture     - Build and run architecture workflow");
	log.info("  npm run workflow:build:architecture-update - Build and run architecture update workflow");
	log.info(
		"  npm run workflow:build:citations-graph <file> - Build and run citations-graph workflow (writes <file>.citation.md)",
	);
	process.exit(0);
}
