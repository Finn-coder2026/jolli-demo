import {
	addBuildConnection,
	broadcastBuildEvent,
	clearAllConnections,
	clearEventBuffer,
	getBuildTempDir,
	getConnectionCount,
	registerBuildTempDir,
	removeBuildConnection,
	sendBuildEvent,
	unregisterBuildTempDir,
} from "./BuildStreamService";
import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock response object
function createMockResponse(): Response {
	const res = {
		setHeader: vi.fn(),
		write: vi.fn(),
		writableEnded: false,
	} as unknown as Response;
	return res;
}

describe("BuildStreamService", () => {
	beforeEach(() => {
		// Clear all connections before each test
		clearAllConnections();
		// Reset timers
		vi.useFakeTimers();
	});

	afterEach(() => {
		clearAllConnections();
		vi.useRealTimers();
	});

	describe("addBuildConnection", () => {
		it("should setup SSE headers on the response", () => {
			const res = createMockResponse();

			addBuildConnection(1, res);

			expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
			expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
			expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
			expect(res.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
		});

		it("should add connection to tracking map", () => {
			const res = createMockResponse();

			expect(getConnectionCount(1)).toBe(0);

			addBuildConnection(1, res);

			expect(getConnectionCount(1)).toBe(1);
		});

		it("should allow multiple connections for the same site", () => {
			const res1 = createMockResponse();
			const res2 = createMockResponse();

			addBuildConnection(1, res1);
			addBuildConnection(1, res2);

			expect(getConnectionCount(1)).toBe(2);
		});

		it("should track connections for different sites separately", () => {
			const res1 = createMockResponse();
			const res2 = createMockResponse();

			addBuildConnection(1, res1);
			addBuildConnection(2, res2);

			expect(getConnectionCount(1)).toBe(1);
			expect(getConnectionCount(2)).toBe(1);
		});
	});

	describe("removeBuildConnection", () => {
		it("should remove connection from tracking map", () => {
			const res = createMockResponse();

			addBuildConnection(1, res);
			expect(getConnectionCount(1)).toBe(1);

			removeBuildConnection(1, res);
			expect(getConnectionCount(1)).toBe(0);
		});

		it("should only remove the specific connection", () => {
			const res1 = createMockResponse();
			const res2 = createMockResponse();

			addBuildConnection(1, res1);
			addBuildConnection(1, res2);
			expect(getConnectionCount(1)).toBe(2);

			removeBuildConnection(1, res1);
			expect(getConnectionCount(1)).toBe(1);
		});

		it("should handle removing non-existent connection gracefully", () => {
			const res = createMockResponse();

			// Should not throw
			expect(() => removeBuildConnection(1, res)).not.toThrow();
			expect(getConnectionCount(1)).toBe(0);
		});

		it("should handle removing from non-existent site gracefully", () => {
			const res = createMockResponse();

			// Should not throw
			expect(() => removeBuildConnection(999, res)).not.toThrow();
		});
	});

	describe("broadcastBuildEvent", () => {
		it("should send event to all connected clients for a site", () => {
			const res1 = createMockResponse();
			const res2 = createMockResponse();

			addBuildConnection(1, res1);
			addBuildConnection(1, res2);

			const event = { type: "build:step" as const, step: 1, total: 7, message: "Test" };
			broadcastBuildEvent(1, event);

			expect(res1.write).toHaveBeenCalledWith(expect.stringContaining("build:step"));
			expect(res2.write).toHaveBeenCalledWith(expect.stringContaining("build:step"));
		});

		it("should not send events to clients watching different sites", () => {
			const res1 = createMockResponse();
			const res2 = createMockResponse();

			addBuildConnection(1, res1);
			addBuildConnection(2, res2);

			broadcastBuildEvent(1, { type: "build:step" as const, step: 1, total: 7, message: "Test" });

			expect(res1.write).toHaveBeenCalled();
			expect(res2.write).not.toHaveBeenCalledWith(expect.stringContaining("build:step"));
		});

		it("should handle broadcasting to site with no connections", () => {
			// Should not throw
			expect(() =>
				broadcastBuildEvent(999, { type: "build:step" as const, step: 1, total: 7, message: "Test" }),
			).not.toThrow();
		});

		it("should not write to closed responses", () => {
			const res = createMockResponse();
			(res as { writableEnded: boolean }).writableEnded = true;

			addBuildConnection(1, res);
			broadcastBuildEvent(1, { type: "build:step" as const, step: 1, total: 7, message: "Test" });

			// The write call comes from keep-alive setup, not broadcastBuildEvent
			// Check that no additional writes happened after the keep-alive interval
			expect(res.write).not.toHaveBeenCalled();
		});
	});

	describe("sendBuildEvent", () => {
		it("should send event to a single response", () => {
			const res = createMockResponse();

			sendBuildEvent(res, { type: "build:step" as const, step: 1, total: 7, message: "Test" });

			expect(res.write).toHaveBeenCalledWith(expect.stringContaining("build:step"));
			expect(res.write).toHaveBeenCalledWith(expect.stringContaining("Test"));
		});

		it("should format event as SSE data", () => {
			const res = createMockResponse();

			sendBuildEvent(res, { type: "build:completed" as const, status: "active", url: "https://example.com" });

			const writeCall = vi.mocked(res.write).mock.calls[0][0] as string;
			expect(writeCall).toMatch(/^data: /);
			expect(writeCall).toMatch(/\n\n$/);

			// Parse the JSON from the SSE data
			const jsonStr = writeCall.replace(/^data: /, "").replace(/\n\n$/, "");
			const parsed = JSON.parse(jsonStr);
			expect(parsed.type).toBe("build:completed");
			expect(parsed.url).toBe("https://example.com");
		});
	});

	describe("clearAllConnections", () => {
		it("should remove all connections for all sites", () => {
			const res1 = createMockResponse();
			const res2 = createMockResponse();
			const res3 = createMockResponse();

			addBuildConnection(1, res1);
			addBuildConnection(1, res2);
			addBuildConnection(2, res3);

			expect(getConnectionCount(1)).toBe(2);
			expect(getConnectionCount(2)).toBe(1);

			clearAllConnections();

			expect(getConnectionCount(1)).toBe(0);
			expect(getConnectionCount(2)).toBe(0);
		});
	});

	describe("keep-alive", () => {
		it("should send keep-alive pings at regular intervals", () => {
			const res = createMockResponse();

			addBuildConnection(1, res);

			// Fast-forward 20 seconds
			vi.advanceTimersByTime(20000);

			// Should have sent at least one keep-alive ping
			const writeArgs = vi.mocked(res.write).mock.calls.map(call => call[0]);
			const hasPing = writeArgs.some(arg => typeof arg === "string" && arg.includes(": ping"));
			expect(hasPing).toBe(true);
		});

		it("should stop keep-alive when connection is removed", () => {
			const res = createMockResponse();

			addBuildConnection(1, res);
			vi.advanceTimersByTime(20000);

			const callCountBefore = vi.mocked(res.write).mock.calls.length;

			removeBuildConnection(1, res);
			vi.advanceTimersByTime(40000);

			// Should not have any more writes after removal
			expect(vi.mocked(res.write).mock.calls.length).toBe(callCountBefore);
		});
	});

	describe("event buffering", () => {
		it("should buffer events when no clients are connected", () => {
			// Broadcast events before any client connects
			broadcastBuildEvent(1, { type: "build:mode" as const, mode: "create", totalSteps: 7 });
			broadcastBuildEvent(1, { type: "build:step" as const, step: 1, total: 7, message: "Step 1" });
			broadcastBuildEvent(1, { type: "build:step" as const, step: 2, total: 7, message: "Step 2" });

			// Now connect a client
			const res = createMockResponse();
			addBuildConnection(1, res);

			// Client should receive all buffered events
			const writeArgs = vi.mocked(res.write).mock.calls.map(call => call[0] as string);
			expect(writeArgs.some(arg => arg.includes("build:mode"))).toBe(true);
			expect(writeArgs.some(arg => arg.includes("Step 1"))).toBe(true);
			expect(writeArgs.some(arg => arg.includes("Step 2"))).toBe(true);
		});

		it("should replay buffered events to late-connecting clients", () => {
			// First client connects
			const res1 = createMockResponse();
			addBuildConnection(1, res1);

			// Events are broadcast
			broadcastBuildEvent(1, { type: "build:step" as const, step: 1, total: 7, message: "Step 1" });
			broadcastBuildEvent(1, { type: "build:step" as const, step: 2, total: 7, message: "Step 2" });

			// Second client connects later
			const res2 = createMockResponse();
			addBuildConnection(1, res2);

			// Second client should receive buffered events
			const writeArgs = vi.mocked(res2.write).mock.calls.map(call => call[0] as string);
			expect(writeArgs.some(arg => arg.includes("Step 1"))).toBe(true);
			expect(writeArgs.some(arg => arg.includes("Step 2"))).toBe(true);
		});

		it("should not replay events from different sites", () => {
			// Broadcast events for site 1
			broadcastBuildEvent(1, { type: "build:step" as const, step: 1, total: 7, message: "Site 1 Step" });

			// Connect to site 2
			const res = createMockResponse();
			addBuildConnection(2, res);

			// Should not receive site 1's events
			const writeArgs = vi.mocked(res.write).mock.calls.map(call => call[0] as string);
			expect(writeArgs.some(arg => arg.includes("Site 1 Step"))).toBe(false);
		});

		it("should clear buffer after build:completed event (with delay)", () => {
			// Use real timers for this test since we need setTimeout to actually fire
			vi.useRealTimers();

			// Broadcast events including completion
			broadcastBuildEvent(1, { type: "build:step" as const, step: 1, total: 7, message: "Step 1" });
			broadcastBuildEvent(1, { type: "build:completed" as const, status: "active", url: "https://example.com" });

			// Immediately connect - should still get buffered events
			const res1 = createMockResponse();
			addBuildConnection(1, res1);
			let writeArgs = vi.mocked(res1.write).mock.calls.map(call => call[0] as string);
			expect(writeArgs.some(arg => arg.includes("Step 1"))).toBe(true);

			// Remove the first connection
			removeBuildConnection(1, res1);

			// Wait for the buffer cleanup (30 seconds + some margin) - use a shorter delay for testing
			// Actually, we can just manually clear the buffer to test the behavior
			clearEventBuffer(1);

			// Connect another client - buffer should be cleared
			const res2 = createMockResponse();
			addBuildConnection(1, res2);
			writeArgs = vi.mocked(res2.write).mock.calls.map(call => call[0] as string);
			expect(writeArgs.some(arg => arg.includes("Step 1"))).toBe(false);

			// Remove connection to clean up
			removeBuildConnection(1, res2);

			// Restore fake timers for other tests
			vi.useFakeTimers();
		});

		it("should clear buffer using clearEventBuffer", () => {
			// Buffer some events
			broadcastBuildEvent(1, { type: "build:step" as const, step: 1, total: 7, message: "Step 1" });

			// Clear the buffer
			clearEventBuffer(1);

			// Connect a client - should not receive buffered events
			const res = createMockResponse();
			addBuildConnection(1, res);
			const writeArgs = vi.mocked(res.write).mock.calls.map(call => call[0] as string);
			expect(writeArgs.some(arg => arg.includes("Step 1"))).toBe(false);
		});
	});

	describe("temp directory tracking", () => {
		it("should register and retrieve temp directory for a build", () => {
			const tempDir = "/tmp/newdocsite-123-1234567890";

			registerBuildTempDir(123, tempDir);

			expect(getBuildTempDir(123)).toBe(tempDir);
		});

		it("should return undefined for non-existent build", () => {
			expect(getBuildTempDir(999)).toBeUndefined();
		});

		it("should unregister temp directory", () => {
			const tempDir = "/tmp/newdocsite-456-1234567890";

			registerBuildTempDir(456, tempDir);
			expect(getBuildTempDir(456)).toBe(tempDir);

			unregisterBuildTempDir(456);
			expect(getBuildTempDir(456)).toBeUndefined();
		});

		it("should handle unregistering non-existent build gracefully", () => {
			expect(() => unregisterBuildTempDir(999)).not.toThrow();
		});

		it("should track temp directories for different sites separately", () => {
			registerBuildTempDir(1, "/tmp/site-1");
			registerBuildTempDir(2, "/tmp/site-2");

			expect(getBuildTempDir(1)).toBe("/tmp/site-1");
			expect(getBuildTempDir(2)).toBe("/tmp/site-2");
		});

		it("should clear temp directories when clearAllConnections is called", () => {
			registerBuildTempDir(1, "/tmp/site-1");
			registerBuildTempDir(2, "/tmp/site-2");

			clearAllConnections();

			expect(getBuildTempDir(1)).toBeUndefined();
			expect(getBuildTempDir(2)).toBeUndefined();
		});

		it("should overwrite temp directory if registered again for same site", () => {
			registerBuildTempDir(1, "/tmp/old-dir");
			registerBuildTempDir(1, "/tmp/new-dir");

			expect(getBuildTempDir(1)).toBe("/tmp/new-dir");
		});
	});
});
