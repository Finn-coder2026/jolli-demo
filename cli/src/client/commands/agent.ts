/**
 * Agent Commands Module
 *
 * Handles CLI agent commands for interactive chat with local tool execution.
 *
 * Architecture:
 * - Server owns agent session (history, model selection, agent loop)
 * - CLI acts as remote tool host (executes tools locally)
 * - HTTP POST for client→server (messages, tool results)
 * - Mercure SSE for server→client (streaming responses, tool calls)
 */

import { getConfig } from "../../shared/config";
import { getLog, logError } from "../../shared/logger";
import { loadSources } from "../../shared/Sources";
import {
	type AgentConvo,
	type AgentConvoClient,
	type AgentEvent,
	type ContentChunkEvent,
	createAgentConvoClient,
	createMercureSubscription,
	createSSESubscription,
	type MercureSubscription,
	type ToolCallRequestEvent,
} from "../agent";
import { loadAuthToken } from "../auth/config";
import { findProjectRoot } from "../../shared/ProjectRoot";
import { createToolHost, type ToolHost } from "./AgentToolHost";
import readline from "node:readline";
import type { Command } from "commander";

const config = getConfig();
const logger = getLog(import.meta);

// =============================================================================
// SECTION: Types
// =============================================================================

/**
 * Tool manifest entry describing a tool available for execution
 */
export interface ToolManifestEntry {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Record<string, unknown>;
	readonly requiresConfirmation?: boolean;
}

/**
 * Complete tool manifest sent to server on connection
 */
export interface ToolManifest {
	readonly tools: ReadonlyArray<ToolManifestEntry>;
}

/**
 * Agent session configuration
 */
export interface AgentSessionConfig {
	readonly workspaceRoot: string;
	readonly toolManifest: ToolManifest;
}

/**
 * Pending tool confirmation state
 */
interface PendingConfirmation {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly args: Record<string, unknown>;
	readonly message: string;
}

/**
 * Active agent session state
 */
interface ActiveSession {
	readonly convo: AgentConvo;
	readonly client: AgentConvoClient;
	readonly toolHost: ToolHost;
	readonly authToken: string;
	subscription: MercureSubscription | null;
	isStreaming: boolean;
	pendingChunks: Array<ContentChunkEvent>;
	nextChunkSeq: number;
	awaitingResponse: boolean;
	thinkingIndicatorVisible: boolean;
	pendingConfirmation: PendingConfirmation | null;
}

// =============================================================================
// SECTION: Constants
// =============================================================================

const CLIENT_VERSION = "0.1.0";

// ANSI colors for terminal output
const COLORS = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	blue: "\x1b[34m",
};

// =============================================================================
// SECTION: Helper Functions
// =============================================================================

/**
 * Creates the default tool manifest from the tool host.
 */
function createDefaultToolManifest(toolHost: ToolHost): ToolManifest {
	return toolHost.getManifest();
}

/**
 * Gets the workspace root directory by traversing up to find `.jolli/`.
 * Falls back to `process.cwd()` when no `.jolli` directory is found
 * (agent can still work without `jolli init`).
 */
async function getWorkspaceRoot(): Promise<string> {
	return (await findProjectRoot()) ?? process.cwd();
}

async function loadWorkspaceSources(
	workspaceRoot: string,
): Promise<Array<{ name: string; path: string; sourceId?: number }>> {
	try {
		const sourcesConfig = await loadSources(workspaceRoot);
		return Object.entries(sourcesConfig.sources)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, entry]) => ({
				name,
				path: entry.path,
				...(entry.sourceId !== undefined ? { sourceId: entry.sourceId } : {}),
			}));
	} catch (error) {
		logError(logger, error, "Failed to load workspace sources");
		return [];
	}
}

/**
 * Formats a timestamp for display.
 */
function formatTime(timestamp: string): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString();
}

/**
 * Prints a colored message to the console.
 */
