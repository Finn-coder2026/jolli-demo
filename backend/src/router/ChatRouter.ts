import {
	type Agent,
	type AgentConfig,
	type ChatMessage,
	type ChatRequest,
	createAgentFromEnv,
	createMultiAgentFromEnv,
	LLMProvider,
	MultiAgent,
} from "../core/agent";
import type { ConvoDao } from "../dao/ConvoDao";
import type { DaoProvider } from "../dao/DaoProvider";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Response, type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

// environment variables:
const provider = (process.env.LLM_PROVIDER || "openai") as LLMProvider;
const model = process.env.LLM_MODEL;

/**
 * Parse and validate the stream request
 */
function parseStreamRequest(req: Request): ChatRequest & { conversationId?: number } {
	const { message, messages = [], conversationId } = req.body;

	if (!message || typeof message !== "string") {
		throw new Error("Message is required");
	}

	// Build messages array for agent
	const chatMessages: Array<ChatMessage> = [
		...messages.map((msg: { role: string; content: string }) => ({
			role: msg.role as "user" | "assistant",
			content: msg.content,
		})),
		{
			role: "user",
			content: message,
		},
	];

	const agentConfig: AgentConfig = {
		temperature: 0.7,
	};

	return { chatMessages, agentConfig, conversationId };
}

/**
 * Stream the agent's response to the client and return the full response
 * Note: This does NOT call res.end() to allow caller to send additional events
 */
async function streamChatResponse(
	res: Response,
	agent: Agent,
	chatMessages: Array<ChatMessage>,
	agentConfig: AgentConfig,
): Promise<string> {
	// Set headers for Server-Sent Events
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");

	// Stream the response using the agent
	/* v8 ignore next 2 - async generator initialization covered by for-await */
	const stream = agent.stream(chatMessages, agentConfig, getTenantContext());
	let fullResponse = "";

	for await (const chunk of stream) {
		if (chunk.type === "content" && chunk.content) {
			fullResponse += chunk.content;
			// Send as Server-Sent Event
			res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
		} else if (chunk.type === "done") {
			// Send done signal with metadata
			res.write(`data: ${JSON.stringify({ type: "done", metadata: chunk.metadata })}\n\n`);
		}
	}

	return fullResponse;
}

export function createChatRouter(
	convoDaoProvider: DaoProvider<ConvoDao>,
	tokenUtil: TokenUtil<UserInfo>,
	agent?: Agent,
): Router {
	const router = express.Router();
	// Create default agent from environment if not provided
	// Always use multi-agent abstraction, defaulting to single LLM if not configured
	let defaultAgent: Agent | undefined = agent || createMultiAgentFromEnv();

	if (!defaultAgent) {
		// Wrap single agent in multi-agent abstraction
		// Get provider info from environment
		const singleAgent = createAgentFromEnv();

		// If LLM is disabled (singleAgent is undefined), leave defaultAgent as undefined
		if (singleAgent) {
			const multiAgent = new MultiAgent();
			/* v8 ignore next - environment-based model name selection with fallback */
			const modelName = model || (provider === LLMProvider.OPENAI ? "gpt-4o-mini" : "claude-3-5-sonnet-20241022");

			/* v8 ignore next 8 - environment-based provider name selection */
			multiAgent.registerAgent("default", singleAgent, {
				id: "default",
				name: provider === LLMProvider.OPENAI ? "GPT-4" : "Claude",
				description: "Default AI assistant",
				capabilities: ["general", "code", "documentation"],
				provider,
				model: modelName,
			});

			defaultAgent = multiAgent;
		}
	}

	router.post("/stream", async (req: Request, res: Response) => {
		// Return 503 if LLM is disabled
		if (!defaultAgent) {
			res.status(503).json({ error: "LLM features are disabled" });
			return;
		}

		try {
			const { chatMessages, agentConfig, conversationId } = parseStreamRequest(req);
			/* v8 ignore next 2 - optional chaining for undefined token payload and cookies */
			// Prefer org-specific user ID (set by UserProvisioningMiddleware in multi-tenant mode)
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			const visitorId = req.cookies?.visitorId;

			const tenantContext = getTenantContext();

			// Stream the response
			const assistantResponse = await streamChatResponse(res, defaultAgent, chatMessages, agentConfig);

			/* v8 ignore next 43 - conversation saving logic uses ConvoDao which is excluded from coverage */
			// Save conversation and get the conversation ID
			let savedConversationId = conversationId;
			try {
				const userMessage = chatMessages[chatMessages.length - 1];

				// Only save user and assistant messages (filter out system messages)
				if (userMessage.role === "user" || userMessage.role === "assistant") {
					const convoDao = convoDaoProvider.getDao(tenantContext);
					if (conversationId) {
						// Update existing conversation
						await convoDao.addMessage(
							conversationId,
							userMessage as { role: "user" | "assistant"; content: string },
							userId,
							visitorId,
						);
						await convoDao.addMessage(
							conversationId,
							{ role: "assistant", content: assistantResponse },
							userId,
							visitorId,
						);
					} else {
						// Create new conversation
						const title =
							userMessage.content.length > 50
								? `${userMessage.content.slice(0, 50)}...`
								: userMessage.content;

						const newConversation = await convoDao.createConvo({
							userId,
							visitorId,
							title,
							messages: [
								userMessage as { role: "user" | "assistant"; content: string },
								{ role: "assistant", content: assistantResponse },
							],
						});
						savedConversationId = newConversation.id;
					}
				}
			} catch (error) {
				/* v8 ignore next 2 -- error logging for DB save failure */
				log.error(error, "Failed to save conversation.");
			}

			// Send conversation ID to frontend
			if (savedConversationId !== undefined) {
				res.write(
					`data: ${JSON.stringify({ type: "conversationId", conversationId: savedConversationId })}\n\n`,
				);
			}

			// Send final done signal and end response
			res.write("data: [DONE]\n\n");
			res.end();
		} catch (error) {
			log.error(error, "Chat streaming error.");
			/* v8 ignore next 20 - complex error handling with multiple branches, hard to test all paths */
			// Only validation errors from parseStreamRequest can be handled with JSON responses
			// Errors during streaming cannot be handled here as SSE headers are already sent
			if (error instanceof Error && error.message === "Message is required") {
				res.status(400).json({ error: error.message });
			} else if (!res.headersSent) {
				// If headers haven't been sent yet, send error response
				const errorMessage = error instanceof Error ? error.message : "Internal server error";
				res.status(500).json({ error: errorMessage });
			} else {
				// For streaming errors after headers sent, try to end the response gracefully
				try {
					if (!res.writableEnded) {
						res.write("data: [ERROR]\\n\\n");
						res.end();
					}
				} catch {
					// Response already ended or connection closed
				}
			}
		}
	});

	return router;
}
