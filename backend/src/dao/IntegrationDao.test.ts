import type { Integration, NewIntegration } from "../model/Integration";
import { mockIntegration } from "../model/Integration.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createIntegrationDao, createIntegrationDaoProvider, type IntegrationDao } from "./IntegrationDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("IntegrationDao", () => {
	let mockIntegrations: ModelDef<Integration>;
	let integrationDao: IntegrationDao;

	beforeEach(() => {
		mockIntegrations = {
			create: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Integration>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockIntegrations),
		} as unknown as Sequelize;

		integrationDao = createIntegrationDao(mockSequelize);
	});

	describe("createIntegration", () => {
		it("should create an integration", async () => {
			const newIntegration: NewIntegration = {
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push", "pr"],
				},
			};

			const createdIntegration = mockIntegration({
				...newIntegration,
				id: 1,
			});

			const mockIntegrationInstance = {
				get: vi.fn().mockReturnValue(createdIntegration),
			};

			vi.mocked(mockIntegrations.create).mockResolvedValue(mockIntegrationInstance as never);

			const result = await integrationDao.createIntegration(newIntegration);

			expect(mockIntegrations.create).toHaveBeenCalledWith(newIntegration);
			expect(mockIntegrationInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(createdIntegration);
		});

		it("should create integration without metadata", async () => {
			const newIntegration: NewIntegration = {
				type: "github",
				name: "simple-repo",
				status: "active",
				metadata: undefined,
			};

			const createdIntegration = mockIntegration({
				...newIntegration,
				id: 2,
			});

			const mockIntegrationInstance = {
				get: vi.fn().mockReturnValue(createdIntegration),
			};

			vi.mocked(mockIntegrations.create).mockResolvedValue(mockIntegrationInstance as never);

			const result = await integrationDao.createIntegration(newIntegration);

			expect(mockIntegrationInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(createdIntegration);
		});

		it("should return existing integration instead of creating duplicate", async () => {
			const newIntegration: NewIntegration = {
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 123,
				},
			};

			const existingIntegration = mockIntegration({
				id: 1,
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 123,
				},
			});

			const mockExistingInstance = {
				get: vi.fn().mockReturnValue(existingIntegration),
			};

			// Mock findAll to return the existing integration
			vi.mocked(mockIntegrations.findAll).mockResolvedValue([mockExistingInstance] as never);

			const result = await integrationDao.createIntegration(newIntegration);

			expect(mockIntegrations.findAll).toHaveBeenCalled();
			expect(mockIntegrations.create).not.toHaveBeenCalled();
			expect(result).toEqual(existingIntegration);
		});
	});

	describe("getIntegration", () => {
		it("should return integration when found", async () => {
			const integration = mockIntegration({
				id: 1,
				name: "test-repo",
				type: "github",
			});

			const mockIntegrationInstance = {
				get: vi.fn().mockReturnValue(integration),
			};

			vi.mocked(mockIntegrations.findByPk).mockResolvedValue(mockIntegrationInstance as never);

			const result = await integrationDao.getIntegration(1);

			expect(mockIntegrations.findByPk).toHaveBeenCalledWith(1);
			expect(mockIntegrationInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(integration);
		});

		it("should return undefined when integration not found", async () => {
			vi.mocked(mockIntegrations.findByPk).mockResolvedValue(null);

			const result = await integrationDao.getIntegration(999);

			expect(mockIntegrations.findByPk).toHaveBeenCalledWith(999);
			expect(result).toBeUndefined();
		});
	});

	describe("listIntegrations", () => {
		it("should return all integrations ordered by createdAt DESC", async () => {
			const integration1 = mockIntegration({ id: 1, name: "repo1" });
			const integration2 = mockIntegration({ id: 2, name: "repo2" });

			const mockIntegrationInstances = [
				{ get: vi.fn().mockReturnValue(integration1) },
				{ get: vi.fn().mockReturnValue(integration2) },
			];

			vi.mocked(mockIntegrations.findAll).mockResolvedValue(mockIntegrationInstances as never);

			const result = await integrationDao.listIntegrations();

			expect(mockIntegrations.findAll).toHaveBeenCalledWith({
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual([integration1, integration2]);
		});

		it("should return empty array when no integrations exist", async () => {
			vi.mocked(mockIntegrations.findAll).mockResolvedValue([]);

			const result = await integrationDao.listIntegrations();

			expect(result).toEqual([]);
		});
	});

	describe("updateIntegration", () => {
		it("should update integration when it exists", async () => {
			const updateIntegration = mockIntegration({
				id: 1,
				name: "updated-repo",
			});

			const existingInstance = {
				get: vi.fn().mockReturnValue(updateIntegration),
			};

			const updatedInstance = {
				get: vi.fn().mockReturnValue(updateIntegration),
			};

			vi.mocked(mockIntegrations.findByPk)
				.mockResolvedValueOnce(existingInstance as never)
				.mockResolvedValueOnce(updatedInstance as never);
			vi.mocked(mockIntegrations.update).mockResolvedValue([1] as never);

			const result = await integrationDao.updateIntegration(1, updateIntegration);

			expect(mockIntegrations.findByPk).toHaveBeenCalledWith(1);
			expect(mockIntegrations.update).toHaveBeenCalledWith(updateIntegration, {
				where: { id: 1 },
			});
			expect(result).toEqual(updateIntegration);
		});

		it("should return undefined when integration does not exist", async () => {
			const updateIntegration = mockIntegration({
				id: 999,
			});

			vi.mocked(mockIntegrations.findByPk).mockResolvedValue(null);

			const result = await integrationDao.updateIntegration(999, updateIntegration);

			expect(mockIntegrations.update).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});

		it("should update integration in transaction when preUpdate returns true", async () => {
			const existingIntegration = mockIntegration({
				id: 1,
				name: "old-repo",
				status: "active",
			});

			const updatedIntegration = mockIntegration({
				id: 1,
				name: "updated-repo",
				status: "active",
			});

			const existingInstance = {
				get: vi.fn().mockReturnValue(existingIntegration),
			};

			const updatedInstance = {
				get: vi.fn().mockReturnValue(updatedIntegration),
			};

			const mockTransaction = {
				commit: vi.fn(),
				rollback: vi.fn(),
			};

			const mockSequelize = {
				define: vi.fn().mockReturnValue(mockIntegrations),
				transaction: vi.fn(async (callback: (t: unknown) => Promise<void>) => {
					await callback(mockTransaction);
				}),
			} as unknown as Sequelize;

			integrationDao = createIntegrationDao(mockSequelize);

			vi.mocked(mockIntegrations.findByPk)
				.mockResolvedValueOnce(existingInstance as never)
				.mockResolvedValueOnce(updatedInstance as never);
			vi.mocked(mockIntegrations.update).mockResolvedValue([1] as never);

			const preUpdate = vi.fn().mockResolvedValue(true);
			const result = await integrationDao.updateIntegration(1, { name: "updated-repo" }, preUpdate);

			expect(mockIntegrations.findByPk).toHaveBeenCalledWith(1);
			expect(preUpdate).toHaveBeenCalledWith(existingIntegration);
			expect(mockIntegrations.update).toHaveBeenCalledWith(
				{ name: "updated-repo" },
				{
					where: { id: 1 },
					transaction: mockTransaction,
				},
			);
			expect(result).toEqual(updatedIntegration);
		});

		it("should not update integration in transaction when preUpdate returns false", async () => {
			const existingIntegration = mockIntegration({
				id: 1,
				name: "old-repo",
				status: "active",
			});

			const existingInstance = {
				get: vi.fn().mockReturnValue(existingIntegration),
			};

			const mockTransaction = {
				commit: vi.fn(),
				rollback: vi.fn(),
			};

			const mockSequelize = {
				define: vi.fn().mockReturnValue(mockIntegrations),
				transaction: vi.fn(async (callback: (t: unknown) => Promise<void>) => {
					await callback(mockTransaction);
				}),
			} as unknown as Sequelize;

			integrationDao = createIntegrationDao(mockSequelize);

			vi.mocked(mockIntegrations.findByPk)
				.mockResolvedValueOnce(existingInstance as never)
				.mockResolvedValueOnce(existingInstance as never);

			const preUpdate = vi.fn().mockResolvedValue(false);
			const result = await integrationDao.updateIntegration(1, { name: "updated-repo" }, preUpdate);

			expect(mockIntegrations.findByPk).toHaveBeenCalledWith(1);
			expect(preUpdate).toHaveBeenCalledWith(existingIntegration);
			expect(mockIntegrations.update).not.toHaveBeenCalled();
			expect(result).toEqual(existingIntegration);
		});
	});

	describe("deleteIntegration", () => {
		it("should delete integration by id", async () => {
			vi.mocked(mockIntegrations.destroy).mockResolvedValue(1 as never);

			await integrationDao.deleteIntegration(1);

			expect(mockIntegrations.destroy).toHaveBeenCalledWith({
				where: { id: 1 },
			});
		});

		it("should not throw when deleting non-existent integration", async () => {
			vi.mocked(mockIntegrations.destroy).mockResolvedValue(0 as never);

			await expect(integrationDao.deleteIntegration(999)).resolves.not.toThrow();

			expect(mockIntegrations.destroy).toHaveBeenCalledWith({
				where: { id: 999 },
			});
		});
	});

	describe("removeAllGitHubIntegrations", () => {
		it("should remove all GitHub integrations", async () => {
			vi.mocked(mockIntegrations.destroy).mockResolvedValue(5 as never);

			await integrationDao.removeAllGitHubIntegrations();

			expect(mockIntegrations.destroy).toHaveBeenCalledWith({
				where: { type: "github" },
			});
		});
	});

	describe("removeDuplicateGitHubIntegrations", () => {
		it("should remove duplicate GitHub integrations and keep the oldest", async () => {
			const integration1 = mockIntegration({
				id: 1,
				type: "github",
				name: "owner/repo",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push"],
					githubAppId: 123,
				},
				createdAt: new Date("2024-01-01"),
			});

			const integration2 = mockIntegration({
				id: 2,
				type: "github",
				name: "owner/repo",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: ["push"],
					githubAppId: 123,
				},
				createdAt: new Date("2024-01-02"),
			});

			const integration3 = mockIntegration({
				id: 3,
				type: "github",
				name: "owner/other-repo",
				metadata: {
					repo: "owner/other-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 123,
				},
				createdAt: new Date("2024-01-03"),
			});

			const mockInstances = [
				{ get: vi.fn().mockReturnValue(integration1) },
				{ get: vi.fn().mockReturnValue(integration2) },
				{ get: vi.fn().mockReturnValue(integration3) },
			];

			vi.mocked(mockIntegrations.findAll).mockResolvedValue(mockInstances as never);
			vi.mocked(mockIntegrations.destroy).mockResolvedValue(1 as never);

			const result = await integrationDao.removeDuplicateGitHubIntegrations();

			expect(mockIntegrations.findAll).toHaveBeenCalledWith({
				order: [["createdAt", "ASC"]],
			});
			expect(mockIntegrations.destroy).toHaveBeenCalledWith({
				where: { id: [2] },
			});
			expect(result).toBe(1);
		});

		it("should return 0 when no duplicates exist", async () => {
			const integration1 = mockIntegration({
				id: 1,
				type: "github",
				name: "owner/repo1",
				metadata: {
					repo: "owner/repo1",
					branch: "main",
					features: ["push"],
					githubAppId: 123,
				},
			});

			const integration2 = mockIntegration({
				id: 2,
				type: "github",
				name: "owner/repo2",
				metadata: {
					repo: "owner/repo2",
					branch: "main",
					features: ["push"],
					githubAppId: 123,
				},
			});

			const mockInstances = [
				{ get: vi.fn().mockReturnValue(integration1) },
				{ get: vi.fn().mockReturnValue(integration2) },
			];

			vi.mocked(mockIntegrations.findAll).mockResolvedValue(mockInstances as never);

			const result = await integrationDao.removeDuplicateGitHubIntegrations();

			expect(mockIntegrations.destroy).not.toHaveBeenCalled();
			expect(result).toBe(0);
		});

		it("should skip non-GitHub integrations", async () => {
			const integration1 = mockIntegration({
				id: 1,
				type: "unknown",
				name: "some-integration",
				metadata: undefined,
			});

			const mockInstances = [{ get: vi.fn().mockReturnValue(integration1) }];

			vi.mocked(mockIntegrations.findAll).mockResolvedValue(mockInstances as never);

			const result = await integrationDao.removeDuplicateGitHubIntegrations();

			expect(mockIntegrations.destroy).not.toHaveBeenCalled();
			expect(result).toBe(0);
		});
	});

	describe("getGitHubRepoIntegration", () => {
		it("should convert GitHub integration to GithubRepoIntegration", () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
				name: "test-repo",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push", "pr"],
					githubAppId: 123,
					installationId: 456,
				},
			});

			const result = integrationDao.getGitHubRepoIntegration(integration);

			expect(result).toBeDefined();
			expect(result?.id).toBe(1);
			expect(result?.type).toBe("github");
			expect(result?.metadata.repo).toBe("owner/test-repo");
			expect(result?.metadata.githubAppId).toBe(123);
		});

		it("should return undefined when integration is not GitHub type", () => {
			const integration = mockIntegration({
				id: 1,
				type: "unknown",
				name: "other-integration",
				metadata: undefined,
			});

			const result = integrationDao.getGitHubRepoIntegration(integration);

			expect(result).toBeUndefined();
		});

		it("should return undefined when integration is undefined", () => {
			const result = integrationDao.getGitHubRepoIntegration(undefined as never);

			expect(result).toBeUndefined();
		});

		it("should convert integration even when githubAppId is missing", () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
				name: "test-repo",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
				},
			});

			const result = integrationDao.getGitHubRepoIntegration(integration);

			expect(result).toBeDefined();
		});

		it("should convert integration when githubAppId is not a number", () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
				name: "test-repo",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
					githubAppId: "not-a-number" as never,
				},
			});

			const result = integrationDao.getGitHubRepoIntegration(integration);

			expect(result).toBeDefined();
		});

		it("should convert integration when metadata is null", () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
				name: "test-repo",
				metadata: null as never,
			});

			const result = integrationDao.getGitHubRepoIntegration(integration);

			expect(result).toBeDefined();
		});
	});

	describe("lookupIntegration", () => {
		it("should lookup and convert GitHub integration to GithubRepoIntegration", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "github",
				name: "test-repo",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push", "pr"],
					githubAppId: 123,
					installationId: 456,
				},
			});

			const mockIntegrationInstance = {
				get: vi.fn().mockReturnValue(integration),
			};

			vi.mocked(mockIntegrations.findByPk).mockResolvedValue(mockIntegrationInstance as never);

			const result = await integrationDao.lookupIntegration(1);

			expect(mockIntegrations.findByPk).toHaveBeenCalledWith(1);
			expect(result).toBeDefined();
			expect(result?.id).toBe(1);
			expect(result?.type).toBe("github");
		});

		it("should return undefined when integration not found", async () => {
			vi.mocked(mockIntegrations.findByPk).mockResolvedValue(null);

			const result = await integrationDao.lookupIntegration(999);

			expect(mockIntegrations.findByPk).toHaveBeenCalledWith(999);
			expect(result).toBeUndefined();
		});

		it("should return undefined when integration is not GitHub type", async () => {
			const integration = mockIntegration({
				id: 1,
				type: "unknown",
				name: "other-integration",
				metadata: undefined,
			});

			const mockIntegrationInstance = {
				get: vi.fn().mockReturnValue(integration),
			};

			vi.mocked(mockIntegrations.findByPk).mockResolvedValue(mockIntegrationInstance as never);

			const result = await integrationDao.lookupIntegration(1);

			expect(mockIntegrations.findByPk).toHaveBeenCalledWith(1);
			expect(result).toBeUndefined();
		});
	});
});

describe("createIntegrationDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as IntegrationDao;
		const provider = createIntegrationDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context integrationDao when context has database", () => {
		const defaultDao = {} as IntegrationDao;
		const contextIntegrationDao = {} as IntegrationDao;
		const context = {
			database: {
				integrationDao: contextIntegrationDao,
			},
		} as TenantOrgContext;

		const provider = createIntegrationDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextIntegrationDao);
	});
});
