import type { Database } from "../core/Database";
import { mockDatabase } from "../core/Database.mock";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import { mockGitHubInstallationDao } from "../dao/GitHubInstallationDao.mock";
import { createIntegrationTypeBehavior } from "../integrations/GithubIntegrationTypeBehavior";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { createMockIntegrationsManager } from "../integrations/IntegrationsManager.mock";
import type { Integration } from "../model/Integration";
import { mockIntegration } from "../model/Integration.mock";
import { createTenantOrgContext, runWithTenantContext } from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import type { IntegrationTypeBehavior } from "../types/IntegrationTypes";
import * as GithubAppUtil from "../util/GithubAppUtil";
import type { GithubRepoIntegrationMetadata, Org, Tenant } from "jolli-common";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GithubIntegrationTypeBehavior", () => {
	let mockManager: IntegrationsManager;
	let mockInstallationDao: GitHubInstallationDao;
	let mockDb: Database;
	let githubBehavior: IntegrationTypeBehavior;

	beforeEach(() => {
		global.fetch = vi.fn();
		mockManager = createMockIntegrationsManager();
		mockInstallationDao = mockGitHubInstallationDao();
		mockDb = mockDatabase({
			githubInstallationDao: mockInstallationDao,
		});
		githubBehavior = createIntegrationTypeBehavior(mockDb, mockManager);
	});

	describe("handleAccessCheck", () => {
		async function checkAccessForIntegration(integration: Integration) {
			const integrationTypeBehavior = githubBehavior;
			expect(integrationTypeBehavior.handleAccessCheck).toBeDefined();
			return await integrationTypeBehavior.handleAccessCheck(integration, { manager: mockManager });
		}

		describe("validation", () => {
			it("should return error when integration does not support access checks (not github type)", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "unknown",
					metadata: undefined,
				});

				const response = await checkAccessForIntegration(integration);

				expect(response.error).toEqual({
					code: 400,
					reason: "Integration does not support access checks",
				});
			});

			it("should return error when integration missing metadata", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					metadata: undefined,
				});

				const response = await checkAccessForIntegration(integration);

				expect(response.error).toEqual({
					code: 400,
					reason: "Integration does not support access checks",
				});
			});

			it("should return error when integration missing repo in metadata", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					metadata: {
						repo: "",
						branch: "main",
						features: ["push"],
					},
				});

				const response = await checkAccessForIntegration(integration);

				expect(response.error).toEqual({
					code: 400,
					reason: "Integration does not support access checks",
				});
			});
		});

		describe("access checks", () => {
			it("should mark integration as active when repository has access", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					status: "needs_repo_access",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						features: ["push"],
						githubAppId: 12345,
						accessError: "repoNotAccessibleByApp",
					},
				});
				mockManager.updateIntegration = vi.fn().mockResolvedValue({
					...integration,
					status: "active",
				});

				vi.spyOn(jwt, "sign").mockReturnValue("fake-jwt-token" as unknown as undefined);

				global.fetch = vi
					.fn()
					.mockResolvedValueOnce({
						ok: true,
						json: async () => [{ id: 789 }],
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ token: "installation-token" }),
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({
							repositories: [{ full_name: "owner/repo" }],
						}),
					});

				const response = await checkAccessForIntegration(integration);

				expect(response.result).toEqual({ hasAccess: true, status: "active" });
				expect(mockManager.updateIntegration).toHaveBeenCalledWith(
					integration,
					expect.objectContaining({
						status: "active",
						metadata: expect.objectContaining({
							repo: "owner/repo",
							lastAccessCheck: expect.any(String),
						}),
					}),
				);

				const updateCall = (mockManager.updateIntegration as ReturnType<typeof vi.fn>).mock.calls[0][1];
				expect(updateCall.metadata.accessError).toBeUndefined();

				vi.restoreAllMocks();
			});

			it("should mark integration as needs_repo_access when repository does not have access", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					status: "active",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						features: ["push"],
						githubAppId: 12345,
					},
				});
				mockManager.updateIntegration = vi.fn().mockResolvedValue({
					...integration,
					status: "needs_repo_access",
				});

				vi.spyOn(jwt, "sign").mockReturnValue("fake-jwt-token" as unknown as undefined);

				global.fetch = vi
					.fn()
					.mockResolvedValueOnce({
						ok: true,
						json: async () => [{ id: 789 }],
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ token: "installation-token" }),
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({
							repositories: [{ full_name: "owner/other-repo" }],
						}),
					});

				const response = await checkAccessForIntegration(integration);

				expect(response.result).toEqual({ hasAccess: false, status: "needs_repo_access" });
				expect(mockManager.updateIntegration).toHaveBeenCalledWith(
					integration,
					expect.objectContaining({
						status: "needs_repo_access",
						metadata: expect.objectContaining({
							repo: "owner/repo",
							lastAccessCheck: expect.any(String),
							accessError: "repoNotAccessibleByApp",
						}),
					}),
				);

				vi.restoreAllMocks();
			});
		});

		describe("error handling", () => {
			it("should mark integration as needs_repo_access when access check throws error", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						features: ["push"],
						githubAppId: 12345,
					},
				});
				mockManager.updateIntegration = vi.fn().mockResolvedValue({
					...integration,
					status: "needs_repo_access",
				});

				vi.spyOn(jwt, "sign").mockImplementation(() => {
					throw new Error("JWT signing failed");
				});

				const response = await checkAccessForIntegration(integration);

				expect(response.result).toEqual({ hasAccess: false, status: "needs_repo_access" });
				expect(mockManager.updateIntegration).toHaveBeenCalledWith(
					integration,
					expect.objectContaining({ status: "needs_repo_access" }),
				);

				vi.restoreAllMocks();
			});

			it("should handle installations list fetch failure during check-access", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					status: "needs_repo_access",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						features: ["push"],
						githubAppId: 12345,
					},
				});
				mockManager.updateIntegration = vi.fn().mockResolvedValue({
					...integration,
					status: "needs_repo_access",
				});

				vi.spyOn(jwt, "sign").mockReturnValue("fake-jwt-token" as unknown as undefined);

				global.fetch = vi.fn().mockResolvedValueOnce({
					ok: false,
					status: 403,
				});

				const response = await checkAccessForIntegration(integration);

				expect(response.result).toEqual({ hasAccess: false, status: "needs_repo_access" });

				vi.restoreAllMocks();
			});

			it("should handle installation token fetch failure and skip that installation", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					status: "needs_repo_access",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						features: ["push"],
						githubAppId: 12345,
					},
				});
				mockManager.updateIntegration = vi.fn().mockResolvedValue({
					...integration,
					status: "needs_repo_access",
				});

				vi.spyOn(jwt, "sign").mockReturnValue("fake-jwt-token" as unknown as undefined);

				global.fetch = vi
					.fn()
					.mockResolvedValueOnce({
						ok: true,
						json: async () => [{ id: 789 }],
					})
					.mockResolvedValueOnce({
						ok: false,
						status: 403,
					});

				const response = await checkAccessForIntegration(integration);

				expect(response.result).toEqual({ hasAccess: false, status: "needs_repo_access" });

				vi.restoreAllMocks();
			});

			it("should handle repositories fetch failure and skip that installation", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					status: "needs_repo_access",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						features: ["push"],
						githubAppId: 12345,
					},
				});
				mockManager.updateIntegration = vi.fn().mockResolvedValue({
					...integration,
					status: "needs_repo_access",
				});

				vi.spyOn(jwt, "sign").mockReturnValue("fake-jwt-token" as unknown as undefined);

				global.fetch = vi
					.fn()
					.mockResolvedValueOnce({
						ok: true,
						json: async () => [{ id: 789 }],
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ token: "installation-token" }),
					})
					.mockResolvedValueOnce({
						ok: false,
						status: 403,
					});

				const response = await checkAccessForIntegration(integration);

				expect(response.result).toEqual({ hasAccess: false, status: "needs_repo_access" });

				vi.restoreAllMocks();
			});

			it("should handle repositories fetch with missing repositories field", async () => {
				const integration = mockIntegration({
					id: 1,
					type: "github",
					status: "needs_repo_access",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						features: ["push"],
						githubAppId: 12345,
					},
				});
				mockManager.updateIntegration = vi.fn().mockResolvedValue({
					...integration,
					status: "needs_repo_access",
				});

				vi.spyOn(jwt, "sign").mockReturnValue("fake-jwt-token" as unknown as undefined);

				global.fetch = vi
					.fn()
					.mockResolvedValueOnce({
						ok: true,
						json: async () => [{ id: 789 }],
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ token: "installation-token" }),
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({}),
					});

				const response = await checkAccessForIntegration(integration);

				expect(response.result).toEqual({ hasAccess: false, status: "needs_repo_access" });

				vi.restoreAllMocks();
			});
		});
	});

	describe("getJobDefinitions", () => {
		it("should return 5 job definitions for GitHub webhook events", () => {
			const integrationTypeBehavior = githubBehavior;
			expect(integrationTypeBehavior.getJobDefinitions).toBeDefined();

			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.();

			expect(jobDefinitions).toHaveLength(4);
			expect(jobDefinitions?.map(j => j.name)).toEqual([
				"github:handle-installation-created",
				"github:handle-installation-deleted",
				"github:handle-repositories-added",
				"github:handle-repositories-removed",
			]);
		});

		it("should define correct trigger events for each job", () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];

			const createdJob = jobDefinitions.find(j => j.name === "github:handle-installation-created");
			expect(createdJob?.triggerEvents).toEqual(["github:installation:created"]);

			const deletedJob = jobDefinitions.find(j => j.name === "github:handle-installation-deleted");
			expect(deletedJob?.triggerEvents).toEqual(["github:installation:deleted"]);

			const addedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-added");
			expect(addedJob?.triggerEvents).toEqual(["github:installation_repositories:added"]);

			const removedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-removed");
			expect(removedJob?.triggerEvents).toEqual(["github:installation_repositories:removed"]);
		});

		it("should all have category 'github'", () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];

			for (const job of jobDefinitions) {
				expect(job.category).toBe("github");
			}
		});

		it("should execute installation created job handler", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);
			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const createdJob = jobDefinitions.find(j => j.name === "github:handle-installation-created");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-created",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories: [],
			};

			await createdJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalled();
			expect(syncSpy).toHaveBeenCalled();
			syncSpy.mockRestore();
		});

		it("should execute installation created job handler and heal broken integrations", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const brokenIntegration = {
				id: 1,
				type: "github" as const,
				name: "owner/repo1",
				enabled: true,
				status: "needs_repo_access" as const,
				metadata: {
					repo: "owner/repo1",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					accessError: "appInstallationUninstalled",
					lastAccessCheck: "2024-01-01T00:00:00.000Z",
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockManager.listIntegrations = vi.fn().mockResolvedValue([brokenIntegration]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const createdJob = jobDefinitions.find(j => j.name === "github:handle-installation-created");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-created",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories: [],
			};

			await createdJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalled();
			expect(syncSpy).toHaveBeenCalled();
			expect(mockManager.updateIntegration).toHaveBeenCalled();
			// Verify the integration was healed with the new installationId
			expect(mockManager.updateIntegration).toHaveBeenCalledWith(
				brokenIntegration,
				expect.objectContaining({
					status: "active",
					metadata: expect.objectContaining({
						installationId: 123,
					}),
				}),
			);
			syncSpy.mockRestore();
		});

		it("should handle installation created with missing installation ID", async () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const createdJob = jobDefinitions.find(j => j.name === "github:handle-installation-created");

			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-created",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { app_id: 456 }, // Missing id
				repositories: [],
			};

			await createdJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalledWith(
				"missing-installation-info",
				{ eventType: "installation.created" },
				"warn",
			);
			expect(mockManager.updateIntegration).not.toHaveBeenCalled();
		});

		it("should execute installation deleted job handler with affected integrations", async () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const deletedJob = jobDefinitions.find(j => j.name === "github:handle-installation-deleted");

			const mockInst = {
				id: 1,
				name: "test-org",
				appId: 456,
				installationId: 123,
				repos: ["owner/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInteg = {
				id: 1,
				type: "github" as const,
				name: "owner/repo1",
				enabled: true,
				status: "active" as const,
				metadata: {
					repo: "owner/repo1",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(mockInst);
			mockInstallationDao.updateInstallation = vi.fn().mockResolvedValue(undefined);
			mockManager.listIntegrations = vi.fn().mockResolvedValue([mockInteg]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-deleted",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
			};

			await deletedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalled();
			expect(mockInstallationDao.updateInstallation).toHaveBeenCalled();
			expect(mockManager.updateIntegration).toHaveBeenCalled();
		});

		it("should handle installation deleted with missing installation ID", async () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const deletedJob = jobDefinitions.find(j => j.name === "github:handle-installation-deleted");

			mockInstallationDao.updateInstallation = vi.fn().mockResolvedValue(undefined);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-deleted",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { app_id: 456 }, // Missing id
			};

			await deletedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalledWith(
				"missing-installation-info",
				{ eventType: "installation.deleted" },
				"warn",
			);
			expect(mockInstallationDao.updateInstallation).not.toHaveBeenCalled();
		});

		it("should handle installation deleted when installation not found", async () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const deletedJob = jobDefinitions.find(j => j.name === "github:handle-installation-deleted");

			mockInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(undefined);
			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-deleted",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 999, app_id: 456 },
			};

			await deletedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalledWith("installation-not-found", { installationId: 999 }, "warn");
		});

		it("should delete installation mapping from registry when registryClient is provided", async () => {
			const mockRegistryClient = {
				deleteInstallationMapping: vi.fn().mockResolvedValue(undefined),
			} as unknown as TenantRegistryClient;

			const behaviorWithRegistry = createIntegrationTypeBehavior(mockDb, mockManager, mockRegistryClient);
			const jobDefinitions = behaviorWithRegistry.getJobDefinitions?.() || [];
			const deletedJob = jobDefinitions.find(j => j.name === "github:handle-installation-deleted");

			mockInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(undefined);
			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-deleted",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await deletedJob?.handler({ installation: { id: 123, app_id: 456 } }, mockContext);

			expect(mockRegistryClient.deleteInstallationMapping).toHaveBeenCalledWith(123);
			expect(mockContext.log).toHaveBeenCalledWith(
				"installation-mapping-deleted",
				{ installationId: 123 },
				"info",
			);
		});

		it("should log warning when registryClient.deleteInstallationMapping fails", async () => {
			const mockRegistryClient = {
				deleteInstallationMapping: vi.fn().mockRejectedValue(new Error("Registry unavailable")),
			} as unknown as TenantRegistryClient;

			const behaviorWithRegistry = createIntegrationTypeBehavior(mockDb, mockManager, mockRegistryClient);
			const jobDefinitions = behaviorWithRegistry.getJobDefinitions?.() || [];
			const deletedJob = jobDefinitions.find(j => j.name === "github:handle-installation-deleted");

			mockInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(undefined);
			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-deleted",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			// Should not throw - error is caught and logged
			await deletedJob?.handler({ installation: { id: 123, app_id: 456 } }, mockContext);

			expect(mockRegistryClient.deleteInstallationMapping).toHaveBeenCalledWith(123);
			// The mapping-deleted log should NOT have been called since it failed
			expect(mockContext.log).not.toHaveBeenCalledWith("installation-mapping-deleted", expect.anything(), "info");
		});

		it("should execute repositories added job handler", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const addedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-added");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-added",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories_added: [],
			};

			await addedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalled();
			expect(syncSpy).toHaveBeenCalled();
			syncSpy.mockRestore();
		});

		it("should handle repositories added with missing installation ID", async () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const addedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-added");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-added",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { app_id: 456 }, // Missing id
				repositories_added: [],
			};

			await addedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalledWith(
				"missing-installation-info",
				{ eventType: "installation_repositories.added" },
				"warn",
			);
		});

		it("should execute repositories removed job handler with affected integrations", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const removedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-removed");

			const mockInteg = {
				id: 1,
				type: "github" as const,
				name: "owner/repo1",
				enabled: true,
				status: "active" as const,
				metadata: {
					repo: "owner/repo1",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockManager.listIntegrations = vi.fn().mockResolvedValue([mockInteg]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-removed",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories_removed: [{ full_name: "owner/repo1" }],
			};

			await removedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalled();
			expect(syncSpy).toHaveBeenCalled();
			expect(mockManager.updateIntegration).toHaveBeenCalled();
			syncSpy.mockRestore();
		});

		it("should handle repositories removed with missing installation ID", async () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const removedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-removed");

			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-removed",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { app_id: 456 }, // Missing id
				repositories_removed: [{ full_name: "owner/repo1" }],
			};

			await removedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalledWith(
				"missing-installation-info",
				{ eventType: "installation_repositories.removed" },
				"warn",
			);
			expect(mockManager.updateIntegration).not.toHaveBeenCalled();
		});

		it("should handle repositories removed when no integration found", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const removedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-removed");

			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-removed",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories_removed: [{ full_name: "owner/nonexistent-repo" }],
			};

			await removedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalledWith(
				"no-integration-found",
				{ repo: "owner/nonexistent-repo" },
				"info",
			);
			expect(mockManager.updateIntegration).not.toHaveBeenCalled();
			syncSpy.mockRestore();
		});

		it("should handle installation created with undefined repositories array", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const createdJob = jobDefinitions.find(j => j.name === "github:handle-installation-created");

			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-created",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				// repositories field is omitted to test the || [] fallback
			};

			await createdJob?.handler(payload, mockContext);

			expect(syncSpy).toHaveBeenCalled();
			syncSpy.mockRestore();
		});

		it("should handle installation created and heal integration with missing repo metadata", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const brokenIntegration = {
				id: 1,
				type: "github" as const,
				name: "unknown-repo",
				enabled: true,
				status: "needs_repo_access" as const,
				metadata: {
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					accessError: "appInstallationUninstalled",
					lastAccessCheck: "2024-01-01T00:00:00.000Z",
					// repo is undefined to trigger the || "unknown" fallback
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockManager.listIntegrations = vi.fn().mockResolvedValue([brokenIntegration]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const createdJob = jobDefinitions.find(j => j.name === "github:handle-installation-created");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-created",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories: [],
			};

			await createdJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalledWith(
				"integration-healed",
				{ integrationId: 1, repo: "unknown" },
				"info",
			);
			syncSpy.mockRestore();
		});

		it("should handle repositories added with undefined repositories_added array", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const addedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-added");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-added",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				// repositories_added field is omitted to test the || [] fallback
			};

			await addedJob?.handler(payload, mockContext);

			expect(syncSpy).toHaveBeenCalled();
			syncSpy.mockRestore();
		});

		it("should heal integrations when repositories are added back", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			// Create a broken integration that had its repo removed
			const brokenIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "needs_repo_access",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
					accessError: "repoRemovedFromInstallation",
					lastAccessCheck: "2024-01-01T00:00:00.000Z",
				},
			});

			mockManager.listIntegrations = vi.fn().mockResolvedValue([brokenIntegration]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const addedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-added");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-added",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories_added: [{ full_name: "owner/test-repo" }],
			};

			await addedJob?.handler(payload, mockContext);

			// Verify that the integration was healed
			expect(mockManager.updateIntegration).toHaveBeenCalledWith(
				brokenIntegration,
				expect.objectContaining({
					status: "active",
					metadata: expect.objectContaining({
						repo: "owner/test-repo",
						branch: "main",
						features: ["push"],
						githubAppId: 456,
						installationId: 123,
						lastAccessCheck: expect.any(String),
					}),
				}),
			);

			// Verify accessError was removed
			const updateCall = vi.mocked(mockManager.updateIntegration).mock.calls[0];
			const updatedMetadata = updateCall[1].metadata as GithubRepoIntegrationMetadata | undefined;
			expect(updatedMetadata?.accessError).toBeUndefined();

			// Verify healing was logged
			expect(mockContext.log).toHaveBeenCalledWith(
				"integration-healed",
				{ integrationId: 1, repo: "owner/test-repo" },
				"info",
			);

			syncSpy.mockRestore();
		});

		it("should not heal integrations for repos that were not added back", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			// Create a broken integration that had a different repo removed
			const brokenIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "needs_repo_access",
				metadata: {
					repo: "owner/different-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
					accessError: "repoRemovedFromInstallation",
				},
			});

			mockManager.listIntegrations = vi.fn().mockResolvedValue([brokenIntegration]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const addedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-added");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-added",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories_added: [{ full_name: "owner/test-repo" }], // Different repo
			};

			await addedJob?.handler(payload, mockContext);

			// Verify that the integration was NOT healed
			expect(mockManager.updateIntegration).not.toHaveBeenCalled();

			// Verify healing was not logged
			expect(mockContext.log).not.toHaveBeenCalledWith("integration-healed", expect.anything(), "info");

			syncSpy.mockRestore();
		});

		it("should heal integrations without repo metadata when healing", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			// Create a broken integration without repo metadata (edge case)
			const brokenIntegrationNoRepo = mockIntegration({
				id: 1,
				type: "github",
				status: "needs_repo_access",
				metadata: {
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
					accessError: "repoRemovedFromInstallation",
					repo: "",
				}, // Missing repo field
			});

			mockManager.listIntegrations = vi.fn().mockResolvedValue([brokenIntegrationNoRepo]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const addedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-added");

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-added",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};
			const payload = {
				installation: { id: 123, app_id: 456 },
				repositories_added: [{ full_name: "" }],
				repositories_removed: [],
			};

			await addedJob?.handler(payload, mockContext);

			// Should update integration without repo
			expect(mockManager.updateIntegration).toHaveBeenCalled();

			syncSpy.mockRestore();
		});

		it("should handle repositories removed with undefined repositories_removed array", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const removedJob = jobDefinitions.find(j => j.name === "github:handle-repositories-removed");

			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-repositories-removed",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
				// repositories_removed field is omitted to test the || [] fallback
			};

			await removedJob?.handler(payload, mockContext);

			expect(syncSpy).toHaveBeenCalled();
			syncSpy.mockRestore();
		});

		it("should handle installation deleted with integration missing repo metadata", async () => {
			const integrationTypeBehavior = githubBehavior;
			const jobDefinitions = integrationTypeBehavior.getJobDefinitions?.() || [];
			const deletedJob = jobDefinitions.find(j => j.name === "github:handle-installation-deleted");

			const mockInst = {
				id: 1,
				name: "test-org",
				appId: 456,
				installationId: 123,
				repos: ["owner/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInteg = {
				id: 1,
				type: "github" as const,
				name: "unknown-repo",
				enabled: true,
				status: "active" as const,
				metadata: {
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
					// repo is undefined to trigger the || "unknown" fallback
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(mockInst);
			mockInstallationDao.updateInstallation = vi.fn().mockResolvedValue(undefined);
			mockManager.listIntegrations = vi.fn().mockResolvedValue([mockInteg]);
			mockManager.updateIntegration = vi.fn().mockResolvedValue(undefined);

			const mockContext = {
				jobId: "test-job-id",
				jobName: "github:handle-installation-deleted",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			const payload = {
				installation: { id: 123, app_id: 456 },
			};

			await deletedJob?.handler(payload, mockContext);

			expect(mockContext.log).toHaveBeenCalledWith(
				"integration-disabled",
				{ integrationId: 1, repo: "unknown", reason: "app-uninstalled" },
				"warn",
			);
		});
	});

	describe("multi-tenant support", () => {
		function createMockTenant(overrides: Partial<Tenant> = {}): Tenant {
			return {
				id: "tenant-123",
				slug: "test-tenant",
				displayName: "Test Tenant",
				status: "active",
				deploymentType: "shared",
				databaseProviderId: "provider-123",
				configs: {},
				configsUpdatedAt: null,
				featureFlags: {},
				primaryDomain: null,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
				provisionedAt: new Date("2024-01-01"),
				...overrides,
			};
		}

		function createMockOrg(overrides: Partial<Org> = {}): Org {
			return {
				id: "org-123",
				tenantId: "tenant-123",
				slug: "default",
				displayName: "Default Org",
				schemaName: "org_default",
				status: "active",
				isDefault: true,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
				...overrides,
			};
		}

		function createMockJobContext() {
			return {
				jobId: "test-job-id",
				jobName: "test-job",
				log: vi.fn(),
				emitEvent: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};
		}

		it("should use tenant context database when available instead of defaultDb", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			// Create a separate installation DAO for the tenant database
			const tenantInstallationDao = mockGitHubInstallationDao();
			const tenantDb = mockDatabase({ githubInstallationDao: tenantInstallationDao });

			// Create behavior with an error-throwing proxy as defaultDb (simulates worker mode)
			const proxyDb = new Proxy({} as Database, {
				get(_target, prop) {
					throw new Error(`Attempted to access ${String(prop)} on mockDatabase outside of tenant context.`);
				},
			});

			const proxyBehavior = createIntegrationTypeBehavior(proxyDb, mockManager);
			const jobDefinitions = proxyBehavior.getJobDefinitions?.() || [];
			const createdJob = jobDefinitions.find(j => j.name === "github:handle-installation-created");

			const tenantContext = createTenantOrgContext(createMockTenant(), createMockOrg(), tenantDb);

			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			// Within tenant context, the handler should use the tenant database (not the proxy)
			await runWithTenantContext(tenantContext, async () => {
				await createdJob?.handler(
					{ installation: { id: 123, app_id: 456 }, repositories: [] },
					createMockJobContext(),
				);
			});

			// syncAllInstallationsForApp should have been called with the tenant's DAO
			expect(syncSpy).toHaveBeenCalledWith(expect.anything(), tenantInstallationDao);
			syncSpy.mockRestore();
		});

		it("should throw when using error-throwing proxy without tenant context", async () => {
			// Create behavior with an error-throwing proxy (simulates worker mode)
			const proxyDb = new Proxy({} as Database, {
				get(_target, prop) {
					throw new Error(`Attempted to access ${String(prop)} on mockDatabase outside of tenant context.`);
				},
			});

			const proxyBehavior = createIntegrationTypeBehavior(proxyDb, mockManager);
			const jobDefinitions = proxyBehavior.getJobDefinitions?.() || [];
			const createdJob = jobDefinitions.find(j => j.name === "github:handle-installation-created");

			// Without tenant context, accessing the proxy should throw
			await expect(
				createdJob?.handler(
					{ installation: { id: 123, app_id: 456 }, repositories: [] },
					createMockJobContext(),
				),
			).rejects.toThrow("Attempted to access githubInstallationDao on mockDatabase outside of tenant context.");
		});

		it("should use tenant context for all four job handlers", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);

			const tenantInstallationDao = mockGitHubInstallationDao();
			tenantInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(undefined);
			const tenantDb = mockDatabase({ githubInstallationDao: tenantInstallationDao });

			// Use error-throwing proxy to ensure handlers never touch it
			const proxyDb = new Proxy({} as Database, {
				get(_target, prop) {
					throw new Error(`Attempted to access ${String(prop)} on mockDatabase outside of tenant context.`);
				},
			});

			const proxyBehavior = createIntegrationTypeBehavior(proxyDb, mockManager);
			const jobDefinitions = proxyBehavior.getJobDefinitions?.() || [];
			const tenantContext = createTenantOrgContext(createMockTenant(), createMockOrg(), tenantDb);

			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const jobNames = [
				"github:handle-installation-created",
				"github:handle-installation-deleted",
				"github:handle-repositories-added",
				"github:handle-repositories-removed",
			];

			for (const jobName of jobNames) {
				const job = jobDefinitions.find(j => j.name === jobName);
				expect(job).toBeDefined();

				// Each handler should work within tenant context (not throw from proxy)
				await runWithTenantContext(tenantContext, async () => {
					await job?.handler(
						{
							installation: { id: 123, app_id: 456 },
							repositories: [],
							repositories_added: [],
							repositories_removed: [],
						},
						createMockJobContext(),
					);
				});
			}

			syncSpy.mockRestore();
		});
	});

	describe("preCreate", () => {
		it("should return true when no installationId or githubAppId in metadata", async () => {
			const newIntegration = {
				name: "test-repo",
				type: "github" as const,
				status: "active" as const,
				metadata: { repo: "owner/repo", branch: "main", features: [] },
			};

			const result = await githubBehavior.preCreate?.(newIntegration, { manager: mockManager });

			expect(result).toBe(true);
		});

		it("should delete other active GitHub integrations when creating new integration with installationId", async () => {
			const existingIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				name: "old-repo",
			});

			mockManager.listIntegrations = vi.fn().mockResolvedValue([existingIntegration]);
			mockManager.deleteIntegration = vi.fn().mockResolvedValue(undefined);

			const newIntegration = {
				name: "new-repo",
				type: "github" as const,
				status: "active" as const,
				metadata: {
					repo: "owner/new-repo",
					branch: "main",
					features: [],
					installationId: 123,
					githubAppId: 456,
				},
			};

			const result = await githubBehavior.preCreate?.(newIntegration, { manager: mockManager });

			expect(result).toBe(true);
			expect(mockManager.listIntegrations).toHaveBeenCalled();
			expect(mockManager.deleteIntegration).toHaveBeenCalledWith(existingIntegration);
		});

		it("should not delete integrations when no other active GitHub integrations exist", async () => {
			mockManager.listIntegrations = vi.fn().mockResolvedValue([]);
			mockManager.deleteIntegration = vi.fn().mockResolvedValue(undefined);

			const newIntegration = {
				name: "new-repo",
				type: "github" as const,
				status: "active" as const,
				metadata: {
					repo: "owner/new-repo",
					branch: "main",
					features: [],
					installationId: 123,
					githubAppId: 456,
				},
			};

			const result = await githubBehavior.preCreate?.(newIntegration, { manager: mockManager });

			expect(result).toBe(true);
			expect(mockManager.listIntegrations).toHaveBeenCalled();
			expect(mockManager.deleteIntegration).not.toHaveBeenCalled();
		});
	});
});
