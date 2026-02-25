/**
 * Tests for OnboardingClient.
 */

import type { ClientAuth } from "../core/Client";
import { createOnboardingClient, type OnboardingClient } from "./OnboardingClient";
import type { GetOnboardingResponse, OnboardingActionResponse, OnboardingSSEEvent } from "./types";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("OnboardingClient", () => {
	let client: OnboardingClient;
	const baseUrl = "http://localhost:7034";

	// Keep typed references for mock manipulation
	const mockCreateRequest = vi.fn(
		(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown) =>
			({
				method,
				headers: { "Content-Type": "application/json" },
				body: body ? JSON.stringify(body) : undefined,
			}) as RequestInit,
	);
	const mockCheckUnauthorized: Mock<(response: Response) => boolean> = vi.fn(() => false);

	const mockAuth: ClientAuth = {
		createRequest: mockCreateRequest,
		checkUnauthorized: mockCheckUnauthorized,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
		client = createOnboardingClient(baseUrl, mockAuth);
	});

	describe("getState", () => {
		it("should fetch onboarding state", async () => {
			const mockResponse: GetOnboardingResponse = {
				state: undefined,
				needsOnboarding: true,
			};
			vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.getState();

			expect(fetch).toHaveBeenCalledWith(`${baseUrl}/api/onboarding`, expect.any(Object));
			expect(result).toEqual(mockResponse);
		});

		it("should throw on unauthorized response", async () => {
			mockCheckUnauthorized.mockReturnValueOnce(true);
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

			await expect(client.getState()).rejects.toThrow("Unauthorized");
		});

		it("should throw on non-ok response", async () => {
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

			await expect(client.getState()).rejects.toThrow("Failed to get onboarding state");
		});
	});

	describe("chat", () => {
		it("should stream chat events", async () => {
			const events: Array<OnboardingSSEEvent> = [
				{ type: "content", content: "Hello" },
				{ type: "content", content: " world" },
				{ type: "done", state: undefined },
			];
			const sseData = `${events.map(e => `data: ${JSON.stringify(e)}\n`).join("")}data: [DONE]\n`;

			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(sseData),
					})
					.mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};

			vi.mocked(fetch).mockResolvedValue(
				new Response(null, { status: 200 }) as Response & {
					body: ReadableStream<Uint8Array>;
				},
			);

			// Mock the response body
			Object.defineProperty(vi.mocked(fetch).mock.results[0]?.value ?? new Response(), "body", {
				get: () => ({ getReader: () => mockReader }),
			});

			// Need to refetch to get the mock
			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				status: 200,
				body: { getReader: () => mockReader },
			} as unknown as Response);

			const result: Array<OnboardingSSEEvent> = [];
			for await (const event of client.chat("test message")) {
				result.push(event);
			}

			expect(result).toEqual(events);
			expect(mockReader.releaseLock).toHaveBeenCalled();
		});

		it("should throw on unauthorized response", async () => {
			mockCheckUnauthorized.mockReturnValueOnce(true);
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

			const generator = client.chat("test");
			await expect(generator.next()).rejects.toThrow("Unauthorized");
		});

		it("should throw on non-ok response", async () => {
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

			const generator = client.chat("test");
			await expect(generator.next()).rejects.toThrow("Failed to start chat");
		});

		it("should throw if no response body", async () => {
			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				status: 200,
				body: null,
			} as unknown as Response);

			const generator = client.chat("test");
			await expect(generator.next()).rejects.toThrow("No response body");
		});

		it("should handle partial lines across chunks", async () => {
			const chunk1 = 'data: {"type":"content","content":"He';
			const chunk2 = 'llo"}\ndata: [DONE]\n';

			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(chunk1),
					})
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(chunk2),
					})
					.mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};

			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				status: 200,
				body: { getReader: () => mockReader },
			} as unknown as Response);

			const result: Array<OnboardingSSEEvent> = [];
			for await (const event of client.chat("test")) {
				result.push(event);
			}

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ type: "content", content: "Hello" });
		});

		it("should skip invalid JSON", async () => {
			const sseData = 'data: invalid json\ndata: {"type":"content","content":"valid"}\ndata: [DONE]\n';

			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(sseData),
					})
					.mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};

			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				status: 200,
				body: { getReader: () => mockReader },
			} as unknown as Response);

			const result: Array<OnboardingSSEEvent> = [];
			for await (const event of client.chat("test")) {
				result.push(event);
			}

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ type: "content", content: "valid" });
		});

		it("should handle stream ending without [DONE]", async () => {
			const sseData = 'data: {"type":"content","content":"test"}\n';

			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(sseData),
					})
					.mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};

			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				status: 200,
				body: { getReader: () => mockReader },
			} as unknown as Response);

			const result: Array<OnboardingSSEEvent> = [];
			for await (const event of client.chat("test")) {
				result.push(event);
			}

			expect(result).toHaveLength(1);
		});

		it("should pass history to request body", async () => {
			const mockReader = {
				read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};

			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				status: 200,
				body: { getReader: () => mockReader },
			} as unknown as Response);

			const history = [{ role: "user" as const, content: "previous message" }];

			// Consume the generator
			for await (const _ of client.chat("new message", history)) {
				// Empty
			}

			expect(mockCreateRequest).toHaveBeenCalledWith("POST", {
				message: "new message",
				history,
			});
		});

		it("should handle lines without data prefix", async () => {
			const sseData = 'event: message\ndata: {"type":"content","content":"test"}\n\ndata: [DONE]\n';

			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode(sseData),
					})
					.mockResolvedValueOnce({ done: true, value: undefined }),
				releaseLock: vi.fn(),
			};

			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				status: 200,
				body: { getReader: () => mockReader },
			} as unknown as Response);

			const result: Array<OnboardingSSEEvent> = [];
			for await (const event of client.chat("test")) {
				result.push(event);
			}

			expect(result).toHaveLength(1);
		});
	});

	describe("skip", () => {
		it("should skip onboarding", async () => {
			const mockResponse: OnboardingActionResponse = {
				success: true,
				state: { status: "skipped" } as OnboardingActionResponse["state"],
			};
			vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.skip();

			expect(fetch).toHaveBeenCalledWith(`${baseUrl}/api/onboarding/skip`, expect.any(Object));
			expect(result).toEqual(mockResponse);
		});

		it("should throw on unauthorized response", async () => {
			mockCheckUnauthorized.mockReturnValueOnce(true);
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

			await expect(client.skip()).rejects.toThrow("Unauthorized");
		});

		it("should throw on non-ok response", async () => {
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

			await expect(client.skip()).rejects.toThrow("Failed to skip onboarding");
		});
	});

	describe("complete", () => {
		it("should complete onboarding", async () => {
			const mockResponse: OnboardingActionResponse = {
				success: true,
				state: { status: "completed" } as OnboardingActionResponse["state"],
			};
			vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.complete();

			expect(fetch).toHaveBeenCalledWith(`${baseUrl}/api/onboarding/complete`, expect.any(Object));
			expect(result).toEqual(mockResponse);
		});

		it("should throw on unauthorized response", async () => {
			mockCheckUnauthorized.mockReturnValueOnce(true);
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

			await expect(client.complete()).rejects.toThrow("Unauthorized");
		});

		it("should throw on non-ok response", async () => {
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

			await expect(client.complete()).rejects.toThrow("Failed to complete onboarding");
		});
	});

	describe("restart", () => {
		it("should restart onboarding", async () => {
			const mockResponse: OnboardingActionResponse = {
				success: true,
				state: { status: "in_progress" } as OnboardingActionResponse["state"],
			};
			vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await client.restart();

			expect(fetch).toHaveBeenCalledWith(`${baseUrl}/api/onboarding/restart`, expect.any(Object));
			expect(result).toEqual(mockResponse);
		});

		it("should throw on unauthorized response", async () => {
			mockCheckUnauthorized.mockReturnValueOnce(true);
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

			await expect(client.restart()).rejects.toThrow("Unauthorized");
		});

		it("should throw on non-ok response", async () => {
			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

			await expect(client.restart()).rejects.toThrow("Failed to restart onboarding");
		});
	});

	describe("auth without checkUnauthorized", () => {
		it("should work without checkUnauthorized callback", async () => {
			const authWithoutCheck: ClientAuth = {
				createRequest: vi.fn(
					(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE") =>
						({
							method,
							headers: { "Content-Type": "application/json" },
						}) as RequestInit,
				),
			};

			const clientWithoutCheck = createOnboardingClient(baseUrl, authWithoutCheck);

			const mockResponse: GetOnboardingResponse = {
				state: undefined,
				needsOnboarding: true,
			};
			vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

			const result = await clientWithoutCheck.getState();
			expect(result).toEqual(mockResponse);
		});
	});
});
