import type { Agent, AgentStreamChunk } from "../core/agent";
import type { ConvoDao } from "../dao/ConvoDao";
import { mockConvoDao } from "../dao/ConvoDao.mock";
import type { DaoProvider } from "../dao/DaoProvider";
import type { TokenUtil } from "../util/TokenUtil";
import { createChatRouter } from "./ChatRouter";
import express from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

// Mock E2B imports
vi.mock("../../../tools/jolliagent/src/direct/agentenv", () => ({
	createAgentEnvironment: vi.fn(),
}));

vi.mock("../../../tools/jolliagent/src/tools/Tools", () => ({
	runToolCall: vi.fn(),
}));

// Create a mock agent
const createMockAgent = (): Agent => ({
	invoke() {
		return Promise.resolve({
			content: "test response",
			metadata: {},
		});
	},
	// biome-ignore lint/suspicious/useAwait: Mock generator must be async to match AsyncGenerator type signature
	async *stream() {
		yield { type: "content", content: "test " } as AgentStreamChunk;
		yield { type: "content", content: "response" } as AgentStreamChunk;
		yield { type: "done", metadata: {} } as AgentStreamChunk;
		return;
	},
	getState() {
		return Promise.resolve({ messages: [] });
	},
	setState() {
		return Promise.resolve();
	},
	clearMemory() {
		return Promise.resolve();
	},
});

describe("ChatRouter", () => {
	let mockConvo: ConvoDao;
	let mockTokenUtil: TokenUtil<UserInfo>;

	beforeEach(() => {
		// Disable logging during tests to avoid logger initialization overhead
		process.env.DISABLE_LOGGING = "true";

		vi.clearAllMocks();

		mockConvo = mockConvoDao();

		mockTokenUtil = {
			encodePayload: vi.fn(),
			decodePayload: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;
	});

	it("should return 400 if message is missing", async () => {
		const mockAgent = createMockAgent();
		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil, mockAgent);
		const app = express();
		app.use(express.json());
		app.use("/api/chat", router);

		const response = await request(app).post("/api/chat/stream").send({});

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Message is required");
	});

	it("should handle chat stream request", async () => {
		const mockAgent = createMockAgent();
		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil, mockAgent);
		const app = express();
		app.use(express.json());
		app.use("/api/chat", router);

		const response = await request(app).post("/api/chat/stream").send({
			message: "Hello",
		});

		if (response.status !== 200) {
			console.log("Error response:", response.body, response.text);
		}
		expect(response.status).toBe(200);
	}, 10000);

	it("should handle validation errors with 400 status", async () => {
		const mockAgent = createMockAgent();
		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil, mockAgent);
		const app = express();
		app.use(express.json());
		app.use("/api/chat", router);

		// Send invalid data type for message to trigger error in parseStreamRequest
		const response = await request(app).post("/api/chat/stream").send({
			message: 123, // Should be string
		});

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Message is required");
	});

	it("should handle chat with previous messages", async () => {
		const mockAgent = createMockAgent();
		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil, mockAgent);
		const app = express();
		app.use(express.json());
		app.use("/api/chat", router);

		const response = await request(app)
			.post("/api/chat/stream")
			.send({
				message: "What about code?",
				messages: [
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi there!" },
				],
			});

		expect(response.status).toBe(200);
	}, 10000);

	it("should create fallback agent when no agent provided and MULTI_AGENT_ENABLED is false", () => {
		process.env.MULTI_AGENT_ENABLED = "false";
		process.env.LLM_PROVIDER = "openai";
		process.env.OPENAI_API_KEY = "test-key";

		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil);
		expect(router).toBeDefined();

		delete process.env.MULTI_AGENT_ENABLED;
		delete process.env.LLM_PROVIDER;
		delete process.env.OPENAI_API_KEY;
	});

	it("should create anthropic agent when LLM_PROVIDER is anthropic", () => {
		process.env.MULTI_AGENT_ENABLED = "false";
		process.env.LLM_PROVIDER = "anthropic";
		process.env.ANTHROPIC_API_KEY = "test-key";

		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil);
		expect(router).toBeDefined();

		delete process.env.MULTI_AGENT_ENABLED;
		delete process.env.LLM_PROVIDER;
		delete process.env.ANTHROPIC_API_KEY;
	});

	it("should use custom LLM_MODEL when provided", () => {
		process.env.MULTI_AGENT_ENABLED = "false";
		process.env.LLM_PROVIDER = "openai";
		process.env.LLM_MODEL = "gpt-4o";
		process.env.OPENAI_API_KEY = "test-key";

		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil);
		expect(router).toBeDefined();

		delete process.env.MULTI_AGENT_ENABLED;
		delete process.env.LLM_PROVIDER;
		delete process.env.LLM_MODEL;
		delete process.env.OPENAI_API_KEY;
	});

	it("should default to openai provider when LLM_PROVIDER not set", () => {
		process.env.MULTI_AGENT_ENABLED = "false";
		process.env.OPENAI_API_KEY = "test-key";
		// Don't set LLM_PROVIDER to test default

		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil);
		expect(router).toBeDefined();

		delete process.env.MULTI_AGENT_ENABLED;
		delete process.env.OPENAI_API_KEY;
	});

	it("should stream content chunks via onChunk callback", async () => {
		// Create a mock agent with stream that yields chunks
		const mockAgent = createMockAgent();

		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil, mockAgent);

		const app = express();
		app.use(express.json());
		app.use("/api/chat", router);

		const response = await request(app).post("/api/chat/stream").send({
			message: "Test message",
		});

		expect(response.status).toBe(200);

		// Verify the response contains the streamed chunks from the mock agent
		const responseText = response.text;
		expect(responseText).toContain('data: {"content":"test "}');
		expect(responseText).toContain('data: {"content":"response"}');
		expect(responseText).toContain("data: [DONE]");
	});

	it("should handle request with visitorId cookie", async () => {
		const mockAgent = createMockAgent();
		const router = createChatRouter(mockDaoProvider(mockConvo), mockTokenUtil, mockAgent);
		const app = express();
		app.use(express.json());
		// Add cookie parser to process cookies
		app.use((req, _res, next) => {
			req.cookies = { visitorId: "visitor-123" };
			next();
		});
		app.use("/api/chat", router);

		const response = await request(app).post("/api/chat/stream").send({
			message: "Hello with visitor",
		});

		expect(response.status).toBe(200);
	});
});
