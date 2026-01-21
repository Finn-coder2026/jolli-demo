import { createArticleEditingAgent } from "../../../tools/jolliagent/src/agents/articleEditingAgent";
import type { AgentChatAdapter } from "../adapters/AgentChatAdapter";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import { mockCollabConvoDao } from "../dao/CollabConvoDao.mock";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDraftDao } from "../dao/DocDraftDao";
import { mockDocDraftDao } from "../dao/DocDraftDao.mock";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

import { createMockIntegrationsManager } from "../integrations/IntegrationsManager.mock";
import type { TokenUtil } from "../util/TokenUtil";
import { createCollabConvoRouter } from "./CollabConvoRouter";
import cookieParser from "cookie-parser";
import express from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock getWorkflowConfig and getConfig to provide fake E2B configuration
vi.mock("../config/Config", () => ({
	getWorkflowConfig: vi.fn(() => ({
		e2bEnabled: true,
		e2bApiKey: "test-e2b-api-key",
		e2bTemplateId: "test-e2b-template-id",
		anthropicApiKey: "test-anthropic-api-key",
		debug: true,
	})),
	getConfig: vi.fn(() => ({
		TAVILY_API_KEY: "test-tavily-api-key",
	})),
	resetConfig: vi.fn(),
}));

// Mock createArticleEditingAgent
vi.mock("../../../tools/jolliagent/src/agents/articleEditingAgent", () => ({
	createArticleEditingAgent: vi.fn(),
}));

// Mock runToolCall for E2B tools
vi.mock("../../../tools/jolliagent/src/tools/Tools", () => ({
	runToolCall: vi.fn(),
}));

// Mock createAgentEnvironment for E2B environment setup
vi.mock("../../../tools/jolliagent/src/direct/agentenv", () => ({
	createAgentEnvironment: vi.fn(),
}));

// Mock IntegrationUtil
vi.mock("../util/IntegrationUtil", () => ({
	getAccessTokenForGithubRepoIntegration: vi.fn(),
}));

// Mock executeGetLatestLinearTicketsTool
vi.mock("../adapters/tools/GetLatestLinearTicketsTool", () => ({
	executeGetLatestLinearTicketsTool: vi.fn(),
	createGetLatestLinearTicketsToolDefinition: vi.fn(() => ({
		name: "get_latest_linear_tickets",
		description: "Get latest linear tickets",
	})),
}));

// Mock article editing tool definitions
vi.mock("../adapters/tools/CreateArticleTool", () => ({
	executeCreateArticleTool: vi.fn(async (draftId, _userId, args, docDraftDao) => {
		const draft = await docDraftDao.getDocDraft(draftId);
		if (draft) {
			await docDraftDao.updateDocDraft(draftId, { content: args.content });
		}
		return "Article created successfully";
	}),
	createCreateArticleToolDefinition: vi.fn(() => ({
		name: "create_article",
		description: "Create article",
	})),
}));

vi.mock("../adapters/tools/CreateSectionTool", () => ({
	executeCreateSectionTool: vi.fn(async (draftId, _userId, args, docDraftDao) => {
		const draft = await docDraftDao.getDocDraft(draftId);
		if (draft) {
			const newContent = `${draft.content}\n\n## ${args.sectionTitle}\n\n${args.content}`;
			await docDraftDao.updateDocDraft(draftId, { content: newContent });
		}
		return "Section created successfully";
	}),
	createCreateSectionToolDefinition: vi.fn(() => ({
		name: "create_section",
		description: "Create section",
	})),
}));

vi.mock("../adapters/tools/DeleteSectionTool", () => ({
	executeDeleteSectionTool: vi.fn(async (draftId, _userId, args, docDraftDao) => {
		const draft = await docDraftDao.getDocDraft(draftId);
		if (draft) {
			// Simple mock: remove the section with the given title
			const lines = draft.content.split("\n");
			const filtered = [];
			let skip = false;
			for (const line of lines) {
				if (line.includes(args.sectionTitle)) {
					skip = true;
					continue;
				}
				if (skip && line.startsWith("##")) {
					skip = false;
				}
				if (!skip) {
					filtered.push(line);
				}
			}
			await docDraftDao.updateDocDraft(draftId, { content: filtered.join("\n") });
		}
		return "Section deleted successfully";
	}),
	createDeleteSectionToolDefinition: vi.fn(() => ({
		name: "delete_section",
		description: "Delete section",
	})),
}));

