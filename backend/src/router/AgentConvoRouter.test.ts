import { createAgentEnvironment } from "../../../tools/jolliagent/src/direct/agentenv";
import type { AgentChatAdapter } from "../adapters/AgentChatAdapter";
import type { AgentHubToolDeps } from "../adapters/tools/AgentHubTools";
import { createMockDeps } from "../adapters/tools/AgentHubToolTestUtils";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import { mockCollabConvoDao } from "../dao/CollabConvoDao.mock";
import type { DaoProvider } from "../dao/DaoProvider";
import type { TokenUtil } from "../util/TokenUtil";
import { createAgentConvoRouter, disposeAllAgentEnvironments } from "./AgentConvoRouter";
import cookieParser from "cookie-parser";
import express from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

// Mock config
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({})),
}));

// Mock TenantContext
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

// Mock createAgentEnvironment
vi.mock("../../../tools/jolliagent/src/direct/agentenv", () => ({
	createAgentEnvironment: vi.fn().mockResolvedValue({
		agent: {
			chatTurn: vi.fn().mockResolvedValue({
				assistantText: "Mock response",
				toolCalls: [],
				history: [],
			}),
		},
		runState: {},
		dispose: vi.fn().mockResolvedValue(undefined),
	}),
}));

// Mock MercureService - must return stable mock that works at module load
vi.mock("../services/MercureService", () => ({
	createMercureService: () => ({
		isEnabled: () => true,
		getConvoTopic: (id: number) => `/tenants/default/convos/${id}`,
		createSubscriberToken: () => "mock-token",
		publishConvoEvent: () => Promise.resolve({ success: true }),
	}),
}));