function printColored(color: string, prefix: string, message: string): void {
	console.log(`${color}${prefix}${COLORS.reset} ${message}`);
}

/**
 * Prints the assistant's streamed response.
 */
function printStreamedResponse(content: string): void {
	process.stdout.write(content);
}

/**
 * Shows a transient "thinking" indicator on the current line.
 */
function showThinkingIndicator(session: ActiveSession): void {
	if (!session.thinkingIndicatorVisible) {
		process.stdout.write(`${COLORS.dim}Assistant is thinking...${COLORS.reset}`);
		session.thinkingIndicatorVisible = true;
	}
}

/**
 * Clears the current line if a transient indicator is visible.
 */
function clearThinkingIndicator(session: ActiveSession): void {
	if (session.thinkingIndicatorVisible) {
		process.stdout.write("\r\x1b[K");
		session.thinkingIndicatorVisible = false;
	}
}

/**
 * Prints a newline after streaming is complete.
 */
function finishStreamedResponse(): void {
	console.log();
}

// =============================================================================
// SECTION: Session Management
// =============================================================================

let _activeSession: ActiveSession | null = null;

/**
 * Handles tool confirmation response from user.
 */
async function handleConfirmation(session: ActiveSession, confirmed: boolean, rl: readline.Interface): Promise<void> {
	const pending = session.pendingConfirmation;
	if (!pending) {
		printColored(COLORS.yellow, "[Info]", "No pending confirmation");
		rl.prompt();
		return;
	}

	session.pendingConfirmation = null;

	if (confirmed) {
		printColored(COLORS.green, "[Confirm]", `Executing ${pending.toolName}...`);

		try {
			// Re-execute with skipConfirmation = true
			const result = await session.toolHost.execute(pending.toolName, pending.args, true);

			if (result.success) {
				printColored(COLORS.green, "[Tool]", `${pending.toolName} completed`);
				logger.debug("Tool result: %s", result.output.slice(0, 200));
			} else {
				printColored(COLORS.red, "[Tool]", `${pending.toolName} failed: ${result.error}`);
			}

			// Send result back to server
			await session.client.sendToolResult(session.convo.id, pending.toolCallId, result.output, result.error);
		} catch (error) {
			logError(logger, error, "Tool execution error");
			const errorMessage = error instanceof Error ? error.message : String(error);
			printColored(COLORS.red, "[Tool]", `Error: ${errorMessage}`);
			await session.client.sendToolResult(session.convo.id, pending.toolCallId, "", errorMessage);
		}
	} else {
		printColored(COLORS.yellow, "[Confirm]", `Cancelled ${pending.toolName}`);
		// Send cancellation as an error
		await session.client.sendToolResult(
			session.convo.id,
			pending.toolCallId,
			"",
			"Tool execution cancelled by user",
		);
	}

	// Wait a bit before showing prompt
	setTimeout(() => {
		if (!session.isStreaming) {
			rl.prompt();
		}
	}, 100);
}

/**
 * Handles incoming Mercure events.
 */
