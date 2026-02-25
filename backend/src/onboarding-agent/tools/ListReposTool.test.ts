/**
 * Tests for ListReposTool.
 */

import { listReposTool } from "./ListReposTool";
import { createMockToolContext } from "./ToolTestUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock external dependencies
vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn().mockReturnValue({ appId: 123, slug: "test" }),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	fetchInstallationRepositories: vi.fn().mockResolvedValue([]),
}));

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { fetchInstallationRepositories } from "../../util/GithubAppUtil";

describe("ListReposTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: 123, slug: "test" } as never);
	});

	describe("definition", () => {
		it("should have correct tool name", () => {
			expect(listReposTool.definition.name).toBe("list_repos");
		});

		it("should not require any parameters", () => {
			expect(listReposTool.definition.parameters.required).toBeUndefined();
		});
	});

	describe("handler", () => {
		it("should fail when no installations found", async () => {
			const ctx = createMockToolContext();
			const result = await listReposTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("No GitHub installations");
		});

		it("should fail when GitHub App is not configured", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValueOnce({ appId: -1 } as never);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ installationId: 42, name: "acme" },
			] as never);

			const result = await listReposTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("not configured");
		});

		it("should list repos from installations", async () => {
			vi.mocked(fetchInstallationRepositories).mockResolvedValueOnce(["acme/docs", "acme/api"]);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ installationId: 42, name: "acme" },
			] as never);

			const result = await listReposTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("2 accessible repositories");
			expect(result.content).toContain("acme/docs");
			expect(result.content).toContain("acme/api");
		});

		it("should report when no repos found in installations", async () => {
			vi.mocked(fetchInstallationRepositories).mockResolvedValueOnce([]);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ installationId: 42, name: "acme" },
			] as never);

			const result = await listReposTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("No repositories found");
		});

		it("should skip installations without installationId", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ name: "acme" }, // no installationId
			] as never);

			const result = await listReposTool.handler({}, ctx);

			// No fetchInstallationRepositories call should be made
			expect(fetchInstallationRepositories).not.toHaveBeenCalled();
			expect(result.success).toBe(true);
			expect(result.content).toContain("No repositories found");
		});

		it("should handle errors gracefully", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockRejectedValueOnce(new Error("DB error"));

			const result = await listReposTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Failed");
			expect(result.content).toContain("DB error");
		});

		it("should handle non-array result from fetchInstallationRepositories", async () => {
			vi.mocked(fetchInstallationRepositories).mockResolvedValueOnce("not-an-array" as never);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ installationId: 42, name: "acme" },
			] as never);

			const result = await listReposTool.handler({}, ctx);

			expect(result.success).toBe(true);
			expect(result.content).toContain("No repositories found");
		});

		it("should return null app as not configured", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValueOnce(null as never);

			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockResolvedValueOnce([
				{ installationId: 42, name: "acme" },
			] as never);

			const result = await listReposTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("not configured");
		});

		it("should handle non-Error objects in catch block", async () => {
			const ctx = createMockToolContext();
			vi.mocked(ctx.githubInstallationDao.listInstallations).mockRejectedValueOnce("string error");

			const result = await listReposTool.handler({}, ctx);

			expect(result.success).toBe(false);
			expect(result.content).toContain("Unknown error");
		});
	});
});
