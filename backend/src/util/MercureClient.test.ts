import { createMercureClient, type MercureClient } from "./MercureClient";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock the Config module
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(),
}));

// Mock global fetch
global.fetch = vi.fn();

// Import getConfig after mocking
import { getConfig } from "../config/Config";

describe("MercureClient", () => {
	let mercureClient: MercureClient;
	const mockGetConfig = getConfig as Mock;
	const mockFetch = global.fetch as Mock;

	const defaultConfig = {
		MERCURE_ENABLED: true,
		MERCURE_HUB_BASE_URL: "http://localhost:3001",
		MERCURE_PUBLISHER_JWT_SECRET: "test-publisher-secret-at-least-256-bits-long",
		MERCURE_SUBSCRIBER_JWT_SECRET: "test-subscriber-secret-at-least-256-bits-long",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetConfig.mockReturnValue(defaultConfig);
		mercureClient = createMercureClient();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("isEnabled", () => {
		it("should return true when Mercure is fully configured", () => {
			expect(mercureClient.isEnabled()).toBe(true);
		});

		it("should return false when MERCURE_ENABLED is false", () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				MERCURE_ENABLED: false,
			});

			expect(mercureClient.isEnabled()).toBe(false);
		});

		it("should return false when MERCURE_HUB_BASE_URL is missing", () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				MERCURE_HUB_BASE_URL: undefined,
			});

			expect(mercureClient.isEnabled()).toBe(false);
		});

		it("should return false when MERCURE_PUBLISHER_JWT_SECRET is missing", () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				MERCURE_PUBLISHER_JWT_SECRET: undefined,
			});

			expect(mercureClient.isEnabled()).toBe(false);
		});

		it("should return false when MERCURE_HUB_BASE_URL is empty string", () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				MERCURE_HUB_BASE_URL: "",
			});

			expect(mercureClient.isEnabled()).toBe(false);
		});
	});

	describe("publish", () => {
		it("should return success: false when Mercure is disabled", async () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				MERCURE_ENABLED: false,
			});

			const result = await mercureClient.publish({
				topic: "/tenants/test/drafts/123",
				data: { type: "test" },
			});

			expect(result.success).toBe(false);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("should publish successfully and return event ID", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve("urn:uuid:1234"),
			});

			const result = await mercureClient.publish({
				topic: "/tenants/test/drafts/123",
				data: { type: "content_update", content: "Hello" },
			});

			expect(result.success).toBe(true);
			expect(result.eventId).toBe("urn:uuid:1234");
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Verify the fetch call
			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toBe("http://localhost:3001/.well-known/mercure");
			expect(options.method).toBe("POST");
			expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
			expect(options.headers.Authorization).toMatch(/^Bearer /);

			// Verify the body contains correct form data
			const body = new URLSearchParams(options.body);
			expect(body.get("topic")).toBe("/tenants/test/drafts/123");
			expect(body.get("data")).toBe(JSON.stringify({ type: "content_update", content: "Hello" }));
		});

		it("should include private flag when specified", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve("urn:uuid:5678"),
			});

			await mercureClient.publish({
				topic: "/tenants/test/convos/456",
				data: { type: "typing" },
				private: true,
			});

			const [, options] = mockFetch.mock.calls[0];
			const body = new URLSearchParams(options.body);
			expect(body.get("private")).toBe("on");
		});

		it("should include id when specified", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve("custom-id-123"),
			});

			await mercureClient.publish({
				topic: "/tenants/test/jobs/events",
				data: { type: "job:started" },
				id: "custom-id-123",
			});

			const [, options] = mockFetch.mock.calls[0];
			const body = new URLSearchParams(options.body);
			expect(body.get("id")).toBe("custom-id-123");
		});

		it("should include type when specified", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve("urn:uuid:9999"),
			});

			await mercureClient.publish({
				topic: "/tenants/test/jobs/events",
				data: { jobId: "123" },
				type: "job:completed",
			});

			const [, options] = mockFetch.mock.calls[0];
			const body = new URLSearchParams(options.body);
			expect(body.get("type")).toBe("job:completed");
		});

		it("should include retry when specified", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve("urn:uuid:abc"),
			});

			await mercureClient.publish({
				topic: "/tenants/test/drafts/789",
				data: { type: "ping" },
				retry: 5000,
			});

			const [, options] = mockFetch.mock.calls[0];
			const body = new URLSearchParams(options.body);
			expect(body.get("retry")).toBe("5000");
		});

		it("should return success: false when fetch returns non-ok response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: () => Promise.resolve("Unauthorized"),
			});

			const result = await mercureClient.publish({
				topic: "/tenants/test/drafts/123",
				data: { type: "test" },
			});

			expect(result.success).toBe(false);
			expect(result.eventId).toBeUndefined();
		});

		it("should return success: false when fetch throws an error", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			const result = await mercureClient.publish({
				topic: "/tenants/test/drafts/123",
				data: { type: "test" },
			});

			expect(result.success).toBe(false);
			expect(result.eventId).toBeUndefined();
		});

		it("should sign JWT with correct mercure.publish claim", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve("urn:uuid:jwt-test"),
			});

			await mercureClient.publish({
				topic: "/tenants/acme/drafts/999",
				data: { type: "test" },
			});

			const [, options] = mockFetch.mock.calls[0];
			const token = options.headers.Authorization.replace("Bearer ", "");

			// Verify the JWT
			const decoded = jwt.verify(token, defaultConfig.MERCURE_PUBLISHER_JWT_SECRET) as {
				mercure: { publish: Array<string> };
			};

			expect(decoded.mercure.publish).toEqual(["/tenants/acme/drafts/999"]);
		});

		it("should handle empty event ID response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(""),
			});

			const result = await mercureClient.publish({
				topic: "/tenants/test/drafts/123",
				data: { type: "test" },
			});

			expect(result.success).toBe(true);
			expect(result.eventId).toBeUndefined();
		});
	});
});