async function handleMercureEvent(event: AgentEvent, session: ActiveSession): Promise<void> {
	switch (event.type) {
		case "connected":
			logger.info("Connected to conversation stream");
			break;

		case "typing":
			// Show typing indicator
			if (!session.isStreaming) {
				showThinkingIndicator(session);
			}
			break;

		case "content_chunk": {
			const chunkEvent = event as ContentChunkEvent;
			// Clear typing indicator on first chunk
			if (!session.isStreaming) {
				clearThinkingIndicator(session);
				session.isStreaming = true;
				session.awaitingResponse = false;
				if (chunkEvent.seq === 0) {
					session.pendingChunks = [];
					session.nextChunkSeq = 0;
				}
			}
			// Buffer chunks and print in order
			session.pendingChunks.push(chunkEvent);
			session.pendingChunks.sort((a, b) => a.seq - b.seq);
			while (session.pendingChunks.length > 0 && session.pendingChunks[0].seq === session.nextChunkSeq) {
				const chunk = session.pendingChunks.shift();
				if (chunk) {
					printStreamedResponse(chunk.content);
					session.nextChunkSeq++;
				}
			}
			break;
		}

			case "tool_call_request": {
				const toolEvent = event as ToolCallRequestEvent;
				// Finish any streaming in progress
				if (session.isStreaming) {
					finishStreamedResponse();
					session.isStreaming = false;
				}
				clearThinkingIndicator(session);
				session.awaitingResponse = false;
				printColored(COLORS.yellow, "[Tool]", `Executing ${toolEvent.name}...`);

				// Execute tool locally
				try {
					// First execution without confirmation
					const result = await session.toolHost.execute(toolEvent.name, toolEvent.arguments);

					// Handle confirmation required
					if (result.error === "CONFIRMATION_REQUIRED" && result.confirmationMessage) {
						printColored(COLORS.yellow, "[Confirm]", result.confirmationMessage);

						// Store pending confirmation for REPL handler
						session.pendingConfirmation = {
							toolCallId: toolEvent.toolCallId,
							toolName: toolEvent.name,
							args: toolEvent.arguments,
							message: result.confirmationMessage,
						};

						// Don't send result yet - wait for user confirmation
						return;
					}

					if (result.success) {
						printColored(COLORS.green, "[Tool]", `${toolEvent.name} completed`);
						logger.debug("Tool result: %s", result.output.slice(0, 200));
					} else {
						printColored(COLORS.red, "[Tool]", `${toolEvent.name} failed: ${result.error}`);
					}

					// Send result back to server
					await session.client.sendToolResult(
						session.convo.id,
						toolEvent.toolCallId,
						result.output,
						result.error,
					);
				} catch (error) {
					logError(logger, error, "Tool execution error");
					const errorMessage = error instanceof Error ? error.message : String(error);
					printColored(COLORS.red, "[Tool]", `Error: ${errorMessage}`);

					// Send error back to server
					await session.client.sendToolResult(session.convo.id, toolEvent.toolCallId, "", errorMessage);
				}
				break;
			}

		case "tool_event": {
			// Log tool status updates
			const toolStatus = event as { event: { tool: string; status?: string } };
			logger.debug("Tool status: %s - %s", toolStatus.event.tool, toolStatus.event.status);
			break;
		}

			case "message_complete":
				// Finish streaming and show prompt
				if (session.isStreaming) {
					finishStreamedResponse();
					session.isStreaming = false;
					session.pendingChunks = [];
					session.nextChunkSeq = 0;
				}
				clearThinkingIndicator(session);
				session.awaitingResponse = false;
				console.log();
				break;

			case "error": {
				const errorEvent = event as { error: string };
				if (session.isStreaming) {
					finishStreamedResponse();
					session.isStreaming = false;
					session.pendingChunks = [];
					session.nextChunkSeq = 0;
				}
				clearThinkingIndicator(session);
				session.awaitingResponse = false;
				printColored(COLORS.red, "[Error]", errorEvent.error);
				break;
			}

		case "user_joined":
		case "user_left":
			// Ignore these events in CLI
			break;

		default:
			logger.debug("Unknown event type: %s", event.type);
	}
}

/**
 * Starts the interactive REPL session.
 */