describe("AgentConvoRouter", () => {
	let mockConvoDao: CollabConvoDao;
	let mockTokenUtil: TokenUtil<UserInfo>;
	let mockAgentAdapter: AgentChatAdapter;
	let app: express.Application;

	const mockUserInfo: UserInfo = {
		userId: 1,
		email: "test@example.com",
		name: "Test User",
		picture: undefined,
	};

	beforeEach(() => {
		process.env.DISABLE_LOGGING = "true";
		vi.clearAllMocks();

		mockConvoDao = mockCollabConvoDao();
		mockTokenUtil = {
			encodePayload: vi.fn(),
			decodePayload: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

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

		const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, mockAgentAdapter);
		app = express();
		app.use(express.json());
		app.use(cookieParser());
		app.use("/api/agent/convos", router);
	});

	describe("POST /api/agent/convos", () => {
		it("should create a new CLI workspace convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app)
				.post("/api/agent/convos")
				.send({
					workspaceRoot: "/home/user/project",
					toolManifest: {
						tools: [{ name: "read_file", description: "Read a file", inputSchema: {} }],
					},
					clientVersion: "0.1.0",
				});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty("id");
			expect(response.body.artifactType).toBe("cli_workspace");
			expect(response.body.metadata).toEqual({
				workspaceRoot: "/home/user/project",
				toolManifest: {
					tools: [{ name: "read_file", description: "Read a file", inputSchema: {} }],
				},
				clientVersion: "0.1.0",
			});
		});

		it("should create convo without optional fields", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos").send({});

			expect(response.status).toBe(201);
			expect(response.body.artifactType).toBe("cli_workspace");
			expect(response.body.metadata).toEqual({});
		});

		it("should persist source mappings in CLI workspace metadata", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app)
				.post("/api/agent/convos")
				.send({
					workspaceRoot: "/home/user/project",
					sources: [
						{ name: "backend", path: "/repos/backend", sourceId: 12 },
						{ name: "frontend", path: "/repos/frontend" },
					],
				});

			expect(response.status).toBe(201);
			expect(response.body.metadata).toEqual({
				workspaceRoot: "/home/user/project",
				sources: [
					{ name: "backend", path: "/repos/backend", sourceId: 12 },
					{ name: "frontend", path: "/repos/frontend" },
				],
			});
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/agent/convos").send({});

			expect(response.status).toBe(401);
		});
	});

	describe("GET /api/agent/convos", () => {
		it("should list CLI workspace convos", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create some convos
			await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: { workspaceRoot: "/project1" },
			});
			await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: { workspaceRoot: "/project2" },
			});
			// Create a non-CLI workspace convo (should not be listed)
			await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).get("/api/agent/convos");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(response.body[0].artifactType).toBe("cli_workspace");
			expect(response.body[1].artifactType).toBe("cli_workspace");
		});

		it("should support pagination", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create convos
			for (let i = 0; i < 5; i++) {
				await mockConvoDao.createCollabConvo({
					artifactType: "cli_workspace",
					artifactId: null,
					messages: [],
					metadata: { workspaceRoot: `/project${i}` },
				});
			}

			const response = await request(app).get("/api/agent/convos?limit=2&offset=1");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/agent/convos");

			expect(response.status).toBe(401);
		});
	});

	describe("GET /api/agent/convos/:id", () => {
		it("should get a specific convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: { workspaceRoot: "/project" },
			});

			const response = await request(app).get(`/api/agent/convos/${convo.id}`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(convo.id);
			expect(response.body.artifactType).toBe("cli_workspace");
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/agent/convos/9999");

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-agent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).get(`/api/agent/convos/${convo.id}`);

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Not an agent conversation");
		});

		it("should return 400 for invalid ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/agent/convos/invalid");

			expect(response.status).toBe(400);
		});
	});

	describe("DELETE /api/agent/convos/:id", () => {
		it("should delete a convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: { workspaceRoot: "/project" },
			});

			const response = await request(app).delete(`/api/agent/convos/${convo.id}`);

			expect(response.status).toBe(204);

			// Verify deleted
			const deleted = await mockConvoDao.getCollabConvo(convo.id);
			expect(deleted).toBeUndefined();
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).delete("/api/agent/convos/9999");

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-agent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).delete(`/api/agent/convos/${convo.id}`);

			expect(response.status).toBe(400);
		});
	});

	describe("POST /api/agent/convos/:id/messages", () => {
		it("should send a message and stream SSE response", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create convo through API
			const createResponse = await request(app).post("/api/agent/convos").send({
				workspaceRoot: "/project",
			});

			expect(createResponse.status).toBe(201);
			const convoId = createResponse.body.id;

			const response = await request(app).post(`/api/agent/convos/${convoId}/messages`).send({
				message: "Hello, agent!",
			});

			// Now returns SSE stream instead of 202 JSON
			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toContain("text/event-stream");
			// SSE response should contain message_received event
			expect(response.text).toContain("message_received");
		});

		it("should return 400 for missing message", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/messages`).send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Message is required");
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/9999/messages").send({
				message: "Hello",
			});

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-agent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/messages`).send({
				message: "Hello",
			});

			expect(response.status).toBe(400);
		});
	});

	describe("POST /api/agent/convos/:id/retry", () => {
		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/agent/convos/1/retry").send();

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/invalid/retry").send();

			expect(response.status).toBe(400);
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/9999/retry").send();

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-agent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/retry`).send();

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Not an agent conversation");
		});

		it("should return 400 when no user message found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/retry`).send();

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("No user message found to retry");
		});

		it("should retry last message and stream a new response", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [
					{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" },
					{ role: "user", content: "Help me", timestamp: "2026-02-11T10:00:01Z" },
					{ role: "assistant", content: "Old response", timestamp: "2026-02-11T10:00:02Z" },
				],
				metadata: null,
			});

			// messageIndex 2 = the last assistant message, so it finds user at index 1
			const response = await request(app).post(`/api/agent/convos/${convo.id}/retry`).send({ messageIndex: 2 });

			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toContain("text/event-stream");
			expect(response.text).toContain("message_received");
			expect(response.text).toContain("message_complete");

			// Verify the old assistant response was removed
			const updated = await mockConvoDao.getCollabConvo(convo.id);
			const userMessages = updated?.messages.filter(m => m.role === "user") || [];
			expect(userMessages).toHaveLength(1);
			const firstUser = userMessages[0];
			expect(firstUser.role === "user" && firstUser.content).toBe("Help me");
		});

		it("should retry from an earlier assistant message", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [
					{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" },
					{ role: "user", content: "First question", timestamp: "2026-02-11T10:00:01Z" },
					{ role: "assistant", content: "First answer", timestamp: "2026-02-11T10:00:02Z" },
					{ role: "user", content: "Second question", timestamp: "2026-02-11T10:00:03Z" },
					{ role: "assistant", content: "Second answer", timestamp: "2026-02-11T10:00:04Z" },
				],
				metadata: null,
			});

			// Retry from the first assistant answer (index 2), should find user at index 1
			const response = await request(app).post(`/api/agent/convos/${convo.id}/retry`).send({ messageIndex: 2 });

			expect(response.status).toBe(200);

			// After truncation: only intro + first user (index 0,1), then new assistant added
			const updated = await mockConvoDao.getCollabConvo(convo.id);
			const userMessages = updated?.messages.filter(m => m.role === "user") || [];
			expect(userMessages).toHaveLength(1);
			expect(userMessages[0].role === "user" && userMessages[0].content).toBe("First question");
		});

		it("should return 400 for invalid messageIndex", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [
					{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" },
					{ role: "user", content: "Help me", timestamp: "2026-02-11T10:00:01Z" },
				],
				metadata: null,
			});

			// Out of range
			const response = await request(app).post(`/api/agent/convos/${convo.id}/retry`).send({ messageIndex: 99 });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid message index");
		});

		it("should return 400 for negative messageIndex", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/retry`).send({ messageIndex: -1 });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid message index");
		});

		it("should fall back to last user message when messageIndex is omitted", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [
					{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" },
					{ role: "user", content: "Help me", timestamp: "2026-02-11T10:00:01Z" },
					{ role: "assistant", content: "Old response", timestamp: "2026-02-11T10:00:02Z" },
				],
				metadata: null,
			});

			// No messageIndex in body — should fall back to last user message
			const response = await request(app).post(`/api/agent/convos/${convo.id}/retry`).send();

			expect(response.status).toBe(200);
			expect(response.text).toContain("message_complete");
		});
	});

	describe("POST /api/agent/convos/:id/tool-results", () => {
		it("should return 404 for unknown tool call", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/tool-results`).send({
				toolCallId: "unknown-tool-call",
				output: "result",
			});

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Tool call not found or already completed");
		});

		it("should return 400 for missing toolCallId", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/tool-results`).send({
				output: "result",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("toolCallId is required");
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/9999/tool-results").send({
				toolCallId: "tc_123",
				output: "result",
			});

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-CLI workspace convo (doc_draft)", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/tool-results`).send({
				toolCallId: "tc_123",
				output: "result",
			});

			expect(response.status).toBe(400);
		});

		it("should return 400 for non-CLI workspace convo (agent_hub)", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/tool-results`).send({
				toolCallId: "tc_123",
				output: "result",
			});

			expect(response.status).toBe(400);
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/invalid/tool-results").send({
				toolCallId: "tc_123",
				output: "result",
			});

			expect(response.status).toBe(400);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/agent/convos/1/tool-results").send({
				toolCallId: "tc_123",
				output: "result",
			});

			expect(response.status).toBe(401);
		});

		it("should treat tool execution errors as tool results (not fatal turn errors)", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const toolAwareAdapter = {
				streamResponse: vi.fn().mockImplementation(async ({ runTool, onChunk }) => {
					const toolResult = runTool
						? await runTool({
								id: "tc_recover_1",
								name: "ls",
								arguments: { path: "missing-folder" },
							})
						: "no tool";

					const text = `Handled tool result: ${toolResult}`;
					if (onChunk) {
						onChunk(text);
					}

					return {
						assistantText: text,
						newMessages: [{ role: "assistant", content: text }],
					};
				}),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, toolAwareAdapter);
			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/agent/convos", router);

			const createResponse = await request(testApp)
				.post("/api/agent/convos")
				.send({
					workspaceRoot: "/project",
					toolManifest: {
						tools: [{ name: "ls", description: "List files", inputSchema: { type: "object" } }],
					},
				});
			const convoId = createResponse.body.id;

			const messagePromise = new Promise<request.Response>((resolve, reject) => {
				request(testApp)
					.post(`/api/agent/convos/${convoId}/messages`)
					.send({ message: "inspect folder" })
					.end((err, response) => {
						if (err) {
							reject(err);
							return;
						}
						resolve(response);
					});
			});

			// Wait until dispatchToolToClient registers the pending call.
			let toolResultResponse: request.Response | undefined;
			for (let i = 0; i < 20; i++) {
				toolResultResponse = await request(testApp).post(`/api/agent/convos/${convoId}/tool-results`).send({
					toolCallId: "tc_recover_1",
					error: "ENOENT: no such file or directory",
					output: "",
				});
				if (toolResultResponse.status === 200) {
					break;
				}
				await new Promise(resolve => setTimeout(resolve, 10));
			}

			expect(toolResultResponse?.status).toBe(200);

			const messageResponse = await messagePromise;
			expect(messageResponse.status).toBe(200);
			expect(messageResponse.text).toContain("message_complete");
			expect(messageResponse.text).not.toContain("Failed to generate AI response");
			expect(messageResponse.text).toContain("Tool 'ls' failed: ENOENT: no such file or directory");
		});
	});

	describe("GET /api/agent/convos/:id/stream", () => {
		it("should return 401 for unauthenticated user without valid token", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const mockDecodePayloadFromToken = vi.fn().mockReturnValue(undefined);
			(
				mockTokenUtil as unknown as { decodePayloadFromToken: typeof mockDecodePayloadFromToken }
			).decodePayloadFromToken = mockDecodePayloadFromToken;

			const response = await request(app).get("/api/agent/convos/1/stream");

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/agent/convos/invalid/stream");

			expect(response.status).toBe(400);
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).get("/api/agent/convos/9999/stream");

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-agent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).get(`/api/agent/convos/${convo.id}/stream`);

			expect(response.status).toBe(400);
		});
	});

	describe("DELETE /api/agent/convos/:id", () => {
		it("should return 400 for invalid ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).delete("/api/agent/convos/invalid");

			expect(response.status).toBe(400);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).delete("/api/agent/convos/1");

			expect(response.status).toBe(401);
		});
	});

	describe("POST /api/agent/convos/:id/messages - additional cases", () => {
		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/invalid/messages").send({
				message: "Hello",
			});

			expect(response.status).toBe(400);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/agent/convos/1/messages").send({
				message: "Hello",
			});

			expect(response.status).toBe(401);
		});

		it("should handle streaming with tool events", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Setup adapter that triggers tool events
			const toolEventAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ onChunk, onToolEvent }) => {
					if (onChunk) {
						onChunk("Processing...");
					}
					if (onToolEvent) {
						onToolEvent({ type: "tool_start", tool: "read_file", status: "running" });
						onToolEvent({
							type: "tool_end",
							tool: "read_file",
							status: "complete",
							result: "file content",
						});
					}
					if (onChunk) {
						onChunk("Done!");
					}
					return {
						assistantText: "Processing...Done!",
						newMessages: [{ role: "assistant", content: "Processing...Done!" }],
					};
				}),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, toolEventAdapter);
			const toolApp = express();
			toolApp.use(express.json());
			toolApp.use(cookieParser());
			toolApp.use("/api/agent/convos", router);

			const createResponse = await request(toolApp).post("/api/agent/convos").send({
				workspaceRoot: "/project",
			});
			const convoId = createResponse.body.id;

			const response = await request(toolApp).post(`/api/agent/convos/${convoId}/messages`).send({
				message: "Read a file",
			});

			expect(response.status).toBe(200);
			expect(response.text).toContain("tool_event");
		});

		it("should handle adapter errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Setup adapter that throws an error
			const errorAdapter = {
				streamResponse: vi.fn().mockRejectedValue(new Error("API error")),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, errorAdapter);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const createResponse = await request(errorApp).post("/api/agent/convos").send({
				workspaceRoot: "/project",
			});
			const convoId = createResponse.body.id;

			const response = await request(errorApp).post(`/api/agent/convos/${convoId}/messages`).send({
				message: "Trigger error",
			});

			expect(response.status).toBe(200);
			expect(response.text).toContain("error");
		});

		it("should save different message types from agent response", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Setup adapter that returns various message types
			const multiTypeAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
					if (onChunk) {
						onChunk("Response");
					}
					return {
						assistantText: "Response",
						newMessages: [
							{ role: "user", content: "User message" },
							{ role: "system", content: "System message" },
							{
								role: "assistant_tool_use",
								tool_call_id: "tc1",
								tool_name: "read_file",
								tool_input: { path: "/file.txt" },
							},
							{ role: "assistant_tool_uses", calls: [{ id: "tc2", name: "write_file", arguments: {} }] },
							{ role: "tool", tool_call_id: "tc1", content: "file content", tool_name: "read_file" },
							{ role: "assistant", content: "Response" },
						],
					};
				}),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, multiTypeAdapter);
			const multiApp = express();
			multiApp.use(express.json());
			multiApp.use(cookieParser());
			multiApp.use("/api/agent/convos", router);

			const createResponse = await request(multiApp).post("/api/agent/convos").send({
				workspaceRoot: "/project",
			});
			const convoId = createResponse.body.id;

			const response = await request(multiApp).post(`/api/agent/convos/${convoId}/messages`).send({
				message: "Test message types",
			});

			expect(response.status).toBe(200);
			expect(response.text).toContain("message_complete");
		});

		it("should handle empty message string", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/messages`).send({
				message: "",
			});

			// Empty string fails validation
			expect(response.status).toBe(400);
		});
	});

	describe("POST /api/agent/convos - agent_hub", () => {
		it("should create a new agent hub convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos").send({ artifactType: "agent_hub" });

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty("id");
			expect(response.body.artifactType).toBe("agent_hub");
			expect(response.body.title).toBeNull();
			expect(response.body.messages).toHaveLength(1);
			expect(response.body.messages[0].role).toBe("assistant");
			expect(response.body.messages[0].content).toContain("Jolli assistant");
		});

		it("should create agent hub convo with custom title", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app)
				.post("/api/agent/convos")
				.send({ artifactType: "agent_hub", title: "My Chat" });

			expect(response.status).toBe(201);
			expect(response.body.artifactType).toBe("agent_hub");
			expect(response.body.title).toBe("My Chat");
		});

		it("should initialize metadata with mode for agent hub convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos").send({ artifactType: "agent_hub" });

			expect(response.status).toBe(201);
			expect(response.body.metadata).toEqual({ mode: "exec" });
		});
	});

	describe("GET /api/agent/convos - artifactType filter", () => {
		it("should list agent_hub convos when filtered", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create mixed convos
			await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: { workspaceRoot: "/project1" },
			});
			await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "Chat 1",
				messages: [],
				metadata: null,
			});
			await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "Chat 2",
				messages: [],
				metadata: null,
			});

			const response = await request(app).get("/api/agent/convos?artifactType=agent_hub");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(response.body[0].artifactType).toBe("agent_hub");
			expect(response.body[1].artifactType).toBe("agent_hub");
		});

		it("should default to cli_workspace when no artifactType specified", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: null,
			});
			await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const response = await request(app).get("/api/agent/convos");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(response.body[0].artifactType).toBe("cli_workspace");
		});
	});

	describe("GET /api/agent/convos/:id - agent_hub", () => {
		it("should get an agent hub convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "Test Chat",
				messages: [],
				metadata: null,
			});

			const response = await request(app).get(`/api/agent/convos/${convo.id}`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(convo.id);
			expect(response.body.artifactType).toBe("agent_hub");
			expect(response.body.title).toBe("Test Chat");
		});
	});

	describe("DELETE /api/agent/convos/:id - agent_hub", () => {
		it("should delete an agent hub convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "To Delete",
				messages: [],
				metadata: null,
			});

			const response = await request(app).delete(`/api/agent/convos/${convo.id}`);

			expect(response.status).toBe(204);

			const deleted = await mockConvoDao.getCollabConvo(convo.id);
			expect(deleted).toBeUndefined();
		});
	});

	describe("PATCH /api/agent/convos/:id", () => {
		it("should update conversation title", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "Old Title",
				messages: [],
				metadata: null,
			});

			const response = await request(app).patch(`/api/agent/convos/${convo.id}`).send({ title: "New Title" });

			expect(response.status).toBe(200);
			expect(response.body.title).toBe("New Title");
		});

		it("should return 400 for missing title", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const response = await request(app).patch(`/api/agent/convos/${convo.id}`).send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Title is required");
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).patch("/api/agent/convos/invalid").send({ title: "New Title" });

			expect(response.status).toBe(400);
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).patch("/api/agent/convos/9999").send({ title: "New Title" });

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-agent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).patch(`/api/agent/convos/${convo.id}`).send({ title: "New Title" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Not an agent conversation");
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).patch("/api/agent/convos/1").send({ title: "New Title" });

			expect(response.status).toBe(401);
		});
	});

	describe("PATCH /api/agent/convos/:id - error handling", () => {
		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const baseDao = mockCollabConvoDao();
			const convo = await baseDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const errorDao = {
				...baseDao,
				updateTitle: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp)
				.patch(`/api/agent/convos/${convo.id}`)
				.send({ title: "New Title" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to update conversation");
		});
	});

	describe("POST /api/agent/convos/:id/messages - agent_hub", () => {
		it("should auto-generate title on first message", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create agent hub convo through API (no title)
			const createResponse = await request(app).post("/api/agent/convos").send({ artifactType: "agent_hub" });

			expect(createResponse.status).toBe(201);
			const convoId = createResponse.body.id;
			expect(createResponse.body.title).toBeNull();

			// Send first message
			const response = await request(app)
				.post(`/api/agent/convos/${convoId}/messages`)
				.send({ message: "Help me write a guide about authentication" });

			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toContain("text/event-stream");

			// Verify title was auto-generated
			const updatedConvo = await mockConvoDao.getCollabConvo(convoId);
			expect(updatedConvo?.title).toBe("Help me write a guide about authentication");
		});

		it("should truncate long auto-titles to 50 chars", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const createResponse = await request(app).post("/api/agent/convos").send({ artifactType: "agent_hub" });
			const convoId = createResponse.body.id;

			// Send a long message
			const longMessage =
				"This is a very long message that should be truncated when used as a conversation title";
			await request(app).post(`/api/agent/convos/${convoId}/messages`).send({ message: longMessage });

			const updatedConvo = await mockConvoDao.getCollabConvo(convoId);
			expect(updatedConvo?.title).toHaveLength(50);
			expect(updatedConvo?.title).toBe(`${longMessage.slice(0, 47)}...`);
		});

		it("should not overwrite existing title", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const createResponse = await request(app)
				.post("/api/agent/convos")
				.send({ artifactType: "agent_hub", title: "Custom Title" });
			const convoId = createResponse.body.id;

			// Send a message — should not change title
			await request(app).post(`/api/agent/convos/${convoId}/messages`).send({ message: "Hello" });

			const updatedConvo = await mockConvoDao.getCollabConvo(convoId);
			expect(updatedConvo?.title).toBe("Custom Title");
		});

		it("should stream SSE response for agent hub convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const createResponse = await request(app).post("/api/agent/convos").send({ artifactType: "agent_hub" });
			const convoId = createResponse.body.id;

			const response = await request(app)
				.post(`/api/agent/convos/${convoId}/messages`)
				.send({ message: "Hello agent!" });

			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toContain("text/event-stream");
			expect(response.text).toContain("message_received");
			expect(response.text).toContain("message_complete");
		});
	});

	describe("disposeAllAgentEnvironments", () => {
		afterEach(async () => {
			await disposeAllAgentEnvironments();
		});

		it("should dispose all agent environments", async () => {
			// The function should execute without errors
			await expect(disposeAllAgentEnvironments()).resolves.not.toThrow();
		});
	});

	describe("GET /api/agent/convos - error handling", () => {
		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Override the mock DAO to throw an error
			const errorDao = {
				...mockCollabConvoDao(),
				listByArtifactType: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp).get("/api/agent/convos");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to list conversations");
		});
	});

	describe("POST /api/agent/convos - error handling", () => {
		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Override the mock DAO to throw an error
			const errorDao = {
				...mockCollabConvoDao(),
				createCollabConvo: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp).post("/api/agent/convos").send({
				workspaceRoot: "/project",
			});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to create conversation");
		});
	});

	describe("GET /api/agent/convos/:id - error handling", () => {
		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Override the mock DAO to throw an error
			const errorDao = {
				...mockCollabConvoDao(),
				getCollabConvo: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp).get("/api/agent/convos/1");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get conversation");
		});
	});

	describe("DELETE /api/agent/convos/:id - error handling", () => {
		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const baseDao = mockCollabConvoDao();
			// Create a convo first
			const convo = await baseDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: { workspaceRoot: "/project" },
			});

			// Override delete to throw error
			const errorDao = {
				...baseDao,
				deleteCollabConvo: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp).delete(`/api/agent/convos/${convo.id}`);

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to delete conversation");
		});
	});

	describe("POST /api/agent/convos/:id/tool-results - error handling", () => {
		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Override the mock DAO to throw an error
			const errorDao = {
				...mockCollabConvoDao(),
				getCollabConvo: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp).post("/api/agent/convos/1/tool-results").send({
				toolCallId: "tc_123",
				output: "result",
			});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to process tool result");
		});
	});

	describe("GET /api/agent/convos/:id/stream - error handling", () => {
		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Override the mock DAO to throw an error
			const errorDao = {
				...mockCollabConvoDao(),
				getCollabConvo: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp).get("/api/agent/convos/1/stream");

			// Error happens before SSE headers are set, so returns 500
			expect(response.status).toBe(500);
		});
	});

	describe("POST /api/agent/convos/:id/messages - impact agent mode", () => {
		it("should stream response for impact agent mode convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create convo with impact agent mode metadata
			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: {
					workspaceRoot: "/project",
					agentMode: "impact",
					impactContext: {
						article: { path: "docs/guide.md", jrn: "doc:guide" },
						changes: [{ path: "src/api.ts", status: "modified", diff: "- old\n+ new" }],
						commits: [{ sha: "abc1234", message: "Update API" }],
						evidence: [
							{ changedFile: "src/api.ts", pattern: "src/**/*.ts", matchType: "glob", source: "<local>" },
						],
					},
				},
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/messages`).send({
				message: "Update the docs",
			});

			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toContain("text/event-stream");
			expect(response.text).toContain("message_received");
		});
	});

	describe("POST /api/agent/convos/:id/messages - saveAgentMessages with unknown role", () => {
		it("should skip messages with unknown roles", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Setup adapter that returns messages with an unknown role
			const unknownRoleAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
					if (onChunk) {
						onChunk("Response");
					}
					return {
						assistantText: "Response",
						newMessages: [
							{ role: "unknown_role", content: "Should be skipped" },
							{ role: "assistant", content: "Response" },
						],
					};
				}),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, unknownRoleAdapter);
			const unknownApp = express();
			unknownApp.use(express.json());
			unknownApp.use(cookieParser());
			unknownApp.use("/api/agent/convos", router);

			const createResponse = await request(unknownApp).post("/api/agent/convos").send({
				workspaceRoot: "/project",
			});
			const convoId = createResponse.body.id;

			const response = await request(unknownApp).post(`/api/agent/convos/${convoId}/messages`).send({
				message: "Test unknown role",
			});

			expect(response.status).toBe(200);
			expect(response.text).toContain("message_complete");
		});
	});

	describe("POST /api/agent/convos/:id/messages - navigation action emission", () => {
		it("should emit navigation_action SSE event when tool result contains __navigationAction", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Setup adapter that returns a navigation action in tool results
			const navAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
					if (onChunk) {
						onChunk("I'll navigate you now.");
					}
					return {
						assistantText: "I'll navigate you now.",
						newMessages: [
							{ role: "assistant", content: "I'll navigate you now." },
							{
								role: "tool",
								tool_call_id: "tc_nav_1",
								content: JSON.stringify({
									__navigationAction: true,
									path: "/article-draft/42",
									label: "Edit: My Draft",
								}),
								tool_name: "navigate_user",
							},
						],
					};
				}),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, navAdapter);
			const navApp = express();
			navApp.use(express.json());
			navApp.use(cookieParser());
			navApp.use("/api/agent/convos", router);

			// Create agent hub convo
			const createResponse = await request(navApp).post("/api/agent/convos").send({ artifactType: "agent_hub" });
			const convoId = createResponse.body.id;

			const response = await request(navApp)
				.post(`/api/agent/convos/${convoId}/messages`)
				.send({ message: "Navigate me to the draft" });

			expect(response.status).toBe(200);
			expect(response.text).toContain("navigation_action");
			expect(response.text).toContain("/article-draft/42");
			expect(response.text).toContain("Edit: My Draft");
		});

		it("should not emit navigation_action when tool result is not a navigation action", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Setup adapter that returns a normal tool result (not navigation)
			const normalAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
					if (onChunk) {
						onChunk("Here are the spaces.");
					}
					return {
						assistantText: "Here are the spaces.",
						newMessages: [
							{ role: "assistant", content: "Here are the spaces." },
							{
								role: "tool",
								tool_call_id: "tc_list_1",
								content: JSON.stringify([{ id: 1, name: "My Space" }]),
								tool_name: "list_spaces",
							},
						],
					};
				}),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, normalAdapter);
			const normalApp = express();
			normalApp.use(express.json());
			normalApp.use(cookieParser());
			normalApp.use("/api/agent/convos", router);

			// Create agent hub convo
			const createResponse = await request(normalApp)
				.post("/api/agent/convos")
				.send({ artifactType: "agent_hub" });
			const convoId = createResponse.body.id;

			const response = await request(normalApp)
				.post(`/api/agent/convos/${convoId}/messages`)
				.send({ message: "List spaces" });

			expect(response.status).toBe(200);
			expect(response.text).not.toContain("navigation_action");
		});
	});

	describe("mutation tool gating", () => {
		const mutationTools = [
			"import_repo_docs",
			"get_or_create_space",
			"create_folder",
			"create_article_draft",
			"navigate_user",
		];

		/**
		 * Creates an adapter whose streamResponse invokes runTool with the given tool name
		 * and captures the result, allowing us to test server-side gating.
		 */
		function createToolCallingAdapter(
			toolName: string,
			toolArgs: Record<string, unknown> = {},
		): {
			adapter: AgentChatAdapter;
			getToolResult: () => string | undefined;
		} {
			let capturedResult: string | undefined;

			const adapter = {
				streamResponse: vi.fn().mockImplementation(async ({ runTool, onChunk }) => {
					if (onChunk) {
						onChunk("Processing...");
					}
					if (runTool) {
						capturedResult = await runTool({ name: toolName, arguments: toolArgs });
					}
					return {
						assistantText: "Done",
						newMessages: [{ role: "assistant", content: "Done" }],
					};
				}),
			} as unknown as AgentChatAdapter;

			return { adapter, getToolResult: () => capturedResult };
		}

		/**
		 * Creates an adapter that first calls update_plan (to transition phase), then calls
		 * the specified mutation tool.
		 */
		function createPlanThenMutateAdapter(
			mutationToolName: string,
			planPhase: string,
		): {
			adapter: AgentChatAdapter;
			getMutationResult: () => string | undefined;
		} {
			let mutationResult: string | undefined;

			const adapter = {
				streamResponse: vi.fn().mockImplementation(async ({ runTool, onChunk }) => {
					if (onChunk) {
						onChunk("Processing...");
					}
					if (runTool) {
						// First call update_plan to transition to executing
						await runTool({
							name: "update_plan",
							arguments: { plan: "# My Plan\n1. Step one", phase: planPhase },
						});
						// Then call the mutation tool
						mutationResult = await runTool({ name: mutationToolName, arguments: {} });
					}
					return {
						assistantText: "Done",
						newMessages: [{ role: "assistant", content: "Done" }],
					};
				}),
			} as unknown as AgentChatAdapter;

			return { adapter, getMutationResult: () => mutationResult };
		}

		function buildGatedApp(
			convoDao: CollabConvoDao,
			token: TokenUtil<UserInfo>,
			adapter: AgentChatAdapter,
			deps: AgentHubToolDeps,
		): express.Application {
			const router = createAgentConvoRouter(mockDaoProvider(convoDao), token, adapter, deps);
			const gatedApp = express();
			gatedApp.use(express.json());
			gatedApp.use(cookieParser());
			gatedApp.use("/api/agent/convos", router);
			return gatedApp;
		}

		for (const toolName of mutationTools) {
			it(`should block '${toolName}' during planning phase in plan mode`, async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
				const { deps } = createMockDeps();
				const { adapter, getToolResult } = createToolCallingAdapter(toolName);

				const gatedDao = mockCollabConvoDao();
				const gatedApp = buildGatedApp(gatedDao, mockTokenUtil, adapter, deps);

				// Create plan mode convo in planning phase
				const convo = await gatedDao.createCollabConvo({
					artifactType: "agent_hub",
					artifactId: null,
					messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
					metadata: { mode: "plan", planPhase: "planning" },
				});

				await request(gatedApp)
					.post(`/api/agent/convos/${convo.id}/messages`)
					.send({ message: "Do something" });

				expect(getToolResult()).toContain(`Cannot execute '${toolName}'`);
				expect(getToolResult()).toContain("you must first create a plan");
			});
		}

		for (const toolName of mutationTools) {
			it(`should allow '${toolName}' during executing phase`, async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
				const { deps } = createMockDeps();
				const { adapter, getToolResult } = createToolCallingAdapter(toolName);

				const gatedDao = mockCollabConvoDao();
				const gatedApp = buildGatedApp(gatedDao, mockTokenUtil, adapter, deps);

				// Create convo then manually set planPhase to "executing"
				const convo = await gatedDao.createCollabConvo({
					artifactType: "agent_hub",
					artifactId: null,
					messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
					metadata: { planPhase: "executing", plan: "# Plan" },
				});

				await request(gatedApp).post(`/api/agent/convos/${convo.id}/messages`).send({ message: "Execute now" });

				// Should NOT contain the blocking message
				expect(getToolResult()).not.toContain("Cannot execute");
			});
		}

		for (const toolName of mutationTools) {
			it(`should allow '${toolName}' during complete phase`, async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
				const { deps } = createMockDeps();
				const { adapter, getToolResult } = createToolCallingAdapter(toolName);

				const gatedDao = mockCollabConvoDao();
				const gatedApp = buildGatedApp(gatedDao, mockTokenUtil, adapter, deps);

				const convo = await gatedDao.createCollabConvo({
					artifactType: "agent_hub",
					artifactId: null,
					messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
					metadata: { planPhase: "complete", plan: "# Plan" },
				});

				await request(gatedApp)
					.post(`/api/agent/convos/${convo.id}/messages`)
					.send({ message: "One more thing" });

				expect(getToolResult()).not.toContain("Cannot execute");
			});
		}

		it("should allow mutation tools after update_plan transitions to executing in the same turn", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { deps } = createMockDeps();
			const { adapter, getMutationResult } = createPlanThenMutateAdapter("create_folder", "executing");

			const gatedDao = mockCollabConvoDao();
			const gatedApp = buildGatedApp(gatedDao, mockTokenUtil, adapter, deps);

			// Start in plan mode, planning phase
			const convo = await gatedDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { mode: "plan", planPhase: "planning" },
			});

			await request(gatedApp).post(`/api/agent/convos/${convo.id}/messages`).send({ message: "Approve my plan" });

			// The mutation tool should NOT be blocked because update_plan transitioned to "executing" first
			expect(getMutationResult()).not.toContain("Cannot execute");
		});

		it("should still block mutation tools if update_plan stays in planning phase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { deps } = createMockDeps();
			const { adapter, getMutationResult } = createPlanThenMutateAdapter("create_article_draft", "planning");

			const gatedDao = mockCollabConvoDao();
			const gatedApp = buildGatedApp(gatedDao, mockTokenUtil, adapter, deps);

			const convo = await gatedDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { mode: "plan", planPhase: "planning" },
			});

			await request(gatedApp).post(`/api/agent/convos/${convo.id}/messages`).send({ message: "Draft something" });

			expect(getMutationResult()).toContain("Cannot execute 'create_article_draft'");
		});

		it("should still block mutation tools if update_plan validation fails", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { deps } = createMockDeps();

			// Create an adapter that sends update_plan with invalid args (empty plan),
			// then tries a mutation tool. The phase update should NOT take effect.
			let mutationResult: string | undefined;
			const adapter = {
				streamResponse: vi.fn().mockImplementation(async ({ runTool, onChunk }) => {
					if (onChunk) {
						onChunk("Processing...");
					}
					if (runTool) {
						// Call update_plan with empty plan (fails min(1) validation) but phase "executing"
						await runTool({
							name: "update_plan",
							arguments: { plan: "", phase: "executing" },
						});
						// Then attempt a mutation tool — should still be blocked
						mutationResult = await runTool({ name: "create_folder", arguments: {} });
					}
					return {
						assistantText: "Done",
						newMessages: [{ role: "assistant", content: "Done" }],
					};
				}),
			} as unknown as AgentChatAdapter;

			const gatedDao = mockCollabConvoDao();
			const gatedApp = buildGatedApp(gatedDao, mockTokenUtil, adapter, deps);

			const convo = await gatedDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { mode: "plan", planPhase: "planning" },
			});

			await request(gatedApp).post(`/api/agent/convos/${convo.id}/messages`).send({ message: "Do it" });

			expect(mutationResult).toContain("Cannot execute 'create_folder'");
		});

		it("should not gate read-only tools during planning phase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { deps, mockPermissionService } = createMockDeps();
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["spaces.view"]);

			const { adapter, getToolResult } = createToolCallingAdapter("check_permissions");

			const gatedDao = mockCollabConvoDao();
			const gatedApp = buildGatedApp(gatedDao, mockTokenUtil, adapter, deps);

			// Create plan mode convo in planning phase
			const convo = await gatedDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { mode: "plan", planPhase: "planning" },
			});

			await request(gatedApp)
				.post(`/api/agent/convos/${convo.id}/messages`)
				.send({ message: "Check my permissions" });

			// Should execute normally, not blocked
			expect(getToolResult()).not.toContain("Cannot execute");
			expect(getToolResult()).toContain("permissions");
		});

		it("should not gate non-destructive mutation tools in exec-accept-all mode", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { deps, mockPermissionService } = createMockDeps();
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const { adapter, getToolResult } = createToolCallingAdapter("create_folder", { name: "F", spaceId: 1 });

			const gatedDao = mockCollabConvoDao();
			const gatedApp = buildGatedApp(gatedDao, mockTokenUtil, adapter, deps);

			// Create exec-accept-all mode convo
			const convo = await gatedDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { mode: "exec-accept-all" },
			});

			await request(gatedApp).post(`/api/agent/convos/${convo.id}/messages`).send({ message: "Create a folder" });

			// DESTRUCTIVE_TOOL_NAMES is empty, so create_folder passes through in exec-accept-all mode
			expect(getToolResult()).not.toContain("Cannot execute");
		});
	});

	describe("GET /api/agent/convos/:id/stream - query param token auth", () => {
		it("should reject when query param token has no userId", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			// Token decodes but has no userId
			const mockDecodePayloadFromToken = vi.fn().mockReturnValue({ email: "test@test.com" });
			(
				mockTokenUtil as unknown as { decodePayloadFromToken: typeof mockDecodePayloadFromToken }
			).decodePayloadFromToken = mockDecodePayloadFromToken;

			const response = await request(app).get("/api/agent/convos/1/stream?token=incomplete-token");

			expect(response.status).toBe(401);
		});
	});

	describe("POST /api/agent/convos - intro message content", () => {
		it("should include workspace and tool info in intro message", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app)
				.post("/api/agent/convos")
				.send({
					workspaceRoot: "/home/user/my-project",
					toolManifest: {
						tools: [
							{ name: "read_file", description: "Reads a file", inputSchema: {} },
							{ name: "write_file", description: "Writes a file", inputSchema: {} },
						],
					},
				});

			expect(response.status).toBe(201);
			// The intro message should be stored as the first message
			const convo = response.body;
			expect(convo.messages).toHaveLength(1);
			expect(convo.messages[0].role).toBe("assistant");
			expect(convo.messages[0].content).toContain("/home/user/my-project");
			expect(convo.messages[0].content).toContain("read_file");
			expect(convo.messages[0].content).toContain("write_file");
		});

		it("should show defaults when workspace and tools not provided", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos").send({});

			expect(response.status).toBe(201);
			const convo = response.body;
			expect(convo.messages[0].content).toContain("Not specified");
			expect(convo.messages[0].content).toContain("No tools registered");
		});
	});

	describe("saveAgentMessages - empty content filtering", () => {
		it("should not persist messages with empty content", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Setup adapter that returns newMessages with empty content
			const emptyContentAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
					if (onChunk) {
						onChunk("Response");
					}
					return {
						assistantText: "Response",
						newMessages: [
							{ role: "assistant", content: "" },
							{ role: "assistant", content: "Response" },
						],
					};
				}),
			} as unknown as AgentChatAdapter;

			const spyDao = mockCollabConvoDao();
			const addMessagesSpy = vi.spyOn(spyDao, "addMessages");

			const router = createAgentConvoRouter(mockDaoProvider(spyDao), mockTokenUtil, emptyContentAdapter);
			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/agent/convos", router);

			const createResponse = await request(testApp).post("/api/agent/convos").send({
				workspaceRoot: "/project",
			});
			const convoId = createResponse.body.id;

			await request(testApp).post(`/api/agent/convos/${convoId}/messages`).send({
				message: "Test empty filtering",
			});

			// newMessages are persisted via batched appends (user message append may occur separately).
			const appended = addMessagesSpy.mock.calls.flatMap(call => call[1] ?? []);
			const assistantMessages = appended.filter(msg => msg.role === "assistant");
			expect(assistantMessages).toHaveLength(1);
			const savedMsg = assistantMessages[0];
			expect(savedMsg?.role).toBe("assistant");
			expect(savedMsg && "content" in savedMsg && savedMsg.content).toBe("Response");
		});

		it("should not persist messages with whitespace-only content", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const whitespaceAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ onChunk }) => {
					if (onChunk) {
						onChunk("Response");
					}
					return {
						assistantText: "Response",
						newMessages: [
							{ role: "user", content: "   " },
							{ role: "assistant", content: "\n\t" },
							{ role: "assistant", content: "Response" },
						],
					};
				}),
			} as unknown as AgentChatAdapter;

			const spyDao = mockCollabConvoDao();
			const addMessagesSpy = vi.spyOn(spyDao, "addMessages");

			const router = createAgentConvoRouter(mockDaoProvider(spyDao), mockTokenUtil, whitespaceAdapter);
			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/agent/convos", router);

			const createResponse = await request(testApp).post("/api/agent/convos").send({
				workspaceRoot: "/project",
			});
			const convoId = createResponse.body.id;

			await request(testApp).post(`/api/agent/convos/${convoId}/messages`).send({
				message: "Test whitespace filtering",
			});

			// Batched append should include only non-empty assistant content.
			const appended = addMessagesSpy.mock.calls.flatMap(call => call[1] ?? []);
			const assistantMessages = appended.filter(msg => msg.role === "assistant");
			const whitespaceUsers = appended.filter(
				msg => msg.role === "user" && "content" in msg && msg.content.trim().length === 0,
			);
			expect(assistantMessages).toHaveLength(1);
			expect(whitespaceUsers).toHaveLength(0);
			const savedMsg = assistantMessages[0];
			expect(savedMsg?.role).toBe("assistant");
			expect(savedMsg && "content" in savedMsg && savedMsg.content).toBe("Response");
		});
	});

	describe("POST /api/agent/convos/seed/:kind", () => {
		it("should create a seeded conversation on first call", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/seed/getting_started");

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty("id");
			expect(response.body.artifactType).toBe("agent_hub");
			expect(response.body.title).toBe("Getting Started with Jolli");
			expect(response.body.messages).toHaveLength(1);
			expect(response.body.messages[0].role).toBe("assistant");
			expect(response.body.messages[0].content).toContain("Welcome to Jolli!");
			expect(response.body.metadata).toEqual(
				expect.objectContaining({
					convoKind: "getting_started",
					createdForUserId: mockUserInfo.userId,
					planPhase: "planning",
					mode: "plan",
				}),
			);
			expect(response.body.metadata.plan).toContain("Getting Started with Jolli");
		});

		it("should return existing conversation on second call (idempotent)", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const first = await request(app).post("/api/agent/convos/seed/getting_started");
			expect(first.status).toBe(201);

			const second = await request(app).post("/api/agent/convos/seed/getting_started");
			expect(second.status).toBe(200);
			expect(second.body.id).toBe(first.body.id);
		});

		it("should return 400 for unknown kind", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/seed/nonexistent_kind");

			expect(response.status).toBe(400);
			expect(response.body.error).toContain("Unknown conversation kind");
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/agent/convos/seed/getting_started");

			expect(response.status).toBe(401);
		});

		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const errorDao = {
				...mockCollabConvoDao(),
				findSeededConvo: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp).post("/api/agent/convos/seed/getting_started");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to create seeded conversation");
		});

		it("should include convoKind in listing response for seeded convos", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Seed a getting_started convo
			await request(app).post("/api/agent/convos/seed/getting_started");

			// Also create a regular agent_hub convo
			await request(app).post("/api/agent/convos").send({ artifactType: "agent_hub" });

			const response = await request(app).get("/api/agent/convos?artifactType=agent_hub");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);

			// Find the seeded convo in the list
			const seeded = response.body.find((c: Record<string, unknown>) => c.convoKind === "getting_started");
			expect(seeded).toBeDefined();
			expect(seeded.title).toBe("Getting Started with Jolli");

			// The regular convo should not have convoKind
			const regular = response.body.find((c: Record<string, unknown>) => c.convoKind === undefined);
			expect(regular).toBeDefined();
		});
	});

	describe("plan reminder injection - seeded convos", () => {
		/** Creates a message-capturing adapter and test app */
		function createCapturingSetup(): {
			testApp: express.Application;
			getCapturedMessages: () => Array<unknown>;
		} {
			let capturedMessages: Array<unknown> = [];
			const capturingAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ messages, onChunk }) => {
					capturedMessages = messages;
					if (onChunk) {
						onChunk("Reply");
					}
					return {
						assistantText: "Reply",
						newMessages: [{ role: "assistant", content: "Reply" }],
					};
				}),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, capturingAdapter);
			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/agent/convos", router);

			return { testApp, getCapturedMessages: () => capturedMessages };
		}

		it("should use plan-exists reminder (not force-create) for seeded convos with pre-populated plan", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			// Seed the getting_started convo (has plan already)
			const seedRes = await request(testApp).post("/api/agent/convos/seed/getting_started");
			expect(seedRes.status).toBe(201);
			const convoId = seedRes.body.id;

			// Send a message
			await request(testApp)
				.post(`/api/agent/convos/${convoId}/messages`)
				.send({ message: "Yes, GitHub is connected" });

			const lastMsg = getCapturedMessages()[getCapturedMessages().length - 1] as {
				role: string;
				content: string;
			};
			expect(lastMsg.role).toBe("user");

			// Should have the "refine plan" reminder (plan exists, planning phase), NOT the "create plan" reminder
			expect(lastMsg.content).toContain("Would you like me to execute this plan?");
			expect(lastMsg.content).not.toContain("[IMPORTANT: You MUST call update_plan before responding.");
		});

		it("should include turn reminder for seeded convos", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			const seedRes = await request(testApp).post("/api/agent/convos/seed/getting_started");
			const convoId = seedRes.body.id;

			await request(testApp).post(`/api/agent/convos/${convoId}/messages`).send({ message: "Hello" });

			const lastMsg = getCapturedMessages()[getCapturedMessages().length - 1] as {
				role: string;
				content: string;
			};
			expect(lastMsg.role).toBe("user");
			// Should include the turn reminder text
			expect(lastMsg.content).toContain("Be proactive");
			expect(lastMsg.content).toContain("update_plan");
		});

		it("should not include turn reminder for non-seeded convos", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			// Create a regular agent_hub convo (not seeded)
			const createRes = await request(testApp).post("/api/agent/convos").send({ artifactType: "agent_hub" });
			const convoId = createRes.body.id;

			await request(testApp).post(`/api/agent/convos/${convoId}/messages`).send({ message: "Hello" });

			const lastMsg = getCapturedMessages()[getCapturedMessages().length - 1] as {
				role: string;
				content: string;
			};
			expect(lastMsg.role).toBe("user");
			// Should NOT include the turn reminder text
			expect(lastMsg.content).not.toContain("Be proactive");
		});
	});

	describe("POST /api/agent/convos/:id/advance", () => {
		it("should auto-advance a seeded convo and stream SSE response", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Seed a getting_started convo
			const seedRes = await request(app).post("/api/agent/convos/seed/getting_started");
			expect(seedRes.status).toBe(201);
			const convoId = seedRes.body.id;

			// Advance the convo
			const response = await request(app).post(`/api/agent/convos/${convoId}/advance`);

			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toContain("text/event-stream");
			expect(response.text).toContain("message_received");
			expect(response.text).toContain("message_complete");
		});

		it("should return already_advanced when convo has more than 1 message", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			// Create a convo with multiple messages
			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "Getting Started with Jolli",
				messages: [
					{ role: "assistant", content: "Welcome!", timestamp: new Date().toISOString() },
					{ role: "assistant", content: "Already advanced.", timestamp: new Date().toISOString() },
				],
				metadata: { planPhase: "planning", plan: "# Plan", convoKind: "getting_started", createdForUserId: 1 },
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/advance`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ status: "already_advanced" });
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/invalid/advance");

			expect(response.status).toBe(400);
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/9999/advance");

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-agent-hub convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "cli_workspace",
				artifactId: null,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/advance`);

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Not an agent hub conversation");
		});

		it("should return 400 when convo has no convoKind", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { planPhase: "planning" },
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/advance`);

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Auto-advance not supported for this conversation");
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/agent/convos/1/advance");

			expect(response.status).toBe(401);
		});

		it("should not persist the synthetic user message", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const seedRes = await request(app).post("/api/agent/convos/seed/getting_started");
			const convoId = seedRes.body.id;

			await request(app).post(`/api/agent/convos/${convoId}/advance`);

			// Verify that no user message was persisted
			const updatedConvo = await mockConvoDao.getCollabConvo(convoId);
			const userMessages = updatedConvo?.messages.filter(m => m.role === "user") ?? [];
			expect(userMessages).toHaveLength(0);
		});

		it("should persist the agent response", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const seedRes = await request(app).post("/api/agent/convos/seed/getting_started");
			const convoId = seedRes.body.id;

			await request(app).post(`/api/agent/convos/${convoId}/advance`);

			// Verify that the assistant response was persisted
			const updatedConvo = await mockConvoDao.getCollabConvo(convoId);
			const assistantMessages = updatedConvo?.messages.filter(m => m.role === "assistant") ?? [];
			// Original intro + agent's advance response
			expect(assistantMessages.length).toBeGreaterThanOrEqual(2);
		});

		it("should handle DAO errors gracefully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const errorDao = {
				...mockCollabConvoDao(),
				getCollabConvo: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			const router = createAgentConvoRouter(
				mockDaoProvider(errorDao as CollabConvoDao),
				mockTokenUtil,
				mockAgentAdapter,
			);
			const errorApp = express();
			errorApp.use(express.json());
			errorApp.use(cookieParser());
			errorApp.use("/api/agent/convos", router);

			const response = await request(errorApp).post("/api/agent/convos/1/advance");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to auto-advance conversation");
		});
	});

	describe("plan reminder injection", () => {
		/** Creates a message-capturing adapter and test app */
		function createCapturingSetup(): {
			testApp: express.Application;
			getCapturedMessages: () => Array<unknown>;
		} {
			let capturedMessages: Array<unknown> = [];
			const capturingAdapter = {
				// biome-ignore lint/suspicious/useAwait: Mock function signature must match async interface
				streamResponse: vi.fn().mockImplementation(async ({ messages, onChunk }) => {
					capturedMessages = messages;
					if (onChunk) {
						onChunk("Reply");
					}
					return {
						assistantText: "Reply",
						newMessages: [{ role: "assistant", content: "Reply" }],
					};
				}),
			} as unknown as AgentChatAdapter;

			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil, capturingAdapter);
			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/agent/convos", router);

			return { testApp, getCapturedMessages: () => capturedMessages };
		}

		/** Extracts the last user message content from captured messages */
		function getLastUserContent(capturedMessages: Array<unknown>): string {
			const lastMsg = capturedMessages[capturedMessages.length - 1] as {
				role: string;
				content: string;
			};
			expect(lastMsg.role).toBe("user");
			return lastMsg.content;
		}

		it("should not include plan reminder for exec mode convos", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			// Create agent_hub convo (defaults to exec mode now)
			const createRes = await request(testApp).post("/api/agent/convos").send({ artifactType: "agent_hub" });
			const convoId = createRes.body.id;

			await request(testApp)
				.post(`/api/agent/convos/${convoId}/messages`)
				.send({ message: "Help me draft a doc" });

			// Exec mode convos should not have a plan reminder
			const content = getLastUserContent(getCapturedMessages());
			expect(content).not.toContain("[IMPORTANT");
			expect(content).not.toContain("update_plan");
		});

		it("should include plan reminder for plan mode convos without a plan", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			// Create plan mode convo with no plan
			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "My chat",
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { mode: "plan", planPhase: "planning" },
			});

			await request(testApp)
				.post(`/api/agent/convos/${convo.id}/messages`)
				.send({ message: "Help me draft a doc" });

			// The last message sent to the LLM should contain the IMPORTANT reminder
			const content = getLastUserContent(getCapturedMessages());
			expect(content).toContain("[IMPORTANT: You MUST call update_plan before responding.");

			// The saved DB message should NOT contain the reminder
			const savedConvo = await mockConvoDao.getCollabConvo(convo.id);
			const savedUserMsgs =
				savedConvo?.messages.filter(
					m => m.role === "user" && "content" in m && m.content.includes("Help me"),
				) ?? [];
			expect(savedUserMsgs).toHaveLength(1);
			const savedContent = "content" in savedUserMsgs[0] ? savedUserMsgs[0].content : "";
			expect(savedContent).not.toContain("[IMPORTANT");
		});

		it("should enforce approval gate when plan exists in planning phase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			// Create convo with an existing plan in planning phase
			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "My chat",
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { planPhase: "planning", plan: "# Plan\n1. Step one" },
			});

			await request(testApp)
				.post(`/api/agent/convos/${convo.id}/messages`)
				.send({ message: "I want three articles" });

			const content = getLastUserContent(getCapturedMessages());
			// Should tell the LLM to ask for approval before transitioning phases
			expect(content).toContain("Would you like me to execute this plan?");
			expect(content).toContain('do NOT set the phase to "executing" or "complete"');
			expect(content).not.toContain("[IMPORTANT");
		});

		it("should include progress reminder during executing phase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "Executing chat",
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { planPhase: "executing", plan: "# Plan\n1. Create folder" },
			});

			await request(testApp).post(`/api/agent/convos/${convo.id}/messages`).send({ message: "Go ahead" });

			const content = getLastUserContent(getCapturedMessages());
			expect(content).toContain("Update the plan with progress");
			expect(content).toContain('Only set phase to "complete" after ALL steps are done');
		});

		it("should not include plan reminder during complete phase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				title: "Done chat",
				messages: [{ role: "assistant", content: "All done!", timestamp: new Date().toISOString() }],
				metadata: { planPhase: "complete", plan: "# Plan\n1. Done" },
			});

			await request(testApp).post(`/api/agent/convos/${convo.id}/messages`).send({ message: "Thanks" });

			const content = getLastUserContent(getCapturedMessages());
			expect(content).toBe("Thanks");
		});

		it("should not include plan reminder for CLI workspace convos", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const { testApp, getCapturedMessages } = createCapturingSetup();

			// Create CLI workspace convo
			const createRes = await request(testApp).post("/api/agent/convos").send({ workspaceRoot: "/project" });
			const convoId = createRes.body.id;

			await request(testApp).post(`/api/agent/convos/${convoId}/messages`).send({ message: "Read a file" });

			const content = getLastUserContent(getCapturedMessages());
			expect(content).not.toContain("[IMPORTANT");
			expect(content).not.toContain("update_plan");
		});
	});

	describe("POST /api/agent/convos/:id/mode", () => {
		it("should update conversation mode", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [{ role: "assistant", content: "Hello!", timestamp: new Date().toISOString() }],
				metadata: { mode: "exec" },
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/mode`).send({ mode: "plan" });

			expect(response.status).toBe(200);

			// Verify metadata was updated
			const updated = await mockConvoDao.getCollabConvo(convo.id);
			expect(updated?.metadata).toEqual(expect.objectContaining({ mode: "plan" }));
		});

		it("should return 400 for invalid mode", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [],
				metadata: { mode: "exec" },
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/mode`).send({ mode: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain("Invalid mode");
		});

		it("should return 400 for missing mode", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [],
				metadata: { mode: "exec" },
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/mode`).send({});

			expect(response.status).toBe(400);
		});

		it("should return 404 for non-existent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/9999/mode").send({ mode: "plan" });

			expect(response.status).toBe(404);
		});

		it("should return 400 for non-agent convo", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
				metadata: null,
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/mode`).send({ mode: "plan" });

			expect(response.status).toBe(400);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/agent/convos/1/mode").send({ mode: "plan" });

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app).post("/api/agent/convos/invalid/mode").send({ mode: "plan" });

			expect(response.status).toBe(400);
		});
	});

	describe("POST /api/agent/convos/:id/confirmations/:confirmId", () => {
		it("should return 404 for unknown confirmation", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [],
				metadata: { mode: "exec" },
			});

			const response = await request(app)
				.post(`/api/agent/convos/${convo.id}/confirmations/unknown-conf-id`)
				.send({ approved: true });

			expect(response.status).toBe(404);
			expect(response.body.error).toContain("not found");
		});

		it("should return 400 for missing approved field", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const convo = await mockConvoDao.createCollabConvo({
				artifactType: "agent_hub",
				artifactId: null,
				messages: [],
				metadata: { mode: "exec" },
			});

			const response = await request(app).post(`/api/agent/convos/${convo.id}/confirmations/conf_123`).send({});

			expect(response.status).toBe(400);
		});

		it("should return 401 for unauthenticated user", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app)
				.post("/api/agent/convos/1/confirmations/conf_123")
				.send({ approved: true });

			expect(response.status).toBe(401);
		});

		it("should return 400 for invalid convo ID", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);

			const response = await request(app)
				.post("/api/agent/convos/invalid/confirmations/conf_123")
				.send({ approved: true });

			expect(response.status).toBe(400);
		});
	});

	describe("CLI source-aware prompt", () => {
		it("includes configured sources in the CLI system prompt", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil);
			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/agent/convos", router);

			const createResponse = await request(testApp)
				.post("/api/agent/convos")
				.send({
					workspaceRoot: "/docs/vault",
					sources: [
						{ name: "backend", path: "/repos/backend", sourceId: 12 },
						{ name: "frontend", path: "/repos/frontend" },
					],
				});

			await request(testApp).post(`/api/agent/convos/${createResponse.body.id}/messages`).send({
				message: "Create architecture.md for backend source",
			});

			const createEnvCall = vi.mocked(createAgentEnvironment).mock.calls.at(-1)?.[0];
			expect(createEnvCall?.systemPrompt).toContain("Configured sources (name -> absolute path):");
			expect(createEnvCall?.systemPrompt).toContain("backend (id:12): /repos/backend");
			expect(createEnvCall?.systemPrompt).toContain("frontend: /repos/frontend");
			expect(createEnvCall?.systemPrompt).toContain("Configured sources are read-only reference code.");
			expect(createEnvCall?.systemPrompt).toContain("workspace root as the writable docs vault");
			expect(createEnvCall?.systemPrompt).toContain(
				"If upsert_frontmatter is unavailable, update frontmatter via read_file + write_file carefully.",
			);
			expect(createEnvCall?.systemPrompt).toContain(
				"After any `write_file` or `edit_article` that changes a documentation file, explicitly check whether `attention` frontmatter should be updated, and update it when needed.",
			);
			expect(createEnvCall?.systemPrompt).toContain("Valid attention source values: backend, frontend.");
			expect(createEnvCall?.systemPrompt).toContain(
				'{ op: "file", source: "<source-name>", path: "<repo-relative path>"',
			);
		});

		it("uses default attention source guidance when only one source is configured", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			const router = createAgentConvoRouter(mockDaoProvider(mockConvoDao), mockTokenUtil);
			const testApp = express();
			testApp.use(express.json());
			testApp.use(cookieParser());
			testApp.use("/api/agent/convos", router);

			const createResponse = await request(testApp)
				.post("/api/agent/convos")
				.send({
					workspaceRoot: "/docs/vault",
					sources: [{ name: "backend", path: "/repos/backend", sourceId: 12 }],
				});

			await request(testApp).post(`/api/agent/convos/${createResponse.body.id}/messages`).send({
				message: "Create architecture.md for backend source",
			});

			const createEnvCall = vi.mocked(createAgentEnvironment).mock.calls.at(-1)?.[0];
			expect(createEnvCall?.systemPrompt).toContain("Default attention source: backend.");
		});
	});
});
