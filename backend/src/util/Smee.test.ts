import type { ExitHandler } from "../index";
import { startSmeeClient } from "./Smee";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Smee", () => {
	let shutdownHandlers: Array<ExitHandler>;

	beforeEach(() => {
		shutdownHandlers = [];
		vi.clearAllMocks();
	});

	describe("startSmeeClient", () => {
		it("should start Smee client and add shutdown handler", async () => {
			const mockSmeeClient = {
				start: vi.fn().mockResolvedValue(undefined),
				stop: vi.fn(),
			};

			// Mock the smee-client module
			vi.doMock("smee-client", () => ({
				SmeeClient: vi.fn(() => mockSmeeClient),
			}));

			await startSmeeClient(shutdownHandlers, {
				smeeUrl: "https://smee.io/test",
				localUrl: "http://localhost:8034",
			});

			// Should have started the client
			expect(mockSmeeClient.start).toHaveBeenCalled();

			// Should have added a shutdown handler
			expect(shutdownHandlers).toHaveLength(1);

			// Calling the shutdown handler should stop the client
			shutdownHandlers[0].stop();
			expect(mockSmeeClient.stop).toHaveBeenCalled();

			vi.doUnmock("smee-client");
		});

		it("should handle errors when starting Smee client", async () => {
			// Mock the smee-client module to throw an error
			vi.doMock("smee-client", () => {
				throw new Error("Failed to load smee-client");
			});

			// Should not throw, just log the error
			await expect(
				startSmeeClient(shutdownHandlers, {
					smeeUrl: "https://smee.io/test",
					localUrl: "http://localhost:8034",
				}),
			).resolves.toBeUndefined();

			// Should not have added any shutdown handlers
			expect(shutdownHandlers).toHaveLength(0);

			vi.doUnmock("smee-client");
		});

		it("should handle errors when Smee client fails to start", async () => {
			const mockSmeeClient = {
				start: vi.fn().mockRejectedValue(new Error("Failed to start")),
				stop: vi.fn(),
			};

			// Mock the smee-client module
			vi.doMock("smee-client", () => ({
				SmeeClient: vi.fn(() => mockSmeeClient),
			}));

			// Should not throw, just log the error
			await expect(
				startSmeeClient(shutdownHandlers, {
					smeeUrl: "https://smee.io/test",
					localUrl: "http://localhost:8034",
				}),
			).resolves.toBeUndefined();

			// Should have tried to start
			expect(mockSmeeClient.start).toHaveBeenCalled();

			// Should not have added shutdown handler since start failed
			expect(shutdownHandlers).toHaveLength(0);

			vi.doUnmock("smee-client");
		});
	});
});