async function startRepl(session: ActiveSession): Promise<void> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: `${COLORS.cyan}You:${COLORS.reset} `,
	});

	console.log(`${COLORS.bold}Agent Session Started${COLORS.reset}`);
	console.log(`Workspace: ${session.toolHost.config.workspaceRoot}`);
	console.log(`Session ID: ${session.convo.id}`);
	console.log(`Tools: ${session.toolHost.config.allowedTools.size} available`);
	console.log();
	console.log(`Type your message and press Enter. Commands:`);
	console.log(`  ${COLORS.dim}/quit${COLORS.reset}  - Exit the session`);
	console.log(`  ${COLORS.dim}/clear${COLORS.reset} - Clear the screen`);
	console.log(`  ${COLORS.dim}/help${COLORS.reset}  - Show help`);
	console.log(`  ${COLORS.dim}/yes${COLORS.reset}   - Confirm pending tool execution`);
	console.log(`  ${COLORS.dim}/no${COLORS.reset}    - Cancel pending tool execution`);
	console.log();

	// Print intro message if present
	const introMessage = session.convo.messages.find(m => m.role === "assistant");
	if (introMessage?.content) {
		console.log(`${COLORS.green}Assistant:${COLORS.reset} ${introMessage.content}`);
		console.log();
	}

	// Re-subscribe with wrapped handler BEFORE showing prompt
	// This ensures SSE connection is established before user can type
	await setupWrappedSubscription(session, rl);

	rl.prompt();

	rl.on("line", async (input: string) => {
		const trimmed = input.trim();
		const normalizedInput = trimmed.toLowerCase();

		// If a tool confirmation is pending, treat bare yes/no as confirmation
		// and block regular chat messages until resolved.
		if (session.pendingConfirmation && !trimmed.startsWith("/")) {
			if (normalizedInput === "yes" || normalizedInput === "y") {
				await handleConfirmation(session, true, rl);
				return;
			}

			if (normalizedInput === "no" || normalizedInput === "n") {
				await handleConfirmation(session, false, rl);
				return;
			}

			printColored(COLORS.yellow, "[Confirm]", "Pending tool confirmation. Type /yes or /no.");
			rl.prompt();
			return;
		}

		// Handle commands
		if (trimmed.startsWith("/")) {
			const command = trimmed.toLowerCase();

			if (command === "/quit" || command === "/exit" || command === "/q") {
				console.log("Goodbye!");
				rl.close();
				return;
			}

			if (command === "/clear" || command === "/cls") {
				console.clear();
				rl.prompt();
				return;
			}

			if (command === "/help" || command === "/?") {
				console.log();
				console.log(`${COLORS.bold}Available Commands:${COLORS.reset}`);
				console.log(`  /quit, /exit, /q  - Exit the session`);
				console.log(`  /clear, /cls      - Clear the screen`);
				console.log(`  /help, /?         - Show this help`);
				console.log(`  /yes, /y          - Confirm pending tool execution`);
				console.log(`  /no, /n           - Cancel pending tool execution`);
				console.log();
				rl.prompt();
				return;
			}

			if (command === "/yes" || command === "/y") {
				await handleConfirmation(session, true, rl);
				return;
			}

			if (command === "/no" || command === "/n") {
				await handleConfirmation(session, false, rl);
				return;
			}

			printColored(COLORS.yellow, "[Info]", `Unknown command: ${trimmed}`);
			rl.prompt();
			return;
		}

		// Skip empty input
		if (!trimmed) {
			rl.prompt();
			return;
		}

		// Send message to server
		try {
			session.awaitingResponse = true;
			showThinkingIndicator(session);
			await session.client.sendMessage(session.convo.id, trimmed);
		} catch (error) {
			clearThinkingIndicator(session);
			session.awaitingResponse = false;
			logError(logger, error, "Failed to send message");
			const errorMessage = error instanceof Error ? error.message : String(error);
			printColored(COLORS.red, "[Error]", errorMessage);
		}

		// Wait a bit before showing prompt (to allow streaming to start)
		setTimeout(() => {
			if (!session.isStreaming && !session.awaitingResponse) {
				rl.prompt();
			}
		}, 100);
	});

	rl.on("close", () => {
		// Cleanup
		if (session.subscription) {
			session.subscription.close();
		}
		_activeSession = null;
		process.exit(0);
	});

}

/**
 * Sets up the wrapped subscription with prompt callback.
 * Must be called before showing prompt to ensure SSE is connected.
 */
