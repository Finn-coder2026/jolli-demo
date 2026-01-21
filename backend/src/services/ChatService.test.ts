import type { Agent, AgentConfig, ChatMessage } from "../core/agent";
import { ChatService } from "./ChatService";
import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ChatService", () => {
	let mockRes: Response;
	let chatService: ChatService;

	beforeEach(() => {
		chatService = new ChatService();
		mockRes = {
			setHeader: vi.fn(),
			write: vi.fn(),
			headersSent: false,
			writableEnded: false,
			status: vi.fn().mockReturnThis(),
			json: vi.fn(),
			end: vi.fn(),
		} as unknown as Response;
	});

	describe("setupSSEHeaders", () => {
		it("should set correct SSE headers", () => {
			chatService.setupSSEHeaders(mockRes);

			expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
			expect(mockRes.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
			expect(mockRes.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
		});
	});

	describe("sendSSE", () => {
		it("should send data as SSE format", () => {
			const data = { type: "test", message: "hello" };
			chatService.sendSSE(mockRes, data);

			expect(mockRes.write).toHaveBeenCalledWith(`data: ${JSON.stringify(data)}\n\n`);
		});
	});

	describe("sendDone", () => {
		it("should send done signal", () => {
			chatService.sendDone(mockRes);

			expect(mockRes.write).toHaveBeenCalledWith("data: [DONE]\n\n");
		});
	});

	describe("sendError", () => {
		it("should send error signal", () => {
			chatService.sendError(mockRes);

			expect(mockRes.write).toHaveBeenCalledWith("data: [ERROR]\n\n");
		});
	});

	describe("handleStreamError", () => {
		it("should send JSON error if headers not sent", () => {
			const error = new Error("Test error");
			chatService.handleStreamError(mockRes, error);

			expect(mockRes.status).toHaveBeenCalledWith(500);
			expect(mockRes.json).toHaveBeenCalledWith({ error: "Test error" });
		});

		it("should use custom error message if provided", () => {
			const error = new Error("Original error");
			chatService.handleStreamError(mockRes, error, "Custom error");

			expect(mockRes.status).toHaveBeenCalledWith(500);
			expect(mockRes.json).toHaveBeenCalledWith({ error: "Custom error" });
		});
	});

	describe("streamChatResponse", () => {
		it("should stream chat response with content chunks", async () => {
			const mockAgent = {
				stream: vi.fn(function* () {
					yield { type: "content" as const, content: "Hello " };
					yield { type: "content" as const, content: "world" };
					yield { type: "done" as const, metadata: { tokens: 10 } };
				}),
			} as unknown as Agent;

			const chatMessages: Array<ChatMessage> = [{ role: "user", content: "Hi" }];
			const agentConfig: AgentConfig = { model: "test-model" };

			const result = await chatService.streamChatResponse(mockRes, mockAgent, chatMessages, agentConfig);

			expect(result).toEqual({ fullResponse: "Hello world", metadata: { tokens: 10 } });
			expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
			expect(mockRes.write).toHaveBeenCalledWith('data: {"content":"Hello "}\n\n');
			expect(mockRes.write).toHaveBeenCalledWith('data: {"content":"world"}\n\n');
			expect(mockRes.write).toHaveBeenCalledWith('data: {"type":"done","metadata":{"tokens":10}}\n\n');
		});

		it("should stream chat response without metadata", async () => {
			const mockAgent = {
				stream: vi.fn(function* () {
					yield { type: "content" as const, content: "Hello" };
					yield { type: "done" as const };
				}),
			} as unknown as Agent;

			const chatMessages: Array<ChatMessage> = [{ role: "user", content: "Hi" }];
			const agentConfig: AgentConfig = { model: "test-model" };

			const result = await chatService.streamChatResponse(mockRes, mockAgent, chatMessages, agentConfig);

			expect(result).toEqual({ fullResponse: "Hello" });
		});

		it("should ignore chunks without content", async () => {
			const mockAgent = {
				stream: vi.fn(function* () {
					yield { type: "content" as const, content: "" };
					yield { type: "content" as const, content: "Hello" };
					yield { type: "done" as const };
				}),
			} as unknown as Agent;

			const chatMessages: Array<ChatMessage> = [{ role: "user", content: "Hi" }];
			const agentConfig: AgentConfig = { model: "test-model" };

			const result = await chatService.streamChatResponse(mockRes, mockAgent, chatMessages, agentConfig);

			expect(result).toEqual({ fullResponse: "Hello" });
		});
	});

	describe("validateMessage", () => {
		it("should validate and trim message", () => {
			const result = chatService.validateMessage("  Hello world  ");
			expect(result).toBe("Hello world");
		});

		it("should throw error for whitespace-only message", () => {
			expect(() => chatService.validateMessage("   ")).toThrow("Message cannot be empty");
		});
	});

	describe("generateTitle", () => {
		it("should generate title with default max length", () => {
			const message = "This is a test message";
			const result = chatService.generateTitle(message);
			expect(result).toBe(message);
		});

		it("should truncate long messages to max length", () => {
			const longMessage = "a".repeat(100);
			const result = chatService.generateTitle(longMessage, 50);
			expect(result).toBe(`${"a".repeat(50)}...`);
		});

		it("should not add ellipsis if message is exactly max length", () => {
			const message = "a".repeat(50);
			const result = chatService.generateTitle(message, 50);
			expect(result).toBe(message);
		});

		it("should handle custom max length", () => {
			const message = "Hello world this is a test";
			const result = chatService.generateTitle(message, 10);
			expect(result).toBe("Hello worl...");
		});
	});

	describe("startKeepAlive", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should send keep-alive pings at specified interval", () => {
			const intervalId = chatService.startKeepAlive(mockRes, 1000);

			// No pings initially
			expect(mockRes.write).not.toHaveBeenCalled();

			// Advance time by 1 second
			vi.advanceTimersByTime(1000);
			expect(mockRes.write).toHaveBeenCalledTimes(1);
			expect(mockRes.write).toHaveBeenCalledWith(
				expect.stringMatching(/^: ping \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\n\n$/),
			);

			// Advance time by another second
			vi.advanceTimersByTime(1000);
			expect(mockRes.write).toHaveBeenCalledTimes(2);

			// Advance time by another second
			vi.advanceTimersByTime(1000);
			expect(mockRes.write).toHaveBeenCalledTimes(3);

			// Clean up
			clearInterval(intervalId);
		});

		it("should use default interval of 20 seconds when not specified", () => {
			const intervalId = chatService.startKeepAlive(mockRes);

			// Advance time by 19 seconds - no ping yet
			vi.advanceTimersByTime(19000);
			expect(mockRes.write).not.toHaveBeenCalled();

			// Advance time by 1 more second - should ping
			vi.advanceTimersByTime(1000);
			expect(mockRes.write).toHaveBeenCalledTimes(1);

			// Clean up
			clearInterval(intervalId);
		});

		it("should not write if response is already ended", () => {
			const endedRes = {
				...mockRes,
				writableEnded: true,
			} as Response;

			const intervalId = chatService.startKeepAlive(endedRes, 1000);

			vi.advanceTimersByTime(1000);
			expect(endedRes.write).not.toHaveBeenCalled();

			// Clean up
			clearInterval(intervalId);
		});

		it("should include ISO timestamp in keep-alive ping", () => {
			const intervalId = chatService.startKeepAlive(mockRes, 1000);

			vi.advanceTimersByTime(1000);

			const writeCall = (mockRes.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
			expect(writeCall).toMatch(/^: ping \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\n\n$/);

			// Clean up
			clearInterval(intervalId);
		});
	});

	describe("stopKeepAlive", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should stop sending keep-alive pings", () => {
			const intervalId = chatService.startKeepAlive(mockRes, 1000);

			// Advance time and verify ping sent
			vi.advanceTimersByTime(1000);
			expect(mockRes.write).toHaveBeenCalledTimes(1);

			// Stop keep-alive
			chatService.stopKeepAlive(intervalId);

			// Advance time and verify no more pings
			vi.advanceTimersByTime(5000);
			expect(mockRes.write).toHaveBeenCalledTimes(1); // Still just the one from before
		});
	});
});
