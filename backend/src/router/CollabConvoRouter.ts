//noinspection ExceptionCaughtLocallyJS

import { type AgentEnvironment, createAgentEnvironment } from "../../../tools/jolliagent/src/direct/agentenv";
import type { Message, ToolCall } from "../../../tools/jolliagent/src/Types";
import { runToolCall } from "../../../tools/jolliagent/src/tools/Tools";
import { AgentChatAdapter } from "../adapters/AgentChatAdapter";
import { createCreateArticleToolDefinition, executeCreateArticleTool } from "../adapters/tools/CreateArticleTool";
import { createCreateSectionToolDefinition, executeCreateSectionTool } from "../adapters/tools/CreateSectionTool";
import { createDeleteSectionToolDefinition, executeDeleteSectionTool } from "../adapters/tools/DeleteSectionTool";
import { createEditSectionToolDefinition, executeEditSectionTool } from "../adapters/tools/EditSectionTool";
import {
	createGetCurrentArticleToolDefinition,
	executeGetCurrentArticleTool,
} from "../adapters/tools/GetCurrentArticleTool";
import {
	createGetLatestLinearTicketsToolDefinition,
	executeGetLatestLinearTicketsTool,
	type GetLatestLinearTicketsArgs,
} from "../adapters/tools/GetLatestLinearTicketsTool";
import { getConfig, getWorkflowConfig } from "../config/Config";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import type { ArtifactType, CollabMessage } from "../model/CollabConvo";
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
import express, { type Request, type Response, type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

// Singleton RevisionManager for in-memory revision tracking
const revisionManager = new RevisionManager(50);

// E2B environments cache
const e2bEnvironments = new Map<number, AgentEnvironment>();

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

// Note: ARTICLE_EDITING_SYSTEM_PROMPT has been moved to articleEditingAgent.ts
// and now uses tools (create_article, edit_section) instead of [ARTICLE_UPDATE] markers

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
	router.post("/:id/messages", async (req: Request, res: Response) => {
		try {
			const { message } = req.body;

			if (!message) {
				return res.status(400).json({ error: "Message is required" });
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

			// Broadcast typing indicator
			broadcastToConvo(chatService, id, {
				type: "typing",
				userId,
				timestamp: new Date().toISOString(),
			});

			// Return 202 Accepted immediately to avoid CloudFront/proxy timeouts
			// The AI response will be streamed via the SSE /stream connection
			res.status(202).json({ success: true, message: "Processing" });

			// Process AI response asynchronously
			processAIResponse(id, convo.artifactId, userId, sanitizedMessage).catch(
				/* v8 ignore next 9 - error callback for async processing failures */
				error => {
					log.error(error, "Error processing AI response for convo %d", id);
					// Broadcast error to connected clients via SSE
					broadcastToConvo(chatService, id, {
						type: "error",
						error: "Failed to generate AI response",
						timestamp: new Date().toISOString(),
					});
				},
			);
		} catch (error) {
			log.error(error, "Error adding message to collab convo.");

			if (error instanceof Error && error.message.includes("Message")) {
				return res.status(400).json({ error: error.message });
			}

			res.status(500).json({ error: "Failed to add message" });
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
				return { githubToken, githubOrg, githubRepo, githubBranch };
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
	): Promise<string> {
		// Article editing tools
		if (call.name === "create_article") {
			log.info("Executing create_article tool for draft %d", draft.id);
			return await executeCreateArticleTool(
				draft.id,
				undefined,
				call.arguments as { content: string },
				getDocDraftDao(),
				userId,
			);
		}
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
		if (call.name === "get_current_article") {
			log.info("Executing get_current_article tool for draft %d", draft.id);
			return await executeGetCurrentArticleTool(draft.id, undefined, getDocDraftDao());
		}
		if (call.name === "get_latest_linear_tickets") {
			log.info("Executing get_latest_linear_tickets tool");
			return await executeGetLatestLinearTicketsTool(call.arguments as GetLatestLinearTicketsArgs | undefined);
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
		toolName: string,
		draft: DocDraft,
		userId: number,
		convoId: number,
	): Promise<void> {
		const articleModifyingTools = ["create_article", "create_section", "delete_section", "edit_section"];
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
			toolName === "create_article"
				? "Tool-generated article creation"
				: toolName === "delete_section"
					? "Tool-generated section deletion"
					: "Tool-generated section edit";
		revisionManager.addRevision(draft.id, updatedDraft.content, userId, revisionReason);

		// Broadcast article update with metadata
		broadcastToConvo(chatService, convoId, {
			type: "article_updated",
			diffs: diffResult.diffs,
			contentLastEditedAt: updatedDraft.contentLastEditedAt,
			contentLastEditedBy: updatedDraft.contentLastEditedBy,
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Creates a tool executor function for article editing and E2B tools
	 */
	function createToolExecutor(
		draft: DocDraft,
		sharedEnv: AgentEnvironment | undefined,
		userId: number,
		convoId: number,
	): (call: ToolCall) => Promise<string> {
		return async (call: ToolCall): Promise<string> => {
			log.info("Running tool for draft %d: name=%s args=%s", draft.id, call.name, JSON.stringify(call.arguments));
			const result = await executeToolCall(call, draft, sharedEnv, userId);
			log.info("Tool completed for draft %d: name=%s", draft.id, call.name);
			await broadcastArticleUpdate(call.name, draft, userId, convoId);
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
				collabMsg = {
					role: msg.role,
					/* v8 ignore next - defensive fallback, TypeScript guarantees these fields exist */
					content: msg.content || "",
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
	): string {
		const githubInstructions =
			/* v8 ignore next 12 - both branches are valid runtime paths */
			githubToken && githubOrg && githubRepo
				? `**Important:** The repository ${githubOrg}/${githubRepo} (branch: ${
						githubBranch || "main"
					}) has been pre-checked out for you in the workspace at:
~/workspace/${githubRepo}/${githubBranch || "main"}/

When users ask questions about the code, look in this directory first. You can directly access and explore the codebase without needing to clone it again.`
				: githubToken
					? "Use the github_checkout tool to clone repositories when needed."
					: "NOTE: GitHub authentication is not configured. You can still use local file tools, but github_checkout will not work.";

		return `You are a helpful AI assistant that helps users write and edit articles.

**CRITICAL:** You MUST use tools to make any changes to the article. NEVER claim to have made changes without actually calling the appropriate tool. If the user asks you to add, edit, or delete content, you MUST call the corresponding tool - do not just say you did it.

You have access to article editing tools AND code exploration tools:

**Article Editing Tools:**
1. **create_article** - Create or completely rewrite the article
2. **create_section** - Add a new section to the article (REQUIRED when adding new sections)
3. **delete_section** - Remove a section from the article (REQUIRED when removing sections)
4. **edit_section** - Edit a specific section of the article (REQUIRED when modifying sections)
5. **get_current_article** - Retrieve the current full content of the article
6. **get_latest_linear_tickets** - Fetch up-to-date Linear tickets for status context

**Code Exploration Tools (via E2B sandbox):**
- Git tools for browsing repositories
- File system tools for reading files
- Code analysis tools

${githubInstructions}

**IMPORTANT WORKFLOW:**
1. When asked to modify the article, FIRST call get_current_article to see the current content
2. Then use the appropriate tool (create_section, edit_section, delete_section) to make changes
3. NEVER say "Done" or claim success without having called a tool

Use article editing tools to modify the article content, and code exploration tools to research, analyze code, or gather information from the repository.`;
	}

	/**
	 * Creates E2B environment with article editing tools and code exploration capabilities
	 */
	async function createE2BEnvironmentForDraft(
		draft: DocDraft,
		githubToken?: string,
		githubOrg?: string,
		githubRepo?: string,
		githubBranch?: string,
	): Promise<AgentEnvironment> {
		log.info(
			"Creating E2B jolliagent environment for draft %d with e2b-code + article editing tools (GH_PAT: %s)",
			draft.id,
			/* v8 ignore next - both branches are valid runtime paths */
			githubToken ? "configured" : "not configured",
		);

		// Create article editing tool definitions for this draft
		const createArticleTool = createCreateArticleToolDefinition(draft.id);
		const createSectionTool = createCreateSectionToolDefinition(draft.id);
		const deleteSectionTool = createDeleteSectionToolDefinition(draft.id);
		const editSectionTool = createEditSectionToolDefinition(draft.id);
		const getCurrentArticleTool = createGetCurrentArticleToolDefinition(draft.id);
		const getLatestLinearTicketsTool = createGetLatestLinearTicketsToolDefinition();

		const articleEditingSystemPrompt = buildArticleEditingSystemPrompt(
			githubToken,
			githubOrg,
			githubRepo,
			githubBranch,
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
			systemPrompt: articleEditingSystemPrompt,
			additionalTools: [
				createArticleTool,
				createSectionTool,
				deleteSectionTool,
				editSectionTool,
				getCurrentArticleTool,
				getLatestLinearTicketsTool,
			],
			/* v8 ignore next - both branches are valid runtime paths */
			envVars,
		});

		log.info("E2B jolliagent environment created for draft %d with sandbox ID: %s", draft.id, env.sandboxId);

		// Pre-checkout the GitHub repo if configured
		await preCheckoutGithubRepo(env, draft.id, githubToken, githubOrg, githubRepo, githubBranch);

		return env;
	}

	/**
	 * Processes AI response asynchronously and broadcasts all updates via SSE
	 */
	async function processAIResponse(
		convoId: number,
		artifactId: number,
		userId: number,
		sanitizedMessage: string,
	): Promise<void> {
		// Get the draft to include article content in prompt
		const draft = await getDocDraftDao().getDocDraft(artifactId);
		if (!draft) {
			// Broadcast error since we can't return HTTP response
			broadcastToConvo(chatService, convoId, {
				type: "error",
				error: "Draft not found",
				timestamp: new Date().toISOString(),
			});
			return;
		}

		// Get conversation for message history
		const convo = await getCollabConvoDao().getCollabConvo(convoId);
		/* v8 ignore next 8 - Conversation not found during async processing is difficult to test reliably */
		if (!convo) {
			broadcastToConvo(chatService, convoId, {
				type: "error",
				error: "Conversation not found",
				timestamp: new Date().toISOString(),
			});
			return;
		}

		// Resolve adapter: use provided adapter or create E2B adapter
		let adapter: AgentChatAdapter;
		let sharedEnv: AgentEnvironment | undefined;

		if (agentAdapter) {
			adapter = agentAdapter;
		} else {
			// E2B mode: Create jolliagent environment with BOTH e2b-code tools AND article editing tools
			// Note: getWorkflowConfig() guarantees e2bApiKey and e2bTemplateId are strings (throws if missing)
			if (!e2bEnvironments.has(draft.id)) {
				const { githubToken, githubOrg, githubRepo, githubBranch } = await getGithubIntegrationDetails();
				const env = await createE2BEnvironmentForDraft(draft, githubToken, githubOrg, githubRepo, githubBranch);
				e2bEnvironments.set(draft.id, env);
			}

			sharedEnv = e2bEnvironments.get(draft.id);
			/* v8 ignore next 3 - defensive: E2B environment should always exist after creation */
			if (!sharedEnv) {
				throw new Error(`E2B environment not found for draft ${draft.id}`);
			}
			adapter = new AgentChatAdapter({ agent: sharedEnv.agent });
		}

		// Create tool executor for article editing tools and E2B tools
		const toolExecutor = createToolExecutor(draft, sharedEnv, userId, convoId);

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
					// Broadcast chunk to connected users with sequence number for ordering
					broadcastToConvo(chatService, convoId, {
						type: "content_chunk",
						content,
						seq: chunkSequence++,
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
					broadcastToConvo(chatService, convoId, {
						type: "tool_event",
						event,
						timestamp: new Date().toISOString(),
					});
				},
				runTool: toolExecutor,
			});
			fullResponse = result.assistantText;
		} catch (error) {
			log.error(error, "Error streaming LLM response.");
			// Broadcast error since we can't return HTTP response
			broadcastToConvo(chatService, convoId, {
				type: "error",
				error: "Failed to generate AI response",
				timestamp: new Date().toISOString(),
			});
			return;
		}

		// Note: Article updates now happen via tools (create_article, edit_section)
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

		// Broadcast message complete event with the final assistant message
		broadcastToConvo(chatService, convoId, {
			type: "message_complete",
			message: assistantMessage,
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