async function setupWrappedSubscription(session: ActiveSession, rl: readline.Interface): Promise<void> {
	// Re-show prompt after message complete
	const originalHandler = handleMercureEvent;
	const wrappedHandler = async (event: AgentEvent, sess: ActiveSession): Promise<void> => {
		await originalHandler(event, sess);
		if (event.type === "message_complete" || event.type === "error") {
			rl.prompt();
		}
	};

	// Close existing subscription
	if (session.subscription) {
		session.subscription.close();
	}

	// Re-subscribe with the wrapped handler
	const mercureConfig = await session.client.getMercureConfig();
	const wrappedCallbacks = {
		onEvent: async (event: AgentEvent) => {
			await wrappedHandler(event, session);
		},
		onError: (error: Error) => {
			printColored(COLORS.red, "[Connection]", error.message);
		},
		onReconnecting: (attempt: number) => {
			printColored(COLORS.yellow, "[Connection]", `Reconnecting (attempt ${attempt})...`);
		},
		onReconnected: (attempts: number) => {
			printColored(COLORS.green, "[Connection]", `Reconnected after ${attempts} attempts`);
		},
		onDisconnected: () => {
			printColored(COLORS.red, "[Connection]", "Disconnected from server");
		},
	};

	if (mercureConfig.enabled && mercureConfig.hubUrl) {
		const tokenResponse = await session.client.getMercureToken(session.convo.id);
		session.subscription = createMercureSubscription(
			{
				hubUrl: mercureConfig.hubUrl,
				subscriberToken: tokenResponse.token,
				topic: tokenResponse.topics[0],
			},
			wrappedCallbacks,
		);
	} else {
		// Fallback to direct SSE when Mercure is not available
		session.subscription = createSSESubscription(
			{
				serverUrl: config.JOLLI_URL,
				convoId: session.convo.id,
				authToken: session.authToken,
			},
			wrappedCallbacks,
		);
	}

	// Wait a moment for the SSE connection to establish
	await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Starts a new agent session.
 */
async function startAgentSession(): Promise<void> {
	const token = await loadAuthToken();
	if (!token) {
		console.error("Not authenticated. Please run `jolli auth login` first.");
		process.exit(1);
	}

	const workspaceRoot = await getWorkspaceRoot();
	const workspaceSources = await loadWorkspaceSources(workspaceRoot);
	const toolHost = createToolHost(workspaceRoot, {
		allowedRoots: workspaceSources.map(source => source.path),
		sourceNames: workspaceSources.map(source => source.name),
	});
	const toolManifest = createDefaultToolManifest(toolHost);
	const client = createAgentConvoClient(token);

	console.log(`${COLORS.dim}Starting agent session...${COLORS.reset}`);
	console.log(`${COLORS.dim}Workspace: ${workspaceRoot}${COLORS.reset}`);
	if (workspaceSources.length > 0) {
		console.log(`${COLORS.dim}Sources:${COLORS.reset}`);
		for (const source of workspaceSources) {
			const label = source.sourceId !== undefined ? `${source.name} (id:${source.sourceId})` : source.name;
			console.log(`${COLORS.dim}  - ${label}: ${source.path}${COLORS.reset}`);
		}
	}
	console.log(`${COLORS.dim}Server: ${config.JOLLI_URL}${COLORS.reset}`);
	console.log();

	try {
		// Create conversation
		const convo = await client.createConvo({
			workspaceRoot,
			toolManifest,
			clientVersion: CLIENT_VERSION,
			...(workspaceSources.length > 0 ? { sources: workspaceSources } : {}),
		});

		logger.info("Created conversation %d", convo.id);

		// Get Mercure config
		const mercureConfig = await client.getMercureConfig();

			// Create session object
			const session: ActiveSession = {
				convo,
				client,
				toolHost,
				authToken: token,
				subscription: null,
				isStreaming: false,
				pendingChunks: [],
				nextChunkSeq: 0,
				awaitingResponse: false,
				thinkingIndicatorVisible: false,
				pendingConfirmation: null,
			};

		let subscription: MercureSubscription | null = null;

		// Event handler callbacks (shared between Mercure and SSE)
		const eventCallbacks = {
			onEvent: async (event: AgentEvent) => {
				await handleMercureEvent(event, session);
			},
			onError: (error: Error) => {
				printColored(COLORS.red, "[Connection]", error.message);
			},
			onReconnecting: (attempt: number) => {
				printColored(COLORS.yellow, "[Connection]", `Reconnecting (attempt ${attempt})...`);
			},
			onReconnected: (attempts: number) => {
				printColored(COLORS.green, "[Connection]", `Reconnected after ${attempts} attempts`);
			},
		};

		if (mercureConfig.enabled && mercureConfig.hubUrl) {
			// Use Mercure for real-time streaming
			const tokenResponse = await client.getMercureToken(convo.id);

			subscription = createMercureSubscription(
				{
					hubUrl: mercureConfig.hubUrl,
					subscriberToken: tokenResponse.token,
					topic: tokenResponse.topics[0],
				},
				eventCallbacks,
			);

			logger.info("Using Mercure for real-time streaming");
		} else {
			// Fallback to direct SSE when Mercure is not available
			logger.info("Mercure not available, using direct SSE fallback");
			printColored(COLORS.yellow, "[Connection]", "Using direct SSE (Mercure not configured)");

			subscription = createSSESubscription(
				{
					serverUrl: config.JOLLI_URL,
					convoId: convo.id,
					authToken: token,
				},
				eventCallbacks,
			);
		}

		session.subscription = subscription;
		_activeSession = session;

		// Start REPL
		await startRepl(session);
	} catch (error) {
		logError(logger, error, "Failed to start agent session");
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`Error: ${errorMessage}`);
		process.exit(1);
	}
}

