import type { GitHubApp } from "../model/GitHubApp";
import type { Integration } from "../model/Integration";
import { createIntegrationDao } from "./IntegrationDao";
import type { GithubRepoIntegrationMetadata } from "jolli-common";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules
vi.mock("../util/GithubAppUtil", () => ({
	createGitHubAppJWT: vi.fn(() => "mock-jwt-token"),
	getInstallations: vi.fn(),
	syncAllInstallationsForApp: vi.fn(),
}));

vi.mock("../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn(),
}));

vi.mock("../model/Integration", () => ({
	defineIntegrations: vi.fn(() => ({
		findAll: vi.fn(),
		findByPk: vi.fn(),
		findOne: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		destroy: vi.fn(),
	})),
}));

// Helper to create mock GitHubApp
function createMockGitHubApp(overrides?: Partial<GitHubApp>): GitHubApp {
	return {
		appId: 123,
		slug: "jolli",
		clientId: "test-client",
		clientSecret: "test-secret",
		webhookSecret: "test-webhook",
		privateKey: "test-key",
		name: "Jolli",
		htmlUrl: "https://github.com/apps/jolli",
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		...overrides,
	};
}

describe("IntegrationDao.postSync", () => {
	let mockSequelize: Sequelize;
	// biome-ignore lint/suspicious/noExplicitAny: Test mock
	let mockGitHubAppDao: any;
	// biome-ignore lint/suspicious/noExplicitAny: Test mock
	let mockGitHubInstallationDao: any;
	// biome-ignore lint/suspicious/noExplicitAny: Test mock
	let mockDb: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSequelize = {} as Sequelize;

		mockGitHubAppDao = {
			listApps: vi.fn(),
			getApp: vi.fn(),
			createApp: vi.fn(),
			getAppByAppId: vi.fn(),
			deleteApp: vi.fn(),
			deleteAllApps: vi.fn(),
		};

		mockGitHubInstallationDao = {
			lookupByName: vi.fn(),
			createInstallation: vi.fn(),
			updateInstallation: vi.fn(),
			deleteInstallation: vi.fn(),
			listInstallations: vi.fn(),
			lookupByInstallationId: vi.fn(),
		};

		mockDb = {
			githubAppDao: mockGitHubAppDao,
			githubInstallationDao: mockGitHubInstallationDao,
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
			integrationDao: null as any,
		};
	});

	it("should skip integrations that already have installation entries", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { defineIntegrations } = await import("../model/Integration");
		const { syncAllInstallationsForApp } = await import("../util/GithubAppUtil");

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(createMockGitHubApp());

		const mockIntegration: Integration = {
			id: 1,
			type: "github",
			name: "test-org/test-repo",
			status: "active",
			metadata: {
				repo: "test-org/test-repo",
				branch: "main",
				features: [],
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		vi.mocked(defineIntegrations).mockReturnValue({
			findAll: vi.fn().mockResolvedValue([
				{
					get: () => mockIntegration,
				},
			]),
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		} as any);

		// Mock listInstallations to return empty array (no installations in DB to sync)
		mockGitHubInstallationDao.listInstallations.mockResolvedValue([]);
		mockGitHubInstallationDao.lookupByName.mockResolvedValue({ name: "test-org" });

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		await integrationDao.postSync(mockSequelize, mockDb);

		// Wait a bit for async processing
		await new Promise(resolve => setTimeout(resolve, 100));

		// syncAllInstallationsForApp should be called but return empty array since no DB installations
		expect(syncAllInstallationsForApp).toHaveBeenCalledWith(expect.any(Object), mockGitHubInstallationDao);
	});

	it("should migrate integration when jolli app has access", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { getInstallations, syncAllInstallationsForApp } = await import("../util/GithubAppUtil");
		const { defineIntegrations } = await import("../model/Integration");

		const jolliApp = createMockGitHubApp();

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(jolliApp);

		const mockIntegration: Integration = {
			id: 1,
			type: "github",
			name: "test-org/test-repo",
			status: "active",
			metadata: {
				repo: "test-org/test-repo",
				branch: "main",
				features: [],
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		vi.mocked(defineIntegrations).mockReturnValue({
			findAll: vi.fn().mockResolvedValue([
				{
					get: () => mockIntegration,
				},
			]),
			findByPk: vi.fn(),
			update: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		} as any);

		// Mock database to have an existing installation for test-org
		mockGitHubInstallationDao.listInstallations.mockResolvedValue([
			{ name: "test-org", installationId: 12345, repos: [], containerType: "org" },
		]);
		mockGitHubInstallationDao.lookupByName.mockResolvedValue(undefined);

		vi.mocked(getInstallations).mockResolvedValue([
			{
				id: 12345,
				account: {
					login: "test-org",
					type: "Organization",
				},
			},
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		] as any);

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		await integrationDao.postSync(mockSequelize, mockDb);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100));

		expect(syncAllInstallationsForApp).toHaveBeenCalledWith(jolliApp, mockGitHubInstallationDao);
	});

	it("should mark integration as error when jolli app doesn't have access", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { getInstallations, syncAllInstallationsForApp } = await import("../util/GithubAppUtil");
		const { defineIntegrations } = await import("../model/Integration");

		const jolliApp = createMockGitHubApp();

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(jolliApp);

		const mockIntegration: Integration = {
			id: 1,
			type: "github",
			name: "test-org/test-repo",
			status: "active",
			metadata: {
				repo: "test-org/test-repo",
				branch: "main",
				features: [],
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const mockUpdate = vi.fn();

		vi.mocked(defineIntegrations).mockReturnValue({
			findAll: vi.fn().mockResolvedValue([
				{
					get: () => mockIntegration,
				},
			]),
			findByPk: vi.fn().mockResolvedValue({
				get: () => mockIntegration,
			}),
			update: mockUpdate,
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		} as any);

		// No installations in DB, so syncAllInstallationsForApp will return empty array
		mockGitHubInstallationDao.listInstallations.mockResolvedValue([]);
		mockGitHubInstallationDao.lookupByName.mockResolvedValue(undefined);

		// Mock syncAllInstallationsForApp to return empty array (no installations with access)
		vi.mocked(syncAllInstallationsForApp).mockResolvedValue([]);
		// Jolli app doesn't have installation for test-org
		vi.mocked(getInstallations).mockResolvedValue([]);

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		await integrationDao.postSync(mockSequelize, mockDb);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100));

		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "needs_repo_access",
				metadata: expect.objectContaining({
					accessError: "repoNotAccessibleByApp",
				}),
			}),
			expect.any(Object),
		);
	});

	it("should skip non-GitHub integrations", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { syncAllInstallationsForApp } = await import("../util/GithubAppUtil");
		const { defineIntegrations } = await import("../model/Integration");

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(createMockGitHubApp());

		const mockIntegration: Integration = {
			id: 1,
			type: "unknown",
			name: "test",
			status: "active",
			metadata: undefined,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		vi.mocked(defineIntegrations).mockReturnValue({
			findAll: vi.fn().mockResolvedValue([
				{
					get: () => mockIntegration,
				},
			]),
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		} as any);

		// Mock listInstallations to return empty array
		mockGitHubInstallationDao.listInstallations.mockResolvedValue([]);

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		await integrationDao.postSync(mockSequelize, mockDb);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100));

		// syncAllInstallationsForApp is still called, but the non-GitHub integration is skipped in the loop
		expect(syncAllInstallationsForApp).toHaveBeenCalledWith(expect.any(Object), mockGitHubInstallationDao);
	});

	it("should handle errors gracefully during migration", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { defineIntegrations } = await import("../model/Integration");

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(createMockGitHubApp());

		// biome-ignore lint/suspicious/noExplicitAny: Test mock
		vi.mocked(defineIntegrations).mockReturnValue({} as any);

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		// Should not throw - errors are caught and logged
		await expect(integrationDao.postSync(mockSequelize, mockDb)).resolves.toBeUndefined();

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	it("should handle when getInstallations returns undefined", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { getInstallations, syncAllInstallationsForApp } = await import("../util/GithubAppUtil");
		const { defineIntegrations } = await import("../model/Integration");

		const mockApp = createMockGitHubApp({
			appId: 12345,
			slug: "test-app",
			clientId: "client123",
			clientSecret: "secret123",
			webhookSecret: "webhook123",
			privateKey: "key123",
			name: "Test App",
			htmlUrl: "https://github.com/apps/test-app",
		});

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(mockApp);
		vi.mocked(getInstallations).mockResolvedValue(undefined);

		const mockUpdate = vi.fn();
		const mockIntegration: Integration = {
			id: 1,
			type: "github",
			name: "test-owner/test-repo",
			status: "active",
			metadata: {
				repo: "test-owner/test-repo",
				branch: "main",
				features: [],
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		vi.mocked(defineIntegrations).mockReturnValue({
			findAll: vi.fn().mockResolvedValue([
				{
					get: () => mockIntegration,
				},
			]),
			findByPk: vi.fn().mockResolvedValue({
				get: () => mockIntegration,
			}),
			update: mockUpdate,
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		} as any);

		// No installations in DB
		mockGitHubInstallationDao.listInstallations.mockResolvedValue([]);
		mockGitHubInstallationDao.lookupByName.mockResolvedValue(undefined);

		// Mock syncAllInstallationsForApp to return empty array (no installations with access)
		vi.mocked(syncAllInstallationsForApp).mockResolvedValue([]);

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		await integrationDao.postSync(mockSequelize, mockDb);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100));

		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "needs_repo_access",
				metadata: expect.objectContaining({
					accessError: "repoNotAccessibleByApp",
				}),
			}),
			expect.any(Object),
		);
	});

	it("should handle when getInstallations throws error", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { getInstallations, syncAllInstallationsForApp } = await import("../util/GithubAppUtil");
		const { defineIntegrations } = await import("../model/Integration");

		const mockApp = createMockGitHubApp({
			appId: 12345,
			slug: "test-app",
			clientId: "client123",
			clientSecret: "secret123",
			webhookSecret: "webhook123",
			privateKey: "key123",
			name: "Test App",
			htmlUrl: "https://github.com/apps/test-app",
		});

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(mockApp);
		vi.mocked(getInstallations).mockRejectedValue(new Error("GitHub API error"));

		const mockUpdate = vi.fn();
		const mockIntegration: Integration = {
			id: 1,
			type: "github",
			name: "test-owner/test-repo",
			status: "active",
			metadata: {
				repo: "test-owner/test-repo",
				branch: "main",
				features: [],
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		vi.mocked(defineIntegrations).mockReturnValue({
			findAll: vi.fn().mockResolvedValue([
				{
					get: () => mockIntegration,
				},
			]),
			findByPk: vi.fn().mockResolvedValue({
				get: () => mockIntegration,
			}),
			update: mockUpdate,
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		} as any);

		// No installations in DB
		mockGitHubInstallationDao.listInstallations.mockResolvedValue([]);
		mockGitHubInstallationDao.lookupByName.mockResolvedValue(undefined);

		// Mock syncAllInstallationsForApp to return empty array (no installations with access)
		vi.mocked(syncAllInstallationsForApp).mockResolvedValue([]);

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		await integrationDao.postSync(mockSequelize, mockDb);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100));

		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "needs_repo_access",
				metadata: expect.objectContaining({
					accessError: "repoNotAccessibleByApp",
				}),
			}),
			expect.any(Object),
		);
	});

	it("should skip integration when metadata has no repo", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { syncAllInstallationsForApp } = await import("../util/GithubAppUtil");
		const { defineIntegrations } = await import("../model/Integration");

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(createMockGitHubApp());

		const mockIntegration: Integration = {
			id: 1,
			type: "github",
			name: "test-integration",
			status: "active",
			metadata: {
				// No repo field - intentionally testing error path
				branch: "main",
				features: [],
			} as unknown as GithubRepoIntegrationMetadata,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		vi.mocked(defineIntegrations).mockReturnValue({
			findAll: vi.fn().mockResolvedValue([
				{
					get: () => mockIntegration,
				},
			]),
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		} as any);

		// Mock listInstallations to return empty array
		mockGitHubInstallationDao.listInstallations.mockResolvedValue([]);

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		await integrationDao.postSync(mockSequelize, mockDb);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100));

		// syncAllInstallationsForApp is still called, but the integration is skipped in the loop
		expect(syncAllInstallationsForApp).toHaveBeenCalledWith(expect.any(Object), mockGitHubInstallationDao);
	});

	it("should skip integration when owner is empty after split", async () => {
		const { getCoreJolliGithubApp } = await import("../model/GitHubApp");
		const { syncAllInstallationsForApp } = await import("../util/GithubAppUtil");
		const { defineIntegrations } = await import("../model/Integration");

		vi.mocked(getCoreJolliGithubApp).mockReturnValue(createMockGitHubApp());

		const mockIntegration: Integration = {
			id: 1,
			type: "github",
			name: "test-integration",
			status: "active",
			metadata: {
				repo: "/repo-name", // Empty owner - intentionally testing error path
				branch: "main",
				features: [],
			} as unknown as GithubRepoIntegrationMetadata,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		vi.mocked(defineIntegrations).mockReturnValue({
			findAll: vi.fn().mockResolvedValue([
				{
					get: () => mockIntegration,
				},
			]),
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
		} as any);

		// Mock listInstallations to return empty array
		mockGitHubInstallationDao.listInstallations.mockResolvedValue([]);

		const integrationDao = createIntegrationDao(mockSequelize);
		mockDb.integrationDao = integrationDao;

		await integrationDao.postSync(mockSequelize, mockDb);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100));

		// syncAllInstallationsForApp is still called, but the integration is skipped in the loop
		expect(syncAllInstallationsForApp).toHaveBeenCalledWith(expect.any(Object), mockGitHubInstallationDao);
	});
});
