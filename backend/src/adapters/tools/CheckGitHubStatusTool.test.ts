import type { IntegrationDao } from "../../dao/IntegrationDao";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import { createCheckGitHubStatusToolDefinition, executeCheckGitHubStatusTool } from "./CheckGitHubStatusTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

describe("CheckGitHubStatusTool", () => {
	let deps: AgentHubToolDeps;
	let mockIntegrationDao: IntegrationDao;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockIntegrationDao = mocks.mockIntegrationDao;
	});

	describe("createCheckGitHubStatusToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createCheckGitHubStatusToolDefinition();
			expect(def.name).toBe("check_github_status");
			expect(def.description).toBeTruthy();
		});
	});

	describe("executeCheckGitHubStatusTool", () => {
		it("returns not connected when no GitHub integrations exist", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeCheckGitHubStatusTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.connected).toBe(false);
			expect(parsed.integrations).toEqual([]);
			expect(parsed.message).toContain("not connected");
		});

		it("returns not connected when integrations exist but none are GitHub", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{ id: 1, type: "slack", status: "active", name: "Slack", metadata: {} },
			] as never);

			const result = await executeCheckGitHubStatusTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.connected).toBe(false);
		});

		it("returns not connected when GitHub integration is inactive", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "inactive",
					name: "My Repo",
					metadata: { repo: "owner/repo", branch: "main" },
				},
			] as never);

			const result = await executeCheckGitHubStatusTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.connected).toBe(false);
		});

		it("returns connected with integration details", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main" },
				},
				{
					id: 2,
					type: "github",
					status: "active",
					name: "acme/api",
					metadata: { repo: "acme/api" },
				},
			] as never);

			const result = await executeCheckGitHubStatusTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.connected).toBe(true);
			expect(parsed.integrations).toHaveLength(2);
			expect(parsed.integrations[0]).toEqual({
				id: 1,
				name: "acme/docs",
				repo: "acme/docs",
				branch: "main",
			});
			expect(parsed.integrations[1]).toEqual({
				id: 2,
				name: "acme/api",
				repo: "acme/api",
				branch: "main",
			});
		});
	});
});