/**
 * Lists active agent sessions.
 */
async function listSessions(): Promise<void> {
	const token = await loadAuthToken();
	if (!token) {
		console.error("Not authenticated. Please run `jolli auth login` first.");
		process.exit(1);
	}

	const client = createAgentConvoClient(token);

	try {
		const convos = await client.listConvos();

		if (convos.length === 0) {
			console.log("No agent sessions found.");
			return;
		}

		console.log(`${COLORS.bold}Agent Sessions:${COLORS.reset}`);
		console.log();

		for (const convo of convos) {
			const metadata = convo.metadata;
			const messageCount = convo.messages.length;
			const lastUpdated = formatTime(convo.updatedAt);

			console.log(`  ${COLORS.cyan}ID:${COLORS.reset} ${convo.id}`);
			console.log(`  ${COLORS.dim}Workspace:${COLORS.reset} ${metadata?.workspaceRoot || "Unknown"}`);
			console.log(`  ${COLORS.dim}Messages:${COLORS.reset} ${messageCount}`);
			console.log(`  ${COLORS.dim}Last active:${COLORS.reset} ${lastUpdated}`);
			console.log();
		}
	} catch (error) {
		logError(logger, error, "Failed to list sessions");
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`Error: ${errorMessage}`);
		process.exit(1);
	}
}

/**
 * Resumes an existing agent session.
 */
