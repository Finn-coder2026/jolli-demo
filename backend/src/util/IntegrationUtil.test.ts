import type { IntegrationDao } from "../dao/IntegrationDao";
import type { GitHubApp } from "../model/GitHubApp";
import * as GitHubAppModel from "../model/GitHubApp";
import { mockGitHubApp } from "../model/GitHubApp.mock";
import type { GithubRepoIntegration, Integration } from "../model/Integration";
import * as GithubAppUtil from "./GithubAppUtil";
import {
	cleanupOrphanedGitHubIntegrations,
	getAccessTokenForGithubRepoIntegration,
	lookupGithubRepoIntegration,
} from "./IntegrationUtil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("IntegrationUtil", () => {
	let mockGetAccessTokenForGitHubAppInstallation: ReturnType<typeof vi.fn>;

	const mockApp: GitHubApp = mockGitHubApp({
		appId: 12345,
		slug: "test-app",
		clientId: "client123",
		clientSecret: "secret123",
		webhookSecret: "webhook123",
		privateKey: "private-key",
		name: "Test App",
		htmlUrl: "https://github.com/apps/test-app",
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetAccessTokenForGitHubAppInstallation = vi.fn();
		vi.spyOn(GithubAppUtil, "getAccessTokenForGitHubAppInstallation").mockImplementation(
			mockGetAccessTokenForGitHubAppInstallation,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getAccessTokenForGithubRepoIntegration", () => {
		it("should successfully get access token for valid integration", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue("test-access-token");

			const result = await getAccessTokenForGithubRepoIntegration(mockIntegration);

			expect(result).toBe("test-access-token");
			expect(mockGetAccessTokenForGitHubAppInstallation).toHaveBeenCalledWith(mockApp, 67890);
		});

		it("should throw error when app returns null", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(null as unknown as GitHubApp);
			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"GitHub App not found for integration",
			);
		});

		it("should throw error when metadata is missing repo field", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"Invalid GitHub repo integration metadata",
			);

			expect(mockGetAccessTokenForGitHubAppInstallation).not.toHaveBeenCalled();
		});

		it("should throw error when metadata is missing branch field", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"Invalid GitHub repo integration metadata",
			);
		});

		it("should throw error when metadata is missing features field", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"Invalid GitHub repo integration metadata",
			);
		});

		it("should throw error when metadata is null", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"Invalid GitHub repo integration metadata",
			);
		});

		it("should throw error when metadata is undefined", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"Invalid GitHub repo integration metadata",
			);
		});

		it("should throw error when metadata is not an object", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: "not-an-object",
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"Invalid GitHub repo integration metadata",
			);
		});

		it("should throw error when installationId is missing", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"GitHub App installation ID is missing in integration metadata",
			);

			expect(mockGetAccessTokenForGitHubAppInstallation).not.toHaveBeenCalled();
		});

		it("should throw error when installationId is not a number", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: "not-a-number",
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"GitHub App installation ID is missing in integration metadata",
			);
		});

		it("should throw error when installationId is null", async () => {
			const mockIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: null,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			} as unknown as GithubRepoIntegration;

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"GitHub App installation ID is missing in integration metadata",
			);
		});

		it("should throw error when access token fetch fails", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue(undefined);

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"Failed to get access token for GitHub App installation ID 67890",
			);

			expect(mockGetAccessTokenForGitHubAppInstallation).toHaveBeenCalledWith(mockApp, 67890);
		});

		it("should throw error when access token fetch returns null", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue(null);

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration)).rejects.toThrow(
				"Failed to get access token for GitHub App installation ID 67890",
			);
		});

		it("should handle different installation IDs correctly", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: 99999,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue("different-token");

			const result = await getAccessTokenForGithubRepoIntegration(mockIntegration);

			expect(result).toBe("different-token");
			expect(mockGetAccessTokenForGitHubAppInstallation).toHaveBeenCalledWith(mockApp, 99999);
		});

		it("should work with zero as installation ID", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: 0,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue("token-for-zero");

			const result = await getAccessTokenForGithubRepoIntegration(mockIntegration);

			expect(result).toBe("token-for-zero");
			expect(mockGetAccessTokenForGitHubAppInstallation).toHaveBeenCalledWith(mockApp, 0);
		});

		it("should return repo details when withRepoDetails is true", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "myorg/myrepo",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue("test-access-token");

			const result = await getAccessTokenForGithubRepoIntegration(mockIntegration, true);

			expect(result).toEqual({
				accessToken: "test-access-token",
				owner: "myorg",
				repo: "myrepo",
			});
			expect(mockGetAccessTokenForGitHubAppInstallation).toHaveBeenCalledWith(mockApp, 67890);
		});

		it("should throw error when repo format is invalid with withRepoDetails", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "invalid-format",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue("test-access-token");

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration, true)).rejects.toThrow(
				"Invalid repo format in integration metadata; expected 'owner/repo'",
			);
		});

		it("should handle empty repo string with withRepoDetails", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue("test-access-token");

			await expect(getAccessTokenForGithubRepoIntegration(mockIntegration, true)).rejects.toThrow(
				"Invalid repo format in integration metadata; expected 'owner/repo'",
			);
		});

		it("should handle repo with multiple slashes correctly", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo/with/extra/slashes",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			mockGetAccessTokenForGitHubAppInstallation.mockResolvedValue("test-access-token");

			const result = await getAccessTokenForGithubRepoIntegration(mockIntegration, true);

			// Should only split on the first slash
			expect(result).toEqual({
				accessToken: "test-access-token",
				owner: "owner",
				repo: "repo",
			});
		});
	});

	describe("lookupGithubRepoIntegration", () => {
		it("should successfully lookup an integration", async () => {
			const mockIntegration: GithubRepoIntegration = {
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push", "pr"],
					installationId: 67890,
					githubAppId: 12345,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(mockApp);
			const mockDao: IntegrationDao = {
				lookupIntegration: vi.fn().mockResolvedValue(mockIntegration),
			} as unknown as IntegrationDao;

			const result = await lookupGithubRepoIntegration(mockDao, 1);

			expect(result).toBe(mockIntegration);
			expect(mockDao.lookupIntegration).toHaveBeenCalledWith(1);
		});

		it("should return undefined when integration is not found", async () => {
			const mockDao: IntegrationDao = {
				lookupIntegration: vi.fn().mockResolvedValue(undefined),
			} as unknown as IntegrationDao;

			const result = await lookupGithubRepoIntegration(mockDao, 999);

			expect(result).toBeUndefined();
			expect(mockDao.lookupIntegration).toHaveBeenCalledWith(999);
		});
	});

	describe("cleanupOrphanedGitHubIntegrations", () => {
		it("should delete orphaned integrations", async () => {
			const validInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const validIntegration: Integration = {
				id: 10,
				type: "github",
				name: "test-org/repo1",
				status: "active",
				metadata: { repo: "test-org/repo1", installationId: 100, branch: "main", features: [] },
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const orphanedIntegration: Integration = {
				id: 11,
				type: "github",
				name: "orphaned/repo",
				status: "active",
				metadata: { repo: "orphaned/repo", installationId: 999, branch: "main", features: [] },
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockDeleteIntegration = vi.fn().mockResolvedValue({ result: orphanedIntegration });
			const mockIntegrationsManager = {
				deleteIntegration: mockDeleteIntegration,
			} as unknown as import("../integrations/IntegrationsManager").IntegrationsManager;

			const deletedCount = await cleanupOrphanedGitHubIntegrations(
				mockIntegrationsManager,
				[validInstallation],
				[validIntegration, orphanedIntegration],
			);

			expect(deletedCount).toBe(1);
			expect(mockDeleteIntegration).toHaveBeenCalledWith(orphanedIntegration);
			expect(mockDeleteIntegration).not.toHaveBeenCalledWith(validIntegration);
		});

		it("should not delete non-GitHub integrations", async () => {
			const validInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const gitlabIntegration: Integration = {
				id: 20,
				type: "unknown",
				name: "gitlab-repo",
				status: "active",
				metadata: { repo: "gitlab/repo", installationId: 999, branch: "main", features: [] },
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockDeleteIntegration = vi.fn().mockResolvedValue({ result: {} });
			const mockIntegrationsManager = {
				deleteIntegration: mockDeleteIntegration,
			} as unknown as import("../integrations/IntegrationsManager").IntegrationsManager;

			const deletedCount = await cleanupOrphanedGitHubIntegrations(
				mockIntegrationsManager,
				[validInstallation],
				[gitlabIntegration],
			);

			expect(deletedCount).toBe(0);
			expect(mockDeleteIntegration).not.toHaveBeenCalled();
		});

		it("should not delete active integrations without installationId", async () => {
			const validInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const integrationWithoutInstallationId: Integration = {
				id: 30,
				type: "github",
				name: "no-installation-id",
				status: "active",
				metadata: { repo: "test/repo", branch: "main", features: [] },
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockDeleteIntegration = vi.fn().mockResolvedValue({ result: {} });
			const mockIntegrationsManager = {
				deleteIntegration: mockDeleteIntegration,
			} as unknown as import("../integrations/IntegrationsManager").IntegrationsManager;

			const deletedCount = await cleanupOrphanedGitHubIntegrations(
				mockIntegrationsManager,
				[validInstallation],
				[integrationWithoutInstallationId],
			);

			expect(deletedCount).toBe(0);
			expect(mockDeleteIntegration).not.toHaveBeenCalled();
		});

		it("should delete integrations without installationId that have needs_repo_access status", async () => {
			const validInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const integrationWithoutInstallationId: Integration = {
				id: 30,
				type: "github",
				name: "no-installation-id",
				status: "needs_repo_access",
				metadata: { repo: "test/repo", branch: "main", features: [] },
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockDeleteIntegration = vi.fn().mockResolvedValue({ result: integrationWithoutInstallationId });
			const mockIntegrationsManager = {
				deleteIntegration: mockDeleteIntegration,
			} as unknown as import("../integrations/IntegrationsManager").IntegrationsManager;

			const deletedCount = await cleanupOrphanedGitHubIntegrations(
				mockIntegrationsManager,
				[validInstallation],
				[integrationWithoutInstallationId],
			);

			expect(deletedCount).toBe(1);
			expect(mockDeleteIntegration).toHaveBeenCalledWith(integrationWithoutInstallationId);
		});

		it("should delete integrations without installationId that have error status", async () => {
			const validInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const integrationWithoutInstallationId: Integration = {
				id: 31,
				type: "github",
				name: "error-repo",
				status: "error",
				metadata: { repo: "test/error-repo", branch: "main", features: [] },
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockDeleteIntegration = vi.fn().mockResolvedValue({ result: integrationWithoutInstallationId });
			const mockIntegrationsManager = {
				deleteIntegration: mockDeleteIntegration,
			} as unknown as import("../integrations/IntegrationsManager").IntegrationsManager;

			const deletedCount = await cleanupOrphanedGitHubIntegrations(
				mockIntegrationsManager,
				[validInstallation],
				[integrationWithoutInstallationId],
			);

			expect(deletedCount).toBe(1);
			expect(mockDeleteIntegration).toHaveBeenCalledWith(integrationWithoutInstallationId);
		});

		it("should not delete pending_installation integrations without installationId", async () => {
			const validInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const pendingIntegration: Integration = {
				id: 32,
				type: "github",
				name: "pending-repo",
				status: "pending_installation",
				metadata: { repo: "test/pending-repo", branch: "main", features: [] },
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockDeleteIntegration = vi.fn().mockResolvedValue({ result: {} });
			const mockIntegrationsManager = {
				deleteIntegration: mockDeleteIntegration,
			} as unknown as import("../integrations/IntegrationsManager").IntegrationsManager;

			const deletedCount = await cleanupOrphanedGitHubIntegrations(
				mockIntegrationsManager,
				[validInstallation],
				[pendingIntegration],
			);

			expect(deletedCount).toBe(0);
			expect(mockDeleteIntegration).not.toHaveBeenCalled();
		});

		it("should return 0 when no orphaned integrations exist", async () => {
			const validInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const validIntegration: Integration = {
				id: 10,
				type: "github",
				name: "test-org/repo1",
				status: "active",
				metadata: { repo: "test-org/repo1", installationId: 100, branch: "main", features: [] },
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockDeleteIntegration = vi.fn().mockResolvedValue({ result: {} });
			const mockIntegrationsManager = {
				deleteIntegration: mockDeleteIntegration,
			} as unknown as import("../integrations/IntegrationsManager").IntegrationsManager;

			const deletedCount = await cleanupOrphanedGitHubIntegrations(
				mockIntegrationsManager,
				[validInstallation],
				[validIntegration],
			);

			expect(deletedCount).toBe(0);
			expect(mockDeleteIntegration).not.toHaveBeenCalled();
		});

		it("should handle empty installations and integrations", async () => {
			const mockDeleteIntegration = vi.fn().mockResolvedValue({ result: {} });
			const mockIntegrationsManager = {
				deleteIntegration: mockDeleteIntegration,
			} as unknown as import("../integrations/IntegrationsManager").IntegrationsManager;

			const deletedCount = await cleanupOrphanedGitHubIntegrations(mockIntegrationsManager, [], []);

			expect(deletedCount).toBe(0);
			expect(mockDeleteIntegration).not.toHaveBeenCalled();
		});
	});
});
