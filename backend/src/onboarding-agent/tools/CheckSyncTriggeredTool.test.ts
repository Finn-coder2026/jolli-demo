/**
 * Tests for CheckSyncTriggeredTool.
 */

import { checkSyncTriggeredTool } from "./CheckSyncTriggeredTool";
import { createMockToolContext } from "./ToolTestUtils";
import { getActiveGithubIntegration } from "./ToolUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ToolUtils
vi.mock("./ToolUtils", () => ({
	getActiveGithubIntegration: vi.fn().mockResolvedValue(undefined),
}));

describe("CheckSyncTriggeredTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(checkSyncTriggeredTool.definition.name).toBe("check_sync_triggered");
		});

		it("should have optional since_timestamp parameter", () => {
			expect(checkSyncTriggeredTool.definition.parameters.properties.since_timestamp).toBeDefined();
			// required is empty array or undefined (optional)
			expect(checkSyncTriggeredTool.definition.parameters.required).toEqual([]);
		});
	});

	describe("handler", () => {
		it("should fail when no GitHub integration is connected", async () => {
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce(undefined);

			const ctx = createMockToolContext();
			const result = await checkSyncTriggeredTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("No GitHub integration");
		});

		it("should detect sync when integration was updated recently", async () => {
			const recentDate = new Date();
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				updatedAt: recentDate,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);

			const ctx = createMockToolContext();
			const result = await checkSyncTriggeredTool.handler({}, ctx);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.content);
			expect(parsed.syncDetected).toBe(true);
			expect(parsed.integrationId).toBe(1);
			expect(ctx.updateStepData).toHaveBeenCalled();
		});

		it("should not detect sync when integration was not updated recently", async () => {
			// Set updatedAt to 10 minutes ago (outside the 5-minute window)
			const oldDate = new Date(Date.now() - 10 * 60 * 1000);
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				updatedAt: oldDate,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);

			const ctx = createMockToolContext();
			const result = await checkSyncTriggeredTool.handler({}, ctx);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.content);
			expect(parsed.syncDetected).toBe(false);
		});

		it("should use since_timestamp when provided", async () => {
			const recentDate = new Date();
			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				updatedAt: recentDate,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);

			const ctx = createMockToolContext();
			// Set since_timestamp to a time before the update
			const pastTimestamp = new Date(Date.now() - 60000).toISOString();
			const result = await checkSyncTriggeredTool.handler({ since_timestamp: pastTimestamp }, ctx);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.content);
			expect(parsed.syncDetected).toBe(true);
		});

		it("should respect lastSyncTime from step data", async () => {
			// Integration updated, but before the last known sync time
			const oldUpdateDate = new Date(Date.now() - 1000);
			const lastSyncTime = new Date().toISOString();

			vi.mocked(getActiveGithubIntegration).mockResolvedValueOnce({
				id: 1,
				updatedAt: oldUpdateDate,
				metadata: { repo: "acme/docs", branch: "main" },
			} as never);

			const ctx = createMockToolContext({ lastSyncTime });
			const result = await checkSyncTriggeredTool.handler({}, ctx);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.content);
			// Even though updatedAt is recent, it's before lastSyncTime, so no new sync
			expect(parsed.syncDetected).toBe(false);
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValueOnce(new Error("DB error"));

			const ctx = createMockToolContext();
			const result = await checkSyncTriggeredTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed");
			expect(result.content).toContain("DB error");
		});

		it("should handle non-Error objects in catch block", async () => {
			vi.mocked(getActiveGithubIntegration).mockRejectedValueOnce("string error");

			const ctx = createMockToolContext();
			const result = await checkSyncTriggeredTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Unknown error");
		});
	});
});