async function resumeSession(sessionId: string): Promise<void> {
	const token = await loadAuthToken();
	if (!token) {
		console.error("Not authenticated. Please run `jolli auth login` first.");
		process.exit(1);
	}

	const convoId = Number.parseInt(sessionId);
	if (Number.isNaN(convoId)) {
		console.error("Invalid session ID. Please provide a numeric ID.");
		process.exit(1);
	}

	const workspaceRoot = await getWorkspaceRoot();
	const workspaceSources = await loadWorkspaceSources(workspaceRoot);
	const toolHost = createToolHost(workspaceRoot, {
		allowedRoots: workspaceSources.map(source => source.path),
		sourceNames: workspaceSources.map(source => source.name),
	});
	const client = createAgentConvoClient(token);

	console.log(`${COLORS.dim}Resuming session ${convoId}...${COLORS.reset}`);
	console.log();

	try {
		// Get existing conversation
		const convo = await client.getConvo(convoId);

		logger.info("Resuming conversation %d with %d messages", convo.id, convo.messages.length);

		// Get Mercure config
		const mercureConfig = await client.getMercureConfig();

			// Create session object
			const session: ActiveSession = {
				convo,
				client,
				toolHost,
				authToken: token,
				subscription: null,
				isStreaming: false,
				pendingChunks: [],
				nextChunkSeq: 0,
				awaitingResponse: false,
				thinkingIndicatorVisible: false,
				pendingConfirmation: null,
			};

		// Event handler callbacks (shared between Mercure and SSE)
		const eventCallbacks = {
			onEvent: async (event: AgentEvent) => {
				await handleMercureEvent(event, session);
			},
			onError: (error: Error) => {
				printColored(COLORS.red, "[Connection]", error.message);
			},
			onReconnecting: (attempt: number) => {
				printColored(COLORS.yellow, "[Connection]", `Reconnecting (attempt ${attempt})...`);
			},
			onReconnected: (attempts: number) => {
				printColored(COLORS.green, "[Connection]", `Reconnected after ${attempts} attempts`);
			},
		};

		let subscription: MercureSubscription | null = null;

		if (mercureConfig.enabled && mercureConfig.hubUrl) {
			// Use Mercure for real-time streaming
			const tokenResponse = await client.getMercureToken(convo.id);

			subscription = createMercureSubscription(
				{
					hubUrl: mercureConfig.hubUrl,
					subscriberToken: tokenResponse.token,
					topic: tokenResponse.topics[0],
				},
				eventCallbacks,
			);

			logger.info("Using Mercure for real-time streaming");
		} else {
			// Fallback to direct SSE when Mercure is not available
			logger.info("Mercure not available, using direct SSE fallback");
			printColored(COLORS.yellow, "[Connection]", "Using direct SSE (Mercure not configured)");

			subscription = createSSESubscription(
				{
					serverUrl: config.JOLLI_URL,
					convoId: convo.id,
					authToken: token,
				},
				eventCallbacks,
			);
		}

		session.subscription = subscription;
		_activeSession = session;

		// Print conversation history
		console.log(`${COLORS.bold}Conversation History:${COLORS.reset}`);
		console.log();

		for (const msg of convo.messages) {
			if (msg.role === "user" && msg.content) {
				console.log(`${COLORS.cyan}You:${COLORS.reset} ${msg.content}`);
			} else if (msg.role === "assistant" && msg.content) {
				console.log(`${COLORS.green}Assistant:${COLORS.reset} ${msg.content}`);
			}
		}
		console.log();

		// Start REPL
		await startRepl(session);
	} catch (error) {
		logError(logger, error, "Failed to resume session");
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`Error: ${errorMessage}`);
		process.exit(1);
	}
}

// =============================================================================
// SECTION: Command Registration
// =============================================================================

/**
 * Registers agent commands on the provided Commander program.
 */
export function registerAgentCommands(program: Command): void {
	const agentCommand = program
		.command("agent")
		.description("Interactive LLM agent with local tool execution");

	// Start a new agent session (default action)
	agentCommand
		.command("start", { isDefault: true })
		.description("Start a new agent session")
		.action(async () => {
			await startAgentSession();
		});

	// List sessions
	agentCommand
		.command("list")
		.alias("ls")
		.description("List agent sessions")
		.action(async () => {
			await listSessions();
		});

	// Resume an existing session
	agentCommand
		.command("resume <sessionId>")
		.description("Resume an existing agent session")
		.action(async (sessionId: string) => {
			await resumeSession(sessionId);
		});

	// Default action when just running `jolli agent`
	agentCommand.action(async () => {
		await startAgentSession();
	});
}

// =============================================================================
// SECTION: Exports
// =============================================================================

export { createDefaultToolManifest, getWorkspaceRoot, startAgentSession, listSessions, resumeSession, CLIENT_VERSION };
