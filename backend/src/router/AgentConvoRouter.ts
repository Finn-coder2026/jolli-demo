/**
 * Agent Conversation Router
 *
 * Handles agent conversations for both CLI workspace and web agent hub modes.
 * The CLI acts as a remote tool host while the backend runs JolliAgent.
 * Communication uses:
 * - HTTP POST for client→server (create convo, send messages, submit tool results)
 * - Mercure SSE for server→client (content chunks, tool call requests, message complete)
 *
 * This router extends the CollabConvo pattern for cli_workspace and agent_hub artifact types.
 */

import { type AgentEnvironment, createAgentEnvironment } from "../../../tools/jolliagent/src/direct/agentenv";
import type { Message, ToolCall, ToolDef } from "../../../tools/jolliagent/src/Types";
import { AgentChatAdapter } from "../adapters/AgentChatAdapter";
import {
	type AgentHubModeDefinition,
	getModeDefinition,
	inferDefaultMode,
	isValidMode,
} from "../adapters/ModeDefinitions";
import { getSeededConversationDefinition, getSeededConversationKinds } from "../adapters/SeededConversations";
import {
	AGENT_HUB_TOOL_NAMES,
	type AgentHubToolDeps,
	DESTRUCTIVE_TOOL_NAMES,
	executeAgentHubTool,
	getAgentHubToolDefinitions,
	isNavigationAction,
	MUTATION_TOOL_NAMES,
	validateToolArgs,
} from "../adapters/tools/AgentHubTools";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type {
	ArtifactType,
	CliWorkspaceMetadata,
	CollabConvo,
	CollabMessage,
	ImpactContext,
} from "../model/CollabConvo";
import { ChatService } from "../services/ChatService";
import { createMercureService } from "../services/MercureService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { getUserId, handleLookupError, isLookupError } from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Response, type Router } from "express";
import {
	type AgentHubConvoKind,
	type AgentHubMetadata,
	type AgentPlanPhase,
	isAgentHubMetadata,
	type PendingConfirmation,
	type UserInfo,
} from "jolli-common";

const log = getLog(import.meta);

/** Artifact types handled by this router */
const AGENT_ARTIFACT_TYPES: ReadonlyArray<ArtifactType> = ["cli_workspace", "agent_hub"];

// Mercure service for publishing conversation events
const mercureService = createMercureService();

/**
 * Active agent environments keyed by convo ID.
 * NOTE: In multi-tenant mode, convo IDs from different tenant schemas may collide.
 * This is safe as long as the router is instantiated per-tenant via createAgentConvoRouter.
 * If sharing a single router across tenants, these Maps need to be scoped by tenant key.
 */
const agentEnvironments = new Map<number, AgentEnvironment>();

// Pending tool calls waiting for results from CLI
interface PendingToolCall {
	call: ToolCall;
	resolve: (result: string) => void;
	reject: (error: Error) => void;
	timestamp: number;
	timeoutId: ReturnType<typeof setTimeout>;
}
const pendingToolCalls = new Map<string, PendingToolCall>();

// Pending tool confirmations waiting for user approval/denial (exec mode)
interface PendingToolConfirmation {
	call: ToolCall;
	resolve: (result: string) => void;
	reject: (error: Error) => void;
	timestamp: number;
	timeoutId: ReturnType<typeof setTimeout>;
	userId: number;
}
const pendingConfirmations = new Map<string, PendingToolConfirmation>();

// Tool call timeout in milliseconds (5 minutes)
const TOOL_CALL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Connection tracking for direct SSE streams (fallback when Mercure is unavailable)
 */
interface AgentConvoConnection {
	userId: number;
	res: Response;
	keepAliveInterval: NodeJS.Timeout;
}

const agentConvoConnections = new Map<number, Set<AgentConvoConnection>>();

/**
 * Tool manifest entry from CLI
 */
interface ToolManifestEntry {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Record<string, unknown>;
}

/**
 * Tool manifest sent from CLI on convo creation
 */
interface ToolManifest {
	readonly tools: ReadonlyArray<ToolManifestEntry>;
}

interface WorkspaceSourceMapping {
	readonly name: string;
	readonly path: string;
	readonly sourceId?: number;
}

/**
 * Request body for creating an agent convo.
 * - CLI workspace: sends workspaceRoot, toolManifest, clientVersion, sources
 * - Agent hub: sends optional title, artifactType: "agent_hub"
 */
interface CreateAgentConvoRequest {
	readonly artifactType?: ArtifactType;
	readonly title?: string;
	readonly workspaceRoot?: string;
	readonly toolManifest?: ToolManifest;
	readonly clientVersion?: string;
	readonly sources?: ReadonlyArray<WorkspaceSourceMapping>;
}

/**
 * Request body for submitting tool results
 */
interface ToolResultRequest {
	readonly toolCallId: string;
	readonly output: string;
	readonly error?: string;
}

/**
 * Checks if an artifact type is handled by this router
 */
function isAgentArtifactType(type: ArtifactType): boolean {
	return AGENT_ARTIFACT_TYPES.includes(type);
}

/**
 * Broadcasts an event to a conversation via both direct SSE connections and Mercure.
 * Direct SSE is used as a fallback when Mercure is not available.
 */
function broadcastToConvo(convoId: number, event: Record<string, unknown>, chatService: ChatService): void {
	const eventType = (event.type as string) ?? "unknown";

	// Broadcast to direct SSE connections (fallback for when Mercure is unavailable)
	const connections = agentConvoConnections.get(convoId);
	const connectionCount = connections?.size ?? 0;
	log.info("broadcastToConvo: convo %d, event %s, %d SSE connections", convoId, eventType, connectionCount);
	if (connections) {
		for (const conn of connections) {
			try {
				chatService.sendSSE(conn.res, event);
			} catch (error) {
				log.error(error, "Failed to broadcast to agent convo SSE connection");
			}
		}
	}

	// Also publish to Mercure Hub for distributed SSE (fire and forget)
	mercureService.publishConvoEvent(convoId, eventType, event).catch(err => {
		log.warn(err, "Failed to publish agent convo event to Mercure: %s", eventType);
	});
}

/**
 * Sends an event to both the direct SSE response AND to Mercure (for other subscribers).
 * Used when streaming on the POST /messages response to keep the connection alive.
 */
function sendToDirectAndMercure(
	res: Response,
	convoId: number,
	event: Record<string, unknown>,
	chatService: ChatService,
): void {
	const eventType = (event.type as string) ?? "unknown";

	// Send directly to the requester via SSE
	chatService.sendSSE(res, event);

	// Also publish to Mercure for other subscribers (e.g., other SSE connections)
	mercureService.publishConvoEvent(convoId, eventType, event).catch(err => {
		log.warn(err, "Failed to publish agent convo event to Mercure: %s", eventType);
	});
}

/**
 * Generates a unique tool call ID
 */