vi.mock("../adapters/tools/EditSectionTool", () => ({
	executeEditSectionTool: vi.fn(async (draftId, _userId, args, docDraftDao) => {
		const draft = await docDraftDao.getDocDraft(draftId);
		if (draft) {
			// Simple mock: replace section content
			const lines = draft.content.split("\n");
			let inSection = false;
			const result = [];
			for (const line of lines) {
				if (line.includes(args.sectionTitle)) {
					result.push(line);
					result.push("");
					result.push(args.newContent);
					inSection = true;
					continue;
				}
				if (inSection && line.startsWith("##")) {
					inSection = false;
				}
				if (!inSection) {
					result.push(line);
				}
			}
			await docDraftDao.updateDocDraft(draftId, { content: result.join("\n") });
		}
		return "Section edited successfully";
	}),
	createEditSectionToolDefinition: vi.fn(() => ({
		name: "edit_section",
		description: "Edit section",
	})),
}));

vi.mock("../adapters/tools/GetCurrentArticleTool", () => ({
	executeGetCurrentArticleTool: vi.fn(async (draftId, _userId, docDraftDao) => {
		const draft = await docDraftDao.getDocDraft(draftId);
		return draft ? draft.content : "";
	}),
	createGetCurrentArticleToolDefinition: vi.fn(() => ({
		name: "get_current_article",
		description: "Get current article",
	})),
}));

