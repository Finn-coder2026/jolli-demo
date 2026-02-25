/**
 * Tests for shared GitHub tool utilities.
 */

import type { IntegrationDao } from "../../dao/IntegrationDao";
import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import { createMockIntegrationDao } from "./AgentHubToolTestUtils";
import { findGitHubIntegration, getAccessTokenForIntegration, isValidFilePath } from "./GitHubToolUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn(),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	getAccessTokenForGitHubAppInstallation: vi.fn(),
}));

describe("GitHubToolUtils", () => {
	let mockIntegrationDao: IntegrationDao;

	beforeEach(() => {
		vi.clearAllMocks();
		mockIntegrationDao = createMockIntegrationDao();
		vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: 123, privateKey: "key" } as never);
		vi.mocked(getAccessTokenForGitHubAppInstallation).mockResolvedValue("mock-token");
	});

	describe("getAccessTokenForIntegration", () => {
		it("returns token for valid installation", async () => {
			const token = await getAccessTokenForIntegration({
				repo: "acme/docs",
				branch: "main",
				features: [],
				installationId: 42,
			});
			expect(token).toBe("mock-token");
		});

		it("returns undefined when installationId is missing", async () => {
			const token = await getAccessTokenForIntegration({
				repo: "acme/docs",
				branch: "main",
				features: [],
			});
			expect(token).toBeUndefined();
		});

		it("returns undefined when GitHub app is null", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValue(null as never);
			const token = await getAccessTokenForIntegration({
				repo: "acme/docs",
				branch: "main",
				features: [],
				installationId: 42,
			});
			expect(token).toBeUndefined();
		});

		it("returns undefined when GitHub app has negative appId", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValue({ appId: -1 } as never);
			const token = await getAccessTokenForIntegration({
				repo: "acme/docs",
				branch: "main",
				features: [],
				installationId: 42,
			});
			expect(token).toBeUndefined();
		});
	});

	describe("findGitHubIntegration", () => {
		it("returns matching integration with correct branch", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "develop", features: [], installationId: 42 },
				},
			] as never);

			const result = await findGitHubIntegration(mockIntegrationDao, "acme/docs");

			expect(result).toEqual({
				accessToken: "mock-token",
				branch: "develop",
				integrationId: 10,
			});
		});

		it("defaults branch to main when integration has no branch", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: undefined, features: [], installationId: 42 },
				},
			] as never);

			const result = await findGitHubIntegration(mockIntegrationDao, "acme/docs");

			expect(result?.branch).toBe("main");
		});

		it("falls back to any active GitHub integration when no exact match", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 20,
					type: "github",
					status: "active",
					name: "acme/other-repo",
					metadata: { repo: "acme/other-repo", branch: "develop", features: [], installationId: 99 },
				},
			] as never);

			const result = await findGitHubIntegration(mockIntegrationDao, "acme/docs");

			expect(result).toEqual({
				accessToken: "mock-token",
				branch: "main",
				integrationId: 20,
			});
		});

		it("returns undefined when no integrations exist", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await findGitHubIntegration(mockIntegrationDao, "acme/docs");

			expect(result).toBeUndefined();
		});

		it("returns undefined when matching integration has no token", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValue(null as never);
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 42 },
				},
			] as never);

			const result = await findGitHubIntegration(mockIntegrationDao, "acme/docs");

			expect(result).toBeUndefined();
		});

		it("returns undefined when fallback integration has no token", async () => {
			vi.mocked(getCoreJolliGithubApp).mockReturnValue(null as never);
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 20,
					type: "github",
					status: "active",
					name: "acme/other",
					metadata: { repo: "acme/other", branch: "main", features: [], installationId: 99 },
				},
			] as never);

			const result = await findGitHubIntegration(mockIntegrationDao, "acme/docs");

			expect(result).toBeUndefined();
		});

		it("skips inactive integrations", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "inactive",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 42 },
				},
			] as never);

			const result = await findGitHubIntegration(mockIntegrationDao, "acme/docs");

			expect(result).toBeUndefined();
		});

		it("skips non-github integrations", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "slack",
					status: "active",
					name: "My Slack",
					metadata: {},
				},
			] as never);

			const result = await findGitHubIntegration(mockIntegrationDao, "acme/docs");

			expect(result).toBeUndefined();
		});
	});

	describe("isValidFilePath", () => {
		it("accepts normal relative paths", () => {
			expect(isValidFilePath("docs/readme.md")).toBe(true);
			expect(isValidFilePath("README.md")).toBe(true);
			expect(isValidFilePath("src/components/App.tsx")).toBe(true);
		});

		it("accepts paths with dots in filenames", () => {
			expect(isValidFilePath("docs/v2.0/readme.md")).toBe(true);
			expect(isValidFilePath(".github/workflows/ci.yml")).toBe(true);
		});

		it("rejects paths with path traversal sequences", () => {
			expect(isValidFilePath("../etc/passwd")).toBe(false);
			expect(isValidFilePath("docs/../../secret.md")).toBe(false);
			expect(isValidFilePath("..")).toBe(false);
		});

		it("rejects absolute paths", () => {
			expect(isValidFilePath("/etc/passwd")).toBe(false);
			expect(isValidFilePath("/docs/readme.md")).toBe(false);
		});
	});
});
