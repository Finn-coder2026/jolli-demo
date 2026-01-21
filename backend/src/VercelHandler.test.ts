import type { Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("VercelHandler", () => {
	const originalEnv = process.env;
	let mockCreateExpressApp: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.resetModules();

		// Create a mock Express app
		const mockApp = vi.fn((_req, res) => {
			res.statusCode = 200;
			res.end("OK");
		}) as unknown as Express;

		mockCreateExpressApp = vi.fn().mockResolvedValue(mockApp);

		vi.doMock("./AppFactory", () => ({
			createExpressApp: mockCreateExpressApp,
		}));
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("handler", () => {
		it("should create and use Express app on first request", async () => {
			const { default: handler } = await import("./VercelHandler");

			const mockReq = {
				method: "GET",
				url: "/api/test",
			};
			const mockRes = {
				statusCode: 0,
				end: vi.fn(),
			};

			await handler(
				mockReq as unknown as import("node:http").IncomingMessage,
				mockRes as unknown as import("node:http").ServerResponse,
			);

			expect(mockCreateExpressApp).toHaveBeenCalledTimes(1);
		});

		it("should reuse cached app on subsequent requests", async () => {
			const { default: handler } = await import("./VercelHandler");

			const mockReq = {
				method: "GET",
				url: "/api/test",
			};
			const mockRes = {
				statusCode: 0,
				end: vi.fn(),
			};

			// First request
			await handler(
				mockReq as unknown as import("node:http").IncomingMessage,
				mockRes as unknown as import("node:http").ServerResponse,
			);
			// Second request
			await handler(
				mockReq as unknown as import("node:http").IncomingMessage,
				mockRes as unknown as import("node:http").ServerResponse,
			);
			// Third request
			await handler(
				mockReq as unknown as import("node:http").IncomingMessage,
				mockRes as unknown as import("node:http").ServerResponse,
			);

			// Should only create the app once
			expect(mockCreateExpressApp).toHaveBeenCalledTimes(1);
		});

		it("should handle concurrent requests during cold start", async () => {
			// Reset modules to ensure a fresh start
			vi.resetModules();

			// Create a slower mock that takes time to initialize
			// Use a ref object to capture the resolve function
			const ref: { resolve: ((app: Express) => void) | null } = { resolve: null };
			const slowCreateExpressApp = vi.fn().mockImplementation(() => {
				return new Promise<Express>(resolve => {
					ref.resolve = resolve;
				});
			});

			vi.doMock("./AppFactory", () => ({
				createExpressApp: slowCreateExpressApp,
			}));

			const { default: handler } = await import("./VercelHandler");

			const mockReq = { method: "GET", url: "/api/test" };
			const mockRes1 = { statusCode: 0, end: vi.fn() };
			const mockRes2 = { statusCode: 0, end: vi.fn() };

			// Start two concurrent requests
			const request1 = handler(
				mockReq as unknown as import("node:http").IncomingMessage,
				mockRes1 as unknown as import("node:http").ServerResponse,
			);
			const request2 = handler(
				mockReq as unknown as import("node:http").IncomingMessage,
				mockRes2 as unknown as import("node:http").ServerResponse,
			);

			// App should only be created once even with concurrent requests
			expect(slowCreateExpressApp).toHaveBeenCalledTimes(1);

			// Resolve the app creation
			const mockApp = vi.fn((_req, res) => {
				res.statusCode = 200;
				res.end("OK");
			}) as unknown as Express;
			ref.resolve?.(mockApp);

			// Both requests should complete
			await Promise.all([request1, request2]);
		});
	});

	describe("config export", () => {
		it("should export correct runtime config", async () => {
			const { config } = await import("./VercelHandler");

			expect(config).toEqual({
				runtime: "nodejs",
				maxDuration: 30,
			});
		});
	});
});