function generateToolCallId(): string {
	return `tc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Checks if a tool should be executed on the CLI side
 */
function isClientSideTool(toolName: string, toolManifest: ToolManifest | undefined): boolean {
	if (!toolManifest) {
		return false;
	}
	return toolManifest.tools.some(t => t.name === toolName);
}

/**
 * Converts CLI tool manifest to ToolDef array for the agent.
 * This allows Claude to make proper tool_use calls instead of outputting XML text.
 */
function convertToolManifestToToolDefs(toolManifest: ToolManifest | undefined): Array<ToolDef> {
	if (!toolManifest || toolManifest.tools.length === 0) {
		return [];
	}
	return toolManifest.tools.map(entry => ({
		name: entry.name,
		description: entry.description,
		parameters: entry.inputSchema,
	}));
}

/**
 * Finds the index of the last user message in a message array by scanning backward.
 * Returns -1 if no user message is found.
 */
function findLastUserMessageIndex(messages: ReadonlyArray<CollabMessage>): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") {
			return i;
		}
	}
	return -1;
}

/**
 * Finds the user message index to retry from.
 * If messageIndex is provided, scans backward from that index to find the preceding user message.
 * If messageIndex is omitted, falls back to the last user message.
 * Returns "invalid_index" if messageIndex is out of bounds or not an integer.
 */
function findTargetUserIndex(messages: ReadonlyArray<CollabMessage>, messageIndex?: number): number | "invalid_index" {
	if (messageIndex === undefined) {
		return findLastUserMessageIndex(messages);
	}

	if (!Number.isInteger(messageIndex) || messageIndex < 0 || messageIndex >= messages.length) {
		return "invalid_index";
	}

	// Scan backward from the position before messageIndex to find the preceding user message
	for (let i = messageIndex - 1; i >= 0; i--) {
		if (messages[i].role === "user") {
			return i;
		}
	}
	return -1;
}

/**
 * Builds an inline reminder appended to the user message (in-memory only, not persisted)
 * so the LLM sees a nudge to call `update_plan` at an optimal position in its context window.
 * The reminder is phase-aware to enforce the planning → approval → executing → complete lifecycle.
 * Returns an empty string for non-agent-hub convos or non-plan modes.
 */
function buildPlanReminder(convo: CollabConvo): string {
	if (convo.artifactType !== "agent_hub") {
		return "";
	}
	const meta = isAgentHubMetadata(convo.metadata) ? convo.metadata : undefined;
	const mode = inferDefaultMode(meta);
	const modeDef = getModeDefinition(mode);

	// Only plan mode gets plan reminders
	if (!modeDef.planReminderEnabled) {
		// Still append seeded conversation turn reminder if applicable
		let reminder = "";
		if (meta?.convoKind) {
			const definition = getSeededConversationDefinition(meta.convoKind);
			if (definition?.turnReminder) {
				reminder += `\n\n${definition.turnReminder}`;
			}
		}
		return reminder;
	}

	const phase = meta?.planPhase ?? "planning";

	// Phase-based reminder
	let reminder = "";
	if (!meta?.plan) {
		// No plan yet — force creation of an initial plan
		reminder =
			"\n\n[IMPORTANT: You MUST call update_plan before responding. The user's plan panel is empty — create an initial plan based on what you know so far.]";
	} else if (phase === "planning") {
		// Plan exists but still in planning — remind to refine AND enforce the approval gate
		reminder =
			"\n\n[Call update_plan to refine the plan if the user provided new information." +
			" When the plan is ready, you MUST present it to the user and explicitly ask" +
			' "Would you like me to execute this plan?" — do NOT set the phase to' +
			' "executing" or "complete" until the user confirms. Stay in "planning" phase.]';
	} else if (phase === "executing") {
		// Executing phase — remind to update progress, not skip ahead
		reminder =
			'\n\n[Update the plan with progress via update_plan. Only set phase to "complete" after ALL steps are done.]';
	}

	// Append seeded conversation turn reminder if applicable
	if (meta?.convoKind) {
		const definition = getSeededConversationDefinition(meta.convoKind);
		if (definition?.turnReminder) {
			reminder += `\n\n${definition.turnReminder}`;
		}
	}

	return reminder;
}

/**
 * Generates an auto-title from the first user message (max 50 chars)
 */
function generateAutoTitle(message: string): string {
	const trimmed = message.trim();
	if (trimmed.length <= 50) {
		return trimmed;
	}
	return `${trimmed.slice(0, 47)}...`;
}

/**
 * Creates the AgentConvoRouter
 */
export function createAgentConvoRouter(
	collabConvoDaoProvider: DaoProvider<CollabConvoDao>,
	tokenUtil: TokenUtil<UserInfo>,
	agentAdapter?: AgentChatAdapter,
	toolDeps?: AgentHubToolDeps,
): Router {
	const router = express.Router();
	const chatService = new ChatService();

	function getCollabConvoDao(): CollabConvoDao {
		return collabConvoDaoProvider.getDao(getTenantContext());
	}

	// POST /api/agent/convos - Create new agent conversation
	router.post("/", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const body = req.body as CreateAgentConvoRequest;
			const artifactType: ArtifactType = body.artifactType ?? "cli_workspace";

			if (artifactType === "agent_hub") {
				return await createAgentHubConvo(res, userId, body.title);
			}

			return await createCliWorkspaceConvo(res, userId, body);
		} catch (error) {
			log.error(error, "Error creating agent convo");
			res.status(500).json({ error: "Failed to create conversation" });
		}
	});

	/**
	 * Creates a CLI workspace conversation
	 */
	async function createCliWorkspaceConvo(
		res: Response,
		userId: number,
		body: CreateAgentConvoRequest,
	): Promise<void> {
		const { workspaceRoot, toolManifest, clientVersion, sources } = body;

		// Build metadata - only include properties that are defined to satisfy exactOptionalPropertyTypes
		const metadata: CliWorkspaceMetadata = {
			...(workspaceRoot !== undefined && { workspaceRoot }),
			...(toolManifest !== undefined && { toolManifest }),
			...(clientVersion !== undefined && { clientVersion }),
			...(sources !== undefined && { sources }),
		};

		// Create intro message
		const introMessage: CollabMessage = {
			role: "assistant",
			content: buildCliIntroMessage(workspaceRoot, toolManifest, sources),
			timestamp: new Date().toISOString(),
		};

		const convo = await getCollabConvoDao().createCollabConvo({
			artifactType: "cli_workspace",
			artifactId: null,
			title: null,
			messages: [introMessage],
			metadata,
		});

		log.info("Created CLI workspace convo %d for user %d", convo.id, userId);
		res.status(201).json(convo);
	}

	/**
	 * Creates an agent hub conversation
	 */
	async function createAgentHubConvo(res: Response, userId: number, title?: string): Promise<void> {
		// Create intro message for web agent
		const introMessage: CollabMessage = {
			role: "assistant",
			content:
				"Hello! I'm your Jolli assistant. I can help you draft documents, search your knowledge base, summarize content, and answer questions. What would you like to work on?",
			timestamp: new Date().toISOString(),
		};

		const convo = await getCollabConvoDao().createCollabConvo({
			artifactType: "agent_hub",
			artifactId: null,
			title: title ?? null,
			messages: [introMessage],
			metadata: { mode: "exec" },
		});

		log.info("Created agent hub convo %d for user %d", convo.id, userId);
		res.status(201).json(convo);
	}

	// GET /api/agent/convos - List agent conversations
	router.get("/", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const limit = Number.parseInt(req.query.limit as string) || 50;
			const offset = Number.parseInt(req.query.offset as string) || 0;
			const artifactType: ArtifactType = (req.query.artifactType as ArtifactType) || "cli_workspace";

			const convos = await getCollabConvoDao().listByArtifactType(artifactType, limit, offset);

			// Include convoKind from metadata in the response for sidebar display
			const summaries = convos.map(c => {
				const meta = isAgentHubMetadata(c.metadata) ? c.metadata : undefined;
				return {
					...c,
					convoKind: meta?.convoKind,
				};
			});

			res.json(summaries);
		} catch (error) {
			log.error(error, "Error listing agent convos");
			res.status(500).json({ error: "Failed to list conversations" });
		}
	});

	// POST /api/agent/convos/seed/:kind - Get or create a seeded conversation
	router.post("/seed/:kind", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const kind = req.params.kind;
			const validKinds = getSeededConversationKinds();
			if (!validKinds.includes(kind as AgentHubConvoKind)) {
				return res.status(400).json({ error: `Unknown conversation kind: ${kind}` });
			}

			const convoKind = kind as AgentHubConvoKind;

			// Check for existing seeded convo (idempotent)
			const existing = await getCollabConvoDao().findSeededConvo("agent_hub", convoKind, userId);
			if (existing) {
				return res.status(200).json(existing);
			}

			// Look up the definition
			const definition = getSeededConversationDefinition(convoKind);
			if (!definition) {
				return res.status(400).json({ error: `No definition found for kind: ${kind}` });
			}

			// Create the seeded conversation
			const introMessage: CollabMessage = {
				role: "assistant",
				content: definition.introMessage,
				timestamp: new Date().toISOString(),
			};

			const convo = await getCollabConvoDao().createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: definition.title,
				messages: [introMessage],
				metadata: {
					plan: definition.plan,
					planPhase: definition.planPhase,
					mode: definition.defaultMode ?? "plan",
					convoKind,
					createdForUserId: userId,
				},
			});

			log.info("Created seeded convo %d (kind: %s) for user %d", convo.id, convoKind, userId);
			res.status(201).json(convo);
		} catch (error) {
			log.error(error, "Error creating seeded conversation");
			res.status(500).json({ error: "Failed to create seeded conversation" });
		}
	});

	// GET /api/agent/convos/:id - Get conversation details
	router.get("/:id", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (!isAgentArtifactType(convo.artifactType)) {
				return res.status(400).json({ error: "Not an agent conversation" });
			}

			res.json(convo);
		} catch (error) {
			log.error(error, "Error getting agent convo");
			res.status(500).json({ error: "Failed to get conversation" });
		}
	});

	// PATCH /api/agent/convos/:id - Update conversation title
	router.patch("/:id", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const { title } = req.body;
			if (!title || typeof title !== "string") {
				return res.status(400).json({ error: "Title is required" });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (!isAgentArtifactType(convo.artifactType)) {
				return res.status(400).json({ error: "Not an agent conversation" });
			}

			const updated = await getCollabConvoDao().updateTitle(id, title);
			res.json(updated);
		} catch (error) {
			log.error(error, "Error updating agent convo");
			res.status(500).json({ error: "Failed to update conversation" });
		}
	});

	// DELETE /api/agent/convos/:id - Delete conversation
	router.delete("/:id", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (!isAgentArtifactType(convo.artifactType)) {
				return res.status(400).json({ error: "Not an agent conversation" });
			}

			// Cleanup agent environment if exists
			const env = agentEnvironments.get(id);
			if (env) {
				await env.dispose();
				agentEnvironments.delete(id);
			}

			await getCollabConvoDao().deleteCollabConvo(id);

			log.info("Deleted agent convo %d (type: %s)", id, convo.artifactType);
			res.status(204).send();
		} catch (error) {
			log.error(error, "Error deleting agent convo");
			res.status(500).json({ error: "Failed to delete conversation" });
		}
	});

	// POST /api/agent/convos/:id/advance - Auto-advance a seeded conversation
	// Triggers the agent to proactively run tools and respond without a user message.
	// Idempotent: returns JSON if the conversation already has more than the intro message.
	router.post("/:id/advance", async (req: Request, res: Response) => {
		log.info("Received advance request for convo %s", req.params.id);
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (convo.artifactType !== "agent_hub") {
				return res.status(400).json({ error: "Not an agent hub conversation" });
			}

			// Idempotency: if the convo already has more than the intro message, skip
			if (convo.messages.length > 1) {
				return res.json({ status: "already_advanced" });
			}

			// Look up auto-advance prompt from seeded definition
			const meta = isAgentHubMetadata(convo.metadata) ? convo.metadata : undefined;
			if (!meta?.convoKind) {
				return res.status(400).json({ error: "Auto-advance not supported for this conversation" });
			}

			const definition = getSeededConversationDefinition(meta.convoKind);
			if (!definition?.autoAdvancePrompt) {
				return res.status(400).json({ error: "Auto-advance not supported for this conversation kind" });
			}

			// Set up SSE headers for streaming
			chatService.setupSSEHeaders(res);
			chatService.sendSSE(res, {
				type: "message_received",
				timestamp: new Date().toISOString(),
			});

			// Process agent response with the synthetic auto-advance prompt (not persisted)
			try {
				await processAgentResponse(res, id, userId, definition.autoAdvancePrompt, convo);
			} catch (error) {
				log.error(error, "Error processing auto-advance for convo %d", id);
				chatService.sendSSE(res, {
					type: "error",
					error: "Failed to auto-advance conversation",
					timestamp: new Date().toISOString(),
				});
			}

			res.end();
		} catch (error) {
			log.error(error, "Error auto-advancing agent convo");

			if (!res.headersSent) {
				return res.status(500).json({ error: "Failed to auto-advance conversation" });
			}

			try {
				chatService.sendSSE(res, {
					type: "error",
					error: error instanceof Error ? error.message : "Failed to auto-advance conversation",
					timestamp: new Date().toISOString(),
				});
				res.end();
			} catch {
				// Response may already be closed
			}
		}
	});

	// POST /api/agent/convos/:id/messages - Send user message
	// Uses SSE streaming to keep the request alive until processing completes (Vercel-compatible)
	router.post("/:id/messages", async (req: Request, res: Response) => {
		log.info("Received message request for convo %s", req.params.id);
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				log.warn("Message request unauthorized for convo %s", req.params.id);
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				log.warn("Invalid convo ID: %s", req.params.id);
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const { message } = req.body;
			log.info("Processing message for convo %d from user %d: %s", id, userId, message?.slice(0, 100));
			if (!message || typeof message !== "string") {
				return res.status(400).json({ error: "Message is required" });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				log.warn("Convo %d not found", id);
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (!isAgentArtifactType(convo.artifactType)) {
				log.warn("Convo %d is not an agent convo (type: %s)", id, convo.artifactType);
				return res.status(400).json({ error: "Not an agent conversation" });
			}

			// Validate and sanitize message
			const sanitizedMessage = chatService.validateMessage(message);

			// Auto-generate title for agent_hub convos on first user message
			if (convo.artifactType === "agent_hub" && !convo.title) {
				const autoTitle = generateAutoTitle(sanitizedMessage);
				await getCollabConvoDao().updateTitle(id, autoTitle);
			}

			// Add user message
			const userMessage: CollabMessage = {
				role: "user",
				content: sanitizedMessage,
				userId,
				timestamp: new Date().toISOString(),
			};

			await getCollabConvoDao().addMessage(id, userMessage);
			log.info("Saved user message to convo %d", id);

			// Set up SSE headers to keep connection alive (Vercel-compatible)
			// This ensures the serverless function doesn't terminate before processing completes
			chatService.setupSSEHeaders(res);

			// Send acknowledgment that message was received
			chatService.sendSSE(res, {
				type: "message_received",
				timestamp: new Date().toISOString(),
			});

			// Broadcast typing indicator to other subscribers via Mercure
			sendToDirectAndMercure(
				res,
				id,
				{
					type: "typing",
					userId,
					timestamp: new Date().toISOString(),
				},
				chatService,
			);

			// Process AI response synchronously - streams directly to this response
			// Also publishes to Mercure for other subscribers
			try {
				await processAgentResponse(res, id, userId, sanitizedMessage, convo);
			} catch (error) {
				log.error(error, "Error processing agent response for convo %d", id);
				chatService.sendSSE(res, {
					type: "error",
					error: "Failed to generate AI response",
					timestamp: new Date().toISOString(),
				});
			}

			// End the SSE stream
			res.end();
		} catch (error) {
			log.error(error, "Error adding message to agent convo");

			// If headers haven't been sent yet, return JSON error
			if (!res.headersSent) {
				if (error instanceof Error && error.message.includes("Message")) {
					return res.status(400).json({ error: error.message });
				}
				return res.status(500).json({ error: "Failed to add message" });
			}

			// If already streaming, try to send error via SSE
			try {
				chatService.sendSSE(res, {
					type: "error",
					error: error instanceof Error ? error.message : "Failed to add message",
					timestamp: new Date().toISOString(),
				});
				res.end();
			} catch {
				// Response may already be closed
			}
		}
	});

	// POST /api/agent/convos/:id/retry - Retry an assistant response
	// Accepts optional messageIndex to retry from a specific assistant message.
	// If omitted, retries the last assistant response.
	router.post("/:id/retry", async (req: Request, res: Response) => {
		log.info("Received retry request for convo %s", req.params.id);
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (!isAgentArtifactType(convo.artifactType)) {
				return res.status(400).json({ error: "Not an agent conversation" });
			}

			// Determine target user message index
			const { messageIndex } = (req.body ?? {}) as { messageIndex?: number };
			const targetUserIndex = findTargetUserIndex(convo.messages, messageIndex);

			if (targetUserIndex === "invalid_index") {
				return res.status(400).json({ error: "Invalid message index" });
			}
			if (targetUserIndex < 0) {
				return res.status(400).json({ error: "No user message found to retry" });
			}

			const targetUserMessage = convo.messages[targetUserIndex];
			const userContent =
				targetUserMessage.role === "user" ||
				targetUserMessage.role === "assistant" ||
				targetUserMessage.role === "system"
					? targetUserMessage.content
					: "";

			// Truncate messages to remove everything after the target user message
			const freshConvo = await getCollabConvoDao().truncateMessages(id, targetUserIndex + 1);
			if (!freshConvo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			// Clear cached agent environment so a fresh one is created
			const env = agentEnvironments.get(id);
			if (env) {
				await env.dispose();
				agentEnvironments.delete(id);
			}

			// Set up SSE headers
			chatService.setupSSEHeaders(res);

			// Send acknowledgment
			chatService.sendSSE(res, {
				type: "message_received",
				timestamp: new Date().toISOString(),
			});

			// Re-generate the response using isRetry flag
			try {
				await processAgentResponse(res, id, userId, userContent, freshConvo, true);
			} catch (error) {
				log.error(error, "Error processing retry response for convo %d", id);
				chatService.sendSSE(res, {
					type: "error",
					error: "Failed to generate AI response",
					timestamp: new Date().toISOString(),
				});
			}

			res.end();
		} catch (error) {
			log.error(error, "Error retrying agent convo message");

			if (!res.headersSent) {
				return res.status(500).json({ error: "Failed to retry message" });
			}

			try {
				chatService.sendSSE(res, {
					type: "error",
					error: error instanceof Error ? error.message : "Failed to retry message",
					timestamp: new Date().toISOString(),
				});
				res.end();
			} catch {
				// Response may already be closed
			}
		}
	});

	// POST /api/agent/convos/:id/tool-results - Receive tool result from CLI
	router.post("/:id/tool-results", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const body = req.body as ToolResultRequest;
			const { toolCallId, output, error } = body;

			if (!toolCallId) {
				return res.status(400).json({ error: "toolCallId is required" });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (convo.artifactType !== "cli_workspace") {
				return res.status(400).json({ error: "Not a CLI workspace conversation" });
			}

			// Find and resolve the pending tool call
			const pending = pendingToolCalls.get(toolCallId);
			if (!pending) {
				return res.status(404).json({ error: "Tool call not found or already completed" });
			}

			// Clear timeout and remove pending call
			clearTimeout(pending.timeoutId);
			pendingToolCalls.delete(toolCallId);

			if (error) {
				const toolErrorMessage = `Tool '${pending.call.name}' failed: ${error}`;
				const toolOutput = output?.trim();
				pending.resolve(toolOutput ? `${toolErrorMessage}\n\nTool output:\n${toolOutput}` : toolErrorMessage);
			} else {
				pending.resolve(output ?? "");
			}

			log.info("Received tool result for %s in convo %d", toolCallId, id);

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Error processing tool result");
			res.status(500).json({ error: "Failed to process tool result" });
		}
	});

	/**
	 * Builds the intro message for a new CLI workspace conversation
	 */
	function formatSourceList(sources?: ReadonlyArray<WorkspaceSourceMapping>): string {
		if (!sources || sources.length === 0) {
			return "No local sources configured.";
		}

		return sources
			.map(source => {
				const sourceLabel =
					source.sourceId !== undefined ? `${source.name} (id:${source.sourceId})` : source.name;
				return `• ${sourceLabel}: ${source.path}`;
			})
			.join("\n");
	}

	function buildCliIntroMessage(
		workspaceRoot?: string,
		toolManifest?: ToolManifest,
		sources?: ReadonlyArray<WorkspaceSourceMapping>,
	): string {
		const toolList =
			toolManifest?.tools.map(t => `• ${t.name}: ${t.description}`).join("\n") || "No tools registered";
		const sourceList = formatSourceList(sources);

		return `Connected to CLI workspace.

**Workspace:** ${workspaceRoot || "Not specified"}

**Configured sources:**
${sourceList}

**Available tools:**
${toolList}

How can I help you today?`;
	}

	/**
	 * Builds system prompt for CLI workspace agent
	 */
	function buildCliAgentSystemPrompt(
		workspaceRoot?: string,
		toolManifest?: ToolManifest,
		sources?: ReadonlyArray<WorkspaceSourceMapping>,
	): string {
		const toolDescriptions =
			toolManifest?.tools.map(t => `- ${t.name}: ${t.description}`).join("\n") ||
			"No client-side tools available.";
		const sourceList = formatSourceList(sources);
		const sourceNames = (sources ?? []).map(source => source.name);
		const hasUpsertFrontmatterTool = toolManifest?.tools.some(tool => tool.name === "upsert_frontmatter") ?? false;
		const attentionSourceGuidance =
			sourceNames.length === 0
				? "No configured sources are available. If you add attention rules, include attention[].source and ask the user for the source name when it is unclear."
				: sourceNames.length === 1
					? `Default attention source: ${sourceNames[0]}.`
					: `Valid attention source values: ${sourceNames.join(", ")}.`;
		const frontmatterToolGuidance = hasUpsertFrontmatterTool
			? "Prefer the upsert_frontmatter tool when updating frontmatter."
			: "If upsert_frontmatter is unavailable, update frontmatter via read_file + write_file carefully.";

		return `You are a helpful AI assistant working in a CLI environment.

**Workspace:** ${workspaceRoot || "Unknown"}

**Configured sources (name -> absolute path):**
${sourceList}

**Client-side tools available:**
${toolDescriptions}

You can use these tools to help the user with their tasks. Configured sources are read-only reference code. Treat the workspace root as the writable docs vault and only create/edit/delete files there. If the user asks to analyze or document a specific source, prefer the matching configured source path above for reading, but keep all output files in the workspace root. Be helpful, concise, and accurate.

## Attention Mechanism

Documentation files can declare dependencies on source code files using the \`attention\` frontmatter field. This enables automatic detection of which docs need updating when code changes.

**Format:**
\`\`\`yaml
---
jrn: UNIQUE_DOC_ID
attention:
  - op: file
    source: backend
    path: src/auth/login.ts           # Exact file path
  - op: file
    source: backend
    path: src/auth/**/*.ts            # Glob pattern
    keywords: [oauth, token]          # Optional keywords for context
---
\`\`\`

**Key points:**
- \`jrn\`: Unique document identifier (optional but recommended)
- \`attention\`: Array of watching rules
- \`op: file\`: Watch a file path (currently the only supported operation)
- \`source\`: Source name that owns the file (use configured source names)
- \`path\`: File path relative to repo root (supports globs: \`*\`, \`**\`, \`?\`, \`{a,b}\`)
- \`keywords\`: Optional keywords to boost match confidence

**Important path rule:**
- \`attention[].path\` must be repo-relative (for example \`server.js\` or \`src/auth/login.ts\`).
- Never include absolute or checkout-prefixed paths such as \`~/...\`, \`/home/.../workspace/...\`, or \`workspace/<repo>/<branch>/...\`.
- Tool file paths (for \`read_file\`, \`write_file\`, etc.) are workspace-root relative, but \`attention[].path\` is repo-relative for impact matching.

**Glob patterns:**
- \`src/auth/*.ts\` - Direct children only
- \`src/auth/**/*.ts\` - All .ts files recursively
- \`src/{auth,users}/*.ts\` - Files in auth or users directories

**When editing attention frontmatter:**
- ${frontmatterToolGuidance}
- ${attentionSourceGuidance}
- After any \`write_file\` or \`edit_article\` that changes a documentation file, explicitly check whether \`attention\` frontmatter should be updated, and update it when needed.
- Use entries shaped like: \`{ op: "file", source: "<source-name>", path: "<repo-relative path>", keywords?: [...] }\`.
- Merge with existing attention entries, avoid duplicates, and keep valid entries unless obsolete.
- Do not invent attention entries for files you did not use as evidence.

When helping users with documentation, suggest appropriate attention rules based on which source files the doc references or depends on.`;
	}

	/**
	 * Builds a context section containing the current plan (if any) for injection into the system prompt.
	 */
	function buildPlanContextSection(metadata?: AgentHubMetadata): string {
		if (!metadata?.plan) {
			return "";
		}
		return `
## Current Plan (phase: ${metadata.planPhase ?? "planning"})

${metadata.plan}`;
	}

	/** Shared base tool descriptions for agent hub system prompts */
	const AGENT_HUB_BASE_TOOLS_PROMPT = `## Available Tools

- **list_spaces**: Lists all documentation spaces the user can access.
- **list_folder_contents**: Browse folders and articles within a space. Shows contents at a specific folder level.
- **search_articles**: Search for articles by title, optionally within a specific space.
- **find_relevant_articles**: Search articles by content and title across all spaces. Returns snippets and relevance scores to identify existing articles on a topic.
- **find_relevant_spaces**: Find spaces or folders relevant to a topic. Without spaceId, ranks spaces by relevance. With spaceId, finds folders containing matching articles.
- **check_permissions**: Check what the current user is allowed to do.
- **create_folder**: Create a new folder in a space.
- **create_article_draft**: Create a new article with a draft for editing. Returns a draft ID.
- **navigate_user**: Navigate the user to a page. **Always ask the user for confirmation before navigating.**
- **web_search**: Search the web for current information. Use when the user asks about external topics, recent events, or information not in the documentation.
- **check_github_status**: Check if GitHub is connected and list active integrations.
- **connect_github_repo**: Connect a GitHub repository by URL. Creates an integration automatically if the Jolli GitHub App has access, or returns an installation URL if not.
- **list_github_repos**: List available GitHub repositories from connected installations.
- **scan_repo_docs**: Scan a connected repository for markdown documentation files.
- **import_repo_docs**: Import markdown files from a connected GitHub repo as Articles.
- **get_or_create_space**: Get an existing space by name or create a new one.

## Draft Article Workflow

When a user wants to draft an article, follow these steps:

1. Ask what kind of article they want (new or editing an existing one).
2. Check permissions with \`check_permissions\` to ensure they can create/edit articles.
3. Use \`find_relevant_articles\` to check for existing articles the user might want to edit instead.
4. Use \`find_relevant_spaces\` with the user's topic to identify the best space. If no obvious match, fall back to \`list_spaces\`.
5. Browse the chosen space with \`list_folder_contents\` to show existing articles, folders, and linked sources.
6. If editing an existing article, offer to navigate to it.
7. If creating new: ask where to place it. Create a folder if needed via \`create_folder\`.
8. Create the article draft via \`create_article_draft\`.
9. **Always ask the user** before navigating — never navigate without confirmation.
10. Navigate with \`navigate_user\` to take them to the draft editor.

## Finding Relevant Content

When a user asks about a topic or wants to find where something is documented:
1. Use \`find_relevant_articles\` to find articles matching the topic.
2. Use \`find_relevant_spaces\` to identify which spaces are most relevant.
3. Use \`find_relevant_spaces\` with a spaceId to drill into relevant folders.
4. Use \`list_folder_contents\` to browse specific folders.`;

	/**
	 * Builds system prompt for the web agent hub.
	 * When tool dependencies are available, includes tool descriptions, the article drafting workflow,
	 * and mode-specific instructions for tool gating behavior.
	 * Injects existing plan context when present (plans are orthogonal to mode).
	 */
	function buildAgentHubSystemPrompt(metadata?: AgentHubMetadata): string {
		if (!toolDeps) {
			return `You are a helpful AI assistant for the Jolli documentation platform. You help knowledge workers with:

- **Drafting documents**: Help write, edit, and improve documentation
- **Answering questions**: Provide clear, accurate answers about documentation topics
- **Summarizing content**: Create concise summaries of longer documents
- **General assistance**: Help with any documentation-related tasks

Be helpful, concise, and accurate. Format responses using Markdown when appropriate.`;
		}

		const mode = inferDefaultMode(metadata);
		const modeDef = getModeDefinition(mode);
		const planSection = buildPlanContextSection(metadata);

		// Append system prompt addendum for seeded conversations (e.g., Getting Started)
		let systemAddendum = "";
		if (metadata?.convoKind) {
			const definition = getSeededConversationDefinition(metadata.convoKind);
			if (definition?.systemPromptAddendum) {
				systemAddendum = `\n\n## Special Context\n\n${definition.systemPromptAddendum}`;
			}
		}

		return `You are a Jolli documentation assistant with access to tools for managing spaces, articles, and folders.

${AGENT_HUB_BASE_TOOLS_PROMPT}

${modeDef.systemPromptSection}

## Rules

- Always check permissions before create/edit operations.
- Always ask the user before navigating — never call \`navigate_user\` without explicit confirmation.
- Use markdown formatting when presenting tool results.
- When listing articles or folders, format them as a numbered list the user can choose from.
- Be helpful, concise, and accurate.${planSection}${systemAddendum}`;
	}

	/**
	 * Builds system prompt for impact agent mode.
	 * The impact agent updates documentation articles based on code changes.
	 */
	function buildImpactAgentSystemPrompt(
		workspaceRoot: string | undefined,
		toolManifest: ToolManifest | undefined,
		context: ImpactContext,
	): string {
		const toolDescriptions =
			toolManifest?.tools.map(t => `- ${t.name}: ${t.description}`).join("\n") || "No tools available.";

		const changedFiles = context.changes.map(c => `- ${c.path} (${c.status})`).join("\n");

		const commits = context.commits.map(c => `- ${c.sha.slice(0, 7)}: ${c.message}`).join("\n");

		const evidence = context.evidence
			.map(
				e =>
					`- [${e.source === "<local>" ? "local" : e.source}] ${e.changedFile} matched ${e.pattern} (${e.matchType})`,
			)
			.join("\n");

		return `You are a documentation update agent. Your task is to update a documentation article based on recent code changes.

**Workspace:** ${workspaceRoot || "Unknown"}

## Your Mission

1. **Read the article** at \`${context.article.path}\`
2. **Analyze the code changes** provided below
3. **Determine impact** on the documentation
4. **Update the article** if needed, or explain why no update is necessary

## Article to Update

- **Path:** ${context.article.path}
- **JRN:** ${context.article.jrn}

## Why This Article Was Flagged

This article declares dependencies on source files via \`attention\` frontmatter. It was flagged because:
${evidence}

## Code Changes

**Commits:**
${commits}

**Changed Files:**
${changedFiles}

The full diffs will be provided in the first message.

## Guidelines

1. **Be conservative** - Only update what's necessary. Don't rewrite unrelated sections.
2. **Preserve style** - Match the existing writing style, tone, and formatting.
3. **Update examples** - If code examples reference changed APIs/signatures, update them.
4. **Update descriptions** - If behavior changed, update the explanation.
5. **Preserve document structure** - Keep the article's existing structure intact (excluding frontmatter), and edit/update frontmatter as necessary.
6. **No update needed?** - If changes don't affect the doc content, explain why.

## Available Tools

${toolDescriptions}

Use \`read_file\` to read the article and source files for context.
Use \`write_file\` to update the article when ready.
Use \`grep\` and \`find\` if you need to explore how changed code is used.
When editing frontmatter attention rules, keep \`attention[].path\` repo-relative and never use absolute or checkout-prefixed paths.

## Output

After analysis, either:
1. Use \`write_file\` to update the article
2. Explain why no update is needed

Always explain your reasoning before making changes.`;
	}

	/**
	 * Creates or gets the agent environment for a conversation.
	 * Branches on artifact type to select system prompt and tools.
	 */
	async function getOrCreateAgentEnvironment(convoId: number, convo: CollabConvo): Promise<AgentEnvironment> {
		let env = agentEnvironments.get(convoId);
		if (env) {
			return env;
		}

		if (convo.artifactType === "agent_hub") {
			// Agent hub: use server-side tools when available, otherwise no tools
			const hubTools = toolDeps ? getAgentHubToolDefinitions() : [];
			const hubMetadata = isAgentHubMetadata(convo.metadata) ? convo.metadata : undefined;
			env = await createAgentEnvironment({
				toolPreset: "custom",
				customTools: hubTools,
				useE2B: false,
				systemPrompt: buildAgentHubSystemPrompt(hubMetadata),
			});
		} else {
			// CLI workspace: branch based on agent mode
			const metadata = convo.metadata as CliWorkspaceMetadata | null;
			let systemPrompt: string;
			if (metadata?.agentMode === "impact" && metadata.impactContext) {
				systemPrompt = buildImpactAgentSystemPrompt(
					metadata.workspaceRoot,
					metadata.toolManifest,
					metadata.impactContext,
				);
			} else {
				systemPrompt = buildCliAgentSystemPrompt(
					metadata?.workspaceRoot,
					metadata?.toolManifest,
					metadata?.sources,
				);
			}

			// Convert CLI tool manifest to ToolDef format so Claude can make proper tool_use calls.
			// The actual tool execution happens on the CLI via dispatchToolToClient.
			const clientTools = convertToolManifestToToolDefs(metadata?.toolManifest);
			env = await createAgentEnvironment({
				toolPreset: "custom",
				customTools: clientTools,
				useE2B: false,
				systemPrompt,
			});
		}

		agentEnvironments.set(convoId, env);
		log.info("Created agent environment for convo %d (type: %s)", convoId, convo.artifactType);

		return env;
	}

	/**
	 * Handles the update_plan tool call by persisting metadata and emitting an SSE event.
	 */
	async function handleUpdatePlan(
		convoId: number,
		call: ToolCall,
		res: Response,
	): Promise<{ message: string; phase?: AgentPlanPhase }> {
		const args = (call.arguments ?? {}) as Record<string, unknown>;
		const validation = validateToolArgs("update_plan", args);
		if (!validation.success) {
			return { message: validation.error };
		}

		const plan = validation.data.plan as string;
		const phase = validation.data.phase as AgentPlanPhase;

		try {
			await getCollabConvoDao().updateMetadata(convoId, { plan, planPhase: phase });
		} catch (err) {
			log.error(err, "Failed to persist plan update for convo %d", convoId);
			return { message: "Failed to save plan update. Please try again." };
		}

		sendToDirectAndMercure(
			res,
			convoId,
			{
				type: "plan_update",
				plan,
				phase,
				timestamp: new Date().toISOString(),
			},
			chatService,
		);

		return { message: `Plan updated successfully. Phase: ${phase}`, phase };
	}

	/**
	 * Builds a human-readable description of a tool call for confirmation prompts.
	 */
	function buildToolDescription(call: ToolCall): string {
		const args = (call.arguments ?? {}) as Record<string, unknown>;
		switch (call.name) {
			case "create_folder":
				return `Create folder '${args.name || "unnamed"}' in space '${args.spaceId || "unknown"}'`;
			case "create_article_draft":
				return `Create article draft '${args.title || "untitled"}'`;
			case "get_or_create_space":
				return `Get or create space '${args.name || "unnamed"}'`;
			case "import_repo_docs":
				return `Import documentation from repository '${args.repo || "unknown"}'`;
			case "navigate_user":
				return `Navigate to '${args.path || "unknown"}'`;
			default:
				return `Execute '${call.name}'`;
		}
	}

	/**
	 * Requests user confirmation for a mutation tool call.
	 * Returns a Promise that hangs until the user approves or denies via the confirmation endpoint.
	 * The Promise resolves with the tool result on approval, or a "denied" message on denial.
	 */
	function requestConfirmation(convoId: number, call: ToolCall, res: Response, userId: number): Promise<string> {
		const confirmationId = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
		const description = buildToolDescription(call);

		const confirmation: PendingConfirmation = {
			confirmationId,
			toolName: call.name,
			toolArgs: (call.arguments ?? {}) as Record<string, unknown>,
			description,
		};

		return new Promise<string>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				const pending = pendingConfirmations.get(confirmationId);
				if (pending) {
					pendingConfirmations.delete(confirmationId);
					resolve("Action timed out waiting for user confirmation.");
				}
			}, TOOL_CALL_TIMEOUT_MS);

			pendingConfirmations.set(confirmationId, {
				call,
				resolve,
				reject,
				timestamp: Date.now(),
				timeoutId,
				userId,
			});

			// Emit confirmation_required SSE event
			sendToDirectAndMercure(
				res,
				convoId,
				{
					type: "confirmation_required",
					confirmation,
					timestamp: new Date().toISOString(),
				},
				chatService,
			);
		});
	}

	/**
	 * Creates a tool executor that dispatches tools to the appropriate handler.
	 * - update_plan: intercepted and handled at the router level (needs convo ID and SSE)
	 * - Agent hub tools: executed server-side via AgentHubTools executors
	 * - CLI workspace tools: dispatched to CLI via SSE/Mercure
	 *
	 * Tool gating is mode-aware:
	 * - plan mode: mutation tools blocked until plan phase is "executing" or "complete"
	 * - exec mode: mutation tools require user confirmation via SSE
	 * - exec-accept-all mode: only destructive tools require confirmation
	 */
	function createToolExecutor(
		convoId: number,
		convo: CollabConvo,
		userId: number,
		res: Response,
	): (call: ToolCall) => Promise<string> {
		const hubMetadata = isAgentHubMetadata(convo.metadata) ? convo.metadata : undefined;
		let currentPlanPhase: AgentPlanPhase | undefined = hubMetadata?.planPhase;
		const mode = inferDefaultMode(hubMetadata);
		const modeDef = getModeDefinition(mode);

		return async (call: ToolCall): Promise<string> => {
			// Intercept update_plan before dispatching to AgentHubTools
			if (call.name === "update_plan") {
				const result = await handleUpdatePlan(convoId, call, res);
				// Track phase transitions within the same turn so a subsequent
				// mutation tool call sees the updated phase immediately.
				// Only update if the plan was actually persisted successfully.
				if (result.phase) {
					currentPlanPhase = result.phase;
				}
				return result.message;
			}

			// Agent hub: gate mutation tools based on mode
			if (convo.artifactType === "agent_hub" && MUTATION_TOOL_NAMES.has(call.name)) {
				const gateResult = gateMutationTool(call, modeDef, currentPlanPhase, convoId, res, userId);
				if (gateResult !== undefined) {
					return gateResult;
				}
			}

			// Agent hub: dispatch server-side tools
			if (convo.artifactType === "agent_hub") {
				if (toolDeps && (AGENT_HUB_TOOL_NAMES as ReadonlyArray<string>).includes(call.name)) {
					return await executeAgentHubTool(
						call.name,
						(call.arguments ?? {}) as Record<string, unknown>,
						toolDeps,
						userId,
					);
				}
				log.warn("Tool call in agent_hub convo %d: %s (not available)", convoId, call.name);
				return `Tool '${call.name}' is not available.`;
			}

			// CLI workspace: check if this is a client-side tool
			const metadata = convo.metadata as CliWorkspaceMetadata | null;
			if (isClientSideTool(call.name, metadata?.toolManifest)) {
				return await dispatchToolToClient(convoId, call);
			}

			// Unknown tool
			log.warn("Unknown tool requested: %s", call.name);
			return `Tool '${call.name}' is not available.`;
		};
	}

	/**
	 * Applies mode-specific gating to a mutation tool call.
	 * Returns a string (block message or confirmation promise) if the tool should be gated,
	 * or undefined if the tool should proceed normally.
	 */
	function gateMutationTool(
		call: ToolCall,
		modeDef: AgentHubModeDefinition,
		currentPlanPhase: AgentPlanPhase | undefined,
		convoId: number,
		res: Response,
		userId: number,
	): Promise<string> | string | undefined {
		switch (modeDef.mutationPolicy) {
			case "blocked":
				// Plan mode: block unless plan phase allows it
				if (!modeDef.mutationAllowedPhases.has(currentPlanPhase as AgentPlanPhase)) {
					log.warn(
						"Blocked mutation tool '%s' in convo %d — plan phase is '%s'",
						call.name,
						convoId,
						currentPlanPhase ?? "planning",
					);
					return `Cannot execute '${call.name}' — you must first create a plan and get user approval. Call update_plan with phase "executing" after the user confirms.`;
				}
				return;

			case "confirm":
				// Exec mode: all mutations require confirmation
				return requestConfirmation(convoId, call, res, userId);

			case "confirm-destructive":
				// Exec-accept-all mode: only destructive tools require confirmation
				if (DESTRUCTIVE_TOOL_NAMES.has(call.name)) {
					return requestConfirmation(convoId, call, res, userId);
				}
				return;

			default:
				return;
		}
	}

	/**
	 * Dispatches a tool call to the CLI via SSE/Mercure
	 */
	function dispatchToolToClient(convoId: number, call: ToolCall): Promise<string> {
		// Ensure tool call has an ID
		const toolCallId = call.id || generateToolCallId();
		const callWithId = { ...call, id: toolCallId };

		log.info("Dispatching tool call %s to CLI: %s", toolCallId, call.name);

		return new Promise((resolve, reject) => {
			// Set timeout for tool call and store the ID for cleanup
			const timeoutId = setTimeout(() => {
				const pending = pendingToolCalls.get(toolCallId);
				if (pending) {
					pendingToolCalls.delete(toolCallId);
					reject(new Error(`Tool call ${call.name} timed out after ${TOOL_CALL_TIMEOUT_MS}ms`));
				}
			}, TOOL_CALL_TIMEOUT_MS);

			// Store pending call with timeout ID
			pendingToolCalls.set(toolCallId, {
				call: callWithId,
				resolve,
				reject,
				timestamp: Date.now(),
				timeoutId,
			});

			// Publish tool call request via SSE and Mercure
			broadcastToConvo(
				convoId,
				{
					type: "tool_call_request",
					toolCallId,
					name: call.name,
					arguments: call.arguments,
					timestamp: new Date().toISOString(),
				},
				chatService,
			);
		});
	}

	/**
	 * Saves agent messages to conversation history
	 */
	async function saveAgentMessages(convoId: number, messages: Array<Message>): Promise<boolean> {
		const timestamp = new Date().toISOString();
		let savedAssistantMessage = false;
		const messagesToSave: Array<CollabMessage> = [];

		for (const msg of messages) {
			let collabMsg: CollabMessage;

			if (msg.role === "assistant" || msg.role === "user" || msg.role === "system") {
				// Skip messages with empty content — persisting them causes
				// "text content blocks must be non-empty" errors when sent to the LLM
				const content = (msg.content || "").trim();
				if (content.length === 0) {
					continue;
				}
				collabMsg = {
					role: msg.role,
					content,
					timestamp,
				};
				if (msg.role === "assistant") {
					savedAssistantMessage = true;
				}
			} else if (msg.role === "assistant_tool_use") {
				collabMsg = {
					role: "assistant_tool_use",
					tool_call_id: msg.tool_call_id || "",
					tool_name: msg.tool_name || "",
					tool_input: msg.tool_input,
					timestamp,
				};
			} else if (msg.role === "assistant_tool_uses") {
				collabMsg = {
					role: "assistant_tool_uses",
					calls: msg.calls || [],
					timestamp,
				};
			} else if (msg.role === "tool") {
				collabMsg = {
					role: "tool",
					tool_call_id: msg.tool_call_id || "",
					content: msg.content || "",
					tool_name: msg.tool_name || "",
					timestamp,
				};
			} else {
				continue;
			}

			messagesToSave.push(collabMsg);
		}

		if (messagesToSave.length > 0) {
			await getCollabConvoDao().addMessages(convoId, messagesToSave);
		}

		return savedAssistantMessage;
	}

	/**
	 * Processes agent response synchronously and streams updates via SSE.
	 * Sends chunks to both the direct response AND Mercure (for other subscribers).
	 */
	async function processAgentResponse(
		res: Response,
		convoId: number,
		userId: number,
		sanitizedMessage: string,
		convo: CollabConvo,
		isRetry = false,
	): Promise<void> {
		log.info("processAgentResponse started for convo %d", convoId);
		const freshConvo = await getCollabConvoDao().getCollabConvo(convoId);
		if (!freshConvo) {
			log.warn("processAgentResponse: convo %d not found", convoId);
			sendToDirectAndMercure(
				res,
				convoId,
				{
					type: "error",
					error: "Conversation not found",
					timestamp: new Date().toISOString(),
				},
				chatService,
			);
			return;
		}

		// Get or create agent environment
		let adapter: AgentChatAdapter;
		let env: AgentEnvironment | undefined;

		if (agentAdapter) {
			// Use provided adapter (for testing)
			log.info("processAgentResponse: using provided adapter for convo %d", convoId);
			adapter = agentAdapter;
		} else {
			log.info("processAgentResponse: creating agent environment for convo %d", convoId);
			env = await getOrCreateAgentEnvironment(convoId, convo);
			log.info("processAgentResponse: agent environment created for convo %d", convoId);
			adapter = new AgentChatAdapter({ agent: env.agent });
		}

		// Create tool executor (userId is captured for agent hub server-side tools)
		const toolExecutor = createToolExecutor(convoId, convo, userId, res);

		// Stream LLM response
		let fullResponse = "";
		let chunkSequence = 0;
		let result: { assistantText: string; newMessages: Array<unknown> };

		try {
			// Append an in-memory plan reminder so the LLM is nudged to call update_plan.
			// This is NOT persisted — only the in-memory copy sent to the LLM gets the reminder.
			const planReminder = buildPlanReminder(freshConvo);

			// When retrying, freshConvo.messages already ends with the user message
			const allMessages: Array<CollabMessage> = isRetry
				? [...freshConvo.messages]
				: [
						...freshConvo.messages,
						{
							role: "user" as const,
							content: sanitizedMessage + planReminder,
							userId,
							timestamp: new Date().toISOString(),
						},
					];

			log.info(
				"processAgentResponse: calling adapter.streamResponse for convo %d with %d messages",
				convoId,
				allMessages.length,
			);
			result = await adapter.streamResponse({
				messages: allMessages,
				onChunk: (content: string) => {
					log.debug("processAgentResponse: received chunk for convo %d, seq %d", convoId, chunkSequence);
					sendToDirectAndMercure(
						res,
						convoId,
						{
							type: "content_chunk",
							content,
							seq: chunkSequence++,
							timestamp: new Date().toISOString(),
						},
						chatService,
					);
				},
				onToolEvent: (event: { type: string; tool: string; status?: string; result?: string }) => {
					log.info(
						"Tool event for convo %d: tool=%s status=%s",
						convoId,
						event.tool,
						event.status || event.type,
					);
					sendToDirectAndMercure(
						res,
						convoId,
						{
							type: "tool_event",
							event,
							timestamp: new Date().toISOString(),
						},
						chatService,
					);
				},
				runTool: toolExecutor,
			});
			fullResponse = result.assistantText;
			log.info(
				"processAgentResponse: streamResponse completed for convo %d, response length %d",
				convoId,
				fullResponse.length,
			);
		} catch (error) {
			log.error(error, "Error streaming agent response for convo %d", convoId);
			sendToDirectAndMercure(
				res,
				convoId,
				{
					type: "error",
					error: "Failed to generate AI response",
					timestamp: new Date().toISOString(),
				},
				chatService,
			);
			return;
		}

		// Save messages
		const savedAssistantMessage = await saveAgentMessages(convoId, result.newMessages as Array<Message>);

		const timestamp = new Date().toISOString();
		const assistantMessage: CollabMessage = {
			role: "assistant",
			content: fullResponse,
			timestamp,
		};

		if (!savedAssistantMessage) {
			await getCollabConvoDao().addMessage(convoId, assistantMessage);
		}

		// Send message complete event to direct response AND Mercure
		sendToDirectAndMercure(
			res,
			convoId,
			{
				type: "message_complete",
				message: assistantMessage,
				timestamp,
			},
			chatService,
		);

		// Scan tool results for navigation actions and emit navigation_action SSE event
		for (const msg of result.newMessages as Array<Message>) {
			if (msg.role === "tool" && msg.content) {
				try {
					const parsed: unknown = JSON.parse(msg.content);
					if (isNavigationAction(parsed)) {
						sendToDirectAndMercure(
							res,
							convoId,
							{
								type: "navigation_action",
								action: { path: parsed.path, label: parsed.label },
								timestamp: new Date().toISOString(),
							},
							chatService,
						);
					}
				} catch {
					// Not JSON or not a navigation action — skip
				}
			}
		}
	}

	/**
	 * Adds an SSE connection to the tracking map
	 */
	function addConnection(convoId: number, userId: number, res: Response): void {
		let connections = agentConvoConnections.get(convoId);
		if (!connections) {
			connections = new Set();
			agentConvoConnections.set(convoId, connections);
		}

		// Start keep-alive to prevent proxy timeouts
		const keepAliveInterval = chatService.startKeepAlive(res);

		connections.add({ userId, res, keepAliveInterval });

		log.info("SSE connection opened for agent convo %d, user %d", convoId, userId);
	}

	/**
	 * Removes an SSE connection from the tracking map.
	 * Cleans up empty connection Sets from the Map.
	 */
	function removeConnection(convoId: number, userId: number, res: Response): void {
		const connections = agentConvoConnections.get(convoId);
		if (!connections) {
			return;
		}

		// Find and stop keep-alive for this connection
		for (const conn of connections) {
			if (conn.res === res) {
				chatService.stopKeepAlive(conn.keepAliveInterval);
				connections.delete(conn);
				log.info("SSE connection closed for agent convo %d, user %d", convoId, userId);
				break;
			}
		}

		// Clean up empty Sets to prevent memory leaks
		if (connections.size === 0) {
			agentConvoConnections.delete(convoId);
		}
	}

	// POST /api/agent/convos/:id/confirmations/:confirmId - Approve or deny a pending tool confirmation
	router.post("/:id/confirmations/:confirmId", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const { confirmId } = req.params;
			const { approved } = req.body as { approved: boolean };

			if (typeof approved !== "boolean") {
				return res.status(400).json({ error: "'approved' field must be a boolean" });
			}

			const pending = pendingConfirmations.get(confirmId);
			if (!pending) {
				return res.status(404).json({ error: "Confirmation not found or already resolved" });
			}

			// Verify the requesting user owns this confirmation
			if (pending.userId !== userId) {
				return res.status(403).json({ error: "Not authorized to resolve this confirmation" });
			}

			// Clear timeout and remove from pending map
			clearTimeout(pending.timeoutId);
			pendingConfirmations.delete(confirmId);

			if (approved) {
				// Execute the tool and resolve the hanging Promise
				try {
					if (!toolDeps) {
						pending.resolve("Tool execution is not available in this context.");
						return res.json({ success: true });
					}
					const result = await executeAgentHubTool(
						pending.call.name,
						(pending.call.arguments ?? {}) as Record<string, unknown>,
						toolDeps,
						pending.userId,
					);
					pending.resolve(result);
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : "Tool execution failed";
					pending.resolve(`Error executing ${pending.call.name}: ${errorMsg}`);
				}
			} else {
				// User denied — resolve with a denial message so the agent can adjust
				pending.resolve(
					`User declined to execute '${pending.call.name}'. Please suggest alternatives or ask what they'd prefer.`,
				);
			}

			// Broadcast resolution event
			broadcastToConvo(
				id,
				{
					type: "confirmation_resolved",
					confirmationId: confirmId,
					approved,
					timestamp: new Date().toISOString(),
				},
				chatService,
			);

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Error resolving confirmation");
			res.status(500).json({ error: "Failed to resolve confirmation" });
		}
	});

	// POST /api/agent/convos/:id/mode - Change conversation mode
	router.post("/:id/mode", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const { mode } = req.body as { mode: unknown };
			if (!isValidMode(mode)) {
				return res.status(400).json({ error: `Invalid mode. Must be one of: plan, exec, exec-accept-all` });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (convo.artifactType !== "agent_hub") {
				return res.status(400).json({ error: "Not an agent hub conversation" });
			}

			// Update metadata with new mode
			await getCollabConvoDao().updateMetadata(id, { mode });

			// Invalidate cached agent environment so the system prompt is regenerated
			const env = agentEnvironments.get(id);
			if (env) {
				await env.dispose();
				agentEnvironments.delete(id);
			}

			// Broadcast mode change event
			broadcastToConvo(
				id,
				{
					type: "mode_change",
					mode,
					timestamp: new Date().toISOString(),
				},
				chatService,
			);

			const updated = await getCollabConvoDao().getCollabConvo(id);
			res.json(updated);
		} catch (error) {
			log.error(error, "Error changing conversation mode");
			res.status(500).json({ error: "Failed to change conversation mode" });
		}
	});

	// GET /api/agent/convos/:id/stream - SSE for real-time agent events (fallback when Mercure unavailable)
	// Supports token via query param since EventSource doesn't support custom headers
	router.get("/:id/stream", async (req: Request, res: Response) => {
		log.info("SSE stream request for convo %s", req.params.id);
		try {
			// Try to get user ID from standard auth first, then fall back to query param token
			let userId = getUserId(tokenUtil, req);

			// If standard auth fails, try query param token (for EventSource which doesn't support headers)
			if (isLookupError(userId)) {
				const queryToken = req.query.token as string | undefined;
				log.info(
					"SSE stream: trying query param token for convo %s, token present: %s",
					req.params.id,
					!!queryToken,
				);
				if (queryToken) {
					const payload = tokenUtil.decodePayloadFromToken(queryToken);
					log.info("SSE stream: token payload for convo %s: userId=%s", req.params.id, payload?.userId);
					if (payload?.userId) {
						userId = payload.userId;
					}
				}
			}

			if (isLookupError(userId)) {
				log.warn("SSE stream: unauthorized for convo %s", req.params.id);
				return handleLookupError(res, userId);
			}

			const id = Number.parseInt(req.params.id);
			if (Number.isNaN(id)) {
				return res.status(400).json({ error: "Invalid convo ID" });
			}

			const convo = await getCollabConvoDao().getCollabConvo(id);
			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			if (!isAgentArtifactType(convo.artifactType)) {
				return res.status(400).json({ error: "Not an agent conversation" });
			}

			// Set up SSE
			chatService.setupSSEHeaders(res);

			// Add connection
			addConnection(id, userId, res);

			// Send initial connection confirmation
			chatService.sendSSE(res, {
				type: "connected",
				convoId: id,
				timestamp: new Date().toISOString(),
			});

			// Handle client disconnect
			req.on("close", () => {
				removeConnection(id, userId, res);
			});
		} catch (error) {
			log.error(error, "Error setting up agent convo stream");
			chatService.handleStreamError(res, error, "Failed to set up conversation stream");
		}
	});

	return router;
}

/**
 * Cleanup function to dispose all agent environments
 */
export async function disposeAllAgentEnvironments(): Promise<void> {
	for (const [convoId, env] of agentEnvironments) {
		try {
			await env.dispose();
			log.info("Disposed agent environment for convo %d", convoId);
		} catch (error) {
			log.error(error, "Error disposing agent environment for convo %d", convoId);
		}
	}
	agentEnvironments.clear();
}
