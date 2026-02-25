//noinspection ExceptionCaughtLocallyJS

import {
	type AgentEnvironment,
	createAgentEnvironment,
	reconnectE2BSandbox,
} from "../../../tools/jolliagent/src/direct/agentenv";
import type { Message, ToolCall } from "../../../tools/jolliagent/src/Types";
import { runToolCall } from "../../../tools/jolliagent/src/tools/Tools";
import { AgentChatAdapter } from "../adapters/AgentChatAdapter";
import { createCreateSectionToolDefinition, executeCreateSectionTool } from "../adapters/tools/CreateSectionTool";
import { createDeleteSectionToolDefinition, executeDeleteSectionTool } from "../adapters/tools/DeleteSectionTool";
import { createEditArticleToolDefinition, executeEditArticleTool } from "../adapters/tools/EditArticleTool";
import { createEditSectionToolDefinition, executeEditSectionTool } from "../adapters/tools/EditSectionTool";
import {
	createGetCurrentArticleToolDefinition,
	executeGetCurrentArticleTool,
} from "../adapters/tools/GetCurrentArticleTool";
import {
	createUpsertFrontmatterToolDefinition,
	executeUpsertFrontmatterTool,
} from "../adapters/tools/UpsertFrontmatterTool";
import { getConfig, getWorkflowConfig } from "../config/Config";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import type { ArtifactType, CollabConvoMetadata, CollabMessage } from "../model/CollabConvo";
import type { DocDraft } from "../model/DocDraft";
import { ChatService } from "../services/ChatService";
import { DiffService } from "../services/DiffService";
import { createMercureService } from "../services/MercureService";
import { RevisionManager } from "../services/RevisionManager";
import { getTenantContext } from "../tenant/TenantContext";
import { getAccessTokenForGithubRepoIntegration } from "../util/IntegrationUtil";
import { getLog } from "../util/Logger";
import {
	type CollabConvoDraftInfo,
	canAccessDraft,
	getUserId,
	handleLookupError,
	isLookupError,
	type LookupError,
	lookupDraft,
} from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import type { Sandbox } from "e2b";
import express, { type Request, type Response, type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

// Singleton RevisionManager for in-memory revision tracking
const revisionManager = new RevisionManager(50);

/**
 * Connection tracking for SSE streams
 */
interface ConvoConnection {
	userId: number;
	res: Response;
	keepAliveInterval: NodeJS.Timeout;
}

const convoConnections = new Map<number, Array<ConvoConnection>>();

// Singleton MercureService for publishing conversation events
const mercureService = createMercureService();

async function getCollabConvoForDraft(
	collabConvoDao: CollabConvoDao,
	docDraftDao: DocDraftDao,
	tokenUtil: TokenUtil<UserInfo>,
	req: Request,
): Promise<CollabConvoDraftInfo | LookupError> {
	const userId = getUserId(tokenUtil, req);
	if (isLookupError(userId)) {
		return userId;
	}

	const id = Number.parseInt(req.params.id);

	if (Number.isNaN(id)) {
		return {
			status: 400,
			message: "Invalid convo ID",
		};
	}

	const convo = await collabConvoDao.getCollabConvo(id);

	if (!convo) {
		return {
			status: 404,
			message: "Conversation not found",
		};
	}

	// Verify user has access to the artifact - only doc_draft artifact type is currently supported
	if (convo.artifactType === "doc_draft") {
		if (convo.artifactId === null) {
			return {
				status: 404,
				message: "Draft not found",
			};
		}
		const draft = await docDraftDao.getDocDraft(convo.artifactId);
		if (!draft) {
			return {
				status: 404,
				message: "Draft not found",
			};
		}
		if (!canAccessDraft(draft, userId)) {
			return {
				status: 403,
				message: "Forbidden",
			};
		}
		return {
			userId,
			convo,
			draft,
		};
	}
	// Fallback for unsupported artifact types
	return {
		status: 404,
		message: "Draft not found",
	};
}

/**
 * Broadcasts an event to all users connected to a conversation.
 * Events are sent via both in-memory SSE connections AND Mercure Hub (if enabled).
 */
function broadcastToConvo(chatService: ChatService, convoId: number, event: unknown): void {
	// Broadcast to in-memory SSE connections (existing behavior)
	const connections = convoConnections.get(convoId) || [];
	for (const conn of connections) {
		try {
			chatService.sendSSE(conn.res, event);
			/* v8 ignore next 3 - error handling for SSE connection failures is difficult to test */
		} catch (error) {
			log.error(error, "Failed to broadcast to convo connection");
		}
	}

	// Also publish to Mercure Hub for distributed SSE (fire and forget)
	const eventData = event as { type?: string };
	const eventType = eventData.type ?? "unknown";
	mercureService.publishConvoEvent(convoId, eventType, event).catch(err => {
		/* v8 ignore next - Mercure publish failures are non-blocking */
		log.warn(err, "Failed to publish convo event to Mercure: %s", eventType);
	});
}

/**
 * Adds a connection to the tracking map
 */
function addConnection(chatService: ChatService, convoId: number, userId: number, res: Response): void {
	const connections = convoConnections.get(convoId) || [];

	// Start keep-alive to prevent proxy timeouts
	const keepAliveInterval = chatService.startKeepAlive(res);

	connections.push({ userId, res, keepAliveInterval });
	convoConnections.set(convoId, connections);

	log.info("SSE connection opened for convo %d, user %d", convoId, userId);

	// Broadcast user joined event
	broadcastToConvo(chatService, convoId, {
		type: "user_joined",
		userId,
		timestamp: new Date().toISOString(),
	});
}

/**
 * Removes a connection from the tracking map
 */
function removeConnection(chatService: ChatService, convoId: number, userId: number, res: Response): void {
	/* v8 ignore next - defensive: connections should exist when removeConnection is called */
	const connections = convoConnections.get(convoId) || [];

	// Find and stop keep-alive for this connection
	const connection = connections.find(conn => conn.res === res);
	if (connection) {
		chatService.stopKeepAlive(connection.keepAliveInterval);
		log.info("SSE connection closed for convo %d, user %d", convoId, userId);
	}

	const filtered = connections.filter(conn => conn.res !== res);
	convoConnections.set(convoId, filtered);

	// Broadcast user left event
	broadcastToConvo(chatService, convoId, {
		type: "user_left",
		userId,
		timestamp: new Date().toISOString(),
	});
}

/**
 * Generates a friendly intro message for a new article draft
 */
function generateIntroMessage(title: string): string {
	const examples = [
		"Create an outline to help structure the content",
		"Write a compelling introduction",
		"Research and add technical details",
		"Review and improve clarity",
		"Add examples or code snippets",
	];

	return `Hi! I'm here to help you write the "${title}" Article. I can assist with:\n\n${examples.map(ex => `• ${ex}`).join("\n")}\n\nWhat would you like to work on first?`;
}

export function createCollabConvoRouter(
	collabConvoDaoProvider: DaoProvider<CollabConvoDao>,
	docDraftDaoProvider: DaoProvider<DocDraftDao>,
	docDraftSectionChangesDaoProvider: DaoProvider<DocDraftSectionChangesDao>,
	tokenUtil: TokenUtil<UserInfo>,
	integrationsManager: IntegrationsManager,
	agentAdapter?: AgentChatAdapter,
): Router {
	const router = express.Router();
	const chatService = new ChatService();
	const diffService = new DiffService();

	// Helper to get DAOs with tenant context
	function getCollabConvoDao(): CollabConvoDao {
		return collabConvoDaoProvider.getDao(getTenantContext());
	}
	function getDocDraftDao(): DocDraftDao {
		return docDraftDaoProvider.getDao(getTenantContext());
	}
	function getDocDraftSectionChangesDao(): DocDraftSectionChangesDao {
		return docDraftSectionChangesDaoProvider.getDao(getTenantContext());
	}

	// Get E2B config for production (tests pass in agentAdapter)
	const { e2bApiKey, e2bTemplateId } = getWorkflowConfig();

	// POST /api/collab-convos - Create new collab convo
	router.post("/", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);

			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const { artifactType, artifactId } = req.body;

			if (!artifactType || !artifactId) {
				return res.status(400).json({ error: "Artifact type and ID are required" });
			}

			// Validate artifact type
			if (artifactType !== "doc_draft") {
				return res.status(400).json({ error: "Invalid artifact type" });
			}

			// Verify artifact exists and user has access
			const draft = await getDocDraftDao().getDocDraft(Number.parseInt(artifactId));
			if (!draft) {
				return res.status(404).json({ error: "Artifact not found" });
			}

			if (!canAccessDraft(draft, userId)) {
				return res.status(403).json({ error: "Forbidden" });
			}

			// Check if convo already exists for this artifact
			const existingConvo = await getCollabConvoDao().findByArtifact(artifactType, Number.parseInt(artifactId));
			if (existingConvo) {
				return res.json(existingConvo);
			}

			// Create intro message for new conversation
			const introMessage: CollabMessage = {
				role: "assistant",
				content: generateIntroMessage(draft.title),
				timestamp: new Date().toISOString(),
			};

			const convo = await getCollabConvoDao().createCollabConvo({
				artifactType: artifactType as ArtifactType,
				artifactId: Number.parseInt(artifactId),
				messages: [introMessage],
				metadata: null,
			});

			res.status(201).json(convo);
		} catch (error) {
			log.error(error, "Error creating collab convo.");
			res.status(500).json({ error: "Failed to create conversation" });
		}
	});

	// GET /api/collab-convos/:id - Get convo details
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

			const convoInfo = await getCollabConvoForDraft(getCollabConvoDao(), getDocDraftDao(), tokenUtil, req);
			if (isLookupError(convoInfo)) {
				return handleLookupError(res, convoInfo);
			}

			const { convo } = convoInfo;

			res.json(convo);
		} catch (error) {
			log.error(error, "Error getting collab convo.");
			res.status(500).json({ error: "Failed to get conversation" });
		}
	});

	// GET /api/collab-convos/artifact/:type/:id - Get convo by artifact
	router.get("/artifact/:type/:id", async (req: Request, res: Response) => {
		try {
			const userId = getUserId(tokenUtil, req);
			if (isLookupError(userId)) {
				return handleLookupError(res, userId);
			}

			const artifactType = req.params.type;
			const artifactId = Number.parseInt(req.params.id);

			if (artifactType !== "doc_draft") {
				return res.status(400).json({ error: "Invalid artifact type" });
			}

			if (Number.isNaN(artifactId)) {
				return res.status(400).json({ error: "Invalid artifact ID" });
			}

			const draftInfo = await lookupDraft(getDocDraftDao(), tokenUtil, req);
			if (isLookupError(draftInfo)) {
				return handleLookupError(res, draftInfo);
			}

			const convo = await getCollabConvoDao().findByArtifact(artifactType as ArtifactType, artifactId);

			if (!convo) {
				return res.status(404).json({ error: "Conversation not found" });
			}

			res.json(convo);
		} catch (error) {
			log.error(error, "Error getting convo by artifact.");
			res.status(500).json({ error: "Failed to get conversation" });
		}
	});

	// POST /api/collab-convos/:id/messages - Send user message and get AI response
	// Uses SSE streaming to keep the request alive until processing completes (Vercel-compatible)
	router.post("/:id/messages", async (req: Request, res: Response) => {
		try {
			const { message, clientRequestId } = req.body as { message?: string; clientRequestId?: string };

			if (!message) {
				return res.status(400).json({ error: "Message is required" });
			}
			if (
				clientRequestId !== undefined &&
				(typeof clientRequestId !== "string" || clientRequestId.length === 0 || clientRequestId.length > 200)
			) {
				return res.status(400).json({ error: "clientRequestId must be a non-empty string up to 200 chars" });
			}

			const convoInfo = await getCollabConvoForDraft(getCollabConvoDao(), getDocDraftDao(), tokenUtil, req);
			if (isLookupError(convoInfo)) {
				return handleLookupError(res, convoInfo);
			}

			const { convo, userId } = convoInfo;

			const { id } = convo;

			// Validate and sanitize message
			const sanitizedMessage = chatService.validateMessage(message as string);

			// Add user message
			const userMessage: CollabMessage = {
				role: "user",
				content: sanitizedMessage,
				userId,
				timestamp: new Date().toISOString(),
			};

			await getCollabConvoDao().addMessage(id, userMessage);

			// Set up SSE headers to keep connection alive (Vercel-compatible)
			// This ensures the serverless function doesn't terminate before processing completes
			chatService.setupSSEHeaders(res);

			// Send acknowledgment that message was received
			chatService.sendSSE(res, {
				type: "message_received",
				timestamp: new Date().toISOString(),
			});

			// Broadcast typing indicator to other subscribers via Mercure
			broadcastToConvo(chatService, id, {
				type: "typing",
				userId,
				clientRequestId,
				timestamp: new Date().toISOString(),
			});

			// Process AI response synchronously - streams directly to this response
			// Also publishes to Mercure for other subscribers
			try {
				await processAIResponse(res, id, convo.artifactId as number, userId, sanitizedMessage, clientRequestId);
			} catch (error) {
				log.error(error, "Error processing AI response for convo %d", id);
				chatService.sendSSE(res, {
					type: "error",
					error: "Failed to generate AI response",
					userId,
					clientRequestId,
					timestamp: new Date().toISOString(),
				});
			}

			// End the SSE stream
			res.end();
		} catch (error) {
			log.error(error, "Error adding message to collab convo.");

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

	/**
	 * Gets GitHub integration details for E2B environment
	 */
	async function getGithubIntegrationDetails(): Promise<{
		githubToken?: string;
		githubOrg?: string;
		githubRepo?: string;
		githubBranch?: string;
		sourceId?: number;
		sourceName?: string;
	}> {
		try {
			const integrations = await integrationsManager.listIntegrations();
			log.info(
				"Found %d integrations: %s",
				integrations.length,
				integrations.map(i => `${i.name} (type=${i.type}, status=${i.status})`).join(", "),
			);

			const activeGithubIntegration = integrations.find(i => i.type === "github" && i.status === "active");

			/* v8 ignore next 17 - optional GitHub integration for E2B */
			if (activeGithubIntegration) {
				const gh = await getAccessTokenForGithubRepoIntegration(activeGithubIntegration, true);
				const githubToken = gh.accessToken;
				const githubOrg = gh.owner;
				const githubRepo = gh.repo;
				// Get branch from metadata if available
				const metadata = activeGithubIntegration.metadata as { branch?: string };
				const githubBranch = metadata?.branch || "main";
				log.info(
					"Using GitHub token from integration: %s (repo: %s/%s, branch: %s)",
					activeGithubIntegration.name,
					githubOrg,
					githubRepo,
					githubBranch,
				);
				return {
					githubToken,
					githubOrg,
					githubRepo,
					githubBranch,
					sourceId: activeGithubIntegration.id,
					sourceName: activeGithubIntegration.name,
				};
			}
			log.warn("No active GitHub integrations found - github_checkout tool will not work");
			/* v8 ignore next 3 - error handling for GitHub integration */
		} catch (error) {
			log.error(error, "Failed to get GitHub token from integration");
		}

		return {};
	}

	/**
	 * Executes a tool call and returns the result
	 */
	async function executeToolCall(
		call: ToolCall,
		draft: DocDraft,
		sharedEnv: AgentEnvironment | undefined,
		userId: number,
		defaultAttentionSource?: string,
	): Promise<string> {
		// Article editing tools
		if (call.name === "create_section") {
			log.info("Executing create_section tool for draft %d", draft.id);
			return await executeCreateSectionTool(
				draft.id,
				undefined,
				call.arguments as { sectionTitle: string; content: string; insertAfter: string },
				getDocDraftDao(),
				userId,
				undefined,
				getDocDraftSectionChangesDao(),
			);
		}
		if (call.name === "delete_section") {
			log.info("Executing delete_section tool for draft %d", draft.id);
			return await executeDeleteSectionTool(
				draft.id,
				undefined,
				call.arguments as { sectionTitle: string },
				getDocDraftDao(),
				userId,
				undefined,
				getDocDraftSectionChangesDao(),
			);
		}
		if (call.name === "edit_section") {
			log.info("Executing edit_section tool for draft %d", draft.id);
			return await executeEditSectionTool(
				draft.id,
				undefined,
				call.arguments as { sectionTitle: string; newContent: string },
				getDocDraftDao(),
				userId,
				undefined,
				getDocDraftSectionChangesDao(),
			);
		}
		if (call.name === "edit_article") {
			log.info("Executing edit_article tool for draft %d", draft.id);
			return await executeEditArticleTool(
				draft.id,
				call.arguments as { edits: Array<{ old_string: string; new_string: string; reason: string }> },
				getDocDraftDao(),
				userId,
			);
		}
		if (call.name === "upsert_frontmatter") {
			log.info("Executing upsert_frontmatter tool for draft %d", draft.id);
			const normalizedDefaultAttentionSource =
				typeof defaultAttentionSource === "string" ? defaultAttentionSource.trim() : "";
			const sourcePolicy =
				normalizedDefaultAttentionSource.length > 0
					? { defaultAttentionSource: normalizedDefaultAttentionSource, requireAttentionSource: true }
					: { requireAttentionSource: true };
			return await executeUpsertFrontmatterTool(
				draft.id,
				call.arguments as { set?: Record<string, unknown>; remove?: Array<string> },
				getDocDraftDao(),
				userId,
				sourcePolicy,
			);
		}
		if (call.name === "get_current_article") {
			log.info("Executing get_current_article tool for draft %d", draft.id);
			return await executeGetCurrentArticleTool(draft.id, undefined, getDocDraftDao());
		}
		/* v8 ignore next 5 - E2B tool execution logging and delegation */
		if (sharedEnv) {
			// E2B code tools - delegate to E2B environment
			log.info("Executing E2B tool: %s", call.name);
			return await runToolCall(sharedEnv.runState, call);
		}
		return `Unknown tool: ${call.name}`;
	}

	/**
	 * Broadcasts article update after tool execution
	 */
	async function broadcastArticleUpdate(
		res: Response,
		toolName: string,
		draft: DocDraft,
		userId: number,
		convoId: number,
		clientRequestId?: string,
	): Promise<void> {
		const articleModifyingTools = [
			"create_section",
			"delete_section",
			"edit_section",
			"edit_article",
			"upsert_frontmatter",
		];
		if (!articleModifyingTools.includes(toolName)) {
			return;
		}

		// Get updated draft content
		const updatedDraft = await getDocDraftDao().getDocDraft(draft.id);
		/* v8 ignore next 3 - defensive check, draft should always exist after update */
		if (!updatedDraft) {
			return;
		}

		// Generate diff
		const diffResult = diffService.generateDiff(draft.content, updatedDraft.content);

		// Initialize revision history if needed
		if (revisionManager.getRevisionCount(draft.id) === 0) {
			revisionManager.addRevision(draft.id, draft.content, userId, "Initial content");
		}

		// Add revision
		const revisionReason =
			toolName === "delete_section"
				? "Tool-generated section deletion"
				: toolName === "create_section"
					? "Tool-generated section creation"
					: toolName === "upsert_frontmatter"
						? "Tool-generated frontmatter update"
						: "Tool-generated article edit";
		revisionManager.addRevision(draft.id, updatedDraft.content, userId, revisionReason);

		sendToDirectAndMercure(res, convoId, {
			type: "article_updated",
			diffs: diffResult.diffs,
			userId,
			clientRequestId,
			contentLastEditedAt: updatedDraft.contentLastEditedAt,
			contentLastEditedBy: updatedDraft.contentLastEditedBy,
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Creates a tool executor function for article editing and E2B tools
	 */
	function createToolExecutor(
		res: Response,
		draft: DocDraft,
		sharedEnv: AgentEnvironment | undefined,
		userId: number,
		convoId: number,
		clientRequestId?: string,
		defaultAttentionSource?: string,
	): (call: ToolCall) => Promise<string> {
		return async (call: ToolCall): Promise<string> => {
			log.info("Running tool for draft %d: name=%s args=%s", draft.id, call.name, JSON.stringify(call.arguments));
			const result = await executeToolCall(call, draft, sharedEnv, userId, defaultAttentionSource);
			log.info("Tool completed for draft %d: name=%s", draft.id, call.name);
			await broadcastArticleUpdate(res, call.name, draft, userId, convoId, clientRequestId);
			return result;
		};
	}

	/**
	 * Saves agent messages to conversation history
	 * Returns true if an assistant message was saved
	 */
	async function saveAgentMessages(convoId: number, messages: Array<Message>): Promise<boolean> {
		const timestamp = new Date().toISOString();
		let savedAssistantMessage = false;

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
					/* v8 ignore next - defensive fallback, TypeScript guarantees these fields exist */
					tool_call_id: msg.tool_call_id || "",
					/* v8 ignore next - defensive fallback, TypeScript guarantees these fields exist */
					tool_name: msg.tool_name || "",
					tool_input: msg.tool_input,
					timestamp,
				};
			} else if (msg.role === "assistant_tool_uses") {
				collabMsg = {
					role: "assistant_tool_uses",
					/* v8 ignore next - defensive fallback, TypeScript guarantees these fields exist */
					calls: msg.calls || [],
					timestamp,
				};
			} else if (msg.role === "tool") {
				collabMsg = {
					role: "tool",
					/* v8 ignore next - defensive fallback, TypeScript guarantees these fields exist */
					tool_call_id: msg.tool_call_id || "",
					/* v8 ignore next - defensive fallback, TypeScript guarantees these fields exist */
					content: msg.content || "",
					/* v8 ignore next - defensive fallback, TypeScript guarantees these fields exist */
					tool_name: msg.tool_name || "",
					timestamp,
				};
			} else {
				// Skip unknown message types
				continue;
			}

			await getCollabConvoDao().addMessage(convoId, collabMsg);
		}

		return savedAssistantMessage;
	}

	/**
	 * Pre-checks out GitHub repository in E2B environment
	 */
	async function preCheckoutGithubRepo(
		env: AgentEnvironment,
		draftId: number,
		githubToken?: string,
		githubOrg?: string,
		githubRepo?: string,
		githubBranch?: string,
	): Promise<void> {
		/* v8 ignore next 9 - GitHub not configured path is difficult to test in integration tests */
		if (!githubToken || !githubOrg || !githubRepo) {
			log.info(
				"Skipping pre-checkout - githubToken: %s, githubOrg: %s, githubRepo: %s",
				githubToken ? "present" : "missing",
				githubOrg || "missing",
				githubRepo || "missing",
			);
			return;
		}

		/* v8 ignore next 32 - GitHub checkout path tested but uncovered due to E2B environment caching */
		try {
			log.info(
				"Pre-checking out GitHub repo %s/%s (branch: %s) for draft %d",
				githubOrg,
				githubRepo,
				githubBranch || "main",
				draftId,
			);

			// Log the runState to verify it has the necessary environment variables
			log.info(
				"RunState for checkout - executorNamespace: %s, has e2bsandbox: %s, GH_PAT: %s, GH_ORG: %s, GH_REPO: %s",
				env.runState.executorNamespace,
				!!env.runState.e2bsandbox,
				env.runState.env_vars?.GH_PAT ? "present" : "missing",
				env.runState.env_vars?.GH_ORG || "missing",
				env.runState.env_vars?.GH_REPO || "missing",
			);

			const checkoutResult = await runToolCall(env.runState, {
				id: `pre-checkout-${Date.now()}`,
				name: "github_checkout",
				arguments: {
					repo: `${githubOrg}/${githubRepo}`,
					branch: githubBranch || "main",
				},
			});
			log.info("GitHub repo checkout result for draft %d: %s", draftId, checkoutResult);
		} catch (error) {
			log.error(error, "Failed to pre-checkout GitHub repo for draft %d", draftId);
			// Don't fail the environment creation, just log the error
		}
	}

	/**
	 * Builds system prompt for article editing with code exploration
	 */
	function buildArticleEditingSystemPrompt(
		githubToken?: string,
		githubOrg?: string,
		githubRepo?: string,
		githubBranch?: string,
		attentionSourceName?: string,
		attentionSourceId?: number,
	): string {
		const normalizedAttentionSourceName = typeof attentionSourceName === "string" ? attentionSourceName.trim() : "";
		const attentionSourceInstructions =
			normalizedAttentionSourceName.length > 0
				? `- Source rule (critical):
  This session's checked-out source is \`${normalizedAttentionSourceName}\`${
		attentionSourceId !== undefined ? ` (sourceId: ${attentionSourceId})` : ""
  }.
  When calling \`upsert_frontmatter\`, every \`attention\` entry you add or update MUST set \`source\` to \`${normalizedAttentionSourceName}\`, unless the user explicitly gives a different valid source.`
				: `- Source rule (critical):
  When calling \`upsert_frontmatter\`, every \`attention\` entry must include \`source\` with the correct source name.`;

		const githubInstructions =
			/* v8 ignore next 12 - both branches are valid runtime paths */
			githubToken && githubOrg && githubRepo
				? `**CRITICAL - Repository Pre-Checked Out:** The repository ${githubOrg}/${githubRepo} (branch: ${
						githubBranch || "main"
					}) has been pre-checked out for you in the workspace at:
~/workspace/${githubRepo}/${githubBranch || "main"}/

**ALWAYS check this local directory FIRST** when users ask about code, repositories, or need to verify article content against the codebase. Use ls, cat, grep, and git tools to explore the local workspace. DO NOT use web_search or github_checkout for this repository - it's already available locally.`
				: githubToken
					? "Use the github_checkout tool to clone repositories when needed."
					: "NOTE: GitHub authentication is not configured. You can still use local file tools, but github_checkout will not work.";

		return `You are a helpful AI assistant that helps users write and edit articles.

**CRITICAL:** You MUST use tools to make any changes to the article. NEVER claim to have made changes without actually calling the appropriate tool. If the user asks you to add, edit, or delete content, you MUST call the corresponding tool - do not just say you did it.

You have access to article editing tools AND code exploration tools:

**Article Editing Tools:**
1. **create_section** - Add a new section to the article (REQUIRED when adding new sections)
2. **delete_section** - Remove a section from the article (REQUIRED when removing sections)
3. **edit_section** - Edit a specific section of the article (REQUIRED when modifying sections)
4. **edit_article** - Apply targeted string-level edits to preserve structure
5. **upsert_frontmatter** - Edit/update frontmatter with schema validation (jrn, attention)
6. **get_current_article** - Retrieve the current full content of the article

**Code Exploration Tools (via E2B sandbox):**
- ls - List directory contents (START HERE to discover files)
- cat - Read file contents
- grep - Search within files
- Git tools (git_log, git_diff, git_show, etc.) for browsing repository history
- File system navigation tools

**TOOL USAGE PRIORITY:**
When researching code or verifying article accuracy:
1. **FIRST:** Use ls to explore the local workspace directory structure
2. **SECOND:** Use cat/grep to read and search local files
3. **THIRD:** Use git tools to examine history and changes
4. **AVOID:** Using web_search or github_checkout for repositories already checked out locally

**ATTENTION FRONTMATTER UPDATES (REQUIRED FOR SOURCED CHANGES):**
- Why this matters:
  Jolli uses frontmatter \`attention\` as a dependency map between this article and the source files/inputs it relies on.
  When those source files change later, attention metadata is what allows Jolli to detect impact and notify that this article should be reviewed or updated.
- Path rule (critical):
  \`attention[].path\` must be repo-relative to the checked-out repository (examples: \`server.js\`, \`src/auth/login.ts\`).
  Never use absolute or checkout-prefixed paths such as \`~/...\`, \`/home/.../workspace/...\`, or \`workspace/<repo>/<branch>/...\`.
${attentionSourceInstructions}
- When to update it:
  If you used source material (code files, docs files, specs, tickets, or similar) to produce or change article content, you MUST update \`attention\` via \`upsert_frontmatter\`.
- How to update it:
  Add/merge the relevant source references into \`attention\`, avoid duplicates, and keep existing valid references unless they are clearly obsolete.
- JRN on web drafts:
  \`jrn\` is optional in this web draft flow. Only set/update it when the user explicitly asks.
- If no sources were used:
  Do not invent attention entries. Only track real dependencies.

${githubInstructions}

**IMPORTANT WORKFLOW:**
1. When asked to verify or research the codebase, ALWAYS start with ls to explore the local workspace
2. When asked to modify the article, FIRST call get_current_article to see the current content
3. Preserve the article structure (excluding frontmatter) and make focused content changes with edit_article/edit_section/create_section/delete_section
4. Use grep/cat/git tools to gather evidence from source code before editing sourced claims
5. If sources influenced the article changes, call upsert_frontmatter to update \`attention\` with those source dependencies
6. Use upsert_frontmatter for any additional metadata updates needed
7. NEVER say "Done" or claim success without having called the needed tool(s)

Use article editing tools to modify the article content, and code exploration tools to research, analyze code, or gather information from the repository.`;
	}

	/**
	 * Creates E2B environment with article editing tools and code exploration capabilities
	 * @param existingSandbox Optional existing sandbox to reuse (from reconnectE2BSandbox)
	 */
	async function createE2BEnvironmentForDraft(
		draft: DocDraft,
		githubToken?: string,
		githubOrg?: string,
		githubRepo?: string,
		githubBranch?: string,
		attentionSourceName?: string,
		attentionSourceId?: number,
		existingSandbox?: Sandbox,
	): Promise<AgentEnvironment> {
		log.info(
			"%s E2B jolliagent environment for draft %d with e2b-code + article editing tools",
			existingSandbox ? "Wrapping reconnected sandbox into" : "Creating new",
			draft.id,
		);

		// Create article editing tool definitions for this draft
		const createSectionTool = createCreateSectionToolDefinition(draft.id);
		const deleteSectionTool = createDeleteSectionToolDefinition(draft.id);
		const editSectionTool = createEditSectionToolDefinition(draft.id);
		const editArticleTool = createEditArticleToolDefinition(draft.id);
		const upsertFrontmatterTool = createUpsertFrontmatterToolDefinition(draft.id);
		const getCurrentArticleTool = createGetCurrentArticleToolDefinition(draft.id);

		const articleEditingSystemPrompt = buildArticleEditingSystemPrompt(
			githubToken,
			githubOrg,
			githubRepo,
			githubBranch,
			attentionSourceName,
			attentionSourceId,
		);

		// Create E2B jolliagent environment with e2b-code preset + article editing tools
		// Always pass envVars, even if empty, to ensure the structure is correct
		const envVars: Record<string, string> = {};
		const config = getConfig();
		/* v8 ignore next 15 - optional GitHub integration and web search environment variables */
		if (githubToken) {
			envVars.GH_PAT = githubToken;
		}
		if (githubOrg) {
			envVars.GH_ORG = githubOrg;
		}
		if (githubRepo) {
			envVars.GH_REPO = githubRepo;
		}
		if (config.TAVILY_API_KEY) {
			envVars.TAVILY_API_KEY = config.TAVILY_API_KEY;
		}
		const env = await createAgentEnvironment({
			toolPreset: "e2b-code",
			useE2B: true,
			e2bApiKey,
			e2bTemplateId,
			...(existingSandbox ? { existingSandbox } : {}),
			systemPrompt: articleEditingSystemPrompt,
			additionalTools: [
				createSectionTool,
				deleteSectionTool,
				editSectionTool,
				editArticleTool,
				upsertFrontmatterTool,
				getCurrentArticleTool,
			],
			/* v8 ignore next - both branches are valid runtime paths */
			envVars,
		});

		log.info("E2B jolliagent environment created for draft %d with sandbox ID: %s", draft.id, env.sandboxId);

		// Pre-checkout the GitHub repo if configured (skip if reconnecting - repo already checked out)
		if (!existingSandbox) {
			await preCheckoutGithubRepo(env, draft.id, githubToken, githubOrg, githubRepo, githubBranch);
		}

		return env;
	}

	/**
	 * Sends an event to both the direct SSE response AND to Mercure (for other subscribers)
	 */
	function sendToDirectAndMercure(res: Response, convoId: number, event: unknown): void {
		// Send directly to the requester via SSE
		chatService.sendSSE(res, event);
		// Also publish to Mercure for other subscribers
		broadcastToConvo(chatService, convoId, event);
	}

	/**
	 * Processes AI response synchronously and streams updates via SSE.
	 * Sends chunks to both the direct response AND Mercure (for other subscribers).
	 */
	async function processAIResponse(
		res: Response,
		convoId: number,
		artifactId: number,
		userId: number,
		sanitizedMessage: string,
		clientRequestId?: string,
	): Promise<void> {
		// Get the draft to include article content in prompt
		const draft = await getDocDraftDao().getDocDraft(artifactId);
		if (!draft) {
			const errorEvent = {
				type: "error",
				error: "Draft not found",
				userId,
				clientRequestId,
				timestamp: new Date().toISOString(),
			};
			sendToDirectAndMercure(res, convoId, errorEvent);
			return;
		}

		// Get conversation for message history
		const convo = await getCollabConvoDao().getCollabConvo(convoId);
		/* v8 ignore next 11 - Conversation not found during async processing is difficult to test reliably */
		if (!convo) {
			const errorEvent = {
				type: "error",
				error: "Conversation not found",
				userId,
				clientRequestId,
				timestamp: new Date().toISOString(),
			};
			sendToDirectAndMercure(res, convoId, errorEvent);
			return;
		}

		// Resolve adapter: use provided adapter or create E2B adapter
		let adapter: AgentChatAdapter;
		let sharedEnv: AgentEnvironment | undefined;
		let sourceId: number | undefined;
		let sourceName: string | undefined;

		if (agentAdapter) {
			adapter = agentAdapter;
		} else {
			// E2B mode: Create jolliagent environment with BOTH e2b-code tools AND article editing tools
			// Note: getWorkflowConfig() guarantees e2bApiKey and e2bTemplateId are strings (throws if missing)

			const githubIntegrationDetails = await getGithubIntegrationDetails();
			const { githubToken, githubOrg, githubRepo, githubBranch } = githubIntegrationDetails;
			sourceId = githubIntegrationDetails.sourceId;
			sourceName = githubIntegrationDetails.sourceName;

			// Try to reconnect to an existing sandbox if one is stored in metadata
			const metadata = convo.metadata as CollabConvoMetadata | null;
			let reconnectedSandbox: Sandbox | null = null;

			/* v8 ignore next 9 - E2B sandbox reconnection path requires real E2B infrastructure */
			if (metadata?.sandboxId) {
				log.info("Attempting to reconnect to E2B sandbox %s for draft %d", metadata.sandboxId, draft.id);
				reconnectedSandbox = await reconnectE2BSandbox(metadata.sandboxId, e2bApiKey);
				if (reconnectedSandbox) {
					log.info("Successfully reconnected to E2B sandbox %s", metadata.sandboxId);
				} else {
					log.info("Could not reconnect to E2B sandbox %s, will create new one", metadata.sandboxId);
				}
			}

			// Create environment (with reconnected sandbox or new one)
			sharedEnv = await createE2BEnvironmentForDraft(
				draft,
				githubToken,
				githubOrg,
				githubRepo,
				githubBranch,
				sourceName,
				sourceId,
				reconnectedSandbox ?? undefined,
			);

			// Store sandboxId in metadata for future reconnection (only if we created a new sandbox)
			if (!reconnectedSandbox && sharedEnv.sandboxId) {
				log.info("Storing E2B sandbox ID %s in convo %d metadata", sharedEnv.sandboxId, convoId);
				await getCollabConvoDao().updateMetadata(convoId, { sandboxId: sharedEnv.sandboxId });
			}

			adapter = new AgentChatAdapter({ agent: sharedEnv.agent });
		}

		// Create tool executor for article editing tools and E2B tools
		const toolExecutor = createToolExecutor(res, draft, sharedEnv, userId, convoId, clientRequestId, sourceName);

		// Stream LLM response using adapter
		let fullResponse = "";
		let chunkSequence = 0; // Sequence number for ordering content chunks
		let result: { assistantText: string; newMessages: Array<unknown> };
		try {
			// Combine conversation history with new user message
			const allMessages: Array<CollabMessage> = [
				...convo.messages,
				{
					role: "user" as const,
					content: sanitizedMessage,
					userId,
					timestamp: new Date().toISOString(),
				},
			];

			result = await adapter.streamResponse({
				messages: allMessages,
				onChunk: (content: string) => {
					// Send chunk to direct response AND Mercure for other subscribers
					sendToDirectAndMercure(res, convoId, {
						type: "content_chunk",
						content,
						seq: chunkSequence++,
						userId,
						clientRequestId,
						timestamp: new Date().toISOString(),
					});
				},
				onToolEvent: (event: { type: string; tool: string; status?: string; result?: string }) => {
					// Log and broadcast tool events to connected users
					try {
						log.info(
							"Tool event for convo %d: tool=%s status=%s",
							convoId,
							event.tool,
							event.status || event.type,
						);
						/* v8 ignore start - defensive catch block for logging errors */
					} catch {
						// Ignore logging errors to prevent disrupting the stream
					}
					/* v8 ignore stop */
					sendToDirectAndMercure(res, convoId, {
						type: "tool_event",
						event,
						userId,
						clientRequestId,
						timestamp: new Date().toISOString(),
					});
				},
				runTool: toolExecutor,
			});
			fullResponse = result.assistantText;
			if (!fullResponse || fullResponse.trim().length === 0) {
				log.warn(
					"LLM returned empty response for convo %d. This usually indicates a provider error that was silently handled. Check [Agent.chatTurn] logs above for details.",
					convoId,
				);
			}
		} catch (error) {
			log.error(error, "Error streaming LLM response.");
			sendToDirectAndMercure(res, convoId, {
				type: "error",
				error: "Failed to generate AI response",
				userId,
				clientRequestId,
				timestamp: new Date().toISOString(),
			});
			return;
		}

		// Note: Article updates now happen via tools (edit_section/edit_article/create_section/etc.)
		// The toolExecutor handles broadcasting updates when tools are called

		// Save all new messages from the agent (including tool calls and responses)
		const savedAssistantMessage = await saveAgentMessages(convoId, result.newMessages as Array<Message>);

		// Create the final assistant message for response
		const timestamp = new Date().toISOString();
		const assistantMessage: CollabMessage = {
			role: "assistant",
			content: fullResponse,
			timestamp,
		};

		// If assistant message wasn't already saved in newMessages, save it now
		if (!savedAssistantMessage) {
			await getCollabConvoDao().addMessage(convoId, assistantMessage);
		}

		// Send message complete event to direct response AND Mercure
		sendToDirectAndMercure(res, convoId, {
			type: "message_complete",
			message: assistantMessage,
			userId,
			clientRequestId,
			timestamp,
		});
	}

	// GET /api/collab-convos/:id/stream - SSE for chat responses
	router.get("/:id/stream", async (req: Request, res: Response) => {
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

			// Verify user has access
			if (convo.artifactType === "doc_draft") {
				if (convo.artifactId === null) {
					return res.status(403).json({ error: "Forbidden" });
				}
				const draft = await getDocDraftDao().getDocDraft(convo.artifactId);
				if (!draft || !canAccessDraft(draft, userId)) {
					return res.status(403).json({ error: "Forbidden" });
				}
			}

			// Set up SSE
			chatService.setupSSEHeaders(res);

			// Add connection
			addConnection(chatService, id, userId, res);

			// Send initial connection confirmation
			chatService.sendSSE(res, {
				type: "connected",
				convoId: id,
				timestamp: new Date().toISOString(),
			});

			// Handle client disconnect
			req.on("close", () => {
				removeConnection(chatService, id, userId, res);
			});
		} catch (error) {
			log.error(error, "Error setting up convo stream.");
			chatService.handleStreamError(res, error, "Failed to set up conversation stream");
		}
	});

	return router;
}