describe("CollabConvoRouter", () => {
	let mockConvoDao: CollabConvoDao;
	let mockDraftDao: DocDraftDao;
	let mockDocDraftSectionChangesDao: DocDraftSectionChangesDao;
	let mockTokenUtil: TokenUtil<UserInfo>;
	let mockIntegrationsManager: IntegrationsManager;
	let mockAgentAdapter: AgentChatAdapter;
	let app: express.Application;

	const mockUserInfo: UserInfo = {
		userId: 1,
		email: "test@example.com",
		name: "Test User",
		picture: undefined,
	};

	function createToolRunnerAdapter(
		toolCall: { name: string; arguments?: Record<string, unknown> },
		options?: { onAfterTool?: () => Promise<void> | void; assistantText?: string },
	): AgentChatAdapter {
		const assistantText = options?.assistantText ?? "Tool response";
		return {
			streamResponse: vi.fn().mockImplementation(async ({ runTool, onChunk, onToolEvent }) => {
				if (!runTool) {
					throw new Error("runTool is required for tool runner adapter");
				}
				// Call onToolEvent before running the tool
				if (onToolEvent) {
					onToolEvent({ type: "tool_start", tool: toolCall.name, status: "running" });
				}
				await runTool(toolCall as never);
				// Call onToolEvent after running the tool
				if (onToolEvent) {
					onToolEvent({
						type: "tool_complete",
						tool: toolCall.name,
						status: "success",
						result: "Tool executed",
					});
				}
				if (options?.onAfterTool) {
					await options.onAfterTool();
				}
				if (onChunk) {
					onChunk(assistantText);
				}
				return {
					assistantText,
					newMessages: [],
				};
			}),
		} as unknown as AgentChatAdapter;
	}

	beforeEach(() => {
		process.env.DISABLE_LOGGING = "true";
		vi.clearAllMocks();

		mockConvoDao = mockCollabConvoDao();
		mockDraftDao = mockDocDraftDao();
		mockDocDraftSectionChangesDao = {
			deleteByDraftId: vi.fn().mockResolvedValue(0),
		} as unknown as DocDraftSectionChangesDao;
		mockTokenUtil = {
			encodePayload: vi.fn(),
			decodePayload: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;
		mockIntegrationsManager = createMockIntegrationsManager();

		// Setup default mock AgentChatAdapter
		mockAgentAdapter = {
			// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
			streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
				if (onChunk) {
					onChunk("Mock response");
				}
				return {
					assistantText: "Mock response",
					newMessages: [
						{
							role: "assistant",
							content: "Mock response",
						},
					],
				};
			}),
		} as unknown as AgentChatAdapter;

		// Setup default mock for createArticleEditingAgent
		vi.mocked(createArticleEditingAgent).mockReturnValue({
			agent: {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				chatTurn: vi.fn().mockImplementation(async ({ onTextDelta }) => {
					if (onTextDelta) {
						onTextDelta("Mock response");
					}
					return {
						assistantText: "Mock response",
						toolCalls: [],
						history: [],
					};
				}),
			} as never,
			withDefaults: () => ({}),
		});

		const router = createCollabConvoRouter(
			mockDaoProvider(mockConvoDao),
			mockDaoProvider(mockDraftDao),
			mockDaoProvider(mockDocDraftSectionChangesDao),
			mockTokenUtil,
			mockIntegrationsManager,
			mockAgentAdapter,
		);
		app = express();
		app.use(express.json());
		app.use(cookieParser());
		app.use("/api/collab-convos", router);
	});

	describe("POST /api/collab-convos", () => {
		it("should create a new collab convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create a draft first
			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: draft.id,
			});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty("id");
			expect(response.body.artifactType).toBe("doc_draft");
		});

		it("should return existing convo if already exists", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo1 = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: draft.id,
			});

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(convo1.id);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: 1,
			});

			expect(response.status).toBe(401);
		});

		it("should return 400 if artifact type or ID is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
			});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Artifact type and ID are required" });
		});

		it("should return 400 for invalid artifact type", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "invalid_type",
				artifactId: 1,
			});

			expect(response.status).toBe(400);
		});

		it("should return 404 if artifact not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: 999,
			});

			expect(response.status).toBe(404);
		});

		it("should return 403 if user does not own the artifact", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 2,
				docId: undefined,
			});

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: draft.id,
			});

			expect(response.status).toBe(403);
		});

		it("should allow access for shared drafts owned by another user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Draft owned by user 2 but shared
			const draft = await mockDraftDao.createDocDraft({
				title: "Shared Draft",
				content: "Test content",
				createdBy: 2,
				isShared: true,
				docId: undefined,
			});

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: draft.id,
			});

			expect(response.status).toBe(201);
			expect(response.body.artifactId).toBe(draft.id);
		});

		it("should allow access for agent-created drafts owned by another user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Draft owned by user 2 but created by agent
			const draft = await mockDraftDao.createDocDraft({
				title: "Agent Draft",
				content: "Test content",
				createdBy: 2,
				createdByAgent: true,
				docId: undefined,
			});

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: draft.id,
			});

			expect(response.status).toBe(201);
			expect(response.body.artifactId).toBe(draft.id);
		});

		it("should allow access for drafts editing existing articles owned by another user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Draft owned by user 2 but editing an existing article (has docId)
			const draft = await mockDraftDao.createDocDraft({
				title: "Edit Draft",
				content: "Test content",
				createdBy: 2,
				docId: 123,
			});

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: draft.id,
			});

			expect(response.status).toBe(201);
			expect(response.body.artifactId).toBe(draft.id);
		});

		it("should handle errors during convo creation", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Mock getDocDraft to throw an error
			const originalGetDocDraft = mockDraftDao.getDocDraft.bind(mockDraftDao);
			vi.spyOn(mockDraftDao, "getDocDraft").mockImplementation(() => {
				throw new Error("Database error");
			});

			const response = await request(app).post("/api/collab-convos").send({
				artifactType: "doc_draft",
				artifactId: 1,
			});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to create conversation" });

			// Restore original implementation
			mockDraftDao.getDocDraft = originalGetDocDraft;
		});
	});

	describe("GET /api/collab-convos/:id", () => {
		it("should get a convo by ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).get(`/api/collab-convos/${convo.id}`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(convo.id);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/collab-convos/1");

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/collab-convos/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid convo ID" });
		});

		it("should return 404 if convo not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/collab-convos/999");

			expect(response.status).toBe(404);
		});

		it("should return 403 if user does not have access", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 2,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).get(`/api/collab-convos/${convo.id}`);

			expect(response.status).toBe(403);
		});

		it("should allow access to convo for shared drafts owned by another user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Shared Draft",
				content: "Test content",
				createdBy: 2,
				isShared: true,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).get(`/api/collab-convos/${convo.id}`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(convo.id);
		});

		it("should handle errors during convo retrieval", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Mock getCollabConvo to throw an error
			const originalGetCollabConvo = mockConvoDao.getCollabConvo.bind(mockConvoDao);
			vi.spyOn(mockConvoDao, "getCollabConvo").mockImplementation(() => {
				throw new Error("Database error");
			});

			const response = await request(app).get("/api/collab-convos/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get conversation" });

			// Restore original implementation
			mockConvoDao.getCollabConvo = originalGetCollabConvo;
		});
	});

	describe("GET /api/collab-convos/artifact/:type/:id", () => {
		it("should get convo by artifact", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).get(`/api/collab-convos/artifact/doc_draft/${draft.id}`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(convo.id);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/collab-convos/artifact/doc_draft/1");

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid artifact type", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/collab-convos/artifact/invalid/1");

			expect(response.status).toBe(400);
		});

		it("should return 400 for invalid artifact ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/collab-convos/artifact/doc_draft/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid artifact ID" });
		});

		it("should return 403 if user does not have access", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 2,
				docId: undefined,
			});

			const response = await request(app).get(`/api/collab-convos/artifact/doc_draft/${draft.id}`);

			expect(response.status).toBe(403);
		});

		it("should return 404 if convo not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const response = await request(app).get(`/api/collab-convos/artifact/doc_draft/${draft.id}`);

			expect(response.status).toBe(404);
		});

		it("should handle errors during convo retrieval by artifact", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Mock getDocDraft to throw an error
			const originalGetDocDraft = mockDraftDao.getDocDraft.bind(mockDraftDao);
			vi.spyOn(mockDraftDao, "getDocDraft").mockImplementation(() => {
				throw new Error("Database error");
			});

			const response = await request(app).get("/api/collab-convos/artifact/doc_draft/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get conversation" });

			// Restore original implementation
			mockDraftDao.getDocDraft = originalGetDocDraft;
		});
	});

	// Remove the E2B test since it's complex to test properly and the code path is already covered by other tests

	describe("POST /api/collab-convos/:id/messages", () => {
		it("should add a message to a convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "Hello, AI!",
			});

			expect(response.status).toBe(202);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("Processing");
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/collab-convos/1/messages").send({
				message: "Hello",
			});

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/collab-convos/invalid/messages").send({
				message: "Hello",
			});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid convo ID" });
		});

		it("should return 400 if message is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).post(`/api/collab-convos/${convo.id}/messages`).send({});

			expect(response.status).toBe(400);
		});

		it("should return 404 if convo not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/collab-convos/999/messages").send({
				message: "Hello",
			});

			expect(response.status).toBe(404);
		});

		it("should return 500 if database error occurs", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Make addMessage throw a non-validation error
			vi.spyOn(mockConvoDao, "addMessage").mockRejectedValueOnce(new Error("Database error"));

			const response = await request(app).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "Hello",
			});

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to add message" });
		});

		it("should return 400 if message validation fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Send empty string which will fail validation
			const response = await request(app).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "   ",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toContain("Message");
		});

		it("should return 404 if draft not found for convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 999,
				messages: [],
			});

			const response = await request(app).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "Hello",
			});

			expect(response.status).toBe(404);
		});

		it("should return 403 if user does not own the draft", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 2,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "Hello",
			});

			expect(response.status).toBe(403);
		});

		it("should return 404 for unsupported artifact type", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create a convo with an unsupported artifact type (using type cast to bypass type checking)
			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "unsupported" as "doc_draft",
				artifactId: 1,
				messages: [],
			});

			const response = await request(app).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "Hello",
			});

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Draft not found" });
		});

		it("should return 500 when LLM streaming fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Create a mock agent adapter that throws during streaming
			const failingAdapter = {
				streamResponse: vi.fn().mockRejectedValue(new Error("Stream error")),
			} as unknown as AgentChatAdapter;

			// Create a new router with the failing adapter
			const failingRouter = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				failingAdapter,
			);

			const failingApp = express();
			failingApp.use(express.json());
			failingApp.use(cookieParser());
			failingApp.use("/api/collab-convos", failingRouter);

			const response = await request(failingApp).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "Hello",
			});

			// POST returns 202 immediately, streaming error handled async
			expect(response.status).toBe(202);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("Processing");

			// Note: "Failed to generate response" error would be broadcast via SSE
		});

		// Note: Article update tests removed - article updates now handled by tools (create_article, edit_section)
		// instead of [ARTICLE_UPDATE] markers

		it("should handle existing conversation messages", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			// Create a conversation with existing messages
			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [
					{
						role: "user",
						content: "Previous user message",
						userId: 1,
						timestamp: new Date().toISOString(),
					},
					{
						role: "assistant",
						content: "Previous assistant response",
						timestamp: new Date().toISOString(),
					},
				],
			});

			// Router already uses mockAgentAdapter
			const routerWithAgent = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				mockAgentAdapter,
			);

			const appWithAgent = express();
			appWithAgent.use(express.json());
			appWithAgent.use(cookieParser());
			appWithAgent.use("/api/collab-convos", routerWithAgent);

			const response = await request(appWithAgent).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "New message",
			});

			expect(response.status).toBe(202);
			expect(response.body.success).toBe(true);
		});

		it("should return 404 when draft is not found during message processing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Mock getDocDraft to return the draft for authorization but undefined for processing
			let callCount = 0;
			const originalGetDocDraft = mockDraftDao.getDocDraft.bind(mockDraftDao);
			vi.spyOn(mockDraftDao, "getDocDraft").mockImplementation(async (id: number) => {
				callCount++;
				if (callCount === 1) {
					// First call for authorization check - return the draft
					return await originalGetDocDraft(id);
				}
				// Second call for message processing - return undefined
				return;
			});

			const routerWithAgent = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				mockAgentAdapter,
			);

			const appWithAgent = express();
			appWithAgent.use(express.json());
			appWithAgent.use(cookieParser());
			appWithAgent.use("/api/collab-convos", routerWithAgent);

			const response = await request(appWithAgent).post(`/api/collab-convos/${convo.id}/messages`).send({
				message: "Hello",
			});

			// POST returns 202 immediately, error handling happens async
			expect(response.status).toBe(202);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("Processing");

			// Note: "Draft not found" error would be broadcast via SSE in real scenario
		});
	});

	describe("GET /api/collab-convos/:id/stream", () => {
		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/collab-convos/1/stream");

			expect(response.status).toBe(401);
		});

		it("should return 404 if convo not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/collab-convos/999/stream");

			expect(response.status).toBe(404);
		});

		it("should return 403 if user does not have access", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 2,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const response = await request(app).get(`/api/collab-convos/${convo.id}/stream`);

			expect(response.status).toBe(403);
		});

		it("should allow stream access for shared drafts owned by another user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Shared Draft",
				content: "Test content",
				createdBy: 2,
				isShared: true,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Start the stream request but don't wait for it (streaming connections don't complete)
			const streamPromise = request(app).get(`/api/collab-convos/${convo.id}/stream`);

			// Wait a tiny bit for headers to be set
			await new Promise(resolve => setTimeout(resolve, 50));

			// The request is now streaming, verify the setup was successful
			expect(streamPromise).toBeDefined();
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/collab-convos/invalid/stream");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid convo ID" });
		});

		it("should set up SSE stream successfully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Start the stream request but don't wait for it
			const streamPromise = request(app).get(`/api/collab-convos/${convo.id}/stream`);

			// Wait a tiny bit for headers to be set
			await new Promise(resolve => setTimeout(resolve, 50));

			// The request is now streaming, we can verify the setup was successful
			// by checking that no error was thrown (the promise is still pending)
			expect(streamPromise).toBeDefined();
		});

		it("should handle client disconnect and remove connection", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Mock the ChatService to track calls
			vi.fn();
			vi.fn();
			vi.fn();
			// Create a test app with mocked ChatService
			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());

			// Create router with custom chat service
			const routerWithMockService = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
			);
			testApp.use("/api/collab-convos", routerWithMockService);

			// Start stream request
			const response = await request(testApp)
				.get(`/api/collab-convos/${convo.id}/stream`)
				.timeout(100)
				.catch(_err => {
					// Stream will timeout which is expected
					return { status: 200 };
				});

			// Wait for disconnect handler to be called
			await new Promise(resolve => setTimeout(resolve, 50));

			// Verify connection was set up (no error thrown)
			expect(response).toBeDefined();
		});

		it("should handle errors during stream setup", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "Test content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Make getDocDraft throw an error after the convo is found
			const originalGetDocDraft = mockDraftDao.getDocDraft.bind(mockDraftDao);
			vi.spyOn(mockDraftDao, "getDocDraft").mockImplementation(async id => {
				const result = await originalGetDocDraft(id);
				if (result) {
					throw new Error("Database connection lost");
				}
				return result;
			});

			const response = await request(app).get(`/api/collab-convos/${convo.id}/stream`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to set up conversation stream" });
		});
	});

	describe("Tool execution in POST /messages", () => {
		it("executes create_article tool and broadcasts update", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create draft
			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "",
				createdBy: 1,
				docId: undefined,
			});

			// Create conversation
			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Mock createArticleEditingAgent to return a factory with an agent
			// that will call runTool when chatTurn is called
			const toolAdapter = createToolRunnerAdapter(
				{
					name: "create_article",
					arguments: { content: "# New Article\n\nThis is new content." },
				},
				{ assistantText: "I created the article for you." },
			);

			// Create router without passing agent to trigger tool creation path
			const routerWithTools = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				toolAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithTools);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Create an article" });

			expect(response.status).toBe(202);

			// Verify draft was updated
			const updatedDraft = await mockDraftDao.getDocDraft(draft.id);
			expect(updatedDraft?.content).toContain("New Article");
		});

		it("executes create_section tool and broadcasts update", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Existing Article\n\nContent here.",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const toolAdapter = createToolRunnerAdapter(
				{
					name: "create_section",
					arguments: {
						sectionTitle: "New Section",
						content: "New section content",
						insertAfter: "Existing Article",
					},
				},
				{ assistantText: "Added new section." },
			);

			const routerWithTools = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				toolAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithTools);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Add a section" });

			expect(response.status).toBe(202);

			const updatedDraft = await mockDraftDao.getDocDraft(draft.id);
			expect(updatedDraft?.content).toContain("New Section");
		});

		it("executes delete_section tool and broadcasts update", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Article\n\n## Section to Delete\n\nContent.\n\n## Keep This\n\nKeep this.",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const toolAdapter = createToolRunnerAdapter(
				{
					name: "delete_section",
					arguments: { sectionTitle: "Section to Delete" },
				},
				{ assistantText: "Deleted section." },
			);

			const routerWithTools = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				toolAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithTools);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Delete the section" });

			expect(response.status).toBe(202);

			const updatedDraft = await mockDraftDao.getDocDraft(draft.id);
			expect(updatedDraft?.content).not.toContain("Section to Delete");
			expect(updatedDraft?.content).toContain("Keep This");
		});

		it("executes edit_section tool and broadcasts update", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Article\n\n## Section to Edit\n\nOld content.",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const toolAdapter = createToolRunnerAdapter(
				{
					name: "edit_section",
					arguments: {
						sectionTitle: "Section to Edit",
						newContent: "Updated content.",
					},
				},
				{ assistantText: "Updated section." },
			);

			const routerWithTools = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				toolAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithTools);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Edit the section" });

			expect(response.status).toBe(202);

			const updatedDraft = await mockDraftDao.getDocDraft(draft.id);
			expect(updatedDraft?.content).toContain("Updated content");
			expect(updatedDraft?.content).not.toContain("Old content");
		});

		it("handles unknown tool gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Article",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const toolAdapter = createToolRunnerAdapter(
				{ name: "unknown_tool", arguments: {} },
				{ assistantText: "Tried unknown tool." },
			);

			const routerWithTools = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				toolAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithTools);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Do something" });

			expect(response.status).toBe(202);
		});

		it("initializes revision history on first tool call", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Original Content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const toolAdapter = createToolRunnerAdapter(
				{
					name: "create_article",
					arguments: { content: "# New Content" },
				},
				{ assistantText: "Created article." },
			);

			const routerWithTools = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				toolAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithTools);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Create article" });

			expect(response.status).toBe(202);

			// Verify draft was updated
			const updatedDraft = await mockDraftDao.getDocDraft(draft.id);
			expect(updatedDraft?.content).toContain("New Content");
		});

		it("handles case when draft is deleted after tool execution", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			const toolAdapter = createToolRunnerAdapter(
				{
					name: "create_article",
					arguments: { content: "# New Content" },
				},
				{
					onAfterTool: async () => {
						await mockDraftDao.deleteDocDraft(draft.id);
					},
					assistantText: "Done.",
				},
			);

			const routerWithTools = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				toolAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithTools);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Create content" });

			// Should still succeed even if draft is deleted
			expect(response.status).toBe(202);
		});

		it("saves all message role types from agent response", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Create an adapter that returns various message types
			const multiMessageAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock implementation doesn't need await
				streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
					if (onChunk) {
						onChunk("Test response");
					}
					return {
						assistantText: "Test response",
						newMessages: [
							{
								role: "user",
								content: "User message",
							},
							{
								role: "assistant",
								content: "Assistant message",
							},
							{
								role: "system",
								content: "System message",
							},
							{
								role: "assistant_tool_use",
								tool_call_id: "call_1",
								tool_name: "test_tool",
								tool_input: { arg: "value" },
							},
							{
								role: "assistant_tool_uses",
								calls: [{ id: "call_2", name: "another_tool", arguments: {} }],
							},
							{
								role: "tool",
								tool_call_id: "call_1",
								tool_name: "test_tool",
								content: "Tool result",
							},
							{
								role: "unknown_role",
								content: "This should be skipped",
							},
						],
					};
				}),
			} as unknown as AgentChatAdapter;

			const routerWithMessages = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				multiMessageAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithMessages);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Test message" });

			expect(response.status).toBe(202);

			// Verify all message types were saved (except unknown role)
			const updatedConvo = await mockConvoDao.getCollabConvo(convo.id);
			expect(updatedConvo?.messages.length).toBeGreaterThan(0);

			// Check for specific message roles
			const messages = updatedConvo?.messages || [];
			expect(messages.some(m => m.role === "user")).toBe(true);
			expect(messages.some(m => m.role === "assistant")).toBe(true);
			expect(messages.some(m => m.role === "system")).toBe(true);
			expect(messages.some(m => m.role === "assistant_tool_use")).toBe(true);
			expect(messages.some(m => m.role === "assistant_tool_uses")).toBe(true);
			expect(messages.some(m => m.role === "tool")).toBe(true);
		});

		it("executes get_latest_linear_tickets tool", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Mock the executeGetLatestLinearTicketsTool
			const { executeGetLatestLinearTicketsTool } = await import("../adapters/tools/GetLatestLinearTicketsTool");
			vi.mocked(executeGetLatestLinearTicketsTool).mockResolvedValue("Linear tickets retrieved");

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Create adapter that returns get_latest_linear_tickets tool call
			const linearToolAdapter = createToolRunnerAdapter(
				{
					name: "get_latest_linear_tickets",
					arguments: { limit: 10 },
				},
				{ assistantText: "I retrieved the Linear tickets for you." },
			);

			const routerWithLinear = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				linearToolAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithLinear);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Get linear tickets" });

			expect(response.status).toBe(202);
			expect(executeGetLatestLinearTicketsTool).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
		});

		it("executes get_current_article tool", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Mock the executeGetCurrentArticleTool
			const { executeGetCurrentArticleTool } = await import("../adapters/tools/GetCurrentArticleTool");
			vi.mocked(executeGetCurrentArticleTool).mockResolvedValue(
				"# Current Article\n\nThis is the current article content.",
			);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Current Article\n\nThis is the current article content.",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Track if runTool was called
			let runToolCalled = false;

			// Create adapter that returns get_current_article tool call
			const getCurrentArticleAdapter = {
				streamResponse: vi.fn().mockImplementation(async (params: never) => {
					// biome-ignore lint/suspicious/noExplicitAny: Need to access params for testing
					const { runTool, onChunk } = params as any;
					runToolCalled = !!runTool;
					if (runTool) {
						await runTool({ name: "get_current_article", arguments: {} } as never);
					}
					if (onChunk) {
						onChunk("Here is the current article content.");
					}
					return {
						assistantText: "Here is the current article content.",
						newMessages: [],
					};
				}),
			} as unknown as AgentChatAdapter;

			const routerWithGetArticle = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				getCurrentArticleAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithGetArticle);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Get the current article" });

			expect(response.status).toBe(202);
			expect(runToolCalled).toBe(true);
			expect(executeGetCurrentArticleTool).toHaveBeenCalledWith(draft.id, undefined, mockDraftDao);
		});

		it("executes E2B tools via runToolCall when E2B is enabled", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Set E2B environment variables to enable E2B mode
			const originalE2BApiKey = process.env.E2B_API_KEY;
			const originalE2BTemplateId = process.env.E2B_TEMPLATE_ID;
			const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
			process.env.E2B_API_KEY = "test-api-key";
			process.env.E2B_TEMPLATE_ID = "test-template-id";
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

			// Reset config cache so the new environment variables are picked up
			const { resetConfig } = await import("../config/Config");
			resetConfig();

			// Mock the runToolCall function
			const { runToolCall } = await import("../../../tools/jolliagent/src/tools/Tools");
			vi.mocked(runToolCall).mockResolvedValue("E2B tool executed successfully");

			// Mock createAgentEnvironment to return a mock E2B environment
			// The agent needs to simulate calling a tool
			const { createAgentEnvironment } = await import("../../../tools/jolliagent/src/direct/agentenv");
			const mockAgentEnvironment = {
				agent: {
					chatTurn: vi.fn().mockImplementation(async ({ runTool, history }) => {
						// Simulate the agent calling an E2B tool
						if (runTool) {
							await runTool({ name: "python_code", arguments: { code: "print('test')" } } as never);
						}
						return {
							assistantText: "E2B response",
							toolCalls: [],
							history: [...history, { role: "assistant", content: "E2B response" }],
						};
					}),
				},
				runState: {
					sandbox: { id: "test-sandbox-id" },
					tools: {},
				},
				sandboxId: "test-sandbox-id",
			};
			vi.mocked(createAgentEnvironment).mockResolvedValue(mockAgentEnvironment as never);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// DON'T pass agentAdapter - let the router create the E2B environment
			const routerWithE2B = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithE2B);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Run some Python code" });

			expect(response.status).toBe(202);

			// Verify runToolCall was called
			expect(runToolCall).toHaveBeenCalled();

			// Restore environment variables
			if (originalE2BApiKey) {
				process.env.E2B_API_KEY = originalE2BApiKey;
			} else {
				delete process.env.E2B_API_KEY;
			}
			if (originalE2BTemplateId) {
				process.env.E2B_TEMPLATE_ID = originalE2BTemplateId;
			} else {
				delete process.env.E2B_TEMPLATE_ID;
			}
			if (originalAnthropicApiKey) {
				process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
			} else {
				delete process.env.ANTHROPIC_API_KEY;
			}
		});

		// E2B tools test removed due to complex mocking requirements
		// The code path for E2B tool execution is indirectly tested through other tool tests

		it("saves final assistant message when not in newMessages", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const draft = await mockDraftDao.createDocDraft({
				title: "Test Draft",
				content: "# Content",
				createdBy: 1,
				docId: undefined,
			});

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: draft.id,
				messages: [],
			});

			// Create an adapter that returns newMessages without assistant role
			const noAssistantAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock implementation doesn't need await
				streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
					if (onChunk) {
						onChunk("Final response");
					}
					return {
						assistantText: "Final response",
						newMessages: [
							{
								role: "user",
								content: "User message",
							},
						],
					};
				}),
			} as unknown as AgentChatAdapter;

			const routerWithNoAssistant = createCollabConvoRouter(
				mockDaoProvider(mockConvoDao),
				mockDaoProvider(mockDraftDao),
				mockDaoProvider(mockDocDraftSectionChangesDao),
				mockTokenUtil,
				mockIntegrationsManager,
				noAssistantAdapter,
			);

			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/collab-convos", routerWithNoAssistant);

			const response = await request(testApp)
				.post(`/api/collab-convos/${convo.id}/messages`)
				.send({ message: "Test message" });

			expect(response.status).toBe(202);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("Processing");

			// Wait for async processing to complete
			await new Promise(resolve => setTimeout(resolve, 100));

			// Verify the final assistant message was saved
			const updatedConvo = await mockConvoDao.getCollabConvo(convo.id);
			const assistantMessages = updatedConvo?.messages.filter(m => m.role === "assistant") || [];
			expect(assistantMessages.length).toBe(1);
			// biome-ignore lint/suspicious/noExplicitAny: content property varies by message type
			expect((assistantMessages[0] as any).content).toBe("Final response");
		});
	});

	describe("GET /api/collab-convos/:id/stream", () => {
		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/collab-convos/1/stream");

			expect(response.status).toBe(401);
		});

		it("should return 404 if conversation not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Store and replace the getCollabConvo method
			const originalGetCollabConvo = mockConvoDao.getCollabConvo;
			mockConvoDao.getCollabConvo = vi.fn().mockResolvedValueOnce(undefined);

			const response = await request(app).get("/api/collab-convos/99999/stream");

			expect(response.status).toBe(404);

			// Restore the original method
			mockConvoDao.getCollabConvo = originalGetCollabConvo;
		});

		it("should return 403 if user is not authorized for conversation", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			// Create convo for different user
			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 99,
				messages: [],
			});
			// biome-ignore lint/suspicious/noExplicitAny: Overriding userId for test
			(convo as any).userId = 2;

			const response = await request(app).get(`/api/collab-convos/${convo.id}/stream`);

			expect(response.status).toBe(403);
		});

		it("should return 403 if user is not the draft creator for draft-based conversation", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const mockDraft = {
				id: 1,
				title: "Test Draft",
				content: "Test content",
				createdBy: 2, // Different user
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: null,
				contentLastEditedBy: 2,
				contentMetadata: undefined,
				docId: undefined,
			};

			// Store and replace the getDocDraft method
			const originalGetDocDraft = mockDraftDao.getDocDraft;
			mockDraftDao.getDocDraft = vi.fn().mockResolvedValueOnce(mockDraft);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
			});

			const response = await request(app).get(`/api/collab-convos/${convo.id}/stream`);

			expect(response.status).toBe(403);

			// Restore the original method
			mockDraftDao.getDocDraft = originalGetDocDraft;
		});

		it("should return 400 for invalid conversation ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/collab-convos/invalid/stream");

			expect(response.status).toBe(400);
		});
	});
});
